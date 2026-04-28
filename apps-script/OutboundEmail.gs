/**
 * ============================================================
 *  OutboundEmail.gs — Controlled outbound e-mail sending
 *  Load order: 6/8 (depends on Config, Helpers, GmailLabels)
 *
 *  Two modes:
 *    createCrmDraft()  — creates Gmail draft, no send
 *    sendCrmEmail()    — sends e-mail via Gmail
 *
 *  Both operate on the CURRENTLY SELECTED ROW in
 *  "Ke kontaktování" sheet. Data source fields:
 *    col 6  → recipient email
 *    col 16 → subject (from email_subject_draft)
 *    col 17 → body (from email_body_draft)
 *    col 19 → CRM row reference
 *
 *  Does NOT:
 *  - Bulk send
 *  - Auto-reply
 *  - Auto follow-up
 *  - Change status on reply detection
 * ============================================================
 */


/* ── Config ──────────────────────────────────────────────────── */
var OUTBOUND_DOUBLE_SEND_MINUTES = 5;

/* ── Sender guard ────────────────────────────────────────────── */
// Allowed From: domain for outbound CRM email. Any other domain is
// treated as a violation and outbound is aborted before reaching Gmail.
// This prevents accidental leak of personal/legacy accounts (e.g.
// sfridrich@unipong.cz) as the visible From: header to clients.
var OUTBOUND_ALLOWED_FROM_DOMAIN_ = 'autosmartweb.cz';

/**
 * Resolve the From address that GmailApp.sendEmail should use.
 *
 * Pure resolver — does NOT throw. Callers (createGmailDraft_,
 * sendGmailMessage_) must check `result.from` and refuse to proceed
 * if it is null. The hard guard helper below (assertOutboundFromUsable_)
 * provides the canonical refusal message.
 *
 * Returns: { from: string|null, registered: boolean, allowed: boolean,
 *            configured: string, reason: string }
 *
 *   from        — the address to pass to options.from, or null to omit
 *   registered  — whether `from` is in GmailApp.getAliases()
 *   allowed     — whether `from` is on the autosmartweb.cz domain
 *   configured  — raw value of OUTBOUND_FROM_EMAIL Script Property
 *                 (for diagnostic / error messages)
 *   reason      — human-readable status for logs / errors
 *
 * Test injection: optional `deps` argument lets tests inject
 *   { getProperty(key), getAliases() } so the same logic can be
 *   exercised under Node without GmailApp / PropertiesService.
 */
function resolveOutboundFromAddress_(deps) {
  var d = deps || {
    getProperty: function (key) {
      return PropertiesService.getScriptProperties().getProperty(key);
    },
    getAliases: function () {
      return GmailApp.getAliases() || [];
    }
  };

  var configured = String(d.getProperty('OUTBOUND_FROM_EMAIL') || '').trim();

  if (!configured) {
    return {
      from: null,
      registered: false,
      allowed: false,
      configured: '',
      reason: 'OUTBOUND_FROM_EMAIL Script Property not set'
    };
  }

  var allowed = new RegExp('@' + OUTBOUND_ALLOWED_FROM_DOMAIN_.replace(/\./g, '\\.') + '$', 'i')
    .test(configured);

  if (!allowed) {
    return {
      from: null,
      registered: false,
      allowed: false,
      configured: configured,
      reason: 'OUTBOUND_FROM_EMAIL=' + configured +
        ' is not on allowed domain @' + OUTBOUND_ALLOWED_FROM_DOMAIN_
    };
  }

  var aliases = [];
  try {
    aliases = d.getAliases() || [];
  } catch (e) {
    return {
      from: null,
      registered: false,
      allowed: true,
      configured: configured,
      reason: 'GmailApp.getAliases() failed: ' + e.message
    };
  }

  var registered = aliases.indexOf(configured) !== -1;
  if (!registered) {
    return {
      from: null,
      registered: false,
      allowed: true,
      configured: configured,
      reason: 'OUTBOUND_FROM_EMAIL=' + configured +
        ' is not registered as Gmail "Send mail as" alias for runtime account'
    };
  }

  return {
    from: configured,
    registered: true,
    allowed: true,
    configured: configured,
    reason: 'OK'
  };
}

