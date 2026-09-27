package com.axiscw.financeos

import org.json.JSONObject

/**
 * Thin-client compatibility gate.
 *
 * Accounting/classification remains server-owned. The Android app refuses to
 * analyze or commit against an older Server Brain so ledger rules cannot drift
 * silently between the phone and Finance OS.
 */
internal object ServerCompatibility {
    const val REQUIRED_PROTOCOL_VERSION = 1
    const val MIN_BACKEND_VERSION = "1.8.1"
    const val MIN_POLICY_VERSION = "3.8.0"

    fun requireCompatible(response: JSONObject) {
        val protocol = response.optInt("protocolVersion", -1)
        val backend = response.optString("backendVersion").trim()
        val policy = response.optString("policyVersion").trim()

        require(protocol == REQUIRED_PROTOCOL_VERSION) {
            "Finance OS 프로토콜 불일치: 서버 $protocol / 앱 $REQUIRED_PROTOCOL_VERSION"
        }
        require(versionAtLeast(backend, MIN_BACKEND_VERSION)) {
            "Server Brain 업데이트 필요: 서버 ${backend.ifBlank { "미확인" }} / 최소 $MIN_BACKEND_VERSION"
        }
        require(versionAtLeast(policy, MIN_POLICY_VERSION)) {
            "Finance Policy 업데이트 필요: 서버 ${policy.ifBlank { "미확인" }} / 최소 $MIN_POLICY_VERSION"
        }
        require(response.optBoolean("serverDrivenUI", true)) {
            "서버 기반 분류 UI를 지원하지 않는 백엔드입니다."
        }
    }

    fun summary(response: JSONObject): String =
        "Backend ${response.optString("backendVersion", "?")} · " +
            "Policy ${response.optString("policyVersion", "?")} · " +
            "Protocol ${response.optInt("protocolVersion", -1)}"

    private fun versionAtLeast(actual: String, minimum: String): Boolean {
        val a = versionParts(actual)
        val b = versionParts(minimum)
        if (a.isEmpty()) return false
        val n = maxOf(a.size, b.size)
        for (i in 0 until n) {
            val av = a.getOrElse(i) { 0 }
            val bv = b.getOrElse(i) { 0 }
            if (av != bv) return av > bv
        }
        return true
    }

    private fun versionParts(value: String): List<Int> =
        value.trim()
            .substringBefore("-")
            .split(".")
            .mapNotNull { it.toIntOrNull() }
}
