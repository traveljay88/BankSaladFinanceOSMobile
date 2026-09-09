package com.axiscw.financeos

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

class SecureStore(private val context: Context) {
    private val prefs = context.getSharedPreferences("finance_os_secure", Context.MODE_PRIVATE)
    private val alias = "finance_os_mobile_aes"

    private fun key(): SecretKey {
        val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        val existing = ks.getKey(alias, null) as? SecretKey
        if (existing != null) return existing
        val kg = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        kg.init(
            KeyGenParameterSpec.Builder(
                alias,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build()
        )
        return kg.generateKey()
    }

    fun put(name: String, value: String) {
        if (value.isEmpty()) {
            prefs.edit().remove(name).apply()
            return
        }
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key())
        val iv = Base64.encodeToString(cipher.iv, Base64.NO_WRAP)
        val enc = Base64.encodeToString(cipher.doFinal(value.toByteArray(Charsets.UTF_8)), Base64.NO_WRAP)
        prefs.edit().putString(name, "$iv:$enc").apply()
    }

    fun get(name: String): String {
        val packed = prefs.getString(name, null) ?: return ""
        return try {
            val parts = packed.split(":", limit = 2)
            val iv = Base64.decode(parts[0], Base64.NO_WRAP)
            val enc = Base64.decode(parts[1], Base64.NO_WRAP)
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, iv))
            String(cipher.doFinal(enc), Charsets.UTF_8)
        } catch (_: Exception) {
            ""
        }
    }
}
