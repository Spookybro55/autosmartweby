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


/* ═══════════════════════════════════════════════════════════════
   buildTemplateRowMap_ — column index helper
   Mirrors PreviewStore.gs buildHeaderIndex_ pattern. Returns map
   of header_name → 1-based column index.
   ═══════════════════════════════════════════════════════════════ */

function buildTemplateRowMap_() {
  var map = {};
  for (var i = 0; i < EMAIL_TEMPLATES_SHEET_HEADERS.length; i++) {
    map[EMAIL_TEMPLATES_SHEET_HEADERS[i]] = i + 1;
  }
  return map;
}


/* ═══════════════════════════════════════════════════════════════
   rowToTemplate_ — convert sheet row array to typed object
   Returns null if row[0] (template_id) is empty.
   ═══════════════════════════════════════════════════════════════ */

function rowToTemplate_(row, rowNum) {
  if (!row || !row[0]) return null;
  return {
    template_id:        String(row[0] || ''),
    template_key:       String(row[1] || ''),
    version:            Number(row[2] || 0),
    name:               String(row[3] || ''),
    description:        String(row[4] || ''),
    subject_template:   String(row[5] || ''),
    body_template:      String(row[6] || ''),
    placeholders_used:  String(row[7] || ''),
    status:             String(row[8] || ''),
    commit_message:     String(row[9] || ''),
    created_at:         row[10] ? String(row[10]) : '',
    created_by:         String(row[11] || ''),
    activated_at:       row[12] ? String(row[12]) : '',
    activated_by:       String(row[13] || ''),
    archived_at:        row[14] ? String(row[14]) : '',
    parent_template_id: String(row[15] || ''),
    _rowNum:            rowNum  // 1-based, for in-place updates
  };
}


/* ═══════════════════════════════════════════════════════════════
   extractPlaceholders_ — find {placeholder_name} tokens in text
   Returns sorted unique array of placeholder names (without braces).
   Used for placeholders_used CSV computation.
   ═══════════════════════════════════════════════════════════════ */

function extractPlaceholders_(text) {
  if (!text) return [];
  var seen = {};
  var matches = String(text).match(/\{([a-z_][a-z0-9_]*)\}/gi) || [];
  for (var i = 0; i < matches.length; i++) {
    var name = matches[i].slice(1, -1).toLowerCase();
    seen[name] = true;
  }
  return Object.keys(seen).sort();
}


/* ═══════════════════════════════════════════════════════════════
   listAllTemplates_ — returns all rows as objects
   Filters out empty rows. Order: sheet order (= insertion order).
   No pagination — _email_templates is small (<100 rows expected).
   ═══════════════════════════════════════════════════════════════ */

function listAllTemplates_() {
  var sheet = ensureEmailTemplatesSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  var range = sheet.getRange(2, 1, lastRow - 1, EMAIL_TEMPLATES_SHEET_HEADERS.length);
  var values = range.getValues();
  var out = [];
  for (var i = 0; i < values.length; i++) {
    var t = rowToTemplate_(values[i], i + 2);
    if (t) out.push(t);
  }
  return out;
}


/* ═══════════════════════════════════════════════════════════════
   loadActiveTemplate_(key) — returns active template for given key
   Throws Error if no active template exists for key (caller must
   handle, e.g. composeDraft_ falls back to hardcoded text).
   ═══════════════════════════════════════════════════════════════ */

function loadActiveTemplate_(key) {
  var k = String(key || '').trim();
  if (!k) throw new Error('loadActiveTemplate_: empty key');

  var all = listAllTemplates_();
  for (var i = 0; i < all.length; i++) {
    if (all[i].template_key === k && all[i].status === 'active') {
      return all[i];
    }
  }
  throw new Error('No active template for key: ' + k);
}


/* ═══════════════════════════════════════════════════════════════
   getTemplateDraft_(key) — returns draft for given key, or null
   ═══════════════════════════════════════════════════════════════ */

function getTemplateDraft_(key) {
  var k = String(key || '').trim();
  if (!k) return null;

  var all = listAllTemplates_();
  for (var i = 0; i < all.length; i++) {
    if (all[i].template_key === k && all[i].status === 'draft') {
      return all[i];
    }
  }
  return null;
}


/* ═══════════════════════════════════════════════════════════════
   listTemplateHistory_(key) — all rows for key, newest version first
   Includes: empty placeholder, draft (if any), active, archived.
   ═══════════════════════════════════════════════════════════════ */

