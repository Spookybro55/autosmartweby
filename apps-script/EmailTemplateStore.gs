/**
 * ============================================================
 *  EmailTemplateStore.gs — _email_templates sheet helpers
 *  Load order: 4/5 (depends on Config.gs + Helpers.gs)
 *
 *  Public API (T1 scope — schema only, no business logic yet):
 *    setupEmailTemplates()        — menu-driven idempotent migration
 *    ensureEmailTemplatesSheet_() — creates sheet + headers, hidden
 *    bootstrapEmptyTemplates_()   — seeds 5 placeholder rows
 *    generateTemplateId_()        — ASW-TPL-{ts_base36}-{rand4}
 *
 *  Future tasks (T2+) will add:
 *    loadActiveTemplate_(key), saveTemplateDraft_, publishTemplate_,
 *    listAllTemplates_, listTemplateHistory_, validateTemplate_,
 *    renderTemplate_, chooseEmailTemplate_
 * ============================================================
 */


/* ═══════════════════════════════════════════════════════════════
   generateTemplateId_ — ASW-TPL-{timestamp_base36}-{rand4}
   Pattern mirrors generateLeadId_ in Helpers.gs but with TPL prefix.
   ═══════════════════════════════════════════════════════════════ */

function generateTemplateId_() {
  var ts = Date.now().toString(36);
  var rand = Math.floor(Math.random() * 65536).toString(36);
  while (rand.length < 4) rand = '0' + rand;
  return 'ASW-TPL-' + ts + '-' + rand.substring(0, 4);
}


/* ═══════════════════════════════════════════════════════════════
   ensureEmailTemplatesSheet_ — idempotent sheet + headers + hide
   ═══════════════════════════════════════════════════════════════
   Three cases (mirrors PreviewStore.gs:ensurePreviewSheet_):
     (a) sheet exists with correct headers → no-op
     (b) sheet exists but empty / missing headers → write headers
     (c) sheet does not exist → create + headers + hide
   Always returns the Sheet object.
   ═══════════════════════════════════════════════════════════════ */

function ensureEmailTemplatesSheet_() {
  var ss = openCrmSpreadsheet_();
  var sheet = ss.getSheetByName(EMAIL_TEMPLATES_SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(EMAIL_TEMPLATES_SHEET_NAME);
    sheet.getRange(1, 1, 1, EMAIL_TEMPLATES_SHEET_HEADERS.length)
      .setValues([EMAIL_TEMPLATES_SHEET_HEADERS]);
    sheet.getRange(1, 1, 1, EMAIL_TEMPLATES_SHEET_HEADERS.length)
      .setFontWeight('bold');
    sheet.setFrozenRows(1);
    try { sheet.hideSheet(); } catch (e) { /* ok if already hidden */ }
    aswLog_('INFO', 'ensureEmailTemplatesSheet_',
      'Created hidden sheet ' + EMAIL_TEMPLATES_SHEET_NAME);
    return sheet;
  }

  // Sheet exists — verify headers
  var lastCol = sheet.getLastColumn();
  if (lastCol < EMAIL_TEMPLATES_SHEET_HEADERS.length) {
    sheet.getRange(1, 1, 1, EMAIL_TEMPLATES_SHEET_HEADERS.length)
      .setValues([EMAIL_TEMPLATES_SHEET_HEADERS]);
    sheet.getRange(1, 1, 1, EMAIL_TEMPLATES_SHEET_HEADERS.length)
      .setFontWeight('bold');
    sheet.setFrozenRows(1);
    aswLog_('INFO', 'ensureEmailTemplatesSheet_',
      'Repaired headers on existing ' + EMAIL_TEMPLATES_SHEET_NAME);
    return sheet;
  }

  var headers = sheet.getRange(1, 1, 1, EMAIL_TEMPLATES_SHEET_HEADERS.length)
    .getValues()[0];
  var headersOk = true;
  for (var i = 0; i < EMAIL_TEMPLATES_SHEET_HEADERS.length; i++) {
    if (String(headers[i] || '').trim() !== EMAIL_TEMPLATES_SHEET_HEADERS[i]) {
      headersOk = false;
      break;
    }
  }
  if (!headersOk) {
    sheet.getRange(1, 1, 1, EMAIL_TEMPLATES_SHEET_HEADERS.length)
      .setValues([EMAIL_TEMPLATES_SHEET_HEADERS]);
    sheet.getRange(1, 1, 1, EMAIL_TEMPLATES_SHEET_HEADERS.length)
      .setFontWeight('bold');
    aswLog_('WARN', 'ensureEmailTemplatesSheet_',
      'Header mismatch — overwrote with canonical headers');
  }

  return sheet;
}


