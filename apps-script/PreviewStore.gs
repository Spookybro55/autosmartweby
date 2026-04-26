/**
 * ============================================================
 *  PreviewStore.gs — Sheets-backed preview record store
 *  Load order: 4/8 (depends on Config.gs + Helpers.gs)
 *
 *  Replaces in-memory preview-store.ts on Vercel side (FF-004).
 *  Apps Script becomes the source of truth for rendered preview
 *  briefs; frontend reads via doPost 'getPreview' action with a
 *  read-through cache (TTL 5 min).
 *
 *  Sheet layout (hidden list `_previews`, 9 columns, header row 1):
 *    A slug              — primary key (preview_slug)
 *    B brief_json        — JSON-stringified PreviewBrief (B-01 contract)
 *    C template_type     — webhook template_type (B-03)
 *    D family            — resolved template family
 *    E lead_id           — reverse lookup into LEADS
 *    F preview_url       — full URL (debug + ops)
 *    G generated_at      — ISO timestamp of first INSERT (preserved on UPDATE)
 *    H last_accessed_at  — ISO timestamp of last UPDATE (read = no-op per Q5)
 *    I status            — 'active' | 'archived'
 *
 *  Public API:
 *    ensurePreviewSheet_()       idempotent — sheet exists + headers present
 *    upsertPreviewRecord_(...)   INSERT (status='active') or UPDATE
 *    getPreviewRecord_(slug)     pure read; returns record or null
 *    listPreviewRecords_()       admin debug; logs to console
 * ============================================================
 */


/* ── Schema (single source of truth) ──────────────────────────── */
var PREVIEW_SHEET_HEADERS = [
  'slug',
  'brief_json',
  'template_type',
  'family',
  'lead_id',
  'preview_url',
  'generated_at',
  'last_accessed_at',
  'status'
];

var PREVIEW_STATUS = {
  ACTIVE:   'active',
  ARCHIVED: 'archived'
};


/* ── Template family mirror (mirrors crm-frontend B-03) ───────── */
// Kept in AS so upsertPreviewRecord_ can persist `family` even when
// the frontend webhook is disabled (DRY_RUN / pilot). Logic must
// stay in lockstep with crm-frontend/src/lib/domain/template-family.ts.
var PREVIEW_KNOWN_SUFFIXES_ = [
  '-no-website',
  '-weak-website',
  '-data-conflict',
  '-basic'
];
var PREVIEW_BASE_TO_FAMILY_ = {
  'emergency-service':   'emergency',
  'plumber':             'technical-authority',
  'electrician':         'technical-authority',
  'painter':             'community-expert',
  'construction':        'community-expert',
  'gardener':            'community-expert',
  'locksmith':           'generic-local',
  'cleaning':            'generic-local',
  'auto-service':        'generic-local',
  'beauty':              'generic-local',
  'restaurant':          'generic-local',
  'local-service':       'generic-local'
};
var PREVIEW_DEFAULT_FAMILY = 'generic-local';

function resolveTemplateFamily_(templateType) {
  var raw = String(templateType == null ? '' : templateType).trim().toLowerCase();
  if (!raw) return PREVIEW_DEFAULT_FAMILY;
  var base = raw;
  for (var i = 0; i < PREVIEW_KNOWN_SUFFIXES_.length; i++) {
    var sfx = PREVIEW_KNOWN_SUFFIXES_[i];
    if (raw.length > sfx.length && raw.lastIndexOf(sfx) === raw.length - sfx.length) {
      base = raw.substring(0, raw.length - sfx.length);
      break;
    }
  }
  return PREVIEW_BASE_TO_FAMILY_[base] || PREVIEW_DEFAULT_FAMILY;
}


/* ═══════════════════════════════════════════════════════════════
   ensurePreviewSheet_ — idempotent sheet + headers + hide
   ═══════════════════════════════════════════════════════════════
   Three cases:
     (a) sheet exists with correct headers → no-op
     (b) sheet exists but empty / missing headers → write headers
     (c) sheet does not exist → create + headers + hide
   Always returns the Sheet object.
   ═══════════════════════════════════════════════════════════════ */