/**
 * Hard guard: throws an Error with a human-friendly Czech-EN bilingual
 * message unless a valid, alias-registered, company-domain From address
 * is available. Used by BOTH createGmailDraft_ AND sendGmailMessage_ so
 * that a draft created today cannot be silently sent tomorrow with the
 * runtime account in the From header.
 *
 * Throws: Error with message that the operator can act on directly
 *         (no need to dig into logs).
 *
 * Test injection: same pattern as resolveOutboundFromAddress_.
 */
function assertOutboundFromUsable_(deps) {
  var info = resolveOutboundFromAddress_(deps);
  if (info.from) {
    return info; // OK — caller can pass options.from = info.from
  }

  // Build operator-facing error message. Always names the problem,
  // names the configured value (if any), and names the next action.
  var msg =
    'Outbound blocked: OUTBOUND_FROM_EMAIL is missing or not a verified ' +
    'Gmail alias. Refusing to send from runtime account. ' +
    'Detail: ' + info.reason + '. ' +
    'Fix: (1) set Script Property OUTBOUND_FROM_EMAIL to a company ' +
    '@' + OUTBOUND_ALLOWED_FROM_DOMAIN_ + ' address, ' +
    '(2) register that address as a Gmail "Send mail as" alias for ' +
    'the runtime account (Gmail Settings → Accounts → Send mail as → ' +
    'Add another email address), (3) re-run the action.';

  throw new Error(msg);
}


/* ═══════════════════════════════════════════════════════════════
   PUBLIC — Menu entry points
   ═══════════════════════════════════════════════════════════════ */

function createCrmDraft() {
  executeCrmOutbound_('DRAFT');
}

function sendCrmEmail() {
  executeCrmOutbound_('SEND');
}


/* ═══════════════════════════════════════════════════════════════
   CORE OUTBOUND LOGIC
   ═══════════════════════════════════════════════════════════════ */

function executeCrmOutbound_(mode) {
  var ui = SpreadsheetApp.getUi();

  // 1. Resolve selected row from "Ke kontaktování"
  var payload = resolveSelectedLeadPayload_(ui);
  if (!payload) return; // guard already showed alert

  // 2. KROK 4 (FF-006): sendability gate — review_decision MUST be APPROVE
  try {
    assertSendability_(payload.reviewDecision, 'CRM row ' + payload.crmRowNum);
  } catch (gateErr) {
    aswLog_('WARN', 'executeCrmOutbound_',
      mode + ' blocked by sendability gate: ' + gateErr.message);
    safeAlert_(
      'Odeslání zablokováno.\n\n' +
      'Náhled musí být schválený (APPROVE) v "Ke kontaktování" → sloupec "Rozhodnutí ✎".\n' +
      'Aktuální stav: ' + (payload.reviewDecision || 'PRÁZDNÉ')
    );
    return;
  }

  // 3. Resolve sender identity for Reply-To (assignee → operator mailbox)
  payload.sender = resolveSenderIdentity_(payload.assigneeEmail);

  // 4. Confirmation dialog
  var action = mode === 'DRAFT' ? 'Vytvořit draft' : 'ODESLAT e-mail';
  var confirm = ui.alert(
    action + '?',
    'Příjemce: ' + payload.recipientEmail + '\n' +
    'Předmět: ' + payload.subject + '\n' +
    'Firma: ' + payload.businessName + '\n' +
    'Reply-To: ' + payload.sender.name + ' <' + payload.sender.email + '>\n\n' +
    'Pokračovat?',
    ui.ButtonSet.YES_NO
  );
  if (confirm !== ui.Button.YES) {
    aswLog_('INFO', 'executeCrmOutbound_', mode + ' cancelled by user for ' + payload.recipientEmail);
    return;
  }

  // 5. Execute draft or send
  var result;
  if (mode === 'DRAFT') {
    result = createGmailDraft_(payload);
  } else {
    result = sendGmailMessage_(payload);
  }

  if (!result.ok) {
    aswLog_('ERROR', 'executeCrmOutbound_', mode + ' failed: ' + result.error);
    safeAlert_('Chyba: ' + result.error);
    return;
  }

  // 6. Persist metadata to LEADS
  persistOutboundMetadata_(payload, result, mode);

  // 7. Label thread
  if (result.thread) {
    labelThread_(result.thread, CRM_LABEL_ROOT);
    aswLog_('INFO', 'executeCrmOutbound_', 'Thread labeled ASW/CRM');
  }

  // 8. Success alert
  var successMsg = mode === 'DRAFT'
    ? 'Draft vytvořen pro ' + payload.recipientEmail + '.\nZkontrolujte v Gmailu.'
    : 'E-mail odeslán na ' + payload.recipientEmail + '.';
  aswLog_('INFO', 'executeCrmOutbound_', mode + ' OK: ' + payload.recipientEmail);
  safeAlert_(successMsg);
}


