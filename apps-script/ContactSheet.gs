/**
 * ============================================================
 *  ContactSheet.gs — Derived "Ke kontaktování" with write-back
 *  Load order: 4/6 (depends on Config.gs + Helpers.gs)
 *
 *  Premium sales-ready working sheet derived from source CRM.
 *  Source sheet remains the single source of truth.
 *
 *  EDITABLE COLUMNS (write-back to source):
 *    Stav ✎              → outreach_stage
 *    Další krok ✎        → next_action
 *    Poslední kontakt ✎  → last_contact_at
 *    Follow-up ✎         → next_followup_at
 *    Poznámka ✎          → sales_note
 *    Rozhodnutí ✎ (B-06) → review_decision + preview_stage + reviewed_at + reviewed_by
 *    Důvod revize ✎      → review_note
 *
 *  Layout (post B-06):
 *    Rows 1-4:    KPI dashboard
 *    Row  5:      Table header (frozen)
 *    Row  6+:     Data
 *    Cols 1-6:    Read-only info
 *    Cols 7-11:   Editable workflow (outreach write-back)
 *    Cols 12-13:  Editable review (B-06 review write-back)
 *    Cols 14-21:  Hidden detail group (Lead ID at col 21)
 * ============================================================
 */

var DASHBOARD_ROWS_    = 4;
var TABLE_HEADER_ROW_  = 5;
var TABLE_DATA_START_  = 6;

/* ── Editable column positions (1-based) and source field mapping ── */
var FIRST_EDITABLE_COL_ = 7;
var LAST_EDITABLE_COL_  = 13;  // B-06: extended from 11 (outreach) to 13 (incl review cols)
var REVIEW_DECISION_COL_ = 12;
var REVIEW_NOTE_COL_     = 13;
var CRM_ROW_COL_        = 21;  // B-06: shifted from 19 (+2 for review cols)

var WRITEBACK_MAP_ = {};
WRITEBACK_MAP_[7]  = { field: 'outreach_stage',   reverseHumanize: true,  kind: 'plain' };
WRITEBACK_MAP_[8]  = { field: 'next_action',      reverseHumanize: false, kind: 'plain' };
WRITEBACK_MAP_[9]  = { field: 'last_contact_at',  reverseHumanize: false, kind: 'plain' };
WRITEBACK_MAP_[10] = { field: 'next_followup_at', reverseHumanize: false, kind: 'plain' };
WRITEBACK_MAP_[11] = { field: 'sales_note',       reverseHumanize: false, kind: 'plain' };
// B-06 review cells — 'review' kind triggers atomic multi-cell handler.
WRITEBACK_MAP_[12] = { field: 'review_decision',  reverseHumanize: false, kind: 'review_decision' };
WRITEBACK_MAP_[13] = { field: 'review_note',      reverseHumanize: false, kind: 'review_note' };

/* ── Human-friendly status values ── */
var HUMAN_STAV_VALUES_ = [
  'Neosloveno', 'P\u0159ipraveno', 'Osloveno',
  'Reagoval', 'Z\u00e1jem', 'Nez\u00e1jem'
];

var NEXT_ACTION_VALUES_ = [
  'Oslovit', 'Zavolat', 'Poslat e-mail', '\u010cekat na odpov\u011b\u010f',
  'Ud\u011blat follow-up', 'Domluvit sch\u016fzku', 'Poslat nab\u00eddku', 'Zkontrolovat pozd\u011bji'
];

/* ── B-06: Human-friendly review decision dropdown ── */
// Empty first entry = "no decision" (clears prior decision if any).
// Accented values are canonical; deaccented aliases accepted on write.
var HUMAN_REVIEW_VALUES_ = [
  '',                        // no decision
  'Schv\u00e1lit',           // APPROVE
  'Zam\u00edtnout',          // REJECT
  'Zm\u011bny'               // CHANGES_REQUESTED
];


/* ═══════════════════════════════════════════════════════════════
   CONTACT READINESS EVALUATION
   ═══════════════════════════════════════════════════════════════ */

function buildContactReadiness_(hr, row) {
  if (trimLower_(hr.get(row, 'qualified_for_preview')) !== 'true') {
    return { ready: false, reason: '', priority: '' };
  }
  if (trimLower_(hr.get(row, 'dedupe_flag')) === 'true') {
    return { ready: false, reason: 'DUPLICITA', priority: '' };
  }
  var leadStage = trimLower_(hr.get(row, 'lead_stage'));
  if (leadStage === trimLower_(LEAD_STAGES.DISQUALIFIED)) {
    return { ready: false, reason: 'DISQUALIFIED', priority: '' };
  }
  if (leadStage === trimLower_(LEAD_STAGES.REVIEW)) {
    return { ready: false, reason: 'NEEDS_REVIEW', priority: '' };
  }
  var rd = hr.row(row);
  var hasEmail = !isBlank_(rd.email);
  var hasPhone = !isBlank_(rd.phone);
  if (!hasEmail && !hasPhone) {
    return { ready: false, reason: 'NO_CONTACT', priority: '' };
  }
  var previewStage = trimLower_(hr.get(row, 'preview_stage'));
  var processed = (previewStage === 'brief_ready' || previewStage === 'ready' ||
                   previewStage === 'review_needed' || previewStage === 'sent_to_webhook');
  if (!processed) {
    return { ready: false, reason: 'NOT_PROCESSED', priority: '' };
  }
  var outreachStage = trimLower_(hr.get(row, 'outreach_stage'));
  if (outreachStage === 'won' || outreachStage === 'lost') {
    return { ready: false, reason: outreachStage.toUpperCase(), priority: '' };
  }

  var webState = resolveWebsiteState_(rd);
  var reasons = [];
  if (webState === 'NO_WEBSITE') reasons.push('Nem\u00e1 web');
  else if (webState === 'WEAK_WEBSITE') reasons.push('Slab\u00fd web');
  else if (webState === 'CONFLICT') reasons.push('Stav webu nejasn\u00fd');
  else if (webState === 'UNKNOWN') reasons.push('Web neov\u011b\u0159en');
  else if (webState === 'HAS_WEBSITE') reasons.push('Prostor pro zlep\u0161en\u00ed');

  var hasDraft = !isBlank_(hr.get(row, 'email_subject_draft'));
  if (hasDraft) reasons.push('draft p\u0159ipraven');
  var reason = reasons.join(' \u00b7 ') || 'kvalifikov\u00e1n';

  var priority = 'MEDIUM';
  if ((webState === 'NO_WEBSITE' || webState === 'WEAK_WEBSITE') && hasDraft && hasEmail) priority = 'HIGH';
  if (!hasDraft) priority = 'LOW';
  if (!hasEmail && priority !== 'LOW') priority = 'LOW';

  return { ready: true, reason: reason, priority: priority };
}


