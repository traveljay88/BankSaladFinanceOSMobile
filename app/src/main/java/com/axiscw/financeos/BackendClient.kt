package com.axiscw.financeos

import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.SocketTimeoutException
import java.net.URL

class BackendClient(private val endpoint: String, private val secret: String) {
    companion object {
        /** Apps Script may need time to batch-write the ledger and create reviews. */
        const val UPLOAD_READ_TIMEOUT_MS = 180_000
    }

    class UploadTimeoutException(
        val requestId: String,
        val sourceHash: String,
        cause: SocketTimeoutException
    ) : IllegalStateException("서버 응답 대기 시간이 초과되었습니다.", cause)

    /** Adapts the mobile client to the deployed Server Brain protocol. */
    fun engineImport(prepared: PreparedImport): JSONObject = try {
        val analysis = post(JSONObject().apply {
            put("action", "analyze"); put("secret", secret)
            put("sourceFile", prepared.sourceFile)
            // These are harmless to older Server Brain deployments and enable
            // idempotent handling as soon as the server supports them.
            put("sourceHash", prepared.sourceHash)
            put("requestId", prepared.requestId)
            put("rawTransactions", prepared.transactionsJson())
        }, UPLOAD_READ_TIMEOUT_MS)
        val analysisId = analysis.getString("analysisId")
        val commit = if (analysis.optBoolean("canCommit", false)) {
            post(JSONObject().put("action", "commit").put("secret", secret).put("analysisId", analysisId), UPLOAD_READ_TIMEOUT_MS)
        } else null
        val source = analysis.optJSONObject("summary") ?: JSONObject()
        JSONObject().apply {
            put("ok", true); put("analysisId", analysisId)
            put("status", if (commit == null) "REVIEW_REQUIRED" else "SUCCESS")
            put("engineVersion", analysis.optString("backendVersion", "-"))
            put("summary", JSONObject().apply {
                put("total", source.optInt("sourceTransactions"))
                put("inserted", commit?.optInt("ledgerInserted") ?: 0)
                put("duplicates", source.optInt("duplicate"))
                put("excluded", source.optInt("autoExcluded"))
                put("settlementMatched", source.optInt("settlementMatched"))
                put("reviewRequired", source.optInt("review"))
                put("failed", 0)
            })
        }
    } catch (e: SocketTimeoutException) {
        throw UploadTimeoutException(prepared.requestId, prepared.sourceHash, e)
    }

    fun import(result: AnalysisResult): JSONObject {
        require(endpoint.startsWith("https://")) { "Apps Script 배포 URL(https://)을 설정하세요." }
        val payload = JSONObject().apply {
            put("action", "import")
            put("secret", secret)
            put("sourceFile", result.sourceFile)
            put("periodStart", result.periodStart)
            put("periodEnd", result.periodEnd)
            put("transactionRowsRead", result.transactionRowsRead)
            put("localSkipped", result.localSkipped)
            put("reviewCount", result.reviewRows.size)
            put("provisionalCount", result.provisionalRows.size)
            put("policyVersion", result.policyVersion)
            put("policyMode", result.policyMode)
            put("investmentGate", result.investmentGate)
            put("policyAlerts", JSONArray(result.policyAlerts))
            put("ledgerRows", rowsToJson(result.ledgerRows.map { it.values }))
            put("snapshotRows", rowsToJson(result.snapshotRows))
            put("metrics", JSONObject().apply {
                put("positiveAssets", result.metrics.positiveAssets)
                put("financeCash", result.metrics.financeCash)
                put("investmentEval", result.metrics.investmentEval)
                put("realEstate", result.metrics.realEstate)
                put("otherAssets", result.metrics.otherAssets)
                put("car", result.metrics.car)
                put("insuranceAssets", result.metrics.insuranceAssets)
                put("pensionAssets", result.metrics.pensionAssets)
                put("totalLiabilities", result.metrics.totalLiabilities)
                put("availableOverdraft", result.metrics.availableOverdraft)
                put("highRateLiabilities", result.metrics.highRateLiabilities)
                put("bsCorrectedNetWorth", result.metrics.bsCorrectedNetWorth)
                put("financeOsNetWorth", result.metrics.financeOsNetWorth)
                put("unmappedSnapshotAccounts", result.metrics.unmappedSnapshotAccounts)
                put("snapshotRows", result.metrics.snapshotRows)
                put("recognizedSpend", result.recognizedSpend())
                put("recognizedInterest", result.recognizedInterest())
            })
        }
        val conn = (URL(endpoint).openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = 20000
            readTimeout = 30000
            doOutput = true
            setRequestProperty("Content-Type", "application/json; charset=utf-8")
        }
        conn.outputStream.use { it.write(payload.toString().toByteArray(Charsets.UTF_8)) }
        val code = conn.responseCode
        val stream = if (code in 200..299) conn.inputStream else conn.errorStream
        val text = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
        if (code !in 200..299) error("Finance OS 서버 오류 HTTP $code: $text")
        val obj = JSONObject(text)
        if (!obj.optBoolean("ok", false)) error(obj.optString("error", "Finance OS 반영 실패"))
        return obj
    }

