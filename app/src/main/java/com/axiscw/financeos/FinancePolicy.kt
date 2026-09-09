package com.axiscw.financeos

import org.json.JSONObject
import java.text.NumberFormat
import java.util.Locale

data class PolicyEvaluation(
    val mode: String,
    val alerts: List<String>,
    val investmentGate: String
)

class FinancePolicy private constructor(val raw: JSONObject) {
    val version: String = raw.optString("policy_version", "unknown")
    private val liquidity = raw.optJSONObject("liquidity_policy") ?: JSONObject()
    private val spending = raw.optJSONObject("spending_policy") ?: JSONObject()
    private val debt = raw.optJSONObject("debt_policy") ?: JSONObject()
    private val investment = raw.optJSONObject("investment_policy") ?: JSONObject()
    private val quality = raw.optJSONObject("data_quality_policy") ?: JSONObject()

    val availableCashFloor: Long = liquidity.optLong("available_cash_floor_krw", 5_500_000L)
    val livingCap: Long = spending.optLong("current_monthly_living_cap_krw", 2_000_000L)
    val discretionaryCap: Long = spending.optLong("current_monthly_discretionary_cap_krw", 500_000L)
    val gamblingBudget: Long = spending.optLong("gambling_game_budget_krw", 0L)
    val highRateThreshold: Double = debt.optDouble("high_rate_threshold_pct", 7.0)

    fun evaluate(metrics: SnapshotMetrics): PolicyEvaluation {
        val nf = NumberFormat.getNumberInstance(Locale.KOREA)
        val alerts = mutableListOf<String>()
        if (metrics.availableOverdraft < availableCashFloor) {
            alerts += "가용현금 ${nf.format(metrics.availableOverdraft)}원 < 하한 ${nf.format(availableCashFloor)}원: 30일 필수결제·유동성 방어 우선"
        } else {
            alerts += "가용현금 하한 ${nf.format(availableCashFloor)}원 충족"
        }
        if (metrics.highRateLiabilities > 0L) {
            alerts += "${highRateThreshold.toInt()}%+ 부채 ${nf.format(metrics.highRateLiabilities)}원 존재: 신규 고위험 투자 금지"
        } else {
            alerts += "${highRateThreshold.toInt()}%+ 부채 0원 조건 충족"
        }
        if (metrics.unmappedSnapshotAccounts > 0) {
            alerts += "Snapshot 미매핑 ${metrics.unmappedSnapshotAccounts}개: 자산·부채 대사는 부분검증"
        }
        alerts += "30일 예상잔액·카드/세금/보험 납부위험은 BankSalad 파일만으로 확정할 수 없어 투자 게이트는 자동 개방하지 않음"

        val mode = if (metrics.availableOverdraft < availableCashFloor || metrics.highRateLiabilities > 0L) "방어모드" else "조건검증모드"
        val investmentGate = if (mode == "방어모드") "CLOSED" else "REVIEW_REQUIRED"
        return PolicyEvaluation(mode, alerts, investmentGate)
    }

    fun unresolvedBlocksImport(): Boolean = quality.optBoolean("unresolved_blocks_import", true)

    companion object {
        fun from(raw: JSONObject): FinancePolicy = FinancePolicy(raw)
    }
}