function evaluateContactReadiness() {
  var ss = openCrmSpreadsheet_();
  var sheet = getExternalSheet_(ss);
  if (!ensurePreviewExtensionReady_(sheet)) return;
  var hr = getHeaderResolver_(sheet);
  var bulk = readAllData_(sheet);
  if (bulk.data.length === 0) { safeAlert_('\u017d\u00e1dn\u00e1 data.'); return; }

  var updatedRows = [];
  for (var i = 0; i < bulk.data.length; i++) updatedRows.push(bulk.data[i].slice());

  var stats = { ready: 0, notReady: 0, high: 0, medium: 0, low: 0 };
  for (var i = 0; i < updatedRows.length; i++) {
    try {
      var cr = buildContactReadiness_(hr, updatedRows[i]);
      hr.set(updatedRows[i], 'contact_ready', cr.ready ? 'TRUE' : 'FALSE');
      hr.set(updatedRows[i], 'contact_reason', cr.reason);
      hr.set(updatedRows[i], 'contact_priority', cr.priority);
      if (cr.ready) {
        stats.ready++;
        if (cr.priority === 'HIGH') stats.high++;
        else if (cr.priority === 'MEDIUM') stats.medium++;
        else stats.low++;
      } else { stats.notReady++; }
    } catch (e) {
      aswLog_('ERROR', 'evaluateContactReadiness', 'Row ' + (i + DATA_START_ROW) + ': ' + e.message);
    }
  }
  writeExtensionColumns_(sheet, hr, updatedRows, bulk.data);
  safeAlert_(
    'Contact readiness: ' + stats.ready + ' p\u0159ipraveno' +
    ' (H' + stats.high + '/M' + stats.medium + '/L' + stats.low + ')' +
    ', ' + stats.notReady + ' nep\u0159ipraveno'
  );
}


/* ═══════════════════════════════════════════════════════════════
   COLUMN LAYOUT
   ═══════════════════════════════════════════════════════════════ */

var VISIBLE_HEADERS_ = [
  'Priorita',                    // 1  RO
  'Firma',                       // 2  RO
  'D\u016fvod osloven\u00ed',    // 3  RO
  'Preview',                     // 4  RO
  'Telefon',                     // 5  RO
  'E-mail',                      // 6  RO
  'Stav \u270e',                 // 7  EDIT (outreach_stage)
  'Dal\u0161\u00ed krok \u270e', // 8  EDIT (next_action)
  'Posledn\u00ed kontakt \u270e',// 9  EDIT (last_contact_at)
  'Follow-up \u270e',            // 10 EDIT (next_followup_at)
  'Pozn\u00e1mka \u270e',        // 11 EDIT (sales_note)
  'Rozhodnut\u00ed \u270e',      // 12 EDIT (review_decision, B-06)
  'D\u016fvod revize \u270e'     // 13 EDIT (review_note,     B-06)
];

var DETAIL_HEADERS_ = [
  'Kontaktn\u00ed osoba',         // 14
  'Typ slu\u017eby',              // 15
  'Kan\u00e1l',                   // 16
  'Shrnut\u00ed',                 // 17
  'P\u0159edm\u011bt e-mailu',    // 18
  'N\u00e1vrh zpr\u00e1vy',       // 19
  'Pipeline stav',                // 20
  'Lead ID'                       // 21
];

var TOTAL_COLS_ = VISIBLE_HEADERS_.length + DETAIL_HEADERS_.length;


/* ═══════════════════════════════════════════════════════════════
   DISPLAY HELPERS
   ═══════════════════════════════════════════════════════════════ */

function humanizeOutreachStage_(stage) {
  var s = trimLower_(stage);
  if (!s || s === 'not_contacted') return 'Neosloveno';
  if (s === 'draft_ready') return 'P\u0159ipraveno';
  if (s === 'contacted') return 'Osloveno';
  if (s === 'responded') return 'Reagoval';
  if (s === 'won') return 'Z\u00e1jem';
  if (s === 'lost') return 'Nez\u00e1jem';
  return 'Neosloveno';
}

function reverseHumanizeOutreachStage_(humanStav) {
  var map = {
    'neosloveno': 'NOT_CONTACTED',
    'p\u0159ipraveno': 'DRAFT_READY',
    'pripraveno': 'DRAFT_READY',
    'osloveno': 'CONTACTED',
    'reagoval': 'RESPONDED',
    'z\u00e1jem': 'WON',
    'zajem': 'WON',
    'nez\u00e1jem': 'LOST',
    'nezajem': 'LOST'
  };
  var key = trimLower_(humanStav);
  return map[key] || humanStav;
}

/* ── B-06: Review decision humanize / reverseHumanize ── */

function humanizeReviewDecision_(decision) {
  var s = String(decision || '').trim().toUpperCase();
  if (s === 'APPROVE') return 'Schv\u00e1lit';
  if (s === 'REJECT') return 'Zam\u00edtnout';
  if (s === 'CHANGES_REQUESTED') return 'Zm\u011bny';
  return ''; // empty / unknown → blank cell
}

/**
 * Map dropdown label (accented or plain) to canonical REVIEW_DECISIONS enum.
 * Returns null if input doesn't map to a known decision (caller should treat
 * as "no decision" / clear).
 */
function reverseHumanizeReviewDecision_(humanValue) {
  var raw = String(humanValue == null ? '' : humanValue).trim();
  if (!raw) return null; // blank = clear / no decision
  // Accept already-canonical enum values (tests or direct API use)
  var upper = raw.toUpperCase();
  if (upper === 'APPROVE' || upper === 'REJECT' || upper === 'CHANGES_REQUESTED') {
    return upper;
  }
  var key = removeDiacritics_(raw.toLowerCase());
  var map = {
    'schvalit':  'APPROVE',
    'zamitnout': 'REJECT',
    'zmeny':     'CHANGES_REQUESTED'
  };
  return map[key] || null;
}

function deriveNextAction_(outreachStage) {
  var s = trimLower_(outreachStage);
  if (s === 'draft_ready' || s === 'not_contacted' || !s) return 'Oslovit';
  if (s === 'contacted') return '\u010cekat na odpov\u011b\u010f';
  if (s === 'responded') return 'Domluvit sch\u016fzku';
  // NOTE: won/lost rows are filtered out by buildContactReadiness_ (line 85)
  // and never appear in "Ke kontaktování". These values are outside
  // NEXT_ACTION_VALUES_ dropdown — if won/lost rows are ever included,
  // these must be added to the dropdown or mapped to existing values.
  if (s === 'won') return 'Uzav\u0159eno \u2713';
  if (s === 'lost') return 'Uzav\u0159eno';
  return 'Oslovit';
}

function derivePreviewDisplay_(hr, row) {
  var previewUrl   = String(hr.get(row, 'preview_url') || '').trim();
  var previewStage = trimLower_(hr.get(row, 'preview_stage'));
  if (previewUrl && (previewStage === 'ready' || previewStage === 'review_needed')) {
    return { text: '\u2726 Otev\u0159\u00edt preview', url: previewUrl };
  }
  if (previewStage === 'ready') return { text: '\u2713 P\u0159ipraveno', url: '' };
  if (previewStage === 'review_needed') return { text: '\u26a0 K revizi', url: '' };
  if (previewStage === 'sent_to_webhook') return { text: '\u23f3 Generuje se\u2026', url: '' };
  if (previewStage === 'queued') return { text: '\u23f3 Ve front\u011b', url: '' };
  if (previewStage === 'brief_ready') return { text: '\u23f3 \u010cek\u00e1 na preview', url: '' };
  if (previewStage === 'failed') return { text: '\u2716 Chyba', url: '' };
  return { text: '\u2014', url: '' };
}