function ensurePreviewSheet_() {
  var ss = openCrmSpreadsheet_();
  var sheet = ss.getSheetByName(PREVIEW_SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(PREVIEW_SHEET_NAME);
    sheet.getRange(1, 1, 1, PREVIEW_SHEET_HEADERS.length).setValues([PREVIEW_SHEET_HEADERS]);
    sheet.getRange(1, 1, 1, PREVIEW_SHEET_HEADERS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
    try { sheet.hideSheet(); } catch (e) { /* hideSheet may throw if already hidden */ }
    aswLog_('INFO', 'ensurePreviewSheet_', 'Created hidden sheet ' + PREVIEW_SHEET_NAME);
    return sheet;
  }

  // Sheet exists — verify headers
  var lastCol = sheet.getLastColumn();
  if (lastCol < PREVIEW_SHEET_HEADERS.length) {
    sheet.getRange(1, 1, 1, PREVIEW_SHEET_HEADERS.length).setValues([PREVIEW_SHEET_HEADERS]);
    sheet.getRange(1, 1, 1, PREVIEW_SHEET_HEADERS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
    aswLog_('INFO', 'ensurePreviewSheet_', 'Repaired headers on existing ' + PREVIEW_SHEET_NAME);
    return sheet;
  }

  var headers = sheet.getRange(1, 1, 1, PREVIEW_SHEET_HEADERS.length).getValues()[0];
  var headersOk = true;
  for (var i = 0; i < PREVIEW_SHEET_HEADERS.length; i++) {
    if (String(headers[i] || '').trim() !== PREVIEW_SHEET_HEADERS[i]) {
      headersOk = false;
      break;
    }
  }
  if (!headersOk) {
    sheet.getRange(1, 1, 1, PREVIEW_SHEET_HEADERS.length).setValues([PREVIEW_SHEET_HEADERS]);
    sheet.getRange(1, 1, 1, PREVIEW_SHEET_HEADERS.length).setFontWeight('bold');
    aswLog_('WARN', 'ensurePreviewSheet_', 'Header mismatch — overwrote with canonical headers');
  }

  return sheet;
}


/* ═══════════════════════════════════════════════════════════════
   buildHeaderIndex_ — column number per header (1-based)
   Defensive: header order in sheet may not match canonical order
   if a previous deploy partially touched the sheet.
   ═══════════════════════════════════════════════════════════════ */

function buildPreviewHeaderIndex_(sheet) {
  var lastCol = Math.max(sheet.getLastColumn(), PREVIEW_SHEET_HEADERS.length);
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var idx = {};
  for (var i = 0; i < headers.length; i++) {
    var h = String(headers[i] || '').trim();
    if (h) idx[h] = i + 1; // 1-based for getRange
  }
  // Verify all canonical headers resolved
  for (var k = 0; k < PREVIEW_SHEET_HEADERS.length; k++) {
    if (!idx[PREVIEW_SHEET_HEADERS[k]]) {
      throw new Error('PreviewStore: missing header "' + PREVIEW_SHEET_HEADERS[k] +
        '" — call ensurePreviewSheet_() first');
    }
  }
  return idx;
}


/* ═══════════════════════════════════════════════════════════════
   findRowBySlug_ — linear scan; returns 1-based row or 0
   ═══════════════════════════════════════════════════════════════
   Volume in pilot is low (low hundreds). Linear is fine. If we
   hit performance issues we can add a slug→row Script Property
   index later.
   ═══════════════════════════════════════════════════════════════ */

function findPreviewRowBySlug_(sheet, slugCol, slug) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  var values = sheet.getRange(2, slugCol, lastRow - 1, 1).getValues();
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0] || '').trim() === slug) {
      return i + 2; // header row offset
    }
  }
  return 0;
}


/* ═══════════════════════════════════════════════════════════════
   upsertPreviewRecord_(slug, briefJson, templateType, family, leadId, previewUrl)
   ═══════════════════════════════════════════════════════════════
   Idempotent INSERT/UPDATE keyed on `slug`.
   - INSERT: status='active', generated_at=now, last_accessed_at=now
   - UPDATE: rewrite brief_json/template_type/family/lead_id/preview_url,
             update last_accessed_at=now, preserve generated_at + status.
   Locks on script-level lock for 5s to avoid concurrent cron+manual
   races on the same slug. Returns:
     { created: boolean, row: number, slug: string }
   Throws on lock failure or schema error so callers see the failure.
   ═══════════════════════════════════════════════════════════════ */

