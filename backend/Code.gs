/**********************************************************************
 * FINANCE OS SERVER BRAIN v1.5.2 APPEND/DEDUP/HISTORY UX
 * Consolidated replacement source. No duplicate top-level function names.
 * Base + RR1 + CI1 + CI2 + QUICKBOOT + PERFORMANCE + PERSONAL SETTLEMENT POLICY.
 * Generated 2026-09-15.
 * User policy: outgoing KakaoPay = shared-meal/drink repayment recommendation;
 * incoming KakaoPay = settlement recovery + expense netting; Coupang = per transaction.
 * v1.5.2: lock-safe canonical append support, stable dedup guard, nearest-history review recommendations.
 **********************************************************************/

/**********************************************************************
 * COMPLETE REPLACEMENT SOURCE
 * FINANCE OS · BANKSALAD SERVER BRAIN v1.5.2
 * Date: 2026-09-15
 *
 * HOW TO APPLY
 * 1) Replace the entire Apps Script Code.gs with THIS WHOLE FILE.
 * 2) Save.
 * 3) Run TEST_SERVER_BRAIN_SETUP once from the editor.
 * 4) Update the existing Web App deployment to a new version.
 *
 * IMPORTANT
 * - This file already contains the Server Brain body + RR1 + CI1 + CI2.
 * - Do NOT append the old RR1/CI1/CI2 patch files after this source.
 * - Existing canonical Finance OS sheets are preserved.
 **********************************************************************/

/**********************************************************************
 * FINANCE OS · BANKSALAD SERVER BRAIN
 * Backend       : 1.5.0
 * Policy        : 3.5.0
 * Protocol      : 1
 *
 * 설계 원칙
 * --------------------------------------------------------------------
 * 1) 기존 Finance OS 시트는 삭제/재생성/이름변경/헤더 덮어쓰기 금지.
 * 2) 기존 정본 시트 위에 SB_ 보조 시트만 추가한다.
 * 3) Android는 ZIP 해제 + RAW 파싱 + 범용 Review UI만 담당한다.
 * 4) 분류/학습/정산/검토/Commit은 Apps Script가 담당한다.
 * 5) HIGH RISK review만 Commit을 차단한다.
 * 6) LOW RISK review는 보류한 채 확정 거래만 먼저 반영 가능하다.
 * 7) 사용자 확정은 exact correction + 반복학습 후보로 저장한다.
 * 8) 1원 거래는 본인인증 노이즈로 자동 제외한다.
 * 9) 개인명 입금은 사용자 정책에 따라 기본적으로 정산회수로 본다.
 * 10) 기존 action=import도 유지하여 현재 APK와 하위 호환한다.
 **********************************************************************/


/**********************************************************************
 * VERSION
 **********************************************************************/

const BACKEND_VERSION = '1.5.2';
const POLICY_VERSION = '3.5.2';
const PROTOCOL_VERSION = 1;


/**********************************************************************
 * EXISTING + ADD-ON SHEETS
 **********************************************************************/

const SHEETS = {
  // Existing Finance OS canonical sheets. Never auto-create or rename.
  LEDGER: '01_거래원장',
  SNAPSHOT: 'BS_주간계정잔액',
  IMPORT_LOG: 'BS_Import_Log',
  STANDARD: '15_표준분류',
  ACCOUNT_MASTER: '02_계정마스터',
  ACCOUNT_ALIAS: '03_계정별칭',

  // Server Brain add-on sheets. Created only when missing.
  RAW: 'SB_Raw_BankSalad',
  REVIEW: 'SB_Review_Queue',
  SETTLEMENT: 'SB_Settlement_Link',
  ANALYSIS: 'SB_Analysis_Run',
  STAGING: 'SB_Analysis_Staging',
  RULES: 'SB_Rule_Master',
  MERCHANT: 'SB_Merchant_Profile',
  PERSON: 'SB_Person_Profile',
  LEARNING: 'SB_AutoLearning',
  CORRECTIONS: 'SB_User_Corrections',
  CONFIG: 'SB_System_Config'
};


/**********************************************************************
 * EXISTING CANONICAL HEADERS
 **********************************************************************/

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

// Existing Import Log columns are preserved. These are added only if missing.
const IMPORT_LOG_EXTENSION_HEADERS = [
  'App_Duplicates','Server_Duplicates','Auto_Excluded','Auto_Confirmed',
  'Settlement_Recovery','Settlement_Matched','Review_Low','Review_High',
  'Backend_Version','Policy_Version','Protocol_Version'
];


/**********************************************************************
 * SERVER BRAIN ADD-ON HEADERS
 **********************************************************************/

const RAW_HEADERS = [
  'Analysis_ID','Source_Key','Source_Row','Date','Time','Raw_Type','Raw_Major','Raw_Minor',
  'Merchant','Signed_Amount','Payment','Memo','Account','Status','Reason','Raw_JSON','Created_At'
];

const REVIEW_HEADERS = [
  'Review_ID','Analysis_ID','Source_Key','Review_Type','Risk','Date','Merchant','Amount','Status','Reason',
  'Recommended_Type','Recommended_Major','Recommended_Minor','Confidence','Matched_Source_Key','Options_JSON',
  'User_Type','User_Major','User_Minor','Learn_Pattern','Created_At','Resolved_At'
];

const SETTLEMENT_HEADERS = [
  'Settlement_ID','Analysis_ID','Recovery_Source_Key','Expense_Source_Key','Recovery_Date','Expense_Date',
  'Recovery_Amount','Gross_Expense','Recovered_Total','Net_Personal_Spend','Score','Status','Reason',
  'Created_At','Updated_At'
];

const ANALYSIS_HEADERS = [
  'Analysis_ID','Created_At','Source_File','Period_Start','Period_End','Transaction_Rows_Read','Status',
  'Duplicate_Count','Review_Low','Review_High','Auto_Excluded','Auto_Confirmed','Settlement_Recovery',
  'Settlement_Matched','Metrics_JSON','Snapshot_JSON','Protocol_Version','Backend_Version','Policy_Version'
];

const STAGING_HEADERS = [
  'Analysis_ID','Source_Key','Status','Risk','Confidence','Classification_Source',
  'Ledger_JSON','Raw_JSON','Settlement_JSON','Created_At','Updated_At'
];

const RULE_HEADERS = [
  'Rule_ID','Enabled','Priority','Match_Type','Field','Pattern','Amount_Min','Amount_Max',
  'Payment_Pattern','Raw_Major_Pattern','Result_Type','Result_Major','Result_Minor',
  'Confidence','Risk','Note','Created_At','Updated_At'
];

const MERCHANT_HEADERS = [
  'Merchant_Key','Merchant_Display','Observations','Dominant_Type','Dominant_Major','Dominant_Minor',
  'Dominant_Count','Conflict_Count','Confidence','Counts_JSON','Auto_Eligible','First_Seen','Last_Seen','Updated_At'
];

const PERSON_HEADERS = [
  'Person_Key','Display_Name','Settlement_Count','Other_Count','Confidence','First_Seen','Last_Seen','Updated_At'
];

const LEARNING_HEADERS = [
  'Pattern_Key','Merchant_Key','Amount','Raw_Major','Payment','Result_Type','Result_Major','Result_Minor',
  'Confirm_Count','Conflict_Count','Status','First_Seen','Last_Seen'
];

const CORRECTION_HEADERS = [
  'Source_Key','Result_Type','Result_Major','Result_Minor','Merchant','Amount','Raw_Major','Payment',
  'Learn_Pattern','Created_At','Updated_At'
];

const CONFIG_HEADERS = ['Key','Value','Description','Updated_At'];


/**********************************************************************
 * CONFIG DEFAULTS
 **********************************************************************/

const DEFAULT_CONFIG = {
  ONE_WON_EXCLUDE: 'TRUE',
  PERSON_SETTLEMENT_DEFAULT: 'TRUE',
  SETTLEMENT_WINDOW_DAYS: '7',
  SETTLEMENT_AUTO_SCORE: '95',
  SETTLEMENT_REVIEW_SCORE: '75',
  INTERNAL_TRANSFER_SECONDS: '2',
  AUTO_CONFIRM_MIN_CONFIDENCE: '95',
  MERCHANT_AUTO_MIN_COUNT: '3',
  MERCHANT_AUTO_CONFIDENCE: '0.98',
  MERCHANT_LOOKBACK_DAYS: '730',
  LEARN_PROMOTE_COUNT: '3',
  LOW_RISK_COMMIT_ALLOWED: 'TRUE',
  INTRA_RUN_DEDUP: 'TRUE',
  REVIEW_SUPERSEDE: 'TRUE'
};


/**********************************************************************
 * WEB APP ENTRY
 **********************************************************************/

function doPost(e) {
  try {
    const body = JSON.parse((e.postData && e.postData.contents) || '{}');
    verifySecret_(body.secret || '');
    ensureServerBrain_();

    const action = text_(body.action);

    if (action === 'health') return json_(healthResponse_());
    if (action === 'analyze') return json_(withScriptLock_(function () { return analyzeRawTransactions_(body); }));
    if (action === 'getReviewQueue') return json_(getReviewQueue_(body));
    if (action === 'confirmReview') return json_(withScriptLock_(function () { return confirmReview_(body); }));
    if (action === 'commit') return json_(withScriptLock_(function () { return commitAnalysis_(body); }));

    // Current installed APK compatibility.
    if (action === 'import') return json_(withScriptLock_(function () { return legacyImport_(body); }));

    throw new Error('Unsupported action: ' + action);
  } catch (err) {
    return json_({
      ok: false,
      backendVersion: BACKEND_VERSION,
      policyVersion: POLICY_VERSION,
      protocolVersion: PROTOCOL_VERSION,
      error: String(err && err.message ? err.message : err)
    });
  }
}


/**********************************************************************
 * HEALTH / FEATURE FLAGS
 **********************************************************************/

/* [v1.4.3 CLEAN] superseded duplicate function removed: healthResponse_ */


/**********************************************************************
 * AUTH / LOCK
 **********************************************************************/

function verifySecret_(candidate) {
  const expected = PropertiesService.getScriptProperties().getProperty('APP_SECRET');
  if (!expected || expected.length < 24) throw new Error('APP_SECRET is not configured or too short.');
  if (candidate !== expected) throw new Error('Unauthorized');
}

function withScriptLock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('Finance OS is busy. Retry shortly.');
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}


/**********************************************************************
 * INITIAL SETUP
 * Run this once manually after pasting the script.
 **********************************************************************/

/* [v1.4.3 CLEAN] superseded duplicate function removed: setupFinanceOsServerBrain */


/**********************************************************************
 * SAFE INITIALIZATION
 **********************************************************************/

function ensureServerBrain_() {
  const cacheKey = 'FINANCE_OS_SCHEMA_READY_' + BACKEND_VERSION;
  try {
    if (CacheService.getScriptCache().get(cacheKey) === '1') return;
  } catch (cacheReadError) {}

  const ss = financeSpreadsheet_();

  // Existing canonical sheets: verify only. Never auto-create or overwrite headers.
  const ledger = requireExistingSheet_(ss, SHEETS.LEDGER);
  const snapshot = requireExistingSheet_(ss, SHEETS.SNAPSHOT);
  const importLog = requireExistingSheet_(ss, SHEETS.IMPORT_LOG);
  requireExistingSheet_(ss, SHEETS.STANDARD);

  validateExistingHeaders_(ledger, ['거래일','재무거래유형','거래명','금액','대분류','소분류','검토상태','중복키']);
  validateExistingHeaders_(snapshot, ['기준일']);
  validateExistingHeaders_(importLog, ['Run_ID','Imported_At','Source_File','Period_Start','Period_End']);

  // Add-on sheets: create only if missing; append only missing columns.
  ensureAddonSheet_(ss, SHEETS.RAW, RAW_HEADERS);
  ensureAddonSheet_(ss, SHEETS.REVIEW, REVIEW_HEADERS);
  ensureAddonSheet_(ss, SHEETS.SETTLEMENT, SETTLEMENT_HEADERS);
  ensureAddonSheet_(ss, SHEETS.ANALYSIS, ANALYSIS_HEADERS);
  ensureAddonSheet_(ss, SHEETS.STAGING, STAGING_HEADERS);
  ensureAddonSheet_(ss, SHEETS.RULES, RULE_HEADERS);
  ensureAddonSheet_(ss, SHEETS.MERCHANT, MERCHANT_HEADERS);
  ensureAddonSheet_(ss, SHEETS.PERSON, PERSON_HEADERS);
  ensureAddonSheet_(ss, SHEETS.LEARNING, LEARNING_HEADERS);
  ensureAddonSheet_(ss, SHEETS.CORRECTIONS, CORRECTION_HEADERS);
  ensureAddonSheet_(ss, SHEETS.CONFIG, CONFIG_HEADERS);

  appendMissingHeaders_(importLog, IMPORT_LOG_EXTENSION_HEADERS);
  seedConfig_();
  seedBaseRules_();

  // Cross-execution cache removes repeated setup I/O from every app request.
  try {
    CacheService.getScriptCache().put(cacheKey, '1', 21600); // 6h
  } catch (cacheWriteError) {}
}

function financeSpreadsheet_() {
  const p = PropertiesService.getScriptProperties();
  const spreadsheetId = p.getProperty('FINANCE_OS_SPREADSHEET_ID') || '1_r-t5GpVuRmNrcT7SqrWaH0yB4u4v2r19qm-AVY5tUA';
  return SpreadsheetApp.openById(spreadsheetId);
}

function requireExistingSheet_(ss, name) {
  const sheet = ss.getSheetByName(name);
  if (!sheet) throw new Error('기존 Finance OS 필수 시트를 찾을 수 없습니다: ' + name + '. 자동 생성하지 않습니다.');
  return sheet;
}

function validateExistingHeaders_(sheet, requiredHeaders) {
  const headers = sheetHeaders_(sheet);
  const missing = requiredHeaders.filter(function (h) { return headers.indexOf(h) < 0; });
  if (missing.length) {
    throw new Error(sheet.getName() + ' 기존 헤더가 예상과 다릅니다. 자동 수정하지 않습니다. 누락: ' + missing.join(', '));
  }
}

function ensureAddonSheet_(ss, name, requiredHeaders) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    ensureColumnCapacity_(sheet, requiredHeaders.length);
    sheet.getRange(1, 1, 1, requiredHeaders.length).setValues([requiredHeaders]);
    sheet.setFrozenRows(1);
    return sheet;
  }
  appendMissingHeaders_(sheet, requiredHeaders);
  return sheet;
}

function appendMissingHeaders_(sheet, requiredHeaders) {
  let headers = sheetHeaders_(sheet);
  const missing = requiredHeaders.filter(function (h) { return headers.indexOf(h) < 0; });
  if (!missing.length) return;

  const startColumn = Math.max(sheet.getLastColumn(), 1) + 1;
  ensureColumnCapacity_(sheet, startColumn + missing.length - 1);
  sheet.getRange(1, startColumn, 1, missing.length).setValues([missing]);
}

function ensureColumnCapacity_(sheet, requiredColumns) {
  if (sheet.getMaxColumns() >= requiredColumns) return;
  sheet.insertColumnsAfter(sheet.getMaxColumns(), requiredColumns - sheet.getMaxColumns());
}

function sheetHeaders_(sheet) {
  const last = Math.max(sheet.getLastColumn(), 1);
  return sheet.getRange(1, 1, 1, last).getDisplayValues()[0].map(function (v) { return String(v || '').trim(); });
}


/**********************************************************************
 * CONFIG
 **********************************************************************/

function seedConfig_() {
  const sheet = financeSpreadsheet_().getSheetByName(SHEETS.CONFIG);
  const current = readTableMap_(sheet, 'Key');

  Object.keys(DEFAULT_CONFIG).forEach(function (key) {
    if (current[key]) return;
    appendObjectRow_(sheet, {
      Key: key,
      Value: DEFAULT_CONFIG[key],
      Description: configDescription_(key),
      Updated_At: now_()
    });
  });
}

/* [v1.4.3 CLEAN] superseded duplicate function removed: configDescription_ */

/* [v1.4.3 CLEAN] superseded duplicate function removed: loadConfig_ */


/**********************************************************************
 * BASE RULES
 * Additive only. Existing rules are never replaced.
 **********************************************************************/

function seedBaseRules_() {
  const sheet = financeSpreadsheet_().getSheetByName(SHEETS.RULES);
  const existingIds = new Set(tableObjects_(sheet).map(function (r) { return text_(r.Rule_ID); }));

  const seeds = [
    {
      id: 'USER-PUBLIC-SWIM-4000', priority: 20, matchType: 'contains', field: 'merchant', pattern: '공공기관',
      amountMin: 4000, amountMax: 4000,
      type: '소비지출', major: '여행·여가·문화', minor: '운동·레저', confidence: 100, risk: 'LOW',
      note: '사용자 확인: 공공기관 4,000원 = 수영장'
    },
    {
      id: 'USER-JEONGDO-BALSAN', priority: 20, matchType: 'contains', field: 'merchant', pattern: '정도진흥기업',
      type: '소비지출', major: '술·사교', minor: '술·유흥', confidence: 100, risk: 'LOW',
      note: '사용자 확인: 발산역 역전할머니맥주'
    },
    {
      id: 'USER-EASY-DENTAL', priority: 25, matchType: 'contains', field: 'merchant', pattern: '이편한세상치과',
      type: '소비지출', major: '의료·건강', minor: '병원·약국', confidence: 100, risk: 'LOW',
      note: '사용자 확인 치과'
    },
    {
      id: 'USER-CHEONGDAM-HAIR', priority: 25, matchType: 'contains', field: 'merchant', pattern: '청담헤어',
      type: '소비지출', major: '의복·미용', minor: '미용', confidence: 100, risk: 'LOW',
      note: '사용자 확인 미용실'
    },
    {
      id: 'COUPANG-EATS', priority: 45, matchType: 'contains', field: 'merchant', pattern: '쿠팡이츠',
      type: '소비지출', major: '식비', minor: '배달', confidence: 99, risk: 'LOW',
      note: '배달 플랫폼'
    },
    {
      id: 'TOLL-HIPASS', priority: 45, matchType: 'contains', field: 'merchant', pattern: '하이패스',
      type: '소비지출', major: '교통·차량', minor: '통행료', confidence: 99, risk: 'LOW',
      note: '하이패스 통행료'
    },
    {
      id: 'UTILITY-SEOUL-GAS', priority: 45, matchType: 'contains', field: 'merchant', pattern: '서울도시가스',
      type: '소비지출', major: '주거·공과금', minor: '공과금', confidence: 99, risk: 'LOW',
      note: '도시가스 공과금'
    },
    {
      id: 'ALCOHOL-VENUE-KEYWORD', priority: 60, matchType: 'regex', field: 'merchant',
      pattern: '(포차|호프|역전할맥|역전할머니맥주)',
      type: '소비지출', major: '술·사교', minor: '술·유흥', confidence: 97, risk: 'LOW',
      note: '술집 업종 키워드'
    }
  ];

  seeds.forEach(function (s) {
    if (existingIds.has(s.id)) return;
    appendObjectRow_(sheet, {
      Rule_ID: s.id,
      Enabled: true,
      Priority: s.priority,
      Match_Type: s.matchType,
      Field: s.field,
      Pattern: s.pattern,
      Amount_Min: s.amountMin === undefined ? '' : s.amountMin,
      Amount_Max: s.amountMax === undefined ? '' : s.amountMax,
      Payment_Pattern: s.paymentPattern || '',
      Raw_Major_Pattern: s.rawMajorPattern || '',
      Result_Type: s.type,
      Result_Major: s.major,
      Result_Minor: s.minor,
      Confidence: s.confidence,
      Risk: s.risk,
      Note: s.note,
      Created_At: now_(),
      Updated_At: now_()
    });
  });
}


/**********************************************************************
 * ANALYZE
 **********************************************************************/

function analyzeRawTransactions_(body) {
  const startedAtMs = Date.now();
  const rawInput = Array.isArray(body.rawTransactions) ? body.rawTransactions : [];
  if (!rawInput.length) throw new Error('rawTransactions is empty');

  const cfg = loadConfig_();
  const standard = loadStandardCategories_();
  const analysisId = 'AN-' + Utilities.getUuid();
  const normalized = rawInput.map(function (r, i) { return normalizeRawTransaction_(r, i); });
  const existingKeys = existingLedgerKeys_();
  const existingStableKeys = existingRawStableKeys_();

  // 1) Existing canonical duplicates.
  // Exact canonical key is authoritative. A conservative stable raw fingerprint
  // is a second guard for re-exports where memo/category text changed.
  normalized.forEach(function (tx) {
    if (existingKeys.has(tx.sourceKey)) {
      tx.preStatus = 'DUPLICATE';
      tx.preReason = '기존 Finance OS 중복키';
    } else if (tx.stableDedupKey && existingStableKeys.has(tx.stableDedupKey)) {
      tx.preStatus = 'DUPLICATE';
      tx.preReason = '기존 BankSalad 원본 안정지문 중복';
    }
  });

  // 1B) Same payload can contain duplicate rows from overlapping BankSalad sections.
  // Keep the first source key only; later copies must never reach staging/commit as economic rows.
  if (cfg.intraRunDedup) markIntraRunDuplicates_(normalized);

  // 2) Exact 1 KRW identity/account verification noise.
  if (cfg.oneWonExclude) {
    normalized.forEach(function (tx) {
      if (tx.preStatus) return;
      if (Math.abs(tx.signedAmount) === 1) {
        tx.preStatus = 'EXCLUDED';
        tx.preReason = '1원 본인인증 자동 제외';
      }
    });
  }

  // 3) Internal transfer pairing before any settlement logic.
  pairInternalTransfers_(normalized, cfg);

  const context = {
    cfg: cfg,
    standard: standard,
    corrections: loadCorrectionMap_(),
    rules: loadRuleMaster_(),
    merchantProfiles: loadMerchantProfiles_(),
    personProfiles: loadPersonProfiles_(),
    accountTransferMap: loadAccountTransferMap_(),
    txBySourceKey: normalized.reduce(function (m, tx) { m[tx.sourceKey] = tx; return m; }, {})
  };

  // 4) Base classification.
  const results = normalized.map(function (tx) { return classifyBase_(tx, context); });

  // 5) Person settlement + N:1 matching.
  const settlementOutcome = applySettlementEngine_(normalized, results, context, analysisId);

  // 6) Staging and audit.
  writeRawRows_(analysisId, normalized, results);
  writeSettlementLinks_(settlementOutcome.links);
  writeStagingRows_(analysisId, normalized, results, settlementOutcome);

  // 7) Review queue.
  const reviews = buildAndWriteReviews_(analysisId, normalized, results, settlementOutcome, context);
  const summary = summarizeAnalysis_(normalized, results, reviews, settlementOutcome);

  const periodStart = minDate_(normalized.map(function (x) { return x.date; }));
  const periodEnd = maxDate_(normalized.map(function (x) { return x.date; }));

  writeAnalysisRun_({
    analysisId: analysisId,
    sourceFile: text_(body.sourceFile),
    periodStart: periodStart,
    periodEnd: periodEnd,
    summary: summary,
    metrics: body.metrics || {},
    snapshotRows: Array.isArray(body.snapshotRows) ? body.snapshotRows : []
  });

  return {
    ok: true,
    analysisId: analysisId,
    backendVersion: BACKEND_VERSION,
    policyVersion: POLICY_VERSION,
    protocolVersion: PROTOCOL_VERSION,
    periodStart: periodStart,
    periodEnd: periodEnd,
    summary: summary,
    canCommit: summary.reviewHigh === 0,
    pendingLowRiskReview: summary.reviewLow,
    reviewQueue: reviews.map(reviewForClient_),
    uiSchema: buildUiSchema_(standard),
    processingMs: Date.now() - startedAtMs
  };
}


/**********************************************************************
 * RAW NORMALIZATION / SOURCE KEY
 **********************************************************************/