function listTemplateHistory_(key) {
  var k = String(key || '').trim();
  if (!k) return [];

  var all = listAllTemplates_();
  var matching = [];
  for (var i = 0; i < all.length; i++) {
    if (all[i].template_key === k) matching.push(all[i]);
  }
  matching.sort(function(a, b) {
    // Status priority: draft > active > archived > empty
    var statusOrder = { draft: 0, active: 1, archived: 2, empty: 3 };
    var sa = statusOrder[a.status] !== undefined ? statusOrder[a.status] : 99;
    var sb = statusOrder[b.status] !== undefined ? statusOrder[b.status] : 99;
    if (sa !== sb) return sa - sb;
    return b.version - a.version;  // newest first within same status
  });
  return matching;
}


/* ═══════════════════════════════════════════════════════════════
   saveTemplateDraft_(key, subject, body, name, description) — upsert draft
   ═══════════════════════════════════════════════════════════════
   Behaviour:
     - If draft exists for key → overwrite subject/body/name/desc, refresh
       updated_at via created_at column (we don't track separate updated_at
       to keep schema flat; created_at is "when this draft started")
     - If no draft → insert new row with status='draft', version=0,
       parent_template_id = current active template_id (if any)
   1 draft per template_key invariant — never creates a second draft row.

   Uses LockService to prevent concurrent draft writes from racing.
   Returns the saved draft template object.
   ═══════════════════════════════════════════════════════════════ */

function saveTemplateDraft_(key, subject, body, name, description) {
  var k = String(key || '').trim();
  if (!k) throw new Error('saveTemplateDraft_: empty key');

  // Validate key is a known default key (defensive — frontend shouldn't
  // ever send arbitrary keys but guard against typo / injection)
  var validKey = false;
  for (var i = 0; i < EMAIL_TEMPLATE_DEFAULT_KEYS.length; i++) {
    if (EMAIL_TEMPLATE_DEFAULT_KEYS[i] === k) { validKey = true; break; }
  }
  if (!validKey) throw new Error('Unknown template key: ' + k);

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    throw new Error('Could not acquire lock for saveTemplateDraft_');
  }

  try {
    var sheet = ensureEmailTemplatesSheet_();
    var nowIso = new Date().toISOString();
    var actor = (Session.getActiveUser().getEmail() || 'system').toLowerCase();
    var subjStr = String(subject == null ? '' : subject);
    var bodyStr = String(body == null ? '' : body);
    var nameStr = String(name == null ? '' : name);
    var descStr = String(description == null ? '' : description);
    var placeholders = extractPlaceholders_(subjStr + ' ' + bodyStr).join(',');

    // Find existing draft for this key
    var existing = getTemplateDraft_(k);

    if (existing) {
      // Overwrite in place — keep template_id, created_at, created_by stable
      var rowNum = existing._rowNum;
      var map = buildTemplateRowMap_();
      sheet.getRange(rowNum, map['name']).setValue(nameStr || existing.name);
      sheet.getRange(rowNum, map['description']).setValue(descStr || existing.description);
      sheet.getRange(rowNum, map['subject_template']).setValue(subjStr);
      sheet.getRange(rowNum, map['body_template']).setValue(bodyStr);
      sheet.getRange(rowNum, map['placeholders_used']).setValue(placeholders);
      // Refresh created_at to mark "draft last touched at"
      sheet.getRange(rowNum, map['created_at']).setValue(nowIso);
      sheet.getRange(rowNum, map['created_by']).setValue(actor);

      aswLog_('INFO', 'saveTemplateDraft_',
        'Updated draft for ' + k + ' (template_id=' + existing.template_id + ')');

      // Return refreshed object
      var refreshed = getTemplateDraft_(k);
      return refreshed;
    }

    // New draft — find current active to reference as parent
    var parentId = '';
    try {
      var current = loadActiveTemplate_(k);
      parentId = current.template_id;
    } catch (e) {
      // No active yet (first publish for this key) — parent stays empty
      parentId = '';
    }

    var newRow = [
      generateTemplateId_(),  // template_id
      k,                      // template_key
      0,                      // version (0 = draft, gets bumped on publish)
      nameStr,                // name
      descStr,                // description
      subjStr,                // subject_template
      bodyStr,                // body_template
      placeholders,           // placeholders_used
      'draft',                // status
      '',                     // commit_message (set on publish)
      nowIso,                 // created_at
      actor,                  // created_by
      '',                     // activated_at
      '',                     // activated_by
      '',                     // archived_at
      parentId                // parent_template_id
    ];

    sheet.appendRow(newRow);

    aswLog_('INFO', 'saveTemplateDraft_',
      'Created new draft for ' + k + ' (parent=' + (parentId || 'none') + ')');

    return getTemplateDraft_(k);

  } finally {
    lock.releaseLock();
  }
}


