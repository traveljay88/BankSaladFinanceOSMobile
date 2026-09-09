# 휴대폰에서 사용하는 방법

## 목표 운영 흐름

1. BankSalad 앱 → 가계부 → 설정 → 파일로 받기
2. 최근 7~14일 범위를 선택하고 이메일 전송
3. Gmail에서 BankSalad ZIP 첨부파일 열기/공유
4. `Finance OS · BankSalad` 앱 선택
5. 앱이 저장된 ZIP 비밀번호로 파일 해제 및 분석
6. 검토건이 0이면 `Finance OS에 반영`
7. Google Sheet 거래원장 + 주간 Snapshot + Import Log 갱신
8. Notion 연동을 켰다면 Weekly Snapshot도 갱신

## 최초 1회 앱 설정

앱 실행 후 다음 3가지만 입력/저장합니다.

- BankSalad ZIP 비밀번호
- Apps Script Web App URL
- APP_SECRET

이 값은 Android Keystore를 사용해 기기에서 암호화 저장됩니다.

## 검토건이 생기면

앱의 검토 큐에서 거래를 누르고:

- 재무거래유형
- 표준대분류
- 표준소분류

를 확정합니다. 해당 원본 거래의 exact correction은 휴대폰에 저장되고 다음 재분석에서 재사용됩니다.

현재 포함된 학습규칙에는 2026-09-07까지 확인한 다음 패턴이 포함되어 있습니다.

- 대출이자
- ChatGPT 29,000원
- MMCA 코끼리열차
- 삼성화재 질병보상금
- 카카오페이↔우리은행 내부이체
- 주류 키워드
- 식료품 키워드
- 가습기/가전 키워드

쿠팡이나 카카오페이처럼 원본 merchant만으로 실제 용도를 알 수 없는 거래는 안전하게 검토 큐로 보냅니다.

## 중복 방지

두 단계로 중복을 막습니다.

1. 휴대폰 로컬 처리상태: 이미 처리한 BankSalad source key 저장
2. 서버: 기존 `01_거래원장`의 중복키(AA열)를 다시 검사

따라서 같은 ZIP을 다시 열어도 동일 거래를 중복 입력하지 않습니다. Snapshot은 같은 기준일을 upsert합니다.
