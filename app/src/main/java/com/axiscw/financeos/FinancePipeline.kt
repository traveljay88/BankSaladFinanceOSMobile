package com.axiscw.financeos

import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.security.MessageDigest
import java.time.LocalDateTime
import java.time.ZoneId
import kotlin.math.abs
import kotlin.math.max

class FinancePipeline(
    private val cfg: AppConfig,
    private val xlsx: File,
    private val sourceFile: String
) {
    private val runId = "BS-${LocalDateTime.now(ZoneId.of("Asia/Seoul")).toString().replace("-", "").replace(":", "").replace("T", "-").take(15)}"

    fun analyze(existingKeys: Set<String>): AnalysisResult {
        XlsxReader(xlsx).use { reader ->
            val txns = parseTransactions(reader)
            val periodStart = txns.minOf { it.date }
            val periodEnd = txns.maxOf { it.date }
            val (ledger, skipped) = ledgerRows(txns, existingKeys)
            val (snapshot, metrics) = parseSnapshot(reader, periodEnd)
            return AnalysisResult(
                sourceFile = sourceFile,
                periodStart = periodStart,
                periodEnd = periodEnd,
                transactionRowsRead = txns.size,
                ledgerRows = ledger.toMutableList(),
                localSkipped = skipped,
                snapshotRows = snapshot,
                metrics = metrics,
                allSourceKeys = txns.map { it.sourceKey }.toSet()
            )
        }
    }

    private fun parseTransactions(reader: XlsxReader): List<Txn> {
        val rows = reader.rows("가계부 내역")
        val expected = listOf("날짜","시간","타입","대분류","소분류","내용","금액","화폐","결제수단","메모")
        if (rows.isEmpty() || (0 until 10).map { norm(rows[0].getOrNull(it)) } != expected) {
            error("BankSalad '가계부 내역' 구조가 예상과 다릅니다.")
        }
        val txns = mutableListOf<Txn>()
        for (rIndex in 1 until rows.size) {
            val row = rows[rIndex]
            if (row.getOrNull(0) == null || norm(row.getOrNull(0)).isEmpty()) continue
            val date = excelDate(row.getOrNull(0))
            val time = excelTime(row.getOrNull(1))
            val rawType = norm(row.getOrNull(2))
            val rawMajor = norm(row.getOrNull(3))
            val rawMinor = norm(row.getOrNull(4))
            val content = norm(row.getOrNull(5))
            val amount = money(row.getOrNull(6))
            val currency = norm(row.getOrNull(7))
            val payment = norm(row.getOrNull(8))
            val memo = norm(row.getOrNull(9))
            val sourceKey = sourceKey(listOf(date, time, rawType, rawMajor, rawMinor, content, amount, currency, payment, memo))
            txns.add(Txn(
                idx = rIndex + 1,
                date = date, time = time, rawType = rawType, rawMajor = rawMajor, rawMinor = rawMinor,
                content = content, signedAmount = amount, currency = currency, payment = payment, memo = memo,
                sourceKey = sourceKey, account = cfg.account(payment)
            ))
        }
        pairInternalTransfers(txns)
        return txns
    }

    private fun sourceKey(values: List<Any?>): String {
        val raw = values.joinToString("|") { norm(it) }
        val hash = MessageDigest.getInstance("SHA-256").digest(raw.toByteArray(Charsets.UTF_8))
        return hash.joinToString("") { "%02x".format(it) }.take(20)
    }

    private fun seconds(t: String): Int {
        val p = t.split(":").map { it.toInt() }
        return p[0] * 3600 + p[1] * 60 + p[2]
    }

    private fun pairInternalTransfers(txns: List<Txn>) {
        val transfers = txns.filter { it.rawType == "이체" }
        val used = mutableSetOf<Int>()
        for (i in transfers.indices) {
            val a = transfers[i]
            if (a.idx in used || a.signedAmount == 0L) continue
            var best: Txn? = null
            for (j in i + 1 until transfers.size) {
                val b = transfers[j]
                if (b.idx in used || b.date != a.date || a.signedAmount != -b.signedAmount) continue
                if (abs(seconds(a.time) - seconds(b.time)) <= 2) { best = b; break }
            }
            if (best == null) continue
            a.pairIdx = best.idx; best.pairIdx = a.idx
            a.pairAccountId = best.account.id; best.pairAccountId = a.account.id
            a.pairAccountKind = best.account.kind; best.pairAccountKind = a.account.kind
            a.pairPayment = best.payment; best.pairPayment = a.payment
            val rep = if (a.signedAmount < 0) a else best
            val mirror = if (a.signedAmount < 0) best else a
            rep.isMirror = false; mirror.isMirror = true
            used.add(a.idx); used.add(best.idx)
        }
    }

    private fun baseClassification(): LinkedHashMap<String, Any?> = linkedMapOf(
        "type" to "소비지출", "major" to "기타 생활비", "minor" to "사용처 검증 필요", "status" to "검토 필요",
        "cash_in" to null, "cash_out" to null, "income" to null, "spend" to null, "interest" to null,
        "card_payment" to null, "asset_move" to null, "invest_in" to null, "invest_out" to null,
        "debt_principal" to null, "nonpnl_adj" to null, "net_income_effect" to null, "include" to "Y", "note" to ""
    )

    private fun ruleMatches(t: Txn, rule: JSONObject): Boolean {
        val m = rule.optJSONObject("match") ?: return false
        val eq = mapOf(
            "raw_type" to t.rawType, "raw_major" to t.rawMajor, "raw_minor" to t.rawMinor,
            "content" to t.content, "payment" to t.payment, "memo" to t.memo
        )
        eq.forEach { (key, actual) ->
            if (m.has("${key}_equals") && norm(actual) != norm(m.opt("${key}_equals"))) return false
            if (m.has("${key}_contains") && !norm(actual).contains(norm(m.opt("${key}_contains")))) return false
        }
        if (m.has("content_regex") && !Regex(m.getString("content_regex")).containsMatchIn(t.content)) return false
        if (m.has("payment_regex") && !Regex(m.getString("payment_regex")).containsMatchIn(t.payment)) return false
        val text = "${t.content} ${t.memo}".trim()
        val any = m.optJSONArray("text_contains_any")
        if (any != null && any.length() > 0) {
            var hit = false
            for (i in 0 until any.length()) if (text.contains(norm(any.get(i)))) { hit = true; break }
            if (!hit) return false
        }
        val all = m.optJSONArray("text_contains_all")
        if (all != null) for (i in 0 until all.length()) if (!text.contains(norm(all.get(i)))) return false
        when (m.optString("direction")) {
            "inflow" -> if (t.signedAmount <= 0) return false
            "outflow" -> if (t.signedAmount >= 0) return false
        }
        val amount = abs(t.signedAmount)
        if (m.has("amount_equals") && amount != m.getLong("amount_equals")) return false
        if (m.has("amount_min") && amount < m.getLong("amount_min")) return false
        if (m.has("amount_max") && amount > m.getLong("amount_max")) return false
        if (m.has("paired") && (t.pairIdx != null) != m.getBoolean("paired")) return false
        return true
    }

    private fun applyRuleAction(out: LinkedHashMap<String, Any?>, t: Txn, action: JSONObject, ruleId: String): LinkedHashMap<String, Any?> {
        val amount = abs(t.signedAmount)
        listOf("cash_in","cash_out","income","spend","interest","card_payment","asset_move","invest_in","invest_out","debt_principal","nonpnl_adj","net_income_effect")
            .forEach { out[it] = null }
        listOf("type","major","minor","status","include").forEach { if (action.has(it) && !action.isNull(it)) out[it] = action.get(it) }
        if (action.optString("name").isNotBlank()) out["name"] = action.getString("name")
        when (action.optString("semantics")) {
            "consumer_expense" -> {
                out["type"] = action.optString("type", "소비지출"); out["spend"] = amount; out["net_income_effect"] = -amount
                if (t.account.kind in setOf("cash","wallet")) out["cash_out"] = amount
            }
            "financial_interest" -> {
                out["type"] = action.optString("type", "금융비용"); out["interest"] = amount; out["net_income_effect"] = -amount
                if (t.account.kind in setOf("cash","wallet")) out["cash_out"] = amount
            }
            "income" -> {
                out["type"] = action.optString("type", "소득"); out["income"] = amount; out["net_income_effect"] = amount
                if (t.account.kind in setOf("cash","wallet")) out["cash_in"] = amount
            }
            "other_inflow" -> {
                out["type"] = action.optString("type", "기타유입·유출")
                if (action.optBoolean("recognize_income", false)) out["income"] = amount
                out["net_income_effect"] = amount
                if (t.account.kind in setOf("cash","wallet")) out["cash_in"] = amount
            }
            "asset_move" -> {
                out["type"] = action.optString("type", "자산이동")
                if (action.optBoolean("record_asset_move", true)) out["asset_move"] = amount
            }
            "exclude" -> out["include"] = "N"
        }
        out["note"] = "학습규칙:$ruleId"
        return out
    }

    private fun exactOrLearned(out: LinkedHashMap<String, Any?>, t: Txn): LinkedHashMap<String, Any?>? {
        val exact = cfg.sourceKeyOverrides.optJSONObject(t.sourceKey)
        if (exact != null) {
            val action = exact.optJSONObject("action") ?: exact
            return applyRuleAction(out, t, action, "history:${t.sourceKey.take(8)}")
        }
        cfg.learnedRules.forEach { rule ->
            if (ruleMatches(t, rule)) return applyRuleAction(out, t, rule.optJSONObject("action") ?: JSONObject(), rule.optString("id", "learned"))
        }
        return null
    }

    private fun pairedTransferShape(t: Txn): Pair<String, Boolean> {
        val outKind: String?; val inKind: String?; val outId: String?; val inId: String?
        if (t.signedAmount < 0) {
            outKind = t.account.kind; inKind = t.pairAccountKind; outId = t.account.id; inId = t.pairAccountId
        } else {
            outKind = t.pairAccountKind; inKind = t.account.kind; outId = t.pairAccountId; inId = t.account.id
        }
        if (outKind == "cash" && inKind == "wallet") return "선불충전" to true
        if (outKind == "wallet" && inKind == "cash") return "계좌 간 이체" to true
        if ((outId != null && outId in cfg.operatingOverdraftIds) || (inId != null && inId in cfg.operatingOverdraftIds)) return "운영계좌간이체" to false
        return "계좌 간 이체" to true
    }

    private fun merchantOverride(content: String): Triple<String, String, String>? {
        cfg.merchantRules.forEach { r ->
            if (r.equals != null && content == r.equals) return Triple(r.major, r.minor, r.status)
            if (r.contains != null && content.contains(r.contains)) return Triple(r.major, r.minor, r.status)
        }
        return null
    }

    private fun classify(t: Txn): LinkedHashMap<String, Any?> {
        val amount = abs(t.signedAmount)
        val out = baseClassification()
        exactOrLearned(out, t)?.let { return it }

        if (t.isMirror) {
            val minor = pairedTransferShape(t).first
            out["type"] = "자산이동"; out["major"] = "자산이동"; out["minor"] = minor; out["status"] = "확정"; out["include"] = "N"
            return out
        }
        if (t.pairIdx != null && t.rawType == "이체") {
            val (minor, recordMove) = pairedTransferShape(t)
            out["type"] = "자산이동"; out["major"] = "자산이동"; out["minor"] = minor; out["status"] = "확정"
            if (recordMove) out["asset_move"] = amount
            if (t.account.status == "검토 필요") out["status"] = "검토 필요"
            return out
        }
        if (t.rawType == "이체") {
            out["type"] = "자산이동"; out["major"] = "자산이동"; out["status"] = "검토 필요"
            out["minor"] = if (t.content.contains("카카오페이") || t.content.contains("네이버페이")) "선불충전" else "운영계좌간이체"
            return out
        }
        if (t.rawType == "수입") {
            out["type"] = "소득"; out["major"] = "소득"; out["include"] = "Y"
            out["minor"] = when {
                t.content.contains("성과급") || t.content.contains("상여") -> "상여·성과급"
                t.content.contains("이자") || t.rawMajor == "금융" -> "이자·배당"
                t.rawMajor == "급여" -> "급여"
                else -> "기타"
            }
            out["status"] = "확정"; out["income"] = amount; out["net_income_effect"] = amount
            if (t.account.kind in setOf("cash","wallet")) out["cash_in"] = amount
            return out
        }

        val ov = merchantOverride(t.content)
        if (ov != null) {
            out["major"] = ov.first; out["minor"] = ov.second; out["status"] = ov.third
        } else {
            cfg.rawCategoryMap["${t.rawMajor}|${t.rawMinor}"]?.let {
                out["major"] = it.first; out["minor"] = it.second; out["status"] = it.third
            }
        }
        if (out["major"] == "금융비용" && out["minor"] == "대출이자") {
            out["type"] = "금융비용"; out["interest"] = amount; out["net_income_effect"] = -amount
        } else {
            out["type"] = "소비지출"; out["spend"] = amount; out["net_income_effect"] = -amount
        }
        if (t.account.kind in setOf("cash","wallet")) out["cash_out"] = amount
        return out
    }

    private fun ledgerRows(txns: List<Txn>, existingKeys: Set<String>): Pair<List<LedgerRow>, Int> {
        val out = mutableListOf<LedgerRow>()
        var skipped = 0
        val byIdx = txns.associateBy { it.idx }
        txns.forEach { t ->
            if (t.sourceKey in existingKeys) { skipped++; return@forEach }
            val c = classify(t)
            var detail = "BankSalad 모바일 | $sourceFile | ${t.date} ${t.time} | ${t.rawType}>${t.rawMajor}>${t.rawMinor} | 결제수단:${t.payment} | 원금액:${t.signedAmount}"
            val note = c["note"]?.toString().orEmpty()
            if (note.isNotBlank()) detail += " | $note"
            val pairStatus = byIdx[t.pairIdx]?.account?.status ?: "확정"
            val merged = statusMerge(statusMerge(c["status"].toString(), t.account.status), if (t.isMirror) pairStatus else "확정")
            fun n(key: String): Any? = c[key] ?: "-"
            val row = linkedMapOf<String, Any?>(
                "거래ID" to "BSAUTO-${t.date.replace("-", "")}-${t.sourceKey.take(8).uppercase()}",
                "거래일" to t.date, "연월" to t.date.take(7), "재무거래유형" to c["type"], "거래명" to (c["name"] ?: t.content),
                "상세내역" to detail, "금액" to abs(t.signedAmount), "표준계정명" to t.account.name, "계정ID" to (t.account.id ?: ""),
                "대분류" to c["major"], "소분류" to c["minor"], "현금유입" to n("cash_in"), "현금유출" to n("cash_out"),
                "소득인식액" to n("income"), "소비지출액" to n("spend"), "대출이자액" to n("interest"), "카드대금결제액" to n("card_payment"),
                "자산간이동액" to n("asset_move"), "투자원금액" to n("invest_in"), "투자회수액" to n("invest_out"), "자기자금 부채원금상환" to n("debt_principal"),
                "비손익 순자산조정액" to n("nonpnl_adj"), "손익기준 순자산영향액" to n("net_income_effect"), "계산포함" to c["include"],
                "검토상태" to merged, "중복후보" to "N", "중복키" to t.sourceKey
            )
            out.add(LedgerRow(row, t.sourceKey, abs(t.signedAmount), t.account.kind))
        }
        return out to skipped
    }

    private fun statusMerge(a: String, b: String): String {
        val rank = mapOf("확정" to 0, "자동확정" to 0, "잠정" to 1, "검토 필요" to 2)
        return if ((rank[a] ?: 1) >= (rank[b] ?: 1)) a else b
    }

    private fun parseSnapshot(reader: XlsxReader, periodEnd: String): Pair<List<LinkedHashMap<String, Any?>>, SnapshotMetrics> {
        val rows = reader.rows("뱅샐현황")
        val assetRows = mutableListOf<Triple<String, String, Double>>()
        var financeStart: Int? = null
        for (i in rows.indices) {
            if (norm(rows[i].getOrNull(1)) == "자산" && norm(rows[i].getOrNull(5)) == "부채") { financeStart = i + 2; break }
        }
        if (financeStart == null) error("뱅샐현황 자산/부채 섹션을 찾지 못했습니다.")
        var currentSection = ""
        for (i in financeStart until rows.size) {
            val r = rows[i]
            val c1 = norm(r.getOrNull(1))
            if (c1 == "총자산" || c1 == "순자산") break
            if (c1.isNotBlank()) currentSection = c1
            val product = norm(r.getOrNull(2)); val bal = r.getOrNull(4)
            if (product.isNotBlank() && bal != null) assetRows.add(Triple(currentSection, product, (bal as? Number)?.toDouble() ?: norm(bal).toDouble()))
        }

        var loanHeader: Int? = null
        for (i in rows.indices) {
            val r = rows[i]
            if (norm(r.getOrNull(1)) == "대출종류" && norm(r.getOrNull(2)) == "금융사" && norm(r.getOrNull(3)) == "상품명") { loanHeader = i; break }
        }
        if (loanHeader == null) error("뱅샐현황 대출 섹션을 찾지 못했습니다.")
        data class Loan(val inst:String,val product:String,val principal:Long,val balance:Long,val rate:Double?)
        val loans = mutableListOf<Loan>()
        for (i in loanHeader + 1 until rows.size) {
            val r = rows[i]
            if (norm(r.getOrNull(1)) == "총계") break
            val inst = norm(r.getOrNull(2)); val product = norm(r.getOrNull(3))
            if (inst.isBlank() || product.isBlank()) continue
            val principal = money(r.getOrNull(5)); val balance = money(r.getOrNull(6))
            val rate = r.getOrNull(7)?.let { (it as? Number)?.toDouble() ?: norm(it).toDoubleOrNull() }
            loans.add(Loan(inst, product, principal, balance, rate))
        }

        var invEval = 0.0
        var invHeader: Int? = null
        for (i in rows.indices) {
            val r = rows[i]
            if (norm(r.getOrNull(1)) == "투자상품종류" && norm(r.getOrNull(2)) == "금융사" && norm(r.getOrNull(3)) == "상품명") { invHeader = i; break }
        }
        if (invHeader != null) {
            for (i in invHeader + 1 until rows.size) {
                val r = rows[i]
                if (norm(r.getOrNull(1)) == "총계") break
                val product = norm(r.getOrNull(3)); val value = r.getOrNull(6)
                if (product.isNotBlank() && value != null) invEval += (value as? Number)?.toDouble() ?: norm(value).toDouble()
            }
        }

        val snapshot = mutableListOf<LinkedHashMap<String, Any?>>()
        var positiveAssets = 0.0; var financeCash = 0.0; var realEstate = 0.0; var otherAssets = 0.0; var car = 0.0
        var insuranceAssets = 0.0; var pensionAssets = 0.0; var unmapped = 0
        assetRows.forEach { (section, product, bal) ->
            val acc = cfg.account(product)
            val excludedNegativeOverdraft = bal < 0 && acc.id != null && acc.id in cfg.operatingOverdraftIds
            val effect = if (excludedNegativeOverdraft) 0.0 else bal
            if (bal > 0) positiveAssets += bal
            if (acc.id == null) unmapped++
            if (bal > 0 && (section in cfg.cashSections || product in cfg.cashExtraProducts)) financeCash += bal
            if (section == "부동산" && bal > 0) realEstate += bal
            if (section == "동산" && bal > 0) car += bal
            if (section == "기타 실물 자산" && bal > 0) otherAssets += bal
            if (section == "보험 자산" && bal > 0) insuranceAssets += bal
            if (section == "연금 자산" && bal > 0) pensionAssets += bal
            snapshot.add(linkedMapOf(
                "Run_ID" to runId, "기준일" to periodEnd, "연월" to periodEnd.take(7), "원본섹션" to "자산", "원본항목" to section,
                "원본상품명" to product, "표준계정명" to if (acc.id != null) acc.name else "", "계정ID" to (acc.id ?: ""), "자산부채" to "자산", "잔액" to bal,
                "대출원금/한도" to "", "대출잔액" to "", "잔여한도" to "", "금리" to "", "순자산영향액" to effect,
                "이중계상제외" to if (excludedNegativeOverdraft) "Y" else "N", "검토상태" to if (acc.id != null) acc.status else "검토 필요",
                "Source_File" to sourceFile, "비고" to if (excludedNegativeOverdraft) "마이너스통장 사용액은 부채로만 1회 인식" else ""
            ))
        }

        var totalLiab = 0L; var available = 0L; var highRate = 0L
        loans.forEach { l ->
            val acc = cfg.loanAccount(l.inst, l.product, l.principal)
            totalLiab += l.balance
            val remain: Long? = if (acc.id != null && acc.id in cfg.availableOverdraftIds) max(l.principal - l.balance, 0L) else null
            if (remain != null) available += remain
            if (l.rate != null && l.rate >= cfg.highRateThreshold) highRate += l.balance
            if (acc.id == null) unmapped++
            snapshot.add(linkedMapOf(
                "Run_ID" to runId, "기준일" to periodEnd, "연월" to periodEnd.take(7), "원본섹션" to "부채", "원본항목" to "",
                "원본상품명" to l.product, "표준계정명" to if (acc.id != null) acc.name else "", "계정ID" to (acc.id ?: ""), "자산부채" to "부채", "잔액" to l.balance,
                "대출원금/한도" to l.principal, "대출잔액" to l.balance, "잔여한도" to (remain ?: ""), "금리" to (l.rate ?: ""),
                "순자산영향액" to -l.balance, "이중계상제외" to "N", "검토상태" to acc.status, "Source_File" to sourceFile, "비고" to "${l.inst} | ${l.product}"
            ))
        }
        val financeNet = financeCash + invEval + realEstate + otherAssets + car - totalLiab
        val bsNet = positiveAssets - totalLiab
        val metrics = SnapshotMetrics(
            positiveAssets, financeCash, invEval, realEstate, otherAssets, car, insuranceAssets, pensionAssets,
            totalLiab, available, highRate, bsNet, financeNet, unmapped, snapshot.size
        )
        return snapshot to metrics
    }

    companion object {
        fun correctionAction(type: String, major: String, minor: String, accountKind: String, amount: Long): JSONObject {
            val semantics = when (type) {
                "금융비용" -> "financial_interest"
                "소득" -> "income"
                "기타유입·유출" -> "other_inflow"
                "자산이동" -> "asset_move"
                else -> "consumer_expense"
            }
            return JSONObject().apply {
                put("type", type); put("major", major); put("minor", minor); put("status", "확정"); put("semantics", semantics)
                if (semantics == "asset_move") put("record_asset_move", false)
                if (semantics == "other_inflow") put("recognize_income", false)
            }
        }

        fun applyManualCorrection(row: LedgerRow, type: String, major: String, minor: String) {
            val amount = row.amount
            row.values["재무거래유형"] = type
            row.values["대분류"] = major
            row.values["소분류"] = minor
            row.values["검토상태"] = "확정"
            listOf("현금유입","현금유출","소득인식액","소비지출액","대출이자액","카드대금결제액","자산간이동액","투자원금액","투자회수액","자기자금 부채원금상환","비손익 순자산조정액","손익기준 순자산영향액")
                .forEach { row.values[it] = "-" }
            when (type) {
                "금융비용" -> {
                    row.values["대출이자액"] = amount; row.values["손익기준 순자산영향액"] = -amount
                    if (row.accountKind in setOf("cash","wallet")) row.values["현금유출"] = amount
                }
                "소득" -> {
                    row.values["소득인식액"] = amount; row.values["손익기준 순자산영향액"] = amount
                    if (row.accountKind in setOf("cash","wallet")) row.values["현금유입"] = amount
                }
                "기타유입·유출" -> {
                    row.values["손익기준 순자산영향액"] = amount
                    if (row.accountKind in setOf("cash","wallet")) row.values["현금유입"] = amount
                }
                "자산이동" -> Unit
                else -> {
                    row.values["소비지출액"] = amount; row.values["손익기준 순자산영향액"] = -amount
                    if (row.accountKind in setOf("cash","wallet")) row.values["현금유출"] = amount
                }
            }
        }
    }
}