/* ═══════════════════════════════════════════════════════════════
   discardTemplateDraft_(key) — delete draft row for key
   No-op if no draft exists.
   Returns true if a draft was deleted, false otherwise.
   ═══════════════════════════════════════════════════════════════ */

function discardTemplateDraft_(key) {
  var k = String(key || '').trim();
  if (!k) return false;

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    throw new Error('Could not acquire lock for discardTemplateDraft_');
  }

  try {
    var draft = getTemplateDraft_(k);
    if (!draft) return false;

    var sheet = ensureEmailTemplatesSheet_();
    sheet.deleteRow(draft._rowNum);

    aswLog_('INFO', 'discardTemplateDraft_',
      'Deleted draft for ' + k + ' (template_id=' + draft.template_id + ')');
    return true;

  } finally {
    lock.releaseLock();
  }
}


/* ═══════════════════════════════════════════════════════════════
   publishTemplate_(key, commitMessage) — promote draft to active
   ═══════════════════════════════════════════════════════════════
   Steps (atomic-ish via LockService):
     1. Validate: draft exists, commitMessage >= 5 chars, draft has
        non-empty subject AND body
     2. Determine new version number: max(version) for key + 1
        (handles empty placeholder version=0 → first publish becomes v1)
     3. If existing active for key: flip its status to 'archived',
        set archived_at = now
     4. If existing empty placeholder for key (version=0, status=empty):
        delete it (it served its purpose as a slot reservation)
     5. Update draft row: version = new, status = 'active',
        commit_message = commitMessage, activated_at = now,
        activated_by = actor
     Throws on any validation failure; partial state cleanup not needed
     because nothing has been mutated until step 3.
   Returns the published template object.
   ═══════════════════════════════════════════════════════════════ */

function publishTemplate_(key, commitMessage) {
  var k = String(key || '').trim();
  if (!k) throw new Error('publishTemplate_: empty key');
  var msg = String(commitMessage == null ? '' : commitMessage).trim();
  if (msg.length < 5) {
    throw new Error('Commit message required (min 5 chars), got: "' + msg + '"');
  }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    throw new Error('Could not acquire lock for publishTemplate_');
  }

  try {
    var draft = getTemplateDraft_(k);
    if (!draft) throw new Error('No draft to publish for key: ' + k);
    if (!draft.subject_template || !draft.body_template) {
      throw new Error('Draft has empty subject or body — cannot publish');
    }

    var sheet = ensureEmailTemplatesSheet_();
    var map = buildTemplateRowMap_();
    var nowIso = new Date().toISOString();
    var actor = (Session.getActiveUser().getEmail() || 'system').toLowerCase();

    // Determine new version
    var history = listTemplateHistory_(k);
    var maxVersion = 0;
    var existingActiveRowNum = null;
    var existingEmptyRowNum = null;
    for (var i = 0; i < history.length; i++) {
      var t = history[i];
      if (t.version > maxVersion) maxVersion = t.version;
      if (t.status === 'active') existingActiveRowNum = t._rowNum;
      if (t.status === 'empty') existingEmptyRowNum = t._rowNum;
    }
    var newVersion = maxVersion + 1;
    if (newVersion < 1) newVersion = 1;  // safety

    // Step 3: archive existing active (if any)
    if (existingActiveRowNum) {
      sheet.getRange(existingActiveRowNum, map['status']).setValue('archived');
      sheet.getRange(existingActiveRowNum, map['archived_at']).setValue(nowIso);
    }

    // Step 4: delete empty placeholder (if any) — the published row
    // takes its slot in the conceptual list
    if (existingEmptyRowNum) {
      // Re-resolve rowNum after potential row 3 archive, since deleteRow
      // shifts indices. listTemplateHistory_ was called BEFORE archive
      // mutation, so rowNum is still correct (archive doesn't shift rows).
      sheet.deleteRow(existingEmptyRowNum);
      // After delete, draft._rowNum may have shifted if empty was above it
      if (existingEmptyRowNum < draft._rowNum) {
        draft._rowNum = draft._rowNum - 1;
      }
      if (existingActiveRowNum && existingEmptyRowNum < existingActiveRowNum) {
        // (only relevant if we wanted to touch active again — we don't)
      }
    }

    // Step 5: promote draft to active
    sheet.getRange(draft._rowNum, map['version']).setValue(newVersion);
    sheet.getRange(draft._rowNum, map['status']).setValue('active');
    sheet.getRange(draft._rowNum, map['commit_message']).setValue(msg);
    sheet.getRange(draft._rowNum, map['activated_at']).setValue(nowIso);
    sheet.getRange(draft._rowNum, map['activated_by']).setValue(actor);

    aswLog_('INFO', 'publishTemplate_',
      'Published ' + k + ' v' + newVersion +
      ' (template_id=' + draft.template_id + ', commit="' + msg + '")');

    // Re-read for fresh object
    return loadActiveTemplate_(k);

  } finally {
    lock.releaseLock();
  }
}