function upsertPreviewRecord_(slug, briefJson, templateType, family, leadId, previewUrl) {
  var s = String(slug || '').trim();
  if (!s) throw new Error('upsertPreviewRecord_: empty slug');

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    throw new Error('upsertPreviewRecord_: lock acquisition failed for slug=' + s);
  }

  try {
    var sheet = ensurePreviewSheet_();
    var idx = buildPreviewHeaderIndex_(sheet);
    var nowIso = new Date().toISOString();
    var existingRow = findPreviewRowBySlug_(sheet, idx.slug, s);

    if (existingRow) {
      // UPDATE — preserve generated_at + status; rewrite content + last_accessed_at
      sheet.getRange(existingRow, idx.brief_json).setValue(briefJson);
      sheet.getRange(existingRow, idx.template_type).setValue(templateType || '');
      sheet.getRange(existingRow, idx.family).setValue(family || '');
      sheet.getRange(existingRow, idx.lead_id).setValue(leadId || '');
      sheet.getRange(existingRow, idx.preview_url).setValue(previewUrl || '');
      sheet.getRange(existingRow, idx.last_accessed_at).setValue(nowIso);
      aswLog_('INFO', 'upsertPreviewRecord_',
        'UPDATE slug=' + s + ' row=' + existingRow + ' leadId=' + (leadId || ''));
      return { created: false, row: existingRow, slug: s };
    }

    // INSERT — append a new row with all 9 fields in canonical order
    var row = [];
    for (var i = 0; i < PREVIEW_SHEET_HEADERS.length; i++) {
      row.push('');
    }
    row[idx.slug - 1]              = s;
    row[idx.brief_json - 1]        = briefJson;
    row[idx.template_type - 1]     = templateType || '';
    row[idx.family - 1]            = family || '';
    row[idx.lead_id - 1]           = leadId || '';
    row[idx.preview_url - 1]       = previewUrl || '';
    row[idx.generated_at - 1]      = nowIso;
    row[idx.last_accessed_at - 1]  = nowIso;
    row[idx.status - 1]            = PREVIEW_STATUS.ACTIVE;

    sheet.appendRow(row);
    var newRow = sheet.getLastRow();
    aswLog_('INFO', 'upsertPreviewRecord_',
      'INSERT slug=' + s + ' row=' + newRow + ' leadId=' + (leadId || ''));
    return { created: true, row: newRow, slug: s };

  } finally {
    lock.releaseLock();
  }
}


/* ═══════════════════════════════════════════════════════════════
   getPreviewRecord_(slug) — pure read, no side-effects
   ═══════════════════════════════════════════════════════════════
   Returns null if slug not found, or:
     {
       slug, brief, template_type, family, lead_id, preview_url,
       generated_at, last_accessed_at, status
     }
   `brief` is parsed JSON (PreviewBrief object). Per Q5 decision,
   read does NOT touch last_accessed_at (no write side-effect).
   ═══════════════════════════════════════════════════════════════ */

function getPreviewRecord_(slug) {
  var s = String(slug || '').trim();
  if (!s) return null;

  var sheet = ensurePreviewSheet_();
  var idx = buildPreviewHeaderIndex_(sheet);
  var row = findPreviewRowBySlug_(sheet, idx.slug, s);
  if (!row) return null;

  var lastCol = sheet.getLastColumn();
  var values = sheet.getRange(row, 1, 1, lastCol).getValues()[0];

  var briefRaw = String(values[idx.brief_json - 1] || '');
  var brief = null;
  try { brief = briefRaw ? JSON.parse(briefRaw) : null; }
  catch (e) {
    aswLog_('ERROR', 'getPreviewRecord_',
      'JSON.parse failed for slug=' + s + ' err=' + e.message);
    return null;
  }

  return {
    slug: s,
    brief: brief,
    template_type: String(values[idx.template_type - 1] || ''),
    family: String(values[idx.family - 1] || ''),
    lead_id: String(values[idx.lead_id - 1] || ''),
    preview_url: String(values[idx.preview_url - 1] || ''),
    generated_at: String(values[idx.generated_at - 1] || ''),
    last_accessed_at: String(values[idx.last_accessed_at - 1] || ''),
    status: String(values[idx.status - 1] || '')
  };
}


/* ═══════════════════════════════════════════════════════════════
   listPreviewRecords_ — admin debug
   ═══════════════════════════════════════════════════════════════
   Logs counts and a 10-row preview to Logger. Not in menu (call
   from Apps Script editor manually for troubleshooting).
   ═══════════════════════════════════════════════════════════════ */

function listPreviewRecords_() {
  var sheet = ensurePreviewSheet_();
  var idx = buildPreviewHeaderIndex_(sheet);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    Logger.log('listPreviewRecords_: sheet empty (no records)');
    return [];
  }

  var lastCol = sheet.getLastColumn();
  var values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  var summary = {
    total:    values.length,
    active:   0,
    archived: 0,
    other:    0
  };
  var preview = [];

  for (var i = 0; i < values.length; i++) {
    var status = String(values[i][idx.status - 1] || '').trim();
    if (status === PREVIEW_STATUS.ACTIVE) summary.active++;
    else if (status === PREVIEW_STATUS.ARCHIVED) summary.archived++;
    else summary.other++;
    if (preview.length < 10) {
      preview.push({
        slug:             String(values[i][idx.slug - 1] || ''),
        template_type:    String(values[i][idx.template_type - 1] || ''),
        family:           String(values[i][idx.family - 1] || ''),
        lead_id:          String(values[i][idx.lead_id - 1] || ''),
        generated_at:     String(values[i][idx.generated_at - 1] || ''),
        last_accessed_at: String(values[i][idx.last_accessed_at - 1] || ''),
        status:           status
      });
    }
  }

  Logger.log('listPreviewRecords_: total=' + summary.total +
    ' active=' + summary.active + ' archived=' + summary.archived +
    ' other=' + summary.other);
  Logger.log('first 10: ' + JSON.stringify(preview, null, 2));
  return preview;
}
