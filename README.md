# Finance OS · BankSalad Android

BankSalad Excel export를 안드로이드 휴대폰에서 직접 분석하고 기존 Finance OS Google Sheet 및 Notion Weekly Snapshot에 반영하기 위한 개인용 Android 앱 프로젝트입니다.

## 현재 구현된 기능

- Gmail/Files에서 ZIP 또는 XLSX를 `공유`/`열기`로 앱에 전달
- BankSalad 암호 ZIP 해제
- `뱅샐현황` / `가계부 내역` OOXML 직접 파싱
- PC Finance OS와 동일한 source-key 생성
- 중복 제거
- ±2초 동일금액 내부이체 페어링
- 계정 별칭/분류 규칙
- 사용자 보정 학습규칙
- 마이너스통장 음수자산 이중계상 제거
- 자산/부채/가용현금/고금리부채/순자산 Snapshot 계산
- 앱 내 검토 큐 및 수동 확정
- Android Keystore 보안 저장
- Apps Script 백엔드를 통한 Google Sheets 반영
- 선택적 Notion Weekly Snapshot 생성/갱신
- 서버측 중복키 재검사

## 기준 기술

- Android: compile/target SDK 37, min SDK 26
- Android Gradle Plugin 9.4.0
- Gradle 9.6.0
- ZIP: zip4j 2.11.6
- Backend: Google Apps Script

## 빌드

### Android Studio

프로젝트 폴더를 Android Studio로 열고 `Build > Build APK(s)`를 실행합니다.

### PC 없이 GitHub에서 APK 빌드

`.github/workflows/build-apk.yml`이 포함되어 있습니다.

1. 이 프로젝트를 GitHub 저장소에 업로드
2. GitHub 앱/모바일 브라우저에서 `Actions`
3. `Build Android APK` 선택
4. `Run workflow`
5. 완료 후 `FinanceOS-BankSalad-debug-apk` artifact의 `app-debug.apk`를 내려받아 설치

GitHub 호스팅 러너가 Android SDK/Gradle을 사용해 APK를 빌드하므로 로컬 PC에 Android Studio가 없어도 됩니다.

## 백엔드

`backend/SETUP.md` 참고.

## 실제 설치 전 확인사항

이 프로젝트의 Kotlin 파서 source-key는 실제 `2026-08-31~2026-09-07.xlsx`를 대상으로 기존 Python 자동화와 동일한 값이 생성되는 것을 확인했습니다. Kotlin 전체 소스와 Apps Script는 정적 컴파일/문법 검사를 통과했습니다.

현재 작업 환경에는 Android SDK 전체 빌드 체인이 없어 여기서 실 APK까지 컴파일/기기 설치 테스트하지는 못했습니다. GitHub Actions 또는 Android Studio의 실제 Android SDK 빌드를 한 번 통과시킨 뒤 기기에 설치하는 단계가 필요합니다.