/* ═══════════════════════════════════════════════════════════════
   renderTemplate_ — substitute {placeholder} tokens with lead data
   ═══════════════════════════════════════════════════════════════
   Input:
     template: object with subject_template + body_template strings
     leadData: object with normalized lead fields
   Output:
     { subject, body } — both strings, all placeholders substituted
   Behaviour:
     - Unknown placeholder → empty string (graceful)
     - Empty value → empty string (no "undefined", no leftover braces)
     - Case-insensitive placeholder names ({Business_Name} == {business_name})
     - Special computed placeholders (greeting, firm_ref, contact_name_comma)
       resolve via internal helpers — these are convenience tokens that
       wrap common conditional logic (greeting always works, firm_ref
       falls back, contact_name_comma adds ", {name}" or "" gracefully)

   Supported placeholders (T3 set — frozen for now):
     LEAD: business_name, contact_name, city, area, service_type,
           segment, pain_point
     PREVIEW: preview_url
     SENDER: sender_name, sender_email
     COMPUTED: greeting, firm_ref, contact_name_comma

   Future: phone, email, location_phrase, context_phrase (as needed)
   ═══════════════════════════════════════════════════════════════ */

function renderTemplate_(template, leadData) {
  if (!template) throw new Error('renderTemplate_: null template');
  var subj = String(template.subject_template || '');
  var body = String(template.body_template || '');
  var ld = leadData || {};

  var values = buildPlaceholderValues_(ld);

  function replacer(match, name) {
    var key = String(name || '').toLowerCase();
    return Object.prototype.hasOwnProperty.call(values, key)
      ? String(values[key] == null ? '' : values[key])
      : '';
  }

  var re = /\{([a-z_][a-z0-9_]*)\}/gi;
  return {
    subject: subj.replace(re, replacer),
    body:    body.replace(re, replacer)
  };
}


/* ═══════════════════════════════════════════════════════════════
   buildPlaceholderValues_ — flatten leadData into placeholder map
   ═══════════════════════════════════════════════════════════════
   Internal helper. Resolves both raw fields and computed convenience
   placeholders. Lowercase keys.
   ═══════════════════════════════════════════════════════════════ */

function buildPlaceholderValues_(ld) {
  var businessName = String(ld.business_name || '').trim();
  var contactName = String(ld.contact_name || '').trim();
  var city = String(ld.city || '').trim();
  var area = String(ld.area || '').trim();
  var serviceType = String(ld.service_type || '').trim();
  var segment = String(ld.segment || '').trim();
  var painPoint = String(ld.pain_point || '').trim();
  var previewUrl = String(ld.preview_url || '').trim();

  // Sender block — split fields for granular template control
  var senderName = String(ld.sender_name || '').trim();
  var senderRole = String(ld.sender_role || '').trim();
  var senderPhone = String(ld.sender_phone || '').trim();
  var senderEmail = String(ld.sender_email || '').trim();
  var senderEmailDisplay = String(ld.sender_email_display || senderEmail).trim();
  var senderWeb = String(ld.sender_web || '').trim();

  // Computed convenience
  var greeting = contactName ? ('Dobrý den, ' + contactName) : 'Dobrý den';
  var firmRef = businessName || 'vaši firmu';
  var contactNameComma = contactName ? (', ' + contactName) : '';

  // service_type_humanized: "instalatér" → "instalatérské služby"
  // Defensive: if humanizeServiceType_ helper isn't loaded for any reason,
  // fall back to raw service_type.
  var serviceTypeHumanized = serviceType;
  if (serviceType && typeof humanizeServiceType_ === 'function') {
    try {
      serviceTypeHumanized = humanizeServiceType_(serviceType) || serviceType;
    } catch (e) {
      serviceTypeHumanized = serviceType;
    }
  }

  return {
    business_name:           businessName,
    contact_name:            contactName,
    city:                    city,
    area:                    area,
    service_type:            serviceType,
    service_type_humanized:  serviceTypeHumanized,
    segment:                 segment,
    pain_point:              painPoint,
    preview_url:             previewUrl,
    sender_name:             senderName,
    sender_role:             senderRole,
    sender_phone:            senderPhone,
    sender_email:            senderEmail,
    sender_email_display:    senderEmailDisplay,
    sender_web:              senderWeb,
    greeting:                greeting,
    firm_ref:                firmRef,
    contact_name_comma:      contactNameComma
  };
}


