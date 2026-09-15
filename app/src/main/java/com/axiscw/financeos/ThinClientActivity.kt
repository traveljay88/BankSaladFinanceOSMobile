package com.axiscw.financeos

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.graphics.Typeface
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.InputType
import android.util.Log
import android.view.Gravity
import android.view.View
import android.view.inputmethod.InputMethodManager
import android.widget.*
import org.json.JSONArray
import org.json.JSONObject
import java.text.NumberFormat
import java.util.Locale

/** Server-driven Finance OS client. No local accounting or classification rules. */
class ThinClientActivity : Activity() {
    companion object {
        private const val MAX_UI_LOG_LINES = 8
    }

    private val requestOpen = 1001

    private lateinit var secure: SecureStore
    private var selectedUri: Uri? = null
    private var selectedName = ""
    private var prepared: PreparedImport? = null

    private lateinit var fileLabel: TextView
    private lateinit var zipPassword: EditText
    private lateinit var endpoint: EditText
    private lateinit var backendSecret: EditText
    private lateinit var summary: TextView
    private lateinit var reviewBox: LinearLayout
    private lateinit var uploadButton: Button
    private lateinit var retryButton: Button
    private lateinit var logView: TextView
    private val uiLogLines = mutableListOf<String>()
    private var lastCommitStateToken = ""

    private val backgroundHandler = Handler(Looper.getMainLooper())
    private var lastBackgroundStateToken = ""
    private val backgroundPoller = object : Runnable {
        override fun run() {
            refreshBackgroundUploadState()
            refreshBackgroundCommitState()
            backgroundHandler.postDelayed(this, 1500L)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        secure = SecureStore(this)

        buildUi()
        restoreSettings()
        acceptIntent(intent)
        refreshServerReviews(silent = true)
        refreshBackgroundUploadState(force = true)
        refreshBackgroundCommitState(force = true)
    }

    override fun onResume() {
        super.onResume()
        backgroundHandler.removeCallbacks(backgroundPoller)
        backgroundHandler.post(backgroundPoller)
    }

    override fun onPause() {
        backgroundHandler.removeCallbacks(backgroundPoller)
        super.onPause()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        acceptIntent(intent)
    }

    private fun buildUi() {
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(18), dp(20), dp(36))
        }

        val scroll = ScrollView(this).apply {
            addView(root)
        }

        root.addView(
            TextView(this).apply {
                text = "Finance OS"
                textSize = 25f
                setTypeface(typeface, Typeface.BOLD)
            }
        )

        root.addView(
            TextView(this).apply {
                text = "파일을 서버 Finance Engine으로 전송합니다. 분류·중복·정산·원장 반영은 서버가 처리합니다."
                setPadding(0, dp(6), 0, dp(18))
                textSize = 14f
            }
        )

        root.addView(sectionTitle("1. 파일 업로드"))

        root.addView(
            Button(this).apply {
                text = "BankSalad ZIP / XLSX / CSV 선택"
                setOnClickListener { openPicker() }
            },
            full()
        )

        fileLabel = TextView(this).apply {
            text = "선택된 파일 없음"
            setPadding(0, dp(6), 0, dp(6))
        }
        root.addView(fileLabel)

        zipPassword = EditText(this).apply {
            hint = "ZIP 비밀번호 (ZIP인 경우만)"
            inputType =
                InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
        }
        root.addView(zipPassword, full())

        root.addView(
            Button(this).apply {
                text = "파일 준비"
                setOnClickListener { prepareSelected() }
            },
            full()
        )

        uploadButton = Button(this).apply {
            text = "Finance OS로 업로드"
            isEnabled = false
            setOnClickListener { uploadPrepared() }
        }

        retryButton = Button(this).apply {
            text = "마지막 업로드 재시도"
            isEnabled = false
            setOnClickListener {
                if (prepared != null) uploadPrepared() else retryBackgroundUpload()
            }
        }

        root.addView(uploadButton, full())
        root.addView(retryButton, full())

        root.addView(sectionTitle("2. 처리 결과"))