/* ═══════════════════════════════════════════════════════════════
   ROW BUILDER
   ═══════════════════════════════════════════════════════════════ */

function buildContactRowV2_(hr, row) {
  var rd = hr.row(row);

  var businessName = String(rd.business_name || '').trim();
  var city = String(rd.city || '').trim();
  var phone = String(rd.phone || '').trim();
  var email = String(rd.email || '').trim();
  var rawOutreach = String(hr.get(row, 'outreach_stage') || 'NOT_CONTACTED');

  var firma = businessName;
  if (city) firma += '\n' + city;

  var preview = derivePreviewDisplay_(hr, row);
  var serviceType = humanizeServiceType_(rd.service_type || rd.segment || '');
  var channel = email ? 'E-mail' : (phone ? 'Telefon' : '\u2014');
  var summary = String(rd.pain_point || '').trim();
  if (!summary) summary = String(hr.get(row, 'preview_headline') || '').trim();

  // Next action: use stored value if set, otherwise derive
  var nextAction = String(hr.get(row, 'next_action') || '').trim();
  if (!nextAction) nextAction = deriveNextAction_(rawOutreach);

  // Editable fields from source
  var lastContact  = hr.get(row, 'last_contact_at') || '';
  var nextFollowup = hr.get(row, 'next_followup_at') || '';
  var salesNote    = String(hr.get(row, 'sales_note') || '');

  // B-06: carry current review state into visible cells so operator sees prior decision
  var reviewDecision = String(hr.get(row, 'review_decision') || '').trim();
  var reviewNote     = String(hr.get(row, 'review_note') || '');

  // VISIBLE (1-13)
  var visible = [
    String(hr.get(row, 'contact_priority') || ''),     // 1  Priorita
    firma,                                             // 2  Firma
    String(hr.get(row, 'contact_reason') || ''),       // 3  Důvod
    preview.text,                                      // 4  Preview
    phone || '\u2014',                                 // 5  Telefon
    email || '\u2014',                                 // 6  E-mail
    humanizeOutreachStage_(rawOutreach),                // 7  Stav ✎
    nextAction,                                        // 8  Další krok ✎
    lastContact,                                       // 9  Poslední kontakt ✎
    nextFollowup,                                      // 10 Follow-up ✎
    salesNote,                                         // 11 Poznámka ✎
    humanizeReviewDecision_(reviewDecision),           // 12 Rozhodnutí ✎ (B-06)
    reviewNote                                         // 13 Důvod revize ✎ (B-06)
  ];

  // DETAIL (14-21)
  var detail = [
    String(rd.contact_name || '').trim() || '\u2014',  // 12 Kontaktní osoba
    serviceType || '\u2014',                           // 13 Typ služby
    channel,                                           // 14 Kanál
    summary || '\u2014',                               // 15 Shrnutí
    String(hr.get(row, 'email_subject_draft') || ''),  // 16 Předmět
    String(hr.get(row, 'email_body_draft') || ''),     // 17 Zpráva
    rawOutreach,                                       // 18 Pipeline stav
    String(hr.get(row, 'lead_id') || '')               // 19 Lead ID
  ];

  return { data: visible.concat(detail), previewUrl: preview.url };
}


/* ═══════════════════════════════════════════════════════════════
   MAIN REFRESH
   ═══════════════════════════════════════════════════════════════ */

