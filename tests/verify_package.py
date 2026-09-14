#!/usr/bin/env python3
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "app/src/main/assets"
config = json.loads((ASSETS / "config.json").read_text(encoding="utf-8"))
policy = json.loads((ASSETS / "finance_policy.json").read_text(encoding="utf-8"))
corr = json.loads((ASSETS / "user_corrections.json").read_text(encoding="utf-8"))

assert config["version"] == "2.0.0"
assert policy["policy_version"] == "2.0.0"
assert policy["liquidity_policy"]["available_cash_floor_krw"] == 5_500_000
assert policy["spending_policy"]["current_monthly_living_cap_krw"] == 2_000_000
assert policy["spending_policy"]["current_monthly_discretionary_cap_krw"] == 500_000
assert policy["spending_policy"]["gambling_game_budget_krw"] == 0
assert policy["debt_policy"]["high_rate_threshold_pct"] == 7.0
assert not policy["spending_policy"]["historical_230_250_rule_active"]

for r in config.get("merchant_overrides", []):
    assert r.get("contains") != "경기지역화폐" and r.get("equals") != "경기지역화폐", "old regional-currency expense rule must be removed"

# Insurance compensation must never be treated as recognized income.
for k, v in corr.get("source_key_overrides", {}).items():
    a = v.get("action", v)
    if "보험" in (a.get("name", "") + a.get("minor", "")) or "보상" in (a.get("name", "") + a.get("minor", "")):
        assert a.get("recognize_income", False) is False, f"insurance override {k} recognizes income"
for r in corr.get("learned_rules", []):
    a = r.get("action", {})
    if "보험" in (a.get("name", "") + a.get("minor", "")) or "보상" in (a.get("name", "") + a.get("minor", "")):
        assert a.get("recognize_income", False) is False, f"insurance rule {r.get('id')} recognizes income"

# Latest user-confirmed transactions must be frozen.
expected = {
    "d5444bf2227e31680d44": ("교육·자기계발", "교육·수강"),
    "66cb58a900972fe5fd61": ("식비", "외식"),
    "b94ebaa46e4bb06e16b9": ("식비", "외식"),
    "06727e07bcf6f6179e97": ("자산이동", "선불충전"),
}
for key, pair in expected.items():
    action = corr["source_key_overrides"][key]["action"]
    assert (action["major"], action["minor"]) == pair
    assert action["status"] == "확정"

main = (ROOT / "app/src/main/java/com/axiscw/financeos/MainActivity.kt").read_text(encoding="utf-8")
thin = (ROOT / "app/src/main/java/com/axiscw/financeos/ThinClientActivity.kt").read_text(encoding="utf-8")
extractor = (ROOT / "app/src/main/java/com/axiscw/financeos/BankSaladTransactionExtractor.kt").read_text(encoding="utf-8")
file_input = (ROOT / "app/src/main/java/com/axiscw/financeos/FileInput.kt").read_text(encoding="utf-8")
client = (ROOT / "app/src/main/java/com/axiscw/financeos/BackendClient.kt").read_text(encoding="utf-8")
manifest = (ROOT / "app/src/main/AndroidManifest.xml").read_text(encoding="utf-8")
backend = (ROOT / "backend/Code.gs").read_text(encoding="utf-8")
build = (ROOT / "app/build.gradle.kts").read_text(encoding="utf-8")
workflow = (ROOT / ".github/workflows/build-apk.yml").read_text(encoding="utf-8")
assert "r.unresolvedRows.isEmpty()" in main
assert "result.unresolvedRows.isNotEmpty()" in main
assert "reviewCount > 0 || provisionalCount > 0" in backend
assert "compileSdk = 36" in build and "targetSdk = 36" in build
assert "platforms;android-36" in workflow

# v0.4 must launch the server-driven client and keep policy decisions off-device.
assert 'android:name=".ThinClientActivity"' in manifest
assert "FinancePipeline(" not in thin and "AppConfig.load" not in thin
assert "engineImport(payload)" in thin and '"engine_import"' in client
assert "refreshServerReviews(silent = true)" in thin
assert "text/csv" in manifest and 'endsWith(".csv")' in file_input

print("PASS: Finance Policy 2.0.0 and Thin Client package invariants")
