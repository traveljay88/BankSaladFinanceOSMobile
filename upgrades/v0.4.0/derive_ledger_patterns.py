#!/usr/bin/env python3
from __future__ import annotations
import json,re,sys,zipfile,xml.etree.ElementTree as ET
from collections import Counter,defaultdict
from datetime import datetime,timedelta
from pathlib import Path

NS_MAIN='http://schemas.openxmlformats.org/spreadsheetml/2006/main'
NS_REL='http://schemas.openxmlformats.org/officeDocument/2006/relationships'
NS_PKG_REL='http://schemas.openxmlformats.org/package/2006/relationships'

def norm(v): return re.sub(r'\s+',' ',str(v or '')).strip()
def excel_date(v):
    if isinstance(v,str) and re.fullmatch(r'\d{4}-\d{2}-\d{2}',v): return v
    try: return (datetime(1899,12,30)+timedelta(days=float(v))).date().isoformat()
    except Exception: return ''
def colidx(ref):
    s=re.match(r'([A-Z]+)',ref).group(1); n=0
    for c in s: n=n*26+ord(c)-64
    return n-1
class Reader:
    def __init__(self,p):
        self.z=zipfile.ZipFile(p); self.shared=self._shared(); self.paths=self._paths()
    def _shared(self):
        try: root=ET.fromstring(self.z.read('xl/sharedStrings.xml'))
        except KeyError:return []
        return [''.join((t.text or '') for t in si.iter(f'{{{NS_MAIN}}}t')) for si in root.findall(f'{{{NS_MAIN}}}si')]
    def _paths(self):
        wb=ET.fromstring(self.z.read('xl/workbook.xml')); rels=ET.fromstring(self.z.read('xl/_rels/workbook.xml.rels'))
        rm={r.attrib['Id']:r.attrib['Target'] for r in rels.findall(f'{{{NS_PKG_REL}}}Relationship')}; out={}
        for s in wb.find(f'{{{NS_MAIN}}}sheets'):
            t=rm[s.attrib[f'{{{NS_REL}}}id']]; out[s.attrib['name']]=t.lstrip('/') if t.startswith('/') else 'xl/'+t.lstrip('/')
        return out
    def rows(self,name):
        root=ET.fromstring(self.z.read(self.paths[name])); data=root.find(f'{{{NS_MAIN}}}sheetData')
        out=[]
        for r in data.findall(f'{{{NS_MAIN}}}row'):
            cells={}; m=-1
            for c in r.findall(f'{{{NS_MAIN}}}c'):
                i=colidx(c.attrib['r']); m=max(m,i); typ=c.attrib.get('t')
                if typ=='inlineStr':
                    node=c.find(f'{{{NS_MAIN}}}is'); val=''.join((t.text or '') for t in node.iter(f'{{{NS_MAIN}}}t')) if node is not None else ''
                else:
                    v=c.find(f'{{{NS_MAIN}}}v'); raw=v.text if v is not None else ''
                    if typ=='s' and raw!='': val=self.shared[int(raw)]
                    elif typ=='b': val=raw=='1'
                    elif typ in ('str','e'): val=raw
                    else:
                        try:
                            x=float(raw); val=int(x) if x.is_integer() else x
                        except: val=raw
                cells[i]=val
            row=[None]*(m+1 if m>=0 else 0)
            for i,v in cells.items(): row[i]=v
            out.append(row)
        return out

def person_name(s):
    s=norm(s)
    return bool(re.fullmatch(r'[가-힣]{1,2}\*?[가-힣]{1,2}',s) or re.fullmatch(r'[가-힣]{2,4}',s))

def ambiguous_merchant(s):
    u=norm(s).lower()
    toks=['쿠팡','쿠페이','카카오페이','네이버페이','gs25','(gs)25','지에스','cu ','씨유','세븐일레븐','이마트24','나이스정보통신','kcp','inicis','토스페이','페이코','주택금융공사','저축은행','카드(주)','카드대금']
    return any(t.lower() in u for t in toks)

def keyclean(s):
    s=norm(s)
    s=re.sub(r'\s+',' ',s)
    return s

