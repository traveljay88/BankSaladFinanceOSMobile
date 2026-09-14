package com.axiscw.financeos

import java.io.File
import java.security.MessageDigest
import java.util.UUID

/**
 * Device-only file adapter. It validates the exported BankSalad layout and
 * returns source fields unchanged; it intentionally contains no rule,
 * duplicate, category, settlement, or ledger logic.
 */
class BankSaladTransactionExtractor(private val file: File, private val sourceFile: String) {
    fun prepare(): PreparedImport {
        val transactions = if (file.extension.equals("csv", true)) parseRows(CsvRows.read(file))
        else XlsxReader(file).use { parseRows(it.rows("가계부 내역")) }
        require(transactions.isNotEmpty()) { "가계부 내역에서 거래를 찾지 못했습니다." }
        return PreparedImport(
            sourceFile = sourceFile,
            sourceHash = sha256(file),
            requestId = UUID.randomUUID().toString(),
            periodStart = transactions.minOf { it.date },
            periodEnd = transactions.maxOf { it.date },
            transactions = transactions
        )
    }

    private fun parseRows(rows: List<List<Any?>>): List<SourceTransaction> {
        val expected = listOf("날짜", "시간", "타입", "대분류", "소분류", "내용", "금액", "화폐", "결제수단", "메모")
        require(rows.isNotEmpty() && (0 until 10).map { norm(rows[0].getOrNull(it)) } == expected) {
            "BankSalad '가계부 내역' 구조가 예상과 다릅니다."
        }
        return buildList {
            for (index in 1 until rows.size) {
                val row = rows[index]
                if (norm(row.getOrNull(0)).isBlank()) continue
                val date = excelDate(row.getOrNull(0))
                val time = excelTime(row.getOrNull(1))
                val rawType = norm(row.getOrNull(2)); val rawMajor = norm(row.getOrNull(3)); val rawMinor = norm(row.getOrNull(4))
                val merchant = norm(row.getOrNull(5)); val amount = money(row.getOrNull(6))
                val currency = norm(row.getOrNull(7)); val payment = norm(row.getOrNull(8)); val memo = norm(row.getOrNull(9))
                if (merchant.isBlank() || amount == 0L) continue
                val key = fingerprint(listOf(date, time, rawType, rawMajor, rawMinor, merchant, amount, currency, payment, memo))
                add(SourceTransaction(date, time, rawType, rawMajor, rawMinor, merchant, amount, currency, payment, memo, key))
            }
        }
    }

    private fun fingerprint(values: List<Any?>): String = sha256(values.joinToString("|") { norm(it) }.toByteArray()).take(40)
    private fun sha256(file: File): String = file.inputStream().use { input ->
        val digest = MessageDigest.getInstance("SHA-256"); val buffer = ByteArray(8192)
        while (true) { val read = input.read(buffer); if (read < 0) break; digest.update(buffer, 0, read) }
        digest.digest().joinToString("") { "%02x".format(it) }
    }
    private fun sha256(bytes: ByteArray): String = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
}

private object CsvRows {
    fun read(file: File): List<List<Any?>> {
        val text = file.readText(Charsets.UTF_8).removePrefix("\uFEFF")
        val rows = mutableListOf<MutableList<String>>(); var row = mutableListOf<String>(); val cell = StringBuilder(); var quoted = false; var i = 0
        while (i < text.length) {
            val c = text[i]
            when {
                c == '"' && quoted && i + 1 < text.length && text[i + 1] == '"' -> { cell.append('"'); i++ }
                c == '"' -> quoted = !quoted
                c == ',' && !quoted -> { row.add(cell.toString()); cell.clear() }
                (c == '\n' || c == '\r') && !quoted -> {
                    if (c == '\r' && i + 1 < text.length && text[i + 1] == '\n') i++
                    row.add(cell.toString()); cell.clear(); rows.add(row); row = mutableListOf()
                }
                else -> cell.append(c)
            }
            i++
        }
        if (cell.isNotEmpty() || row.isNotEmpty()) { row.add(cell.toString()); rows.add(row) }
        return rows
    }
}
