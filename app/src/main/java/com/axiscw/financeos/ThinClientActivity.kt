package com.axiscw.financeos

import android.app.Activity
import android.os.Bundle
import android.content.Intent
import android.graphics.Typeface
import android.net.Uri
import android.text.InputType
import android.view.Gravity
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
        buildUi(); restoreSettings(); acceptIntent(intent); refreshServerReviews(silent = true)
    }

    override fun onNewIntent(intent: Intent) { super.onNewIntent(intent); acceptIntent(intent) }

    private fun buildUi() {
        val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(20), dp(18), dp(20), dp(36)) }
        val scroll = ScrollView(this).apply { addView(root) }
        root.addView(TextView(this).apply { text = "Finance OS"; textSize = 25f; setTypeface(typeface, Typeface.BOLD) })
        root.addView(TextView(this).apply { text = "파일을 서버 Finance Engine으로 전송합니다. 분류·중복·정산·원장 반영은 서버가 처리합니다."; setPadding(0, dp(6), 0, dp(18)); textSize = 14f })
        root.addView(sectionTitle("1. 파일 업로드"))
        root.addView(Button(this).apply { text = "BankSalad ZIP / XLSX / CSV 선택"; setOnClickListener { openPicker() } }, full())
        fileLabel = TextView(this).apply { text = "선택된 파일 없음"; setPadding(0, dp(6), 0, dp(6)) }
        root.addView(fileLabel)
        zipPassword = EditText(this).apply { hint = "ZIP 비밀번호 (ZIP인 경우만)"; inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD }
        root.addView(zipPassword, full())
        root.addView(Button(this).apply { text = "파일 준비"; setOnClickListener { prepareSelected() } }, full())
        uploadButton = Button(this).apply { text = "Finance OS로 업로드"; isEnabled = false; setOnClickListener { uploadPrepared() } }
        retryButton = Button(this).apply { text = "마지막 업로드 재시도"; isEnabled = false; setOnClickListener { uploadPrepared() } }
        root.addView(uploadButton, full()); root.addView(retryButton, full())
        root.addView(sectionTitle("2. 처리 결과"))
        summary = TextView(this).apply { text = "파일을 준비하면 원본 거래 수만 확인합니다."; setPadding(dp(12), dp(12), dp(12), dp(12)); setBackgroundColor(0xFFF2F2F2.toInt()) }
        root.addView(summary, full())
        root.addView(sectionTitle("3. 서버 검토 큐"))
        root.addView(Button(this).apply { text = "검토 큐 새로고침"; setOnClickListener { refreshServerReviews() } }, full())
        reviewBox = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }; root.addView(reviewBox, full())
        root.addView(sectionTitle("연결 설정"))
        endpoint = EditText(this).apply { hint = "Apps Script Web App URL"; inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI }
        backendSecret = EditText(this).apply { hint = "APP_SECRET"; inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD }
        root.addView(endpoint, full()); root.addView(backendSecret, full())
        root.addView(Button(this).apply { text = "연결 설정 저장"; setOnClickListener { saveSettings(); toast("설정을 저장했습니다.") } }, full())
        root.addView(Button(this).apply { text = "서버 연결 테스트"; setOnClickListener { testBackend() } }, full())
        root.addView(sectionTitle("실행 로그"))
        logView = TextView(this).apply { text = "대기 중"; textSize = 13f; setTextIsSelectable(true); setPadding(dp(10), dp(10), dp(10), dp(10)); setBackgroundColor(0xFFF7F7F7.toInt()) }
        root.addView(logView, full()); setContentView(scroll)
    }

    private fun restoreSettings() { zipPassword.setText(secure.get("zip_password")); endpoint.setText(secure.get("endpoint")); backendSecret.setText(secure.get("backend_secret")) }
    private fun saveSettings() { secure.put("zip_password", zipPassword.text.toString()); secure.put("endpoint", endpoint.text.toString().trim()); secure.put("backend_secret", backendSecret.text.toString()) }
    private fun openPicker() = startActivityForResult(Intent(Intent.ACTION_OPEN_DOCUMENT).apply { addCategory(Intent.CATEGORY_OPENABLE); type = "*/*"; putExtra(Intent.EXTRA_MIME_TYPES, arrayOf("application/zip", "application/octet-stream", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "text/csv")) }, requestOpen)
    @Deprecated("Deprecated in Android API; retained to avoid AndroidX dependency")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) { super.onActivityResult(requestCode, resultCode, data); if (requestCode == requestOpen && resultCode == RESULT_OK) data?.data?.let { setSelected(it) } }
    private fun acceptIntent(intent: Intent?) { (when (intent?.action) { Intent.ACTION_SEND -> intent.getParcelableExtra(Intent.EXTRA_STREAM) as? Uri; Intent.ACTION_VIEW -> intent.data; else -> null })?.let { setSelected(it) } }

    private fun setSelected(uri: Uri) {
        try { contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION) } catch (_: Exception) {}
        selectedUri = uri; selectedName = FileInput.displayName(this, uri); prepared = null; fileLabel.text = selectedName
        summary.text = "선택됨: $selectedName\n파일 준비를 누르세요."; uploadButton.isEnabled = false; retryButton.isEnabled = false; log("파일 선택: $selectedName")
    }

    private fun prepareSelected() {
        val uri = selectedUri ?: return toast("먼저 BankSalad 파일을 선택하세요.")
        saveSettings(); summary.text = "원본 거래를 준비하는 중…"; uploadButton.isEnabled = false
        Thread {
            try {
                val (input, originalName) = FileInput.materialize(this, uri, zipPassword.text.toString())
                val next = BankSaladTransactionExtractor(input, originalName).prepare(); prepared = next
                runOnUiThread { summary.text = "준비 완료\n${next.periodStart} ~ ${next.periodEnd}\n원본 거래 ${next.transactions.size}건\n분류·중복·정산·원장 반영은 서버가 처리합니다."; uploadButton.isEnabled = true; retryButton.isEnabled = true; log("원본 거래 ${next.transactions.size}건 준비 완료") }
            } catch (e: Exception) { runOnUiThread { summary.text = "파일 준비 실패"; log("준비 오류: ${e.message}"); toast(e.message ?: "파일 준비 실패") } }
        }.start()
    }

    private fun uploadPrepared() {
        val payload = prepared ?: return toast("먼저 파일을 준비하세요.")
        saveSettings(); val url = endpoint.text.toString().trim(); val secret = backendSecret.text.toString()
        if (url.isBlank() || secret.isBlank()) return toast("Apps Script URL과 APP_SECRET을 설정하세요.")
        uploadButton.isEnabled = false; retryButton.isEnabled = false; summary.text = "서버 처리 중…"
        Thread {
            try { val response = BackendClient(url, secret).engineImport(payload); runOnUiThread { secure.put("last_analysis_id", response.optString("analysisId")); renderImportResult(response); retryButton.isEnabled = true; refreshServerReviews(silent = true) } }
            catch (e: Exception) { runOnUiThread { summary.text = "업로드 실패\n다시 시도할 수 있습니다."; retryButton.isEnabled = true; log("업로드 오류: ${e.message}"); toast("업로드 실패") } }
        }.start()
    }

    private fun renderImportResult(response: JSONObject) {
        val s = response.optJSONObject("summary") ?: JSONObject()
        summary.text = "서버 처리 결과 · ${response.optString("status", "SUCCESS")}\n전체 ${s.optInt("total")} · 자동 입력 ${s.optInt("inserted")} · 중복 ${s.optInt("duplicates")}\n제외 ${s.optInt("excluded")} · 정산 ${s.optInt("settlementMatched")} · 검토 ${s.optInt("reviewRequired")}\nEngine ${response.optString("engineVersion", "-")}" + if (s.optInt("failed") > 0) "\n일부 실패 ${s.optInt("failed")}건" else ""
        log("서버 처리 완료: 입력 ${s.optInt("inserted")} / 검토 ${s.optInt("reviewRequired")}")
    }

    private fun refreshServerReviews(silent: Boolean = false) {
        val url = endpoint.text.toString().trim(); val secret = backendSecret.text.toString(); val analysisId = secure.get("last_analysis_id")
        if (url.isBlank() || secret.isBlank() || analysisId.isBlank()) return; Thread { try { val items = BackendClient(url, secret).reviews(analysisId).optJSONArray("items") ?: JSONArray(); runOnUiThread { renderServerReviews(items); if (!silent) log("서버 검토 ${items.length()}건을 불러왔습니다.") } } catch (e: Exception) { if (!silent) runOnUiThread { log("검토 큐 조회 실패: ${e.message}"); toast("검토 큐 조회 실패") } } }.start()
    }

    private fun renderServerReviews(items: JSONArray) {
        reviewBox.removeAllViews()
        if (items.length() == 0) { reviewBox.addView(TextView(this).apply { text = "서버 검토 필요 거래 없음"; setPadding(0, dp(4), 0, dp(6)) }); return }
        for (i in 0 until items.length()) {
            val item = items.getJSONObject(i); val tx = item.getJSONObject("transaction")
            reviewBox.addView(TextView(this).apply { text = "[${item.optString("reviewType")}] ${tx.optString("date")} · ${tx.optString("merchant")} · ${money(tx.optLong("signedAmount"))}원\n${item.optString("reason")}"; setTypeface(typeface, Typeface.BOLD); setPadding(0, dp(10), 0, dp(4)) }, full())
            val learn = CheckBox(this).apply { text = "같은 가맹점에 적용"; visibility = if (item.optString("reviewType") == "CATEGORY") android.view.View.VISIBLE else android.view.View.GONE }; reviewBox.addView(learn, full())
            val suggestions = item.optJSONArray("suggestions") ?: JSONArray()
            for (j in 0 until suggestions.length()) { val suggestion = suggestions.getJSONObject(j); reviewBox.addView(Button(this).apply { isAllCaps = false; gravity = Gravity.START or Gravity.CENTER_VERTICAL; text = suggestion.optString("label", suggestion.optString("action")); setOnClickListener { resolveServerReview(item.optString("id"), suggestion, learn.isChecked) } }, full()) }
        }
    }

    private fun resolveServerReview(reviewId: String, suggestion: JSONObject, learnRule: Boolean) {
        val url = endpoint.text.toString().trim(); val secret = backendSecret.text.toString()
        Thread { try { BackendClient(url, secret).resolveReview(reviewId, suggestion.optString("action"), suggestion.optJSONObject("category"), learnRule); runOnUiThread { log("검토 결과를 서버에 저장했습니다."); refreshServerReviews(silent = true) } } catch (e: Exception) { runOnUiThread { log("검토 저장 실패: ${e.message}"); toast("검토 저장 실패") } } }.start()
    }

    private fun testBackend() {
        saveSettings(); val url = endpoint.text.toString().trim(); val secret = backendSecret.text.toString(); if (url.isBlank() || secret.isBlank()) return toast("Apps Script URL과 APP_SECRET을 설정하세요.")
        Thread { try { val response = BackendClient(url, secret).health(); runOnUiThread { log("서버 연결 성공: ${response.optString("message", "OK")} · ${response.optString("backendVersion", "?")}"); toast("서버 연결 성공") } } catch (e: Exception) { runOnUiThread { log("서버 연결 실패: ${e.message}"); toast("서버 연결 실패") } } }.start()
    }

    private fun sectionTitle(text: String) = TextView(this).apply { this.text = text; textSize = 18f; setTypeface(typeface, Typeface.BOLD); setPadding(0, dp(22), 0, dp(8)) }
    private fun full() = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { bottomMargin = dp(8) }
    private fun money(value: Long) = NumberFormat.getNumberInstance(Locale.KOREA).format(kotlin.math.abs(value))
    private fun log(text: String) { logView.text = "${java.time.LocalTime.now().withNano(0)}  $text\n${logView.text}" }
    private fun toast(text: String) = Toast.makeText(this, text, Toast.LENGTH_SHORT).show()
    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()
}
