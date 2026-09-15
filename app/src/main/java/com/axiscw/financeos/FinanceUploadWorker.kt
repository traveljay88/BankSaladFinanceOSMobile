package com.axiscw.financeos

import android.content.Context
import androidx.work.Constraints
import androidx.work.Data
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequest
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.UUID

/**
 * Durable, user-initiated Finance OS upload.
 *
 * The PreparedImport payload is stored in app-private storage rather than WorkManager Data
 * because WorkManager Data has a small size limit. WorkManager only receives the file path.
 * This lets the upload survive Activity destruction, process recreation, and normal app swipes.
 */
class FinanceUploadWorker(
    appContext: Context,
    params: WorkerParameters
) : Worker(appContext, params) {

    override fun doWork(): Result {
        val payloadPath = inputData.getString(KEY_PAYLOAD_PATH).orEmpty()
        val requestId = inputData.getString(KEY_REQUEST_ID).orEmpty()
        val state = FinanceBackgroundUploadState(applicationContext)

        if (payloadPath.isBlank() || requestId.isBlank()) {
            state.markFailed(requestId, payloadPath, "백그라운드 업로드 정보가 없습니다.")
            return Result.failure()
        }

        val payloadFile = File(payloadPath)
        if (!payloadFile.exists()) {
            state.markFailed(requestId, payloadPath, "업로드 원본 캐시를 찾지 못했습니다.")
            return Result.failure()
        }

        state.markRunning(requestId, payloadPath)

        return try {
            val secure = SecureStore(applicationContext)
            val endpoint = secure.get("endpoint").trim()
            val secret = secure.get("backend_secret")

            require(endpoint.isNotBlank() && secret.isNotBlank()) {
                "Apps Script URL 또는 APP_SECRET이 저장되어 있지 않습니다."
            }

            val prepared = PreparedImportFileStore.read(payloadFile)
            val response = BackendClient(endpoint, secret).engineImport(prepared)

            val analysisId = response.optString("analysisId")
            if (analysisId.isNotBlank()) {
                secure.put("last_analysis_id", analysisId)
            }

            // Keep only the compact result required by the Activity. Review taxonomy is
            // re-fetched from the server after the app is opened again.
            val compact = JSONObject().apply {
                put("ok", response.optBoolean("ok", false))
                put("analysisId", analysisId)
                put("status", response.optString("status", "SUCCESS"))
                put("engineVersion", response.optString("engineVersion", "-"))
                put("summary", response.optJSONObject("summary") ?: JSONObject())
            }

            state.markSuccess(requestId, payloadPath, compact)
            payloadFile.delete()

            Result.success(
                Data.Builder()
                    .putString(KEY_REQUEST_ID, requestId)
                    .putString(KEY_ANALYSIS_ID, analysisId)
                    .build()
            )
        } catch (e: Exception) {
            // Do not automatically retry an uncertain HTTP timeout. The request may already
            // have completed on Apps Script; the user can retry explicitly and server-side
            // source-key deduplication remains authoritative.
            state.markFailed(
                requestId = requestId,
                payloadPath = payloadPath,
                message = e.message ?: e::class.java.simpleName
            )
            Result.failure()
        }
    }

    companion object {
        private const val KEY_PAYLOAD_PATH = "payload_path"
        private const val KEY_REQUEST_ID = "request_id"
        private const val KEY_ANALYSIS_ID = "analysis_id"
        private const val UNIQUE_PREFIX = "finance-os-upload-"

        fun enqueue(context: Context, prepared: PreparedImport): UUID {
            val payloadFile = PreparedImportFileStore.write(context, prepared)
            val state = FinanceBackgroundUploadState(context)
            state.markEnqueued(prepared.requestId, payloadFile.absolutePath)

            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()

            val request = OneTimeWorkRequest.Builder(FinanceUploadWorker::class.java)
                .setConstraints(constraints)
                .setInputData(
                    Data.Builder()
                        .putString(KEY_PAYLOAD_PATH, payloadFile.absolutePath)
                        .putString(KEY_REQUEST_ID, prepared.requestId)
                        .build()
                )
                .build()

            WorkManager.getInstance(context.applicationContext)
                .enqueueUniqueWork(
                    UNIQUE_PREFIX + prepared.requestId,
                    ExistingWorkPolicy.KEEP,
                    request
                )

            state.saveWorkId(request.id.toString())
            return request.id
        }

        /** Re-enqueue the last failed payload without requiring the original Activity object. */
        fun retryLast(context: Context): UUID? {
            val state = FinanceBackgroundUploadState(context)
            val snapshot = state.snapshot()
            val path = snapshot.payloadPath
            val requestId = snapshot.requestId
            if (path.isBlank() || requestId.isBlank() || !File(path).exists()) return null

            state.markEnqueued(requestId, path)

            val request = OneTimeWorkRequest.Builder(FinanceUploadWorker::class.java)
                .setConstraints(
                    Constraints.Builder()
                        .setRequiredNetworkType(NetworkType.CONNECTED)
                        .build()
                )
                .setInputData(
                    Data.Builder()
                        .putString(KEY_PAYLOAD_PATH, path)
                        .putString(KEY_REQUEST_ID, requestId)
                        .build()
                )
                .build()

            WorkManager.getInstance(context.applicationContext)
                .enqueueUniqueWork(
                    UNIQUE_PREFIX + requestId,
                    ExistingWorkPolicy.REPLACE,
                    request
                )

            state.saveWorkId(request.id.toString())
            return request.id
        }
    }
}