function normalizeRawTransaction_(raw, index) {
  const date = dateKey_(raw.date || raw['날짜'] || raw['거래일'] || '');
  const time = normalizeTime_(raw.time || raw['시간'] || '');
  const rawType = text_(raw.rawType || raw.type || raw['타입'] || raw['거래유형'] || raw['재무거래유형']);
  const rawMajor = text_(raw.rawMajor || raw['대분류']);
  const rawMinor = text_(raw.rawMinor || raw['소분류']);
  const merchant = text_(raw.merchant || raw.content || raw['내용'] || raw['거래명']);
  const payment = text_(raw.payment || raw['결제수단'] || raw['표준계정명']);
  const memo = text_(raw.memo || raw['메모'] || raw['상세내역']);
  const account = text_(raw.account || raw['계좌']);
  const signedAmount = inferSignedAmount_(raw, rawType);

  const sourceKey = buildSourceKey_({
    date: date,
    time: time,
    rawType: rawType,
    merchant: merchant,
    signedAmount: signedAmount,
    payment: payment,
    memo: memo
  });
  const stableDedupKey = buildStableDedupKey_({
    date: date,
    time: time,
    rawType: rawType,
    merchant: merchant,
    signedAmount: signedAmount,
    payment: payment,
    account: account
  });

  return {
    sourceRow: raw.sourceRow || raw['sourceRow'] || index + 2,
    index: index,
    date: date,
    time: time,
    rawType: rawType,
    rawMajor: rawMajor,
    rawMinor: rawMinor,
    merchant: merchant,
    merchantKey: normalizeMerchant_(merchant),
    signedAmount: signedAmount,
    payment: payment,
    memo: memo,
    account: account,
    sourceKey: sourceKey,
    stableDedupKey: stableDedupKey,
    pairSourceKey: '',
    pairMirror: false,
    preStatus: '',
    preReason: '',
    original: raw
  };
}

function inferSignedAmount_(raw, rawType) {
  if (raw.signedAmount !== undefined && raw.signedAmount !== null && raw.signedAmount !== '') {
    return numberSigned_(raw.signedAmount);
  }

  const original = raw.amount !== undefined ? raw.amount : raw['금액'];
  let n = numberSigned_(original);
  if (n < 0) return n;

  const direction = text_(raw.direction || raw['입출금']).toLowerCase();
  if (direction === 'out' || direction === '출금') return -Math.abs(n);
  if (direction === 'in' || direction === '입금') return Math.abs(n);
  if (/지출|결제|출금/.test(rawType)) return -Math.abs(n);
  if (/수입|입금/.test(rawType)) return Math.abs(n);

  return n;
}

function buildSourceKey_(x) {
  const raw = [x.date, x.time, x.rawType, x.merchant, x.signedAmount, x.payment, x.memo].join('|');
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw, Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('').slice(0, 32);
}

// Conservative second-line duplicate key. Require a usable time so same-day
// legitimate repeated purchases are not collapsed merely by merchant + amount.
// Memo and BankSalad category labels are intentionally excluded because those
// can change between exports while the underlying transaction is the same.
function buildStableDedupKey_(x) {
  const date = dateKey_(x && x.date);
  const time = normalizeTime_(x && x.time);
  const merchant = normalizeMerchant_(x && x.merchant);
  const amount = numberSigned_(x && x.signedAmount);
  if (!date || !time || time === '00:00:00' || !merchant || !amount) return '';

  const raw = [
    date,
    time,
    text_(x && x.rawType).toLowerCase(),
    merchant,
    amount,
    normalizeAccountName_(text_(x && (x.payment || x.account)))
  ].join('|');

  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw, Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('').slice(0, 32);
}


function markIntraRunDuplicates_(txns) {
  const seenSource = new Set();
  const seenStable = new Set();
  txns.forEach(function (tx) {
    if (tx.preStatus) return;
    if (!tx.sourceKey) return;

    if (seenSource.has(tx.sourceKey)) {
      tx.preStatus = 'DUPLICATE';
      tx.preReason = '동일 분석 payload 내 중복 sourceKey';
      return;
    }
    if (tx.stableDedupKey && seenStable.has(tx.stableDedupKey)) {
      tx.preStatus = 'DUPLICATE';
      tx.preReason = '동일 분석 payload 내 안정지문 중복';
      return;
    }

    seenSource.add(tx.sourceKey);
    if (tx.stableDedupKey) seenStable.add(tx.stableDedupKey);
  });
}


/**********************************************************************
 * INTERNAL TRANSFER PAIRING
 **********************************************************************/

function pairInternalTransfers_(txns, cfg) {
  const candidates = txns.filter(function (tx) {
    return !tx.preStatus && /이체/.test(tx.rawType) && tx.signedAmount !== 0;
  });

  for (let i = 0; i < candidates.length; i++) {
    const a = candidates[i];
    if (a.pairSourceKey) continue;

    for (let j = i + 1; j < candidates.length; j++) {
      const b = candidates[j];
      if (b.pairSourceKey) continue;
      if (a.date !== b.date) continue;
      if (Math.abs(a.signedAmount + b.signedAmount) > 0.001) continue;
      if (Math.abs(timeSeconds_(a.time) - timeSeconds_(b.time)) > cfg.internalTransferSeconds) continue;

      a.pairSourceKey = b.sourceKey;
      b.pairSourceKey = a.sourceKey;

      // Keep the outgoing side as the representative economic row.
      if (a.signedAmount < 0) b.pairMirror = true;
      else a.pairMirror = true;
      break;
    }
  }
}


/**
 * Resolve BankSalad raw account names through Finance OS canonical account aliases.
 * A pair that touches an operating overdraft account is `운영계좌간이체`;
 * ordinary own-account / KakaoPay-money transfers are `계좌 간 이체`.
 */
function normalizeAccountName_(x) {
  return text_(x).toLowerCase().replace(/[\s\-_.()\[\]{}]/g, '');
}

function loadAccountTransferMap_() {
  const ss = financeSpreadsheet_();
  const masterSheet = ss.getSheetByName(SHEETS.ACCOUNT_MASTER);
  const aliasSheet = ss.getSheetByName(SHEETS.ACCOUNT_ALIAS);
  const accounts = {};
  const aliases = {};

  if (masterSheet) {
    tableObjects_(masterSheet).forEach(function (r) {
      const id = text_(r['계정ID']);
      const name = text_(r['표준계정명']);
      if (!id || !name) return;
      const profile = {
        id: id,
        name: name,
        assetLiability: text_(r['자산부채']),
        group: text_(r['계정그룹']),
        operatingOverdraft: text_(r['자산부채']) === '부채' && /마이너스통장/.test(name)
      };
      accounts[id] = profile;
      aliases[normalizeAccountName_(name)] = id;
    });
  }

  if (aliasSheet) {
    tableObjects_(aliasSheet).forEach(function (r) {
      const raw = text_(r['원본계정명']);
      const id = text_(r['표준계정ID']);
      if (raw && id && accounts[id]) aliases[normalizeAccountName_(raw)] = id;
    });
  }

  return { accounts: accounts, aliases: aliases };
}

function accountProfileForTx_(tx, transferMap) {
  if (!transferMap) return null;
  const candidates = [text_(tx.account), text_(tx.payment)];
  for (let i = 0; i < candidates.length; i++) {
    const key = normalizeAccountName_(candidates[i]);
    if (!key) continue;
    const id = transferMap.aliases[key];
    if (id && transferMap.accounts[id]) return transferMap.accounts[id];
  }
  return null;
}

function internalTransferMinor_(tx, context) {
  const pair = context && context.txBySourceKey ? context.txBySourceKey[tx.pairSourceKey] : null;
  const a = accountProfileForTx_(tx, context && context.accountTransferMap);
  const b = pair ? accountProfileForTx_(pair, context && context.accountTransferMap) : null;
  return (a && a.operatingOverdraft) || (b && b.operatingOverdraft)
    ? '운영계좌간이체'
    : '계좌 간 이체';
}


/**********************************************************************
 * CLASSIFICATION ENGINE
 **********************************************************************/

/* [v1.4.3 CLEAN] superseded duplicate function removed: classifyBase_ */

function result_(x) {
  return {
    status: x.status || 'REVIEW',
    type: x.type || '',
    major: x.major || '',
    minor: x.minor || '',
    confidence: Number(x.confidence || 0),
    source: x.source || '',
    risk: x.risk || 'LOW',
    reason: x.reason || '',
    settlement: null
  };
}


/**********************************************************************
 * RULE MASTER
 **********************************************************************/

function loadRuleMaster_() {
  return tableObjects_(financeSpreadsheet_().getSheetByName(SHEETS.RULES))
    .filter(function (r) { return bool_(r.Enabled); })
    .map(function (r) {
      return {
        ruleId: text_(r.Rule_ID),
        priority: number_(r.Priority, 999),
        matchType: text_(r.Match_Type),
        field: text_(r.Field),
        pattern: text_(r.Pattern),
        amountMin: nullableNumber_(r.Amount_Min),
        amountMax: nullableNumber_(r.Amount_Max),
        paymentPattern: text_(r.Payment_Pattern),
        rawMajorPattern: text_(r.Raw_Major_Pattern),
        resultType: text_(r.Result_Type),
        resultMajor: text_(r.Result_Major),
        resultMinor: text_(r.Result_Minor),
        confidence: number_(r.Confidence, 95),
        risk: text_(r.Risk) || 'LOW',
        note: text_(r.Note)
      };
    })
    .sort(function (a, b) { return a.priority - b.priority; });
}

/* [v1.4.3 CLEAN] superseded duplicate function removed: matchRule_ */

function ruleFieldValue_(tx, field) {
  const f = text_(field).toLowerCase();
  if (f === 'merchant') return tx.merchant;
  if (f === 'memo') return tx.memo;
  if (f === 'payment') return tx.payment;
  if (f === 'rawmajor') return tx.rawMajor;
  if (f === 'rawminor') return tx.rawMinor;
  if (f === 'rawtype') return tx.rawType;
  if (f === 'sourcekey') return tx.sourceKey;
  return [tx.merchant, tx.memo, tx.rawMajor, tx.rawMinor, tx.payment].join(' ');
}

function matchText_(value, pattern, matchType) {
  const v = String(value || '');
  const p = String(pattern || '');
  if (!p) return false;
  const type = text_(matchType || 'contains').toLowerCase();

  if (type === 'exact') return v.trim().toLowerCase() === p.trim().toLowerCase();
  if (type === 'regex') {
    try { return new RegExp(p, 'i').test(v); }
    catch (e) { return false; }
  }
  return v.toLowerCase().indexOf(p.toLowerCase()) >= 0;
}


/**********************************************************************
 * KEYWORD / RAW FALLBACK
 **********************************************************************/

function keywordClassification_(tx, standard) {
  const text = [tx.merchant, tx.memo, tx.rawMajor, tx.rawMinor].join(' ').toLowerCase();

  const candidates = [
    {
      regex: /맥주|소주|와인|주류|하이볼|막걸리/,
      type: '소비지출', major: '술·사교', minor: '술·유흥', confidence: 96, risk: 'LOW', reason: '주류 키워드'
    },
    {
      regex: /두부|현미밥|발아현미|특란|계란|달걀|닭가슴살|식재료/,
      type: '소비지출', major: '식비', minor: '장보기·집밥재료', confidence: 96, risk: 'LOW', reason: '식재료 키워드'
    },
    {
      regex: /가습기|공기청정기|청소기|선풍기|전자레인지/,
      type: '소비지출', major: '생활용품', minor: '가구·가전', confidence: 96, risk: 'LOW', reason: '가전 키워드'
    }
  ];

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    if (c.regex.test(text) && classificationAvailable_(standard, c.major, c.minor)) return c;
  }
  return null;
}

function rawCategoryClassification_(tx, standard) {
  const src = (tx.rawMajor + ' ' + tx.rawMinor).trim();
  const textAll = [src, tx.merchant, tx.memo].join(' ');
  const candidates = [];

  // Accounting-flow mappings first. These are stronger than merchant guesses.
  if (tx.signedAmount < 0 && /카드대금/.test(src)) {
    candidates.push({ type: '자산이동', major: '자산이동', minor: '카드대금결제', confidence: 99, risk: 'HIGH', reason: 'BankSalad 카드대금 원본분류 → 카드대금결제' });
  }
  if (tx.signedAmount > 0 && /캐시백/.test(textAll)) {
    candidates.push({ type: '환불·취소', major: '기타유입·유출', minor: '환불·캐시백', confidence: 99, risk: 'LOW', reason: '입금 + 캐시백 명칭이 명확' });
  }

  // High-specificity BankSalad source mappings.
  if (/베이커리/.test(src)) {
    candidates.push({ type: '소비지출', major: '식비', minor: '간식', confidence: 98, risk: 'LOW', reason: '원본 베이커리 분류' });
  }
  if (/주차/.test(src)) {
    candidates.push({ type: '소비지출', major: '교통·차량', minor: '주차', confidence: 99, risk: 'LOW', reason: '원본 주차 분류' });
  }
  if (/약국|치과|이비인후과|병원/.test(src)) {
    candidates.push({ type: '소비지출', major: '의료·건강', minor: '병원·약국', confidence: 98, risk: 'LOW', reason: '원본 의료 세부분류' });
  }
  if (/헤어샵|미용실/.test(src)) {
    candidates.push({ type: '소비지출', major: '의복·미용', minor: '미용', confidence: 98, risk: 'LOW', reason: '원본 미용 세부분류' });
  }
  if (/주유/.test(src)) {
    candidates.push({ type: '소비지출', major: '교통·차량', minor: '주유', confidence: 99, risk: 'LOW', reason: '원본 주유 분류' });
  }
  if (/통행료/.test(src)) {
    candidates.push({ type: '소비지출', major: '교통·차량', minor: '통행료', confidence: 99, risk: 'LOW', reason: '원본 통행료 분류' });
  }
  if (/가스비/.test(src)) {
    candidates.push({ type: '소비지출', major: '주거·공과금', minor: '공과금', confidence: 99, risk: 'LOW', reason: '원본 가스비 분류' });
  }
  if (/급여/.test(src)) {
    candidates.push({ type: '소득', major: '소득', minor: '급여', confidence: 98, risk: 'HIGH', reason: 'BankSalad 급여 원본분류' });
  }
  if (/배달/.test(src)) {
    candidates.push({ type: '소비지출', major: '식비', minor: '배달', confidence: 97, risk: 'LOW', reason: '원본 배달 분류' });
  }
  if (/식재료/.test(src)) {
    candidates.push({ type: '소비지출', major: '식비', minor: '장보기·집밥재료', confidence: 97, risk: 'LOW', reason: '원본 식재료 분류' });
  }
  // User wants less manual work: BankSalad '마트' is usually grocery shopping.
  // Explicit merchant-specific rules (e.g. 경기지역화폐 top-up) run earlier and override this fallback.
  if (tx.signedAmount < 0 && /마트/.test(src)) {
    candidates.push({ type: '소비지출', major: '식비', minor: '장보기·집밥재료', confidence: 95, risk: 'LOW', reason: '원본 마트 분류 → 장보기 기본값' });
  }

  // Broad fallbacks stay below auto-confirm threshold unless stronger evidence exists.
  if (/교통/.test(src)) {
    candidates.push({ type: '소비지출', major: '교통·차량', minor: '기타교통', confidence: 70, risk: 'LOW', reason: '원본 교통분류' });
  }
  if (/식비|카페|외식|고기/.test(src)) {
    candidates.push({ type: '소비지출', major: '식비', minor: '외식', confidence: 75, risk: 'LOW', reason: '원본 식비분류' });
  }
  if (/의료|건강/.test(src)) {
    candidates.push({ type: '소비지출', major: '의료·건강', minor: '병원·약국', confidence: 80, risk: 'LOW', reason: '원본 의료분류' });
  }

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    if (classificationAvailable_(standard, c.major, c.minor)) return c;
  }
  return null;
}




/**********************************************************************
 * PERSONAL PAYMENT POLICY v1.5
 **********************************************************************/

// Coupang/Coupay purchases can represent completely different goods each time.
// User explicitly requested per-transaction review, so only Source_Key exact
// corrections are reused; no CI2 cross-transaction pattern learning/auto.
function isPerTransactionMerchant_(merchant) {
  const s = text_(merchant).toLowerCase();
  return /쿠팡|쿠페이/.test(s) && !/쿠팡이츠/.test(s);
}

function isKakaoSettlementIncoming_(tx) {
  if (!tx || tx.signedAmount <= 0) return false;
  if (!/이체|수입|입금/.test(tx.rawType)) return false;
  const merchant = text_(tx.merchant).toLowerCase();
  const payment = text_(tx.payment).toLowerCase();
  const memo = text_(tx.memo).toLowerCase();
  // Own-account mirror pairs are already consumed by pairInternalTransfers_.
  return /카카오페이/.test(merchant) || /카카오페이/.test(payment) || /카카오페이/.test(memo);
}

function isKakaoRepaymentOutgoing_(tx) {
  if (!tx || tx.signedAmount >= 0) return false;
  if (!/이체|지출|출금/.test(tx.rawType)) return false;
  const merchant = text_(tx.merchant).toLowerCase();
  const payment = text_(tx.payment).toLowerCase();
  // Covers both '카카오페이' and BankSalad's generic '송금 내역' paid from KakaoPay Money.
  return /카카오페이/.test(merchant) || (/송금\s*내역/.test(merchant) && /카카오페이/.test(payment));
}

function kakaoRepaymentRecommendation_(tx, standard) {
  if (!isKakaoRepaymentOutgoing_(tx)) return null;
  if (!classificationAvailable_(standard, '식비', '외식')) return null;
  return result_({
    status: 'REVIEW',
    type: '소비지출',
    major: '식비',
    minor: '외식',
    confidence: 78,
    source: 'USER_POLICY_KAKAO_REPAYMENT',
    risk: 'LOW',
    reason: '사용자 정책: 카카오페이 송금은 다른 사람이 먼저 결제한 식사·술자리 정산인 경우가 대부분. 기본은 식비>외식 추천, 술자리면 술·사교로 변경'
  });
}

/**********************************************************************
 * PERSON / SETTLEMENT
 **********************************************************************/

function isPotentialPersonIncoming_(tx) {
  if (tx.signedAmount <= 0) return false;
  if (!/이체|수입|입금/.test(tx.rawType)) return false;
  return isPersonLike_(tx.merchant);
}

function isPersonLike_(name) {
  const s = text_(name);
  if (!s) return false;
  if (/카드|은행|증권|보험|페이|pay|주식회사|\(주\)|㈜|공공기관|정부|공사|회사|쿠팡|네이버|카카오|키움|금융|저축|상사|기업|마트|편의점|병원|치과|헤어|식당|카페/i.test(s)) return false;
  return /^[가-힣]{1,2}\*?[가-힣]{1,3}$/.test(s);
}

function applySettlementEngine_(txns, results, context, analysisId) {
  const links = [];
  const linkReviews = [];
  const expenseCandidates = [];

  // Same batch, already confidently classified expenses.
  for (let i = 0; i < txns.length; i++) {
    const tx = txns[i];
    const r = results[i];
    if (r.status === 'AUTO' && r.type === '소비지출' && tx.signedAmount < 0) {
      expenseCandidates.push({
        sourceKey: tx.sourceKey,
        date: tx.date,
        merchant: tx.merchant,
        amount: Math.abs(tx.signedAmount),
        major: r.major,
        minor: r.minor,
        batchIndex: i,
        existing: false
      });
    }
  }

  recentLedgerExpenses_(txns, context.cfg.settlementWindowDays).forEach(function (x) { expenseCandidates.push(x); });

  const clusterCounts = {};
  txns.forEach(function (tx, i) {
    if (results[i].status !== 'PERSON_INCOMING') return;
    const k = tx.date + '|' + Math.abs(tx.signedAmount);
    clusterCounts[k] = (clusterCounts[k] || 0) + 1;
  });

  const allocated = existingSettlementAllocationMap_();

  txns.forEach(function (tx, i) {
    const r = results[i];
    if (r.status !== 'PERSON_INCOMING') return;

    const kakaoIncoming = isKakaoSettlementIncoming_(tx);

    // User policy: personal-name or KakaoPay incoming transfer defaults to
    // settlement recovery, not income. Matching/netting is attempted below.
    r.status = 'AUTO';
    r.type = '정산';
    r.major = '정산';
    r.minor = '일반 정산회수';
    r.confidence = kakaoIncoming ? 98 : 96;
    r.source = kakaoIncoming ? 'KAKAO_SETTLEMENT_DEFAULT' : 'PERSON_SETTLEMENT_DEFAULT';
    r.risk = 'HIGH';
    r.reason = kakaoIncoming
      ? '카카오페이 수신 → 사용자 정책상 일반 정산회수'
      : '개인명 입금 → 일반 정산회수';

    const recoveryAmount = Math.abs(tx.signedAmount);
    let best = null;

    expenseCandidates.forEach(function (exp) {
      const days = dateDiffDays_(exp.date, tx.date);
      if (days < 0 || days > context.cfg.settlementWindowDays) return;

      const already = allocated[exp.sourceKey] || 0;
      const remaining = Math.max(0, exp.amount - already);
      if (recoveryAmount > remaining + 1) return;

      const scored = settlementCandidateScore_(tx, exp, recoveryAmount, remaining, days, clusterCounts, context);
      if (!best || scored.score > best.score) {
        best = { expense: exp, score: scored.score, reasons: scored.reasons };
      }
    });

    if (best && best.score >= context.cfg.settlementAutoScore) {
      allocated[best.expense.sourceKey] = (allocated[best.expense.sourceKey] || 0) + recoveryAmount;
      const link = makeSettlementLink_({
        analysisId: analysisId,
        recoveryTx: tx,
        expense: best.expense,
        score: best.score,
        status: 'AUTO',
        reason: best.reasons.join(', ')
      });
      links.push(link);
      r.settlement = link;
      r.reason += ' / 원지출 자동매칭 ' + best.score + '점';
    } else if (best && best.score >= context.cfg.settlementReviewScore) {
      linkReviews.push({
        recoveryIndex: i,
        recoveryTx: tx,
        expense: best.expense,
        score: best.score,
        reason: best.reasons.join(', ')
      });
      r.reason += ' / 원지출 연결 검토 ' + best.score + '점';
    } else {
      r.reason += ' / 원지출 미매칭';
    }
  });

  return { links: links, linkReviews: linkReviews };
}

function settlementCandidateScore_(recoveryTx, exp, recoveryAmount, remaining, days, clusterCounts, context) {
  let score = 0;
  const reasons = [];

  const datePoints = days === 0 ? 30 : days === 1 ? 27 : days === 2 ? 24 : days === 3 ? 20 : 12;
  score += datePoints;
  reasons.push('날짜 +' + datePoints);

  const ratio = exp.amount / recoveryAmount;
  const rounded = Math.round(ratio);
  if (rounded >= 2 && rounded <= 8 && Math.abs(ratio - rounded) <= 0.05) {
    score += 30;
    reasons.push(rounded + '분의1 +30');
  } else if (Math.abs(remaining - recoveryAmount) <= 1) {
    score += 25;
    reasons.push('잔여정산 일치 +25');
  } else {
    const share = recoveryAmount / exp.amount;
    if (share >= 0.1 && share <= 0.9) {
      score += 15;
      reasons.push('부분정산 비율 +15');
    }
  }

  if (/식비|술·사교|여행·여가·문화|교통·차량|사업·부업비용/.test(exp.major)) {
    score += 15;
    reasons.push('공동지출 가능성 +15');
  }

  const clusterKey = recoveryTx.date + '|' + recoveryAmount;
  if ((clusterCounts[clusterKey] || 0) >= 2) {
    score += 15;
    reasons.push('동일금액 정산군 +15');
  }

  const person = context.personProfiles[normalizePerson_(recoveryTx.merchant)];
  if (person && person.confidence >= 0.8) {
    score += 10;
    reasons.push('과거 정산상대 +10');
  }

  if (isKakaoSettlementIncoming_(recoveryTx)) {
    score += 10;
    reasons.push('카카오페이 정산수신 +10');
  }

  if (/금융비용|보험|주거·공과금/.test(exp.major)) {
    score -= 28;
    reasons.push('고정·금융성 지출 -28');
  }

  return { score: Math.max(0, Math.min(100, score)), reasons: reasons };
}

function existingSettlementAllocationMap_() {
  const sheet = financeSpreadsheet_().getSheetByName(SHEETS.SETTLEMENT);
  const map = {};
  tableObjects_(sheet).forEach(function (r) {
    const status = text_(r.Status);
    if (status !== 'AUTO' && status !== 'CONFIRMED') return;
    const key = text_(r.Expense_Source_Key);
    if (!key) return;
    map[key] = (map[key] || 0) + Math.abs(number_(r.Recovery_Amount, 0));
  });
  return map;
}

function makeSettlementLink_(x) {
  const recovered = Math.abs(x.recoveryTx.signedAmount);
  const gross = Math.abs(x.expense.amount);
  return {
    settlementId: 'SET-' + Utilities.getUuid(),
    analysisId: x.analysisId,
    recoverySourceKey: x.recoveryTx.sourceKey,
    expenseSourceKey: x.expense.sourceKey,
    recoveryDate: x.recoveryTx.date,
    expenseDate: x.expense.date,
    recoveryAmount: recovered,
    grossExpense: gross,
    recoveredTotal: recovered,
    netPersonalSpend: Math.max(0, gross - recovered),
    score: x.score,
    status: x.status,
    reason: x.reason
  };
}

