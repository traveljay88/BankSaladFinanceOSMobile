# Changelog

## v0.3.0 — Finance Policy Engine (2026-09-09)

- Notion 최신 Finance 원칙을 `finance_policy.json`/`FinancePolicy.kt`로 통합.
- 현재 소비 기준을 생활 200만원 + 선택 50만원으로 갱신; 과거 230/250 규칙 비활성화.
- 경기지역화폐를 충전=자산이동, 가맹점 사용=소비, 캐시백=혜택유입으로 갱신.
- 보험금·보상금의 `recognize_income=true` 오류 수정 → 소득인식 0.
- 카드대금, 대출원금, 대출실행, 환불/캐시백, 가족자본, 정산, 투자 입출금의 회계 의미 확장.
- 불명확한 일반 `수입`은 자동확정 대신 잠정 처리.
- `검토 필요 + 잠정` 모두 UI 검토 큐에 노출.
- 검토/잠정이 하나라도 남으면 앱 전송 버튼과 Apps Script 서버 양쪽에서 import 차단.
- 2026-09-09 네이버 프리미엄콘텐츠 100원 → 교육·자기계발/교육·수강 확정 규칙 추가.
- 2026-09-07 야근 외식 정산송금 400원/8,100원 exact correction 추가.
- 정책 모드/투자 게이트/유동성 경고를 분석 화면에 표시.
- Apps Script health response에 backend/policy version 추가 및 Notion 검증메모에 정책버전 기록.
- Android compile/target SDK 36으로 통일.