/** Durable phase-2 ledger commit used after a review is accepted. */
class FinanceCommitWorker(
    appContext: Context,
    params: WorkerParameters
) : Worker(appContext, params) {
    override fun doWork(): Result {
        val analysisId = inputData.getString(KEY_ANALYSIS_ID).orEmpty()
        val state = FinanceCommitState(applicationContext)
        if (analysisId.isBlank()) {
            state.markFailed(analysisId, "analysisId가 없습니다.")
            return Result.failure()
        }

        state.markRunning(analysisId)
        return try {
            val secure = SecureStore(applicationContext)
            val endpoint = secure.get("endpoint").trim()
            val secret = secure.get("backend_secret")
            require(endpoint.isNotBlank() && secret.isNotBlank()) {
                "Apps Script URL 또는 APP_SECRET이 저장되어 있지 않습니다."
            }

            val response = BackendClient(endpoint, secret).commitAnalysis(analysisId)
            state.markSuccess(analysisId, response.optInt("ledgerInserted", 0))
            Result.success()
        } catch (e: Exception) {
            state.markFailed(analysisId, e.message ?: e::class.java.simpleName)
            Result.failure()
        }
    }

    companion object {
        private const val KEY_ANALYSIS_ID = "analysis_id"
        private const val UNIQUE_PREFIX = "finance-os-commit-"

        fun enqueue(context: Context, analysisId: String): UUID {
            require(analysisId.isNotBlank()) { "analysisId is required" }
            val state = FinanceCommitState(context)
            state.markEnqueued(analysisId)

            val request = OneTimeWorkRequest.Builder(FinanceCommitWorker::class.java)
                .setConstraints(
                    Constraints.Builder()
                        .setRequiredNetworkType(NetworkType.CONNECTED)
                        .build()
                )
                .setInputData(
                    Data.Builder()
                        .putString(KEY_ANALYSIS_ID, analysisId)
                        .build()
                )
                .build()

            WorkManager.getInstance(context.applicationContext)
                .enqueueUniqueWork(
                    UNIQUE_PREFIX + analysisId,
                    ExistingWorkPolicy.REPLACE,
                    request
                )
            state.saveWorkId(request.id.toString())
            return request.id
        }
    }
}

class FinanceCommitState(context: Context) {
    private val prefs = context.applicationContext
        .getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    data class Snapshot(
        val state: String,
        val analysisId: String,
        val workId: String,
        val inserted: Int,
        val error: String,
        val updatedAt: Long
    )

    fun snapshot(): Snapshot = Snapshot(
        state = prefs.getString(KEY_STATE, STATE_IDLE).orEmpty(),
        analysisId = prefs.getString(KEY_ANALYSIS_ID, "").orEmpty(),
        workId = prefs.getString(KEY_WORK_ID, "").orEmpty(),
        inserted = prefs.getInt(KEY_INSERTED, 0),
        error = prefs.getString(KEY_ERROR, "").orEmpty(),
        updatedAt = prefs.getLong(KEY_UPDATED_AT, 0L)
    )

    fun markEnqueued(analysisId: String) = update(STATE_ENQUEUED, analysisId, 0, "")
    fun markRunning(analysisId: String) = update(STATE_RUNNING, analysisId, 0, "")
    fun markSuccess(analysisId: String, inserted: Int) = update(STATE_SUCCESS, analysisId, inserted, "")
    fun markFailed(analysisId: String, error: String) = update(STATE_FAILED, analysisId, 0, error)

    fun saveWorkId(workId: String) {
        prefs.edit().putString(KEY_WORK_ID, workId)
            .putLong(KEY_UPDATED_AT, System.currentTimeMillis()).apply()
    }

    private fun update(state: String, analysisId: String, inserted: Int, error: String) {
        prefs.edit()
            .putString(KEY_STATE, state)
            .putString(KEY_ANALYSIS_ID, analysisId)
            .putInt(KEY_INSERTED, inserted)
            .putString(KEY_ERROR, error)
            .putLong(KEY_UPDATED_AT, System.currentTimeMillis())
            .apply()
    }

    companion object {
        const val STATE_IDLE = "IDLE"
        const val STATE_ENQUEUED = "ENQUEUED"
        const val STATE_RUNNING = "RUNNING"
        const val STATE_SUCCESS = "SUCCESS"
        const val STATE_FAILED = "FAILED"
        private const val PREFS = "finance_os_commit_state"
        private const val KEY_STATE = "state"
        private const val KEY_ANALYSIS_ID = "analysis_id"
        private const val KEY_WORK_ID = "work_id"
        private const val KEY_INSERTED = "inserted"
        private const val KEY_ERROR = "error"
        private const val KEY_UPDATED_AT = "updated_at"
    }
}