function refreshContactingSheet() {
  // R-3 fix: Lock prevents concurrent refresh + write-back collision
  var refreshLock = LockService.getScriptLock();
  if (!refreshLock.tryLock(5000)) {
    aswLog_('WARN', 'refreshContactingSheet', 'Lock timeout — another operation in progress');
    safeAlert_('Probíhá jiný zápis. Zkuste znovu za chvíli.');
    return;
  }

  try {
  var ss = openCrmSpreadsheet_();
  var sourceSheet = getExternalSheet_(ss);
  if (!ensurePreviewExtensionReady_(sourceSheet)) return;

  var hr = getHeaderResolver_(sourceSheet);
  var bulk = readAllData_(sourceSheet);
  if (bulk.data.length === 0) {
    safeAlert_('\u017d\u00e1dn\u00e1 data ve zdrojov\u00e9m listu.');
    return;
  }

  aswLog_('INFO', 'refreshContactingSheet', 'Starting. Source rows: ' + bulk.data.length);

  // --- Evaluate contact readiness ---
  var updatedRows = [];
  for (var i = 0; i < bulk.data.length; i++) updatedRows.push(bulk.data[i].slice());

  for (var i = 0; i < updatedRows.length; i++) {
    try {
      var cr = buildContactReadiness_(hr, updatedRows[i]);
      hr.set(updatedRows[i], 'contact_ready', cr.ready ? 'TRUE' : 'FALSE');
      hr.set(updatedRows[i], 'contact_reason', cr.reason);
      hr.set(updatedRows[i], 'contact_priority', cr.priority);
    } catch (e) {
      aswLog_('ERROR', 'refreshContactingSheet', 'Row ' + (i + DATA_START_ROW) + ': ' + e.message);
    }
  }
  writeExtensionColumns_(sourceSheet, hr, updatedRows, bulk.data);

  // --- Collect contact-ready rows ---
  var contactRows = [];
  var previewUrls = [];
  var missingLeadIdCount = 0;
  for (var i = 0; i < updatedRows.length; i++) {
    if (trimLower_(hr.get(updatedRows[i], 'contact_ready')) !== 'true') continue;
    // P-1: Warn if contact-ready lead has no lead_id
    var rowLeadId = String(hr.get(updatedRows[i], 'lead_id') || '').trim();
    if (!rowLeadId) {
      missingLeadIdCount++;
      aswLog_('WARN', 'refreshContactingSheet',
        'Contact-ready row ' + (i + DATA_START_ROW) + ' has NO lead_id — write-back will be blocked');
    }
    var built = buildContactRowV2_(hr, updatedRows[i]);
    contactRows.push(built.data);
    previewUrls.push(built.previewUrl);
  }

  if (missingLeadIdCount > 0) {
    aswLog_('WARN', 'refreshContactingSheet',
      missingLeadIdCount + ' contact-ready leads have no lead_id. Run "Ensure lead IDs" to fix.');
  }

  if (contactRows.length === 0) {
    safeAlert_('\u017d\u00e1dn\u00e9 leady p\u0159ipraveny k osloven\u00ed.');
    return;
  }

  // --- Sort: HIGH → MEDIUM → LOW ---
  var prioMap = { 'HIGH': 0, 'MEDIUM': 1, 'LOW': 2 };
  var indexed = [];
  for (var i = 0; i < contactRows.length; i++) {
    indexed.push({ d: contactRows[i], u: previewUrls[i] });
  }
  indexed.sort(function(a, b) {
    var pa = prioMap[a.d[0]] !== undefined ? prioMap[a.d[0]] : 3;
    var pb = prioMap[b.d[0]] !== undefined ? prioMap[b.d[0]] : 3;
    return pa - pb;
  });
  var sorted = [];
  var sortedUrls = [];
  for (var i = 0; i < indexed.length; i++) {
    sorted.push(indexed[i].d);
    sortedUrls.push(indexed[i].u);
  }

  // --- KPI stats ---
  var kpi = { total: sorted.length, high: 0, uncontacted: 0, previewReady: 0 };
  for (var i = 0; i < sorted.length; i++) {
    if (sorted[i][0] === 'HIGH') kpi.high++;
    var stav = sorted[i][6];
    if (stav === 'Neosloveno' || stav === 'P\u0159ipraveno') kpi.uncontacted++;
    var prev = sorted[i][3];
    if (prev.indexOf('\u2726') !== -1 || prev.indexOf('\u2713') !== -1) kpi.previewReady++;
  }

  // --- Create / clear sheet ---
  var cs = ss.getSheetByName(CONTACT_SHEET_NAME);
  if (cs) {
    try { var f = cs.getFilter(); if (f) f.remove(); } catch (e) {}
    // Remove protections
    var prots = cs.getProtections(SpreadsheetApp.ProtectionType.SHEET);
    for (var p = 0; p < prots.length; p++) {
      if (prots[p].canEdit()) prots[p].remove();
    }
    cs.clear();
    cs.clearConditionalFormatRules();
    // Remove column groups from current AND previous layout versions.
    // Range covers pre-B-06 detail area (9–19) AND post-B-06 detail area (14–21).
    for (var gc = 9; gc <= 21; gc++) {
      try { cs.getRange(1, gc, 1, 1).shiftColumnGroupDepth(-1); } catch (e) {}
    }
    // Force-show ALL columns (old collapsed groups leave cols hidden)
    cs.showColumns(1, cs.getMaxColumns());
  } else {
    cs = ss.insertSheet(CONTACT_SHEET_NAME);
  }

  // Ensure enough cols/rows
  var curCols = cs.getMaxColumns();
  if (curCols < TOTAL_COLS_) cs.insertColumnsAfter(curCols, TOTAL_COLS_ - curCols);
  var neededRows = TABLE_DATA_START_ + sorted.length;
  var curRows = cs.getMaxRows();
  if (curRows < neededRows) cs.insertRowsAfter(curRows, neededRows - curRows);

  // --- Dashboard (rows 1-4) ---
  writeDashboard_(cs, kpi);

  // --- Header (row 5) ---
  var allHeaders = VISIBLE_HEADERS_.concat(DETAIL_HEADERS_);
  cs.getRange(TABLE_HEADER_ROW_, 1, 1, TOTAL_COLS_).setValues([allHeaders]);

  // --- Data (row 6+) ---
  if (sorted.length > 0) {
    cs.getRange(TABLE_DATA_START_, 1, sorted.length, TOTAL_COLS_).setValues(sorted);
  }

  // --- Preview hyperlinks ---
  for (var r = 0; r < sortedUrls.length; r++) {
    if (sortedUrls[r]) {
      cs.getRange(TABLE_DATA_START_ + r, 4)
        .setFormula('=HYPERLINK("' + sortedUrls[r].replace(/"/g, '""') +
          '","\u2726 Otev\u0159\u00edt preview")');
    }
  }

  // --- Formatting ---
  applyPremiumFormatting_(cs, sorted.length);

  // --- Group + collapse detail columns ---
  var detailStart = VISIBLE_HEADERS_.length + 1;
  cs.getRange(1, detailStart, 1, DETAIL_HEADERS_.length).shiftColumnGroupDepth(1);
  try { cs.getColumnGroup(detailStart, 1).collapse(); } catch (e) {}

  // --- Data validation for Stav column (dropdown) ---
  if (sorted.length > 0) {
    var stavValidation = SpreadsheetApp.newDataValidation()
      .requireValueInList(HUMAN_STAV_VALUES_, true)
      .setAllowInvalid(false)
      .build();
    cs.getRange(TABLE_DATA_START_, 7, sorted.length, 1).setDataValidation(stavValidation);

    // Dropdown for Další krok (col 8)
    var actionValidation = SpreadsheetApp.newDataValidation()
      .requireValueInList(NEXT_ACTION_VALUES_, true)
      .setAllowInvalid(true)
      .build();
    cs.getRange(TABLE_DATA_START_, 8, sorted.length, 1).setDataValidation(actionValidation);

    // Date validation for Poslední kontakt (col 9) and Follow-up (col 10)
    var dateValidation = SpreadsheetApp.newDataValidation()
      .requireDate()
      .setAllowInvalid(true)
      .build();
    cs.getRange(TABLE_DATA_START_, 9, sorted.length, 1).setDataValidation(dateValidation);
    cs.getRange(TABLE_DATA_START_, 10, sorted.length, 1).setDataValidation(dateValidation);

    // B-06: Review decision dropdown (col 12). Hard-reject unknown values.
    var reviewValidation = SpreadsheetApp.newDataValidation()
      .requireValueInList(HUMAN_REVIEW_VALUES_, true)
      .setAllowInvalid(false)
      .build();
    cs.getRange(TABLE_DATA_START_, REVIEW_DECISION_COL_, sorted.length, 1)
      .setDataValidation(reviewValidation);
    // Důvod revize (col 13): free text, no validation.
  }

  // --- Sheet protection (warning-only for read-only cols) ---
  applySheetProtection_(cs, sorted.length);

  // --- Cleanup extra rows/cols ---
  var maxC = cs.getMaxColumns();
  if (maxC > TOTAL_COLS_) cs.deleteColumns(TOTAL_COLS_ + 1, maxC - TOTAL_COLS_);
  var maxR = cs.getMaxRows();
  var usedR = TABLE_DATA_START_ + sorted.length - 1;
  if (maxR > usedR) cs.deleteRows(usedR + 1, maxR - usedR);

  var msg = '"' + CONTACT_SHEET_NAME + '" aktualizov\u00e1n. ' +
    sorted.length + ' lead\u016f (H' + kpi.high + ' / Neoslov. ' + kpi.uncontacted + ')';
  aswLog_('INFO', 'refreshContactingSheet', msg);

  if (missingLeadIdCount > 0) {
    safeAlert_(msg + '\n\n\u26a0 ' + missingLeadIdCount +
      ' lead\u016f bez lead_id \u2014 write-back pro n\u011b nebude fungovat.\n' +
      'Spus\u0165te "Ensure lead IDs" z menu.');
  } else {
    safeAlert_(msg);
  }

  } finally {
    refreshLock.releaseLock();
  }
}


/* ═══════════════════════════════════════════════════════════════
   KPI DASHBOARD (rows 1-4)
   ═══════════════════════════════════════════════════════════════ */

function writeDashboard_(sheet, kpi) {
  sheet.setRowHeight(1, 6);
  sheet.setRowHeight(2, 22);
  sheet.setRowHeight(3, 38);
  sheet.setRowHeight(4, 4);

  sheet.getRange(1, 1, DASHBOARD_ROWS_, TOTAL_COLS_).setBackground('#FFFFFF');

  var cards = [
    { label: 'Celkem k osloven\u00ed', value: kpi.total,        cols: [1, 2] },
    { label: 'High priority',          value: kpi.high,          cols: [3, 4] },
    { label: 'Neosloveno',             value: kpi.uncontacted,   cols: [5, 6] },
    { label: 'Preview',                value: kpi.previewReady,  cols: [7, 8] },
    { label: 'Aktualizace',            value: '', cols: [9, 13] } // B-06: extended to cover review cols
  ];

  for (var k = 0; k < cards.length; k++) {
    var c1 = cards[k].cols[0];
    var span = cards[k].cols[1] - cards[k].cols[0] + 1;

    var labelR = sheet.getRange(2, c1, 1, span);
    labelR.merge();
    labelR.setValue(cards[k].label);
    labelR.setFontFamily('Arial').setFontSize(9).setFontColor('#8C939D');
    labelR.setHorizontalAlignment('center').setVerticalAlignment('bottom');

    var valueR = sheet.getRange(3, c1, 1, span);
    valueR.merge();
    if (k === 4) {
      // Timestamp card
      valueR.setValue(new Date().toLocaleDateString('cs-CZ'));
      valueR.setFontFamily('Arial').setFontSize(14).setFontWeight('bold').setFontColor('#8C939D');
    } else {
      valueR.setValue(cards[k].value);
      valueR.setFontFamily('Arial').setFontSize(22).setFontWeight('bold').setFontColor('#1B2A4A');
      valueR.setNumberFormat('0');
    }
    valueR.setHorizontalAlignment('center').setVerticalAlignment('middle');
  }

  sheet.getRange(4, 1, 1, VISIBLE_HEADERS_.length)
    .setBorder(null, null, true, null, null, null, '#E2E5EA',
      SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
}


/* ═══════════════════════════════════════════════════════════════
   SHEET PROTECTION — warning-only for read-only areas
   ═══════════════════════════════════════════════════════════════ */

function applySheetProtection_(sheet, dataRowCount) {
  if (dataRowCount === 0) return;

  var protection = sheet.protect().setDescription('Read-only oblasti \u2013 editujte pouze sloupce se \u270e');
  protection.setWarningOnly(true);

  // Unprotect editable columns in data area
  var unprotectedRanges = [];
  for (var c = FIRST_EDITABLE_COL_; c <= LAST_EDITABLE_COL_; c++) {
    unprotectedRanges.push(sheet.getRange(TABLE_DATA_START_, c, dataRowCount, 1));
  }
  protection.setUnprotectedRanges(unprotectedRanges);
}


/* ═══════════════════════════════════════════════════════════════
   WRITE-BACK HANDLER — onEdit trigger for "Ke kontaktování"
   ═══════════════════════════════════════════════════════════════

   Installed via installContactEditTrigger().
   Fires on any edit in the CRM spreadsheet.
   Only processes edits in "Ke kontaktování", data rows, editable cols.
   Writes the changed value back to the source sheet.
   ═══════════════════════════════════════════════════════════════ */

function onContactSheetEdit(e) {
  // Guard: only process "Ke kontaktování" sheet
  var sheet;
  try {
    sheet = e.range.getSheet();
  } catch (err) {
    return;
  }
  if (sheet.getName() !== CONTACT_SHEET_NAME) return;

  var row = e.range.getRow();
  var col = e.range.getColumn();

  // Guard: only data rows (below header + dashboard)
  if (row < TABLE_DATA_START_) return;

  // Guard: only editable columns
  if (!WRITEBACK_MAP_[col]) return;

  // Guard: prevent re-entry (P1.1 — feedback on lock failure)
  // R-2 fix: increased timeout from 2s to 5s
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    aswLog_('WARN', 'onContactSheetEdit',
      'Lock timeout at row ' + row + ' col ' + col + ' — edit NOT written back');
    try {
      e.range.setNote('\u26a0 Zm\u011bna se nepropsala do CRM (sou\u010dasn\u00fd z\u00e1pis). Zkuste znovu.');
    } catch (noteErr) {}
    return;
  }

  try {
    // ── Variant B: lead_id-based lookup instead of row number ──
    var leadId = String(sheet.getRange(row, CRM_ROW_COL_).getValue() || '').trim();
    if (!leadId) {
      aswLog_('WARN', 'onContactSheetEdit',
        'No lead_id at contact sheet row ' + row + ' — write-back BLOCKED. Run "Ensure lead IDs" + Refresh.');
      try {
        e.range.setNote(
          '\u26a0 Chyb\u00ed lead_id pro tento \u0159\u00e1dek.\n' +
          'Zm\u011bna se NEPROPSALA.\n' +
          'Spus\u0165te "Ensure lead IDs" a pot\u00e9 Refresh.'
        );
      } catch (noteErr) {}
      return;
    }

    // Validate lead_id format — must be non-trivial identifier
    // Accepts: ASW-* (generated), FIRMYCZ-* (legacy), any string with letters + hyphen/digit
    // Rejects: pure numbers (old row references), whitespace-only, very short strings
    if (/^\d+$/.test(leadId) || leadId.length < 3) {
      aswLog_('WARN', 'onContactSheetEdit',
        'Invalid lead_id "' + leadId + '" at row ' + row + ' (numeric or too short) — write-back BLOCKED');
      try {
        e.range.setNote(
          '\u26a0 Neplatn\u00fd form\u00e1t lead_id.\n' +
          'Zm\u011bna se NEPROPSALA.\n' +
          'Spus\u0165te Refresh "Ke kontaktov\u00e1n\u00ed".'
        );
      } catch (noteErr) {}
      return;
    }

    // Write to source sheet
    var ss = e.source || openCrmSpreadsheet_();
    var sourceSheet = ss.getSheetByName(MAIN_SHEET_NAME);
    if (!sourceSheet) {
      aswLog_('ERROR', 'onContactSheetEdit', 'Source sheet not found');
      return;
    }

    // P0 — Validate LEGACY_COL header positions before any read/write
    var colCheck = validateLegacyColHeaders_(sourceSheet);
    if (!colCheck.ok) {
      aswLog_('ERROR', 'onContactSheetEdit',
        'LEGACY_COL MISMATCH — write-back BLOCKED. ' + colCheck.mismatches.join('; '));
      try {
        e.range.setNote(
          '\u26a0 Struktura CRM se zm\u011bnila!\n' +
          'Sloupce nesed\u00ed na o\u010dek\u00e1van\u00fdch pozic\u00edch.\n' +
          'Zm\u011bna se NEPROPSALA.\n' +
          'Kontaktujte spr\u00e1vce syst\u00e9mu.'
        );
      } catch (noteErr) {}
      return;
    }

    // ── Lead ID lookup: find current row in LEADS by lead_id ──
    var sourceHr = getHeaderResolver_(sourceSheet);
    var leadIdCol = sourceHr.colOrNull('lead_id');
    if (!leadIdCol) {
      aswLog_('ERROR', 'onContactSheetEdit', 'Column "lead_id" not found in source sheet');
      return;
    }

    var crmRowNum = findRowByLeadId_(sourceSheet, leadIdCol, leadId);
    if (!crmRowNum) {
      aswLog_('ERROR', 'onContactSheetEdit',
        'Lead "' + leadId + '" not found in LEADS — write-back BLOCKED. Refresh needed.');
      try {
        e.range.setNote(
          '\u26a0 Lead "' + leadId + '" nenalezen v CRM.\n' +
          'Zm\u011bna se NEPROPSALA.\n' +
          'Spus\u0165te Refresh "Ke kontaktov\u00e1n\u00ed".'
        );
      } catch (noteErr) {}
      return;
    }

    // P0.1 — Secondary guard: verify row identity (business_name + city)
    var sourceBusinessName = String(
      sourceSheet.getRange(crmRowNum, LEGACY_COL.BUSINESS_NAME).getValue() || ''
    ).trim();
    var sourceCity = String(
      sourceSheet.getRange(crmRowNum, LEGACY_COL.CITY).getValue() || ''
    ).trim();
    var firmaCell = String(sheet.getRange(row, 2).getValue() || '');
    var firmaParts = firmaCell.split('\n');
    var contactFirma = (firmaParts[0] || '').trim();
    var contactCity  = (firmaParts[1] || '').trim();

    var nameMatch = normalizeBusinessName_(sourceBusinessName) === normalizeBusinessName_(contactFirma);
    var cityMatch = !contactCity || !sourceCity ||
      removeDiacritics_(trimLower_(sourceCity)) === removeDiacritics_(trimLower_(contactCity));

    if (!nameMatch || !cityMatch) {
      aswLog_('ERROR', 'onContactSheetEdit',
        'IDENTITY MISMATCH! lead_id=' + leadId + ' CRM row ' + crmRowNum +
        ' = "' + sourceBusinessName + ' / ' + sourceCity +
        '" but contact row ' + row + ' = "' + contactFirma + ' / ' + contactCity +
        '". Write-back BLOCKED.');
      try {
        e.range.setNote(
          '\u26a0 Lead_id nalezen, ale firma nesed\u00ed.\n' +
          'Zm\u011bna se NEPROPSALA.\n' +
          'Spus\u0165te Refresh "Ke kontaktov\u00e1n\u00ed".'
        );
      } catch (noteErr) {}
      return;
    }

    var newValue = e.range.getValue();
    var mapping = WRITEBACK_MAP_[col];

    // B-06: Review decision edit → atomic multi-cell handler (guards + 4 fields).
    // Dispatch before plain-write path to avoid partial writes.
    if (mapping.kind === 'review_decision') {
      handleReviewDecisionEdit_(e, sourceSheet, sourceHr, crmRowNum, leadId, newValue);
      return;
    }

    // Reverse humanize Stav → outreach_stage
    if (mapping.reverseHumanize) {
      newValue = reverseHumanizeOutreachStage_(newValue);
    }

    var sourceCol = sourceHr.colOrNull(mapping.field);
    if (!sourceCol) {
      aswLog_('ERROR', 'onContactSheetEdit', 'Source column "' + mapping.field + '" not found');
      return;
    }

    sourceSheet.getRange(crmRowNum, sourceCol).setValue(newValue);

    // Clear only OUR warning notes (preserve user notes)
    try {
      var existingNote = e.range.getNote();
      if (existingNote && existingNote.indexOf('\u26a0') === 0) {
        e.range.setNote('');
      }
    } catch (noteErr) {}

    aswLog_('INFO', 'onContactSheetEdit',
      'Write-back OK: lead_id=' + leadId + ' CRM row ' + crmRowNum +
      ' ' + mapping.field + ' = ' + String(newValue).substring(0, 100));

  } catch (err) {
    aswLog_('ERROR', 'onContactSheetEdit', 'Write-back failed: ' + err.message);
  } finally {
    lock.releaseLock();
  }
}


/* ═══════════════════════════════════════════════════════════════
   B-06: REVIEW DECISION HANDLER — atomic multi-cell write
   ═══════════════════════════════════════════════════════════════ */

/**
 * Handle an edit to the "Rozhodnutí" cell (col 12). Guards:
 *   - preview_stage MUST be READY_FOR_REVIEW
 *   - lead_id already validated by caller
 *   - dedupe_flag != TRUE
 *   - lead_stage not in {DISQUALIFIED, REVIEW}
 *   - outreach_stage not in {WON, LOST}
 *   - all 4 target LEADS columns must resolve BEFORE any write
 *
 * On pass: atomic write of review_decision + reviewed_at + reviewed_by +
 * preview_stage. review_note is NOT touched by this handler — it lives on
 * col 13 and takes its own plain-write path.
 *
 * On fail: no write to LEADS; operator-facing note on the edited cell;
 * WARN/ERROR to _asw_logs.
 *
 * Blank / unknown dropdown value is treated as "clear decision" — no write,
 * no state change. (Cell constraint already rejects invalid values via
 * dropdown, but belt-and-suspenders: re-validate in code.)
 */
function handleReviewDecisionEdit_(e, sourceSheet, sourceHr, crmRowNum, leadId, newValue) {
  var decision = reverseHumanizeReviewDecision_(newValue);

  // Blank = clear / no decision — no-op (operator cleared dropdown).
  if (!decision) {
    aswLog_('INFO', 'handleReviewDecisionEdit_',
      'Blank / unknown decision at lead_id=' + leadId + ' — no write');
    return;
  }

  // Pre-resolve ALL 4 target columns to prevent partial writes.
  var colReviewDecision = sourceHr.colOrNull('review_decision');
  var colReviewedAt     = sourceHr.colOrNull('reviewed_at');
  var colReviewedBy     = sourceHr.colOrNull('reviewed_by');
  var colPreviewStage   = sourceHr.colOrNull('preview_stage');
  var missing = [];
  if (!colReviewDecision) missing.push('review_decision');
  if (!colReviewedAt)     missing.push('reviewed_at');
  if (!colReviewedBy)     missing.push('reviewed_by');
  if (!colPreviewStage)   missing.push('preview_stage');
  if (missing.length > 0) {
    aswLog_('ERROR', 'handleReviewDecisionEdit_',
      'Missing LEADS column(s): ' + missing.join(', ') + ' — write BLOCKED for lead_id=' + leadId);
    try {
      e.range.setNote('\u26a0 CRM nema pripravene B-06 sloupce (' + missing.join(', ') +
        '). Spustte Setup / migraci. Rozhodnuti se NEPROPSALO.');
    } catch (noteErr) {}
    return;
  }

  // Guard: current LEADS state must allow a review decision.
  var curStage       = String(sourceSheet.getRange(crmRowNum, colPreviewStage).getValue() || '').trim().toUpperCase();
  var colDedupeFlag  = sourceHr.colOrNull('dedupe_flag');
  var colLeadStage   = sourceHr.colOrNull('lead_stage');
  var colOutreach    = sourceHr.colOrNull('outreach_stage');
  var dedupeFlag     = colDedupeFlag ? String(sourceSheet.getRange(crmRowNum, colDedupeFlag).getValue() || '').trim().toUpperCase() : '';
  var leadStageVal   = colLeadStage  ? String(sourceSheet.getRange(crmRowNum, colLeadStage).getValue() || '').trim().toUpperCase() : '';
  var outreachVal    = colOutreach   ? String(sourceSheet.getRange(crmRowNum, colOutreach).getValue() || '').trim().toUpperCase() : '';

  var guardFailures = [];
  if (curStage !== 'READY_FOR_REVIEW') {
    guardFailures.push('preview_stage=' + (curStage || '(empty)') + ' (required READY_FOR_REVIEW)');
  }
  if (dedupeFlag === 'TRUE') {
    guardFailures.push('dedupe_flag=TRUE');
  }
  if (leadStageVal === 'DISQUALIFIED' || leadStageVal === 'REVIEW') {
    guardFailures.push('lead_stage=' + leadStageVal);
  }
  if (outreachVal === 'WON' || outreachVal === 'LOST') {
    guardFailures.push('outreach_stage=' + outreachVal);
  }
  if (guardFailures.length > 0) {
    aswLog_('WARN', 'handleReviewDecisionEdit_',
      'Guard failed for lead_id=' + leadId + ': ' + guardFailures.join('; ') + ' — write BLOCKED');
    try {
      e.range.setNote('\u26a0 Rozhodnuti nelze zapsat: ' + guardFailures.join('; ') +
        '\nRozhodnuti se NEPROPSALO.');
      // Revert the cell to its previous humanized state (best-effort).
      var priorHuman = humanizeReviewDecision_(
        sourceSheet.getRange(crmRowNum, colReviewDecision).getValue());
      e.range.setValue(priorHuman);
    } catch (noteErr) {}
    return;
  }

  // Derive new preview_stage from decision.
  var newPreviewStage;
  if (decision === 'APPROVE') {
    newPreviewStage = PREVIEW_STAGES.APPROVED;
  } else if (decision === 'REJECT') {
    newPreviewStage = PREVIEW_STAGES.REJECTED;
  } else if (decision === 'CHANGES_REQUESTED') {
    newPreviewStage = PREVIEW_STAGES.BRIEF_READY;
  } else {
    aswLog_('ERROR', 'handleReviewDecisionEdit_',
      'Unexpected decision "' + decision + '" — should have been rejected earlier. Aborting.');
    return;
  }

  // Resolve reviewer identity (best-effort; empty string if not available).
  var reviewerEmail = '';
  try { reviewerEmail = Session.getActiveUser().getEmail() || ''; } catch (identErr) { reviewerEmail = ''; }
  var nowIso = new Date().toISOString();

  // Atomic write — all 4 cells under the single lock held by onContactSheetEdit.
  // Columns aren't contiguous so 4 setValue calls are required. Pre-resolved
  // above, so we know every write will succeed barring sheet failure.
  sourceSheet.getRange(crmRowNum, colReviewDecision).setValue(decision);
  sourceSheet.getRange(crmRowNum, colReviewedAt).setValue(nowIso);
  sourceSheet.getRange(crmRowNum, colReviewedBy).setValue(reviewerEmail);
  sourceSheet.getRange(crmRowNum, colPreviewStage).setValue(newPreviewStage);

  // Clear any prior warning note on the edited cell.
  try {
    var existingNote = e.range.getNote();
    if (existingNote && existingNote.indexOf('\u26a0') === 0) e.range.setNote('');
  } catch (noteErr) {}

  aswLog_('INFO', 'handleReviewDecisionEdit_',
    'Review written: lead_id=' + leadId + ' decision=' + decision +
    ' preview_stage=' + newPreviewStage + ' reviewed_by=' + (reviewerEmail || '(unknown)'));
}


/* ═══════════════════════════════════════════════════════════════
   TRIGGER INSTALLER — installs onEdit write-back trigger
   ═══════════════════════════════════════════════════════════════ */

function installContactEditTrigger() {
  var ss = openCrmSpreadsheet_();

  // Check for existing trigger
  var triggers = ScriptApp.getUserTriggers(ss);
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'onContactSheetEdit') {
      safeAlert_('Write-back trigger u\u017e existuje.');
      return;
    }
  }

  ScriptApp.newTrigger('onContactSheetEdit')
    .forSpreadsheet(ss)
    .onEdit()
    .create();

  aswLog_('INFO', 'installContactEditTrigger', 'Trigger installed for ' + SPREADSHEET_ID);
  safeAlert_(
    'Write-back trigger nainstalov\u00e1n.\n' +
    'Zm\u011bny ve sloupc\u00edch se \u270e se nyn\u00ed automaticky prop\u00ed\u0161\u00ed do source CRM.'
  );
}