/* ═══════════════════════════════════════════════════════════════
   PAYLOAD RESOLUTION — from selected row in "Ke kontaktování"
   ═══════════════════════════════════════════════════════════════ */

function resolveSelectedLeadPayload_(ui) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getActiveSheet();

  // Guard: must be on "Ke kontaktování"
  if (sheet.getName() !== CONTACT_SHEET_NAME) {
    safeAlert_('Přepněte na list "' + CONTACT_SHEET_NAME + '" a vyberte řádek.');
    return null;
  }

  var activeRow = ss.getActiveRange().getRow();

  // Guard: must be data row (below dashboard + header)
  if (activeRow < TABLE_DATA_START_) {
    safeAlert_('Vyberte datový řádek (řádek ' + TABLE_DATA_START_ + ' nebo níže).');
    return null;
  }

  // Read row data from contact sheet
  var rowData = sheet.getRange(activeRow, 1, 1, TOTAL_COLS_).getValues()[0];

  // KROK 9 hotfix: B-06 inserted review_decision + review_note as cols
  // 12-13, shifting all later cols by +2. Plus col 21 is now "Lead ID"
  // string (FIRMYCZ-...), not numeric CRM row. Resolve via lead_id lookup.
  var recipientEmail = String(rowData[5]  || '').trim();  // col 6  = E-mail
  var subject        = String(rowData[17] || '').trim();  // col 18 = Predmet
  var body           = String(rowData[18] || '').trim();  // col 19 = Navrh zpravy
  var outreachStage  = String(rowData[19] || '').trim();  // col 20 = Pipeline stav
  var leadId         = String(rowData[20] || '').trim();  // col 21 = Lead ID
  var firmaCell      = String(rowData[1]  || '').trim();  // col 2  = Firma
  var businessName   = firmaCell.split('\n')[0] || '';

  // Guard: valid email
  if (!recipientEmail || recipientEmail === '\u2014' || recipientEmail.indexOf('@') === -1) {
    safeAlert_('Vybraný lead nemá validní e-mail.');
    return null;
  }

  // Guard: non-empty subject
  if (!subject) {
    safeAlert_('Chybí předmět e-mailu (sloupec "Předmět e-mailu").\nSpusťte nejdřív "Rebuild drafts".');
    return null;
  }

  // Guard: non-empty body
  if (!body) {
    safeAlert_('Chybí text zprávy (sloupec "Návrh zprávy").\nSpusťte nejdřív "Rebuild drafts".');
    return null;
  }

  // Guard: lead_id present (col 21 in contact sheet)
  if (!leadId) {
    safeAlert_('Vybraný řádek nemá lead_id. Spusťte "Refresh Ke kontaktování" + "Ensure lead IDs".');
    return null;
  }

  // Guard: not won/lost
  var stageLower = trimLower_(outreachStage);
  if (stageLower === 'won' || stageLower === 'lost') {
    safeAlert_('Lead je ve stavu ' + outreachStage + '. Outbound zablokován.');
    return null;
  }

  // Resolve LEADS row by lead_id (replaces brittle numeric CRM row reference
  // which broke after B-06 column shift).
  var sourceSheet = ss.getSheetByName(MAIN_SHEET_NAME);
  if (!sourceSheet) {
    safeAlert_('Zdrojový list "' + MAIN_SHEET_NAME + '" nenalezen.');
    return null;
  }

  var hr = getHeaderResolver_(sourceSheet);
  var leadIdCol = hr.colOrNull('lead_id');
  if (!leadIdCol) {
    safeAlert_('Sloupec "lead_id" nenalezen v LEADS. Spusťte "Setup preview extension".');
    return null;
  }

  var crmRowNum = findRowByLeadId_(sourceSheet, leadIdCol, leadId);
  if (!crmRowNum) {
    safeAlert_('Lead ' + leadId + ' nenalezen v LEADS. Spusťte "Refresh Ke kontaktování".');
    return null;
  }

  var sourceRow = sourceSheet.getRange(crmRowNum, 1, 1, sourceSheet.getLastColumn()).getValues()[0];

  var lastSentStr = String(hr.get(sourceRow, 'last_email_sent_at') || '').trim();
  if (lastSentStr) {
    var lastSent = new Date(lastSentStr);
    var minutesAgo = (new Date().getTime() - lastSent.getTime()) / 60000;
    if (minutesAgo < OUTBOUND_DOUBLE_SEND_MINUTES) {
      var confirmDouble = ui.alert(
        'Pozor: opakované odeslání',
        'Poslední e-mail byl odeslán před ' + Math.round(minutesAgo) + ' minutami.\n' +
        'Opravdu chcete poslat další?',
        ui.ButtonSet.YES_NO
      );
      if (confirmDouble !== ui.Button.YES) {
        aswLog_('INFO', 'resolveSelectedLeadPayload_',
          'Double-send blocked by user for CRM row ' + crmRowNum);
        return null;
      }
    }
  }

  // Guard: identity verification
  var sourceBusinessName = String(
    sourceSheet.getRange(crmRowNum, LEGACY_COL.BUSINESS_NAME).getValue() || ''
  ).trim();
  if (normalizeBusinessName_(sourceBusinessName) !== normalizeBusinessName_(businessName)) {
    safeAlert_(
      'Nesouhlasí firma!\n' +
      'CRM: ' + sourceBusinessName + '\n' +
      'Ke kontaktování: ' + businessName + '\n' +
      'Spusťte "Refresh Ke kontaktování".'
    );
    return null;
  }

  // KROK 4: read review_decision (FF-006 sendability gate input)
  var reviewDecision = String(hr.get(sourceRow, 'review_decision') || '').trim();

  // KROK 4: read assignee_email if column exists (added in KROK 5)
  var colAssignee = hr.colOrNull('assignee_email');
  var assigneeEmail = colAssignee
    ? String(hr.get(sourceRow, 'assignee_email') || '').trim()
    : '';

  return {
    recipientEmail: recipientEmail,
    subject: subject,
    body: body,
    crmRowNum: crmRowNum,
    businessName: businessName,
    outreachStage: stageLower,
    reviewDecision: reviewDecision,
    assigneeEmail: assigneeEmail,
    account: Session.getActiveUser().getEmail(),
    sourceSheet: sourceSheet,
    hr: hr,
    sourceRow: sourceRow
  };
}


