const LEDGER_HEADERS = [
  '거래ID','거래일','연월','재무거래유형','거래명','상세내역','금액','표준계정명','계정ID',
  '대분류','소분류','현금유입','현금유출','소득인식액','소비지출액','대출이자액','카드대금결제액',
  '자산간이동액','투자원금액','투자회수액','자기자금 부채원금상환','비손익 순자산조정액',
  '손익기준 순자산영향액','계산포함','검토상태','중복후보','중복키'
];
const SNAPSHOT_HEADERS = [
  'Run_ID','기준일','연월','원본섹션','원본항목','원본상품명','표준계정명','계정ID','자산부채','잔액',
  '대출원금/한도','대출잔액','잔여한도','금리','순자산영향액','이중계상제외','검토상태','Source_File','비고'
];
const IMPORT_LOG_HEADERS = [
  'Run_ID','Imported_At','Source_File','Period_Start','Period_End','Transaction_Rows_Read','Ledger_Inserted',
  'Ledger_Skipped','Ledger_Review','Snapshot_Rows','Unmapped_Snapshot_Accounts','BS_양수자산합계(보험·연금포함)',
  'Total_Liabilities','BS_보정순자산(보험·연금포함)','Overdraft_Available','Status','Notes','Finance_OS_비교순자산'
];

function doPost(e) {
  try {
    const body = JSON.parse((e.postData && e.postData.contents) || '{}');
    verifySecret_(body.secret || '');
    if (body.action === 'health') return json_({ok:true, message:'Finance OS Mobile backend ready', backendVersion:'0.4.0', policyVersion:'2.1.0'});
    if (body.action !== 'import') throw new Error('Unsupported action');
    return json_(importFinanceOs_(body));
  } catch (err) {
    return json_({ok:false, error:String(err && err.message ? err.message : err)});
  }
}

function verifySecret_(candidate) {
  const expected = PropertiesService.getScriptProperties().getProperty('APP_SECRET');
  if (!expected || expected.length < 24) throw new Error('APP_SECRET is not configured or too short.');
  if (candidate !== expected) throw new Error('Unauthorized');
}