/* ═══════════════════════════════════════════════════════════════
   chooseEmailTemplate_ — auto-select template key from lead data
   ═══════════════════════════════════════════════════════════════
   Routing logic (T3 — initial, will expand with more keys):
     - resolveWebsiteState_ === 'NO_WEBSITE'   → 'no-website'
     - resolveWebsiteState_ === 'WEAK_WEBSITE' → 'weak-website'
     - resolveWebsiteState_ === 'HAS_WEBSITE'  → 'has-website'
     - default (CONFLICT, UNKNOWN, anything else) → 'no-website'
       (safest default — matches the current cautious fallback in
       hardcoded composeDraft_)

   Follow-up keys (follow-up-1, follow-up-2) are NOT chosen automatically
   here — they're triggered by lifecycle/follow-up scheduler (future task,
   not T3). For initial outreach, this returns one of the 3 web-state keys.

   Returns: string key from EMAIL_TEMPLATE_DEFAULT_KEYS
   Never throws. Caller (composeDraft_) decides what to do if the
   returned key has no active template (fallback to hardcoded).
   ═══════════════════════════════════════════════════════════════ */

function chooseEmailTemplate_(leadData) {
  var rd = leadData || {};
  var state;
  try {
    state = resolveWebsiteState_(rd);
  } catch (e) {
    state = 'UNKNOWN';
  }

  if (state === 'NO_WEBSITE')   return 'no-website';
  if (state === 'WEAK_WEBSITE') return 'weak-website';
  if (state === 'HAS_WEBSITE')  return 'has-website';
  // CONFLICT, UNKNOWN, or anything unexpected → safest default
  return 'no-website';
}


/* ═══════════════════════════════════════════════════════════════
   bootstrapNoWebsiteV1 — seed first real template via Drafts+Publish
   ═══════════════════════════════════════════════════════════════
   Manual-run migration. Idempotent — checks if no-website already
   has an active version, no-op if yes.

   Steps:
     1. If active no-website exists → no-op, alert user
     2. saveTemplateDraft_ s finálním textem
     3. publishTemplate_ s commit msg "Initial port from approved
        copy v1.0 (Phase 2 launch)"
     4. Alert s confirmaci

   Run from menu after T3+T4 deploy. Once published, composeDraft_
   stops falling back to composeDraftFallback_ for has_website=false
   leads.
   ═══════════════════════════════════════════════════════════════ */

function bootstrapNoWebsiteV1() {
  // Idempotence check
  try {
    var existing = loadActiveTemplate_('no-website');
    if (existing) {
      var msg = 'no-website už má aktivní verzi (v' + existing.version + ').\n' +
        'Pokud chceš nahradit, edituj ji ve frontend UI.\n\n' +
        'Aktivní template_id: ' + existing.template_id;
      aswLog_('INFO', 'bootstrapNoWebsiteV1', 'No-op — active version exists');
      safeAlert_(msg);
      return;
    }
  } catch (e) {
    // No active — proceed to bootstrap
  }

  var subject = 'Dotaz k vašemu webu {business_name}';

  // Body — exact text per stakeholder approval (Phase 2 launch v1.0)
  var body =
    'Dobrý den,\n' +
    '\n' +
    'při hledání {service_type_humanized} v {city} jsem narazil na vaši firmu a zkusil jsem připravit krátký návrh, jak by mohl vypadat jednoduchý web pro {business_name}.\n' +
    '\n' +
    'Pracovní náhled otevřete tady:\n' +
    '{preview_url}\n' +
    '\n' +
    'Cílem je, aby zákazník na mobilu rychle viděl vaše služby, lokalitu a mohl vám rovnou zavolat. Takový hotový web stojí 8 900 Kč a běžně je hotový do 3–5 pracovních dní od dodání podkladů.\n' +
    '\n' +
    'Dává vám smysl, abych vám poslal celou proklikávací verzi?\n' +
    '\n' +
    '{sender_name}\n' +
    '{sender_role}\n' +
    'Autosmartweby — kvalitní weby a dlouhodobá péče pro malé firmy\n' +
    '{sender_web} | {sender_phone}\n' +
    '\n' +
    'Pokud to pro vás není aktuální, stačí odepsat „Ne" a nebudu vás dál kontaktovat.';

  var name = 'No website — initial outreach';
  var description = 'První oslovení firem bez webu. Nabízí preview + cenový anchor 8 900 Kč. Soft opt-out v patičce.';

  saveTemplateDraft_('no-website', subject, body, name, description);
  var published = publishTemplate_('no-website',
    'Initial port from approved copy v1.0 (Phase 2 launch)');

  var msg2 = 'no-website v' + published.version + ' published.\n\n' +
    'template_id: ' + published.template_id + '\n' +
    'placeholders_used: ' + published.placeholders_used + '\n\n' +
    'composeDraft_ teď používá tuto šablonu pro has_website=false leady.';

  aswLog_('INFO', 'bootstrapNoWebsiteV1', msg2.replace(/\n/g, ' | '));
  safeAlert_(msg2);
}


