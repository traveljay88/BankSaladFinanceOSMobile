# Finance OS · BankSalad v0.4.0 Test Report

Test date: 2026-09-13

## Static
- `banksalad_finance_os.py` Python compile: PASS
- `ledger_pattern_rules_v2.json` JSON generation: PASS
- ledger-pattern extraction from current Finance OS: PASS

## Ledger learning
- 2024~current rows scanned: 4,464
- confirmed rows used: 4,370
- safe exact merchant rules: 53
- safe repeated merchant+amount rules: 40
- ambiguous merchant denylist retained: Coupang/Coupay, unmatched KakaoPay, convenience stores, generic PG.

## Regression scenarios
- 1 KRW verification transaction exclusion: PASS
- personal-name incoming transfer → settlement recovery: PASS
- nearest-date N:1 settlement matching: PASS
- 44,000 KRW shared expense + three 11,000 KRW recoveries → personal spend 11,000 KRW: PASS
- public-agency 4,000 KRW swimming pool → travel/leisure/culture / exercise-leisure: PASS
- Jeongdo Promotion Gangseo → Balsan Station Yeokjeon Halmaek → alcohol/social: PASS
- Cheongdam Hair → clothing/beauty / beauty: PASS
- dental clinic → medical/health / hospital-pharmacy: PASS
- Coupang Eats → food / delivery: PASS
- postpaid Hi-Pass → transport/vehicle / toll: PASS
- Seoul City Gas → housing/utilities / utilities: PASS
- pocha keyword → alcohol/social / alcohol-entertainment: PASS

## Deployment boundary
The connected Library exposes the parser/backend/policy artifacts but not the exact current Android Finance OS source tree. Therefore this package contains a ready `ReviewUiV2.kt` replacement component, but the installed APK itself is not silently replaced here.