    fun health(): JSONObject {
        val payload = JSONObject().put("action", "health").put("secret", secret)
        val conn = (URL(endpoint).openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"; connectTimeout = 12000; readTimeout = 12000; doOutput = true
            setRequestProperty("Content-Type", "application/json; charset=utf-8")
        }
        conn.outputStream.use { it.write(payload.toString().toByteArray()) }
        val text = conn.inputStream.bufferedReader().use { it.readText() }
        return JSONObject(text)
    }

    fun reviews(analysisId: String): JSONObject {
        val response = post(JSONObject().put("action", "getReviewQueue").put("secret", secret).put("analysisId", analysisId))
        val source = response.optJSONArray("reviewQueue") ?: JSONArray()
        return JSONObject().put("items", JSONArray().apply {
            for (i in 0 until source.length()) {
                val review = source.getJSONObject(i)
                val settlement = review.optString("reviewType") == "SETTLEMENT_LINK"
                val recommendation = review.optJSONObject("recommendation") ?: JSONObject()
                put(JSONObject().apply {
                    put("id", review.optString("reviewId"))
                    put("reviewType", if (settlement) "SETTLEMENT" else "CATEGORY")
                    put("transaction", JSONObject().apply {
                        put("date", review.optString("date")); put("merchant", review.optString("merchant"))
                        put("signedAmount", if (settlement) review.optLong("amount") else -review.optLong("amount"))
                    })
                    put("reason", review.optString("reason"))
                    put("suggestions", JSONArray().apply {
                        if (settlement) {
                            put(JSONObject().put("action", "confirm_match").put("label", "추천 정산 연결 확정"))
                            put(JSONObject().put("action", "keep_unmatched").put("label", "정산은 맞지만 연결 안 함"))
                        } else {
                            put(JSONObject().put("action", "confirm").put("label", "추천 분류 확정").put("category", JSONObject().apply {
                                put("type", recommendation.optString("type")); put("major", recommendation.optString("major")); put("minor", recommendation.optString("minor"))
                            }))
                        }
                    })
                })
            }
        })
    }

    fun resolveReview(reviewId: String, action: String, category: JSONObject? = null, learnRule: Boolean = false): JSONObject {
        val payload = JSONObject().put("action", "confirmReview").put("secret", secret)
            .put("reviewId", reviewId).put("reviewAction", action).put("learnPattern", learnRule)
        if (category != null) {
            payload.put("type", category.optString("type")); payload.put("major", category.optString("major")); payload.put("minor", category.optString("minor"))
        }
        val resolved = post(payload)
        if (resolved.optBoolean("canCommit", false)) {
            post(JSONObject().put("action", "commit").put("secret", secret).put("analysisId", resolved.getString("analysisId")))
        }
        return resolved
    }

    private fun post(payload: JSONObject, readTimeoutMs: Int = 30_000): JSONObject {
        require(endpoint.startsWith("https://")) { "Apps Script 배포 URL(https://)을 설정하세요." }
        val conn = (URL(endpoint).openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"; connectTimeout = 20_000; readTimeout = readTimeoutMs; doOutput = true
            setRequestProperty("Content-Type", "application/json; charset=utf-8")
        }
        conn.outputStream.use { it.write(payload.toString().toByteArray(Charsets.UTF_8)) }
        val code = conn.responseCode
        val text = (if (code in 200..299) conn.inputStream else conn.errorStream)?.bufferedReader()?.use { it.readText() }.orEmpty()
        if (code !in 200..299) error("Finance OS 서버 오류 HTTP $code: $text")
        val obj = JSONObject(text)
        if (!obj.optBoolean("ok", false)) error(obj.optString("error", "Finance OS 서버 요청 실패"))
        return obj
    }

    private fun rowsToJson(rows: List<Map<String, Any?>>): JSONArray {
        val arr = JSONArray()
        rows.forEach { row ->
            val o = JSONObject()
            row.forEach { (k, v) -> o.put(k, v ?: JSONObject.NULL) }
            arr.put(o)
        }
        return arr
    }
}
