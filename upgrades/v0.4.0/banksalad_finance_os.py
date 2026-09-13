#!/usr/bin/env python3
"""BankSalad weekly XLSX -> Finance OS normalized import bundle.

Core parser uses only Python standard library. Google Sheets write-back is optional and
requires google-auth + google-api-python-client and a service-account credential.

Default behavior is safe: parse + validate + emit CSV/JSON previews. It does not mutate
Google Sheets unless --apply-google is explicitly supplied.
"""
from __future__ import annotations

import argparse
from collections import defaultdict
import csv
import hashlib
import json
import math
import os
import re
import sys
import zipfile
from dataclasses import dataclass, asdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple
import xml.etree.ElementTree as ET

KST = timezone(timedelta(hours=9))
NS_MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
NS_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
NS_PKG_REL = "http://schemas.openxmlformats.org/package/2006/relationships"

LEDGER_HEADERS = [
    "거래ID","거래일","연월","재무거래유형","거래명","상세내역","금액","표준계정명","계정ID",
    "대분류","소분류","현금유입","현금유출","소득인식액","소비지출액","대출이자액","카드대금결제액",
    "자산간이동액","투자원금액","투자회수액","자기자금 부채원금상환","비손익 순자산조정액",
    "손익기준 순자산영향액","계산포함","검토상태","중복후보","중복키"
]
SNAPSHOT_HEADERS = [
    "Run_ID","기준일","연월","원본섹션","원본항목","원본상품명","표준계정명","계정ID","자산부채","잔액",
    "대출원금/한도","대출잔액","잔여한도","금리","순자산영향액","이중계상제외","검토상태","Source_File","비고"
]
IMPORT_LOG_HEADERS = [
    "Run_ID","Imported_At","Source_File","Period_Start","Period_End","Transaction_Rows_Read","Ledger_Inserted",
    "Ledger_Skipped","Ledger_Review","Snapshot_Rows","Unmapped_Snapshot_Accounts","BS_양수자산합계(보험·연금포함)",
    "Total_Liabilities","BS_보정순자산(보험·연금포함)","Overdraft_Available","Status","Notes","Finance_OS_비교순자산"
]


def norm(s: Any) -> str:
    if s is None:
        return ""
    return re.sub(r"\s+", " ", str(s)).strip()


def excel_date(v: Any) -> str:
    if v in (None, ""):
        return ""
    if isinstance(v, str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}", v):
        return v
    n = float(v)
    return (datetime(1899, 12, 30) + timedelta(days=n)).date().isoformat()


def excel_time(v: Any) -> str:
    if v in (None, ""):
        return "00:00:00"
    if isinstance(v, str) and re.fullmatch(r"\d{2}:\d{2}(:\d{2})?", v):
        return v if len(v) == 8 else v + ":00"
    secs = int(round((float(v) % 1) * 86400)) % 86400
    return f"{secs//3600:02d}:{(secs%3600)//60:02d}:{secs%60:02d}"


def money(v: Any) -> int:
    if v in (None, ""):
        return 0
    return int(round(float(v)))


def fmt_num(v: Optional[float]) -> Any:
    if v is None:
        return "-"
    if abs(v - round(v)) < 1e-9:
        return int(round(v))
    return v


def cell_col(ref: str) -> int:
    letters = re.match(r"([A-Z]+)", ref).group(1)
    n = 0
    for c in letters:
        n = n * 26 + ord(c) - 64
    return n - 1


