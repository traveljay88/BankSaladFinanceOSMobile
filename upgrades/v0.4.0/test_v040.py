#!/usr/bin/env python3
import importlib.util,json,sys
from pathlib import Path
spec=importlib.util.spec_from_file_location('finance_mod',Path(__file__).with_name('banksalad_finance_os.py'))
m=importlib.util.module_from_spec(spec); sys.modules[spec.name]=m; spec.loader.exec_module(m)
p=object.__new__(m.FinanceOSPipeline)
p.cfg={'merchant_overrides':[],'raw_category_map':{}}
p.pattern_rules=json.loads(Path(__file__).with_name('ledger_pattern_rules_v2.json').read_text(encoding='utf-8'))
p._settlement_offsets={}
acc=m.Account('카카오페이 머니','카카오페이 머니','ACC-X','wallet','확정')
def txn(i,date,typ,content,amt,major='기타',minor='기타'):
    return m.Txn(i,date,'12:00:00',typ,major,minor,content,amt,'KRW','카카오페이 머니','',f'k{i}',acc)
# N:1 settlement example: 44,000 expense + 3x 11,000 recovery
expense=txn(1,'2026-09-12','지출','맛자랑포차',-44000,'외식','음식점')
ins=[txn(2+i,'2026-09-13','이체',name,11000,'이체','미분류') for i,name in enumerate(['이*환','김*수','신*호'])]
one=txn(10,'2026-09-13','이체','키움223',1,'이체','미분류')
alltx=[expense,*ins,one]
p._apply_noise_filters(alltx); p._match_personal_settlements(alltx)
assert one.excluded_reason
assert sum(p._settlement_offsets.values())==33000
for x in ins:
    c=p.classify(x); assert (c['type'],c['major'],c['minor'],c['status'])==('정산','정산','일반 정산회수','확정')
ce=p.classify(expense); assert ce['spend']==11000,ce
cases=[
 ('공공기관',-4000,'여행·여가·문화','운동·레저'),
 ('정도진흥기업(주)강서점',-16000,'술·사교','술·유흥'),
 ('청담헤어 가양역점',-25000,'의복·미용','미용'),
 ('이편한세상치과의원 강서점',-104100,'의료·건강','병원·약국'),
 ('쿠팡이츠',-12400,'식비','배달'),
 ('후불하이패스43건',-117000,'교통·차량','통행료'),
 ('서울도시가스(주)',-4830,'주거·공과금','공과금'),
 ('맛자랑포차',-22900,'술·사교','술·유흥'),
]
for j,(content,amt,maj,mi) in enumerate(cases,20):
    c=p.classify(txn(j,'2026-09-13','지출',content,amt))
    assert (c['major'],c['minor'])==(maj,mi),(content,c)
print('PASS: settlement N:1, 1 KRW exclusion, current review-queue merchant rules')
print('settlement offset:',p._settlement_offsets,'personal spend:',ce['spend'])

