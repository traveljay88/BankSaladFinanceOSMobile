# Apps Script Backend v0.3.0

## 업데이트

기존 Apps Script 프로젝트의 `Code.gs`를 이 폴더의 최신 `Code.gs` 전체 내용으로 교체하고 저장합니다.

`배포 → 배포 관리 → 편집(연필) → 버전: 새 버전 → 배포`

기존 `/exec` URL은 같은 배포를 새 버전으로 갱신하면 유지할 수 있습니다.

## Script Properties

필수:
- `APP_SECRET` — 24자 이상
- `FINANCE_OS_SPREADSHEET_ID` — Finance OS Google Sheet ID

Notion 자동 갱신 사용 시:
- `NOTION_TOKEN`
- `NOTION_DATA_SOURCE_ID` (기본값이 코드에 있음)
- `MONTHLY_INSURANCE_PREMIUM` (선택)

## v0.3 안전장치

- `reviewCount > 0` 또는 `provisionalCount > 0`이면 서버가 import 자체를 거절합니다.
- 중복키는 `01_거래원장` AA열 기준으로 다시 확인합니다.
- Weekly Snapshot은 기준일 기준 upsert합니다.
