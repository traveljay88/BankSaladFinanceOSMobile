package com.axiscw.financeos

import android.app.Activity
import android.content.Intent
import android.graphics.Typeface
import android.net.Uri
import android.os.Bundle
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.widget.*
import org.json.JSONArray
import org.json.JSONObject
import java.text.NumberFormat
import java.util.Locale

/** Server-driven Finance OS client. No local accounting or classification rules. */
class ThinClientActivity : Activity() {
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

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        secure = SecureStore(this)

        buildUi()
        restoreSettings()
        acceptIntent(intent)
        refreshServerReviews(silent = true)
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
            setOnClickListener { uploadPrepared() }
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

        root.addView(sectionTitle("실행 로그"))

        logView = TextView(this).apply {
            text = "대기 중"
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
            ?: return toast("먼저 파일을 준비하세요.")

        saveSettings()

        val url = endpoint.text.toString().trim()
        val secret = backendSecret.text.toString()

        if (url.isBlank() || secret.isBlank()) {
            return toast("Apps Script URL과 APP_SECRET을 설정하세요.")
        }

        uploadButton.isEnabled = false
        retryButton.isEnabled = false
        summary.text = "서버 처리 중…"

        Thread {
            try {
                val response =
                    BackendClient(url, secret).engineImport(payload)

                runOnUiThread {
                    secure.put(
                        "last_analysis_id",
                        response.optString("analysisId")
                    )

                    renderImportResult(response)

                    retryButton.isEnabled = true
                    uploadButton.isEnabled = true

                    refreshServerReviews(silent = true)
                }
            } catch (e: Exception) {
                runOnUiThread {
                    summary.text =
                        "업로드 실패\n다시 시도할 수 있습니다."

                    retryButton.isEnabled = true
                    uploadButton.isEnabled = true

                    log("업로드 오류: ${e.message}")
                    toast("업로드 실패")
                }
            }
        }.start()
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
            reviewBox.addView(
                TextView(this).apply {
                    text = "서버 검토 필요 거래 없음"
                    setPadding(0, dp(4), 0, dp(6))
                }
            )
            return
        }

        val taxonomy = taxonomyFromUiSchema(uiSchema)

        for (i in 0 until items.length()) {
            val item = items.getJSONObject(i)
            val tx = item.getJSONObject("transaction")
            val reviewType = item.optString("reviewType")

            reviewBox.addView(
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
                renderSettlementReview(item)
            } else {
                renderCategoryReview(item, taxonomy)
            }
        }
    }

    private fun renderSettlementReview(item: JSONObject) {
        val suggestions =
            item.optJSONArray("suggestions") ?: JSONArray()

        for (j in 0 until suggestions.length()) {
            val suggestion = suggestions.getJSONObject(j)

            reviewBox.addView(
                Button(this).apply {
                    isAllCaps = false
                    gravity =
                        Gravity.START or Gravity.CENTER_VERTICAL

                    text =
                        suggestion.optString(
                            "label",
                            suggestion.optString("action")
                        )

                    setOnClickListener {
                        resolveServerReview(
                            reviewId = item.optString("id"),
                            action = suggestion.optString("action"),
                            category = null,
                            learnRule = false
                        )
                    }
                },
                full()
            )
        }
    }

    private fun renderCategoryReview(
        item: JSONObject,
        taxonomy: List<ReviewUiV3.CategoryOption>
    ) {
        val recommendation =
            item.optJSONObject("recommendation") ?: JSONObject()

        val suggested = ReviewUiV3.Classification(
            type = recommendation.optString("type").trim(),
            major = recommendation.optString("major").trim(),
            minor = recommendation.optString("minor").trim(),
            confidence = recommendation.optInt("confidence"),
            reason = item.optString("reason")
        )

        val complete = suggested.isComplete()

        reviewBox.addView(
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
            isChecked = true
        }
        reviewBox.addView(learn, full())

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

                    resolveServerReview(
                        reviewId = item.optString("id"),
                        action = "confirm",
                        category = category,
                        learnRule = learn.isChecked
                    )
                } else {
                    openClassificationPicker(
                        item = item,
                        suggested = suggested,
                        taxonomy = taxonomy,
                        learnPatternDefault = learn.isChecked
                    )
                }
            }
        }

        reviewBox.addView(primaryButton, full())

        if (complete) {
            reviewBox.addView(
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
                            learnPatternDefault = learn.isChecked
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
        learnPatternDefault: Boolean
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
            learnPatternDefault = learnPatternDefault
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
                learnRule = learnPattern
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
        learnRule: Boolean
    ) {
        val url = endpoint.text.toString().trim()
        val secret = backendSecret.text.toString()

        Thread {
            try {
                val response =
                    BackendClient(url, secret).resolveReview(
                        reviewId = reviewId,
                        action = action,
                        category = category,
                        learnRule = learnRule
                    )

                runOnUiThread {
                    if (response.optBoolean("ok", false)) {
                        log("검토 결과를 서버에 저장했습니다.")
                        toast("검토 저장 완료")
                        refreshServerReviews(silent = true)
                    } else {
                        val error =
                            response.optString(
                                "error",
                                "unknown error"
                            )

                        log("검토 저장 실패: $error")
                        toast("검토 저장 실패")
                    }
                }
            } catch (e: Exception) {
                runOnUiThread {
                    log("검토 저장 실패: ${e.message}")
                    toast("검토 저장 실패")
                }
            }
        }.start()
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
        logView.text =
            "${java.time.LocalTime.now().withNano(0)}  " +
            "$text\n${logView.text}"
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