function importFinanceOs_(body) {
  const reviewCount = Number(body.reviewCount || 0);
  const provisionalCount = Number(body.provisionalCount || 0);
  const unresolvedRows = (body.ledgerRows || []).filter(r => ['검토 필요','잠정'].indexOf(String(r['검토상태'] || '')) >= 0);
  if (reviewCount > 0 || provisionalCount > 0 || unresolvedRows.length > 0) {
    throw new Error('Unresolved transactions block import: review=' + reviewCount + ', provisional=' + provisionalCount + ', rows=' + unresolvedRows.length);
  }
  const p = PropertiesService.getScriptProperties();
  const spreadsheetId = p.getProperty('FINANCE_OS_SPREADSHEET_ID') || '1_r-t5GpVuRmNrcT7SqrWaH0yB4u4v2r19qm-AVY5tUA';
  const ss = SpreadsheetApp.openById(spreadsheetId);
  const ledgerSheet = ss.getSheetByName('01_거래원장');
  const snapshotSheet = ss.getSheetByName('BS_주간계정잔액');
  const logSheet = ss.getSheetByName('BS_Import_Log');
  if (!ledgerSheet || !snapshotSheet || !logSheet) throw new Error('Finance OS required sheets are missing.');

  ensureStandardExtensions_(ss);

  const existingKeys = existingLedgerKeys_(ledgerSheet);
  const incoming = body.ledgerRows || [];
  const newRows = incoming.filter(r => r['중복키'] && !existingKeys.has(String(r['중복키'])));
  if (newRows.length) {
    const values = newRows.map(r => LEDGER_HEADERS.map(h => normalizeSheetValue_(r[h])));
    ledgerSheet.getRange(ledgerSheet.getLastRow()+1, 1, values.length, LEDGER_HEADERS.length).setValues(values);
  }
  const serverSkipped = incoming.length - newRows.length;

  // Weekly snapshot is an upsert by 기준일: one canonical snapshot per date.
  deleteSnapshotForDate_(snapshotSheet, body.periodEnd);
  const snapshotRows = body.snapshotRows || [];
  if (snapshotRows.length) {
    const values = snapshotRows.map(r => SNAPSHOT_HEADERS.map(h => normalizeSheetValue_(r[h])));
    snapshotSheet.getRange(snapshotSheet.getLastRow()+1, 1, values.length, SNAPSHOT_HEADERS.length).setValues(values);
  }

  const runId = snapshotRows.length ? String(snapshotRows[0]['Run_ID'] || '') : ('BS-MOBILE-' + Date.now());
  const m = body.metrics || {};
  const log = {
    'Run_ID': runId,
    'Imported_At': Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss'),
    'Source_File': body.sourceFile || '',
    'Period_Start': body.periodStart || '',
    'Period_End': body.periodEnd || '',
    'Transaction_Rows_Read': Number(body.transactionRowsRead || 0),
    'Ledger_Inserted': newRows.length,
    'Ledger_Skipped': Number(body.localSkipped || 0) + serverSkipped,
    'Ledger_Review': Number(body.reviewCount || 0),
    'Snapshot_Rows': snapshotRows.length,
    'Unmapped_Snapshot_Accounts': Number(m.unmappedSnapshotAccounts || 0),
    'BS_양수자산합계(보험·연금포함)': Number(m.positiveAssets || 0),
    'Total_Liabilities': Number(m.totalLiabilities || 0),
    'BS_보정순자산(보험·연금포함)': Number(m.bsCorrectedNetWorth || 0),
    'Overdraft_Available': Number(m.availableOverdraft || 0),
    'Status': '완료',
    'Notes': 'BankSalad Android app import. Policy ' + String(body.policyVersion || 'unknown') + ' / ' + String(body.policyMode || '') + '. 마통 음수자산은 자산측 순자산에서 제외하고 부채로만 1회 인식. 잠정/검토 거래는 서버에서 차단.',
    'Finance_OS_비교순자산': Number(m.financeOsNetWorth || 0)
  };
  logSheet.getRange(logSheet.getLastRow()+1, 1, 1, IMPORT_LOG_HEADERS.length)
    .setValues([IMPORT_LOG_HEADERS.map(h => normalizeSheetValue_(log[h]))]);

  let notion = 'not-configured';
  try {
    notion = upsertNotionSnapshot_(body);
  } catch (notionErr) {
    notion = 'error: ' + String(notionErr.message || notionErr);
  }

  return {
    ok: true,
    ledgerInserted: newRows.length,
    ledgerSkipped: serverSkipped,
    snapshotRows: snapshotRows.length,
    notion: notion
  };
}

function existingLedgerKeys_(sheet) {
  const last = sheet.getLastRow();
  if (last < 2) return new Set();
  const values = sheet.getRange(2, 27, last-1, 1).getDisplayValues();
  return new Set(values.flat().filter(Boolean));
}

function deleteSnapshotForDate_(sheet, dateStr) {
  if (!dateStr || sheet.getLastRow() < 2) return;
  const values = sheet.getRange(2, 2, sheet.getLastRow()-1, 1).getValues();
  const rows = [];
  values.forEach((v, i) => { if (dateKey_(v[0]) === String(dateStr)) rows.push(i+2); });
  rows.sort((a,b) => b-a).forEach(row => sheet.deleteRow(row));
}

function dateKey_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value)) {
    return Utilities.formatDate(value, Session.getScriptTimeZone() || 'Asia/Seoul', 'yyyy-MM-dd');
  }
  const text = String(value || '').trim();
  const iso = text.match(/^(\d{4})[-./]\s*(\d{1,2})[-./]\s*(\d{1,2})/);
  if (iso) return iso[1] + '-' + ('0' + iso[2]).slice(-2) + '-' + ('0' + iso[3]).slice(-2);
  const kr = text.match(/^(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/);
  if (kr) return kr[1] + '-' + ('0' + kr[2]).slice(-2) + '-' + ('0' + kr[3]).slice(-2);
  return text.slice(0, 10);
}