function recentLedgerExpenses_(txns, windowDays) {
  const sheet = financeSpreadsheet_().getSheetByName(SHEETS.LEDGER);
  if (!sheet || sheet.getLastRow() < 2) return [];

  const dates = txns.map(function (x) { return x.date; }).filter(Boolean);
  if (!dates.length) return [];

  const min = addDays_(minDate_(dates), -windowDays);
  const max = maxDate_(dates);
  const lastRow = sheet.getLastRow();
  const headers = sheetHeaders_(sheet);

  // Finance OS ledger is chronological. 3,000 tail rows comfortably cover a
  // 7-day settlement window while avoiding a full 25k-row/31-column read.
  const maxScanRows = 3000;
  const startRow = Math.max(2, lastRow - maxScanRows + 1);
  const values = sheet.getRange(startRow, 1, lastRow - startRow + 1, headers.length).getValues();
  const rows = values.map(function (row) {
    const obj = {};
    headers.forEach(function (h, i) { if (h) obj[h] = row[i]; });
    return obj;
  });

  return rows.filter(function (r) {
    const d = dateKey_(r['거래일']);
    return (
      d >= min && d <= max &&
      text_(r['재무거래유형']) === '소비지출' &&
      number_(r['금액'], 0) !== 0 &&
      text_(r['중복키'])
    );
  }).map(function (r) {
    return {
      sourceKey: text_(r['중복키']),
      date: dateKey_(r['거래일']),
      merchant: text_(r['거래명']),
      amount: Math.abs(number_(r['금액'], 0)),
      major: text_(r['대분류']),
      minor: text_(r['소분류']),
      existing: true,
      batchIndex: null
    };
  });
}


/**********************************************************************
 * LEDGER BUILDER / NETTING
 **********************************************************************/

function buildLedgerRow_(tx, classification) {
  const amount = Math.abs(tx.signedAmount);
  const isIn = tx.signedAmount > 0;
  const type = classification.type;
  const semanticText = [classification.major, classification.minor, tx.merchant, tx.memo].join(' ');

  let cashIn = isIn ? amount : 0;
  let cashOut = isIn ? 0 : amount;
  let income = 0;
  let spend = 0;
  let interest = 0;
  let cardPay = 0;
  let assetMove = 0;
  let investmentPrincipal = 0;
  let investmentRecovery = 0;
  let debtPrincipal = 0;
  let nonPnl = 0;
  let pnl = 0;

  if (type === '소득') {
    income = amount;
    pnl = amount;

  } else if (type === '소비지출') {
    spend = amount;
    pnl = -amount;

  } else if (type === '금융비용') {
    if (/이자/.test(semanticText)) interest = amount;
    else spend = amount;
    pnl = -amount;

  } else if (type === '정산') {
    income = 0;
    spend = 0;
    pnl = 0;

  } else if (type === '자산이동') {
    if (/카드대금/.test(semanticText)) {
      // Canonical Finance OS history: card bill payment is bank cash-out plus
      // 카드대금결제액; it is not a synthetic cash-in/out internal transfer pair.
      cashIn = 0;
      cashOut = amount;
      cardPay = amount;
      assetMove = 0;
    } else {
      cashIn = amount;
      cashOut = amount;
      assetMove = amount;
    }
    pnl = 0;

  } else if (type === '부채이동') {
    if (!isIn) debtPrincipal = amount;
    pnl = 0;

  } else if (type === '투자' || type === '투자이동') {
    if (isIn) investmentRecovery = amount;
    else investmentPrincipal = amount;
    pnl = 0;

  } else if (type === '환불·취소') {
    spend = -amount;
    pnl = amount;

  } else if (type === '급여공제') {
    nonPnl = amount;
    pnl = 0;
  }

  if (/카드대금/.test(semanticText)) cardPay = amount;

  return {
    '거래ID': 'BS-' + tx.sourceKey.slice(0, 12),
    '거래일': tx.date,
    '연월': tx.date ? tx.date.slice(0, 7) : '',
    '재무거래유형': type,
    '거래명': tx.merchant,
    '상세내역': buildLedgerDetail_(tx, classification),
    '금액': amount,
    '표준계정명': tx.payment || tx.account,
    '계정ID': '',
    '대분류': classification.major,
    '소분류': classification.minor,
    '현금유입': cashIn,
    '현금유출': cashOut,
    '소득인식액': income,
    '소비지출액': spend,
    '대출이자액': interest,
    '카드대금결제액': cardPay,
    '자산간이동액': assetMove,
    '투자원금액': investmentPrincipal,
    '투자회수액': investmentRecovery,
    '자기자금 부채원금상환': debtPrincipal,
    '비손익 순자산조정액': nonPnl,
    '손익기준 순자산영향액': pnl,
    '계산포함': 'Y',
    '검토상태': '확정',
    '중복후보': 'N',
    '중복키': tx.sourceKey
  };
}

function buildLedgerDetail_(tx, classification) {
  const parts = [];
  if (tx.memo) parts.push(tx.memo);
  parts.push('ServerBrain=' + BACKEND_VERSION);
  parts.push('Policy=' + POLICY_VERSION);
  parts.push('ClassSource=' + classification.source);
  parts.push('Confidence=' + classification.confidence);
  if (classification.reason) parts.push(classification.reason);
  return parts.join(' | ');
}

function applyNettingToLedgerObject_(ledger, recovered) {
  if (!ledger || text_(ledger['재무거래유형']) !== '소비지출' || recovered <= 0) return ledger;

  const gross = Math.abs(number_(ledger['금액'], 0));
  const applied = Math.min(gross, Math.abs(recovered));
  const net = Math.max(0, gross - applied);

  ledger['소비지출액'] = net;
  ledger['손익기준 순자산영향액'] = -net;

  if (net === 0) {
    ledger['재무거래유형'] = '정산';
    ledger['대분류'] = '정산';
    ledger['소분류'] = '일반 선결제';
  }

  ledger['상세내역'] = replaceSettlementDetail_(text_(ledger['상세내역']), gross, applied, net);
  return ledger;
}

function replaceSettlementDetail_(detail, gross, recovery, net) {
  let s = String(detail || '')
    .replace(/\s*\|\s*SettlementGross=[^|]*/g, '')
    .replace(/\s*\|\s*SettlementRecovery=[^|]*/g, '')
    .replace(/\s*\|\s*NetPersonalSpend=[^|]*/g, '');

  s += ' | SettlementGross=' + gross + ' | SettlementRecovery=' + recovery + ' | NetPersonalSpend=' + net;
  return s.trim();
}


/**********************************************************************
 * STAGING / RAW / SETTLEMENT WRITE
 **********************************************************************/

function writeRawRows_(analysisId, txns, results) {
  const sheet = financeSpreadsheet_().getSheetByName(SHEETS.RAW);
  const objects = txns.map(function (tx, i) {
    return {
      Analysis_ID: analysisId,
      Source_Key: tx.sourceKey,
      Source_Row: tx.sourceRow,
      Date: tx.date,
      Time: tx.time,
      Raw_Type: tx.rawType,
      Raw_Major: tx.rawMajor,
      Raw_Minor: tx.rawMinor,
      Merchant: tx.merchant,
      Signed_Amount: tx.signedAmount,
      Payment: tx.payment,
      Memo: tx.memo,
      Account: tx.account,
      Status: results[i].status,
      Reason: results[i].reason,
      Raw_JSON: JSON.stringify(tx.original),
      Created_At: now_()
    };
  });
  appendObjectRows_(sheet, objects);
}

function writeStagingRows_(analysisId, txns, results, settlementOutcome) {
  const sheet = financeSpreadsheet_().getSheetByName(SHEETS.STAGING);
  const recoveryByExpense = {};
  settlementOutcome.links.forEach(function (x) {
    recoveryByExpense[x.expenseSourceKey] = (recoveryByExpense[x.expenseSourceKey] || 0) + x.recoveryAmount;
  });

  const objects = results.map(function (r, i) {
    const tx = txns[i];
    let ledger = null;

    if (r.status === 'AUTO') {
      ledger = buildLedgerRow_(tx, r);
      if (recoveryByExpense[tx.sourceKey]) ledger = applyNettingToLedgerObject_(ledger, recoveryByExpense[tx.sourceKey]);
    }

    return {
      Analysis_ID: analysisId,
      Source_Key: tx.sourceKey,
      Status: r.status,
      Risk: r.risk,
      Confidence: r.confidence,
      Classification_Source: r.source,
      Ledger_JSON: ledger ? JSON.stringify(ledger) : '',
      Raw_JSON: JSON.stringify(tx.original),
      Settlement_JSON: r.settlement ? JSON.stringify(r.settlement) : '',
      Created_At: now_(),
      Updated_At: now_()
    };
  });

  appendObjectRows_(sheet, objects);
}

function writeSettlementLinks_(links) {
  if (!links || !links.length) return;

  const sheet = financeSpreadsheet_().getSheetByName(SHEETS.SETTLEMENT);
  const existing = new Set(tableObjects_(sheet).map(function (r) {
    return text_(r.Recovery_Source_Key) + '|' + text_(r.Expense_Source_Key);
  }));

  const objects = [];
  links.forEach(function (x) {
    const key = x.recoverySourceKey + '|' + x.expenseSourceKey;
    if (existing.has(key)) return;
    existing.add(key);
    objects.push({
      Settlement_ID: x.settlementId,
      Analysis_ID: x.analysisId,
      Recovery_Source_Key: x.recoverySourceKey,
      Expense_Source_Key: x.expenseSourceKey,
      Recovery_Date: x.recoveryDate,
      Expense_Date: x.expenseDate,
      Recovery_Amount: x.recoveryAmount,
      Gross_Expense: x.grossExpense,
      Recovered_Total: x.recoveredTotal,
      Net_Personal_Spend: x.netPersonalSpend,
      Score: x.score,
      Status: x.status,
      Reason: x.reason,
      Created_At: now_(),
      Updated_At: now_()
    });
  });

  appendObjectRows_(sheet, objects);
}


/**********************************************************************
 * REVIEW QUEUE
 **********************************************************************/

function buildAndWriteReviews_(analysisId, txns, results, settlementOutcome, context) {
  const reviews = [];

  results.forEach(function (r, i) {
    if (r.status !== 'REVIEW') return;
    const tx = txns[i];
    const history = historicalReviewSuggestions_(tx, context, 3);
    const topHistory = history.length ? history[0] : null;

    let recommendedType = r.type;
    let recommendedMajor = r.major;
    let recommendedMinor = r.minor;
    let confidence = r.confidence;
    let reason = r.reason;

    // Review is still manual. When the normal classifier is incomplete or
    // weaker, preselect the closest confirmed historical transaction instead.
    if (
      topHistory &&
      (!hasCompleteClassification_(r) || number_(topHistory.score, 0) > number_(r.confidence, 0))
    ) {
      recommendedType = topHistory.type;
      recommendedMajor = topHistory.major;
      recommendedMinor = topHistory.minor;
      confidence = topHistory.score;
      reason += ' / 과거근접 ' + topHistory.date + ' ' + topHistory.merchant +
        ' ' + topHistory.amount + '원 → ' + topHistory.major + '>' + topHistory.minor +
        ' (' + topHistory.score + '점)';
    }

    const effective = {
      type: recommendedType,
      major: recommendedMajor,
      minor: recommendedMinor,
      confidence: confidence
    };

    reviews.push({
      reviewId: 'REV-' + Utilities.getUuid(),
      analysisId: analysisId,
      sourceKey: tx.sourceKey,
      reviewType: 'CLASSIFICATION',
      risk: r.risk,
      date: tx.date,
      merchant: tx.merchant,
      amount: Math.abs(tx.signedAmount),
      status: 'PENDING',
      reason: reason,
      recommendedType: recommendedType,
      recommendedMajor: recommendedMajor,
      recommendedMinor: recommendedMinor,
      confidence: confidence,
      matchedSourceKey: '',
      options: classificationOptions_(effective, tx, history)
    });
  });

  settlementOutcome.linkReviews.forEach(function (x) {
    reviews.push({
      reviewId: 'REV-' + Utilities.getUuid(),
      analysisId: analysisId,
      sourceKey: x.recoveryTx.sourceKey,
      reviewType: 'SETTLEMENT_LINK',
      risk: 'LOW',
      date: x.recoveryTx.date,
      merchant: x.recoveryTx.merchant,
      amount: Math.abs(x.recoveryTx.signedAmount),
      status: 'PENDING',
      reason: x.reason,
      recommendedType: '정산',
      recommendedMajor: '정산',
      recommendedMinor: '일반 정산회수',
      confidence: x.score,
      matchedSourceKey: x.expense.sourceKey,
      options: {
        mode: 'SETTLEMENT_LINK',
        recommended: {
          sourceKey: x.expense.sourceKey,
          date: x.expense.date,
          merchant: x.expense.merchant,
          amount: x.expense.amount,
          score: x.score
        },
        actions: [
          { id: 'confirm_match', label: '추천 정산 연결 확정' },
          { id: 'change_match', label: '다른 거래에 연결' },
          { id: 'keep_unmatched', label: '정산은 맞지만 연결 안 함' }
        ]
      }
    });
  });

  if (context.cfg.reviewSupersede) supersedeOlderPendingReviews_(analysisId, reviews);
  writeReviewRows_(reviews);
  return reviews;
}

/* [v1.4.3 CLEAN] superseded duplicate function removed: classificationOptions_ */

function supersedeOlderPendingReviews_(analysisId, newReviews) {
  if (!newReviews || !newReviews.length) return;
  const currentKeys = new Set(newReviews.map(function (r) { return text_(r.sourceKey); }).filter(Boolean));
  if (!currentKeys.size) return;

  const sheet = financeSpreadsheet_().getSheetByName(SHEETS.REVIEW);
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return;
  const headers = values[0].map(text_);
  const idxAnalysis = headers.indexOf('Analysis_ID');
  const idxSource = headers.indexOf('Source_Key');
  const idxStatus = headers.indexOf('Status');
  const idxResolved = headers.indexOf('Resolved_At');
  if (idxAnalysis < 0 || idxSource < 0 || idxStatus < 0) return;

  const now = now_();
  let changed = false;
  const statusValues = [];
  const resolvedValues = [];

  for (let i = 1; i < values.length; i++) {
    let status = values[i][idxStatus];
    let resolved = idxResolved >= 0 ? values[i][idxResolved] : '';
    if (
      text_(values[i][idxAnalysis]) !== analysisId &&
      text_(status) === 'PENDING' &&
      currentKeys.has(text_(values[i][idxSource]))
    ) {
      status = 'SUPERSEDED';
      if (idxResolved >= 0) resolved = now;
      changed = true;
    }
    statusValues.push([status]);
    if (idxResolved >= 0) resolvedValues.push([resolved]);
  }

  if (!changed) return;
  // Two batched writes replace N individual setValue network round trips.
  sheet.getRange(2, idxStatus + 1, statusValues.length, 1).setValues(statusValues);
  if (idxResolved >= 0) {
    sheet.getRange(2, idxResolved + 1, resolvedValues.length, 1).setValues(resolvedValues);
  }
}

function buildUiSchema_(standard) {
  return {
    classificationMode: 'DEPENDENT_DROPDOWN',
    freeTextClassification: false,
    standardCategories: standard,
    learnPatternDefault: true,
    riskPolicy: {
      HIGH: '해결 전 Commit 차단',
      LOW: '보류 가능. 확정 거래만 먼저 반영 가능'
    }
  };
}

function writeReviewRows_(reviews) {
  if (!reviews.length) return;
  const sheet = financeSpreadsheet_().getSheetByName(SHEETS.REVIEW);
  const objects = reviews.map(function (r) {
    return {
      Review_ID: r.reviewId,
      Analysis_ID: r.analysisId,
      Source_Key: r.sourceKey,
      Review_Type: r.reviewType,
      Risk: r.risk,
      Date: r.date,
      Merchant: r.merchant,
      Amount: r.amount,
      Status: r.status,
      Reason: r.reason,
      Recommended_Type: r.recommendedType,
      Recommended_Major: r.recommendedMajor,
      Recommended_Minor: r.recommendedMinor,
      Confidence: r.confidence,
      Matched_Source_Key: r.matchedSourceKey,
      Options_JSON: JSON.stringify(r.options || {}),
      User_Type: '',
      User_Major: '',
      User_Minor: '',
      Learn_Pattern: '',
      Created_At: now_(),
      Resolved_At: ''
    };
  });
  appendObjectRows_(sheet, objects);
}

/* [v1.4.3 CLEAN] superseded duplicate function removed: reviewForClient_ */

function getReviewQueue_(body) {
  const analysisId = text_(body.analysisId);
  if (!analysisId) throw new Error('analysisId is required');

  const reviews = readReviewRows_(analysisId, 'PENDING');
  return {
    ok: true,
    analysisId: analysisId,
    reviewCount: reviews.length,
    reviewQueue: reviews.map(reviewForClient_),
    canCommit: !reviews.some(function (r) { return r.risk === 'HIGH'; }),
    uiSchema: buildUiSchema_(loadStandardCategories_())
  };
}

function confirmReview_(body) {
  const reviewId = text_(body.reviewId);
  if (!reviewId) throw new Error('reviewId is required');

  const review = findReviewById_(reviewId);
  if (!review) throw new Error('Review not found: ' + reviewId);
  if (review.status !== 'PENDING') {
    return { ok: true, alreadyResolved: true, reviewId: reviewId };
  }

  if (review.reviewType === 'SETTLEMENT_LINK') resolveSettlementReview_(review, body);
  else resolveClassificationReview_(review, body);

  const remaining = readReviewRows_(review.analysisId, 'PENDING');
  return {
    ok: true,
    reviewId: reviewId,
    analysisId: review.analysisId,
    remaining: remaining.length,
    remainingHigh: remaining.filter(function (x) { return x.risk === 'HIGH'; }).length,
    remainingLow: remaining.filter(function (x) { return x.risk === 'LOW'; }).length,
    canCommit: !remaining.some(function (x) { return x.risk === 'HIGH'; })
  };
}

/* [v1.4.3 CLEAN] superseded duplicate function removed: resolveClassificationReview_ */

function resolveSettlementReview_(review, body) {
  const action = text_(body.reviewAction || body.actionChoice) || 'confirm_match';

  if (action === 'keep_unmatched') {
    resolveReviewRow_(review.reviewId, { learnPattern: false });
    return;
  }

  const matched = text_(body.matchedSourceKey) || review.matchedSourceKey;
  if (!matched) throw new Error('matchedSourceKey is required');

  const staging = findStaging_(review.analysisId, review.sourceKey);
  if (!staging) throw new Error('Recovery staging row not found');

  const raw = JSON.parse(staging.rawJson);
  const expense = findExpenseBySourceKey_(review.analysisId, matched);
  if (!expense) throw new Error('Matched expense not found: ' + matched);

  const link = makeSettlementLink_({
    analysisId: review.analysisId,
    recoveryTx: normalizeRawTransaction_(raw, 0),
    expense: expense,
    score: Number(review.confidence || 0),
    status: 'CONFIRMED',
    reason: '사용자 정산 연결 확정'
  });

  writeSettlementLinks_([link]);
  recalculateStagingNetForExpense_(review.analysisId, matched);
  resolveReviewRow_(review.reviewId, { learnPattern: false });
}

function recalculateStagingNetForExpense_(analysisId, expenseSourceKey) {
  const staging = findStaging_(analysisId, expenseSourceKey);
  if (!staging || !staging.ledgerJson) return;

  let ledger = safeJsonParse_(staging.ledgerJson, null);
  if (!ledger) return;

  const recovered = committedRecoveryForExpense_(expenseSourceKey);
  if (recovered <= 0) return;

  ledger = applyNettingToLedgerObject_(ledger, recovered);
  updateStaging_(analysisId, expenseSourceKey, {
    ledgerJson: JSON.stringify(ledger),
    updatedAt: now_()
  });
}

function committedRecoveryForExpense_(expenseSourceKey) {
  return tableObjects_(financeSpreadsheet_().getSheetByName(SHEETS.SETTLEMENT))
    .filter(function (r) {
      const status = text_(r.Status);
      return text_(r.Expense_Source_Key) === expenseSourceKey && (status === 'AUTO' || status === 'CONFIRMED');
    })
    .reduce(function (sum, r) { return sum + Math.abs(number_(r.Recovery_Amount, 0)); }, 0);
}


/**********************************************************************
 * REVIEW READ/UPDATE
 **********************************************************************/

function readReviewRows_(analysisId, status) {
  return tableObjects_(financeSpreadsheet_().getSheetByName(SHEETS.REVIEW))
    .filter(function (r) { return text_(r.Analysis_ID) === analysisId; })
    .filter(function (r) { return !status || text_(r.Status) === status; })
    .map(reviewObject_);
}

function reviewObject_(r) {
  return {
    reviewId: text_(r.Review_ID),
    analysisId: text_(r.Analysis_ID),
    sourceKey: text_(r.Source_Key),
    reviewType: text_(r.Review_Type),
    risk: text_(r.Risk),
    date: dateKey_(r.Date),
    merchant: text_(r.Merchant),
    amount: number_(r.Amount, 0),
    status: text_(r.Status),
    reason: text_(r.Reason),
    recommendedType: text_(r.Recommended_Type),
    recommendedMajor: text_(r.Recommended_Major),
    recommendedMinor: text_(r.Recommended_Minor),
    confidence: number_(r.Confidence, 0),
    matchedSourceKey: text_(r.Matched_Source_Key),
    options: safeJsonParse_(r.Options_JSON, {})
  };
}

function findReviewById_(id) {
  const raw = tableObjects_(financeSpreadsheet_().getSheetByName(SHEETS.REVIEW))
    .find(function (r) { return text_(r.Review_ID) === id; });
  return raw ? reviewObject_(raw) : null;
}

function resolveReviewRow_(reviewId, values) {
  const sheet = financeSpreadsheet_().getSheetByName(SHEETS.REVIEW);
  const rows = sheet.getDataRange().getValues();
  const header = rows[0].map(String);
  const idx = header.indexOf('Review_ID');

  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][idx]) !== reviewId) continue;
    setCellByHeader_(sheet, header, i + 1, 'Status', 'RESOLVED');
    setCellByHeader_(sheet, header, i + 1, 'User_Type', values.userType || '');
    setCellByHeader_(sheet, header, i + 1, 'User_Major', values.userMajor || '');
    setCellByHeader_(sheet, header, i + 1, 'User_Minor', values.userMinor || '');
    setCellByHeader_(sheet, header, i + 1, 'Learn_Pattern', values.learnPattern ? 'TRUE' : 'FALSE');
    setCellByHeader_(sheet, header, i + 1, 'Resolved_At', now_());
    return;
  }
  throw new Error('Review row not found');
}


/**********************************************************************
 * STAGING READ/UPDATE
 **********************************************************************/

function readStaging_(analysisId) {
  return tableObjects_(financeSpreadsheet_().getSheetByName(SHEETS.STAGING))
    .filter(function (r) { return text_(r.Analysis_ID) === analysisId; })
    .map(function (r) {
      return {
        analysisId: text_(r.Analysis_ID),
        sourceKey: text_(r.Source_Key),
        status: text_(r.Status),
        risk: text_(r.Risk),
        confidence: number_(r.Confidence, 0),
        classificationSource: text_(r.Classification_Source),
        ledgerJson: text_(r.Ledger_JSON),
        rawJson: text_(r.Raw_JSON),
        settlementJson: text_(r.Settlement_JSON)
      };
    });
}

function findStaging_(analysisId, sourceKey) {
  return readStaging_(analysisId).find(function (x) { return x.sourceKey === sourceKey; }) || null;
}

function updateStaging_(analysisId, sourceKey, changes) {
  const sheet = financeSpreadsheet_().getSheetByName(SHEETS.STAGING);
  const data = sheet.getDataRange().getValues();
  const header = data[0].map(String);
  const analysisCol = header.indexOf('Analysis_ID');
  const keyCol = header.indexOf('Source_Key');

  const map = {
    status: 'Status',
    risk: 'Risk',
    confidence: 'Confidence',
    classificationSource: 'Classification_Source',
    ledgerJson: 'Ledger_JSON',
    rawJson: 'Raw_JSON',
    settlementJson: 'Settlement_JSON',
    updatedAt: 'Updated_At'
  };

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][analysisCol]) !== analysisId || String(data[i][keyCol]) !== sourceKey) continue;
    Object.keys(changes).forEach(function (k) {
      if (map[k]) setCellByHeader_(sheet, header, i + 1, map[k], changes[k]);
    });
    return;
  }
  throw new Error('Staging row not found');
}


/**********************************************************************
 * USER CORRECTIONS / LEARNING
 **********************************************************************/

