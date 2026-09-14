# BankSaladFinanceOSMobile v0.3.0

BankSalad ZIP/XLSX를 Android에서 직접 파싱해 Finance OS 거래원장·Weekly Snapshot으로 보내는 개인용 앱입니다.

## 핵심 구조

`BankSalad ZIP/XLSX/CSV → Android 원본 행 추출 → Apps Script Finance Engine → Google Sheets / Review Queue`

v0.4 Android는 파일 선택·암호 ZIP 해제·원본 거래 행 추출·HTTPS 전송·결과/검토 표시만 수행합니다. 분류, 중복 제거, 정산, 학습 규칙, 원장 매핑은 Apps Script가 처리합니다.

## Apps Script API 계약

배포된 Apps Script는 다음 action을 제공해야 합니다. 이 저장소의 Android 변경은 서버 코드를 자동 배포하거나 변경하지 않습니다.

- `engine_import`: `sourceFile`, `sourceHash`, `requestId`, `transactions`를 받아 처리 결과와 summary 반환
- `reviews`: 미처리 서버 Review Queue 반환
- `review_resolve`: 서버 검토 선택과 선택적 `learnRule` 저장

## v0.3.0 핵심

- Finance Policy **2.0.0** 내장 (`app/src/main/assets/finance_policy.json`)
- Notion의 최신 Finance OS 의사결정 원칙을 회계/유동성/소비/부채/투자/정산/가족자본 규칙으로 통합
- 검토 필요와 잠정을 모두 사람이 확인해야 전송 가능
- Apps Script도 미확정 거래를 서버에서 재차 차단
- 사용자 보정은 `user_corrections.json`과 휴대폰 로컬 보정으로 누적
- Android: compile/target SDK 36, min SDK 26

정책 상세는 `FINANCE_POLICY.md`, 변경점은 `CHANGELOG.md`를 참고하세요.

## 보안

- BankSalad ZIP 비밀번호와 APP_SECRET은 Android Keystore 기반 저장소를 사용합니다.
- Google/Notion 장기 토큰은 APK에 포함하지 않습니다.
- Apps Script 서버 비밀값은 Script Properties에 저장합니다.

## 중요

이 앱은 Finance OS 원장의 자동 입력/분류 도구입니다. BankSalad 원본만으로 30일 미래 현금흐름이나 카드·세금·보험의 모든 예정 지급을 확정할 수 없으므로, 투자 게이트는 파일 하나만으로 자동 개방하지 않습니다.
