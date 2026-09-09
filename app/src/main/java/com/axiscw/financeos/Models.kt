package com.axiscw.financeos

data class Account(
    val raw: String,
    val name: String,
    val id: String?,
    val kind: String = "unknown",
    val status: String = "확정"
)

data class Txn(
    val idx: Int,
    val date: String,
    val time: String,
    val rawType: String,
    val rawMajor: String,
    val rawMinor: String,
    val content: String,
    val signedAmount: Long,
    val currency: String,
    val payment: String,
    val memo: String,
    val sourceKey: String,
    val account: Account,
    var pairIdx: Int? = null,
    var isMirror: Boolean = false,
    var pairAccountId: String? = null,
    var pairAccountKind: String? = null,
    var pairPayment: String = ""
)

data class LedgerRow(
    val values: LinkedHashMap<String, Any?>,
    val sourceKey: String,
    val amount: Long,
    val signedAmount: Long,
    val accountKind: String
) {
    val status: String get() = values["검토상태"]?.toString() ?: "검토 필요"
    fun setStatus(v: String) { values["검토상태"] = v }
}

data class SnapshotMetrics(
    val positiveAssets: Double,
    val financeCash: Double,
    val investmentEval: Double,
    val realEstate: Double,
    val otherAssets: Double,
    val car: Double,
    val insuranceAssets: Double,
    val pensionAssets: Double,
    val totalLiabilities: Long,
    val availableOverdraft: Long,
    val highRateLiabilities: Long,
    val bsCorrectedNetWorth: Double,
    val financeOsNetWorth: Double,
    val unmappedSnapshotAccounts: Int,
    val snapshotRows: Int
)

data class AnalysisResult(
    val sourceFile: String,
    val periodStart: String,
    val periodEnd: String,
    val transactionRowsRead: Int,
    val ledgerRows: MutableList<LedgerRow>,
    val localSkipped: Int,
    val snapshotRows: List<LinkedHashMap<String, Any?>>,
    val metrics: SnapshotMetrics,
    val allSourceKeys: Set<String>,
    val policyVersion: String,
    val policyMode: String,
    val policyAlerts: List<String>,
    val investmentGate: String
) {
    val reviewRows: List<LedgerRow> get() = ledgerRows.filter { it.status == "검토 필요" }
    val provisionalRows: List<LedgerRow> get() = ledgerRows.filter { it.status == "잠정" }
    val unresolvedRows: List<LedgerRow> get() = ledgerRows.filter { it.status == "검토 필요" || it.status == "잠정" }
    val confirmedRows: List<LedgerRow> get() = ledgerRows.filter { it.status == "확정" || it.status == "자동확정" }

    fun recognizedSpend(): Long = ledgerRows.sumOf { (it.values["소비지출액"] as? Number)?.toLong() ?: 0L }
    fun recognizedInterest(): Long = ledgerRows.sumOf { (it.values["대출이자액"] as? Number)?.toLong() ?: 0L }
}
