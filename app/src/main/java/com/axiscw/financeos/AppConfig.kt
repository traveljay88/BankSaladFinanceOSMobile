package com.axiscw.financeos

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

data class MerchantRule(val equals: String?, val contains: String?, val major: String, val minor: String, val status: String)

data class LoanRule(
    val institution: String?, val product: String?, val productContains: String?, val principal: Long?, val name: String, val id: String
)

class AppConfig private constructor(
    val raw: JSONObject,
    val accountAliases: Map<String, Account>,
    val operatingOverdraftIds: Set<String>,
    val merchantRules: List<MerchantRule>,
    val rawCategoryMap: Map<String, Triple<String, String, String>>,
    val loanRules: List<LoanRule>,
    val sourceKeyOverrides: JSONObject,
    val learnedRules: List<JSONObject>,
    val cashSections: Set<String>,
    val cashExtraProducts: Set<String>,
    val investmentExcludeProducts: Set<String>,
    val availableOverdraftIds: Set<String>,
    val highRateThreshold: Double,
    val spreadsheetId: String,
    val ledgerSheet: String,
    val snapshotSheet: String,
    val importLogSheet: String,
    val notionDataSourceId: String,
    val financePolicy: FinancePolicy
) {
    companion object {
        fun load(context: Context, state: StateStore): AppConfig {
            val cfg = JSONObject(context.assets.open("config.json").bufferedReader().use { it.readText() })
            val corrections = JSONObject(context.assets.open("user_corrections.json").bufferedReader().use { it.readText() })
            val policyFile = cfg.optString("policy_file", "finance_policy.json")
            val policyRaw = JSONObject(context.assets.open(policyFile).bufferedReader().use { it.readText() })
            val financePolicy = FinancePolicy.from(policyRaw)
            val overrides = JSONObject()
            copyObject(corrections.optJSONObject("source_key_overrides"), overrides)
            copyObject(state.localCorrections(), overrides)

            val aliases = linkedMapOf<String, Account>()
            val aliasObj = cfg.getJSONObject("account_aliases")
            aliasObj.keys().forEach { rawName ->
                val o = aliasObj.getJSONObject(rawName)
                aliases[norm(rawName)] = Account(
                    raw = norm(rawName),
                    name = o.optString("name", rawName),
                    id = o.optString("id").ifBlank { null },
                    kind = o.optString("kind", "unknown"),
                    status = o.optString("status", "확정")
                )
            }

            val merchants = mutableListOf<MerchantRule>()
            cfg.optJSONArray("merchant_overrides")?.let { arr ->
                for (i in 0 until arr.length()) {
                    val o = arr.getJSONObject(i)
                    merchants.add(MerchantRule(
                        equals = o.optString("equals").ifBlank { null },
                        contains = o.optString("contains").ifBlank { null },
                        major = o.getString("major"), minor = o.getString("minor"), status = o.optString("status", "확정")
                    ))
                }
            }

            val rawMap = linkedMapOf<String, Triple<String, String, String>>()
            cfg.getJSONObject("raw_category_map").keys().forEach { key ->
                val a = cfg.getJSONObject("raw_category_map").getJSONArray(key)
                rawMap[key] = Triple(a.getString(0), a.getString(1), a.getString(2))
            }

            val loans = mutableListOf<LoanRule>()
            cfg.getJSONArray("loan_mappings").let { arr ->
                for (i in 0 until arr.length()) {
                    val o = arr.getJSONObject(i)
                    loans.add(LoanRule(
                        o.optString("institution").ifBlank { null },
                        o.optString("product").ifBlank { null },
                        o.optString("product_contains").ifBlank { null },
                        if (o.has("principal")) o.getLong("principal") else null,
                        o.getString("name"), o.getString("id")
                    ))
                }
            }

            val learned = mutableListOf<JSONObject>()
            corrections.optJSONArray("learned_rules")?.let { a -> for (i in 0 until a.length()) learned.add(a.getJSONObject(i)) }
            cfg.optJSONArray("learned_rules")?.let { a -> for (i in 0 until a.length()) learned.add(a.getJSONObject(i)) }
            learned.sortBy { it.optInt("priority", 9999) }

            val snap = cfg.getJSONObject("snapshot_policy")
            return AppConfig(
                raw = cfg,
                accountAliases = aliases,
                operatingOverdraftIds = jsonStringSet(cfg.getJSONArray("operating_overdraft_ids")),
                merchantRules = merchants,
                rawCategoryMap = rawMap,
                loanRules = loans,
                sourceKeyOverrides = overrides,
                learnedRules = learned,
                cashSections = jsonStringSet(snap.getJSONArray("finance_cash_sections")),
                cashExtraProducts = jsonStringSet(snap.getJSONArray("finance_cash_extra_products")),
                investmentExcludeProducts = jsonStringSet(snap.getJSONArray("finance_investment_exclude_products")),
                availableOverdraftIds = jsonStringSet(snap.getJSONArray("available_overdraft_ids")),
                highRateThreshold = snap.getDouble("high_rate_threshold"),
                spreadsheetId = cfg.getString("finance_os_spreadsheet_id"),
                ledgerSheet = cfg.getJSONObject("sheets").getString("ledger"),
                snapshotSheet = cfg.getJSONObject("sheets").getString("snapshot"),
                importLogSheet = cfg.getJSONObject("sheets").getString("import_log"),
                notionDataSourceId = "7fe4b6b5-3fe7-496e-b45c-8e557265c92d",
                financePolicy = financePolicy
            )
        }

        private fun copyObject(src: JSONObject?, dst: JSONObject) {
            if (src == null) return
            src.keys().forEach { dst.put(it, src.get(it)) }
        }

        private fun jsonStringSet(arr: JSONArray): Set<String> = buildSet {
            for (i in 0 until arr.length()) add(arr.getString(i))
        }
    }

    fun account(rawName: String): Account {
        val key = norm(rawName)
        return accountAliases[key] ?: Account(key, key, null, "unknown", "검토 필요")
    }

    fun loanAccount(inst: String, product: String, principal: Long): Account {
        for (r in loanRules) {
            if (r.institution != null && r.institution != inst) continue
            if (r.product != null && r.product != product) continue
            if (r.productContains != null && !product.contains(r.productContains)) continue
            if (r.principal != null && r.principal != principal) continue
            return Account(product, r.name, r.id, "debt", "확정")
        }
        return Account(product, product, null, "debt", "검토 필요")
    }
}
