package com.axiscw.financeos

import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.graphics.Typeface
import android.net.Uri
import android.os.Bundle
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.widget.*
import org.json.JSONObject
import java.text.NumberFormat
import java.util.Locale

class MainActivity : Activity() {
    private val requestOpen = 1001
    private lateinit var secure: SecureStore
    private lateinit var state: StateStore

    private var selectedUri: Uri? = null
    private var selectedName: String = ""
    private var current: AnalysisResult? = null

    private lateinit var fileLabel: TextView
    private lateinit var zipPassword: EditText
    private lateinit var endpoint: EditText
    private lateinit var backendSecret: EditText
    private lateinit var summary: TextView
    private lateinit var reviewBox: LinearLayout
    private lateinit var sendButton: Button
    private lateinit var logView: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        secure = SecureStore(this)
        state = StateStore(this)
        buildUi()
        restoreSettings()
        acceptIntent(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        acceptIntent(intent)
    }

    private fun buildUi() {
        val scroll = ScrollView(this)
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(18), dp(20), dp(36))
        }
        scroll.addView(root)

        root.addView(TextView(this).apply {
            text = "Finance OS · BankSalad"
            textSize = 25f
            setTypeface(typeface, Typeface.BOLD)
        })
        root.addView(TextView(this).apply {
            text = "휴대폰에서 BankSalad ZIP/XLSX를 분석하고 Finance OS에 반영합니다. Gmail 첨부파일에서 이 앱으로 공유해도 됩니다."
            textSize = 14f
            setPadding(0, dp(6), 0, dp(18))
        })

        root.addView(sectionTitle("1. BankSalad 파일"))
        root.addView(Button(this).apply {
            text = "ZIP / XLSX 선택"
            setOnClickListener { openPicker() }
        }, full())
        fileLabel = TextView(this).apply { text = "선택된 파일 없음"; setPadding(0, dp(8), 0, dp(8)) }
        root.addView(fileLabel)
        zipPassword = EditText(this).apply {
            hint = "BankSalad ZIP 비밀번호"
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
        }
        root.addView(zipPassword, full())
        root.addView(Button(this).apply {
            text = "분석"
            setOnClickListener { analyzeSelected() }
        }, full())

        root.addView(sectionTitle("2. 분석 결과"))
        summary = TextView(this).apply {
            text = "파일을 분석하면 거래·부채·가용현금·검토건이 표시됩니다."
            textSize = 15f
            setPadding(dp(12), dp(12), dp(12), dp(12))
            setBackgroundColor(0xFFF2F2F2.toInt())
        }
        root.addView(summary, full())

        root.addView(sectionTitle("3. 검토 큐"))
        reviewBox = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        root.addView(reviewBox, full())

        root.addView(sectionTitle("4. Finance OS 연결"))
        endpoint = EditText(this).apply {
            hint = "Google Apps Script Web App URL"
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI
        }
        backendSecret = EditText(this).apply {
            hint = "APP_SECRET"
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
        }
        root.addView(endpoint, full())
        root.addView(backendSecret, full())
        root.addView(Button(this).apply {
            text = "연결 설정 저장"
            setOnClickListener { saveSettings(); toast("설정을 저장했습니다.") }
        }, full())
        root.addView(Button(this).apply {
            text = "서버 연결 테스트"
            setOnClickListener { testBackend() }
        }, full())
        sendButton = Button(this).apply {
            text = "Finance OS에 반영"
            isEnabled = false
            setOnClickListener { sendToFinanceOs() }
        }
        root.addView(sendButton, full())

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

    private fun sectionTitle(text: String) = TextView(this).apply {
        this.text = text
        textSize = 18f
        setTypeface(typeface, Typeface.BOLD)
        setPadding(0, dp(22), 0, dp(8))
    }

    private fun full() = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
        bottomMargin = dp(8)
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

    private fun openPicker() {
        val i = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = "*/*"
            putExtra(Intent.EXTRA_MIME_TYPES, arrayOf(
                "application/zip",
                "application/octet-stream",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            ))
        }
        startActivityForResult(i, requestOpen)
    }

    @Deprecated("Deprecated in Android API; retained to avoid AndroidX dependency")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == requestOpen && resultCode == RESULT_OK) {
            data?.data?.let { setSelected(it) }
        }
    }

    private fun acceptIntent(intent: Intent?) {
        if (intent == null) return
        val uri: Uri? = when (intent.action) {
            Intent.ACTION_SEND -> intent.getParcelableExtra(Intent.EXTRA_STREAM) as? Uri
            Intent.ACTION_VIEW -> intent.data
            else -> null
        }
        if (uri != null) setSelected(uri)
    }

    private fun setSelected(uri: Uri) {
        selectedUri = uri
        selectedName = FileInput.displayName(this, uri)
        fileLabel.text = selectedName
        current = null
        reviewBox.removeAllViews()
        summary.text = "선택됨: $selectedName\n'분석'을 누르세요."
        sendButton.isEnabled = false
        log("파일 선택: $selectedName")
    }

    private fun analyzeSelected() {
        val uri = selectedUri ?: return toast("먼저 BankSalad ZIP/XLSX를 선택하세요.")
        saveSettings()
        summary.text = "분석 중…"
        reviewBox.removeAllViews()
        sendButton.isEnabled = false
        Thread {
            try {
                val (xlsx, originalName) = FileInput.materialize(this, uri, zipPassword.text.toString())
                val cfg = AppConfig.load(this, state)
                val result = FinancePipeline(cfg, xlsx, originalName).analyze(state.processedKeys())
                current = result
                runOnUiThread {
                    renderResult(result)
                    log("분석 완료: ${result.transactionRowsRead}건 읽음 / 앱 중복 ${result.localSkipped}건 / 신규 ${result.ledgerRows.size}건")
                }
            } catch (e: Exception) {
                runOnUiThread { summary.text = "분석 실패"; log("오류: ${e.message}"); toast(e.message ?: "분석 실패") }
            }
        }.start()
    }

    private fun renderResult(r: AnalysisResult) {
        val nf = NumberFormat.getNumberInstance(Locale.KOREA)
        summary.text = buildString {
            append("기간  ${r.periodStart} ~ ${r.periodEnd}\n")
            append("원본  ${r.transactionRowsRead}건  ·  앱 중복 ${r.localSkipped}건  ·  신규 ${r.ledgerRows.size}건\n")
            append("상태  확정 ${r.confirmedRows.size}  /  검토 ${r.reviewRows.size}  /  잠정 ${r.provisionalRows.size}\n\n")
            append("소비지출  ${nf.format(r.recognizedSpend())}원\n")
            append("대출이자  ${nf.format(r.recognizedInterest())}원\n")
            append("총부채  ${nf.format(r.metrics.totalLiabilities)}원\n")
            append("가용현금  ${nf.format(r.metrics.availableOverdraft)}원\n")
            append("7%+ 부채  ${nf.format(r.metrics.highRateLiabilities)}원\n")
            append("Finance OS 순자산  ${nf.format(r.metrics.financeOsNetWorth)}원\n")
            append("Snapshot 미매핑 계정  ${r.metrics.unmappedSnapshotAccounts}개")
        }
        renderReviews(r)
        sendButton.isEnabled = r.reviewRows.isEmpty() && r.snapshotRows.isNotEmpty()
    }

    private fun renderReviews(r: AnalysisResult) {
        reviewBox.removeAllViews()
        val reviews = r.reviewRows
        if (reviews.isEmpty()) {
            reviewBox.addView(TextView(this).apply { text = "검토 필요 거래 없음"; setPadding(0, dp(4), 0, dp(6)) })
            return
        }
        reviews.forEach { row ->
            val b = Button(this).apply {
                isAllCaps = false
                gravity = Gravity.START or Gravity.CENTER_VERTICAL
                text = "${row.values["거래일"]} · ${row.values["거래명"]} · ${formatMoney(row.amount)}원\n${row.values["대분류"]} / ${row.values["소분류"]}"
                setOnClickListener { correctionDialog(r, row) }
            }
            reviewBox.addView(b, full())
        }
    }

    private fun correctionDialog(result: AnalysisResult, row: LedgerRow) {
        val box = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(18), dp(6), dp(18), 0) }
        val typeSpinner = Spinner(this)
        val types = arrayOf("소비지출", "자산이동", "금융비용", "기타유입·유출", "소득")
        typeSpinner.adapter = ArrayAdapter(this, android.R.layout.simple_spinner_dropdown_item, types)
        val currentType = row.values["재무거래유형"]?.toString()
        typeSpinner.setSelection(types.indexOf(currentType).coerceAtLeast(0))
        val major = EditText(this).apply { hint = "대분류"; setText(row.values["대분류"]?.toString().orEmpty()) }
        val minor = EditText(this).apply { hint = "소분류"; setText(row.values["소분류"]?.toString().orEmpty()) }
        box.addView(TextView(this).apply { text = "${row.values["거래명"]} · ${formatMoney(row.amount)}원"; setTypeface(typeface, Typeface.BOLD) })
        box.addView(typeSpinner, full()); box.addView(major, full()); box.addView(minor, full())
        AlertDialog.Builder(this)
            .setTitle("거래 분류 확정")
            .setView(box)
            .setNegativeButton("취소", null)
            .setPositiveButton("확정") { _, _ ->
                val type = typeSpinner.selectedItem.toString()
                val maj = major.text.toString().trim()
                val min = minor.text.toString().trim()
                if (maj.isBlank() || min.isBlank()) return@setPositiveButton
                FinancePipeline.applyManualCorrection(row, type, maj, min)
                state.saveLocalCorrection(row.sourceKey, FinancePipeline.correctionAction(type, maj, min, row.accountKind, row.amount))
                renderResult(result)
                log("사용자 확정: ${row.values["거래명"]} → $maj / $min")
            }.show()
    }

    private fun testBackend() {
        saveSettings()
        val url = endpoint.text.toString().trim(); val secret = backendSecret.text.toString()
        if (url.isBlank()) return toast("Apps Script URL을 입력하세요.")
        log("서버 연결 확인 중…")
        Thread {
            try {
                val res = BackendClient(url, secret).health()
                runOnUiThread { log("서버 연결 성공: ${res.optString("message", "OK")}"); toast("Finance OS 서버 연결 성공") }
            } catch (e: Exception) {
                runOnUiThread { log("서버 연결 실패: ${e.message}"); toast("서버 연결 실패") }
            }
        }.start()
    }

    private fun sendToFinanceOs() {
        val result = current ?: return toast("먼저 분석하세요.")
        if (result.reviewRows.isNotEmpty()) return toast("검토 필요 거래를 먼저 확정하세요.")
        saveSettings()
        val url = endpoint.text.toString().trim(); val secret = backendSecret.text.toString()
        if (url.isBlank() || secret.isBlank()) return toast("Apps Script URL과 APP_SECRET을 설정하세요.")
        sendButton.isEnabled = false
        log("Finance OS 반영 중…")
        Thread {
            try {
                val res = BackendClient(url, secret).import(result)
                state.markProcessed(result.allSourceKeys)
                val inserted = res.optInt("ledgerInserted", 0)
                val serverSkipped = res.optInt("ledgerSkipped", 0)
                val notion = res.optString("notion", "not-configured")
                runOnUiThread {
                    log("반영 완료: 거래 신규 ${inserted}건 / 서버 중복 ${serverSkipped}건 / Notion $notion")
                    toast("Finance OS 반영 완료")
                    sendButton.isEnabled = false
                }
            } catch (e: Exception) {
                runOnUiThread { log("반영 실패: ${e.message}"); toast("반영 실패"); sendButton.isEnabled = true }
            }
        }.start()
    }

    private fun formatMoney(v: Long) = NumberFormat.getNumberInstance(Locale.KOREA).format(v)
    private fun log(text: String) { logView.text = "${java.time.LocalTime.now().withNano(0)}  $text\n${logView.text}" }
    private fun toast(text: String) = Toast.makeText(this, text, Toast.LENGTH_SHORT).show()
    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()
}