/* ═══════════════════════════════════════════════════════════════
   migrateLegacyAssigneeEmails_ — one-shot remap old keys to new
   ═══════════════════════════════════════════════════════════════
   Scans LEADS for rows whose assignee_email matches a key in
   LEGACY_ASSIGNEE_EMAIL_MAP and rewrites it to the canonical
   replacement.

   Idempotent: re-running after migration is a no-op (no rows
   match because all previous matches were rewritten).

   Empty / null assignee cells are NEVER touched (unassigned is
   valid). Only rewrites cells that exactly match a legacy key
   (case-insensitive, trimmed comparison).

   Returns count of rows updated. Always uses LockService.
   ═══════════════════════════════════════════════════════════════ */

function migrateLegacyAssigneeEmails_() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    throw new Error('Could not acquire lock for migrateLegacyAssigneeEmails_');
  }

  try {
    var ss = openCrmSpreadsheet_();
    var sheet = getExternalSheet_(ss);
    var hr = getHeaderResolver_(sheet);
    var assigneeCol = hr.colOrNull('assignee_email');
    if (!assigneeCol) {
      aswLog_('WARN', 'migrateLegacyAssigneeEmails_',
        'assignee_email column not found — nothing to migrate');
      return 0;
    }

    var lastRow = sheet.getLastRow();
    if (lastRow < DATA_START_ROW) return 0;

    var numRows = lastRow - DATA_START_ROW + 1;
    var range = sheet.getRange(DATA_START_ROW, assigneeCol, numRows, 1);
    var values = range.getValues();

    var migrated = 0;
    var perMappingCount = {};
    for (var i = 0; i < values.length; i++) {
      var raw = values[i][0];
      if (raw == null) continue;
      var key = String(raw).trim().toLowerCase();
      if (!key) continue;
      if (Object.prototype.hasOwnProperty.call(LEGACY_ASSIGNEE_EMAIL_MAP, key)) {
        var newKey = LEGACY_ASSIGNEE_EMAIL_MAP[key];
        values[i][0] = newKey;
        migrated++;
        perMappingCount[key] = (perMappingCount[key] || 0) + 1;
      }
    }

    if (migrated > 0) {
      range.setValues(values);
    }

    var summary = 'Migrated ' + migrated + ' rows. Per-mapping: ' +
      JSON.stringify(perMappingCount);
    aswLog_('INFO', 'migrateLegacyAssigneeEmails_', summary);
    return migrated;

  } finally {
    lock.releaseLock();
  }
}


/* ═══════════════════════════════════════════════════════════════
   migrateAndBootstrap — convenience menu wrapper
   ═══════════════════════════════════════════════════════════════
   Combines: migrate legacy assignee emails → ensure templates
   schema → bootstrap no-website v1. Run this single menu item
   instead of three separate ones for clean cutover.
   ═══════════════════════════════════════════════════════════════ */

function migrateAndBootstrap() {
  var migrated = migrateLegacyAssigneeEmails_();
  setupEmailTemplates();
  // bootstrapNoWebsiteV1 is idempotent — safe to re-run
  try {
    bootstrapNoWebsiteV1();
  } catch (e) {
    aswLog_('WARN', 'migrateAndBootstrap',
      'Bootstrap failed (may already be active): ' + e.message);
  }
  safeAlert_('Migrate + bootstrap done.\n' +
    'Legacy assignees migrated: ' + migrated + '\n' +
    'See Apps Script logs for details.');
}


/* ═══════════════════════════════════════════════════════════════
   getTemplateAnalytics_ — live aggregation per template version
   ═══════════════════════════════════════════════════════════════
   Iterates LEADS once, groups by (email_template_key, email_template_version,
   email_segment_at_send), counts:
     - sent:    rows where email_sync_status IN [SENT, REPLIED, LINKED]
                AND email_template_id is not empty (filters out fallback drafts)
     - replied: subset of sent where email_reply_type === 'REPLY'
     - won:     subset of sent where status === 'WON'

   Returns array of {
     template_key, template_version, template_id, name, status,
     totals: { sent, replied, won },
     by_segment: { [segment]: { sent, replied, won }, ... }
   }, one entry per template VERSION found in LEADS data + every
   currently-active template (even if 0 sends — that's the empty state).

   Live read — no cache. ~50ms for 800 rows expected.
   ═══════════════════════════════════════════════════════════════ */