function loadCorrectionMap_() {
  const map = {};
  tableObjects_(financeSpreadsheet_().getSheetByName(SHEETS.CORRECTIONS)).forEach(function (r) {
    const key = text_(r.Source_Key);
    if (!key) return;
    map[key] = {
      type: text_(r.Result_Type),
      major: text_(r.Result_Major),
      minor: text_(r.Result_Minor)
    };
  });
  return map;
}

function saveExactCorrection_(tx, classification, learnPattern) {
  const sheet = financeSpreadsheet_().getSheetByName(SHEETS.CORRECTIONS);
  upsertObjectByKey_(sheet, 'Source_Key', tx.sourceKey, {
    Source_Key: tx.sourceKey,
    Result_Type: classification.type,
    Result_Major: classification.major,
    Result_Minor: classification.minor,
    Merchant: tx.merchant,
    Amount: Math.abs(tx.signedAmount),
    Raw_Major: tx.rawMajor,
    Payment: tx.payment,
    Learn_Pattern: learnPattern ? 'TRUE' : 'FALSE',
    Created_At: existingValueByKey_(sheet, 'Source_Key', tx.sourceKey, 'Created_At') || now_(),
    Updated_At: now_()
  });
}

function recordLearningCandidate_(tx, classification) {
  const patternKey = [tx.merchantKey, Math.abs(tx.signedAmount), tx.rawMajor, tx.payment].join('|');
  const sheet = financeSpreadsheet_().getSheetByName(SHEETS.LEARNING);
  const existing = findObjectByKey_(sheet, 'Pattern_Key', patternKey);
  const cfg = loadConfig_();

  if (!existing) {
    appendObjectRow_(sheet, {
      Pattern_Key: patternKey,
      Merchant_Key: tx.merchantKey,
      Amount: Math.abs(tx.signedAmount),
      Raw_Major: tx.rawMajor,
      Payment: tx.payment,
      Result_Type: classification.type,
      Result_Major: classification.major,
      Result_Minor: classification.minor,
      Confirm_Count: 1,
      Conflict_Count: 0,
      Status: 'LEARNING',
      First_Seen: now_(),
      Last_Seen: now_()
    });
    return;
  }

  const same = (
    text_(existing.Result_Type) === classification.type &&
    text_(existing.Result_Major) === classification.major &&
    text_(existing.Result_Minor) === classification.minor
  );

  const confirmCount = number_(existing.Confirm_Count, 0) + (same ? 1 : 0);
  const conflictCount = number_(existing.Conflict_Count, 0) + (same ? 0 : 1);
  const status = conflictCount > 0 ? 'CONFLICT' : (confirmCount >= cfg.learnPromoteCount ? 'PROMOTED' : 'LEARNING');

  upsertObjectByKey_(sheet, 'Pattern_Key', patternKey, {
    Pattern_Key: patternKey,
    Merchant_Key: tx.merchantKey,
    Amount: Math.abs(tx.signedAmount),
    Raw_Major: tx.rawMajor,
    Payment: tx.payment,
    Result_Type: text_(existing.Result_Type) || classification.type,
    Result_Major: text_(existing.Result_Major) || classification.major,
    Result_Minor: text_(existing.Result_Minor) || classification.minor,
    Confirm_Count: confirmCount,
    Conflict_Count: conflictCount,
    Status: status,
    First_Seen: text_(existing.First_Seen) || now_(),
    Last_Seen: now_()
  });

  if (status === 'PROMOTED') promoteLearningRule_(patternKey, tx, classification);
}

function promoteLearningRule_(patternKey, tx, classification) {
  const sheet = financeSpreadsheet_().getSheetByName(SHEETS.RULES);
  const ruleId = 'LEARN-' + shortHash_(patternKey);
  if (findObjectByKey_(sheet, 'Rule_ID', ruleId)) return;

  // Ambiguous merchants are never promoted as merchant-only rules: exact amount + payment + raw major are retained.
  appendObjectRow_(sheet, {
    Rule_ID: ruleId,
    Enabled: true,
    Priority: 45,
    Match_Type: 'exact',
    Field: 'merchant',
    Pattern: tx.merchant,
    Amount_Min: Math.abs(tx.signedAmount),
    Amount_Max: Math.abs(tx.signedAmount),
    Payment_Pattern: tx.payment,
    Raw_Major_Pattern: tx.rawMajor,
    Result_Type: classification.type,
    Result_Major: classification.major,
    Result_Minor: classification.minor,
    Confidence: 99,
    Risk: inferRisk_(classification.type),
    Note: isAmbiguousMerchant_(tx.merchant) ? '모호 Merchant: 금액+결제수단+원본분류 조합으로 승격' : '사용자 반복 확정 패턴 자동승격',
    Created_At: now_(),
    Updated_At: now_()
  });
}


/**********************************************************************
 * MERCHANT PROFILE — UPSERT, NEVER CLEAR
 **********************************************************************/

/* [v1.4.3 CLEAN] superseded duplicate function removed: bootstrapMerchantProfiles_ */

function loadMerchantProfiles_() {
  const map = {};
  tableObjects_(financeSpreadsheet_().getSheetByName(SHEETS.MERCHANT)).forEach(function (r) {
    const key = text_(r.Merchant_Key);
    if (!key) return;
    map[key] = {
      observations: number_(r.Observations, 0),
      type: text_(r.Dominant_Type),
      major: text_(r.Dominant_Major),
      minor: text_(r.Dominant_Minor),
      confidence: number_(r.Confidence, 0),
      autoEligible: bool_(r.Auto_Eligible)
    };
  });
  return map;
}


/**********************************************************************
 * PERSON PROFILE
 **********************************************************************/

/* [v1.4.3 CLEAN] superseded duplicate function removed: bootstrapPersonProfiles_ */

function loadPersonProfiles_() {
  const map = {};
  tableObjects_(financeSpreadsheet_().getSheetByName(SHEETS.PERSON)).forEach(function (r) {
    const key = text_(r.Person_Key);
    if (!key) return;
    map[key] = {
      settlementCount: number_(r.Settlement_Count, 0),
      otherCount: number_(r.Other_Count, 0),
      confidence: number_(r.Confidence, 0)
    };
  });
  return map;
}


/**********************************************************************
 * STANDARD TAXONOMY — READ ONLY / FLEXIBLE HEADERS
 **********************************************************************/

function loadStandardCategories_() {
  const sheet = financeSpreadsheet_().getSheetByName(SHEETS.STANDARD);
  if (!sheet || sheet.getLastRow() < 2) return {};

  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(function (x) { return text_(x); });

  const majorCol = firstHeaderIndex_(headers, ['표준대분류','대분류','Major','major']);
  const minorCol = firstHeaderIndex_(headers, ['표준소분류','소분류','Minor','minor']);
  const statusCol = firstHeaderIndex_(headers, ['상태','사용여부','Status','status']);

  // Known current sheet also works as A=major, B=minor if explicit headers differ.
  const mCol = majorCol >= 0 ? majorCol : 0;
  const sCol = minorCol >= 0 ? minorCol : 1;

  const map = {};
  for (let i = 1; i < values.length; i++) {
    const major = text_(values[i][mCol]);
    const minor = text_(values[i][sCol]);
    const status = statusCol >= 0 ? text_(values[i][statusCol]) : '사용';
    if (!major || !minor) continue;
    if (status && !/사용|active|활성/i.test(status)) continue;
    if (!map[major]) map[major] = [];
    if (map[major].indexOf(minor) < 0) map[major].push(minor);
  }
  return map;
}

function classificationAvailable_(standard, major, minor) {
  return !!(major && minor && standard[major] && standard[major].indexOf(minor) >= 0);
}

function validateStandardCategory_(major, minor) {
  const standard = loadStandardCategories_();
  if (!classificationAvailable_(standard, major, minor)) {
    throw new Error('Invalid Finance OS category: ' + major + ' / ' + minor);
  }
}

function inferTypeFromCategory_(major, minor) {
  const m = text_(major);
  const s = text_(minor);

  if (m === '소득') return '소득';
  if (m === '정산') return '정산';
  if (m === '자산이동') return '자산이동';
  if (/금융비용/.test(m)) return '금융비용';
  if (/부채|대출/.test(m)) return '부채이동';
  if (/투자/.test(m)) return '투자';
  if (/환불|취소|캐시백/.test(m + ' ' + s)) return '환불·취소';
  if (/급여공제/.test(m + ' ' + s)) return '급여공제';
  return '소비지출';
}

function firstHeaderIndex_(headers, candidates) {
  for (let i = 0; i < candidates.length; i++) {
    const idx = headers.indexOf(candidates[i]);
    if (idx >= 0) return idx;
  }
  return -1;
}


/**********************************************************************
 * AMBIGUOUS MERCHANTS / RISK
 **********************************************************************/

/* [v1.4.3 CLEAN] superseded duplicate function removed: isAmbiguousMerchant_ */

function inferRisk_(type) {
  return /소득|정산|자산이동|부채|투자|금융비용/.test(String(type || '')) ? 'HIGH' : 'LOW';
}

function classificationDirectionCompatible_(signedAmount, type, minor) {
  const t = text_(type);
  const m = text_(minor);
  if (!signedAmount) return true;

  if (t === '소비지출' || t === '금융비용') return signedAmount < 0;
  if (t === '소득' || t === '환불·취소') return signedAmount > 0;

  if (t === '정산') {
    if (/정산회수/.test(m)) return signedAmount > 0;
    if (/선결제/.test(m)) return signedAmount < 0;
    return true;
  }

  return true;
}


/**********************************************************************
 * ANALYSIS SUMMARY / RUN
 **********************************************************************/

/* [v1.4.3 CLEAN] superseded duplicate function removed: summarizeAnalysis_ */

function writeAnalysisRun_(x) {
  appendObjectRow_(financeSpreadsheet_().getSheetByName(SHEETS.ANALYSIS), {
    Analysis_ID: x.analysisId,
    Created_At: now_(),
    Source_File: x.sourceFile,
    Period_Start: x.periodStart,
    Period_End: x.periodEnd,
    Transaction_Rows_Read: x.summary.sourceTransactions,
    Status: 'ANALYZED',
    Duplicate_Count: x.summary.duplicate,
    Review_Low: x.summary.reviewLow,
    Review_High: x.summary.reviewHigh,
    Auto_Excluded: x.summary.autoExcluded,
    Auto_Confirmed: x.summary.autoConfirmed,
    Settlement_Recovery: x.summary.settlementRecovery,
    Settlement_Matched: x.summary.settlementMatched,
    Metrics_JSON: JSON.stringify(x.metrics || {}),
    Snapshot_JSON: JSON.stringify(x.snapshotRows || []),
    Protocol_Version: PROTOCOL_VERSION,
    Backend_Version: BACKEND_VERSION,
    Policy_Version: POLICY_VERSION
  });
}

function findAnalysisRun_(analysisId) {
  const row = tableObjects_(financeSpreadsheet_().getSheetByName(SHEETS.ANALYSIS))
    .find(function (r) { return text_(r.Analysis_ID) === analysisId; });
  if (!row) return null;

  return {
    analysisId: analysisId,
    sourceFile: text_(row.Source_File),
    periodStart: dateKey_(row.Period_Start),
    periodEnd: dateKey_(row.Period_End),
    transactionRowsRead: number_(row.Transaction_Rows_Read, 0),
    metricsJson: text_(row.Metrics_JSON) || '{}',
    snapshotJson: text_(row.Snapshot_JSON) || '[]'
  };
}

function updateAnalysisRunStatus_(analysisId, status) {
  const sheet = financeSpreadsheet_().getSheetByName(SHEETS.ANALYSIS);
  upsertObjectByKey_(sheet, 'Analysis_ID', analysisId, { Analysis_ID: analysisId, Status: status });
}


/**********************************************************************
 * COMMIT
 **********************************************************************/

function commitAnalysis_(body) {
  const analysisId = text_(body.analysisId);
  if (!analysisId) throw new Error('analysisId is required');

  const cfg = loadConfig_();
  const pending = readReviewRows_(analysisId, 'PENDING');
  const high = pending.filter(function (r) { return r.risk === 'HIGH'; });

  if (high.length > 0) throw new Error('High-risk reviews block commit: ' + high.length);
  if (!cfg.lowRiskCommitAllowed && pending.length > 0) throw new Error('Pending reviews block commit: ' + pending.length);

  const staging = readStaging_(analysisId);
  const eligible = staging.filter(function (r) {
    return (r.status === 'AUTO' || r.status === 'CONFIRMED') && r.status !== 'COMMITTED';
  });

  const ledgerRows = eligible.map(function (r) {
    return r.ledgerJson ? safeJsonParse_(r.ledgerJson, null) : null;
  }).filter(Boolean);

  validateLedgerSanity_(ledgerRows);

  const ledgerSheet = financeSpreadsheet_().getSheetByName(SHEETS.LEDGER);
  const existing = existingLedgerKeys_();
  const newRows = ledgerRows.filter(function (r) {
    const key = text_(r['중복키']);
    return key && !existing.has(key);
  });
  const serverDuplicates = ledgerRows.length - newRows.length;

  appendObjectsByExistingHeaders_(ledgerSheet, newRows);

  eligible.forEach(function (s) {
    updateStaging_(analysisId, s.sourceKey, { status: 'COMMITTED', updatedAt: now_() });
  });

  // Recalculate canonical personal spend after all settlement links.
  applyCommittedSettlementNetting_(analysisId);

  // Learn only after canonical commit.
  if (newRows.length) {
    bootstrapMerchantProfiles_();
    bootstrapPersonProfiles_();
  }

  const run = findAnalysisRun_(analysisId);
  if (!run) throw new Error('Analysis run not found');

  const snapshotRows = safeJsonParse_(run.snapshotJson, []);
  const metrics = safeJsonParse_(run.metricsJson, {});
  upsertSnapshot_(snapshotRows, run.periodEnd);

  const stats = commitStats_(analysisId, run, newRows.length, serverDuplicates);
  writeImportLog_(run, metrics, snapshotRows, stats);

  const notionState = updateNotionDateState_(run, newRows, stats);
  let notion = 'not-configured';
  try {
    notion = upsertNotionServerBrain_(run, metrics, stats, notionState);
  } catch (e) {
    notion = 'error: ' + String(e.message || e);
  }

  updateAnalysisRunStatus_(analysisId, pending.length > 0 ? 'PARTIAL_COMMITTED' : 'COMMITTED');

  return {
    ok: true,
    analysisId: analysisId,
    ledgerInserted: newRows.length,
    serverDuplicates: serverDuplicates,
    pendingLowRisk: pending.length,
    notion: notion,
    backendVersion: BACKEND_VERSION,
    policyVersion: POLICY_VERSION,
    protocolVersion: PROTOCOL_VERSION
  };
}

function commitStats_(analysisId, run, inserted, serverDuplicates) {
  const raw = readRawForAnalysis_(analysisId);
  const staging = readStaging_(analysisId);
  const reviews = readReviewRows_(analysisId);
  const links = tableObjects_(financeSpreadsheet_().getSheetByName(SHEETS.SETTLEMENT))
    .filter(function (r) { return text_(r.Analysis_ID) === analysisId; });

  return {
    transactionRowsRead: run.transactionRowsRead,
    inserted: inserted,
    appDuplicates: raw.filter(function (r) { return r.status === 'DUPLICATE'; }).length,
    serverDuplicates: serverDuplicates,
    autoExcluded: staging.filter(function (r) { return r.status === 'EXCLUDED'; }).length,
    autoConfirmed: staging.filter(function (r) {
      return r.status === 'AUTO' || r.status === 'CONFIRMED' || r.status === 'COMMITTED';
    }).length,
    settlementRecovery: staging.filter(function (r) {
      if (!r.ledgerJson) return false;
      const x = safeJsonParse_(r.ledgerJson, {});
      return x['재무거래유형'] === '정산' && x['소분류'] === '일반 정산회수';
    }).length,
    settlementMatched: links.filter(function (r) {
      const s = text_(r.Status);
      return s === 'AUTO' || s === 'CONFIRMED';
    }).length,
    reviewLow: reviews.filter(function (r) { return r.status === 'PENDING' && r.risk === 'LOW'; }).length,
    reviewHigh: reviews.filter(function (r) { return r.status === 'PENDING' && r.risk === 'HIGH'; }).length
  };
}


/**********************************************************************
 * CANONICAL SETTLEMENT NETTING — IDEMPOTENT
 **********************************************************************/

function applyCommittedSettlementNetting_(analysisId) {
  const ss = financeSpreadsheet_();
  const linkSheet = ss.getSheetByName(SHEETS.SETTLEMENT);
  const ledgerSheet = ss.getSheetByName(SHEETS.LEDGER);
  const allLinks = tableObjects_(linkSheet).filter(function (r) {
    const status = text_(r.Status);
    return status === 'AUTO' || status === 'CONFIRMED';
  });
  if (!allLinks.length || ledgerSheet.getLastRow() < 2) return;

  // Only touch expenses affected by this analysis. Historical links are still
  // included when calculating the aggregate recovered amount for those expenses.
  const targetKeys = new Set(allLinks.filter(function (r) {
    return !analysisId || text_(r.Analysis_ID) === analysisId;
  }).map(function (r) { return text_(r.Expense_Source_Key); }).filter(Boolean));
  if (!targetKeys.size) return;

  const recovered = {};
  allLinks.forEach(function (r) {
    const key = text_(r.Expense_Source_Key);
    if (!targetKeys.has(key)) return;
    recovered[key] = (recovered[key] || 0) + Math.abs(number_(r.Recovery_Amount, 0));
  });

  const headers = sheetHeaders_(ledgerSheet);
  const colKey = headers.indexOf('중복키');
  const colType = headers.indexOf('재무거래유형');
  const colMajor = headers.indexOf('대분류');
  const colMinor = headers.indexOf('소분류');
  const colAmount = headers.indexOf('금액');
  const colSpend = headers.indexOf('소비지출액');
  const colPnl = headers.indexOf('손익기준 순자산영향액');
  const colDetail = headers.indexOf('상세내역');
  if ([colKey,colType,colMajor,colMinor,colAmount,colSpend,colPnl,colDetail].some(function (x) { return x < 0; })) return;

  // Key-column-only scan: avoids loading ~25k x 31 cells for every review commit.
  const lastRow = ledgerSheet.getLastRow();
  const keyValues = ledgerSheet.getRange(2, colKey + 1, lastRow - 1, 1).getValues();
  const rowByKey = {};
  keyValues.forEach(function (v, i) {
    const key = text_(v[0]);
    if (targetKeys.has(key)) rowByKey[key] = i + 2;
  });

  targetKeys.forEach(function (key) {
    const rowNo = rowByKey[key];
    if (!rowNo) return;
    const row = ledgerSheet.getRange(rowNo, 1, 1, headers.length).getValues()[0];
    const gross = Math.abs(number_(row[colAmount], 0));
    const applied = Math.min(gross, recovered[key] || 0);
    const net = Math.max(0, gross - applied);

    ledgerSheet.getRange(rowNo, colSpend + 1).setValue(net);
    ledgerSheet.getRange(rowNo, colPnl + 1).setValue(-net);
    ledgerSheet.getRange(rowNo, colDetail + 1).setValue(replaceSettlementDetail_(text_(row[colDetail]), gross, applied, net));

    if (net === 0) {
      ledgerSheet.getRange(rowNo, colType + 1).setValue('정산');
      ledgerSheet.getRange(rowNo, colMajor + 1).setValue('정산');
      ledgerSheet.getRange(rowNo, colMinor + 1).setValue('일반 선결제');
    }
  });
}


/**********************************************************************
 * SNAPSHOT / IMPORT LOG
 **********************************************************************/

function upsertSnapshot_(snapshotRows, periodEnd) {
  if (!Array.isArray(snapshotRows)) return;
  const sheet = financeSpreadsheet_().getSheetByName(SHEETS.SNAPSHOT);
  if (!sheet) return;

  deleteSnapshotForDate_(sheet, periodEnd);
  appendObjectsByExistingHeaders_(sheet, snapshotRows);
}

function deleteSnapshotForDate_(sheet, dateStr) {
  if (!dateStr || sheet.getLastRow() < 2) return;
  const headers = sheetHeaders_(sheet);
  const dateCol = headers.indexOf('기준일');
  if (dateCol < 0) throw new Error('BS_주간계정잔액 기준일 header missing');

  const values = sheet.getRange(2, dateCol + 1, sheet.getLastRow() - 1, 1).getValues();
  const rows = [];
  values.forEach(function (v, i) {
    if (dateKey_(v[0]) === String(dateStr)) rows.push(i + 2);
  });
  rows.sort(function (a, b) { return b - a; }).forEach(function (row) { sheet.deleteRow(row); });
}

function writeImportLog_(run, metrics, snapshotRows, stats) {
  const sheet = financeSpreadsheet_().getSheetByName(SHEETS.IMPORT_LOG);
  appendMissingHeaders_(sheet, IMPORT_LOG_EXTENSION_HEADERS);

  const log = {
    Run_ID: run.analysisId,
    Imported_At: now_(),
    Source_File: run.sourceFile,
    Period_Start: run.periodStart,
    Period_End: run.periodEnd,
    Transaction_Rows_Read: stats.transactionRowsRead,
    Ledger_Inserted: stats.inserted,
    Ledger_Skipped: stats.appDuplicates + stats.serverDuplicates,
    Ledger_Review: stats.reviewLow + stats.reviewHigh,
    Snapshot_Rows: snapshotRows.length,
    Unmapped_Snapshot_Accounts: number_(metrics.unmappedSnapshotAccounts, 0),
    'BS_양수자산합계(보험·연금포함)': numberSigned_(metrics.positiveAssets),
    Total_Liabilities: numberSigned_(metrics.totalLiabilities),
    'BS_보정순자산(보험·연금포함)': numberSigned_(metrics.bsCorrectedNetWorth),
    Overdraft_Available: numberSigned_(metrics.availableOverdraft),
    Status: stats.reviewHigh > 0 ? '검토필요' : (stats.reviewLow > 0 ? '부분반영' : '완료'),
    Notes: [
      'Server Brain ' + BACKEND_VERSION,
      'Policy ' + POLICY_VERSION,
      '자동제외 ' + stats.autoExcluded,
      '정산회수 ' + stats.settlementRecovery,
      '정산매칭 ' + stats.settlementMatched
    ].join(' / '),
    'Finance_OS_비교순자산': numberSigned_(metrics.financeOsNetWorth),
    App_Duplicates: stats.appDuplicates,
    Server_Duplicates: stats.serverDuplicates,
    Auto_Excluded: stats.autoExcluded,
    Auto_Confirmed: stats.autoConfirmed,
    Settlement_Recovery: stats.settlementRecovery,
    Settlement_Matched: stats.settlementMatched,
    Review_Low: stats.reviewLow,
    Review_High: stats.reviewHigh,
    Backend_Version: BACKEND_VERSION,
    Policy_Version: POLICY_VERSION,
    Protocol_Version: PROTOCOL_VERSION
  };

  appendObjectRow_(sheet, log);
}


/**********************************************************************
 * NOTION — SAME-DATE RE-RUN PROTECTION
 **********************************************************************/

function updateNotionDateState_(run, newRows, stats) {
  const p = PropertiesService.getScriptProperties();
  const key = 'NOTION_SNAPSHOT_STATE_' + String(run.periodEnd || '').replace(/[^0-9]/g, '');
  let prev = safeJsonParse_(p.getProperty(key), null);

  const details = prev && Array.isArray(prev.details) ? prev.details.slice() : [];
  const seen = new Set(details.map(function (d) { return text_(d.key); }));

  let addedSpend = 0;
  let addedInterest = 0;

  newRows.forEach(function (r) {
    addedSpend += number_(r['소비지출액'], 0);
    addedInterest += number_(r['대출이자액'], 0);

    const k = text_(r['중복키'] || r['거래ID']);
    if (k && seen.has(k)) return;
    if (k) seen.add(k);
    details.push({
      key: k,
      date: text_(r['거래일']),
      name: text_(r['거래명']),
      amount: number_(r['금액'], 0),
      major: text_(r['대분류']),
      minor: text_(r['소분류'])
    });
  });

  const state = {
    initialized: Boolean(prev && prev.initialized) || newRows.length > 0,
    date: run.periodEnd,
    sourceFile: run.sourceFile || (prev && prev.sourceFile) || '',
    transactionRowsRead: run.transactionRowsRead,
    cumulativeInserted: number_(prev && prev.cumulativeInserted, 0) + newRows.length,
    recognizedSpend: number_(prev && prev.recognizedSpend, 0) + addedSpend,
    recognizedInterest: number_(prev && prev.recognizedInterest, 0) + addedInterest,
    autoExcluded: Math.max(number_(prev && prev.autoExcluded, 0), stats.autoExcluded),
    settlementRecovery: Math.max(number_(prev && prev.settlementRecovery, 0), stats.settlementRecovery),
    settlementMatched: Math.max(number_(prev && prev.settlementMatched, 0), stats.settlementMatched),
    details: details.slice(-50),
    updatedAt: now_()
  };

  if (state.initialized) p.setProperty(key, JSON.stringify(state));
  return state;
}