class XlsxReader:
    def __init__(self, path: Path):
        self.path = Path(path)
        self.z = zipfile.ZipFile(self.path)
        self.shared = self._shared_strings()
        self.sheet_paths = self._sheet_paths()

    def close(self):
        self.z.close()

    def _shared_strings(self) -> List[str]:
        try:
            root = ET.fromstring(self.z.read("xl/sharedStrings.xml"))
        except KeyError:
            return []
        out = []
        for si in root.findall(f"{{{NS_MAIN}}}si"):
            texts = [t.text or "" for t in si.iter(f"{{{NS_MAIN}}}t")]
            out.append("".join(texts))
        return out

    def _sheet_paths(self) -> Dict[str, str]:
        wb = ET.fromstring(self.z.read("xl/workbook.xml"))
        rels = ET.fromstring(self.z.read("xl/_rels/workbook.xml.rels"))
        relmap = {r.attrib["Id"]: r.attrib["Target"] for r in rels.findall(f"{{{NS_PKG_REL}}}Relationship")}
        out = {}
        sheets = wb.find(f"{{{NS_MAIN}}}sheets")
        for s in sheets:
            name = s.attrib["name"]
            rid = s.attrib[f"{{{NS_REL}}}id"]
            target = relmap[rid]
            if target.startswith("/"):
                path = target.lstrip("/")
            else:
                path = "xl/" + target.lstrip("/")
            out[name] = path
        return out

    def rows(self, sheet_name: str) -> List[List[Any]]:
        if sheet_name not in self.sheet_paths:
            raise ValueError(f"Missing sheet: {sheet_name}. Found: {list(self.sheet_paths)}")
        root = ET.fromstring(self.z.read(self.sheet_paths[sheet_name]))
        data = root.find(f"{{{NS_MAIN}}}sheetData")
        out: List[List[Any]] = []
        for r in data.findall(f"{{{NS_MAIN}}}row"):
            cells: Dict[int, Any] = {}
            max_col = -1
            for c in r.findall(f"{{{NS_MAIN}}}c"):
                idx = cell_col(c.attrib["r"])
                max_col = max(max_col, idx)
                ctype = c.attrib.get("t")
                if ctype == "inlineStr":
                    is_node = c.find(f"{{{NS_MAIN}}}is")
                    val = "".join((t.text or "") for t in is_node.iter(f"{{{NS_MAIN}}}t")) if is_node is not None else ""
                else:
                    v = c.find(f"{{{NS_MAIN}}}v")
                    raw = v.text if v is not None else ""
                    if ctype == "s" and raw != "":
                        val = self.shared[int(raw)]
                    elif ctype == "b":
                        val = raw == "1"
                    elif ctype in ("str", "e"):
                        val = raw
                    else:
                        if raw == "":
                            val = None
                        else:
                            try:
                                f = float(raw)
                                val = int(f) if f.is_integer() else f
                            except ValueError:
                                val = raw
                cells[idx] = val
            row = [None] * (max_col + 1 if max_col >= 0 else 0)
            for idx, val in cells.items():
                row[idx] = val
            out.append(row)
        return out


@dataclass
class Account:
    raw: str
    name: str
    id: Optional[str]
    kind: str = "unknown"
    status: str = "확정"


@dataclass
class Txn:
    idx: int
    date: str
    time: str
    raw_type: str
    raw_major: str
    raw_minor: str
    content: str
    signed_amount: int
    currency: str
    payment: str
    memo: str
    source_key: str
    account: Account
    pair_idx: Optional[int] = None
    is_mirror: bool = False
    excluded_reason: str = ""
    settlement_match_idx: Optional[int] = None
    settlement_score: float = 0.0
    settlement_group_id: str = ""


