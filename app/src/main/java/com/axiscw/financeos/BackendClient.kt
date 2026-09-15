package com.axiscw.financeos

import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.SocketTimeoutException
import java.net.URL

class BackendClient(private val endpoint: String, private val secret: String) {
    companion object {
        /** Long-running analysis/commit budget for Apps Script. */
        const val UPLOAD_READ_TIMEOUT_MS = 180_000
        const val REVIEW_READ_TIMEOUT_MS = 120_000
        const val REVIEW_RECONCILE_TIMEOUT_MS = 60_000
        const val COMMIT_READ_TIMEOUT_MS = 180_000
    }

    class UploadTimeoutException(
        val requestId: String,
        val sourceHash: String,
        cause: SocketTimeoutException
    ) : IllegalStateException("서버 응답 대기 시간이 초과되었습니다.", cause)

    class ReviewTimeoutException(
        val reviewId: String,
        cause: SocketTimeoutException
    ) : IllegalStateException("검토 저장 응답이 지연되었습니다.", cause)

    /** Adapts the mobile client to the deployed Server Brain protocol. */
    fun engineImport(prepared: PreparedImport): JSONObject = try {
        val analysis = post(JSONObject().apply {
            put("action", "analyze")
            put("secret", secret)
            put("sourceFile", prepared.sourceFile)
            put("sourceHash", prepared.sourceHash)
            put("requestId", prepared.requestId)
            put("rawTransactions", prepared.transactionsJson())
        }, UPLOAD_READ_TIMEOUT_MS)

        val analysisId = analysis.getString("analysisId")

        val commit = if (analysis.optBoolean("canCommit", false)) {
            post(
                JSONObject()
                    .put("action", "commit")
                    .put("secret", secret)
                    .put("analysisId", analysisId),
                UPLOAD_READ_TIMEOUT_MS
            )
        } else {
            null
        }

        val source = analysis.optJSONObject("summary") ?: JSONObject()

        val total = source.optInt("sourceTransactions")
        val duplicates = source.optInt("duplicate")
        val excluded = source.optInt("autoExcluded")
        val autoConfirmed = source.optInt("autoConfirmed")
        val reviewRequired = source.optInt("review")
        val accounted = duplicates + excluded + autoConfirmed + reviewRequired
        val unaccounted = total - accounted
        val conservationOk = unaccounted == 0

        JSONObject().apply {
            put("ok", conservationOk)
            put("analysisId", analysisId)
            put(
                "status",
                when {
                    !conservationOk -> "INCOMPLETE"
                    commit == null -> "REVIEW_REQUIRED"
                    else -> "SUCCESS"
                }
            )
            put("engineVersion", analysis.optString("backendVersion", "-"))
            put("uiSchema", analysis.optJSONObject("uiSchema") ?: JSONObject())
            put("summary", JSONObject().apply {
                put("total", total)
                put("autoConfirmed", autoConfirmed)
                put("inserted", commit?.optInt("ledgerInserted") ?: 0)
                put("duplicates", duplicates)
                put("excluded", excluded)
                put("settlementMatched", source.optInt("settlementMatched"))
                put("reviewRequired", reviewRequired)
                put("unaccounted", unaccounted)
                put("failed", if (conservationOk) 0 else kotlin.math.abs(unaccounted))
            })
        }
    } catch (e: SocketTimeoutException) {
        throw UploadTimeoutException(prepared.requestId, prepared.sourceHash, e)
    }

    fun import(result: AnalysisResult): JSONObject {
        require(endpoint.startsWith("https://")) {
            "Apps Script 배포 URL(https://)을 설정하세요."
        }

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
            connectTimeout = 20_000
            readTimeout = 30_000
            doOutput = true
            setRequestProperty("Content-Type", "application/json; charset=utf-8")
        }

        conn.outputStream.use {
            it.write(payload.toString().toByteArray(Charsets.UTF_8))
        }

        val code = conn.responseCode
        val stream = if (code in 200..299) conn.inputStream else conn.errorStream
        val text = stream?.bufferedReader()?.use { it.readText() }.orEmpty()

        if (code !in 200..299) {
            error("Finance OS 서버 오류 HTTP $code: $text")
        }