def main():
    inp=Path(sys.argv[1]); outp=Path(sys.argv[2])
    rd=Reader(inp); rows=rd.rows('01_거래원장'); hdr=[norm(x) for x in rows[0]]
    idx={h:i for i,h in enumerate(hdr) if h}
    groups=defaultdict(list); amount_groups=defaultdict(list)
    category_counts=Counter(); total=0; confirmed=0; recent=0
    for r in rows[1:]:
        def get(k):
            i=idx.get(k,-1); return r[i] if i>=0 and i<len(r) else None
        d=excel_date(get('거래일'))
        if not d or d<'2024-01-01': continue
        total+=1
        if norm(get('검토상태'))!='확정': continue
        confirmed+=1
        typ,maj,minr=norm(get('재무거래유형')),norm(get('대분류')),norm(get('소분류'))
        merchant=keyclean(get('거래명')); amount=abs(float(get('금액') or 0))
        if not merchant or merchant in ('-','미상'): continue
        category_counts[(typ,maj,minr)]+=1
        rec={'date':d,'amount':amount,'type':typ,'major':maj,'minor':minr}
        groups[merchant].append(rec); amount_groups[(merchant,round(amount))].append(rec)
        if d>='2026-01-01': recent+=1
    exact=[]; amount_specific=[]
    for merchant,recs in groups.items():
        if person_name(merchant) or ambiguous_merchant(merchant): continue
        cats=Counter((x['type'],x['major'],x['minor']) for x in recs)
        best,n=cats.most_common(1)[0]; consistency=n/len(recs)
        rec26=[x for x in recs if x['date']>='2026-01-01']
        recent_n=len(rec26)
        if best[0] in ('소비지출','환불·취소','소득') and recent_n>=1 and (len(recs)>=4 or recent_n>=2) and consistency>=0.98 and best[2] not in ('사용처 검증 필요',''):
            exact.append({'merchant':merchant,'count_2024_2026':len(recs),'count_2026':recent_n,'consistency':round(consistency,4),'action':{'type':best[0],'major':best[1],'minor':best[2],'status':'자동확정'}})
    # For ambiguous merchants, only learn amount-specific exact combinations when repeated consistently.
    for (merchant,amt),recs in amount_groups.items():
        if not ambiguous_merchant(merchant): continue
        cats=Counter((x['type'],x['major'],x['minor']) for x in recs); best,n=cats.most_common(1)[0]
        if len(recs)>=2 and n==len(recs) and best[2] not in ('사용처 검증 필요',''):
            amount_specific.append({'merchant':merchant,'amount':amt,'count':len(recs),'action':{'type':best[0],'major':best[1],'minor':best[2],'status':'자동확정'}})
    exact.sort(key=lambda x:(-x['count_2026'],-x['count_2024_2026'],x['merchant']))
    amount_specific.sort(key=lambda x:(-x['count'],x['merchant'],x['amount']))
    result={
      'version':'2.0.0','generated_from':'Finance OS 01_거래원장','window':'2024-01-01~latest','stats':{'rows_window':total,'confirmed_rows':confirmed,'rows_2026':recent,'stable_exact_merchant_rules':len(exact),'stable_amount_specific_rules':len(amount_specific)},
      'hard_rules':[
        {'id':'exclude_all_1won','match':{'amount_abs_equals':1},'action':{'semantics':'exclude','reason':'본인인증 1원 거래'}},
        {'id':'public_agency_swimming','match':{'content_equals':'공공기관','amount_abs_equals':4000},'action':{'type':'소비지출','major':'여행·여가·문화','minor':'운동·레저','status':'확정','name':'수영장 이용료'}},
        {'id':'balssan_station_hof','match':{'content_equals':'정도진흥기업(주)강서점'},'action':{'type':'소비지출','major':'술·사교','minor':'술·유흥','status':'확정','name':'발산역 역전할머니맥주'}},
        {'id':'person_inflow_settlement_candidate','match':{'raw_type_equals':'이체','direction':'inflow','content_person_name':True,'paired':False},'action':{'type':'정산','major':'정산','minor':'일반 정산회수','status':'candidate'}}
      ],
      'stable_exact_merchants':exact,
      'stable_amount_specific':amount_specific,
      'ambiguous_merchant_denylist':['쿠팡_쿠페이','카카오페이 미매칭 이체','편의점','일반 PG사'],
      'settlement_matching':{'window_days':7,'auto_score_threshold':82,'review_score_threshold':62,'prefer_previous_or_same_day':True,'supports_one_to_many':True,'supports_many_to_one':True}
    }
    outp.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(result['stats'],ensure_ascii=False,indent=2))
    print('top exact rules:')
    for x in exact[:25]: print(x)

if __name__=='__main__': main()