class FinanceOSPipeline:
    def __init__(self, config: Dict[str, Any], input_path: Path):
        self.cfg = config
        self.input_path = Path(input_path)
        self.source_file = self.input_path.name
        self.reader = XlsxReader(self.input_path)
        now = datetime.now(KST)
        self.run_id = f"BS-{now:%Y%m%d-%H%M%S}"
        self.pattern_rules = self._load_pattern_rules()

    def _load_pattern_rules(self) -> Dict[str, Any]:
        # Optional sidecar generated from the authoritative Finance OS ledger.
        # Missing sidecar is safe: the engine falls back to config rules.
        p = Path(__file__).with_name("ledger_pattern_rules_v2.json")
        if not p.exists():
            return {}
        try:
            return json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            return {}

    def account(self, raw: str) -> Account:
        key = norm(raw)
        d = self.cfg["account_aliases"].get(key)
        if not d:
            return Account(raw=key, name=key, id=None, kind="unknown", status="검토 필요")
        return Account(raw=key, name=d["name"], id=d.get("id"), kind=d.get("kind", "unknown"), status=d.get("status", "확정"))

    def source_key(self, vals: Sequence[Any]) -> str:
        raw = "|".join(norm(v) for v in vals)
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:20]

    def parse_transactions(self) -> List[Txn]:
        rows = self.reader.rows("가계부 내역")
        if not rows or [norm(x) for x in rows[0][:10]] != ["날짜","시간","타입","대분류","소분류","내용","금액","화폐","결제수단","메모"]:
            raise ValueError("Unexpected '가계부 내역' schema")
        txns = []
        for i, row in enumerate(rows[1:], start=2):
            r = list(row) + [None] * (10 - len(row))
            if r[0] in (None, ""):
                continue
            date = excel_date(r[0]); tm = excel_time(r[1]); amt = money(r[6])
            vals = [date, tm, r[2], r[3], r[4], r[5], amt, r[7], r[8], r[9]]
            txns.append(Txn(
                idx=i, date=date, time=tm, raw_type=norm(r[2]), raw_major=norm(r[3]), raw_minor=norm(r[4]),
                content=norm(r[5]), signed_amount=amt, currency=norm(r[7]), payment=norm(r[8]), memo=norm(r[9]),
                source_key=self.source_key(vals), account=self.account(norm(r[8]))
            ))
        self._pair_internal_transfers(txns)
        self._apply_noise_filters(txns)
        self._match_personal_settlements(txns)
        return txns

    @staticmethod
    def _sec(t: str) -> int:
        h,m,s = map(int,t.split(":")); return h*3600+m*60+s

    def _pair_internal_transfers(self, txns: List[Txn]) -> None:
        transfers = [t for t in txns if t.raw_type == "이체"]
        used = set()
        for i, a in enumerate(transfers):
            if a.idx in used or a.signed_amount == 0:
                continue
            best = None
            for b in transfers[i+1:]:
                if b.idx in used or b.date != a.date or a.signed_amount != -b.signed_amount:
                    continue
                if abs(self._sec(a.time) - self._sec(b.time)) <= 2:
                    best = b; break
            if not best:
                continue
            a.pair_idx = best.idx; best.pair_idx = a.idx
            # Representative = outgoing/negative side. It best expresses the funding source.
            rep, mirror = (a, best) if a.signed_amount < 0 else (best, a)
            rep.is_mirror = False; mirror.is_mirror = True
            used.update({a.idx, best.idx})


    @staticmethod
    def _person_name(content: str) -> bool:
        s = norm(content)
        return bool(re.fullmatch(r"[가-힣]{1,2}\*?[가-힣]{1,2}", s) or re.fullmatch(r"[가-힣]{2,4}", s))

    def _apply_noise_filters(self, txns: List[Txn]) -> None:
        # User policy: every 1 KRW transaction is non-economic verification noise.
        for t in txns:
            if abs(t.signed_amount) == 1:
                t.excluded_reason = "본인인증 1원 거래"

    @staticmethod
    def _date_obj(s: str):
        try:
            return datetime.strptime(s, "%Y-%m-%d").date()
        except Exception:
            return None

    def _settlement_candidate_score(self, inflow: Txn, expense: Txn, used_amount: int) -> float:
        if expense.signed_amount >= 0 or expense.raw_type in ("이체", "수입") or expense.excluded_reason:
            return -999.0
        exp_amt = abs(expense.signed_amount)
        remaining = exp_amt - used_amount
        if remaining <= 0 or inflow.signed_amount <= 0 or inflow.signed_amount > remaining:
            return -999.0
        di, de = self._date_obj(inflow.date), self._date_obj(expense.date)
        if not di or not de:
            return -999.0
        dd = abs((di - de).days)
        if dd > 7:
            return -999.0
        score = {0:45,1:39,2:32,3:26,4:21,5:17,6:13,7:10}[dd]
        if de <= di:
            score += 8
        else:
            score -= 4
        ratio = inflow.signed_amount / exp_amt if exp_amt else 0
        if inflow.signed_amount == remaining or inflow.signed_amount == exp_amt:
            score += 35
        else:
            common = (0.5, 1/3, 0.25, 0.2, 2/3, 0.75)
            if any(abs(ratio-r) <= 0.035 for r in common):
                score += 30
            elif inflow.signed_amount < exp_amt:
                score += 18
        # Shared-cost-prone categories get a modest boost; fixed/financial items are penalized.
        blob = f"{expense.raw_major} {expense.raw_minor} {expense.content}"
        if any(k in blob for k in ("식", "음식", "외식", "술", "여행", "숙박", "택시", "문화", "쇼핑", "카페", "배달")):
            score += 8
        if any(k in blob for k in ("대출", "이자", "보험", "세금", "통신", "가스", "전기", "관리비", "카드대금")):
            score -= 28
        return score

    def _match_personal_settlements(self, txns: List[Txn]) -> None:
        incoming = [t for t in txns if t.raw_type == "이체" and t.pair_idx is None and t.signed_amount > 0 and not t.excluded_reason and self._person_name(t.content)]
        expenses = [t for t in txns if t.signed_amount < 0 and t.raw_type not in ("이체",) and not t.excluded_reason]
        used = defaultdict(int)
        threshold = float((self.pattern_rules.get("settlement_matching") or {}).get("auto_score_threshold", 82))
        # Greedy by inflow date then amount. Capacity prevents over-netting the same expense.
        for t in sorted(incoming, key=lambda x: (x.date, x.time, -x.signed_amount)):
            ranked = []
            for e in expenses:
                sc = self._settlement_candidate_score(t, e, used[e.idx])
                if sc > -900:
                    ranked.append((sc, e))
            ranked.sort(key=lambda x: (-x[0], abs((self._date_obj(t.date)-self._date_obj(x[1].date)).days), -abs(x[1].signed_amount)))
            if ranked and ranked[0][0] >= threshold:
                sc, e = ranked[0]
                t.settlement_match_idx = e.idx
                t.settlement_score = round(sc, 1)
                t.settlement_group_id = f"SET-{e.date.replace('-','')}-{e.source_key[:8].upper()}"
                used[e.idx] += t.signed_amount
                e.settlement_group_id = t.settlement_group_id
        self._settlement_offsets = dict(used)

    def _pattern_action(self, t: Txn) -> Optional[Dict[str, Any]]:
        amount = abs(t.signed_amount)
        # Explicit user-confirmed hard rules first.
        content = norm(t.content)
        if content == "공공기관" and amount == 4000:
            return {"name":"수영장 이용료","type":"소비지출","major":"여행·여가·문화","minor":"운동·레저","status":"확정"}
        if content == "정도진흥기업(주)강서점":
            return {"name":"발산역 역전할머니맥주","type":"소비지출","major":"술·사교","minor":"술·유흥","status":"확정"}
        obvious = [
            ("이편한세상치과의원", "소비지출", "의료·건강", "병원·약국"),
            ("청담헤어", "소비지출", "의복·미용", "미용"),
            ("쿠팡이츠", "소비지출", "식비", "배달"),
            ("후불하이패스", "소비지출", "교통·차량", "통행료"),
            ("서울도시가스", "소비지출", "주거·공과금", "공과금"),
        ]
        for token, typ, maj, mi in obvious:
            if token in content:
                return {"name":content,"type":typ,"major":maj,"minor":mi,"status":"확정"}
        if any(k in content for k in ("포차", "호프", "역전할맥", "역전할머니맥주")):
            return {"name":content,"type":"소비지출","major":"술·사교","minor":"술·유흥","status":"자동확정"}
        # Ledger-derived stable exact merchant rules.
        for r in self.pattern_rules.get("stable_exact_merchants", []):
            if content == norm(r.get("merchant")):
                return dict(r.get("action") or {})
        # Amount-specific rules are intentionally lower priority and only generated for repeated exact patterns.
        for r in self.pattern_rules.get("stable_amount_specific", []):
            if content == norm(r.get("merchant")) and amount == int(r.get("amount", -1)):
                return dict(r.get("action") or {})
        return None

    def merchant_override(self, content: str) -> Optional[Tuple[str,str,str]]:
        for rule in self.cfg.get("merchant_overrides", []):
            if "equals" in rule and content == rule["equals"]:
                return rule["major"], rule["minor"], rule.get("status", "확정")
            if "contains" in rule and rule["contains"] in content:
                return rule["major"], rule["minor"], rule.get("status", "확정")
        return None

    def classify(self, t: Txn) -> Dict[str, Any]:
        amount = abs(t.signed_amount)
        out = {
            "type": "소비지출", "major": "기타 생활비", "minor": "사용처 검증 필요", "status": "검토 필요",
            "cash_in": None, "cash_out": None, "income": None, "spend": None, "interest": None, "card_payment": None,
            "asset_move": None, "invest_in": None, "invest_out": None, "debt_principal": None, "nonpnl_adj": None,
            "net_income_effect": None, "include": "Y", "note": ""
        }
        if t.is_mirror:
            out.update(type="자산이동", major="자산이동", minor="운영계좌간이체", status="확정", include="N")
            return out

        # Personal incoming transfer: user's default policy is settlement, not income/asset move.
        if t.raw_type == "이체" and t.pair_idx is None and t.signed_amount > 0 and self._person_name(t.content):
            note = "개인간 정산입금"
            if t.settlement_match_idx is not None:
                note += f" | 상계후보 idx={t.settlement_match_idx} score={t.settlement_score} group={t.settlement_group_id}"
            out.update(type="정산", major="정산", minor="일반 정산회수", status="확정", cash_in=amount, include="Y", net_income_effect=0, note=note)
            return out

        # paired transfer
        if t.pair_idx is not None and t.raw_type == "이체":
            if "카카오페이" in t.content or "네이버페이" in t.content:
                out.update(type="자산이동", major="자산이동", minor="선불충전", status="확정", asset_move=amount)
            else:
                out.update(type="자산이동", major="자산이동", minor="운영계좌간이체", status="확정")
                if t.account.status == "검토 필요": out["status"] = "검토 필요"
            return out

        # unpaired transfer
        if t.raw_type == "이체":
            if "카카오페이" in t.content or "네이버페이" in t.content:
                out.update(type="자산이동", major="자산이동", minor="선불충전", status="잠정", asset_move=amount)
            else:
                out.update(type="자산이동", major="자산이동", minor="운영계좌간이체", status="검토 필요")
            return out

        # income
        if t.raw_type == "수입":
            out["type"] = "소득"; out["major"] = "소득"; out["include"] = "Y"
            if "성과급" in t.content or "상여" in t.content:
                out["minor"] = "상여·성과급"
            elif "이자" in t.content or t.raw_major == "금융":
                out["minor"] = "이자·배당"
            else:
                out["minor"] = "급여" if t.raw_major == "급여" else "기타"
            out["status"] = "확정"
            out["income"] = amount
            out["net_income_effect"] = amount
            if t.account.kind in ("cash","wallet"):
                out["cash_in"] = amount
            return out

        # expense special rules: explicit/user-confirmed + ledger-history rules outrank generic raw categories.
        pa = self._pattern_action(t)
        if pa:
            out["type"] = pa.get("type", out["type"]); out["major"] = pa.get("major", out["major"]); out["minor"] = pa.get("minor", out["minor"]); out["status"] = pa.get("status", "자동확정")
            if pa.get("name"): out["note"] = f"학습규칙:{pa['name']}"
        else:
            ov = self.merchant_override(t.content)
            if ov:
                out["major"], out["minor"], out["status"] = ov
            else:
                key = f"{t.raw_major}|{t.raw_minor}"
                mapped = self.cfg.get("raw_category_map", {}).get(key)
                if mapped:
                    out["major"], out["minor"], out["status"] = mapped

        if out["major"] == "금융비용" and out["minor"] == "대출이자":
            out["type"] = "금융비용"; out["interest"] = amount; out["net_income_effect"] = -amount
        else:
            # Preserve learned type when provided, but consumer rules normally remain 소비지출.
            if out["type"] not in ("환불·취소", "소득"):
                out["type"] = "소비지출"
            out["spend"] = amount; out["net_income_effect"] = -amount
        # Net high-confidence personal settlements against the nearest matched expense.
        offset = int(getattr(self, "_settlement_offsets", {}).get(t.idx, 0))
        if offset and out.get("type") == "소비지출":
            offset = min(offset, amount)
            personal = max(amount - offset, 0)
            out["spend"] = personal
            out["net_income_effect"] = -personal
            out["note"] = (out.get("note") + " | " if out.get("note") else "") + f"개인정산 상계 {offset}원 / 최종 개인부담 {personal}원 / {t.settlement_group_id}"
            if personal == 0:
                out.update(type="정산", major="정산", minor="일반 선결제", net_income_effect=0)
        if t.account.kind in ("cash","wallet"):
            out["cash_out"] = amount
        return out

    def ledger_rows(self, txns: List[Txn], existing_keys: Optional[set[str]]=None) -> Tuple[List[Dict[str,Any]], List[Txn]]:
        existing_keys = existing_keys or set()
        out = []; skipped = []
        by_idx = {t.idx: t for t in txns}
        for t in txns:
            if t.source_key in existing_keys or t.excluded_reason:
                skipped.append(t); continue
            c = self.classify(t); amount = abs(t.signed_amount)
            detail = f"BankSalad 자동화 | {self.source_file} | {t.date} {t.time} | {t.raw_type}>{t.raw_major}>{t.raw_minor} | 결제수단:{t.payment} | 원금액:{t.signed_amount}"
            if c.get("note"):
                detail += " | " + str(c["note"])
            pair_account_status = by_idx[t.pair_idx].account.status if t.pair_idx in by_idx else "확정"
            merged_status = self._status_merge(self._status_merge(c["status"], t.account.status), pair_account_status if t.is_mirror else "확정")
            row = {
                "거래ID": f"BSAUTO-{t.date.replace('-','')}-{t.source_key[:8].upper()}",
                "거래일": t.date, "연월": t.date[:7], "재무거래유형": c["type"], "거래명": t.content,
                "상세내역": detail, "금액": amount, "표준계정명": t.account.name, "계정ID": t.account.id or "",
                "대분류": c["major"], "소분류": c["minor"], "현금유입": fmt_num(c["cash_in"]), "현금유출": fmt_num(c["cash_out"]),
                "소득인식액": fmt_num(c["income"]), "소비지출액": fmt_num(c["spend"]), "대출이자액": fmt_num(c["interest"]),
                "카드대금결제액": fmt_num(c["card_payment"]), "자산간이동액": fmt_num(c["asset_move"]),
                "투자원금액": fmt_num(c["invest_in"]), "투자회수액": fmt_num(c["invest_out"]), "자기자금 부채원금상환": fmt_num(c["debt_principal"]),
                "비손익 순자산조정액": fmt_num(c["nonpnl_adj"]), "손익기준 순자산영향액": fmt_num(c["net_income_effect"]),
                "계산포함": c["include"], "검토상태": merged_status, "중복후보": "N", "중복키": t.source_key
            }
            out.append(row)
        return out, skipped

    @staticmethod
    def _status_merge(a: str, b: str) -> str:
        rank = {"확정":0, "자동확정":0, "잠정":1, "검토 필요":2}
        return a if rank.get(a,1) >= rank.get(b,1) else b

    def _loan_map(self, inst: str, product: str, principal: int) -> Account:
        for r in self.cfg.get("loan_mappings", []):
            if r.get("institution") and r["institution"] != inst: continue
            if r.get("product") and r["product"] != product: continue
            if r.get("product_contains") and r["product_contains"] not in product: continue
            if r.get("principal") is not None and int(r["principal"]) != principal: continue
            return Account(product, r["name"], r["id"], "debt", "확정")
        return Account(product, product, None, "debt", "검토 필요")

    def parse_snapshot(self) -> Tuple[List[Dict[str,Any]], Dict[str,Any]]:
        rows = self.reader.rows("뱅샐현황")
        # Section 3: asset/liability side-by-side. Locate by labels because blank Excel rows
        # may be omitted from the XLSX XML and therefore list indexes are not Excel row numbers.
        asset_rows = []
        current_asset_section = ""
        finance_start = None
        for i, r0 in enumerate(rows):
            r = list(r0) + [None]*10
            if norm(r[1]) == "자산" and norm(r[5]) == "부채":
                finance_start = i + 2  # skip the column-header row immediately below
                break
        if finance_start is None:
            raise ValueError("Could not find finance asset/liability section")
        for r0 in rows[finance_start:]:
            r = list(r0) + [None]*10
            if norm(r[1]) in ("총자산", "순자산"):
                break
            if norm(r[1]): current_asset_section = norm(r[1])
            product = norm(r[2]); bal = r[4] if len(r) > 4 else None
            if product and bal is not None:
                asset_rows.append((current_asset_section, product, float(bal)))

        # Section 6 contains authoritative loan principal, balance, rate
        loans = []
        loan_header = None
        for i, r in enumerate(rows):
            if len(r) > 3 and norm(r[1]) == "대출종류" and norm(r[2]) == "금융사" and norm(r[3]) == "상품명":
                loan_header = i; break
        if loan_header is None:
            raise ValueError("Could not find loan section")
        for r in rows[loan_header+1:]:
            r = list(r)+[None]*10
            if norm(r[1]) == "총계": break
            inst = norm(r[2]); product = norm(r[3])
            if not inst or not product: continue
            principal = money(r[5]); bal = money(r[6]); rate = float(r[7]) if r[7] not in (None,"") else None
            loans.append((inst, product, principal, bal, rate))

        # Investment status: authoritative evaluation values; also used to distinguish securities cash from investments.
        investment_products = set()
        inv_eval = 0.0
        inv_header = None
        for i, r in enumerate(rows):
            if len(r) > 7 and norm(r[1]) == "투자상품종류" and norm(r[2]) == "금융사" and norm(r[3]) == "상품명":
                inv_header = i; break
        if inv_header is not None:
            for r in rows[inv_header+1:]:
                r = list(r)+[None]*10
                if norm(r[1]) == "총계": break
                product=norm(r[3]); val=r[6]
                if product and val is not None:
                    investment_products.add(product); inv_eval += float(val)

        snapshot = []
        positive_assets = 0.0; finance_cash = 0.0; real_estate=0.0; other_assets=0.0; car=0.0; insurance_assets=0.0; pension_assets=0.0
        unmapped = 0
        cash_sections = set(self.cfg["snapshot_policy"]["finance_cash_sections"])
        cash_extra = set(self.cfg["snapshot_policy"]["finance_cash_extra_products"])
        inv_exclude = set(self.cfg["snapshot_policy"]["finance_investment_exclude_products"])
        for section, product, bal in asset_rows:
            acc = self.account(product)
            is_negative_overdraft_asset = bal < 0 and acc.id in set(self.cfg["operating_overdraft_ids"])
            effect = 0.0 if is_negative_overdraft_asset else bal
            if bal > 0: positive_assets += bal
            if acc.id is None: unmapped += 1
            if bal > 0 and (section in cash_sections or product in cash_extra): finance_cash += bal
            if section == "부동산" and bal > 0: real_estate += bal
            if section == "동산" and bal > 0: car += bal
            if section == "기타 실물 자산" and bal > 0: other_assets += bal
            if section == "보험 자산" and bal > 0: insurance_assets += bal
            if section == "연금 자산" and bal > 0: pension_assets += bal
            note = ""
            if is_negative_overdraft_asset: note = "마이너스통장 사용액이 부채에도 동일 반영되어 자산측 음수는 순자산 계산에서 제외"
            snapshot.append({
                "Run_ID": self.run_id, "기준일": self.period_end(), "연월": self.period_end()[:7], "원본섹션":"자산", "원본항목":section,
                "원본상품명":product, "표준계정명":acc.name if acc.id else "", "계정ID":acc.id or "", "자산부채":"자산", "잔액":bal,
                "대출원금/한도":"", "대출잔액":"", "잔여한도":"", "금리":"", "순자산영향액":effect,
                "이중계상제외":"Y" if is_negative_overdraft_asset else "N", "검토상태":acc.status if acc.id else "검토 필요", "Source_File":self.source_file, "비고":note
            })

        total_liab = 0; available = 0; high_rate = 0
        avail_ids = set(self.cfg["snapshot_policy"]["available_overdraft_ids"]); threshold=float(self.cfg["snapshot_policy"]["high_rate_threshold"])
        for inst, product, principal, bal, rate in loans:
            acc = self._loan_map(inst, product, principal)
            total_liab += bal
            remain = max(principal - bal, 0) if acc.id in avail_ids else None
            if remain is not None: available += remain
            if rate is not None and rate >= threshold: high_rate += bal
            if acc.id is None: unmapped += 1
            snapshot.append({
                "Run_ID":self.run_id,"기준일":self.period_end(),"연월":self.period_end()[:7],"원본섹션":"부채","원본항목":None,
                "원본상품명":product,"표준계정명":acc.name if acc.id else "","계정ID":acc.id or "","자산부채":"부채","잔액":bal,
                "대출원금/한도":principal,"대출잔액":bal,"잔여한도":remain if remain is not None else "","금리":rate if rate is not None else "",
                "순자산영향액":-bal,"이중계상제외":"N","검토상태":acc.status,"Source_File":self.source_file,"비고":f"{inst} | {product}"
            })

        finance_net = finance_cash + inv_eval + real_estate + other_assets + car - total_liab
        bs_net = positive_assets - total_liab
        metrics = {
            "positive_assets": positive_assets, "finance_cash": finance_cash, "investment_eval": inv_eval, "real_estate": real_estate,
            "other_assets": other_assets, "car": car, "insurance_assets": insurance_assets, "pension_assets": pension_assets,
            "total_liabilities": total_liab, "available_overdraft": available, "high_rate_liabilities": high_rate,
            "bs_corrected_net_worth": bs_net, "finance_os_net_worth": finance_net, "unmapped_snapshot_accounts": unmapped,
            "snapshot_rows": len(snapshot)
        }
        return snapshot, metrics

    def period_end(self) -> str:
        txns = self.parse_transactions()
        return max(t.date for t in txns)

    def period_start(self) -> str:
        txns = self.parse_transactions()
        return min(t.date for t in txns)

    def close(self): self.reader.close()