/* ═══════════════════════════════════════════════════════════════
   PREMIUM FORMATTING
   ═══════════════════════════════════════════════════════════════ */

function applyPremiumFormatting_(sheet, dataRowCount) {
  var headerRow = TABLE_HEADER_ROW_;
  var dataStart = TABLE_DATA_START_;

  // ── TABLE HEADER — read-only columns ───────────────────────
  var roHeaderRange = sheet.getRange(headerRow, 1, 1, 6);
  roHeaderRange.setBackground('#1B2A4A');
  roHeaderRange.setFontColor('#FFFFFF');
  roHeaderRange.setFontWeight('bold');
  roHeaderRange.setFontFamily('Arial').setFontSize(10);
  roHeaderRange.setVerticalAlignment('middle').setHorizontalAlignment('center');
  roHeaderRange.setWrap(false);

  // ── TABLE HEADER — editable columns (accent shade) ─────────
  var editHeaderRange = sheet.getRange(headerRow, FIRST_EDITABLE_COL_, 1,
    LAST_EDITABLE_COL_ - FIRST_EDITABLE_COL_ + 1);
  editHeaderRange.setBackground('#2D4A7A');
  editHeaderRange.setFontColor('#FFFFFF');
  editHeaderRange.setFontWeight('bold');
  editHeaderRange.setFontFamily('Arial').setFontSize(10);
  editHeaderRange.setVerticalAlignment('middle').setHorizontalAlignment('center');
  editHeaderRange.setWrap(false);

  // Accent underline for editable headers
  editHeaderRange.setBorder(null, null, true, null, null, null, '#5B8DEF',
    SpreadsheetApp.BorderStyle.SOLID_THICK);

  // ── TABLE HEADER — detail columns ──────────────────────────
  var detailHeaderRange = sheet.getRange(headerRow, VISIBLE_HEADERS_.length + 1, 1, DETAIL_HEADERS_.length);
  detailHeaderRange.setBackground('#1B2A4A');
  detailHeaderRange.setFontColor('#FFFFFF');
  detailHeaderRange.setFontWeight('bold');
  detailHeaderRange.setFontFamily('Arial').setFontSize(10);
  detailHeaderRange.setVerticalAlignment('middle').setHorizontalAlignment('center');
  detailHeaderRange.setWrap(false);

  // Full header bottom border
  sheet.getRange(headerRow, 1, 1, TOTAL_COLS_)
    .setBorder(null, null, true, null, null, null, '#3D5A80',
      SpreadsheetApp.BorderStyle.SOLID_MEDIUM);

  sheet.setRowHeight(headerRow, 42);
  sheet.setFrozenRows(headerRow);

  // ── COLUMN WIDTHS ──────────────────────────────────────────
  // 1=Pri 2=Firma 3=Důvod 4=Preview 5=Tel 6=Email
  // 7=Stav 8=Krok 9=Kontakt 10=Follow 11=Pozn
  var vw = [70, 230, 155, 130, 120, 190, 105, 125, 110, 100, 165];
  for (var i = 0; i < vw.length; i++) sheet.setColumnWidth(i + 1, vw[i]);
  // Detail: 12-19
  var dw = [120, 140, 80, 200, 200, 340, 110, 65];
  var ds = VISIBLE_HEADERS_.length + 1;
  for (var i = 0; i < dw.length; i++) sheet.setColumnWidth(ds + i, dw[i]);

  if (dataRowCount === 0) return;

  // ── DATA BASELINE ──────────────────────────────────────────
  var allData = sheet.getRange(dataStart, 1, dataRowCount, TOTAL_COLS_);
  allData.setFontFamily('Arial').setFontSize(9).setVerticalAlignment('middle');

  for (var r = 0; r < dataRowCount; r++) {
    sheet.setRowHeight(dataStart + r, 44);
  }

  // ── ALTERNATING ROWS ───────────────────────────────────────
  for (var r = 0; r < dataRowCount; r++) {
    sheet.getRange(dataStart + r, 1, 1, TOTAL_COLS_)
      .setBackground(r % 2 === 0 ? '#FFFFFF' : '#F7F8FB');
  }

  // ── EDITABLE COLUMNS — subtle warm tint ────────────────────
  for (var r = 0; r < dataRowCount; r++) {
    var tint = r % 2 === 0 ? '#FFFDF7' : '#FAF8F3';
    sheet.getRange(dataStart + r, FIRST_EDITABLE_COL_, 1,
      LAST_EDITABLE_COL_ - FIRST_EDITABLE_COL_ + 1).setBackground(tint);
  }

  // ── BORDERS ────────────────────────────────────────────────
  allData.setBorder(null, null, null, null, true, true, '#E8EAED',
    SpreadsheetApp.BorderStyle.SOLID);

  // Vertical separator between RO and editable zone
  sheet.getRange(headerRow, FIRST_EDITABLE_COL_, dataRowCount + 1, 1)
    .setBorder(null, true, null, null, null, null, '#5B8DEF',
      SpreadsheetApp.BorderStyle.SOLID);

  // ── WRAP ───────────────────────────────────────────────────
  sheet.getRange(dataStart, 2, dataRowCount, 1).setWrap(true);   // Firma
  sheet.getRange(dataStart, 3, dataRowCount, 1).setWrap(true);   // Důvod
  sheet.getRange(dataStart, 11, dataRowCount, 1).setWrap(true);  // Poznámka
  sheet.getRange(dataStart, 15, dataRowCount, 1).setWrap(true);  // Shrnutí
  sheet.getRange(dataStart, 16, dataRowCount, 1).setWrap(true);  // Předmět
  sheet.getRange(dataStart, 17, dataRowCount, 1).setWrap(true);  // Zpráva

  // ── ALIGNMENT ──────────────────────────────────────────────
  sheet.getRange(dataStart, 1, dataRowCount, 1).setHorizontalAlignment('center');  // Priorita
  sheet.getRange(dataStart, 4, dataRowCount, 1).setHorizontalAlignment('center');  // Preview
  sheet.getRange(dataStart, 7, dataRowCount, 1).setHorizontalAlignment('center');  // Stav
  sheet.getRange(dataStart, 8, dataRowCount, 1).setHorizontalAlignment('center');  // Krok
  sheet.getRange(dataStart, 9, dataRowCount, 1).setHorizontalAlignment('center');  // Kontakt
  sheet.getRange(dataStart, 10, dataRowCount, 1).setHorizontalAlignment('center'); // Follow-up
  sheet.getRange(dataStart, 14, dataRowCount, 1).setHorizontalAlignment('center'); // Kanál
  sheet.getRange(dataStart, 18, dataRowCount, 1).setHorizontalAlignment('center'); // Pipeline
  sheet.getRange(dataStart, 19, dataRowCount, 1).setHorizontalAlignment('center'); // CRM

  // ── EMPHASIS ───────────────────────────────────────────────
  sheet.getRange(dataStart, 2, dataRowCount, 1).setFontSize(10).setFontWeight('bold');  // Firma
  sheet.getRange(dataStart, 7, dataRowCount, 1).setFontSize(10);  // Stav

  // Date format for contact/followup columns
  sheet.getRange(dataStart, 9, dataRowCount, 1).setNumberFormat('d.M.yyyy');
  sheet.getRange(dataStart, 10, dataRowCount, 1).setNumberFormat('d.M.yyyy');

  // ── CONDITIONAL FORMATTING ─────────────────────────────────
  var rules = [];

  // Priority
  var priR = sheet.getRange(dataStart, 1, dataRowCount, 1);
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('HIGH').setBackground('#FEF3E2').setFontColor('#92640D').setBold(true)
    .setRanges([priR]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('MEDIUM').setBackground('#EBF0F9').setFontColor('#3B5998')
    .setRanges([priR]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('LOW').setBackground('#F3F4F6').setFontColor('#9CA3AF')
    .setRanges([priR]).build());

  // Stav (human)
  var stavR = sheet.getRange(dataStart, 7, dataRowCount, 1);
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('Neosloveno').setBackground('#F3F4F6').setFontColor('#6B7280')
    .setRanges([stavR]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('P\u0159ipraveno').setBackground('#E0F2FE').setFontColor('#0369A1')
    .setRanges([stavR]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('Osloveno').setBackground('#DBEAFE').setFontColor('#1E40AF').setBold(true)
    .setRanges([stavR]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('Reagoval').setBackground('#D1FAE5').setFontColor('#065F46').setBold(true)
    .setRanges([stavR]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('Z\u00e1jem').setBackground('#A7F3D0').setFontColor('#064E3B').setBold(true)
    .setRanges([stavR]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('Nez\u00e1jem').setBackground('#FEE2E2').setFontColor('#991B1B').setBold(true)
    .setRanges([stavR]).build());

  // Preview
  var prevR = sheet.getRange(dataStart, 4, dataRowCount, 1);
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextContains('\u23f3').setFontColor('#7C3AED').setRanges([prevR]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextContains('\u2713').setFontColor('#059669').setBold(true).setRanges([prevR]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextContains('\u26a0').setFontColor('#D97706').setBold(true).setRanges([prevR]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextContains('\u2716').setFontColor('#DC2626').setBold(true).setRanges([prevR]).build());

  // Další krok
  var krokR = sheet.getRange(dataStart, 8, dataRowCount, 1);
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('Oslovit').setFontColor('#0369A1').setBold(true).setRanges([krokR]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextContains('\u010cekat').setFontColor('#6B7280').setRanges([krokR]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextContains('Domluvit').setFontColor('#065F46').setBold(true).setRanges([krokR]).build());

  sheet.setConditionalFormatRules(rules);

  // ── FILTER ─────────────────────────────────────────────────
  var filterRange = sheet.getRange(headerRow, 1, dataRowCount + 1, TOTAL_COLS_);
  var existingFilter = sheet.getFilter();
  if (existingFilter) existingFilter.remove();
  filterRange.createFilter();

  // ── HEADER NOTE ────────────────────────────────────────────
  sheet.getRange(headerRow, 1).setNote(
    'Automaticky generovan\u00fd list z hlavn\u00edho CRM.\n' +
    'Posledn\u00ed refresh: ' + new Date().toLocaleString('cs-CZ') + '\n\n' +
    'Sloupce se \u270e jsou editovateln\u00e9 \u2014 zm\u011bny se automaticky prop\u00ed\u0161\u00ed do CRM.\n' +
    'Ostatn\u00ed sloupce jsou jen ke \u010dten\u00ed.\n\n' +
    'Refresh: Menu \u2192 Autosmartweby CRM \u2192 Ke kontaktov\u00e1n\u00ed'
  );

  sheet.setTabColor('#1B2A4A');
}