function upsertNotionServerBrain_(run, metrics, stats, state) {
  const p = PropertiesService.getScriptProperties();
  const token = p.getProperty('NOTION_TOKEN');
  if (!token) return 'not-configured';

  const dataSourceId = p.getProperty('NOTION_DATA_SOURCE_ID') || '7fe4b6b5-3fe7-496e-b45c-8e557265c92d';
  const date = run.periodEnd;
  const title = date + ' BankSalad Weekly Snapshot';
  const dataStatus = stats.reviewHigh === 0 ? (stats.reviewLow === 0 ? '확정' : '잠정') : '잠정';
  const reconcileStatus = stats.reviewHigh === 0 ? (stats.reviewLow === 0 ? '일치' : '부분검증') : '부분검증';

  const memo = [
    'Finance OS Server Brain ' + BACKEND_VERSION + '.',
    'Policy ' + POLICY_VERSION + '.',
    '원본 ' + stats.transactionRowsRead + '건.',
    '기준일 누적 신규반영 ' + number_(state && state.cumulativeInserted, stats.inserted) + '건.',
    '자동제외 ' + number_(state && state.autoExcluded, stats.autoExcluded) + '건.',
    '정산회수 ' + number_(state && state.settlementRecovery, stats.settlementRecovery) + '건.',
    '정산자동매칭 ' + number_(state && state.settlementMatched, stats.settlementMatched) + '건.',
    'LOW review ' + stats.reviewLow + '건.',
    'HIGH review ' + stats.reviewHigh + '건.'
  ].join(' ');

  const props = {
    '스냅샷명': { title: [{ type: 'text', text: { content: title } }] },
    '기준일': { date: { start: date } },
    '수집일': { date: { start: Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd') } },
    'Sheets 기준일': { date: { start: date } },
    'Founder 표시': { checkbox: true },
    '계좌·현금': { number: numberSigned_(metrics.financeCash) },
    '가용현금': { number: numberSigned_(metrics.availableOverdraft) },
    '투자평가액': { number: numberSigned_(metrics.investmentEval) },
    '부동산평가액': { number: numberSigned_(metrics.realEstate) },
    '기타자산': { number: numberSigned_(metrics.otherAssets) },
    '자동차': { number: numberSigned_(metrics.car) },
    '개인·퇴직연금': { number: numberSigned_(metrics.pensionAssets) },
    '총부채': { number: numberSigned_(metrics.totalLiabilities) },
    '7% 이상 부채': { number: numberSigned_(metrics.highRateLiabilities) },
    '대사상태': { select: { name: reconcileStatus } },
    '자료상태': { select: { name: dataStatus } },
    '원본파일명': { rich_text: [{ type: 'text', text: { content: run.sourceFile } }] },
    '검증메모': { rich_text: [{ type: 'text', text: { content: memo.slice(0, 1900) } }] }
  };

  const query = notionFetch_(token, 'https://api.notion.com/v1/data_sources/' + dataSourceId + '/query', 'post', {
    filter: { property: '기준일', date: { equals: date } },
    page_size: 1
  });

  let pageId = null;
  if (query.results && query.results.length) pageId = query.results[0].id;

  // Duplicate/re-run with no new rows: preserve existing transaction narrative, update balances/status only.
  if (pageId && state && !state.initialized && stats.inserted === 0) {
    const balanceProps = Object.assign({}, props);
    delete balanceProps['검증메모'];
    notionFetch_(token, 'https://api.notion.com/v1/pages/' + pageId, 'patch', { properties: balanceProps });
    return 'updated-balances-preserved:' + pageId;
  }

  const markdown = buildNotionMarkdown_(run, metrics, stats, dataStatus, reconcileStatus, state);

  if (!pageId) {
    const created = notionFetch_(token, 'https://api.notion.com/v1/pages', 'post', {
      parent: { type: 'data_source_id', data_source_id: dataSourceId },
      properties: props,
      markdown: markdown
    });
    return 'created:' + created.id;
  }

  notionFetch_(token, 'https://api.notion.com/v1/pages/' + pageId, 'patch', { properties: props });
  notionFetch_(token, 'https://api.notion.com/v1/pages/' + pageId + '/markdown', 'patch', {
    type: 'replace_content', replace_content: { new_str: markdown }
  });
  return 'updated:' + pageId;
}

function buildNotionMarkdown_(run, metrics, stats, dataStatus, reconcileStatus, state) {
  const money = function (n) { return Math.round(numberSigned_(n)).toLocaleString('ko-KR') + '원'; };
  const inserted = state && state.initialized ? number_(state.cumulativeInserted, 0) : stats.inserted;
  const spend = state && state.initialized ? number_(state.recognizedSpend, 0) : 0;
  const interest = state && state.initialized ? number_(state.recognizedInterest, 0) : 0;

  const lines = [
    '## ' + run.periodEnd + ' 핵심 스냅샷',
    '',
    '- Backend: **' + BACKEND_VERSION + '**',
    '- Finance Policy: **' + POLICY_VERSION + '**',
    '- Protocol: **' + PROTOCOL_VERSION + '**',
    '- 계좌·현금: **' + money(metrics.financeCash) + '**',
    '- 가용현금: **' + money(metrics.availableOverdraft) + '**',
    '- 투자평가액: **' + money(metrics.investmentEval) + '**',
    '- 총부채: **' + money(metrics.totalLiabilities) + '**',
    '',
    '## 거래 자동화',
    '',
    '- 원본 거래: **' + stats.transactionRowsRead + '건**',
    '- 기준일 누적 신규 반영: **' + inserted + '건**',
    '- 자동 제외: **' + number_(state && state.autoExcluded, stats.autoExcluded) + '건**',
    '- 정산 회수: **' + number_(state && state.settlementRecovery, stats.settlementRecovery) + '건**',
    '- 정산 자동매칭: **' + number_(state && state.settlementMatched, stats.settlementMatched) + '건**',
    '- LOW RISK 검토: **' + stats.reviewLow + '건**',
    '- HIGH RISK 검토: **' + stats.reviewHigh + '건**',
    '- 신규 소비지출 누적: **' + money(spend) + '**',
    '- 신규 대출이자 누적: **' + money(interest) + '**',
    '',
    '## 대사 상태',
    '',
    '- 자료상태: **' + dataStatus + '**',
    '- 대사상태: **' + reconcileStatus + '**',
    '',
    '> HIGH RISK 검토는 해결 전 Commit을 차단합니다. LOW RISK 검토는 확정 거래와 분리하여 나중에 처리할 수 있습니다.'
  ];

  if (state && state.details && state.details.length) {
    lines.push('', '## 신규 확정 거래');
    state.details.forEach(function (d) {
      lines.push('- ' + d.date + ' ' + d.name + ' ' + money(d.amount) + ' → ' + d.major + (d.minor ? ' / ' + d.minor : ''));
    });
  }

  return lines.join('\n');
}

function notionFetch_(token, url, method, body) {
  const res = UrlFetchApp.fetch(url, {
    method: method,
    contentType: 'application/json',
    headers: { 'Authorization': 'Bearer ' + token, 'Notion-Version': '2026-03-11' },
    payload: JSON.stringify(body || {}),
    muteHttpExceptions: true
  });
  const code = res.getResponseCode();
  const text = res.getContentText();
  if (code < 200 || code >= 300) throw new Error('Notion HTTP ' + code + ': ' + text);
  return text ? JSON.parse(text) : {};
}


/**********************************************************************
 * LEGACY IMPORT — CURRENT APK COMPATIBILITY
 **********************************************************************/

function legacyImport_(body) {
  const reviewCount = number_(body.reviewCount, 0);
  const provisionalCount = number_(body.provisionalCount, 0);
  const incoming = Array.isArray(body.ledgerRows) ? body.ledgerRows : [];
  const unresolved = incoming.filter(function (r) {
    const s = text_(r['검토상태']);
    return s === '검토 필요' || s === '잠정';
  });

  if (reviewCount > 0 || provisionalCount > 0 || unresolved.length > 0) {
    throw new Error('Legacy unresolved transactions block import. review=' + reviewCount + ', provisional=' + provisionalCount + ', rows=' + unresolved.length);
  }

  validateLedgerSanity_(incoming);

  const ss = financeSpreadsheet_();
  const ledger = ss.getSheetByName(SHEETS.LEDGER);
  const existing = existingLedgerKeys_();
  const newRows = incoming.filter(function (r) {
    const key = text_(r['중복키']);
    return key && !existing.has(key);
  });

  appendObjectsByExistingHeaders_(ledger, newRows);
  upsertSnapshot_(Array.isArray(body.snapshotRows) ? body.snapshotRows : [], body.periodEnd);
  applyCommittedSettlementNetting_();

  // Preserve existing app's import log + Notion behavior.
  const run = {
    analysisId: 'LEGACY-' + Date.now(),
    sourceFile: text_(body.sourceFile),
    periodStart: text_(body.periodStart),
    periodEnd: text_(body.periodEnd),
    transactionRowsRead: number_(body.transactionRowsRead, incoming.length)
  };

  const metrics = body.metrics || {};
  const localSkipped = number_(body.localSkipped, 0);
  const serverDuplicates = incoming.length - newRows.length;
  const explicitExcluded = hasNumericValue_(body.excludedCount) ? number_(body.excludedCount, 0) :
    (hasNumericValue_(body.autoExcludedCount) ? number_(body.autoExcludedCount, 0) : Math.max(0, run.transactionRowsRead - localSkipped - incoming.length));

  const stats = {
    transactionRowsRead: run.transactionRowsRead,
    inserted: newRows.length,
    appDuplicates: localSkipped,
    serverDuplicates: serverDuplicates,
    autoExcluded: explicitExcluded,
    autoConfirmed: hasNumericValue_(body.autoConfirmedCount) ? number_(body.autoConfirmedCount, 0) : incoming.length,
    settlementRecovery: incoming.filter(isSettlementRecoveryLedgerRow_).length,
    settlementMatched: hasNumericValue_(body.settlementMatchedCount) ? number_(body.settlementMatchedCount, 0) : incoming.filter(hasSettlementMatchEvidenceLedger_).length,
    reviewLow: 0,
    reviewHigh: 0
  };

  writeImportLog_(run, metrics, Array.isArray(body.snapshotRows) ? body.snapshotRows : [], stats);
  const notionState = updateNotionDateState_(run, newRows, stats);
  let notion = 'not-configured';
  try { notion = upsertNotionServerBrain_(run, metrics, stats, notionState); }
  catch (e) { notion = 'error: ' + String(e.message || e); }

  if (newRows.length) {
    bootstrapMerchantProfiles_();
    bootstrapPersonProfiles_();
  }

  return {
    ok: true,
    mode: 'LEGACY_IMPORT',
    backendVersion: BACKEND_VERSION,
    policyVersion: POLICY_VERSION,
    protocolVersion: PROTOCOL_VERSION,
    ledgerInserted: newRows.length,
    ledgerSkipped: serverDuplicates,
    autoExcluded: explicitExcluded,
    notion: notion,
    message: 'Legacy client accepted. Protocol v1 enables Server Brain classification without future APK rule updates.'
  };
}

function isSettlementRecoveryLedgerRow_(r) {
  return text_(r['재무거래유형']) === '정산' && text_(r['대분류']) === '정산' && /정산회수|정산/.test(text_(r['소분류']));
}

function hasSettlementMatchEvidenceLedger_(r) {
  if (!isSettlementRecoveryLedgerRow_(r)) return false;
  const t = (text_(r['상세내역']) + ' ' + text_(r['거래명'])).toLowerCase();
  return /정산매칭|정산 매칭|settlement match|matchedoriginal|matched original|settlementgroup/.test(t);
}


/**********************************************************************
 * LEDGER SANITY
 **********************************************************************/

function validateLedgerSanity_(rows) {
  rows.forEach(function (r, index) {
    const type = text_(r['재무거래유형']);
    const major = text_(r['대분류']);
    const minor = text_(r['소분류']);
    const income = Math.abs(number_(r['소득인식액'], 0));
    const spend = Math.abs(number_(r['소비지출액'], 0));
    const interest = Math.abs(number_(r['대출이자액'], 0));
    const pnl = numberSigned_(r['손익기준 순자산영향액']);

    if (!type || !major || !minor) throw new Error('Incomplete ledger classification at row ' + (index + 1));
    if (!text_(r['중복키'])) throw new Error('Missing duplicate key at row ' + (index + 1));

    if (major === '정산' && /정산회수/.test(minor)) {
      if (income !== 0 || spend !== 0 || interest !== 0 || Math.abs(pnl) > 0.001) {
        throw new Error('Settlement recovery accounting error at row ' + (index + 1));
      }
    }

    if (major === '정산' && /선결제/.test(minor)) {
      if (income !== 0 || spend !== 0 || Math.abs(pnl) > 0.001) {
        throw new Error('Settlement prepayment accounting error at row ' + (index + 1));
      }
    }
  });
}


/**********************************************************************
 * EXISTING LEDGER / EXPENSE LOOKUP
 **********************************************************************/

function existingLedgerKeys_() {
  const sheet = financeSpreadsheet_().getSheetByName(SHEETS.LEDGER);
  if (!sheet || sheet.getLastRow() < 2) return new Set();

  const headers = sheetHeaders_(sheet);
  const col = headers.indexOf('중복키');
  if (col < 0) throw new Error('01_거래원장 중복키 header missing');

  const values = sheet.getRange(2, col + 1, sheet.getLastRow() - 1, 1).getDisplayValues();
  return new Set(values.flat().map(function (v) { return text_(v); }).filter(Boolean));
}

function existingRawStableKeys_() {
  const sheet = financeSpreadsheet_().getSheetByName(SHEETS.RAW);
  if (!sheet || sheet.getLastRow() < 2) return new Set();

  const headers = sheetHeaders_(sheet);
  const idx = {};
  headers.forEach(function (h, i) { idx[h] = i; });

  const needed = ['Date','Time','Raw_Type','Merchant','Signed_Amount','Payment','Account'];
  if (needed.some(function (h) { return idx[h] === undefined; })) return new Set();

  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues();
  const out = new Set();
  values.forEach(function (row) {
    const key = buildStableDedupKey_({
      date: row[idx.Date],
      time: row[idx.Time],
      rawType: row[idx.Raw_Type],
      merchant: row[idx.Merchant],
      signedAmount: row[idx.Signed_Amount],
      payment: row[idx.Payment],
      account: row[idx.Account]
    });
    if (key) out.add(key);
  });
  return out;
}

function findExpenseBySourceKey_(analysisId, sourceKey) {
  const staging = findStaging_(analysisId, sourceKey);
  if (staging && staging.ledgerJson) {
    const r = safeJsonParse_(staging.ledgerJson, {});
    return {
      sourceKey: sourceKey,
      date: dateKey_(r['거래일']),
      merchant: text_(r['거래명']),
      amount: Math.abs(number_(r['금액'], 0)),
      major: text_(r['대분류']),
      minor: text_(r['소분류']),
      existing: false
    };
  }

  const ledger = financeSpreadsheet_().getSheetByName(SHEETS.LEDGER);
  const row = tableObjects_(ledger).find(function (r) { return text_(r['중복키']) === sourceKey; });
  if (!row) return null;

  return {
    sourceKey: sourceKey,
    date: dateKey_(row['거래일']),
    merchant: text_(row['거래명']),
    amount: Math.abs(number_(row['금액'], 0)),
    major: text_(row['대분류']),
    minor: text_(row['소분류']),
    existing: true
  };
}

function readRawForAnalysis_(analysisId) {
  return tableObjects_(financeSpreadsheet_().getSheetByName(SHEETS.RAW))
    .filter(function (r) { return text_(r.Analysis_ID) === analysisId; })
    .map(function (r) { return { status: text_(r.Status) }; });
}


/**********************************************************************
 * SAFE OBJECT-BASED SHEET IO
 **********************************************************************/

function appendObjectRow_(sheet, object) {
  appendObjectRows_(sheet, [object]);
}

function appendObjectRows_(sheet, objects) {
  if (!objects || !objects.length) return;
  const headers = sheetHeaders_(sheet);
  const values = objects.map(function (object) {
    return headers.map(function (header) {
      if (!header) return '';
      return Object.prototype.hasOwnProperty.call(object, header) ? normalizeSheetValue_(object[header]) : '';
    });
  });
  sheet.getRange(sheet.getLastRow() + 1, 1, values.length, headers.length).setValues(values);
}

function canonicalLedgerLastDataRow_(sheet) {
  if (!sheet) return 1;
  const headers = sheetHeaders_(sheet);
  let keyCol = headers.indexOf('중복키');
  if (keyCol < 0) keyCol = headers.indexOf('거래ID');
  if (keyCol < 0) return Math.max(1, sheet.getLastRow());

  const upper = Math.max(1, sheet.getLastRow());
  if (upper < 2) return 1;

  const values = sheet.getRange(2, keyCol + 1, upper - 1, 1).getDisplayValues();
  for (let i = values.length - 1; i >= 0; i--) {
    if (text_(values[i][0])) return i + 2;
  }
  return 1;
}

// Used for existing canonical sheets. Never changes their headers; maps only known names.
// For 01_거래원장, append immediately below the last real transaction key rather than
// trusting sheet.getLastRow(), which may be inflated by stray values/formulas below data.
function appendObjectsByExistingHeaders_(sheet, objects) {
  if (!objects || !objects.length) return;
  const headers = sheetHeaders_(sheet);
  const values = objects.map(function (object) {
    return headers.map(function (header) {
      if (!header) return '';
      return Object.prototype.hasOwnProperty.call(object, header) ? normalizeSheetValue_(object[header]) : '';
    });
  });
  const targetRow = sheet.getName() === SHEETS.LEDGER
    ? canonicalLedgerLastDataRow_(sheet) + 1
    : sheet.getLastRow() + 1;
  sheet.getRange(targetRow, 1, values.length, headers.length).setValues(values);
}

function upsertObjectByKey_(sheet, keyHeader, keyValue, object) {
  const data = sheet.getDataRange().getValues();
  const headers = data[0].map(function (v) { return text_(v); });
  const keyCol = headers.indexOf(keyHeader);
  if (keyCol < 0) throw new Error('Key header not found: ' + keyHeader);

  let targetRow = null;
  let existingRow = null;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][keyCol]) === String(keyValue)) {
      targetRow = i + 1;
      existingRow = data[i];
      break;
    }
  }

  const row = headers.map(function (header, colIdx) {
    if (!header) return existingRow ? existingRow[colIdx] : '';
    if (Object.prototype.hasOwnProperty.call(object, header)) return normalizeSheetValue_(object[header]);
    return existingRow ? existingRow[colIdx] : '';
  });

  if (targetRow) sheet.getRange(targetRow, 1, 1, row.length).setValues([row]);
  else sheet.getRange(sheet.getLastRow() + 1, 1, 1, row.length).setValues([row]);
}

function existingValueByKey_(sheet, keyHeader, keyValue, valueHeader) {
  const obj = findObjectByKey_(sheet, keyHeader, keyValue);
  return obj ? obj[valueHeader] : '';
}

function findObjectByKey_(sheet, keyHeader, keyValue) {
  return tableObjects_(sheet).find(function (r) { return String(r[keyHeader] || '') === String(keyValue); }) || null;
}

function tableObjects_(sheet) {
  if (!sheet || sheet.getLastRow() < 2) return [];
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(function (v) { return String(v || '').trim(); });
  return values.slice(1).map(function (row, index) {
    const obj = rowObject_(headers, row);
    obj.__row = index + 2;
    return obj;
  });
}

function rowObject_(headers, row) {
  const obj = {};
  headers.forEach(function (h, i) {
    if (h) obj[h] = row[i];
  });
  return obj;
}

function readTableMap_(sheet, keyHeader) {
  const map = {};
  tableObjects_(sheet).forEach(function (r) {
    const key = text_(r[keyHeader]);
    if (key) map[key] = r;
  });
  return map;
}

function setCellByHeader_(sheet, header, row, name, value) {
  const col = header.indexOf(name);
  if (col < 0) throw new Error('Header not found: ' + name);
  sheet.getRange(row, col + 1).setValue(value);
}


/**********************************************************************
 * NORMALIZATION / DATE / TIME / NUMBER / JSON
 **********************************************************************/

function normalizeMerchant_(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/주식회사/g, '')
    .replace(/\(주\)/g, '')
    .replace(/㈜/g, '')
    .replace(/\s+/g, '')
    .replace(/[.,_\-]/g, '')
    .trim();
}

function normalizePerson_(value) {
  return String(value || '').replace(/\s+/g, '').trim();
}

function dateKey_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value)) {
    return Utilities.formatDate(value, Session.getScriptTimeZone() || 'Asia/Seoul', 'yyyy-MM-dd');
  }
  const text = String(value || '').trim();
  const m = text.match(/^(\d{4})[-./]\s*(\d{1,2})[-./]\s*(\d{1,2})/);
  if (!m) return text.slice(0, 10);
  return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
}