def csv_write(path: Path, headers: Sequence[str], rows: Sequence[Dict[str,Any]]):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=headers, extrasaction="ignore")
        w.writeheader()
        for row in rows: w.writerow(row)


def load_keys(path: Optional[Path]) -> set[str]:
    if not path: return set()
    if not path.exists(): return set()
    if path.suffix.lower()==".json":
        data=json.loads(path.read_text(encoding="utf-8")); return set(data.get("processed_source_keys", data if isinstance(data,list) else []))
    out=set()
    with path.open(encoding="utf-8-sig", newline="") as f:
        for r in csv.DictReader(f):
            if r.get("중복키"): out.add(r["중복키"])
    return out


def google_apply(cfg: Dict[str,Any], ledger_rows: List[Dict[str,Any]], snapshot_rows: List[Dict[str,Any]], log_row: Dict[str,Any], credentials_json: str):
    try:
        from google.oauth2.service_account import Credentials
        from googleapiclient.discovery import build
    except ImportError as e:
        raise RuntimeError("Google write-back needs: pip install google-auth google-api-python-client") from e
    scopes=["https://www.googleapis.com/auth/spreadsheets"]
    creds=Credentials.from_service_account_file(credentials_json, scopes=scopes)
    svc=build("sheets","v4",credentials=creds,cache_discovery=False).spreadsheets().values()
    sid=cfg["finance_os_spreadsheet_id"]
    # Authoritative dedupe against Finance OS column AA.
    existing=svc.get(spreadsheetId=sid, range=f"'{cfg['sheets']['ledger']}'!AA2:AA").execute().get("values",[])
    existing_keys={r[0] for r in existing if r}
    ledger_rows=[r for r in ledger_rows if r["중복키"] not in existing_keys]
    if ledger_rows:
        svc.append(spreadsheetId=sid, range=f"'{cfg['sheets']['ledger']}'!A:AA", valueInputOption="USER_ENTERED", insertDataOption="INSERT_ROWS",
                   body={"values":[[r.get(h,"") for h in LEDGER_HEADERS] for r in ledger_rows]}).execute()
    if snapshot_rows:
        svc.append(spreadsheetId=sid, range=f"'{cfg['sheets']['snapshot']}'!A:S", valueInputOption="USER_ENTERED", insertDataOption="INSERT_ROWS",
                   body={"values":[[r.get(h,"") for h in SNAPSHOT_HEADERS] for r in snapshot_rows]}).execute()
    log_row=dict(log_row); log_row["Ledger_Inserted"]=len(ledger_rows)
    svc.append(spreadsheetId=sid, range=f"'{cfg['sheets']['import_log']}'!A:R", valueInputOption="USER_ENTERED", insertDataOption="INSERT_ROWS",
               body={"values":[[log_row.get(h,"") for h in IMPORT_LOG_HEADERS]]}).execute()
    return len(ledger_rows)