/* ═══════════════════════════════════════════════════════════════
   bootstrapEmptyTemplates_ — seed 5 placeholder rows on first run
   ═══════════════════════════════════════════════════════════════
   Idempotent: only writes rows for template_keys that don't already
   have ANY row in the sheet. Status='empty', version=0.
   These will be promoted to v1 on first publish via T2's
   publishTemplate_.
   Returns count of rows added.
   ═══════════════════════════════════════════════════════════════ */

function bootstrapEmptyTemplates_() {
  var sheet = ensureEmailTemplatesSheet_();
  var lastRow = sheet.getLastRow();

  // Read existing template_keys (column 2) to avoid duplicates
  var existingKeys = {};
  if (lastRow > 1) {
    var keyCol = sheet.getRange(2, 2, lastRow - 1, 1).getValues();
    for (var i = 0; i < keyCol.length; i++) {
      var k = String(keyCol[i][0] || '').trim();
      if (k) existingKeys[k] = true;
    }
  }

  var nowIso = new Date().toISOString();
  var actor = (Session.getActiveUser().getEmail() || 'system').toLowerCase();

  var rowsToAdd = [];
  for (var i = 0; i < EMAIL_TEMPLATE_DEFAULT_KEYS.length; i++) {
    var key = EMAIL_TEMPLATE_DEFAULT_KEYS[i];
    if (existingKeys[key]) continue;

    var templateId = generateTemplateId_();
    rowsToAdd.push([
      templateId,    // template_id
      key,           // template_key
      0,             // version (0 = empty placeholder)
      key,           // name (placeholder; admin renames in UI later)
      '',            // description
      '',            // subject_template
      '',            // body_template
      '',            // placeholders_used
      'empty',       // status
      '',            // commit_message
      nowIso,        // created_at
      actor,         // created_by
      '',            // activated_at
      '',            // activated_by
      '',            // archived_at
      ''             // parent_template_id
    ]);
  }

  if (rowsToAdd.length === 0) {
    aswLog_('INFO', 'bootstrapEmptyTemplates_',
      'All ' + EMAIL_TEMPLATE_DEFAULT_KEYS.length +
      ' default keys already seeded — nothing to add');
    return 0;
  }

  var startRow = lastRow + 1;
  sheet.getRange(startRow, 1, rowsToAdd.length, EMAIL_TEMPLATES_SHEET_HEADERS.length)
    .setValues(rowsToAdd);

  aswLog_('INFO', 'bootstrapEmptyTemplates_',
    'Seeded ' + rowsToAdd.length + ' empty template placeholders: ' +
    rowsToAdd.map(function(r) { return r[1]; }).join(', '));

  return rowsToAdd.length;
}


/* ═══════════════════════════════════════════════════════════════
   setupEmailTemplates — public menu entry point
   ═══════════════════════════════════════════════════════════════
   Run from spreadsheet menu after first deploy. Idempotent:
     - Creates _email_templates sheet if missing
     - Adds 4 LEADS extension columns if missing (via setupPreviewExtension)
     - Seeds empty placeholder rows for default template keys
   Shows safeAlert_ summary of what changed.
   ═══════════════════════════════════════════════════════════════ */

function setupEmailTemplates() {
  // Step 1: ensure LEADS extension columns are in place.
  // setupPreviewExtension is the canonical migration runner — calling
  // it here picks up the 4 new B-13 columns added to EXTENSION_COLUMNS.
  setupPreviewExtension();

  // Step 2: ensure _email_templates sheet exists with correct schema.
  ensureEmailTemplatesSheet_();

  // Step 3: seed empty placeholders for default keys.
  var added = bootstrapEmptyTemplates_();

  var msg = '_email_templates sheet ready.\n\n' +
    'Default template keys: ' + EMAIL_TEMPLATE_DEFAULT_KEYS.join(', ') + '\n' +
    'Empty placeholders added this run: ' + added + '\n\n' +
    'LEADS extension columns refreshed via setupPreviewExtension.';

  aswLog_('INFO', 'setupEmailTemplates', msg.replace(/\n/g, ' | '));
  safeAlert_(msg);
}