function normalizeTime_(value) {
  const s = String(value || '').trim();
  const m = s.match(/(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/);
  if (!m) return '00:00:00';
  return ('0' + m[1]).slice(-2) + ':' + ('0' + m[2]).slice(-2) + ':' + ('0' + (m[3] || '0')).slice(-2);
}

function timeSeconds_(value) {
  const p = normalizeTime_(value).split(':').map(Number);
  return p[0] * 3600 + p[1] * 60 + p[2];
}

function dateDiffDays_(older, newer) {
  const a = new Date(older + 'T00:00:00+09:00');
  const b = new Date(newer + 'T00:00:00+09:00');
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

function addDays_(date, days) {
  const d = new Date(date + 'T00:00:00+09:00');
  d.setDate(d.getDate() + days);
  return Utilities.formatDate(d, 'Asia/Seoul', 'yyyy-MM-dd');
}

function minDate_(dates) {
  const x = dates.filter(Boolean).sort();
  return x.length ? x[0] : '';
}

function maxDate_(dates) {
  const x = dates.filter(Boolean).sort();
  return x.length ? x[x.length - 1] : '';
}

function today_() {
  return Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd');
}

function number_(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback === undefined ? 0 : fallback;
  if (typeof value === 'number') return isFinite(value) ? value : (fallback === undefined ? 0 : fallback);
  let s = String(value).trim();
  if (/^\(.*\)$/.test(s)) s = '-' + s.slice(1, -1);
  const n = Number(s.replace(/[,원\s]/g, '').replace(/^\+/, ''));
  return isFinite(n) ? n : (fallback === undefined ? 0 : fallback);
}

function numberSigned_(value) {
  return number_(value, 0);
}

function nullableNumber_(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const n = number_(value, null);
  return n === null ? null : n;
}

function hasNumericValue_(value) {
  if (value === null || value === undefined || value === '') return false;
  return isFinite(Number(String(value).replace(/[,원\s]/g, '')));
}

function bool_(value) {
  if (value === true) return true;
  const s = String(value || '').trim().toUpperCase();
  return s === 'TRUE' || s === 'Y' || s === 'YES' || s === '1';
}

function text_(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

function safeJsonParse_(value, fallback) {
  try {
    if (value === null || value === undefined || value === '') return fallback;
    if (typeof value === 'object') return value;
    return JSON.parse(String(value));
  } catch (e) {
    return fallback;
  }
}

function shortHash_(text) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(text), Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('').slice(0, 12);
}

function now_() {
  return Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss');
}

function normalizeSheetValue_(v) {
  if (v === null || v === undefined) return '';
  return v;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}


/**********************************************************************
 * FINANCE OS · BANKSALAD SERVER BRAIN
 * REVIEW RELIABILITY PATCH RR1
 * Target: live Backend 1.2.0 / Policy 3.2.0
 *
 * 적용 방식
 * - 현재 운영 중인 Server Brain 소스의 맨 아래에 이 블록을 추가한다.
 * - 기존 전체 소스를 v1.1.0으로 되돌리지 않는다.
 * - Apps Script에서는 동일 이름의 뒤쪽 function 선언이 앞 정의를 대체한다.
 *
 * 목적
 * 1) 추천 type/major/minor가 비어 있는데도 "추천 분류 확정"을 노출하는 버그 차단
 * 2) 구버전 APK가 type/major/minor를 누락해도 서버 추천이 완전하면 안전하게 fallback
 * 3) 서버 추천 자체가 불완전하면 SELECTION_REQUIRED로 명확히 거절
 * 4) 분석 결과 conservation(원본 거래 수 보존) 메타데이터 추가
 **********************************************************************/

var REVIEW_RELIABILITY_PATCH_VERSION = 'RR1-2026-09-14';

/* [v1.4.3 CLEAN] superseded duplicate function removed: hasCompleteClassification_ */

/**
 * 기존 함수 override.
 * 추천이 완전할 때만 confirm 액션을 내려준다.
 */
/* [v1.4.3 CLEAN] superseded duplicate function removed: classificationOptions_ */

/**
 * 기존 함수 override.
 * Android가 추천 완전성 여부를 별도 추론하지 않아도 된다.
 */
/* [v1.4.3 CLEAN] superseded duplicate function removed: reviewForClient_ */

/**
 * 기존 함수 override.
 * body에 선택값이 없을 경우 server recommendation으로 fallback한다.
 * 단, recommendation까지 비어 있으면 절대 임의 확정하지 않는다.
 */
/* [v1.4.3 CLEAN] superseded duplicate function removed: resolveClassificationReview_ */

/**
 * 기존 함수 override.
 * settlement link review는 거래 1건이 추가되는 개념이 아니므로
 * conservation 계산에서는 results의 transaction status만 사용한다.
 */
function summarizeAnalysis_(txns, results, reviews, settlementOutcome) {
  var sourceTransactions = txns.length;
  var duplicate = results.filter(function (r) { return r.status === 'DUPLICATE'; }).length;
  var autoExcluded = results.filter(function (r) { return r.status === 'EXCLUDED'; }).length;
  var autoConfirmed = results.filter(function (r) { return r.status === 'AUTO'; }).length;

  // IMPORTANT: conservation is transaction-based. A SETTLEMENT_LINK review is an
  // extra review item attached to an already-counted transaction, not another
  // economic transaction. Keep the legacy `review` field transaction-based so
  // older Android clients do not double-count link reviews and report -N unexplained.
  var reviewTransactions = results.filter(function (r) { return r.status === 'REVIEW'; }).length;
  var reviewItems = reviews.length;
  var settlementLinkReviews = reviews.filter(function (x) { return x.reviewType === 'SETTLEMENT_LINK'; }).length;
  var classificationReviewItems = reviews.filter(function (x) { return x.reviewType === 'CLASSIFICATION'; }).length;
  var reviewHigh = reviews.filter(function (x) { return x.risk === 'HIGH'; }).length;
  var reviewLow = reviews.filter(function (x) { return x.risk === 'LOW'; }).length;

  var accountedTransactions = duplicate + autoExcluded + autoConfirmed + reviewTransactions;
  var unaccountedTransactions = sourceTransactions - accountedTransactions;
  var conservationOk = unaccountedTransactions === 0;

  return {
    sourceTransactions: sourceTransactions,
    duplicate: duplicate,
    autoExcluded: autoExcluded,
    autoConfirmed: autoConfirmed,

    // Backward-compatible field consumed by the current APK.
    review: reviewTransactions,
    reviewTransactions: reviewTransactions,

    // New explicit review-item metadata. These may exceed reviewTransactions
    // because settlement-link decisions are review items, not new transactions.
    reviewItems: reviewItems,
    classificationReviewItems: classificationReviewItems,
    settlementLinkReviews: settlementLinkReviews,
    reviewHigh: reviewHigh,
    reviewLow: reviewLow,
    settlementRecovery: results.filter(function (r) {
      return r.type === '정산' && r.minor === '일반 정산회수';
    }).length,
    settlementMatched: settlementOutcome.links.length,

    // RR1 integrity metadata
    accountedTransactions: accountedTransactions,
    unaccountedTransactions: unaccountedTransactions,
    conservationOk: conservationOk,
    analysisStatus: !conservationOk
      ? 'INCOMPLETE'
      : ((reviewHigh + reviewLow) > 0 ? 'REVIEW_REQUIRED' : 'READY_TO_COMMIT'),
    reviewReliabilityPatch: REVIEW_RELIABILITY_PATCH_VERSION
  };
}


/**********************************************************************
 * FINANCE OS · BANKSALAD SERVER BRAIN
 * CLASSIFIER INTELLIGENCE PATCH CI1
 * Target: live Backend 1.2.0 + RR1
 * Date: 2026-09-14
 *
 * APPLY
 * - Append AFTER SERVER_APPEND_PATCH_v1.2.1_RR1.gs.
 * - Do not replace the live Server Brain with an older full source.
 *
 * DATA LAYER EXPECTED IN FINANCE OS SHEET
 * - SB_Rule_Master: includes CI1-* rules generated from 12Y audit.
 * - SB_Lifetime_Candidates: 12-year merchant candidates generated from
 *   confirmed Finance OS ledger rows.
 *
 * GOALS
 * 1) Use 12Y history as a second-horizon classifier, without weakening
 *    the existing 730-day recent Merchant Profile.
 * 2) Auto-confirm only conservative, recent, highly consistent spend
 *    merchants. Use medium-confidence history as recommendations only.
 * 3) Keep broad payment platforms / convenience stores / processors from
 *    becoming merchant-only auto rules.
 * 4) Add direction guards to high-risk Rule Master rules such as
 *    insurance reimbursements and prepaid-wallet topups.
 **********************************************************************/

var CI1_PATCH_VERSION = 'CI1-2026-09-14';
var CI1_LIFETIME_SHEET = 'SB_Lifetime_Candidates';
var __CI1_LIFETIME_CACHE = null;

function loadCI1Config_() {
  var cfg = {
    lifetimeAutoMinCount: 5,
    lifetimeAutoConfidence: 0.98,
    lifetimeSuggestMinCount: 3,
    lifetimeSuggestConfidence: 0.90,
    ambiguousMerchantAuto: false
  };

  try {
    var sheet = financeSpreadsheet_().getSheetByName(SHEETS.CONFIG);
    if (!sheet) return cfg;
    var map = {};
    tableObjects_(sheet).forEach(function (r) {
      var k = text_(r.Key);
      if (k) map[k] = r.Value;
    });
    cfg.lifetimeAutoMinCount = number_(map.LIFETIME_AUTO_MIN_COUNT, cfg.lifetimeAutoMinCount);
    cfg.lifetimeAutoConfidence = number_(map.LIFETIME_AUTO_CONFIDENCE, cfg.lifetimeAutoConfidence);
    cfg.lifetimeSuggestMinCount = number_(map.LIFETIME_SUGGEST_MIN_COUNT, cfg.lifetimeSuggestMinCount);
    cfg.lifetimeSuggestConfidence = number_(map.LIFETIME_SUGGEST_CONFIDENCE, cfg.lifetimeSuggestConfidence);
    cfg.ambiguousMerchantAuto = bool_(map.AMBIGUOUS_MERCHANT_AUTO);
  } catch (e) {}
  return cfg;
}

/**
 * Broader ambiguity guard.
 * Explicit semantic merchants (e.g. Kakao T taxi) are allowed; generic
 * payment platforms / processors / broad retailers are not merchant-only AUTO.
 */
function isAmbiguousMerchant_(merchant) {
  var s = String(merchant || '').toLowerCase();

  // Explicit service names are semantically strong enough.
  if (/쿠팡이츠/.test(s)) return false;
  if (/카카오t.*택시|카카오t.*대리|카카오페이\s*\(택시\)|티머니택시|grab\.com/.test(s)) return false;

  return (
    /쿠팡|쿠페이/.test(s) ||
    /네이버페이/.test(s) ||
    /카카오페이/.test(s) ||
    /나이스정보통신/.test(s) ||
    /(^|\s)pg($|\s)/.test(s) ||
    /kcp|이니시스/.test(s) ||
    /gs25|지에스25|(^|[^a-z])cu([^a-z]|$)|씨유|세븐일레븐|코리아세븐|이마트24/.test(s) ||
    /ssg\.com|11번가|g마켓|옥션/.test(s) ||
    /백화점|아울렛/.test(s) ||
    /송금\s*내역/.test(s) ||
    /공공기관/.test(s) ||
    /^google$/i.test(String(merchant || '').trim()) ||
    /^apple$/i.test(String(merchant || '').trim())
  );
}

/** Direction-sensitive guards that the generic Rule Master schema cannot express. */
function ci1RulePrecondition_(tx, rule) {
  var id = text_(rule && rule.ruleId);
  var amount = number_(tx && tx.signedAmount, 0);

  // User policy: generic Coupang/Coupay purchases must be chosen per transaction.
  // Do not allow historical/promoted merchant rules to silently classify them.
  if (isPerTransactionMerchant_(tx && tx.merchant)) return false;

  if (id === 'USER-SAMSUNG-FIRE-COMPENSATION') return amount > 0;
  if (id === 'USER-GYEONGGI-CURRENCY-TOPUP') return amount < 0;

  if (
    text_(rule && rule.resultMajor) === '기타유입·유출' &&
    /보험금|보상금/.test(text_(rule && rule.resultMinor))
  ) return amount > 0;

  return true;
}

/**
 * Override Rule Master matcher so a rule that fails a direction precondition
 * is skipped and the engine can continue to the next rule.
 */
function matchRule_(tx, rules, standard) {
  for (var i = 0; i < rules.length; i++) {
    var r = rules[i];
    var absAmount = Math.abs(tx.signedAmount);

    if (r.amountMin !== null && absAmount < r.amountMin) continue;
    if (r.amountMax !== null && absAmount > r.amountMax) continue;
    if (r.paymentPattern && tx.payment.toLowerCase().indexOf(r.paymentPattern.toLowerCase()) < 0) continue;
    if (r.rawMajorPattern && tx.rawMajor.toLowerCase().indexOf(r.rawMajorPattern.toLowerCase()) < 0) continue;

    var value = ruleFieldValue_(tx, r.field);
    if (!matchText_(value, r.pattern, r.matchType)) continue;

    if (r.resultMajor && r.resultMinor && !classificationAvailable_(standard, r.resultMajor, r.resultMinor)) continue;
    if (!ci1RulePrecondition_(tx, r)) continue;

    return r;
  }
  return null;
}

/**
 * Loads the compact 12Y candidate table once per Apps Script execution.
 * Candidate table is intentionally filtered by the Sheet layer to keep this
 * small (~hundreds of rows rather than the full 25k-row ledger).
 */
function loadLifetimeCandidatesCI1_() {
  if (__CI1_LIFETIME_CACHE !== null) return __CI1_LIFETIME_CACHE;

  var out = {};
  var sheet = financeSpreadsheet_().getSheetByName(CI1_LIFETIME_SHEET);
  if (!sheet || sheet.getLastRow() < 2) {
    __CI1_LIFETIME_CACHE = out;
    return out;
  }

  tableObjects_(sheet).forEach(function (r) {
    var merchant = text_(r.Merchant);
    var key = normalizeMerchant_(merchant);
    if (!key) return;

    var candidate = {
      merchant: merchant,
      observations: number_(r.Lifetime_Total, 0),
      confidence: number_(r.Lifetime_Confidence, 0),
      type: text_(r.Dominant_Type),
      major: text_(r.Dominant_Major),
      minor: text_(r.Dominant_Minor),
      decision: text_(r.Decision),
      lastDate: dateKey_(r.Last_Date),
      conflict: false
    };

    if (!candidate.type || !candidate.major || !candidate.minor) return;
    if (candidate.decision !== 'SAFE_AUTO' && candidate.decision !== 'SAFE_SUGGEST') return;

    var prev = out[key];
    if (!prev) {
      out[key] = candidate;
      return;
    }

    var sameClass = (
      prev.type === candidate.type &&
      prev.major === candidate.major &&
      prev.minor === candidate.minor
    );

    if (!sameClass) {
      // Normalized aliases disagree: never AUTO from 12Y history.
      prev.conflict = true;
      prev.decision = 'SAFE_SUGGEST';
      if (candidate.observations > prev.observations) {
        candidate.conflict = true;
        candidate.decision = 'SAFE_SUGGEST';
        out[key] = candidate;
      }
      return;
    }

    // Same-class aliases: keep the strongest evidence and add support count.
    prev.observations += candidate.observations;
    prev.confidence = Math.max(prev.confidence, candidate.confidence);
    if (candidate.decision !== 'SAFE_AUTO') prev.decision = 'SAFE_SUGGEST';
    if (candidate.lastDate > prev.lastDate) prev.lastDate = candidate.lastDate;
  });

  __CI1_LIFETIME_CACHE = out;
  return out;
}

/**
 * 12Y second-horizon classification.
 * - SAFE_AUTO: spend only, high consistency, non-ambiguous merchant.
 * - SAFE_SUGGEST or ambiguous merchant: REVIEW recommendation, never AUTO.
 * - High-risk accounting types are recommendation-only even when historically stable.
 */
function lifetimeClassificationCI1_(tx, standard) {
  var key = normalizeMerchant_(tx.merchant);
  if (!key) return null;

  var p = loadLifetimeCandidatesCI1_()[key];
  if (!p) return null;
  if (!classificationAvailable_(standard, p.major, p.minor)) return null;
  if (!classificationDirectionCompatible_(tx.signedAmount, p.type, p.minor)) return null;

  var cfg = loadCI1Config_();
  var pct = Math.round(p.confidence * 100);
  var ambiguous = isAmbiguousMerchant_(tx.merchant) || p.conflict;
  var highRisk = inferRisk_(p.type) === 'HIGH';

  if (
    p.decision === 'SAFE_AUTO' &&
    (!ambiguous || cfg.ambiguousMerchantAuto) &&
    !highRisk &&
    p.type === '소비지출' &&
    p.observations >= cfg.lifetimeAutoMinCount &&
    p.confidence >= cfg.lifetimeAutoConfidence
  ) {
    return {
      status: 'AUTO',
      type: p.type,
      major: p.major,
      minor: p.minor,
      confidence: Math.min(99, Math.max(95, pct)),
      risk: 'LOW',
      source: 'LIFETIME_PROFILE_12Y',
      reason: '12년 원장 ' + p.observations + '회 / 일관성 ' + pct + '%'
    };
  }

  if (p.observations < cfg.lifetimeSuggestMinCount || p.confidence < cfg.lifetimeSuggestConfidence) return null;

  // Recommendation only. Ambiguous merchants are deliberately capped.
  var suggestionConfidence = ambiguous
    ? Math.min(88, Math.max(65, pct))
    : Math.min(94, Math.max(75, pct));

  return {
    status: 'REVIEW',
    type: p.type,
    major: p.major,
    minor: p.minor,
    confidence: suggestionConfidence,
    risk: highRisk ? 'HIGH' : 'LOW',
    source: 'LIFETIME_SUGGEST_12Y',
    reason: '12년 원장 유사패턴 ' + p.observations + '회 / 일관성 ' + pct + '%' + (ambiguous ? ' / 범용 가맹점이라 자동확정 금지' : '')
  };
}

function ci1ResultFromCandidate_(candidate) {
  if (!candidate) return null;
  return result_({
    status: candidate.status,
    type: candidate.type,
    major: candidate.major,
    minor: candidate.minor,
    confidence: candidate.confidence,
    source: candidate.source,
    risk: candidate.risk,
    reason: candidate.reason
  });
}

/**
 * Override base classifier while preserving the existing pipeline.
 * New behavior is inserted only between existing evidence sources and the
 * final unknown fallback.
 */
/* [v1.4.3 CLEAN] superseded duplicate function removed: classifyBase_ */


/**********************************************************************
 * FINANCE OS · BANKSALAD SERVER BRAIN
 * CLASSIFIER INTELLIGENCE PATCH CI2 — ADAPTIVE PERSONAL LEARNING
 * Target: live Backend 1.2.0 + RR1 + CI1
 * Date: 2026-09-14
 *
 * APPLY
 * - Append AFTER SERVER_APPEND_PATCH_v1.2.2_CI1.gs.
 * - Do not replace the live Server Brain with an older full source.
 *
 * DESIGN GOALS
 * 1) One user confirmation must affect the NEXT similar transaction.
 * 2) Repeated consistent confirmations promote REVIEW -> AUTO.
 * 3) User overrides are negative evidence against old/generic guesses.
 * 4) Ambiguous merchants (Coupang/KakaoPay/PG/etc.) stay conservative.
 * 5) Do NOT scan the 12Y ledger on every upload.
 *    The 12Y audit stays precomputed in CI1 tables; CI2 loads only a compact
 *    adaptive-learning table once per Apps Script execution and uses O(1)
 *    hash-map lookups per transaction.
 **********************************************************************/

var CI2_PATCH_VERSION = 'CI2-2026-09-14';
var CI2_LEARNING_SHEET = 'SB_Adaptive_Learning_V2';
var __CI2_PROFILE_CACHE = null;
var __CI2_CONFIG_CACHE = null;

var CI2_HEADERS = [
  'Pattern_Key','Level','Merchant_Key','Direction','Amount','Raw_Major_Key','Payment_Key',
  'Counts_JSON','Total_Count','Dominant_Type','Dominant_Major','Dominant_Minor','Dominant_Count',
  'Confidence','Conflict_Count','Override_Count','Last_Override_From','Status',
  'First_Seen','Last_Seen','Updated_At'
];

function loadCI2Config_() {
  if (__CI2_CONFIG_CACHE !== null) return __CI2_CONFIG_CACHE;

  var cfg = {
    suggestAfterOne: true,
    contextAutoMinCount: 3,
    merchantAutoMinCount: 4,
    exactAutoMinCount: 3,
    highRiskAutoMinCount: 4,
    autoMinConsistency: 0.98,
    ambiguousExactAuto: true,
    ambiguousContextAuto: false,
    ambiguousMerchantAuto: false
  };

  try {
    var sheet = financeSpreadsheet_().getSheetByName(SHEETS.CONFIG);
    if (!sheet) { __CI2_CONFIG_CACHE = cfg; return cfg; }
    var map = {};
    tableObjects_(sheet).forEach(function (r) {
      var k = text_(r.Key);
      if (k) map[k] = r.Value;
    });

    if (map.CI2_SUGGEST_AFTER_ONE !== undefined) cfg.suggestAfterOne = bool_(map.CI2_SUGGEST_AFTER_ONE);
    cfg.contextAutoMinCount = number_(map.CI2_CONTEXT_AUTO_MIN_COUNT, cfg.contextAutoMinCount);
    cfg.merchantAutoMinCount = number_(map.CI2_MERCHANT_AUTO_MIN_COUNT, cfg.merchantAutoMinCount);
    cfg.exactAutoMinCount = number_(map.CI2_EXACT_AUTO_MIN_COUNT, cfg.exactAutoMinCount);
    cfg.highRiskAutoMinCount = number_(map.CI2_HIGH_RISK_AUTO_MIN_COUNT, cfg.highRiskAutoMinCount);
    cfg.autoMinConsistency = number_(map.CI2_AUTO_MIN_CONSISTENCY, cfg.autoMinConsistency);
    if (map.CI2_AMBIGUOUS_EXACT_AUTO !== undefined) cfg.ambiguousExactAuto = bool_(map.CI2_AMBIGUOUS_EXACT_AUTO);
    if (map.CI2_AMBIGUOUS_CONTEXT_AUTO !== undefined) cfg.ambiguousContextAuto = bool_(map.CI2_AMBIGUOUS_CONTEXT_AUTO);
    if (map.CI2_AMBIGUOUS_MERCHANT_AUTO !== undefined) cfg.ambiguousMerchantAuto = bool_(map.CI2_AMBIGUOUS_MERCHANT_AUTO);
  } catch (e) {}

  __CI2_CONFIG_CACHE = cfg;
  return cfg;
}

function ensureCI2LearningSheet_() {
  var ss = financeSpreadsheet_();
  var sheet = ss.getSheetByName(CI2_LEARNING_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(CI2_LEARNING_SHEET);
  }

  if (sheet.getMaxColumns() < CI2_HEADERS.length) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), CI2_HEADERS.length - sheet.getMaxColumns());
  }

  if (sheet.getLastRow() < 1 || text_(sheet.getRange(1, 1).getValue()) !== CI2_HEADERS[0]) {
    sheet.getRange(1, 1, 1, CI2_HEADERS.length).setValues([CI2_HEADERS]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function ci2Token_(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[.,_\-\/\\()[\]{}]/g, '')
    .trim()
    .slice(0, 80);
}

function ci2Direction_(signedAmount) {
  var n = number_(signedAmount, 0);
  return n > 0 ? 'IN' : (n < 0 ? 'OUT' : 'ZERO');
}

function ci2ClassKey_(classification) {
  if (!classification) return '';
  var type = text_(classification.type || classification.recommendedType);
  var major = text_(classification.major || classification.recommendedMajor);
  var minor = text_(classification.minor || classification.recommendedMinor);
  if (!type || !major || !minor) return '';
  return [type, major, minor].join('|');
}

function ci2ParseClassKey_(key) {
  var p = String(key || '').split('|');
  return { type: p[0] || '', major: p[1] || '', minor: p[2] || '' };
}

function ci2SameClass_(a, b) {
  var ka = ci2ClassKey_(a);
  var kb = ci2ClassKey_(b);
  return !!ka && ka === kb;
}

/**
 * Three hierarchical pattern levels.
 * EXACT   : same merchant + direction + exact amount + raw category + payment
 * CONTEXT : same merchant + direction + raw category (amount may change)
 * MERCHANT: same merchant + direction only
 *
 * A single manual confirmation therefore helps future different-amount trades
 * through CONTEXT/MERCHANT, while ambiguous merchants can still be prevented
 * from merchant-only auto-confirmation.
 */
function ci2PatternSpecs_(tx) {
  var merchantKey = normalizeMerchant_(tx.merchant);
  if (!merchantKey) return [];

  var direction = ci2Direction_(tx.signedAmount);
  var amount = Math.abs(number_(tx.signedAmount, 0));
  var rawMajorKey = ci2Token_(tx.rawMajor);
  var paymentKey = ci2Token_(tx.payment);

  return [
    {
      level: 'EXACT',
      key: ['CI2','EXACT',merchantKey,direction,String(amount),rawMajorKey,paymentKey].join('|'),
      merchantKey: merchantKey, direction: direction, amount: amount,
      rawMajorKey: rawMajorKey, paymentKey: paymentKey
    },
    {
      level: 'CONTEXT',
      key: ['CI2','CONTEXT',merchantKey,direction,rawMajorKey].join('|'),
      merchantKey: merchantKey, direction: direction, amount: '',
      rawMajorKey: rawMajorKey, paymentKey: ''
    },
    {
      level: 'MERCHANT',
      key: ['CI2','MERCHANT',merchantKey,direction].join('|'),
      merchantKey: merchantKey, direction: direction, amount: '',
      rawMajorKey: '', paymentKey: ''
    }
  ];
}

function loadCI2Profiles_() {
  if (__CI2_PROFILE_CACHE !== null) return __CI2_PROFILE_CACHE;

  var map = {};
  var sheet = ensureCI2LearningSheet_();
  if (sheet.getLastRow() < 2) {
    __CI2_PROFILE_CACHE = map;
    return map;
  }

  var values = sheet.getRange(1, 1, sheet.getLastRow(), CI2_HEADERS.length).getValues();
  var header = values[0].map(String);
  var idx = {};
  header.forEach(function (h, i) { idx[h] = i; });

  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var key = text_(row[idx.Pattern_Key]);
    if (!key) continue;

    map[key] = {
      row: r + 1,
      patternKey: key,
      level: text_(row[idx.Level]),
      merchantKey: text_(row[idx.Merchant_Key]),
      direction: text_(row[idx.Direction]),
      amount: number_(row[idx.Amount], 0),
      rawMajorKey: text_(row[idx.Raw_Major_Key]),
      paymentKey: text_(row[idx.Payment_Key]),
      counts: safeJsonParse_(row[idx.Counts_JSON], {}),
      totalCount: number_(row[idx.Total_Count], 0),
      type: text_(row[idx.Dominant_Type]),
      major: text_(row[idx.Dominant_Major]),
      minor: text_(row[idx.Dominant_Minor]),
      dominantCount: number_(row[idx.Dominant_Count], 0),
      confidence: number_(row[idx.Confidence], 0),
      conflictCount: number_(row[idx.Conflict_Count], 0),
      overrideCount: number_(row[idx.Override_Count], 0),
      lastOverrideFrom: text_(row[idx.Last_Override_From]),
      status: text_(row[idx.Status]),
      firstSeen: row[idx.First_Seen],
      lastSeen: row[idx.Last_Seen],
      updatedAt: row[idx.Updated_At]
    };
  }

  __CI2_PROFILE_CACHE = map;
  return map;
}

function ci2DominantFromCounts_(counts) {
  var entries = Object.keys(counts || {}).map(function (k) {
    return { key: k, count: number_(counts[k], 0) };
  }).filter(function (x) { return x.key && x.count > 0; })
    .sort(function (a, b) { return b.count - a.count; });

  if (!entries.length) return null;
  var total = entries.reduce(function (s, x) { return s + x.count; }, 0);
  return {
    key: entries[0].key,
    count: entries[0].count,
    total: total,
    conflictCount: total - entries[0].count,
    confidence: total > 0 ? entries[0].count / total : 0
  };
}

