package com.axiscw.financeos

import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

class BackendClient(private val endpoint: String, private val secret: String) {
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
