package com.axiscw.financeos

import org.w3c.dom.Element
import org.w3c.dom.Node
import java.io.File
import java.util.zip.ZipFile
import javax.xml.parsers.DocumentBuilderFactory

class XlsxReader(private val file: File) : AutoCloseable {
    private val zip = ZipFile(file)
    private val dbf = DocumentBuilderFactory.newInstance().apply { isNamespaceAware = true }
    private val sharedStrings: List<String> by lazy { loadSharedStrings() }
    private val sheetPaths: Map<String, String> by lazy { loadSheetPaths() }

    private fun parse(path: String) = zip.getInputStream(zip.getEntry(path) ?: error("Missing XLSX entry: $path")).use {
        dbf.newDocumentBuilder().parse(it)
    }

    private fun loadSharedStrings(): List<String> {
        val entry = zip.getEntry("xl/sharedStrings.xml") ?: return emptyList()
        val doc = zip.getInputStream(entry).use { dbf.newDocumentBuilder().parse(it) }
        val nodes = doc.getElementsByTagNameNS("*", "si")
        return (0 until nodes.length).map { idx ->
            val si = nodes.item(idx) as Element
            val texts = si.getElementsByTagNameNS("*", "t")
            buildString {
                for (i in 0 until texts.length) append(texts.item(i).textContent ?: "")
            }
        }
    }

    private fun loadSheetPaths(): Map<String, String> {
        val wb = parse("xl/workbook.xml")
        val rel = parse("xl/_rels/workbook.xml.rels")
        val relMap = mutableMapOf<String, String>()
        val rels = rel.getElementsByTagNameNS("*", "Relationship")
        for (i in 0 until rels.length) {
            val e = rels.item(i) as Element
            relMap[e.getAttribute("Id")] = e.getAttribute("Target")
        }
        val out = linkedMapOf<String, String>()
        val sheets = wb.getElementsByTagNameNS("*", "sheet")
        for (i in 0 until sheets.length) {
            val e = sheets.item(i) as Element
            val name = e.getAttribute("name")
            var rid = e.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id")
            if (rid.isBlank()) rid = e.getAttribute("r:id")
            val target = relMap[rid] ?: error("Missing relationship for sheet $name")
            val path = if (target.startsWith("/")) target.removePrefix("/") else "xl/${target.removePrefix("/")}"
            out[name] = normalizeZipPath(path)
        }
        return out
    }

    private fun normalizeZipPath(path: String): String {
        val parts = mutableListOf<String>()
        path.split('/').forEach {
            when (it) {
                "", "." -> Unit
                ".." -> if (parts.isNotEmpty()) parts.removeAt(parts.lastIndex)
                else -> parts.add(it)
            }
        }
        return parts.joinToString("/")
    }

    fun rows(sheetName: String): List<List<Any?>> {
        val path = sheetPaths[sheetName] ?: error("Missing sheet '$sheetName'. Found: ${sheetPaths.keys}")
        val doc = parse(path)
        val rowNodes = doc.getElementsByTagNameNS("*", "row")
        val out = mutableListOf<List<Any?>>()
        for (i in 0 until rowNodes.length) {
            val rowEl = rowNodes.item(i) as Element
            val cellNodes = rowEl.getElementsByTagNameNS("*", "c")
            val cells = mutableMapOf<Int, Any?>()
            var maxCol = -1
            for (j in 0 until cellNodes.length) {
                val c = cellNodes.item(j) as Element
                val ref = c.getAttribute("r")
                val idx = colIndex(ref)
                maxCol = maxOf(maxCol, idx)
                val type = c.getAttribute("t")
                val value: Any? = when (type) {
                    "inlineStr" -> {
                        val ts = c.getElementsByTagNameNS("*", "t")
                        buildString { for (k in 0 until ts.length) append(ts.item(k).textContent ?: "") }
                    }
                    else -> {
                        val vs = c.getElementsByTagNameNS("*", "v")
                        val raw = if (vs.length > 0) vs.item(0).textContent ?: "" else ""
                        when (type) {
                            "s" -> if (raw.isBlank()) "" else sharedStrings[raw.toInt()]
                            "b" -> raw == "1"
                            "str", "e" -> raw
                            else -> parseNumeric(raw)
                        }
                    }
                }
                cells[idx] = value
            }
            if (maxCol < 0) out.add(emptyList())
            else out.add(List(maxCol + 1) { cells[it] })
        }
        return out
    }

    private fun parseNumeric(raw: String): Any? {
        if (raw.isBlank()) return null
        val d = raw.toDoubleOrNull() ?: return raw
        return if (d % 1.0 == 0.0 && d in Long.MIN_VALUE.toDouble()..Long.MAX_VALUE.toDouble()) d.toLong() else d
    }

    private fun colIndex(ref: String): Int {
        val letters = ref.takeWhile { it in 'A'..'Z' }
        var n = 0
        letters.forEach { n = n * 26 + (it.code - 64) }
        return n - 1
    }

    override fun close() = zip.close()
}

fun norm(value: Any?): String = value?.toString()?.replace(Regex("\\s+"), " ")?.trim() ?: ""

fun excelDate(value: Any?): String {
    if (value == null || norm(value).isEmpty()) return ""
    val s = norm(value)
    if (Regex("\\d{4}-\\d{2}-\\d{2}").matches(s)) return s
    val days = (value as? Number)?.toDouble() ?: s.toDouble()
    val base = java.time.LocalDate.of(1899, 12, 30)
    return base.plusDays(days.toLong()).toString()
}

fun excelTime(value: Any?): String {
    if (value == null || norm(value).isEmpty()) return "00:00:00"
    val s = norm(value)
    if (Regex("\\d{2}:\\d{2}(:\\d{2})?").matches(s)) return if (s.length == 5) "$s:00" else s
    val d = (value as? Number)?.toDouble() ?: s.toDouble()
    val sec = kotlin.math.round(((d % 1.0) * 86400.0)).toInt().mod(86400)
    return "%02d:%02d:%02d".format(sec / 3600, (sec % 3600) / 60, sec % 60)
}

fun money(value: Any?): Long {
    if (value == null || norm(value).isEmpty()) return 0L
    return kotlin.math.round((value as? Number)?.toDouble() ?: norm(value).toDouble()).toLong()
}