/* ═══════════════════════════════════════════════════════════════
   KROK 4: SENDABILITY GATE (FF-006) + ASSIGNEE IDENTITY (Reply-To)
   ═══════════════════════════════════════════════════════════════ */

/**
 * Hard gate: forbid send/draft for any lead whose preview was not
 * APPROVE-d by an operator (B-06 review). Throws on violation so
 * programmatic callers cannot bypass; menu wrapper catches and shows
 * a friendly alert + logs via aswLog_.
 */
function assertSendability_(reviewDecision, leadRef) {
  if (reviewDecision !== REVIEW_DECISIONS.APPROVE) {
    var got = reviewDecision || 'EMPTY';
    throw new Error(
      'Cannot send: review_decision must be APPROVE (got: ' + got + ') ' +
      'for ' + (leadRef || 'lead') + '. ' +
      'Operator must mark "Rozhodnutí ✎" as APPROVE in "Ke kontaktování" first.'
    );
  }
}

/**
 * Resolve sender display identity for the Reply-To header from the
 * assignee email. Falls back to DEFAULT_REPLY_TO_* (Config.gs) when
 * assignee is empty (KROK 4 state, before assignee_email column exists)
 * or unknown (typo / removed user).
 */
function resolveSenderIdentity_(assigneeEmail) {
  var key = String(assigneeEmail || '').trim().toLowerCase();
  if (key && ASSIGNEE_NAMES[key]) {
    return { email: key, name: ASSIGNEE_NAMES[key] };
  }
  return { email: DEFAULT_REPLY_TO_EMAIL, name: DEFAULT_REPLY_TO_NAME };
}


/* ═══════════════════════════════════════════════════════════════
   GMAIL DRAFT CREATION
   ═══════════════════════════════════════════════════════════════ */

