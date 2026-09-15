package com.axiscw.financeos

import android.app.AlertDialog
import android.content.Context
import android.view.View
import android.widget.AdapterView
import android.widget.ArrayAdapter
import android.widget.CheckBox
import android.widget.LinearLayout
import android.widget.Spinner
import android.widget.TextView
import android.widget.Toast

/**
 * Finance OS review dialog v3.
 *
 * Key differences from v2:
 * - server-driven type > major > minor selectors
 * - incomplete recommendation is never confirmable as a recommendation
 * - no free-text classification
 * - payload always contains type / major / minor
 * - learning checkbox can be hidden for per-transaction merchants such as Coupang
 *
 * Pass uiSchema.standardCategories from the server as taxonomy.
 */
object ReviewUiV3 {
    data class CategoryOption(
        val type: String,
        val major: String,
        val minor: String
    )

    data class Classification(
        val type: String = "",
        val major: String = "",
        val minor: String = "",
        val confidence: Int = 0,
        val reason: String = ""
    ) {
        fun isComplete() = type.isNotBlank() && major.isNotBlank() && minor.isNotBlank()
    }

    fun show(
        context: Context,
        transactionTitle: String,
        suggested: Classification?,
        taxonomy: List<CategoryOption>,
        learnPatternDefault: Boolean = true,
        showLearnPattern: Boolean = true,
        onConfirm: (Classification, learnPattern: Boolean) -> Unit
    ) {
        require(taxonomy.isNotEmpty()) { "standardCategories taxonomy is empty" }

        val pad = (16 * context.resources.displayMetrics.density).toInt()
        val box = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(pad, pad / 2, pad, 0)
        }

        val suggestionText = TextView(context).apply {
            text = if (suggested?.isComplete() == true) {
                buildString {
                    append("추천: ${suggested.type} > ${suggested.major} > ${suggested.minor}")
                    if (suggested.confidence > 0) append("  (${suggested.confidence}%)")
                    if (suggested.reason.isNotBlank()) append("\n${suggested.reason}")
                }
            } else {
                "추천 없음 · 분류 선택 필요"
            }
        }
        box.addView(suggestionText)

        val typeSpinner = Spinner(context)
        val majorSpinner = Spinner(context)
        val minorSpinner = Spinner(context)
        box.addView(typeSpinner)
        box.addView(majorSpinner)
        box.addView(minorSpinner)

        val types = taxonomy.map { it.type }.filter { it.isNotBlank() }.distinct()
        typeSpinner.adapter = ArrayAdapter(context, android.R.layout.simple_spinner_dropdown_item, types)

        fun majorsFor(type: String): List<String> =
            taxonomy.filter { it.type == type }.map { it.major }.filter { it.isNotBlank() }.distinct()

        fun minorsFor(type: String, major: String): List<String> =
            taxonomy.filter { it.type == type && it.major == major }
                .map { it.minor }.filter { it.isNotBlank() }.distinct()

        fun loadMinors(type: String, major: String, preferred: String? = null) {
            val minors = minorsFor(type, major)
            minorSpinner.adapter = ArrayAdapter(context, android.R.layout.simple_spinner_dropdown_item, minors)
            val selected = minors.indexOf(preferred).takeIf { it >= 0 } ?: 0
            if (minors.isNotEmpty()) minorSpinner.setSelection(selected)
        }

        fun loadMajors(type: String, preferredMajor: String? = null, preferredMinor: String? = null) {
            val majors = majorsFor(type)
            majorSpinner.adapter = ArrayAdapter(context, android.R.layout.simple_spinner_dropdown_item, majors)
            val selected = majors.indexOf(preferredMajor).takeIf { it >= 0 } ?: 0
            if (majors.isNotEmpty()) {
                majorSpinner.setSelection(selected)
                loadMinors(type, majors[selected], preferredMinor)
            }
        }

        typeSpinner.onItemSelectedListener = listener { typePos ->
            val type = types[typePos]
            val prefer = suggested?.takeIf { it.type == type }
            loadMajors(type, prefer?.major, prefer?.minor)
        }

        majorSpinner.onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
            override fun onItemSelected(parent: AdapterView<*>?, view: View?, position: Int, id: Long) {
                val type = typeSpinner.selectedItem?.toString().orEmpty()
                val major = majorSpinner.selectedItem?.toString().orEmpty()
                val preferredMinor = suggested?.takeIf { it.type == type && it.major == major }?.minor
                loadMinors(type, major, preferredMinor)
            }
            override fun onNothingSelected(parent: AdapterView<*>?) = Unit
        }

        val initialTypePos = types.indexOf(suggested?.type).takeIf { it >= 0 } ?: 0
        if (types.isNotEmpty()) {
            typeSpinner.setSelection(initialTypePos)
            val initialType = types[initialTypePos]
            val prefer = suggested?.takeIf { it.type == initialType }
            loadMajors(initialType, prefer?.major, prefer?.minor)
        }

        val learn = CheckBox(context).apply {
            text = "같은 패턴에 자동 적용"
            isChecked = showLearnPattern && learnPatternDefault
            visibility = if (showLearnPattern) View.VISIBLE else View.GONE
        }
        box.addView(learn)

        val dialog = AlertDialog.Builder(context)
            .setTitle("거래 분류 확정")
            .setMessage(transactionTitle)
            .setView(box)
            .setNegativeButton("취소", null)
            .setPositiveButton("이 분류로 확정", null)
            .create()

        dialog.setOnShowListener {
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
                val selected = Classification(
                    type = typeSpinner.selectedItem?.toString().orEmpty(),
                    major = majorSpinner.selectedItem?.toString().orEmpty(),
                    minor = minorSpinner.selectedItem?.toString().orEmpty(),
                    confidence = 100,
                    reason = "사용자 확정"
                )
                if (!selected.isComplete()) {
                    Toast.makeText(context, "type / major / minor를 모두 선택하세요.", Toast.LENGTH_SHORT).show()
                    return@setOnClickListener
                }
                onConfirm(selected, showLearnPattern && learn.isChecked)
                dialog.dismiss()
            }
        }

        dialog.show()
    }

    private fun listener(action: (Int) -> Unit) = object : AdapterView.OnItemSelectedListener {
        override fun onItemSelected(parent: AdapterView<*>?, view: View?, position: Int, id: Long) = action(position)
        override fun onNothingSelected(parent: AdapterView<*>?) = Unit
    }
}