function getTemplateAnalytics_() {
  var ss = openCrmSpreadsheet_();
  var sheet = getExternalSheet_(ss);
  var hr = getHeaderResolver_(sheet);

  // Required columns for analytics — return empty if migration hasn't run
  var keyCol     = hr.colOrNull('email_template_key');
  var versionCol = hr.colOrNull('email_template_version');
  var idCol      = hr.colOrNull('email_template_id');
  var segCol     = hr.colOrNull('email_segment_at_send');
  var syncCol    = hr.colOrNull('email_sync_status');
  var replyCol   = hr.colOrNull('email_reply_type');
  var statusCol  = hr.colOrNull('status');

  if (!keyCol || !versionCol || !syncCol) {
    aswLog_('WARN', 'getTemplateAnalytics_',
      'Required columns missing — returning empty result');
    return _emptyAnalyticsForAllActiveTemplates_();
  }

  var lastRow = sheet.getLastRow();
  if (lastRow < DATA_START_ROW) {
    return _emptyAnalyticsForAllActiveTemplates_();
  }

  var numRows = lastRow - DATA_START_ROW + 1;
  // Fetch only the columns we need — minimize range size
  var needed = [keyCol, versionCol, idCol, segCol, syncCol, replyCol, statusCol]
    .filter(function(c) { return c != null; });
  needed.sort(function(a, b) { return a - b; });
  var minCol = needed[0];
  var maxCol = needed[needed.length - 1];
  var width = maxCol - minCol + 1;

  var values = sheet.getRange(DATA_START_ROW, minCol, numRows, width).getValues();

  // Helper to read a cell from the fetched range using sheet column index
  function cell(rowArr, sheetCol) {
    if (sheetCol == null) return '';
    return rowArr[sheetCol - minCol];
  }

  var SENT_STATUSES = { 'SENT': 1, 'REPLIED': 1, 'LINKED': 1 };

  // groups: key = "templateKey::version" → { template_id, totals, by_segment }
  var groups = {};

  for (var i = 0; i < values.length; i++) {
    var r = values[i];
    var syncStatus = String(cell(r, syncCol) || '').trim().toUpperCase();
    if (!SENT_STATUSES[syncStatus]) continue;

    var tplId = String(cell(r, idCol) || '').trim();
    if (!tplId) continue;  // fallback drafts (no template) excluded

    var tplKey = String(cell(r, keyCol) || '').trim();
    var tplVersion = String(cell(r, versionCol) || '').trim();
    if (!tplKey || !tplVersion) continue;

    var seg = String(cell(r, segCol) || '').trim() || '(unknown)';
    var replyType = String(cell(r, replyCol) || '').trim().toUpperCase();
    var leadStatus = String(cell(r, statusCol) || '').trim().toUpperCase();

    var groupKey = tplKey + '::' + tplVersion;
    if (!groups[groupKey]) {
      groups[groupKey] = {
        template_key:     tplKey,
        template_version: Number(tplVersion) || 0,
        template_id:      tplId,
        totals:           { sent: 0, replied: 0, won: 0 },
        by_segment:       {}
      };
    }
    var g = groups[groupKey];
    if (!g.by_segment[seg]) {
      g.by_segment[seg] = { sent: 0, replied: 0, won: 0 };
    }

    g.totals.sent++;
    g.by_segment[seg].sent++;
    if (replyType === 'REPLY') {
      g.totals.replied++;
      g.by_segment[seg].replied++;
    }
    if (leadStatus === 'WON') {
      g.totals.won++;
      g.by_segment[seg].won++;
    }
  }

  // Enrich with template metadata (name, status) from _email_templates
  var allTemplates = listAllTemplates_();
  var byId = {};
  for (var j = 0; j < allTemplates.length; j++) {
    byId[allTemplates[j].template_id] = allTemplates[j];
  }

  var result = [];
  for (var k in groups) {
    if (!Object.prototype.hasOwnProperty.call(groups, k)) continue;
    var gg = groups[k];
    var meta = byId[gg.template_id] || {};
    result.push({
      template_key:     gg.template_key,
      template_version: gg.template_version,
      template_id:      gg.template_id,
      name:             meta.name || gg.template_key,
      status:           meta.status || 'unknown',  // active / archived / unknown if deleted
      totals:           gg.totals,
      by_segment:       gg.by_segment
    });
  }

  // Append empty entries for currently-active templates that have ZERO sends
  // (so UI shows them as 0/0/0 instead of hiding them entirely — per UX decision)
  var seenIds = {};
  for (var m = 0; m < result.length; m++) seenIds[result[m].template_id] = true;
  for (var n = 0; n < allTemplates.length; n++) {
    var t = allTemplates[n];
    if (t.status !== 'active') continue;
    if (seenIds[t.template_id]) continue;
    result.push({
      template_key:     t.template_key,
      template_version: t.version,
      template_id:      t.template_id,
      name:             t.name,
      status:           'active',
      totals:           { sent: 0, replied: 0, won: 0 },
      by_segment:       {}
    });
  }

  // Stable sort: by template_key alphabetical, then by version desc
  result.sort(function(a, b) {
    if (a.template_key !== b.template_key) {
      return a.template_key < b.template_key ? -1 : 1;
    }
    return b.template_version - a.template_version;
  });

  return result;
}