function createGmailDraft_(payload) {
  try {
    var sender = payload.sender || resolveSenderIdentity_(payload.assigneeEmail);

    // Hard guard: same rule as send. A draft created today can be sent
    // tomorrow by the operator from Gmail UI; if From is not pinned to
    // a verified company alias here, the draft would still leak the
    // runtime account in From: at send time. So refuse to even create
    // the draft unless From is usable.
    var fromInfo;
    try {
      fromInfo = assertOutboundFromUsable_();
    } catch (guardErr) {
      aswLog_('ERROR', 'createGmailDraft_', guardErr.message,
        { row: payload.crmRowNum });
      return { ok: false, error: guardErr.message };
    }

    var options = {
      from: fromInfo.from,
      replyTo: sender.email,
      name: sender.name
    };

    aswLog_('INFO', 'createGmailDraft_',
      'Creating draft for ' + payload.recipientEmail + ' [' + payload.subject + ']' +
      ' from=' + fromInfo.from +
      ' replyTo=' + sender.email +
      ' from_status=' + fromInfo.reason,
      { row: payload.crmRowNum });

    var draft = GmailApp.createDraft(
      payload.recipientEmail,
      payload.subject,
      payload.body,
      options
    );

    var draftMsg = draft.getMessage();
    var threadId = '';
    var messageId = '';

    try {
      threadId = draftMsg.getThread().getId();
      messageId = draftMsg.getId();
    } catch (e) {
      aswLog_('WARN', 'createGmailDraft_', 'Could not resolve draft thread/message ID: ' + e.message);
    }

    var thread = null;
    if (threadId) {
      try { thread = GmailApp.getThreadById(threadId); } catch (e) {}
    }

    return {
      ok: true,
      threadId: threadId,
      messageId: messageId,
      thread: thread,
      sentAt: ''
    };
  } catch (e) {
    return {
      ok: false,
      error: 'Draft creation failed: ' + String(e.message).substring(0, 200)
    };
  }
}


/* ═══════════════════════════════════════════════════════════════
   GMAIL SEND
   ═══════════════════════════════════════════════════════════════ */

function sendGmailMessage_(payload) {
  try {
    var sender = payload.sender || resolveSenderIdentity_(payload.assigneeEmail);

    // Hard guard: refuse to send unless OUTBOUND_FROM_EMAIL is set,
    // points at @autosmartweb.cz domain, AND is a registered Gmail
    // "Send mail as" alias for the runtime account. NEVER falls back
    // to runtime account (e.g. sfridrich@unipong.cz) — this is the
    // entire point of this guard.
    var fromInfo;
    try {
      fromInfo = assertOutboundFromUsable_();
    } catch (guardErr) {
      aswLog_('ERROR', 'sendGmailMessage_', guardErr.message,
        { row: payload.crmRowNum });
      return { ok: false, error: guardErr.message };
    }

    var options = {
      from: fromInfo.from,
      replyTo: sender.email,
      name: sender.name
    };

    aswLog_('INFO', 'sendGmailMessage_',
      'Sending to ' + payload.recipientEmail + ' [' + payload.subject + ']' +
      ' from=' + fromInfo.from +
      ' replyTo=' + sender.email +
      ' from_status=' + fromInfo.reason,
      { row: payload.crmRowNum });

    GmailApp.sendEmail(
      payload.recipientEmail,
      payload.subject,
      payload.body,
      options
    );

    // Find the sent thread — search by recipient + subject
    var sentAt = new Date().toISOString();
    var threadId = '';
    var messageId = '';
    var thread = null;

    try {
      Utilities.sleep(1000); // brief wait for Gmail indexing
      var query = 'to:' + payload.recipientEmail + ' subject:"' + payload.subject + '" in:sent newer_than:1d';
      var threads = GmailApp.search(query, 0, 3);

      if (threads.length > 0) {
        thread = threads[0];
        threadId = thread.getId();
        var messages = thread.getMessages();
        messageId = messages[messages.length - 1].getId();
      }
    } catch (e) {
      aswLog_('WARN', 'sendGmailMessage_', 'Could not resolve sent thread: ' + e.message);
    }

    return {
      ok: true,
      threadId: threadId,
      messageId: messageId,
      thread: thread,
      sentAt: sentAt
    };
  } catch (e) {
    return {
      ok: false,
      error: 'Send failed: ' + String(e.message).substring(0, 200)
    };
  }
}


/* ═══════════════════════════════════════════════════════════════
   PERSIST METADATA TO LEADS
   ═══════════════════════════════════════════════════════════════ */

