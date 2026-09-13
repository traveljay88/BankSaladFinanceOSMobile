package com.financeos.banksalad

import android.app.AlertDialog
import android.content.Context
import android.view.View
import android.widget.ArrayAdapter
import android.widget.CheckBox
import android.widget.LinearLayout
import android.widget.Spinner
import android.widget.TextView

/**
 * Finance OS review dialog v2.
 * Replaces free-text classification inputs with dependent selectors.
 * Integration point: call ReviewUiV2.show(...) instead of building EditText fields.
 */
object ReviewUiV2 {
    data class Classification(
        val type: String,
        val major: String,
        val minor: String,
        val confidence: Int = 0,
        val reason: String = ""
    )

    private val taxonomy = linkedMapOf(
        "정산" to listOf("SOHO", "SOHO 선결제", "SOHO 정산회수", "일반 선결제", "일반 정산회수"),
        "식비" to listOf("간식", "배달", "외식", "장보기·집밥재료", "커피·음료", "회사 구내식당"),
        "술·사교" to listOf("술·유흥"),
        "교통·차량" to listOf("기타교통", "대중교통", "수리·정비", "자동차보험", "주유", "주차", "택시", "통행료", "대리운전", "공유모빌리티", "과태료·범칙금"),
        "주거·공과금" to listOf("공과금", "관리비", "이동통신", "주거비"),
        "의료·건강" to listOf("건강관리", "병원·약국"),
        "의복·미용" to listOf("미용", "세탁·수선", "의류·잡화"),
        "여행·여가·문화" to listOf("문화·오락", "여행·숙박", "운동·레저", "현금 여행경비", "항공", "여행 기타·혼합", "여행 예약·패키지", "비자·입국", "도박손실"),
        "생활용품" to listOf("가구·가전", "생활서비스·구독", "잡화·소모품"),
        "교육·자기계발" to listOf("교육·수강", "도서·교재"),
        "관계·경조사" to listOf("경조사", "기부", "기타 관계지출", "데이트 비용", "모임회비", "선물", "연인 지원"),
        "금융비용" to listOf("대출이자", "금융수수료"),
        "보험" to listOf("보험료"),
        "세금" to listOf("과태료·벌금", "세금·공과"),
        "소득" to listOf("N잡", "겜블", "급여", "기타", "기타수입·지원금", "상여·성과급", "여비", "용돈", "월세", "이자·배당", "퇴직급여"),
        "자산이동" to listOf("계좌 간 이체", "선불충전", "저축·예치", "카드대금결제", "투자계좌입금", "기타 자산이동", "개인대여금", "투자계좌간이체", "투자계좌출금", "운영계좌간이체", "주식공제", "급여실입금"),
        "부채증가" to listOf("대출실행", "대출실행·투자원금", "임대보증금"),
        "부채상환" to listOf("대출원금상환"),
        "부채이동" to listOf("대환·부채간이동", "일시차입·반환", "자산회수·부채상환", "투자회수·부채상환"),
        "자산취득·처분" to listOf("자산처분대금", "금융자산취득", "기타자산취득", "보증금", "부동산취득", "사업투자자산", "차량취득"),
        "기타유입·유출" to listOf("기타잔액조정", "부채잔액조정", "자산잔액조정", "자산평가감소", "자산평가증가", "실현투자손익", "환불·캐시백", "환불·원거래미확인", "보험금·보상금"),
        "기타 생활비" to listOf("기타", "사용처 검증 필요", "출장비", "미매칭 정산조정")
    )

    private val typeByMajor = mapOf(
        "정산" to "정산", "소득" to "소득", "금융비용" to "금융비용",
        "자산이동" to "자산이동", "부채증가" to "부채증가", "부채상환" to "부채상환",
        "부채이동" to "부채이동", "자산취득·처분" to "자산취득·처분", "기타유입·유출" to "기타유입·유출"
    )

    fun show(
        context: Context,
        transactionTitle: String,
        suggested: Classification,
        alternatives: List<Classification> = emptyList(),
        onConfirm: (Classification, learnPattern: Boolean) -> Unit
    ) {
        val pad = (16 * context.resources.displayMetrics.density).toInt()
        val box = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(pad, pad / 2, pad, 0)
        }
        box.addView(TextView(context).apply {
            text = buildString {
                append("추천: ${suggested.major} > ${suggested.minor}")
                if (suggested.confidence > 0) append("  (${suggested.confidence}%)")
                if (suggested.reason.isNotBlank()) append("\n${suggested.reason}")
            }
        })

        val majorSpinner = Spinner(context)
        val minorSpinner = Spinner(context)
        val majors = taxonomy.keys.toList()
        majorSpinner.adapter = ArrayAdapter(context, android.R.layout.simple_spinner_dropdown_item, majors)
        box.addView(majorSpinner)
        box.addView(minorSpinner)

        fun loadMinors(major: String, selected: String? = null) {
            val minors = taxonomy[major].orEmpty()
            minorSpinner.adapter = ArrayAdapter(context, android.R.layout.simple_spinner_dropdown_item, minors)
            val pos = minors.indexOf(selected).takeIf { it >= 0 } ?: 0
            if (minors.isNotEmpty()) minorSpinner.setSelection(pos)
        }

        majorSpinner.onItemSelectedListener = SimpleItemSelectedListener { pos ->
            val major = majors[pos]
            loadMinors(major, if (major == suggested.major) suggested.minor else null)
        }
        val majorPos = majors.indexOf(suggested.major).takeIf { it >= 0 } ?: 0
        majorSpinner.setSelection(majorPos)
        loadMinors(majors[majorPos], suggested.minor)

        if (alternatives.isNotEmpty()) {
            box.addView(TextView(context).apply {
                text = "다른 후보: " + alternatives.take(3).joinToString(" · ") { "${it.major}>${it.minor}" }
            })
        }

        val learn = CheckBox(context).apply {
            text = "앞으로 동일 패턴 자동 적용"
            isChecked = true
        }
        box.addView(learn)

        AlertDialog.Builder(context)
            .setTitle("거래 분류 확정")
            .setMessage(transactionTitle)
            .setView(box)
            .setNegativeButton("취소", null)
            .setPositiveButton("확정") { _, _ ->
                val major = majorSpinner.selectedItem?.toString().orEmpty()
                val minor = minorSpinner.selectedItem?.toString().orEmpty()
                val type = typeByMajor[major] ?: "소비지출"
                onConfirm(Classification(type, major, minor, 100, "사용자 확정"), learn.isChecked)
            }
            .show()
    }

    private class SimpleItemSelectedListener(val action: (Int) -> Unit) : android.widget.AdapterView.OnItemSelectedListener {
        override fun onItemSelected(parent: android.widget.AdapterView<*>?, view: View?, position: Int, id: Long) = action(position)
        override fun onNothingSelected(parent: android.widget.AdapterView<*>?) = Unit
    }
}

