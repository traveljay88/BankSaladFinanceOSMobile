package com.axiscw.financeos

import android.content.Context
import android.database.Cursor
import android.net.Uri
import android.provider.OpenableColumns
import net.lingala.zip4j.ZipFile
import java.io.File

object FileInput {
    fun displayName(context: Context, uri: Uri): String {
        var name = "banksalad_file"
        val cursor: Cursor? = context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)
        cursor?.use {
            if (it.moveToFirst()) name = it.getString(0) ?: name
        }
        return name
    }

    fun materialize(context: Context, uri: Uri, password: String): Pair<File, String> {
        val name = displayName(context, uri)
        val input = File(context.cacheDir, "input_${System.currentTimeMillis()}_${name.replace(Regex("[^A-Za-z0-9._~-]"), "_")}")
        context.contentResolver.openInputStream(uri)?.use { src -> input.outputStream().use { src.copyTo(it) } }
            ?: error("선택한 파일을 읽을 수 없습니다.")
        return when {
            name.lowercase().endsWith(".xlsx") -> input to name
            name.lowercase().endsWith(".zip") -> extractXlsx(context, input, password) to name
            else -> error("BankSalad ZIP 또는 XLSX 파일을 선택하세요.")
        }
    }

    private fun extractXlsx(context: Context, zip: File, password: String): File {
        val dest = File(context.cacheDir, "bs_extract_${System.currentTimeMillis()}").apply { mkdirs() }
        val z = if (password.isBlank()) ZipFile(zip) else ZipFile(zip, password.toCharArray())
        try {
            z.extractAll(dest.absolutePath)
        } catch (e: Exception) {
            throw IllegalArgumentException("ZIP 암호가 틀렸거나 파일을 해제할 수 없습니다.", e)
        }
        return dest.walkTopDown().firstOrNull { it.isFile && it.extension.equals("xlsx", true) }
            ?: error("ZIP 안에서 BankSalad XLSX를 찾지 못했습니다.")
    }
}
