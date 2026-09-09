# Google Apps Script 백엔드 1회 설정

이 백엔드는 휴대폰 앱과 기존 `Finance OS 통합 재무관리 2014-2026` Google Sheet 사이의 개인용 API입니다.
휴대폰 앱에 Google 서비스계정 비밀키를 넣지 않기 위해 사용합니다.

## 1. Apps Script 프로젝트 만들기

1. 휴대폰 또는 PC 브라우저에서 https://script.google.com/ 접속
2. `새 프로젝트` 생성
3. 기본 `Code.gs` 내용을 지우고 이 폴더의 `Code.gs` 전체를 붙여넣기
4. 프로젝트 설정에서 시간대를 `Asia/Seoul`로 설정

## 2. 스크립트 속성

Apps Script → 프로젝트 설정 → 스크립트 속성에 아래 값을 추가합니다.

필수:

- `APP_SECRET`: 본인만 아는 긴 임의 문자열(최소 32자 권장)
- `FINANCE_OS_SPREADSHEET_ID`: `1_r-t5GpVuRmNrcT7SqrWaH0yB4u4v2r19qm-AVY5tUA`

Notion까지 자동 갱신하려면 추가:

- `NOTION_TOKEN`: 본인 Notion Internal Integration secret
- `NOTION_DATA_SOURCE_ID`: `7fe4b6b5-3fe7-496e-b45c-8e557265c92d`
- `MONTHLY_INSURANCE_PREMIUM`: `153412` (보험 구성 변경 시 수정)

`APP_SECRET`와 `NOTION_TOKEN`은 앱 소스나 Google Sheet에 기록하지 않습니다.

## 3. Notion 권한

Notion 자동 갱신을 사용할 경우 Internal Integration을 만든 뒤 `Weekly Snapshot` 데이터베이스에 해당 Integration을 연결/공유해야 합니다.

## 4. 웹 앱 배포

1. Apps Script 우측 상단 `배포` → `새 배포`
2. 유형: `웹 앱`
3. 실행 사용자: `나`
4. 액세스: 링크를 가진 사용자가 호출할 수 있는 설정
5. 배포 후 `/exec`로 끝나는 웹 앱 URL 복사

이 URL과 `APP_SECRET`을 Android 앱의 설정칸에 1회 입력합니다.

## 5. 앱에서 연결 시험

앱에서 `서버 연결 확인`을 누릅니다.
정상이라면 health 응답이 성공으로 표시됩니다.

## 보안 모델

- Google Sheet 권한은 Apps Script가 사용자 계정 권한으로 실행합니다.
- Android 앱은 Google OAuth/서비스계정 키를 보관하지 않습니다.
- 앱에는 Web App URL과 APP_SECRET만 저장하며 Android Keystore로 암호화됩니다.
- 서버는 APP_SECRET이 다르면 요청을 거부합니다.