function persistOutboundMetadata_(payload, result, mode) {
  try {
    var sheet = payload.sourceSheet;
    var hr = payload.hr;
    var crmRow = payload.crmRowNum;

    // Re-read current row to get fresh data
    var currentRow = sheet.getRange(crmRow, 1, 1, sheet.getLastColumn()).getValues()[0];

    // Write email metadata
    if (result.threadId) {
      hr.set(currentRow, 'email_thread_id', result.threadId);
    }
    if (result.messageId) {
      hr.set(currentRow, 'email_last_message_id', result.messageId);
    }
    hr.set(currentRow, 'email_subject_last', payload.subject);
    // Phase 2 KROK 6: snapshot the body that was sent so the CRM has a
    // durable copy independent of the Gmail thread (which the operator
    // might delete). Mirrors email_subject_last naming.
    if (hr.colOrNull('email_body_last')) {
      hr.set(currentRow, 'email_body_last', payload.body);
    }
    hr.set(currentRow, 'email_mailbox_account', payload.account);
    hr.set(currentRow, 'email_last_error', '');

    if (mode === 'DRAFT') {
      hr.set(currentRow, 'email_sync_status', EMAIL_SYNC_STATUS.DRAFT_CREATED);
      aswLog_('INFO', 'persistOutboundMetadata_', 'Draft metadata saved for CRM row ' + crmRow);
    } else {
      // SEND mode
      hr.set(currentRow, 'last_email_sent_at', result.sentAt);
      hr.set(currentRow, 'email_sync_status', EMAIL_SYNC_STATUS.SENT);

      // Conservative outreach_stage update — only upgrade, never downgrade
      var curOutreach = trimLower_(hr.get(currentRow, 'outreach_stage'));
      var earlyStages = ['', 'not_contacted', 'draft_ready'];
      var isEarly = false;
      for (var s = 0; s < earlyStages.length; s++) {
        if (curOutreach === earlyStages[s]) { isEarly = true; break; }
      }
      if (isEarly) {
        hr.set(currentRow, 'outreach_stage', 'CONTACTED');
      }

      // Update last_contact_at
      hr.set(currentRow, 'last_contact_at', result.sentAt);

      aswLog_('INFO', 'persistOutboundMetadata_',
        'Send metadata saved for CRM row ' + crmRow +
        (isEarly ? ', outreach_stage → CONTACTED' : ', outreach_stage preserved'));
    }

    // Write back the single row
    writeExtensionColumns_(sheet, hr, [currentRow], [payload.sourceRow]);

    aswLog_('INFO', 'persistOutboundMetadata_', 'Metadata persisted for CRM row ' + crmRow);

  } catch (e) {
    aswLog_('ERROR', 'persistOutboundMetadata_',
      'Failed to persist metadata for CRM row ' + payload.crmRowNum + ': ' + e.message);
  }
}


/* ═══════════════════════════════════════════════════════════════
   Phase 2 KROK 6 — sendEmailForLead_(leadId, opts)
   ═══════════════════════════════════════════════════════════════
   Frontend-driven send entry point. Resolves the lead by lead_id
   directly from LEADS (no "Ke kontaktování" UI dependency, no
   ui.alert prompts), reuses the pilot's send primitives
   (resolveSenderIdentity_ for Reply-To, sendGmailMessage_ for the
   GmailApp call, persistOutboundMetadata_ for write-back).

   Validation gate (Phase 2 KROK 6 — INTENTIONALLY MILDER than
   the Sheet path's assertSendability_):
   - lead exists
   - qualified_for_preview === 'true'
   - preview_stage === 'READY_FOR_REVIEW'
   - drafts non-empty (after applying overrides)
   - recipient email valid

   The Sheet path keeps requiring `review_decision === 'APPROVE'` for
   backward compat with B-06 review queue. KROK 6 frontend treats the
   operator's click on "Odeslat" as the approval act — see PR #70 body
   for the drift discussion + sjednoceni backlog item.

   opts.subjectOverride / opts.bodyOverride: when set (non-empty),
   the value is persisted into email_subject_draft / email_body_draft
   BEFORE the send so the LEADS draft columns reflect what was actually
   sent. Empty/undefined overrides fall back to existing draft values.

   Returns: { ok: true, sentAt: ISO, leadId, threadId? }
   Throws:  Error('lead_not_found' | 'not_qualified' | 'preview_not_ready' |
                  'empty_drafts' | 'invalid_email' | <msg>)
   ═══════════════════════════════════════════════════════════════ */