        val obj = JSONObject(text)
        if (!obj.optBoolean("ok", false)) {
            error(obj.optString("error", "Finance OS 반영 실패"))
        }
        return obj
    }

    fun health(): JSONObject {
        val payload = JSONObject()
            .put("action", "health")
            .put("secret", secret)

        val conn = (URL(endpoint).openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = 12_000
            readTimeout = 12_000
            doOutput = true
            setRequestProperty("Content-Type", "application/json; charset=utf-8")
        }

        conn.outputStream.use {
            it.write(payload.toString().toByteArray(Charsets.UTF_8))
        }

        val code = conn.responseCode
        val text = (if (code in 200..299) conn.inputStream else conn.errorStream)
            ?.bufferedReader()
            ?.use { it.readText() }
            .orEmpty()

        if (code !in 200..299) {
            error("Finance OS 서버 오류 HTTP $code: $text")
        }

        val obj = JSONObject(text)
        if (!obj.optBoolean("ok", false)) {
            error(obj.optString("error", "Finance OS 서버 연결 실패"))
        }
        return obj
    }

    fun reviews(analysisId: String): JSONObject {
        val response = post(
            JSONObject()
                .put("action", "getReviewQueue")
                .put("secret", secret)
                .put("analysisId", analysisId),
            REVIEW_RECONCILE_TIMEOUT_MS
        )

        val source = response.optJSONArray("reviewQueue") ?: JSONArray()
        val uiSchema = response.optJSONObject("uiSchema") ?: JSONObject()

        val items = JSONArray()

        for (i in 0 until source.length()) {
            val review = source.getJSONObject(i)
            val settlement = review.optString("reviewType") == "SETTLEMENT_LINK"
            val recommendation = review.optJSONObject("recommendation") ?: JSONObject()
            val options = review.optJSONObject("options") ?: JSONObject()

            val type = recommendation.optString("type").trim()
            val major = recommendation.optString("major").trim()
            val minor = recommendation.optString("minor").trim()
            val recommendationComplete =
                type.isNotBlank() && major.isNotBlank() && minor.isNotBlank()

            items.put(JSONObject().apply {
                put("id", review.optString("reviewId"))
                put("reviewType", if (settlement) "SETTLEMENT" else "CATEGORY")

                put("transaction", JSONObject().apply {
                    put("date", review.optString("date"))
                    put("merchant", review.optString("merchant"))
                    put(
                        "signedAmount",
                        if (settlement) review.optLong("amount")
                        else -review.optLong("amount")
                    )
                })

                put("reason", review.optString("reason"))
                put("recommendation", recommendation)
                put("matchedSourceKey", review.optString("matchedSourceKey"))
                put("options", options)

                put("suggestions", JSONArray().apply {
                    if (settlement) {
                        put(
                            JSONObject()
                                .put("action", "confirm_match")
                                .put("label", "추천 정산 연결 확정")
                        )
                        put(
                            JSONObject()
                                .put("action", "keep_unmatched")
                                .put("label", "정산은 맞지만 연결 안 함")
                        )
                    } else if (recommendationComplete) {
                        put(
                            JSONObject()
                                .put("action", "confirm")
                                .put("label", "추천 분류 확정")
                                .put(
                                    "category",
                                    JSONObject()
                                        .put("type", type)
                                        .put("major", major)
                                        .put("minor", minor)
                                )
                        )
                    } else {
                        put(
                            JSONObject()
                                .put("action", "select")
                                .put("label", "분류 선택")
                        )
                    }
                })
            })
        }

        return JSONObject()
            .put("items", items)
            .put("uiSchema", uiSchema)
            .put("reviewCount", response.optInt("reviewCount", items.length()))
            .put("canCommit", response.optBoolean("canCommit", false))
    }

    fun resolveReview(
        reviewId: String,
        action: String,
        category: JSONObject? = null,
        learnRule: Boolean = false,
        matchedSourceKey: String? = null
    ): JSONObject {
        require(reviewId.isNotBlank()) { "reviewId is required" }

        if (action == "confirm") {
            require(category != null) { "분류 선택이 필요합니다." }

            val type = category.optString("type").trim()
            val major = category.optString("major").trim()
            val minor = category.optString("minor").trim()

            require(type.isNotBlank() && major.isNotBlank() && minor.isNotBlank()) {
                "type / major / minor are required"
            }
        }

        val payload = JSONObject()
            .put("action", "confirmReview")
            .put("secret", secret)
            .put("reviewId", reviewId)
            .put("reviewAction", action)
            .put("learnPattern", learnRule)

        if (category != null) {
            payload.put("type", category.optString("type").trim())
            payload.put("major", category.optString("major").trim())
            payload.put("minor", category.optString("minor").trim())
        }

        if (!matchedSourceKey.isNullOrBlank()) {
            payload.put("matchedSourceKey", matchedSourceKey.trim())
        }

        // Review confirmation and canonical ledger commit are intentionally two
        // separate requests. A timeout here is treated as uncertain, not as a hard
        // failure: the Activity re-reads the review queue and reconciles server truth.
        return try {
            post(payload, REVIEW_READ_TIMEOUT_MS)
        } catch (e: SocketTimeoutException) {
            throw ReviewTimeoutException(reviewId, e)
        }
    }

    fun commitAnalysis(analysisId: String): JSONObject {
        require(analysisId.isNotBlank()) { "analysisId is required" }

        return post(
            JSONObject()
                .put("action", "commit")
                .put("secret", secret)
                .put("analysisId", analysisId),
            COMMIT_READ_TIMEOUT_MS
        )
    }

    private fun post(
        payload: JSONObject,
        readTimeoutMs: Int = 30_000
    ): JSONObject {
        require(endpoint.startsWith("https://")) {
            "Apps Script 배포 URL(https://)을 설정하세요."
        }

        val conn = (URL(endpoint).openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = 20_000
            readTimeout = readTimeoutMs
            doOutput = true
            setRequestProperty("Content-Type", "application/json; charset=utf-8")
        }

        conn.outputStream.use {
            it.write(payload.toString().toByteArray(Charsets.UTF_8))
        }

        val code = conn.responseCode
        val text = (if (code in 200..299) conn.inputStream else conn.errorStream)
            ?.bufferedReader()
            ?.use { it.readText() }
            .orEmpty()

        if (code !in 200..299) {
            error("Finance OS 서버 오류 HTTP $code: $text")
        }

        val obj = JSONObject(text)
        if (!obj.optBoolean("ok", false)) {
            error(obj.optString("error", "Finance OS 서버 요청 실패"))
        }

        return obj
    }

    private fun rowsToJson(rows: List<Map<String, Any?>>): JSONArray {
        val arr = JSONArray()
        rows.forEach { row ->
            val o = JSONObject()
            row.forEach { (k, v) ->
                o.put(k, v ?: JSONObject.NULL)
            }
            arr.put(o)
        }
        return arr
    }
}
