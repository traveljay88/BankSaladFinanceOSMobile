# v0.3.0 Test Report

Test date: 2026-09-09

## Static checks

- `config.json`, `user_corrections.json`, `finance_policy.json`, `initial_state.json`: JSON parse PASS
- `tests/verify_package.py`: PASS
- Apps Script `Code.gs`: Node syntax check PASS
- Core Kotlin (`Headers`, `XlsxReader`, `Models`, `FinancePolicy`, `FinancePipeline`): Kotlin compiler syntax/type check with platform stubs PASS
- `MainActivity.kt`: Kotlin compiler syntax/type check with Android/API stubs PASS
- `AppConfig.kt`, `BackendClient.kt`: Kotlin compiler syntax/type check with minimal stubs PASS

## Regression fixture: 2026-09-01~2026-09-09 BankSalad

The personal XLSX fixture is **not included** in this repository/package.

Expected incremental result against the bundled pre-09/07 processed-key baseline:

- source transactions: 23
- pre-existing/duplicate: 19
- new: 4
- confirmed: 4
- review required: 0
- provisional: 0
- recognized new consumer spend: 24,600 KRW

Expected 4 new classifications:

1. Naver Premium Content 100 → 교육·자기계발 / 교육·수강
2. 사계절반찬 16,000 → 식비 / 장보기·집밥재료
3. KakaoPay settlement send 400 → 식비 / 외식
4. KakaoPay settlement send 8,100 → 식비 / 외식

## Policy safety regression

- insurance compensation: `recognize_income = false`
- old regional-currency `top-up = food expense` merchant rule: removed
- regional-currency top-up: asset move / prepaid funding
- unresolved `검토 필요` or `잠정`: Android send disabled AND Apps Script import rejected
- Android compile/target SDK: 36

## Build status

The source package is prepared for GitHub Actions. This runtime does not include the full Android SDK/AGP build environment, so the final APK binary must be built by the included GitHub Actions workflow and then device-tested.