function sendEmailForLead_(leadId, opts) {
  var s = String(leadId || '').trim();
  if (!s || s.length < 3) throw new Error('Invalid leadId');
  opts = opts || {};

  var ss = openCrmSpreadsheet_();
  var sheet = ss.getSheetByName(MAIN_SHEET_NAME);
  if (!sheet) throw new Error('LEADS sheet not found');

  var hr = getHeaderResolver_(sheet);
  var leadIdCol = hr.colOrNull('lead_id');
  if (!leadIdCol) throw new Error('lead_id column not found');

  var rowNum = findRowByLeadId_(sheet, leadIdCol, s);
  if (!rowNum) throw new Error('lead_not_found: ' + s);

  var sourceRow = sheet.getRange(rowNum, 1, 1, sheet.getLastColumn()).getValues()[0];

  // --- Apply overrides into draft columns BEFORE validation/send so a
  //     subsequent re-fetch shows the same content the operator just
  //     pressed Send on. Empty / undefined overrides leave drafts alone.
  var subjectOverride = String(opts.subjectOverride == null ? '' : opts.subjectOverride);
  var bodyOverride    = String(opts.bodyOverride    == null ? '' : opts.bodyOverride);
  if (subjectOverride) {
    var subjCol = hr.colOrNull('email_subject_draft');
    if (subjCol) {
      sheet.getRange(rowNum, subjCol).setValue(subjectOverride);
      hr.set(sourceRow, 'email_subject_draft', subjectOverride);
    }
  }
  if (bodyOverride) {
    var bodyCol = hr.colOrNull('email_body_draft');
    if (bodyCol) {
      sheet.getRange(rowNum, bodyCol).setValue(bodyOverride);
      hr.set(sourceRow, 'email_body_draft', bodyOverride);
    }
  }

  // --- Read post-override draft values + identity fields ---
  var subject = String(hr.get(sourceRow, 'email_subject_draft') || '').trim();
  var body    = String(hr.get(sourceRow, 'email_body_draft') || '').trim();
  var qualified    = trimLower_(hr.get(sourceRow, 'qualified_for_preview'));
  var previewStage = String(hr.get(sourceRow, 'preview_stage') || '').trim();
  var recipientEmail = String(hr.get(sourceRow, 'email') || '').trim();
  var businessName = String(
    sheet.getRange(rowNum, LEGACY_COL.BUSINESS_NAME).getValue() || ''
  ).trim();
  var assigneeCol = hr.colOrNull('assignee_email');
  var assigneeEmail = assigneeCol
    ? String(hr.get(sourceRow, 'assignee_email') || '').trim()
    : '';

  // --- Validation gate (mild — see header comment) ---
  if (qualified !== 'true') throw new Error('not_qualified');
  if (previewStage !== PREVIEW_STAGES.READY_FOR_REVIEW) {
    throw new Error('preview_not_ready: ' + (previewStage || 'EMPTY'));
  }
  if (!subject || !body) throw new Error('empty_drafts');
  if (!recipientEmail || recipientEmail.indexOf('@') === -1) {
    throw new Error('invalid_email');
  }

  // --- Build payload + resolve sender (Reply-To assignee map) ---
  var payload = {
    recipientEmail: recipientEmail,
    subject:        subject,
    body:           body,
    crmRowNum:      rowNum,
    businessName:   businessName,
    outreachStage:  trimLower_(hr.get(sourceRow, 'outreach_stage')),
    reviewDecision: String(hr.get(sourceRow, 'review_decision') || '').trim(),
    assigneeEmail:  assigneeEmail,
    account:        Session.getActiveUser().getEmail() || '',
    sourceSheet:    sheet,
    hr:             hr,
    sourceRow:      sourceRow
  };
  payload.sender = resolveSenderIdentity_(assigneeEmail);

  aswLog_('INFO', 'sendEmailForLead_',
    'leadId=' + s + ' to=' + recipientEmail + ' replyTo=' + payload.sender.email);

  // --- Send + persist ---
  var result = sendGmailMessage_(payload);
  if (!result.ok) {
    throw new Error('send_failed: ' + result.error);
  }
  persistOutboundMetadata_(payload, result, 'SEND');

  return {
    ok:       true,
    leadId:   s,
    sentAt:   result.sentAt,
    threadId: result.threadId || ''
  };
}