/** App-private JSON spool for large PreparedImport payloads. */
object PreparedImportFileStore {
    private const val DIR = "finance_upload_queue"

    fun write(context: Context, prepared: PreparedImport): File {
        val dir = File(context.filesDir, DIR).apply { mkdirs() }
        val file = File(dir, "${prepared.requestId}.json")

        val json = JSONObject().apply {
            put("sourceFile", prepared.sourceFile)
            put("sourceHash", prepared.sourceHash)
            put("requestId", prepared.requestId)
            put("periodStart", prepared.periodStart)
            put("periodEnd", prepared.periodEnd)
            put("transactions", prepared.transactionsJson())
        }

        file.writeText(json.toString(), Charsets.UTF_8)
        return file
    }

    fun read(file: File): PreparedImport {
        val root = JSONObject(file.readText(Charsets.UTF_8))
        val arr = root.optJSONArray("transactions") ?: JSONArray()
        val txs = ArrayList<SourceTransaction>(arr.length())

        for (i in 0 until arr.length()) {
            val o = arr.getJSONObject(i)
            txs += SourceTransaction(
                date = o.optString("date"),
                time = o.optString("time"),
                rawType = o.optString("rawType"),
                rawMajor = o.optString("rawMajor"),
                rawMinor = o.optString("rawMinor"),
                merchant = o.optString("merchant"),
                signedAmount = o.optLong("signedAmount"),
                currency = o.optString("currency"),
                payment = o.optString("payment"),
                memo = o.optString("memo"),
                sourceKey = o.optString("sourceKey")
            )
        }

        return PreparedImport(
            sourceFile = root.optString("sourceFile"),
            sourceHash = root.optString("sourceHash"),
            requestId = root.optString("requestId"),
            periodStart = root.optString("periodStart"),
            periodEnd = root.optString("periodEnd"),
            transactions = txs
        )
    }
}

/** Small persistent state channel used when the Activity is absent or the process is recreated. */
class FinanceBackgroundUploadState(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    data class Snapshot(
        val state: String,
        val requestId: String,
        val payloadPath: String,
        val workId: String,
        val resultJson: String,
        val error: String,
        val updatedAt: Long
    )

    fun snapshot(): Snapshot = Snapshot(
        state = prefs.getString(KEY_STATE, STATE_IDLE).orEmpty(),
        requestId = prefs.getString(KEY_REQUEST_ID, "").orEmpty(),
        payloadPath = prefs.getString(KEY_PAYLOAD_PATH, "").orEmpty(),
        workId = prefs.getString(KEY_WORK_ID, "").orEmpty(),
        resultJson = prefs.getString(KEY_RESULT_JSON, "").orEmpty(),
        error = prefs.getString(KEY_ERROR, "").orEmpty(),
        updatedAt = prefs.getLong(KEY_UPDATED_AT, 0L)
    )

    fun markEnqueued(requestId: String, payloadPath: String) = update(
        state = STATE_ENQUEUED,
        requestId = requestId,
        payloadPath = payloadPath,
        resultJson = "",
        error = ""
    )

    fun markRunning(requestId: String, payloadPath: String) = update(
        state = STATE_RUNNING,
        requestId = requestId,
        payloadPath = payloadPath,
        resultJson = "",
        error = ""
    )

    fun markSuccess(requestId: String, payloadPath: String, result: JSONObject) = update(
        state = STATE_SUCCESS,
        requestId = requestId,
        payloadPath = payloadPath,
        resultJson = result.toString(),
        error = ""
    )

    fun markFailed(requestId: String, payloadPath: String, message: String) = update(
        state = STATE_FAILED,
        requestId = requestId,
        payloadPath = payloadPath,
        resultJson = "",
        error = message
    )

    fun saveWorkId(workId: String) {
        prefs.edit()
            .putString(KEY_WORK_ID, workId)
            .putLong(KEY_UPDATED_AT, System.currentTimeMillis())
            .apply()
    }

    private fun update(
        state: String,
        requestId: String,
        payloadPath: String,
        resultJson: String,
        error: String
    ) {
        prefs.edit()
            .putString(KEY_STATE, state)
            .putString(KEY_REQUEST_ID, requestId)
            .putString(KEY_PAYLOAD_PATH, payloadPath)
            .putString(KEY_RESULT_JSON, resultJson)
            .putString(KEY_ERROR, error)
            .putLong(KEY_UPDATED_AT, System.currentTimeMillis())
            .apply()
    }

    companion object {
        const val STATE_IDLE = "IDLE"
        const val STATE_ENQUEUED = "ENQUEUED"
        const val STATE_RUNNING = "RUNNING"
        const val STATE_SUCCESS = "SUCCESS"
        const val STATE_FAILED = "FAILED"

        private const val PREFS = "finance_os_background_upload"
        private const val KEY_STATE = "state"
        private const val KEY_REQUEST_ID = "request_id"
        private const val KEY_PAYLOAD_PATH = "payload_path"
        private const val KEY_WORK_ID = "work_id"
        private const val KEY_RESULT_JSON = "result_json"
        private const val KEY_ERROR = "error"
        private const val KEY_UPDATED_AT = "updated_at"
    }
}