/**
 * Batch-update the three hierarchical profile rows after ONE manual decision.
 * This is intentionally a compact profile update, not a ledger rescan.
 */
function recordAdaptiveLearningCI2_(tx, classification, review) {
  if (isPerTransactionMerchant_(tx && tx.merchant)) return;

  var classKey = ci2ClassKey_(classification);
  if (!classKey) return;

  var specs = ci2PatternSpecs_(tx);
  if (!specs.length) return;

  var sheet = ensureCI2LearningSheet_();
  var lastRow = sheet.getLastRow();
  var data = lastRow >= 1
    ? sheet.getRange(1, 1, lastRow, CI2_HEADERS.length).getValues()
    : [CI2_HEADERS];
  var header = data[0].map(String);
  var idx = {};
  header.forEach(function (h, i) { idx[h] = i; });

  var rowByKey = {};
  for (var i = 1; i < data.length; i++) {
    var k = text_(data[i][idx.Pattern_Key]);
    if (k) rowByKey[k] = i + 1;
  }

  var recommendedKey = ci2ClassKey_({
    type: review && review.recommendedType,
    major: review && review.recommendedMajor,
    minor: review && review.recommendedMinor
  });
  var wasOverride = !!recommendedKey && recommendedKey !== classKey;
  var now = now_();
  var appends = [];

  specs.forEach(function (spec) {
    var rowNumber = rowByKey[spec.key] || 0;
    var existing = rowNumber ? data[rowNumber - 1] : null;
    var counts = existing ? safeJsonParse_(existing[idx.Counts_JSON], {}) : {};
    counts[classKey] = number_(counts[classKey], 0) + 1;

    var dom = ci2DominantFromCounts_(counts);
    var cls = ci2ParseClassKey_(dom.key);
    var previousOverrides = existing ? number_(existing[idx.Override_Count], 0) : 0;
    var status = dom.conflictCount > 0 ? 'CONFLICT' : (dom.total >= 3 ? 'MATURE' : 'LEARNING');

    var obj = {
      Pattern_Key: spec.key,
      Level: spec.level,
      Merchant_Key: spec.merchantKey,
      Direction: spec.direction,
      Amount: spec.amount,
      Raw_Major_Key: spec.rawMajorKey,
      Payment_Key: spec.paymentKey,
      Counts_JSON: JSON.stringify(counts),
      Total_Count: dom.total,
      Dominant_Type: cls.type,
      Dominant_Major: cls.major,
      Dominant_Minor: cls.minor,
      Dominant_Count: dom.count,
      Confidence: dom.confidence,
      Conflict_Count: dom.conflictCount,
      Override_Count: previousOverrides + (wasOverride ? 1 : 0),
      Last_Override_From: wasOverride ? recommendedKey : (existing ? text_(existing[idx.Last_Override_From]) : ''),
      Status: status,
      First_Seen: existing ? (existing[idx.First_Seen] || now) : now,
      Last_Seen: now,
      Updated_At: now
    };

    var rowValues = CI2_HEADERS.map(function (h) { return obj[h] === undefined ? '' : obj[h]; });
    if (rowNumber) {
      sheet.getRange(rowNumber, 1, 1, CI2_HEADERS.length).setValues([rowValues]);
    } else {
      appends.push(rowValues);
    }
  });

  if (appends.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, appends.length, CI2_HEADERS.length).setValues(appends);
  }

  // Future lookups in this execution must see the new learning.
  __CI2_PROFILE_CACHE = null;
}

function ci2DisplayConfidence_(profile) {
  var n = number_(profile.totalCount, 0);
  var observed = number_(profile.confidence, 0);
  var base = profile.level === 'EXACT' ? 93 : (profile.level === 'CONTEXT' ? 89 : 84);
  var maturity = n <= 1 ? 0 : (n === 2 ? 4 : (n === 3 ? 6 : 7));
  var score = Math.min(99, base + maturity);

  // Conflicting manual decisions reduce recommendation strength immediately.
  score = Math.round(score * Math.min(1, 0.50 + observed * 0.50));
  if (profile.conflictCount > 0) score = Math.min(score, 84);
  return Math.max(55, score);
}

function ci2CanAuto_(profile, tx) {
  var cfg = loadCI2Config_();
  var ambiguous = isAmbiguousMerchant_(tx.merchant);
  var highRisk = inferRisk_(profile.type) === 'HIGH';
  var n = number_(profile.totalCount, 0);
  var consistency = number_(profile.confidence, 0);

  if (profile.conflictCount > 0 || consistency < cfg.autoMinConsistency) return false;
  if (!classificationDirectionCompatible_(tx.signedAmount, profile.type, profile.minor)) return false;

  var minCount;
  if (profile.level === 'EXACT') minCount = cfg.exactAutoMinCount;
  else if (profile.level === 'CONTEXT') minCount = cfg.contextAutoMinCount;
  else minCount = cfg.merchantAutoMinCount;

  if (highRisk) minCount = Math.max(minCount, cfg.highRiskAutoMinCount);
  if (n < minCount) return false;

  if (ambiguous) {
    if (profile.level === 'EXACT') return cfg.ambiguousExactAuto;
    if (profile.level === 'CONTEXT') return cfg.ambiguousContextAuto;
    return cfg.ambiguousMerchantAuto;
  }

  // High-risk categories require exact or contextual repeated evidence, never
  // merchant-only auto from personal learning.
  if (highRisk && profile.level === 'MERCHANT') return false;
  return true;
}

/**
 * Returns the strongest personal-learning evidence for this transaction.
 * One manual confirmation -> REVIEW recommendation immediately.
 * Repeated consistent confirmations -> AUTO according to guarded thresholds.
 */
function adaptiveClassificationCI2_(tx, standard) {
  if (isPerTransactionMerchant_(tx && tx.merchant)) return null;

  var profiles = loadCI2Profiles_();
  var specs = ci2PatternSpecs_(tx);
  if (!specs.length) return null;

  var best = null;
  var rank = { EXACT: 3, CONTEXT: 2, MERCHANT: 1 };

  specs.forEach(function (spec) {
    var p = profiles[spec.key];
    if (!p || p.totalCount < 1) return;
    if (!p.type || !p.major || !p.minor) return;
    if (!classificationAvailable_(standard, p.major, p.minor)) return;
    if (!classificationDirectionCompatible_(tx.signedAmount, p.type, p.minor)) return;

    var displayConfidence = ci2DisplayConfidence_(p);
    var auto = ci2CanAuto_(p, tx);
    var candidate = {
      status: auto ? 'AUTO' : 'REVIEW',
      type: p.type,
      major: p.major,
      minor: p.minor,
      confidence: auto ? Math.max(98, displayConfidence) : displayConfidence,
      source: 'PERSONAL_LEARNING_V2:' + p.level,
      risk: inferRisk_(p.type),
      reason: '사용자 학습 ' + p.totalCount + '회 / 일관성 ' + Math.round(p.confidence * 100) + '%' +
        (p.overrideCount > 0 ? ' / 과거 추천 수정 ' + p.overrideCount + '회 반영' : '') +
        (p.conflictCount > 0 ? ' / 사용자 판단 충돌 있어 자동확정 금지' : ''),
      level: p.level,
      _rank: rank[p.level] || 0,
      _n: p.totalCount
    };

    if (!best) { best = candidate; return; }
    if (candidate.status === 'AUTO' && best.status !== 'AUTO') { best = candidate; return; }
    if (candidate.status === best.status && candidate._rank > best._rank) { best = candidate; return; }
    if (candidate.status === best.status && candidate._rank === best._rank && candidate._n > best._n) best = candidate;
  });

  return best;
}

function ci2AsResult_(candidate, extraReason) {
  if (!candidate) return null;
  return result_({
    status: candidate.status,
    type: candidate.type,
    major: candidate.major,
    minor: candidate.minor,
    confidence: candidate.confidence,
    source: candidate.source,
    risk: candidate.risk,
    reason: candidate.reason + (extraReason ? ' / ' + extraReason : '')
  });
}

function ci2EvidenceClass_(type, major, minor) {
  return { type: type, major: major, minor: minor };
}

function ci2AdaptiveConflicts_(adaptive, type, major, minor) {
  if (!adaptive) return false;
  return !ci2SameClass_(adaptive, ci2EvidenceClass_(type, major, minor));
}

/**
 * CI2 classifier override.
 * Personal learning sits before generic inference as a guard:
 * - mature personal evidence can AUTO;
 * - one prior user correction can immediately veto a conflicting generic AUTO
 *   and turn the next similar transaction into a recommendation instead.
 */
function classifyBase_(tx, context) {
  if (tx.preStatus === 'DUPLICATE') {
    return result_({ status: 'DUPLICATE', confidence: 100, reason: tx.preReason });
  }

  if (tx.preStatus === 'EXCLUDED') {
    return result_({ status: 'EXCLUDED', confidence: 100, reason: tx.preReason });
  }

  var correction = context.corrections[tx.sourceKey];
  if (correction) {
    return result_({
      status: 'AUTO', type: correction.type, major: correction.major, minor: correction.minor,
      confidence: 100, source: 'EXACT_CORRECTION', risk: inferRisk_(correction.type),
      reason: '사용자 exact correction'
    });
  }

  if (tx.pairSourceKey) {
    var transferMinor = internalTransferMinor_(tx, context);
    if (tx.pairMirror) {
      return result_({
        status: 'EXCLUDED', type: '자산이동', major: '자산이동', minor: transferMinor,
        confidence: 100, source: 'INTERNAL_TRANSFER_MIRROR', risk: 'LOW', reason: '내부이체 반대편 미러행 / ' + transferMinor
      });
    }
    return result_({
      status: 'AUTO', type: '자산이동', major: '자산이동', minor: transferMinor,
      confidence: 100, source: 'INTERNAL_TRANSFER', risk: 'LOW', reason: '동일금액·반대부호·시간근접 내부이체 pair / ' + transferMinor
    });
  }

  var adaptive = adaptiveClassificationCI2_(tx, context.standard);
  if (adaptive && adaptive.status === 'AUTO') return ci2AsResult_(adaptive);

  var rule = matchRule_(tx, context.rules, context.standard);
  if (rule && classificationDirectionCompatible_(tx.signedAmount, rule.resultType, rule.resultMinor)) {
    if (adaptive && ci2AdaptiveConflicts_(adaptive, rule.resultType, rule.resultMajor, rule.resultMinor)) {
      return ci2AsResult_(adaptive, '기존 Rule Master와 충돌하여 자동확정 차단');
    }
    return result_({
      status: 'AUTO', type: rule.resultType, major: rule.resultMajor, minor: rule.resultMinor,
      confidence: rule.confidence, source: 'RULE_MASTER:' + rule.ruleId,
      risk: rule.risk, reason: rule.note || 'Rule Master'
    });
  }

  var profile = context.merchantProfiles[tx.merchantKey];
  if (
    profile && profile.autoEligible &&
    profile.observations >= context.cfg.merchantAutoMinCount &&
    profile.confidence >= context.cfg.merchantAutoConfidence &&
    !isAmbiguousMerchant_(tx.merchant) &&
    !isPerTransactionMerchant_(tx.merchant) &&
    classificationAvailable_(context.standard, profile.major, profile.minor) &&
    classificationDirectionCompatible_(tx.signedAmount, profile.type, profile.minor)
  ) {
    if (adaptive && ci2AdaptiveConflicts_(adaptive, profile.type, profile.major, profile.minor)) {
      return ci2AsResult_(adaptive, '최근 Merchant Profile과 충돌하여 자동확정 차단');
    }
    return result_({
      status: 'AUTO', type: profile.type, major: profile.major, minor: profile.minor,
      confidence: Math.round(profile.confidence * 100), source: 'MERCHANT_PROFILE_RECENT',
      risk: inferRisk_(profile.type),
      reason: '최근 원장 ' + profile.observations + '회 / 일관성 ' + Math.round(profile.confidence * 100) + '%'
    });
  }

  if (adaptive) return ci2AsResult_(adaptive);

  // User-specific KakaoPay policy. Outgoing transfers are usually the user's
  // own share of a meal/drinks paid by somebody else, so count as consumption,
  // not asset movement. Keep review because meal vs alcohol varies by event.
  var kakaoRepay = kakaoRepaymentRecommendation_(tx, context.standard);
  if (kakaoRepay) return kakaoRepay;

  var keyword = keywordClassification_(tx, context.standard);
  if (keyword && classificationDirectionCompatible_(tx.signedAmount, keyword.type, keyword.minor)) {
    return result_({
      status: keyword.confidence >= context.cfg.autoConfirmMinConfidence ? 'AUTO' : 'REVIEW',
      type: keyword.type, major: keyword.major, minor: keyword.minor,
      confidence: keyword.confidence, source: 'KEYWORD', risk: keyword.risk, reason: keyword.reason
    });
  }

  // Incoming from a person or via KakaoPay is overwhelmingly settlement recovery
  // for this user. applySettlementEngine_ will attempt expense netting/matching.
  if ((isPotentialPersonIncoming_(tx) || isKakaoSettlementIncoming_(tx)) && context.cfg.personSettlementDefault) {
    return result_({
      status: 'PERSON_INCOMING', confidence: isKakaoSettlementIncoming_(tx) ? 98 : 96,
      source: isKakaoSettlementIncoming_(tx) ? 'KAKAO_SETTLEMENT_CANDIDATE' : 'PERSON_CANDIDATE',
      risk: 'HIGH',
      reason: isKakaoSettlementIncoming_(tx)
        ? '카카오페이 수신 → 사용자 정책상 정산회수 후보'
        : '개인명 입금 → 사용자 정책상 기본 정산회수 후보'
    });
  }

  var raw = rawCategoryClassification_(tx, context.standard);
  var lifetime = isPerTransactionMerchant_(tx.merchant) ? null : lifetimeClassificationCI1_(tx, context.standard);

  if (
    raw && raw.confidence >= context.cfg.autoConfirmMinConfidence &&
    classificationDirectionCompatible_(tx.signedAmount, raw.type, raw.minor)
  ) {
    return result_({
      status: 'AUTO', type: raw.type, major: raw.major, minor: raw.minor,
      confidence: raw.confidence, source: 'RAW_MAP', risk: raw.risk, reason: raw.reason
    });
  }

  if (lifetime && lifetime.status === 'AUTO') return ci1ResultFromCandidate_(lifetime);

  var rawReview = null;
  if (raw && classificationDirectionCompatible_(tx.signedAmount, raw.type, raw.minor)) {
    rawReview = {
      status: 'REVIEW', type: raw.type, major: raw.major, minor: raw.minor,
      confidence: raw.confidence, source: 'RAW_MAP', risk: raw.risk, reason: raw.reason
    };
  }

  if (lifetime && (!rawReview || lifetime.confidence > rawReview.confidence)) {
    return ci1ResultFromCandidate_(lifetime);
  }
  if (rawReview) return ci1ResultFromCandidate_(rawReview);

  if (tx.signedAmount > 0) {
    return result_({
      status: 'REVIEW', type: '', major: '', minor: '', confidence: 0,
      source: 'UNKNOWN_INFLOW', risk: 'HIGH',
      reason: '미분류 입금: 소득/정산/자산이동 여부 사용자 확인 필요'
    });
  }

  return result_({
    status: 'REVIEW', type: '소비지출', major: '', minor: '', confidence: 0,
    source: isPerTransactionMerchant_(tx.merchant) ? 'PER_TRANSACTION_MERCHANT' : 'UNKNOWN_OUTFLOW_CI2',
    risk: 'LOW',
    reason: isPerTransactionMerchant_(tx.merchant)
      ? '사용자 정책: 쿠팡·쿠페이는 구매 품목이 매번 달라 건별 분류 필요'
      : '자동분류 근거 부족: 사용자학습·12년원장·최근원장·원본분류 모두 확정 근거 없음'
  });
}

/**
 * Override review resolution so every user classification updates:
 * 1) exact correction (existing behavior),
 * 2) CI2 hierarchical adaptive profiles ALWAYS (one-shot recommendation memory),
 * 3) legacy exact-pattern auto-promotion only when learnPattern is enabled.
 *
 * This means the user does NOT need to check a box for the system to remember
 * a manual classification. The checkbox only controls the older aggressive
 * exact-pattern Rule Master promotion path. CI2 itself stays evidence-based
 * and requires repeated consistency before AUTO.
 */
/* [v1.4.3 CLEAN] superseded duplicate function removed: resolveClassificationReview_ */

/**
 * Optional one-time setup/check function. It is safe to run manually from the
 * Apps Script editor after deployment, but normal analyze/review calls also
 * self-create the CI2 learning sheet if it is missing.
 */
function setupAdaptiveLearningCI2_() {
  var sheet = ensureCI2LearningSheet_();
  return {
    ok: true,
    version: CI2_PATCH_VERSION,
    sheet: CI2_LEARNING_SHEET,
    rows: Math.max(0, sheet.getLastRow() - 1),
    note: '12Y ledger is not rescanned per upload; CI2 learns incrementally from user confirmations.'
  };
}

/**********************************************************************
 * FINANCE OS · BANKSALAD SERVER BRAIN
 * v1.4.0 INTEGRATION HARDENING
 * --------------------------------------------------------------------
 * This final block intentionally overrides selected earlier functions.
 * The file is a COMPLETE replacement source: paste the whole file into
 * Code.gs. Do not append this file to another Server Brain source.
 *
 * Integrated layers:
 * - Base Server Brain
 * - RR1 review reliability / conservation
 * - CI1 12-year compact intelligence
 * - CI2 adaptive personal learning
 * - v1.4 integration guards
 **********************************************************************/

/* v1.4.0 integration marker consolidated in v1.4.3 CLEAN */

// Seed optional intelligence knobs into SB_System_Config without requiring
// them to exist beforehand. DEFAULT_CONFIG is a mutable object even though
// the binding itself is const.
DEFAULT_CONFIG.LIFETIME_AUTO_MIN_COUNT = DEFAULT_CONFIG.LIFETIME_AUTO_MIN_COUNT || '5';
DEFAULT_CONFIG.LIFETIME_AUTO_CONFIDENCE = DEFAULT_CONFIG.LIFETIME_AUTO_CONFIDENCE || '0.98';
DEFAULT_CONFIG.LIFETIME_SUGGEST_MIN_COUNT = DEFAULT_CONFIG.LIFETIME_SUGGEST_MIN_COUNT || '3';
DEFAULT_CONFIG.LIFETIME_SUGGEST_CONFIDENCE = DEFAULT_CONFIG.LIFETIME_SUGGEST_CONFIDENCE || '0.90';
DEFAULT_CONFIG.AMBIGUOUS_MERCHANT_AUTO = DEFAULT_CONFIG.AMBIGUOUS_MERCHANT_AUTO || 'FALSE';
DEFAULT_CONFIG.CI2_SUGGEST_AFTER_ONE = DEFAULT_CONFIG.CI2_SUGGEST_AFTER_ONE || 'TRUE';
DEFAULT_CONFIG.CI2_CONTEXT_AUTO_MIN_COUNT = DEFAULT_CONFIG.CI2_CONTEXT_AUTO_MIN_COUNT || '3';
DEFAULT_CONFIG.CI2_MERCHANT_AUTO_MIN_COUNT = DEFAULT_CONFIG.CI2_MERCHANT_AUTO_MIN_COUNT || '4';
DEFAULT_CONFIG.CI2_EXACT_AUTO_MIN_COUNT = DEFAULT_CONFIG.CI2_EXACT_AUTO_MIN_COUNT || '3';
DEFAULT_CONFIG.CI2_HIGH_RISK_AUTO_MIN_COUNT = DEFAULT_CONFIG.CI2_HIGH_RISK_AUTO_MIN_COUNT || '4';
DEFAULT_CONFIG.CI2_AUTO_MIN_CONSISTENCY = DEFAULT_CONFIG.CI2_AUTO_MIN_CONSISTENCY || '0.98';
DEFAULT_CONFIG.CI2_AMBIGUOUS_EXACT_AUTO = DEFAULT_CONFIG.CI2_AMBIGUOUS_EXACT_AUTO || 'TRUE';
DEFAULT_CONFIG.CI2_AMBIGUOUS_CONTEXT_AUTO = DEFAULT_CONFIG.CI2_AMBIGUOUS_CONTEXT_AUTO || 'FALSE';
DEFAULT_CONFIG.CI2_AMBIGUOUS_MERCHANT_AUTO = DEFAULT_CONFIG.CI2_AMBIGUOUS_MERCHANT_AUTO || 'FALSE';

function configDescription_(key) {
  var map = {
    ONE_WON_EXCLUDE: '금액 정확히 1원인 본인인증 거래 자동 제외',
    PERSON_SETTLEMENT_DEFAULT: '개인명 입금 기본 일반 정산회수 처리',
    SETTLEMENT_WINDOW_DAYS: '정산회수와 원지출 연결 탐색 일수',
    SETTLEMENT_AUTO_SCORE: '정산 원지출 자동연결 최소 점수',
    SETTLEMENT_REVIEW_SCORE: '정산 원지출 연결 검토후보 최소 점수',
    INTERNAL_TRANSFER_SECONDS: '동일일자 내부이체 pair 허용 초 차이',
    AUTO_CONFIRM_MIN_CONFIDENCE: '일반 자동분류 최소 신뢰도(%)',
    MERCHANT_AUTO_MIN_COUNT: '최근 Merchant Profile 자동확정 최소 표본',
    MERCHANT_AUTO_CONFIDENCE: '최근 Merchant Profile 자동확정 최소 일관성(0~1)',
    MERCHANT_LOOKBACK_DAYS: '최근 Merchant Profile 학습 기간(일)',
    LEARN_PROMOTE_COUNT: '기존 exact 패턴 Rule 자동승격 횟수',
    LOW_RISK_COMMIT_ALLOWED: 'LOW RISK 검토가 남아도 확정 거래 먼저 반영 허용',
    INTRA_RUN_DEDUP: '동일 업로드 payload 내부 중복 sourceKey 자동 제외',
    REVIEW_SUPERSEDE: '새 분석에서 동일 Source_Key의 과거 PENDING 검토를 SUPERSEDED 처리',
    LIFETIME_AUTO_MIN_COUNT: '12년 이력 SAFE_AUTO 최소 표본',
    LIFETIME_AUTO_CONFIDENCE: '12년 이력 SAFE_AUTO 최소 일관성',
    LIFETIME_SUGGEST_MIN_COUNT: '12년 이력 추천 최소 표본',
    LIFETIME_SUGGEST_CONFIDENCE: '12년 이력 추천 최소 일관성',
    AMBIGUOUS_MERCHANT_AUTO: '범용 결제/쇼핑 merchant의 12년 merchant-only 자동확정 허용',
    CI2_SUGGEST_AFTER_ONE: '사용자 1회 수동확정 후 다음 유사거래 즉시 추천',
    CI2_CONTEXT_AUTO_MIN_COUNT: 'CI2 CONTEXT 자동확정 최소 반복수',
    CI2_MERCHANT_AUTO_MIN_COUNT: 'CI2 MERCHANT 자동확정 최소 반복수',
    CI2_EXACT_AUTO_MIN_COUNT: 'CI2 EXACT 자동확정 최소 반복수',
    CI2_HIGH_RISK_AUTO_MIN_COUNT: 'CI2 고위험 유형 자동확정 최소 반복수',
    CI2_AUTO_MIN_CONSISTENCY: 'CI2 자동확정 최소 사용자 판단 일관성',
    CI2_AMBIGUOUS_EXACT_AUTO: '모호 merchant의 EXACT CI2 자동확정 허용',
    CI2_AMBIGUOUS_CONTEXT_AUTO: '모호 merchant의 CONTEXT CI2 자동확정 허용',
    CI2_AMBIGUOUS_MERCHANT_AUTO: '모호 merchant의 MERCHANT CI2 자동확정 허용'
  };
  return map[key] || '';
}

