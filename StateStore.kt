package com.axiscw.financeos

import android.content.Context
import org.json.JSONObject

class StateStore(private val context: Context) {
    private val prefs = context.getSharedPreferences("finance_os_state", Context.MODE_PRIVATE)

    fun processedKeys(): MutableSet<String> {
        val existing = prefs.getStringSet("processed_source_keys", null)
        if (existing != null) return existing.toMutableSet()
        val initial = mutableSetOf<String>()
        try {
            val text = context.assets.open("initial_state.json").bufferedReader().use { it.readText() }
            val arr = JSONObject(text).optJSONArray("processed_source_keys")
            if (arr != null) for (i in 0 until arr.length()) initial.add(arr.getString(i))
        } catch (_: Exception) {}
        prefs.edit().putStringSet("processed_source_keys", initial).apply()
        return initial
    }

    fun markProcessed(keys: Collection<String>) {
        val merged = processedKeys()
        merged.addAll(keys)
        prefs.edit().putStringSet("processed_source_keys", merged).apply()
    }

    fun clearProcessed() {
        prefs.edit().remove("processed_source_keys").apply()
    }

    fun localCorrections(): JSONObject {
        return try { JSONObject(prefs.getString("local_corrections", "{}") ?: "{}") }
        catch (_: Exception) { JSONObject() }
    }

    fun saveLocalCorrection(sourceKey: String, action: JSONObject) {
        val root = localCorrections()
        root.put(sourceKey, action)
        prefs.edit().putString("local_corrections", root.toString()).apply()
    }
}