function ensureStandardExtensions_(ss) {
  const sheet = ss.getSheetByName('15_표준분류');
  if (!sheet) return;
  const key = '기타유입·유출|보험금·보상금';
  const last = sheet.getLastRow();
  if (last >= 2) {
    const keys = sheet.getRange(2, 4, last-1, 1).getDisplayValues().flat();
    if (keys.indexOf(key) >= 0) return;
  }
  sheet.appendRow(['기타유입·유출','보험금·보상금',0,key,'사용','']);
}

function upsertNotionSnapshot_(body) {
  const p = PropertiesService.getScriptProperties();
  const token = p.getProperty('NOTION_TOKEN');
  const dataSourceId = p.getProperty('NOTION_DATA_SOURCE_ID') || '7fe4b6b5-3fe7-496e-b45c-8e557265c92d';
  if (!token) return 'not-configured';
  const m = body.metrics || {};
  const date = body.periodEnd;
  const title = date + ' BankSalad Weekly Snapshot';
  const reviewCount = Number(body.reviewCount || 0);
  const provisionalCount = Number(body.provisionalCount || 0);
  const unmapped = Number(m.unmappedSnapshotAccounts || 0);
  const dataStatus = (reviewCount === 0 && provisionalCount === 0 && unmapped === 0) ? '확정' : '잠정';
  const reconcileStatus = (reviewCount === 0 && provisionalCount === 0 && unmapped === 0) ? '일치' : '부분검증';

  const props = {
    '스냅샷명': {title:[{type:'text', text:{content:title}}]},
    '기준일': {date:{start:date}},
    '수집일': {date:{start:Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd')}},
    'Sheets 기준일': {date:{start:date}},
    'Founder 표시': {checkbox:true},
    '계좌·현금': {number:Number(m.financeCash || 0)},
    '가용현금': {number:Number(m.availableOverdraft || 0)},
    '투자평가액': {number:Number(m.investmentEval || 0)},
    '부동산평가액': {number:Number(m.realEstate || 0)},
    '기타자산': {number:Number(m.otherAssets || 0)},
    '자동차': {number:Number(m.car || 0)},
    '개인·퇴직연금': {number:Number(m.pensionAssets || 0)},
    '총부채': {number:Number(m.totalLiabilities || 0)},
    '7% 이상 부채': {number:Number(m.highRateLiabilities || 0)},
    '대사상태': {select:{name:reconcileStatus}},
    '자료상태': {select:{name:dataStatus}},
    '원본파일명': {rich_text:[{type:'text', text:{content:String(body.sourceFile || '')}}]},
    '검증메모': {rich_text:[{type:'text', text:{content:verificationMemo_(body).slice(0, 1900)}}]}
  };
  const premium = p.getProperty('MONTHLY_INSURANCE_PREMIUM');
  if (premium) props['월 보험료'] = {number:Number(premium)};

  const query = notionFetch_(token, 'https://api.notion.com/v1/data_sources/' + dataSourceId + '/query', 'post', {
    filter:{property:'기준일', date:{equals:date}}, page_size:1
  });
  let pageId = null;
  if (query.results && query.results.length) pageId = query.results[0].id;
  const markdown = snapshotMarkdown_(body, dataStatus, reconcileStatus);

  if (!pageId) {
    const created = notionFetch_(token, 'https://api.notion.com/v1/pages', 'post', {
      parent:{type:'data_source_id', data_source_id:dataSourceId},
      properties:props,
      markdown:markdown
    });
    return 'created:' + created.id;
  }

  notionFetch_(token, 'https://api.notion.com/v1/pages/' + pageId, 'patch', {properties:props});
  notionFetch_(token, 'https://api.notion.com/v1/pages/' + pageId + '/markdown', 'patch', {
    type:'replace_content', replace_content:{new_str:markdown}
  });
  return 'updated:' + pageId;
}

function notionFetch_(token, url, method, body) {
  const res = UrlFetchApp.fetch(url, {
    method: method,
    contentType: 'application/json',
    headers: {'Authorization':'Bearer ' + token, 'Notion-Version':'2026-03-11'},
    payload: JSON.stringify(body || {}),
    muteHttpExceptions: true
  });
  const code = res.getResponseCode();
  const text = res.getContentText();
  if (code < 200 || code >= 300) throw new Error('Notion HTTP ' + code + ': ' + text);
  return text ? JSON.parse(text) : {};
}

function verificationMemo_(body) {
  const m = body.metrics || {};
  return [
    'BankSalad Android app 자동 반영. Policy ' + String(body.policyVersion || 'unknown') + ' / mode ' + String(body.policyMode || '') + '.',
    '원본 거래 ' + Number(body.transactionRowsRead || 0) + '건.',
    '검토 필요 ' + Number(body.reviewCount || 0) + '건 / 잠정 ' + Number(body.provisionalCount || 0) + '건.',
    '총부채 ' + Number(m.totalLiabilities || 0) + '원, 가용현금 ' + Number(m.availableOverdraft || 0) + '원, 7% 이상 부채 ' + Number(m.highRateLiabilities || 0) + '원.',
    'Finance OS 비교가능 순자산 ' + Number(m.financeOsNetWorth || 0) + '원.',
    '마이너스통장 음수자산은 부채와 중복되므로 자산측 순자산 계산에서 제외.',
    'Snapshot 미매핑 계정 ' + Number(m.unmappedSnapshotAccounts || 0) + '개.',
    '투자게이트 ' + String(body.investmentGate || 'UNKNOWN') + '.'
  ].join(' ');
}

function snapshotMarkdown_(body, dataStatus, reconcileStatus) {
  const m = body.metrics || {};
  const money = n => Math.round(Number(n || 0)).toLocaleString('ko-KR') + '원';
  return [
    '## ' + body.periodEnd + ' 핵심 스냅샷',
    '',
    '- Finance Policy: **' + String(body.policyVersion || 'unknown') + ' / ' + String(body.policyMode || '') + '**',
    '- 투자게이트: **' + String(body.investmentGate || 'UNKNOWN') + '**',
    '- 계좌·현금: **' + money(m.financeCash) + '**',
    '- 가용현금: **' + money(m.availableOverdraft) + '**',
    '- 투자평가액: **' + money(m.investmentEval) + '**',
    '- 부동산평가액: **' + money(m.realEstate) + '**',
    '- 기타자산: **' + money(m.otherAssets) + '**',
    '- 자동차: **' + money(m.car) + '**',
    '- 총부채: **' + money(m.totalLiabilities) + '**',
    '- 7% 이상 부채: **' + money(m.highRateLiabilities) + '**',
    '- Finance OS 비교가능 순자산: **' + money(m.financeOsNetWorth) + '**',
    '',
    '## 거래 자동 반영',
    '',
    '- 원본 거래: **' + Number(body.transactionRowsRead || 0) + '건**',
    '- 검토 필요: **' + Number(body.reviewCount || 0) + '건**',
    '- 잠정: **' + Number(body.provisionalCount || 0) + '건**',
    '- 소비지출: **' + money(m.recognizedSpend) + '**',
    '- 대출이자: **' + money(m.recognizedInterest) + '**',
    '',
    '## 대사 상태',
    '',
    '- 자료상태: **' + dataStatus + '**',
    '- 대사상태: **' + reconcileStatus + '**',
    '- Snapshot 미매핑 계정: **' + Number(m.unmappedSnapshotAccounts || 0) + '개**',
    '',
    '> 마이너스통장 음수자산은 부채와 중복되므로 Finance OS에서는 부채로만 1회 인식합니다.'
  ].join('\n');
}

function normalizeSheetValue_(v) {
  if (v === null || typeof v === 'undefined') return '';
  if (v === '-') return '-';
  return v;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