        summary = TextView(this).apply {
            text = "파일을 준비하면 원본 거래 수만 확인합니다."
            setPadding(dp(12), dp(12), dp(12), dp(12))
            setBackgroundColor(0xFFF2F2F2.toInt())
        }
        root.addView(summary, full())

        root.addView(sectionTitle("3. 서버 검토 큐"))

        root.addView(
            Button(this).apply {
                text = "검토 큐 새로고침"
                setOnClickListener { refreshServerReviews() }
            },
            full()
        )

        reviewBox = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
        }
        root.addView(reviewBox, full())

        root.addView(sectionTitle("연결 설정"))

        endpoint = EditText(this).apply {
            hint = "Apps Script Web App URL"
            inputType =
                InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI
        }

        backendSecret = EditText(this).apply {
            hint = "APP_SECRET"
            inputType =
                InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
        }

        root.addView(endpoint, full())
        root.addView(backendSecret, full())

        root.addView(
            Button(this).apply {
                text = "연결 설정 저장"
                setOnClickListener {
                    saveSettings()
                    clearConnectionFocus()
                    toast("설정을 저장했습니다.")
                }
            },
            full()
        )

        root.addView(
            Button(this).apply {
                text = "서버 연결 테스트"
                setOnClickListener { testBackend() }
            },
            full()
        )

        root.addView(sectionTitle("실행 로그 · 최근 8개"))

        root.addView(
            Button(this).apply {
                text = "로그 지우기"
                setOnClickListener {
                    uiLogLines.clear()
                    logView.text = "최근 로그 없음"
                }
            },
            full()
        )

        logView = TextView(this).apply {
            text = "최근 로그 없음"
            textSize = 13f
            setTextIsSelectable(true)
            setPadding(dp(10), dp(10), dp(10), dp(10))
            setBackgroundColor(0xFFF7F7F7.toInt())
        }

        root.addView(logView, full())
        setContentView(scroll)
    }

    private fun restoreSettings() {
        zipPassword.setText(secure.get("zip_password"))
        endpoint.setText(secure.get("endpoint"))
        backendSecret.setText(secure.get("backend_secret"))
    }

    private fun saveSettings() {
        secure.put("zip_password", zipPassword.text.toString())
        secure.put("endpoint", endpoint.text.toString().trim())
        secure.put("backend_secret", backendSecret.text.toString())
    }

    private fun openPicker() =
        startActivityForResult(
            Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                addCategory(Intent.CATEGORY_OPENABLE)
                type = "*/*"
                putExtra(
                    Intent.EXTRA_MIME_TYPES,
                    arrayOf(
                        "application/zip",
                        "application/octet-stream",
                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                        "text/csv"
                    )
                )
            },
            requestOpen
        )

    @Deprecated("Deprecated in Android API; retained to avoid AndroidX dependency")
    override fun onActivityResult(
        requestCode: Int,
        resultCode: Int,
        data: Intent?
    ) {
        super.onActivityResult(requestCode, resultCode, data)

        if (requestCode == requestOpen && resultCode == RESULT_OK) {
            data?.data?.let { setSelected(it) }
        }
    }

    private fun acceptIntent(intent: Intent?) {
        val uri = when (intent?.action) {
            Intent.ACTION_SEND ->
                @Suppress("DEPRECATION")
                (intent.getParcelableExtra(Intent.EXTRA_STREAM) as? Uri)

            Intent.ACTION_VIEW -> intent.data
            else -> null
        }

        uri?.let { setSelected(it) }
    }

    private fun setSelected(uri: Uri) {
        try {
            contentResolver.takePersistableUriPermission(
                uri,
                Intent.FLAG_GRANT_READ_URI_PERMISSION
            )
        } catch (_: Exception) {
        }

        selectedUri = uri
        selectedName = FileInput.displayName(this, uri)
        prepared = null

        fileLabel.text = selectedName
        summary.text = "선택됨: $selectedName\n파일 준비를 누르세요."
        uploadButton.isEnabled = false
        retryButton.isEnabled = false

        log("파일 선택: $selectedName")
    }

    private fun prepareSelected() {
        val uri = selectedUri
            ?: return toast("먼저 BankSalad 파일을 선택하세요.")

        saveSettings()

        summary.text = "원본 거래를 준비하는 중…"
        uploadButton.isEnabled = false

        Thread {
            try {
                val (input, originalName) =
                    FileInput.materialize(
                        this,
                        uri,
                        zipPassword.text.toString()
                    )

                val next =
                    BankSaladTransactionExtractor(
                        input,
                        originalName
                    ).prepare()

                prepared = next

                runOnUiThread {
                    summary.text =
                        "준비 완료\n" +
                        "${next.periodStart} ~ ${next.periodEnd}\n" +
                        "원본 거래 ${next.transactions.size}건\n" +
                        "분류·중복·정산·원장 반영은 서버가 처리합니다."

                    uploadButton.isEnabled = true
                    retryButton.isEnabled = true

                    log("원본 거래 ${next.transactions.size}건 준비 완료")
                }
            } catch (e: Exception) {
                runOnUiThread {
                    summary.text = "파일 준비 실패"
                    log("준비 오류: ${e.message}")
                    toast(e.message ?: "파일 준비 실패")
                }
            }
        }.start()
    }

    private fun uploadPrepared() {
        val payload = prepared
            ?: return retryBackgroundUpload()

        saveSettings()

        val url = endpoint.text.toString().trim()
        val secret = backendSecret.text.toString()

        if (url.isBlank() || secret.isBlank()) {
            return toast("Apps Script URL과 APP_SECRET을 설정하세요.")
        }

        uploadButton.isEnabled = false
        retryButton.isEnabled = false
        summary.text =
            "백그라운드 서버 처리 예약 중…\n" +
            "앱을 나가거나 화면을 꺼도 처리가 이어집니다."

        try {
            FinanceUploadWorker.enqueue(this, payload)
            refreshBackgroundUploadState(force = true)
            log("백그라운드 업로드를 시작했습니다. 앱을 나가도 계속 처리됩니다.")
        } catch (e: Exception) {
            summary.text = "백그라운드 업로드 시작 실패"
            uploadButton.isEnabled = prepared != null
            retryButton.isEnabled = true
            log("백그라운드 업로드 시작 오류: ${e.message}")
            toast("업로드 시작 실패")
        }
    }

    private fun retryBackgroundUpload() {
        saveSettings()

        val url = endpoint.text.toString().trim()
        val secret = backendSecret.text.toString()
        if (url.isBlank() || secret.isBlank()) {
            return toast("Apps Script URL과 APP_SECRET을 설정하세요.")
        }

        val workId = FinanceUploadWorker.retryLast(this)
        if (workId == null) {
            toast("재시도할 백그라운드 업로드가 없습니다.")
            return
        }

        uploadButton.isEnabled = false
        retryButton.isEnabled = false
        summary.text =
            "백그라운드 업로드 재시도 중…\n" +
            "앱을 나가거나 화면을 꺼도 처리가 이어집니다."
        refreshBackgroundUploadState(force = true)
        log("마지막 백그라운드 업로드를 재시도합니다.")
    }

    private fun refreshBackgroundUploadState(force: Boolean = false) {
        val snapshot = FinanceBackgroundUploadState(this).snapshot()
        val token = "${snapshot.state}|${snapshot.updatedAt}|${snapshot.workId}"
        if (!force && token == lastBackgroundStateToken) return
        lastBackgroundStateToken = token

        when (snapshot.state) {
            FinanceBackgroundUploadState.STATE_ENQUEUED -> {
                summary.text =
                    "백그라운드 업로드 대기 중…\n" +
                    "네트워크가 연결되면 시작됩니다. 앱을 나가도 됩니다."
                uploadButton.isEnabled = false
                retryButton.isEnabled = false
            }

            FinanceBackgroundUploadState.STATE_RUNNING -> {
                summary.text =
                    "백그라운드 서버 처리 중…\n" +
                    "앱을 나가거나 화면을 꺼도 계속 처리됩니다."
                uploadButton.isEnabled = false
                retryButton.isEnabled = false
            }

            FinanceBackgroundUploadState.STATE_SUCCESS -> {
                val response = try {
                    JSONObject(snapshot.resultJson)
                } catch (_: Exception) {
                    JSONObject()
                }

                if (response.length() > 0) {
                    val analysisId = response.optString("analysisId")
                    if (analysisId.isNotBlank()) secure.put("last_analysis_id", analysisId)
                    renderImportResult(response)
                    refreshServerReviews(silent = true)
                } else {
                    summary.text = "백그라운드 업로드 완료"
                }

                uploadButton.isEnabled = prepared != null
                retryButton.isEnabled = prepared != null
                log("백그라운드 업로드 완료")
            }

            FinanceBackgroundUploadState.STATE_FAILED -> {
                summary.text = buildString {
                    append("백그라운드 업로드 실패\n")
                    append(snapshot.error.ifBlank { "원인을 확인할 수 없습니다." })
                    append("\n마지막 업로드 재시도를 누를 수 있습니다.")
                }
                uploadButton.isEnabled = prepared != null
                retryButton.isEnabled = true
                log("백그라운드 업로드 실패: ${snapshot.error}")
            }
        }
    }

    private fun refreshBackgroundCommitState(force: Boolean = false) {
        val snapshot = FinanceCommitState(this).snapshot()
        val token = "${snapshot.state}|${snapshot.updatedAt}|${snapshot.workId}|${snapshot.inserted}|${snapshot.error}"
        if (!force && token == lastCommitStateToken) return
        lastCommitStateToken = token

        when (snapshot.state) {
            FinanceCommitState.STATE_ENQUEUED ->
                log("원장 반영 예약됨 · 앱을 나가도 계속 처리")

            FinanceCommitState.STATE_RUNNING ->
                log("원장 반영 중…")

            FinanceCommitState.STATE_SUCCESS -> {
                log("원장 반영 완료 · 신규 ${snapshot.inserted}건")
                refreshServerReviews(silent = true)
            }

            FinanceCommitState.STATE_FAILED ->
                log("원장 반영 실패 · ${snapshot.error.ifBlank { "재시도 필요" }}")
        }
    }

    private fun renderImportResult(response: JSONObject) {
        val s = response.optJSONObject("summary") ?: JSONObject()

        val total = s.optInt("total")
        val autoConfirmed = s.optInt("autoConfirmed")
        val inserted = s.optInt("inserted")
        val duplicates = s.optInt("duplicates")
        val excluded = s.optInt("excluded")
        val settlement = s.optInt("settlementMatched")
        val review = s.optInt("reviewRequired")
        val unaccounted = s.optInt("unaccounted")
        val failed = s.optInt("failed")
        val status = response.optString("status", "SUCCESS")

        summary.text = buildString {
            append("서버 처리 결과 · $status")
            append("\n전체 $total")
            append(" · 자동확정 $autoConfirmed")
            append(" · 중복 $duplicates")
            append("\n제외 $excluded")
            append(" · 정산매칭 $settlement")
            append(" · 검토 $review")
            append("\n원장반영 $inserted")

            if (unaccounted != 0) {
                append(" · 미설명 $unaccounted")
            }

            append("\nEngine ${response.optString("engineVersion", "-")}")

            if (failed > 0 || status == "INCOMPLETE") {
                append("\n⚠ 처리 정합성 확인 필요")
            }
        }

        if (status == "INCOMPLETE") {
            log(
                "처리 불완전: 전체 $total / 자동확정 $autoConfirmed / " +
                "중복 $duplicates / 제외 $excluded / 검토 $review / " +
                "미설명 $unaccounted"
            )
        } else {
            log(
                "서버 처리 완료: 자동확정 $autoConfirmed / " +
                "원장반영 $inserted / 검토 $review"
            )
        }
    }

    private fun refreshServerReviews(silent: Boolean = false) {
        val url = endpoint.text.toString().trim()
        val secret = backendSecret.text.toString()
        val analysisId = secure.get("last_analysis_id")

        if (url.isBlank() || secret.isBlank() || analysisId.isBlank()) {
            return
        }

        Thread {
            try {
                val response =
                    BackendClient(url, secret).reviews(analysisId)

                val items =
                    response.optJSONArray("items") ?: JSONArray()

                val uiSchema =
                    response.optJSONObject("uiSchema") ?: JSONObject()

                runOnUiThread {
                    renderServerReviews(items, uiSchema)

                    if (!silent) {
                        log("서버 검토 ${items.length()}건을 불러왔습니다.")
                    }
                }
            } catch (e: Exception) {
                if (!silent) {
                    runOnUiThread {
                        log("검토 큐 조회 실패: ${e.message}")
                        toast("검토 큐 조회 실패")
                    }
                }
            }
        }.start()
    }

    private fun renderServerReviews(
        items: JSONArray,
        uiSchema: JSONObject
    ) {
        reviewBox.removeAllViews()

        if (items.length() == 0) {
            showEmptyReviewState()
            return
        }

        val taxonomy = taxonomyFromUiSchema(uiSchema)

        for (i in 0 until items.length()) {
            val item = items.getJSONObject(i)
            val tx = item.getJSONObject("transaction")
            val reviewType = item.optString("reviewType")

            val card = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                setPadding(0, dp(4), 0, dp(12))
            }

            card.addView(
                TextView(this).apply {
                    text =
                        "[$reviewType] " +
                        "${tx.optString("date")} · " +
                        "${tx.optString("merchant")} · " +
                        "${money(tx.optLong("signedAmount"))}원\n" +
                        item.optString("reason")

                    setTypeface(typeface, Typeface.BOLD)
                    setPadding(0, dp(10), 0, dp(4))
                },
                full()
            )

            if (reviewType == "SETTLEMENT") {
                renderSettlementReview(item, card)
            } else {
                renderCategoryReview(item, taxonomy, card)
            }

            reviewBox.addView(card, full())
        }
    }

    private fun showEmptyReviewState() {
        reviewBox.removeAllViews()
        reviewBox.addView(
            TextView(this).apply {
                text = "서버 검토 필요 거래 없음"
                setPadding(0, dp(4), 0, dp(6))
            }
        )
    }

    private fun renderSettlementReview(
        item: JSONObject,
        container: LinearLayout
    ) {
        val options = item.optJSONObject("options") ?: JSONObject()
        val recommended = options.optJSONObject("recommended") ?: JSONObject()
        val matchedSourceKey =
            recommended.optString("sourceKey").ifBlank {
                item.optString("matchedSourceKey")
            }

        if (recommended.length() > 0) {
            val targetDate = recommended.optString("date")
            val targetMerchant = recommended.optString("merchant")
            val targetAmount = recommended.optLong("amount")
            val score = recommended.optInt("score")

            container.addView(
                TextView(this).apply {
                    text = buildString {
                        append("추천 연결 → ")
                        append(targetDate)
                        append(" · ")
                        append(targetMerchant)
                        append(" · ")
                        append(money(targetAmount))
                        append("원")
                        if (score > 0) append("  (${score}점)")
                    }
                    setPadding(0, 0, 0, dp(6))
                },
                full()
            )
        }

        val suggestions =
            item.optJSONArray("suggestions") ?: JSONArray()

        for (j in 0 until suggestions.length()) {
            val suggestion = suggestions.getJSONObject(j)
            val action = suggestion.optString("action")

            container.addView(
                Button(this).apply {
                    isAllCaps = false
                    gravity = Gravity.START or Gravity.CENTER_VERTICAL

                    text =
                        suggestion.optString(
                            "label",
                            action
                        )

                    setOnClickListener {
                        isEnabled = false
                        text = "처리 중…"

                        resolveServerReview(
                            reviewId = item.optString("id"),
                            action = action,
                            category = null,
                            learnRule = false,
                            matchedSourceKey = if (action == "confirm_match") matchedSourceKey else null,
                            reviewView = container
                        )
                    }
                },
                full()
            )
        }
    }

    private fun renderCategoryReview(
        item: JSONObject,
        taxonomy: List<ReviewUiV3.CategoryOption>,
        container: LinearLayout
    ) {
        val recommendation =
            item.optJSONObject("recommendation") ?: JSONObject()
        val options = item.optJSONObject("options") ?: JSONObject()

        val suggested = ReviewUiV3.Classification(
            type = recommendation.optString("type").trim(),
            major = recommendation.optString("major").trim(),
            minor = recommendation.optString("minor").trim(),
            confidence = recommendation.optInt("confidence"),
            reason = item.optString("reason")
        )

        val complete = suggested.isComplete()
        val allowLearnPattern = options.optBoolean("allowLearnPattern", complete)
        val learnPatternDefault = options.optBoolean("learnPatternDefault", false)

        container.addView(
            TextView(this).apply {
                text =
                    if (complete) {
                        buildString {
                            append(
                                "추천: ${suggested.type} > " +
                                "${suggested.major} > ${suggested.minor}"
                            )

                            if (suggested.confidence > 0) {
                                append(" (${suggested.confidence}%)")
                            }
                        }
                    } else {
                        "추천 없음 · 분류 선택 필요"
                    }

                setPadding(0, 0, 0, dp(4))
            },
            full()
        )

        val learn = CheckBox(this).apply {
            text = "같은 가맹점에 적용"
            isChecked = allowLearnPattern && learnPatternDefault
            visibility = if (allowLearnPattern) View.VISIBLE else View.GONE
        }
        container.addView(learn, full())

        val primaryButton = Button(this).apply {
            isAllCaps = false
            gravity = Gravity.START or Gravity.CENTER_VERTICAL

            text =
                ReviewContractV3.primaryActionLabel(
                    ReviewContractV3.Classification(
                        type = suggested.type,
                        major = suggested.major,
                        minor = suggested.minor,
                        confidence = suggested.confidence,
                        reason = suggested.reason
                    )
                )

            setOnClickListener {
                if (complete) {
                    val category =
                        JSONObject()
                            .put("type", suggested.type)
                            .put("major", suggested.major)
                            .put("minor", suggested.minor)

                    isEnabled = false
                    text = "처리 중…"

                    resolveServerReview(
                        reviewId = item.optString("id"),
                        action = "confirm",
                        category = category,
                        learnRule = allowLearnPattern && learn.isChecked,
                        reviewView = container
                    )
                } else {
                    openClassificationPicker(
                        item = item,
                        suggested = suggested,
                        taxonomy = taxonomy,
                        learnPatternDefault = allowLearnPattern && learn.isChecked,
                        allowLearnPattern = allowLearnPattern,
                        reviewView = container
                    )
                }
            }
        }

        container.addView(primaryButton, full())

        if (complete) {
            container.addView(
                Button(this).apply {
                    isAllCaps = false
                    gravity =
                        Gravity.START or Gravity.CENTER_VERTICAL
                    text = "분류 변경"

                    setOnClickListener {
                        openClassificationPicker(
                            item = item,
                            suggested = suggested,
                            taxonomy = taxonomy,
                            learnPatternDefault = allowLearnPattern && learn.isChecked,
                            allowLearnPattern = allowLearnPattern,
                            reviewView = container
                        )
                    }
                },
                full()
            )
        }
    }

    private fun openClassificationPicker(
        item: JSONObject,
        suggested: ReviewUiV3.Classification?,
        taxonomy: List<ReviewUiV3.CategoryOption>,
        learnPatternDefault: Boolean,
        allowLearnPattern: Boolean,
        reviewView: View
    ) {
        if (taxonomy.isEmpty()) {
            toast("서버 표준분류를 불러오지 못했습니다.")
            log("분류 선택 실패: uiSchema.standardCategories 비어 있음")
            return
        }

        val tx = item.optJSONObject("transaction") ?: JSONObject()

        val title =
            "${tx.optString("date")} · " +
            "${tx.optString("merchant")} · " +
            "${money(tx.optLong("signedAmount"))}원"

        ReviewUiV3.show(
            context = this,
            transactionTitle = title,
            suggested = suggested,
            taxonomy = taxonomy,
            learnPatternDefault = if (allowLearnPattern) learnPatternDefault else false,
            showLearnPattern = allowLearnPattern
        ) { selected, learnPattern ->
            val category =
                JSONObject()
                    .put("type", selected.type)
                    .put("major", selected.major)
                    .put("minor", selected.minor)

            resolveServerReview(
                reviewId = item.optString("id"),
                action = "confirm",
                category = category,
                learnRule = allowLearnPattern && learnPattern,
                reviewView = reviewView
            )
        }
    }

    private fun taxonomyFromUiSchema(
        uiSchema: JSONObject
    ): List<ReviewUiV3.CategoryOption> {
        val standard =
            uiSchema.optJSONObject("standardCategories")
                ?: return emptyList()

        val result =
            mutableListOf<ReviewUiV3.CategoryOption>()

        val majorKeys = standard.keys()

        while (majorKeys.hasNext()) {
            val major = majorKeys.next()
            val minors = standard.optJSONArray(major) ?: continue
            val type = inferTypeFromCategory(major)

            for (i in 0 until minors.length()) {
                val minor = minors.optString(i).trim()

                if (minor.isNotBlank()) {
                    result +=
                        ReviewUiV3.CategoryOption(
                            type = type,
                            major = major,
                            minor = minor
                        )
                }
            }
        }

        return result
            .distinctBy { Triple(it.type, it.major, it.minor) }
            .sortedWith(
                compareBy<ReviewUiV3.CategoryOption>(
                    { it.type },
                    { it.major },
                    { it.minor }
                )
            )
    }

    private fun inferTypeFromCategory(
        major: String
    ): String {
        val m = major.trim()

        return when {
            m == "소득" ->
                "소득"

            m == "정산" ->
                "정산"

            m == "자산이동" ->
                "자산이동"

            m.contains("금융비용") ->
                "금융비용"

            m.contains("부채") ||
            m.contains("대출") ->
                "부채이동"

            m.contains("투자") ->
                "투자"

            m.contains("환불") ||
            m.contains("취소") ||
            m.contains("캐시백") ->
                "환불·취소"

            m.contains("급여공제") ->
                "급여공제"

            else ->
                "소비지출"
        }
    }

    private fun resolveServerReview(
        reviewId: String,
        action: String,
        category: JSONObject?,
        learnRule: Boolean,
        matchedSourceKey: String? = null,
        reviewView: View? = null
    ) {
        val url = endpoint.text.toString().trim()
        val secret = backendSecret.text.toString()
        val currentAnalysisId = secure.get("last_analysis_id")

        Thread {
            val client = BackendClient(url, secret)
            try {
                val response = client.resolveReview(
                    reviewId = reviewId,
                    action = action,
                    category = category,
                    learnRule = learnRule,
                    matchedSourceKey = matchedSourceKey
                )

                val analysisId = response.optString("analysisId").ifBlank { currentAnalysisId }
                val remaining = response.optInt("remaining", -1)
                val canCommit = response.optBoolean("canCommit", false)

                runOnUiThread {
                    removeResolvedReviewView(reviewView)
                    log("검토 확정 완료" + if (remaining >= 0) " · 남은 검토 $remaining건" else "")
                    toast(if (canCommit) "확정 완료 · 원장 반영 예약" else "검토 확정 완료")
                }

                if (canCommit && analysisId.isNotBlank()) {
                    FinanceCommitWorker.enqueue(applicationContext, analysisId)
                    runOnUiThread { refreshBackgroundCommitState(force = true) }
                }

                runOnUiThread { refreshServerReviews(silent = true) }
            } catch (e: BackendClient.ReviewTimeoutException) {
                reconcileReviewAfterTimeout(
                    client = client,
                    analysisId = currentAnalysisId,
                    reviewId = reviewId,
                    reviewView = reviewView
                )
            } catch (e: Exception) {
                runOnUiThread {
                    log("검토 저장 오류 · ${shortError(e)}")
                    toast("검토 저장 확인 필요")
                    refreshServerReviews(silent = true)
                }
            }
        }.start()
    }

    private fun reconcileReviewAfterTimeout(
        client: BackendClient,
        analysisId: String,
        reviewId: String,
        reviewView: View?
    ) {
        if (analysisId.isBlank()) {
            runOnUiThread {
                log("검토 응답 지연 · 검토 큐를 새로고침하세요.")
                toast("서버 응답 지연 · 새로고침 필요")
            }
            return
        }

        try {
            val queue = client.reviews(analysisId)
            val items = queue.optJSONArray("items") ?: JSONArray()
            var stillPending = false
            for (i in 0 until items.length()) {
                if (items.optJSONObject(i)?.optString("id") == reviewId) {
                    stillPending = true
                    break
                }
            }

            if (!stillPending) {
                runOnUiThread {
                    removeResolvedReviewView(reviewView)
                    log("검토 확정 확인 완료 · 응답만 지연됨")
                    toast("검토 확정 완료")
                }
                if (queue.optBoolean("canCommit", false)) {
                    FinanceCommitWorker.enqueue(applicationContext, analysisId)
                    runOnUiThread { refreshBackgroundCommitState(force = true) }
                }
            } else {
                runOnUiThread {
                    log("검토 저장 지연 · 서버에는 아직 대기 중")
                    toast("검토 저장 재시도 가능")
                    refreshServerReviews(silent = true)
                }
            }
        } catch (verifyError: Exception) {
            runOnUiThread {
                log("검토 결과 확인 필요 · ${shortError(verifyError)}")
                toast("검토 큐 새로고침으로 상태를 확인하세요.")
            }
        }
    }

    private fun removeResolvedReviewView(reviewView: View?) {
        if (reviewView != null && reviewView.parent === reviewBox) {
            reviewBox.removeView(reviewView)
            if (reviewBox.childCount == 0) showEmptyReviewState()
        }
    }

    private fun shortError(e: Exception): String {
        val raw = e.message.orEmpty().ifBlank { e::class.java.simpleName }
        return when {
            raw.contains("timeout", ignoreCase = true) -> "timeout"
            raw.length > 90 -> raw.take(87) + "…"
            else -> raw
        }
    }

    private fun testBackend() {
        saveSettings()

        val url = endpoint.text.toString().trim()
        val secret = backendSecret.text.toString()

        if (url.isBlank() || secret.isBlank()) {
            return toast(
                "Apps Script URL과 APP_SECRET을 설정하세요."
            )
        }

        Thread {
            try {
                val response =
                    BackendClient(url, secret).health()

                runOnUiThread {
                    log(
                        "서버 연결 성공: " +
                        "${response.optString("message", "OK")} · " +
                        "${response.optString("backendVersion", "?")}"
                    )
                    clearConnectionFocus()
                    toast("서버 연결 성공")
                }
            } catch (e: Exception) {
                runOnUiThread {
                    log("서버 연결 실패: ${e.message}")
                    toast("서버 연결 실패")
                }
            }
        }.start()
    }

    private fun clearConnectionFocus() {
        val focused = currentFocus
        endpoint.clearFocus()
        backendSecret.clearFocus()

        if (focused != null) {
            val imm =
                getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager
            imm.hideSoftInputFromWindow(focused.windowToken, 0)
        }

        window.decorView.isFocusableInTouchMode = true
        window.decorView.requestFocus()
    }

    private fun sectionTitle(text: String) =
        TextView(this).apply {
            this.text = text
            textSize = 18f
            setTypeface(typeface, Typeface.BOLD)
            setPadding(0, dp(22), 0, dp(8))
        }

    private fun full() =
        LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply {
            bottomMargin = dp(8)
        }

    private fun money(value: Long) =
        NumberFormat
            .getNumberInstance(Locale.KOREA)
            .format(kotlin.math.abs(value))

    private fun log(text: String) {
        Log.d("FinanceOS", text)
        val line = "${java.time.LocalTime.now().withNano(0)}  $text"
        if (uiLogLines.firstOrNull()?.substringAfter("  ") == text) return
        uiLogLines.add(0, line)
        while (uiLogLines.size > MAX_UI_LOG_LINES) uiLogLines.removeAt(uiLogLines.lastIndex)
        logView.text = uiLogLines.joinToString("\n")
    }

    private fun toast(text: String) =
        Toast.makeText(
            this,
            text,
            Toast.LENGTH_SHORT
        ).show()

    private fun dp(v: Int) =
        (v * resources.displayMetrics.density).toInt()
}
