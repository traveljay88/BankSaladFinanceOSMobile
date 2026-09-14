package com.financeos.banksalad

/**
 * Pure Kotlin contract helpers for Review UI v3.
 * Android-independent so the core behavior can be unit-tested without Android SDK.
 */
object ReviewContractV3 {
    data class Classification(
        val type: String = "",
        val major: String = "",
        val minor: String = "",
        val confidence: Int = 0,
        val reason: String = ""
    ) {
        fun isComplete(): Boolean = type.isNotBlank() && major.isNotBlank() && minor.isNotBlank()
        fun breadcrumb(): String = listOf(type, major, minor).filter { it.isNotBlank() }.joinToString(" > ")
    }

    data class ConfirmPayload(
        val action: String = "confirmReview",
        val reviewId: String,
        val type: String,
        val major: String,
        val minor: String,
        val learnPattern: Boolean
    )

    data class AnalysisCounts(
        val sourceTransactions: Int,
        val duplicate: Int,
        val autoExcluded: Int,
        val autoConfirmed: Int,
        val reviewTransactions: Int,
        val ledgerInserted: Int = 0
    ) {
        val accountedTransactions: Int
            get() = duplicate + autoExcluded + autoConfirmed + reviewTransactions
        val unaccountedTransactions: Int
            get() = sourceTransactions - accountedTransactions
        val conservationOk: Boolean
            get() = unaccountedTransactions == 0

        fun displayLine(): String = buildString {
            append("전체 $sourceTransactions")
            append(" · 자동확정 $autoConfirmed")
            append(" · 제외 $autoExcluded")
            append(" · 검토 $reviewTransactions")
            if (duplicate > 0) append(" · 중복 $duplicate")
            append(" · 원장반영 $ledgerInserted")
            if (!conservationOk) append(" · 미설명 $unaccountedTransactions")
        }
    }

    fun primaryActionLabel(recommendation: Classification?): String =
        if (recommendation?.isComplete() == true) "추천 분류 확정" else "분류 선택"

    fun canConfirmRecommendation(recommendation: Classification?): Boolean =
        recommendation?.isComplete() == true

    fun buildConfirmPayload(
        reviewId: String,
        selected: Classification,
        learnPattern: Boolean
    ): ConfirmPayload {
        require(reviewId.isNotBlank()) { "reviewId is required" }
        require(selected.isComplete()) { "type / major / minor are required" }
        return ConfirmPayload(
            reviewId = reviewId,
            type = selected.type,
            major = selected.major,
            minor = selected.minor,
            learnPattern = learnPattern
        )
    }

    /** Only print success when server response itself is successful. */
    fun saveResultMessage(ok: Boolean, error: String? = null): String =
        if (ok) "검토 결과를 서버에 저장했습니다."
        else "검토 저장 실패: ${error?.takeIf { it.isNotBlank() } ?: "unknown error"}"
}
