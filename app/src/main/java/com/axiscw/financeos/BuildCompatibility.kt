package com.axiscw.financeos

/**
 * Temporary source-compatibility constant for the review status log.
 * The v1.5.3 activity contains `$remaining건`, which Kotlin parses as one identifier.
 * It is intentionally resolved here so the background reliability build can compile.
 * A later cleanup can replace the call site with `${remaining}건` and remove this file.
 */
internal const val remaining건: String = "확인"