def main(argv=None) -> int:
    p=argparse.ArgumentParser(description="BankSalad weekly XLSX -> Finance OS import bundle")
    p.add_argument("xlsx", type=Path)
    p.add_argument("--config", type=Path, default=Path(__file__).with_name("config.json"))
    p.add_argument("--out", type=Path, default=Path(__file__).with_name("output"))
    p.add_argument("--state", type=Path, default=Path(__file__).with_name("state.json"), help="Persistent processed-key state. Updated only after successful --apply-google")
    p.add_argument("--existing-keys", type=Path, help="Optional additional JSON/CSV containing already processed 중복키")
    p.add_argument("--apply-google", action="store_true", help="Append verified rows to Google Sheets")
    p.add_argument("--google-credentials", default=os.getenv("GOOGLE_APPLICATION_CREDENTIALS"))
    args=p.parse_args(argv)
    cfg=json.loads(args.config.read_text(encoding="utf-8"))
    pipe=FinanceOSPipeline(cfg,args.xlsx)
    try:
        txns=pipe.parse_transactions(); existing=load_keys(args.state) | load_keys(args.existing_keys)
        ledger, skipped=pipe.ledger_rows(txns, existing)
        snapshot, metrics=pipe.parse_snapshot()
        review=[r for r in ledger if r["검토상태"]=="검토 필요"]
        provisional=[r for r in ledger if r["검토상태"]=="잠정"]
        period_start=min(t.date for t in txns); period_end=max(t.date for t in txns)
        log={
            "Run_ID":pipe.run_id,"Imported_At":datetime.now(KST).strftime("%Y-%m-%d %H:%M:%S"),"Source_File":args.xlsx.name,
            "Period_Start":period_start,"Period_End":period_end,"Transaction_Rows_Read":len(txns),"Ledger_Inserted":len(ledger),
            "Ledger_Skipped":len(skipped),"Ledger_Review":len(review),"Snapshot_Rows":metrics["snapshot_rows"],
            "Unmapped_Snapshot_Accounts":metrics["unmapped_snapshot_accounts"],"BS_양수자산합계(보험·연금포함)":metrics["positive_assets"],
            "Total_Liabilities":metrics["total_liabilities"],"BS_보정순자산(보험·연금포함)":metrics["bs_corrected_net_worth"],
            "Overdraft_Available":metrics["available_overdraft"],"Status":"완료(검토필요 존재)" if review else "완료",
            "Notes":"마통 음수자산은 부채 중복 반영으로 자산측 순자산에서 제외. 카드 결제예정액은 XLSX에 없으면 갱신하지 않음.",
            "Finance_OS_비교순자산":metrics["finance_os_net_worth"]
        }
        args.out.mkdir(parents=True,exist_ok=True)
        csv_write(args.out/"ledger_candidates.csv",LEDGER_HEADERS,ledger)
        csv_write(args.out/"review_queue.csv",LEDGER_HEADERS,review)
        csv_write(args.out/"snapshot_rows.csv",SNAPSHOT_HEADERS,snapshot)
        csv_write(args.out/"import_log.csv",IMPORT_LOG_HEADERS,[log])
        summary={"run_id":pipe.run_id,"period":[period_start,period_end],"transactions":len(txns),"ledger_candidates":len(ledger),
                 "skipped_by_supplied_keys":len(skipped),"review":len(review),"provisional":len(provisional),"metrics":metrics,
                 "files":{"ledger":"ledger_candidates.csv","review":"review_queue.csv","snapshot":"snapshot_rows.csv","log":"import_log.csv"}}
        (args.out/"run_summary.json").write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding="utf-8")
        if args.apply_google:
            if not args.google_credentials: raise RuntimeError("--apply-google requires --google-credentials or GOOGLE_APPLICATION_CREDENTIALS")
            inserted=google_apply(cfg,ledger,snapshot,log,args.google_credentials)
            summary["google_inserted"]=inserted
            prior = {}
            if args.state.exists():
                try: prior=json.loads(args.state.read_text(encoding="utf-8"))
                except Exception: prior={}
            all_keys=set(prior.get("processed_source_keys", [])) | {t.source_key for t in txns}
            state={"last_successful_source_file":args.xlsx.name,"last_successful_period_end":period_end,"processed_source_keys":sorted(all_keys)}
            args.state.write_text(json.dumps(state,ensure_ascii=False,indent=2),encoding="utf-8")
            summary["state_updated"]=str(args.state)
            (args.out/"run_summary.json").write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding="utf-8")
        print(json.dumps(summary,ensure_ascii=False,indent=2))
        return 0
    finally:
        pipe.close()

if __name__=="__main__":
    raise SystemExit(main())

