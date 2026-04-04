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

  // 2. Confirmation dialog
  var action = mode === 'DRAFT' ? 'Vytvořit draft' : 'ODESLAT e-mail';
  var confirm = ui.alert(
    action + '?',
    'Příjemce: ' + payload.recipientEmail + '\n' +
    'Předmět: ' + payload.subject + '\n' +
    'Firma: ' + payload.businessName + '\n\n' +
    'Pokračovat?',
    ui.ButtonSet.YES_NO
  );
  if (confirm !== ui.Button.YES) {
    aswLog_('INFO', 'executeCrmOutbound_', mode + ' cancelled by user for ' + payload.recipientEmail);
    return;
  }

  // 3. Execute draft or send
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

  // 4. Persist metadata to LEADS
  persistOutboundMetadata_(payload, result, mode);

  // 5. Label thread
  if (result.thread) {
    labelThread_(result.thread, CRM_LABEL_ROOT);
    aswLog_('INFO', 'executeCrmOutbound_', 'Thread labeled ASW/CRM');
  }

  // 6. Success alert
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

  var recipientEmail = String(rowData[5] || '').trim();  // col 6 = E-mail
  var subject = String(rowData[15] || '').trim();         // col 16 = Předmět e-mailu
  var body = String(rowData[16] || '').trim();            // col 17 = Návrh zprávy
  var crmRowNum = Number(rowData[18]);                    // col 19 = CRM řádek
  var firmaCell = String(rowData[1] || '').trim();        // col 2 = Firma
  var businessName = firmaCell.split('\n')[0] || '';
  var outreachStage = String(rowData[17] || '').trim();   // col 18 = Pipeline stav

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

  // Guard: valid CRM row reference
  if (!crmRowNum || crmRowNum < DATA_START_ROW) {
    safeAlert_('Neplatný odkaz na CRM řádek. Spusťte "Refresh Ke kontaktování".');
    return null;
  }

  // Guard: not won/lost
  var stageLower = trimLower_(outreachStage);
  if (stageLower === 'won' || stageLower === 'lost') {
    safeAlert_('Lead je ve stavu ' + outreachStage + '. Outbound zablokován.');
    return null;
  }

  // Guard: double-send protection
  var sourceSheet = ss.getSheetByName(MAIN_SHEET_NAME);
  if (!sourceSheet) {
    safeAlert_('Zdrojový list "' + MAIN_SHEET_NAME + '" nenalezen.');
    return null;
  }

  var hr = getHeaderResolver_(sourceSheet);
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

  return {
    recipientEmail: recipientEmail,
    subject: subject,
    body: body,
    crmRowNum: crmRowNum,
    businessName: businessName,
    outreachStage: stageLower,
    account: Session.getActiveUser().getEmail(),
    sourceSheet: sourceSheet,
    hr: hr,
    sourceRow: sourceRow
  };
}


/* ═══════════════════════════════════════════════════════════════
   GMAIL DRAFT CREATION
   ═══════════════════════════════════════════════════════════════ */

function createGmailDraft_(payload) {
  try {
    aswLog_('INFO', 'createGmailDraft_',
      'Creating draft for ' + payload.recipientEmail + ' [' + payload.subject + ']',
      { row: payload.crmRowNum });

    var draft = GmailApp.createDraft(
      payload.recipientEmail,
      payload.subject,
      payload.body
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
    aswLog_('INFO', 'sendGmailMessage_',
      'Sending to ' + payload.recipientEmail + ' [' + payload.subject + ']',
      { row: payload.crmRowNum });

    GmailApp.sendEmail(
      payload.recipientEmail,
      payload.subject,
      payload.body
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