/* ═══════════════════════════════════════════════════════════════
   _emptyAnalyticsForAllActiveTemplates_ — internal helper
   Returns one zero-state entry per active template. Used when
   LEADS schema is pre-migration or empty.
   ═══════════════════════════════════════════════════════════════ */

function _emptyAnalyticsForAllActiveTemplates_() {
  var all = listAllTemplates_();
  var out = [];
  for (var i = 0; i < all.length; i++) {
    if (all[i].status !== 'active') continue;
    out.push({
      template_key:     all[i].template_key,
      template_version: all[i].version,
      template_id:      all[i].template_id,
      name:             all[i].name,
      status:           'active',
      totals:           { sent: 0, replied: 0, won: 0 },
      by_segment:       {}
    });
  }
  return out;
}


/* ═══════════════════════════════════════════════════════════════
   regenerateDraftForLead_ — re-run composeDraft_ for one lead
   ═══════════════════════════════════════════════════════════════
   Used when operator changes template selection in lead drawer.
   Reads lead row, runs composeDraft_ (which uses chooseEmailTemplate_
   + loadActiveTemplate_), writes new subject/body + 4 metadata cells
   back to LEADS.

   IMPORTANT: T5 scope only honors the auto-selected template (whatever
   chooseEmailTemplate_ picks). Manual override-by-templateKey is T9
   scope (frontend dropdown). For T5 we accept the templateKey param
   but ignore it — full override needs composeDraft_ refactor to accept
   template injection, which isn't in T5 scope.

   Frontend (T9) will pass the chosen key once we wire that path.

   Returns refreshed { subject, body, template_key, template_version,
                       template_id, segment_at_send }
   Throws lead_not_found if the leadId doesn't exist.
   ═══════════════════════════════════════════════════════════════ */

function regenerateDraftForLead_(leadId, templateKeyOverride) {
  var lid = String(leadId || '').trim();
  if (!lid || lid.length < 3) throw new Error('lead_not_found');

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    throw new Error('Could not acquire lock for regenerateDraftForLead_');
  }

  try {
    var ss = openCrmSpreadsheet_();
    var sheet = getExternalSheet_(ss);
    var hr = getHeaderResolver_(sheet);

    var leadIdCol = hr.colOrNull('lead_id');
    if (!leadIdCol) throw new Error('lead_id column not found');
    var rowNum = findRowByLeadId_(sheet, leadIdCol, lid);
    if (!rowNum) throw new Error('lead_not_found');

    // readSingleRow_ helper doesn't exist — read directly via getRange.
    var rowValues = sheet.getRange(rowNum, 1, 1, sheet.getLastColumn()).getValues()[0];
    var rd = hr.row(rowValues);

    // T5 NOTE: templateKeyOverride accepted but unused — accepted in
    // signature for T9 compatibility. composeDraft_ chooses via
    // chooseEmailTemplate_(rd) at call time.
    var draft = composeDraft_(rd);

    // Write back to LEADS — required cols use hr.col (throws if missing),
    // optional metadata cols use hr.colOrNull (graceful pre-migration).
    sheet.getRange(rowNum, hr.col('email_subject_draft')).setValue(draft.subject);
    sheet.getRange(rowNum, hr.col('email_body_draft')).setValue(draft.body);
    if (hr.colOrNull('email_template_key')) {
      sheet.getRange(rowNum, hr.col('email_template_key')).setValue(draft.template_key);
    }
    if (hr.colOrNull('email_template_version')) {
      sheet.getRange(rowNum, hr.col('email_template_version'))
        .setValue(String(draft.template_version || ''));
    }
    if (hr.colOrNull('email_template_id')) {
      sheet.getRange(rowNum, hr.col('email_template_id')).setValue(draft.template_id);
    }
    if (hr.colOrNull('email_segment_at_send')) {
      sheet.getRange(rowNum, hr.col('email_segment_at_send'))
        .setValue(draft.segment_at_send);
    }

    aswLog_('INFO', 'regenerateDraftForLead_',
      'Regenerated draft for ' + lid + ' (template=' + draft.template_key +
      ' v' + draft.template_version + ')');

    return draft;

  } finally {
    lock.releaseLock();
  }
}
