package com.axiscw.financeos

import org.json.JSONArray
import org.json.JSONObject

/** Raw BankSalad evidence only. Classification and ledger meaning belong to the server. */
data class SourceTransaction(
    val date: String,
    val time: String,
    val rawType: String,
    val rawMajor: String,
    val rawMinor: String,
    val merchant: String,
    val signedAmount: Long,
    val currency: String,
    val payment: String,
    val memo: String,
    val sourceKey: String
) {
    fun toJson(): JSONObject = JSONObject().apply {
        put("date", date); put("time", time); put("rawType", rawType)
        put("rawMajor", rawMajor); put("rawMinor", rawMinor); put("merchant", merchant)
        put("signedAmount", signedAmount); put("currency", currency); put("payment", payment)
        put("account", payment); put("memo", memo); put("sourceKey", sourceKey)
    }
}

data class PreparedImport(
    val sourceFile: String,
    val sourceHash: String,
    val requestId: String,
    val periodStart: String,
    val periodEnd: String,
    val transactions: List<SourceTransaction>
) {
    fun transactionsJson(): JSONArray = JSONArray().apply { transactions.forEach { put(it.toJson()) } }
}