// v1.3 introduced intra-run dedup/review supersede switches but its original
// loadConfig_ did not expose them. This override makes those switches active.
function loadConfig_() {
  var sheet = financeSpreadsheet_().getSheetByName(SHEETS.CONFIG);
  var cfg = Object.assign({}, DEFAULT_CONFIG);

  tableObjects_(sheet).forEach(function (r) {
    var key = text_(r.Key);
    if (key) cfg[key] = text_(r.Value);
  });

  return {
    oneWonExclude: bool_(cfg.ONE_WON_EXCLUDE),
    personSettlementDefault: bool_(cfg.PERSON_SETTLEMENT_DEFAULT),
    settlementWindowDays: number_(cfg.SETTLEMENT_WINDOW_DAYS, 7),
    settlementAutoScore: number_(cfg.SETTLEMENT_AUTO_SCORE, 95),
    settlementReviewScore: number_(cfg.SETTLEMENT_REVIEW_SCORE, 75),
    internalTransferSeconds: number_(cfg.INTERNAL_TRANSFER_SECONDS, 2),
    autoConfirmMinConfidence: number_(cfg.AUTO_CONFIRM_MIN_CONFIDENCE, 95),
    merchantAutoMinCount: number_(cfg.MERCHANT_AUTO_MIN_COUNT, 3),
    merchantAutoConfidence: number_(cfg.MERCHANT_AUTO_CONFIDENCE, 0.98),
    merchantLookbackDays: number_(cfg.MERCHANT_LOOKBACK_DAYS, 730),
    learnPromoteCount: number_(cfg.LEARN_PROMOTE_COUNT, 3),
    lowRiskCommitAllowed: bool_(cfg.LOW_RISK_COMMIT_ALLOWED),
    intraRunDedup: cfg.INTRA_RUN_DEDUP === undefined ? true : bool_(cfg.INTRA_RUN_DEDUP),
    reviewSupersede: cfg.REVIEW_SUPERSEDE === undefined ? true : bool_(cfg.REVIEW_SUPERSEDE)
  };
}

function isGenericFallbackClassification_(x) {
  if (!x) return false;
  var major = text_(x.major || x.recommendedMajor);
  var minor = text_(x.minor || x.recommendedMinor);
  return major === '기타 생활비' && /검증 필요/.test(minor);
}

function hasCompleteClassification_(x) {
  if (!x || isGenericFallbackClassification_(x)) return false;
  var type = text_(x.type || x.recommendedType);
  var major = text_(x.major || x.recommendedMajor);
  var minor = text_(x.minor || x.recommendedMinor);
  return !!(type && major && minor);
}

function loadConfirmedLedgerHistoryTail_(maxRows) {
  const sheet = financeSpreadsheet_().getSheetByName(SHEETS.LEDGER);
  if (!sheet) return [];

  const lastRow = canonicalLedgerLastDataRow_(sheet);
  if (lastRow < 2) return [];

  const headers = sheetHeaders_(sheet);
  const count = Math.min(Math.max(1, number_(maxRows, 5000)), lastRow - 1);
  const startRow = lastRow - count + 1;
  const values = sheet.getRange(startRow, 1, count, headers.length).getValues();

  return values.map(function (row) {
    const o = {};
    headers.forEach(function (h, i) { if (h) o[h] = row[i]; });
    return o;
  }).filter(function (r) {
    return text_(r['검토상태']) === '확정' &&
      text_(r['거래명']) &&
      text_(r['대분류']) &&
      text_(r['소분류']);
  });
}

function historicalReviewSuggestions_(tx, context, limit) {
  if (!tx || !tx.merchant || !tx.date) return [];

  // Cache once per analysis execution. 5k tail rows is intentionally bounded.
  if (!context.__reviewHistoryTail) {
    context.__reviewHistoryTail = loadConfirmedLedgerHistoryTail_(5000);
  }

  const merchantKey = normalizeMerchant_(tx.merchant);
  const paymentKey = normalizeAccountName_(tx.payment || tx.account);
  const amount = Math.abs(number_(tx.signedAmount, 0));
  const perTransaction = isPerTransactionMerchant_(tx.merchant);

  const scored = [];
  context.__reviewHistoryTail.forEach(function (r) {
    const histMerchant = text_(r['거래명']);
    if (!histMerchant || normalizeMerchant_(histMerchant) !== merchantKey) return;

    const type = text_(r['재무거래유형']);
    const major = text_(r['대분류']);
    const minor = text_(r['소분류']);
    if (!type || !major || !minor) return;
    if (!classificationDirectionCompatible_(tx.signedAmount, type, minor)) return;

    let score = 50; // exact normalized merchant
    const histPayment = normalizeAccountName_(r['표준계정명']);
    if (paymentKey && histPayment && paymentKey === histPayment) score += 15;

    const histAmount = Math.abs(number_(r['금액'], 0));
    if (amount > 0 && histAmount > 0) {
      const diffRatio = Math.abs(histAmount - amount) / Math.max(histAmount, amount);
      if (diffRatio <= 0.001) score += 20;
      else if (diffRatio <= 0.05) score += 15;
      else if (diffRatio <= 0.20) score += 8;
    }

    const days = Math.abs(dateDiffDays_(dateKey_(r['거래일']), tx.date));
    if (days <= 7) score += 15;
    else if (days <= 30) score += 12;
    else if (days <= 90) score += 8;
    else if (days <= 365) score += 4;

    // Coupang/Coupay remains review-only: historical rows help preselect, never learn/auto.
    if (perTransaction) score = Math.min(score, 88);

    scored.push({
      sourceKey: text_(r['중복키']),
      date: dateKey_(r['거래일']),
      merchant: histMerchant,
      amount: histAmount,
      payment: text_(r['표준계정명']),
      type: type,
      major: major,
      minor: minor,
      score: Math.max(0, Math.min(99, Math.round(score)))
    });
  });

  scored.sort(function (a, b) {
    if (b.score !== a.score) return b.score - a.score;
    return String(b.date).localeCompare(String(a.date));
  });

  return scored.slice(0, Math.max(1, number_(limit, 3)));
}

function classificationOptions_(result, tx, historySuggestions) {
  var complete = hasCompleteClassification_(result);
  var suggestions = [];
  var perTransaction = !!(tx && isPerTransactionMerchant_(tx.merchant));

  if (complete) {
    suggestions.push({
      type: text_(result.type),
      major: text_(result.major),
      minor: text_(result.minor),
      confidence: number_(result.confidence, 0)
    });
  }

  return {
    mode: 'CLASSIFICATION',
    suggestions: suggestions,
    actions: complete
      ? [{ id: 'confirm', label: '추천 분류 확정' }, { id: 'change', label: '다른 분류 선택' }]
      : [{ id: 'change', label: '분류 선택' }],
    recommendationComplete: complete,
    requiresSelection: !complete,
    allowLearnPattern: complete && !perTransaction,
    learnPatternDefault: complete && !perTransaction && number_(result && result.confidence, 0) >= 90,
    perTransaction: perTransaction,
    historySuggestions: Array.isArray(historySuggestions) ? historySuggestions : []
  };
}

function reviewForClient_(r) {
  var complete = hasCompleteClassification_({
    recommendedType: r.recommendedType,
    recommendedMajor: r.recommendedMajor,
    recommendedMinor: r.recommendedMinor
  });

  return {
    reviewId: r.reviewId,
    reviewType: r.reviewType,
    risk: r.risk,
    date: r.date,
    merchant: r.merchant,
    amount: r.amount,
    reason: r.reason,
    recommendation: {
      type: complete ? r.recommendedType : '',
      major: complete ? r.recommendedMajor : '',
      minor: complete ? r.recommendedMinor : '',
      confidence: complete ? r.confidence : 0,
      complete: complete
    },
    recommendationComplete: complete,
    requiresSelection: r.reviewType === 'CLASSIFICATION' && !complete,
    matchedSourceKey: r.matchedSourceKey,
    options: r.options
  };
}

// Final integrated review handler: RR1 fallback + CI2 always-learn + generic
// placeholder guard. One manual decision immediately influences the next
// similar transaction, while legacy Rule Master promotion stays checkbox-based.
function resolveClassificationReview_(review, body) {
  var major = text_(body.major || body.resultMajor);
  var minor = text_(body.minor || body.resultMinor);
  var type = text_(body.type || body.resultType);

  if (!major && !minor && !type && hasCompleteClassification_({
    recommendedType: review.recommendedType,
    recommendedMajor: review.recommendedMajor,
    recommendedMinor: review.recommendedMinor
  })) {
    type = text_(review.recommendedType);
    major = text_(review.recommendedMajor);
    minor = text_(review.recommendedMinor);
  }

  if (!major || !minor) throw new Error('SELECTION_REQUIRED: major / minor are required');
  if (major === '기타 생활비' && /검증 필요/.test(minor)) {
    throw new Error('SELECTION_REQUIRED: placeholder category cannot be finalized');
  }

  validateStandardCategory_(major, minor);
  if (!type) type = inferTypeFromCategory_(major, minor);
  if (!type) throw new Error('SELECTION_REQUIRED: type is required or could not be inferred');

  var staging = findStaging_(review.analysisId, review.sourceKey);
  if (!staging) throw new Error('Staging transaction not found');

  var raw = JSON.parse(staging.rawJson);
  var tx = normalizeRawTransaction_(raw, 0);
  var classification = {
    status: 'CONFIRMED',
    type: type,
    major: major,
    minor: minor,
    confidence: 100,
    source: 'USER_REVIEW',
    risk: inferRisk_(type),
    reason: '사용자 검토 확정'
  };

  var ledger = buildLedgerRow_(tx, classification);
  var recovered = committedRecoveryForExpense_(review.sourceKey);
  if (recovered > 0) ledger = applyNettingToLedgerObject_(ledger, recovered);

  updateStaging_(review.analysisId, review.sourceKey, {
    status: 'CONFIRMED',
    risk: classification.risk,
    confidence: 100,
    classificationSource: 'USER_REVIEW',
    ledgerJson: JSON.stringify(ledger),
    updatedAt: now_()
  });

  var learnPattern = body.learnPattern === undefined ? true : bool_(body.learnPattern);

  // Same source transaction is always safe to remember (retry/idempotency).
  saveExactCorrection_(tx, classification, learnPattern);

  // CI2 deliberately ignores Coupang/Coupay per user policy; other merchants
  // keep hierarchical one-shot recommendation learning.
  recordAdaptiveLearningCI2_(tx, classification, review);

  // Legacy Rule Master promotion is too aggressive for generic platforms.
  // CI2 already provides guarded learning for those, so only promote stable,
  // semantically meaningful merchants here.
  if (learnPattern && !isAmbiguousMerchant_(tx.merchant) && !isPerTransactionMerchant_(tx.merchant)) {
    recordLearningCandidate_(tx, classification);
  }

  resolveReviewRow_(review.reviewId, {
    userType: type,
    userMajor: major,
    userMinor: minor,
    learnPattern: learnPattern && !isPerTransactionMerchant_(tx.merchant)
  });
}

/* [v1.4.3 CLEAN] superseded duplicate function removed: setupFinanceOsServerBrain */

function healthResponse_() {
  return {
    ok: true,
    message: 'Finance OS Server Brain ready',
    backendVersion: BACKEND_VERSION,
    policyVersion: POLICY_VERSION,
    protocolVersion: PROTOCOL_VERSION,
    minimumProtocolVersion: 1,
    serverDrivenUI: true,
    integrationVersion: SERVER_BRAIN_INTEGRATION_VERSION,
    features: {
      rawTransactionAnalysis: true,
      oneWonExclusion: true,
      internalTransferPairing: true,
      merchantLearning: true,
      personLearning: true,
      settlementRecovery: true,
      settlementMatching: true,
      settlementNetting: true,
      riskBasedReview: true,
      serverDrivenReviewUI: true,
      autoLearning: true,
      legacyImport: true,
      intraRunDeduplication: true,
      reviewSupersede: true,
      reviewReliabilityRR1: true,
      lifetimeIntelligence12Y: true,
      adaptivePersonalLearningCI2: true,
      oneShotPersonalRecommendation: true,
      accountAwareInternalTransfer: true,
      fastSettlementPostCommitNetting: true,
      genericFallbackLearningGuard: true,
      touchMinimizedClassification: true,
      kakaoOutgoingRepaymentPolicy: true,
      kakaoIncomingSettlementNetting: true,
      coupangPerTransactionPolicy: true,
      fastReviewSupersede: true,
      boundedSettlementLedgerScan: true
    }
  };
}

// Public editor-run diagnostics. These do not modify canonical ledger rows.
/* [v1.4.3 CLEAN] superseded duplicate function removed: TEST_CI2_SETUP */

/* [v1.4.3 CLEAN] superseded duplicate function removed: TEST_SERVER_BRAIN_SETUP */

/**********************************************************************
 * FINANCE OS · BANKSALAD SERVER BRAIN
 * v1.4.1 FAST PROFILE REBUILD OVERRIDE
 *
 * Why:
 * - v1.4.0 bootstrapMerchantProfiles_/bootstrapPersonProfiles_ used
 *   upsertObjectByKey_ per profile row.
 * - upsertObjectByKey_ re-reads the whole profile sheet on every call,
 *   causing O(N^2)-like Sheets I/O and Apps Script timeouts.
 *
 * Fix:
 * - Read the canonical ledger ONCE.
 * - Build Merchant + Person profiles in memory.
 * - Replace only the derived SB_Merchant_Profile / SB_Person_Profile rows
 *   with one bulk write each.
 * - Cache one rebuild per execution.
 * - Normal commits skip a full rebuild if one completed within 6 hours.
 **********************************************************************/

var SERVER_BRAIN_INTEGRATION_VERSION = 'COMPLETE-1.5.1-UX-SETTLEMENT-ACCOUNT-AWARE';
var __FAST_PROFILE_REBUILT = false;
var FAST_PROFILE_REBUILD_MIN_INTERVAL_MS = 6 * 60 * 60 * 1000;

/* [v1.4.3 CLEAN] superseded duplicate function removed: bootstrapMerchantProfiles_ */

/* [v1.4.3 CLEAN] superseded duplicate function removed: bootstrapPersonProfiles_ */

function rebuildDerivedProfilesFast_(force) {
  if (__FAST_PROFILE_REBUILT) {
    return { ok: true, skipped: true, reason: 'already rebuilt in this execution' };
  }

  var props = PropertiesService.getScriptProperties();
  var last = Number(props.getProperty('FAST_PROFILE_REBUILT_AT_MS') || 0);
  if (!force && last > 0 && (Date.now() - last) < FAST_PROFILE_REBUILD_MIN_INTERVAL_MS) {
    __FAST_PROFILE_REBUILT = true;
    return { ok: true, skipped: true, reason: 'recent rebuild cache' };
  }

  var started = Date.now();
  var ss = financeSpreadsheet_();
  var ledger = ss.getSheetByName(SHEETS.LEDGER);
  if (!ledger || ledger.getLastRow() < 2) {
    __FAST_PROFILE_REBUILT = true;
    return { ok: true, merchantProfiles: 0, personProfiles: 0, elapsedMs: Date.now() - started };
  }

  var cfg = loadConfig_();
  var cutoff = addDays_(today_(), -cfg.merchantLookbackDays);
  var values = ledger.getDataRange().getValues();
  var headers = values[0].map(function (v) { return String(v || '').trim(); });
  var col = {};
  headers.forEach(function (h, i) { if (h) col[h] = i; });

  function cell(row, name) {
    var i = col[name];
    return i === undefined ? '' : row[i];
  }

  var merchantGroups = {};
  var personGroups = {};

  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var merchant = text_(cell(row, '거래명'));
    var date = dateKey_(cell(row, '거래일'));
    var type = text_(cell(row, '재무거래유형'));
    var major = text_(cell(row, '대분류'));
    var minor = text_(cell(row, '소분류'));
    var reviewStatus = text_(cell(row, '검토상태'));

    // Recent merchant profile: same policy as the original engine.
    if (
      date && date >= cutoff &&
      (!reviewStatus || reviewStatus === '확정') &&
      type === '소비지출' &&
      major && minor && minor !== '사용처 검증 필요' &&
      merchant && !isAmbiguousMerchant_(merchant)
    ) {
      var merchantKey = normalizeMerchant_(merchant);
      if (merchantKey) {
        var mg = merchantGroups[merchantKey];
        if (!mg) {
          mg = merchantGroups[merchantKey] = {
            display: merchant,
            counts: {},
            total: 0,
            first: date,
            last: date
          };
        }
        var classKey = [type, major, minor].join('|');
        mg.counts[classKey] = (mg.counts[classKey] || 0) + 1;
        mg.total++;
        if (date < mg.first) mg.first = date;
        if (date > mg.last) mg.last = date;
      }
    }

    // Person profile: whole available ledger, same policy as original engine.
    if (merchant && isPersonLike_(merchant)) {
      var personKey = normalizePerson_(merchant);
      if (personKey) {
        var pg = personGroups[personKey];
        if (!pg) {
          pg = personGroups[personKey] = {
            display: merchant,
            settlement: 0,
            other: 0,
            first: '',
            last: ''
          };
        }
        var isSettlement = type === '정산' && minor === '일반 정산회수';
        if (isSettlement) pg.settlement++;
        else pg.other++;
        if (date && (!pg.first || date < pg.first)) pg.first = date;
        if (date && (!pg.last || date > pg.last)) pg.last = date;
      }
    }
  }

  var now = now_();
  var merchantObjects = [];
  Object.keys(merchantGroups).forEach(function (key) {
    var g = merchantGroups[key];
    var entries = Object.keys(g.counts)
      .map(function (k) { return { key: k, count: g.counts[k] }; })
      .sort(function (a, b) { return b.count - a.count; });
    if (!entries.length) return;

    var dominant = entries[0];
    var parts = dominant.key.split('|');
    var confidence = g.total ? dominant.count / g.total : 0;
    var conflicts = g.total - dominant.count;
    var eligible = g.total >= cfg.merchantAutoMinCount && confidence >= cfg.merchantAutoConfidence;

    merchantObjects.push({
      Merchant_Key: key,
      Merchant_Display: g.display,
      Observations: g.total,
      Dominant_Type: parts[0],
      Dominant_Major: parts[1],
      Dominant_Minor: parts[2],
      Dominant_Count: dominant.count,
      Conflict_Count: conflicts,
      Confidence: confidence,
      Counts_JSON: JSON.stringify(g.counts),
      Auto_Eligible: eligible ? 'TRUE' : 'FALSE',
      First_Seen: g.first,
      Last_Seen: g.last,
      Updated_At: now
    });
  });

  var personObjects = [];
  Object.keys(personGroups).forEach(function (key) {
    var x = personGroups[key];
    var total = x.settlement + x.other;
    personObjects.push({
      Person_Key: key,
      Display_Name: x.display,
      Settlement_Count: x.settlement,
      Other_Count: x.other,
      Confidence: total ? x.settlement / total : 0,
      First_Seen: x.first,
      Last_Seen: x.last,
      Updated_At: now
    });
  });

  replaceDerivedProfileRowsFast_(ss.getSheetByName(SHEETS.MERCHANT), merchantObjects);
  replaceDerivedProfileRowsFast_(ss.getSheetByName(SHEETS.PERSON), personObjects);

  props.setProperty('FAST_PROFILE_REBUILT_AT_MS', String(Date.now()));
  __FAST_PROFILE_REBUILT = true;

  return {
    ok: true,
    merchantProfiles: merchantObjects.length,
    personProfiles: personObjects.length,
    ledgerRowsRead: values.length - 1,
    elapsedMs: Date.now() - started
  };
}

function replaceDerivedProfileRowsFast_(sheet, objects) {
  if (!sheet) throw new Error('Derived profile sheet is missing');
  var headers = sheetHeaders_(sheet);
  if (!headers.length) throw new Error('Derived profile sheet has no headers: ' + sheet.getName());

  var neededRows = Math.max(2, objects.length + 1);
  if (sheet.getMaxRows() < neededRows) {
    sheet.insertRowsAfter(sheet.getMaxRows(), neededRows - sheet.getMaxRows());
  }

  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, headers.length).clearContent();
  }

  if (!objects.length) return;

  var matrix = objects.map(function (object) {
    return headers.map(function (header) {
      if (!header) return '';
      return Object.prototype.hasOwnProperty.call(object, header)
        ? normalizeSheetValue_(object[header])
        : '';
    });
  });

  sheet.getRange(2, 1, matrix.length, headers.length).setValues(matrix);
}

// Fast full setup for manual execution. It still rebuilds profiles once,
// but does so with a single ledger read + two bulk writes rather than
// thousands of per-row upserts.
/* [v1.4.3 CLEAN] superseded duplicate function removed: setupFinanceOsServerBrain */

/* [v1.4.3 CLEAN] superseded duplicate function removed: TEST_SERVER_BRAIN_SETUP */

function TEST_PROFILE_REBUILD_FAST() {
  ensureServerBrain_();
  return rebuildDerivedProfilesFast_(true);
}

/**********************************************************************
 * v1.4.2 QUICKBOOT OVERRIDE
 * --------------------------------------------------------------------
 * Reason:
 * - Manual setup must never scan/rebuild the full 20k+ ledger.
 * - CI1 already uses precomputed 12Y tables.
 * - CI2 learns immediately from each user confirmation.
 * - Recent Merchant/Person profile full rebuild is deferred so web-app
 *   requests cannot time out after commit.
 **********************************************************************/

/* integration version already defined above for v1.5.1 */

var PROFILE_REFRESH_DIRTY_PROP = 'PROFILE_REFRESH_DIRTY_V142';
var PROFILE_BASELINE_ROW_PROP = 'PROFILE_BASELINE_LEDGER_ROW_V142';
var __PROFILE_REFRESH_MARKED_V142 = false;

function initializeProfileBaselineV142_() {
  var ss = financeSpreadsheet_();
  var ledger = ss.getSheetByName(SHEETS.LEDGER);
  if (!ledger) throw new Error('Ledger sheet is missing: ' + SHEETS.LEDGER);

  var props = PropertiesService.getScriptProperties();
  var currentLastRow = Math.max(1, ledger.getLastRow());
  if (!props.getProperty(PROFILE_BASELINE_ROW_PROP)) {
    props.setProperty(PROFILE_BASELINE_ROW_PROP, String(currentLastRow));
  }
  return {
    ok: true,
    baselineRow: Number(props.getProperty(PROFILE_BASELINE_ROW_PROP) || currentLastRow),
    currentLastRow: currentLastRow
  };
}

function deferDerivedProfileRefreshV142_() {
  if (__PROFILE_REFRESH_MARKED_V142) {
    return { ok: true, deferred: true, alreadyMarkedThisExecution: true };
  }

  var props = PropertiesService.getScriptProperties();
  var ss = financeSpreadsheet_();
  var ledger = ss.getSheetByName(SHEETS.LEDGER);
  var lastRow = ledger ? Math.max(1, ledger.getLastRow()) : 1;

  props.setProperty(PROFILE_REFRESH_DIRTY_PROP, 'TRUE');
  props.setProperty('PROFILE_REFRESH_DIRTY_AT_V142', String(Date.now()));
  props.setProperty('PROFILE_REFRESH_LEDGER_LAST_ROW_V142', String(lastRow));
  __PROFILE_REFRESH_MARKED_V142 = true;

  return {
    ok: true,
    deferred: true,
    reason: 'Full Merchant/Person profile rebuild deferred to maintenance; CI2 remains immediate.',
    ledgerLastRow: lastRow
  };
}

// IMPORTANT: commit/import paths in the legacy brain call these functions.
// v1.4.2 deliberately makes them O(1) so normal app requests cannot trigger
// a full-ledger scan. Personal learning continues through CI2 immediately.
function bootstrapMerchantProfiles_() {
  return deferDerivedProfileRefreshV142_();
}

function bootstrapPersonProfiles_() {
  return deferDerivedProfileRefreshV142_();
}

// QUICK manual setup: structure/config only. No 12Y/20k ledger scan.
function setupFinanceOsServerBrain() {
  var started = Date.now();
  ensureServerBrain_();
  ensureCI2LearningSheet_();
  seedConfig_();
  var baseline = initializeProfileBaselineV142_();

  return {
    ok: true,
    backendVersion: BACKEND_VERSION,
    policyVersion: POLICY_VERSION,
    protocolVersion: PROTOCOL_VERSION,
    integrationVersion: SERVER_BRAIN_INTEGRATION_VERSION,
    ci1: true,
    ci2: true,
    profileMode: 'DEFERRED_MAINTENANCE',
    baseline: baseline,
    elapsedMs: Date.now() - started,
    message: 'Finance OS Server Brain v1.5.1 TOUCH-MINIMIZED UX/SETTLEMENT setup complete. No full-ledger profile rebuild was executed.'
  };
}

function TEST_SERVER_BRAIN_SETUP() {
  return setupFinanceOsServerBrain();
}

function TEST_CI2_SETUP() {
  ensureCI2LearningSheet_();
  return {
    ok: true,
    integrationVersion: SERVER_BRAIN_INTEGRATION_VERSION,
    adaptiveSheet: CI2_LEARNING_SHEET
  };
}

function TEST_SERVER_BRAIN_HEALTH() {
  var h = healthResponse_();
  h.integrationVersion = SERVER_BRAIN_INTEGRATION_VERSION;
  h.profileMode = 'DEFERRED_MAINTENANCE';
  return h;
}
