/**
 * ============================================================
 *  MailboxSync.gs — Read-only mailbox metadata sync
 *  Load order: 5/7 (depends on Config.gs + Helpers.gs)
 *
 *  Searches Gmail for threads matching lead email addresses
 *  and writes metadata into email_* extension columns.
 *
 *  Does NOT:
 *  - Send any emails
 *  - Change outreach_stage, lead_stage, or any sales fields
 *  - Create triggers
 *  - Modify business data
 * ============================================================
 */


/* ═══════════════════════════════════════════════════════════════
   MAIN SYNC ENTRY POINT
   ═══════════════════════════════════════════════════════════════ */

function syncMailboxMetadata() {
  if (!EMAIL_SYNC_ENABLED) {
    safeAlert_(
      'Mailbox sync je vypnutý.\n' +
      'Nastav EMAIL_SYNC_ENABLED = true v Config.gs.');
    return;
  }

  var account = EMAIL_MAILBOX_ACCOUNT || Session.getActiveUser().getEmail();
  if (!account) {
    safeAlert_('Nelze určit mailbox účet.\nNastav EMAIL_MAILBOX_ACCOUNT v Config.gs.');
    return;
  }

  // Ensure CRM label exists (silent — no alert)
  try { getOrCreateGmailLabel_(CRM_LABEL_ROOT); } catch (e) {
    aswLog_('WARN', 'syncMailboxMetadata', 'CRM label check failed: ' + e.message);
  }

  var ss = openCrmSpreadsheet_();
  var sheet = getExternalSheet_(ss);

  if (!ensurePreviewExtensionReady_(sheet)) return;

  var hr = getHeaderResolver_(sheet);
  var bulk = readAllData_(sheet);

  if (bulk.data.length === 0) {
    safeAlert_('Žádná data.');
    return;
  }

  aswLog_('INFO', 'syncMailboxMetadata',
    'Starting sync: ' + bulk.data.length + ' rows, lookback=' +
    EMAIL_SYNC_LOOKBACK_DAYS + 'd, account=' + account);

  var updatedRows = [];
  for (var i = 0; i < bulk.data.length; i++) {
    updatedRows.push(bulk.data[i].slice());
  }

  var stats = { processed: 0, matched: 0, notFound: 0, noEmail: 0, errors: 0,
                 labeled: 0, alreadyLabeled: 0 };

  for (var i = 0; i < updatedRows.length; i++) {
    var row = updatedRows[i];

    try {
      var leadEmail = trimLower_(hr.get(row, 'email'));

      // Skip rows without email
      if (!leadEmail || leadEmail.indexOf('@') === -1) {
        stats.noEmail++;
        continue;
      }

      // Re-sync if thread_id exists and status indicates a valid link
      var existingThreadId = String(hr.get(row, 'email_thread_id') || '').trim();
      var existingStatus = trimLower_(hr.get(row, 'email_sync_status'));
      var isLinkedStatus = (existingStatus === 'linked' || existingStatus === 'replied' ||
                            existingStatus === 'sent' || existingStatus === 'synced');
      if (existingThreadId && isLinkedStatus) {
        // Re-sync to pick up new replies
        var result = resyncExistingThread_(existingThreadId, leadEmail);
        if (result.ok) {
          writeEmailMetadata_(hr, row, result, account);
          // Label thread if not already labeled
          if (result.thread) {
            if (threadHasLabel_(result.thread, CRM_LABEL_ROOT)) {
              stats.alreadyLabeled++;
            } else {
              labelThread_(result.thread, CRM_LABEL_ROOT);
              stats.labeled++;
            }
          }
          stats.matched++;
        } else {
          hr.set(row, 'email_sync_status', EMAIL_SYNC_STATUS.ERROR);
          hr.set(row, 'email_last_error', result.error);
          stats.errors++;
        }
        stats.processed++;
        continue;
      }

      // Search for matching threads
      stats.processed++;
      var searchResult = searchMailboxForLead_(leadEmail);

      if (searchResult.error) {
        hr.set(row, 'email_sync_status', EMAIL_SYNC_STATUS.ERROR);
        hr.set(row, 'email_last_error', searchResult.error);
        stats.errors++;
        continue;
      }

      if (searchResult.threadCount === 0) {
        hr.set(row, 'email_sync_status', EMAIL_SYNC_STATUS.NOT_FOUND);
        hr.set(row, 'email_mailbox_account', account);
        stats.notFound++;
        continue;
      }

      if (searchResult.threadCount > 1 && EMAIL_SYNC_REQUIRE_EXACT_MATCH) {
        // Multiple threads — ambiguous, mark for review
        hr.set(row, 'email_sync_status', EMAIL_SYNC_STATUS.REVIEW);
        hr.set(row, 'email_mailbox_account', account);
        hr.set(row, 'email_last_error',
          'Ambiguous: ' + searchResult.threadCount + ' threads found for ' + leadEmail);
        stats.notFound++;
        continue;
      }

      // Single thread match (or first thread if exact match not required)
      var threadData = extractThreadMetadata_(searchResult.threads[0], leadEmail, account);
      writeEmailMetadata_(hr, row, threadData, account);
      // Label thread after successful match
      if (threadData.ok && threadData.thread) {
        if (threadHasLabel_(threadData.thread, CRM_LABEL_ROOT)) {
          stats.alreadyLabeled++;
        } else {
          labelThread_(threadData.thread, CRM_LABEL_ROOT);
          stats.labeled++;
        }
      }
      stats.matched++;

    } catch (e) {
      hr.set(row, 'email_sync_status', EMAIL_SYNC_STATUS.ERROR);
      hr.set(row, 'email_last_error', String(e.message).substring(0, 200));
      stats.errors++;
      aswLog_('ERROR', 'syncMailboxMetadata',
        'Row ' + (i + DATA_START_ROW) + ': ' + e.message, { row: i + DATA_START_ROW });
    }
  }

  writeExtensionColumns_(sheet, hr, updatedRows, bulk.data);

  var report =
    'Mailbox sync dokončen.\n' +
    'Zpracováno: ' + stats.processed + '\n' +
    'Matchů: ' + stats.matched + '\n' +
    'Nově označeno (ASW/CRM): ' + stats.labeled + '\n' +
    'Už označeno: ' + stats.alreadyLabeled + '\n' +
    'Nenalezeno: ' + stats.notFound + '\n' +
    'Bez e-mailu: ' + stats.noEmail + '\n' +
    'Chyb: ' + stats.errors;

  aswLog_('INFO', 'syncMailboxMetadata', report);
  safeAlert_(report);
}


/* ═══════════════════════════════════════════════════════════════
   GMAIL SEARCH
   ═══════════════════════════════════════════════════════════════ */

/**
 * Searches Gmail for threads involving a specific email address.
 * Uses exact address match via Gmail search operators.
 * Returns { threads: GmailThread[], threadCount: number, error: string|null }
 */
function searchMailboxForLead_(leadEmail) {
  try {
    var cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - EMAIL_SYNC_LOOKBACK_DAYS);
    var afterDate = Utilities.formatDate(cutoff, Session.getScriptTimeZone(), 'yyyy/MM/dd');

    // Exact email match: search for threads where this address appears
    var query = '{to:' + leadEmail + ' from:' + leadEmail + '} after:' + afterDate;

    var threads = GmailApp.search(query, 0, EMAIL_SYNC_MAX_THREADS);

    return {
      threads: threads,
      threadCount: threads.length,
      error: null
    };
  } catch (e) {
    return {
      threads: [],
      threadCount: 0,
      error: 'Gmail search failed: ' + String(e.message).substring(0, 200)
    };
  }
}


/* ═══════════════════════════════════════════════════════════════
   THREAD METADATA EXTRACTION
   ═══════════════════════════════════════════════════════════════ */

/**
 * Extracts metadata from a Gmail thread.
 * Returns { ok: true, threadId, messageId, lastReceivedAt, lastSentAt,
 *           subject, replyType } or { ok: false, error }
 */
function extractThreadMetadata_(thread, leadEmail, account) {
  try {
    var messages = thread.getMessages();
    var threadId = thread.getId();
    var lastMessage = messages[messages.length - 1];
    var messageId = lastMessage.getId();
    var subject = thread.getFirstMessageSubject();

    var lastSentAt = '';
    var lastReceivedAt = '';
    var replyType = EMAIL_REPLY_TYPE.NONE;

    // Walk messages to find last sent/received and determine reply type
    for (var m = messages.length - 1; m >= 0; m--) {
      var msg = messages[m];
      var from = trimLower_(msg.getFrom());
      var date = msg.getDate();

      var isFromLead = from.indexOf(leadEmail) !== -1;
      var isFromUs = account && from.indexOf(trimLower_(account)) !== -1;

      if (isFromLead && !lastReceivedAt) {
        lastReceivedAt = date.toISOString();
        replyType = classifyReplyType_(msg);
      }

      if (isFromUs && !lastSentAt) {
        lastSentAt = date.toISOString();
      }

      // Stop early once we have both
      if (lastReceivedAt && lastSentAt) break;
    }

    return {
      ok: true,
      thread: thread,
      threadId: threadId,
      messageId: messageId,
      lastSentAt: lastSentAt,
      lastReceivedAt: lastReceivedAt,
      subject: String(subject || '').substring(0, 200),
      replyType: replyType
    };
  } catch (e) {
    return {
      ok: false,
      error: 'Thread extraction failed: ' + String(e.message).substring(0, 200)
    };
  }
}


/**
 * Re-syncs an existing linked thread by ID.
 * Used when email_thread_id is already set and status is LINKED/REPLIED/SENT.
 */
function resyncExistingThread_(threadId, leadEmail) {
  try {
    var thread = GmailApp.getThreadById(threadId);
    if (!thread) {
      return { ok: false, error: 'Thread ' + threadId + ' not found in mailbox' };
    }
    var account = EMAIL_MAILBOX_ACCOUNT || Session.getActiveUser().getEmail();
    return extractThreadMetadata_(thread, leadEmail, account);
  } catch (e) {
    return { ok: false, error: 'Resync failed: ' + String(e.message).substring(0, 200) };
  }
}


/* ═══════════════════════════════════════════════════════════════
   REPLY TYPE CLASSIFICATION
   ═══════════════════════════════════════════════════════════════ */

/**
 * Conservative reply type detection from a Gmail message.
 * Returns EMAIL_REPLY_TYPE value.
 */
function classifyReplyType_(message) {
  try {
    var subject = trimLower_(message.getSubject());
    var snippet = trimLower_(message.getPlainBody().substring(0, 500));

    // Bounce detection
    if (isBounceMessage_(subject, snippet, message)) {
      return EMAIL_REPLY_TYPE.BOUNCE;
    }

    // Out-of-office detection
    if (isOooMessage_(subject, snippet)) {
      return EMAIL_REPLY_TYPE.OOO;
    }

    // If we got here, it's some form of reply
    return EMAIL_REPLY_TYPE.REPLY;
  } catch (e) {
    return EMAIL_REPLY_TYPE.UNKNOWN;
  }
}


function isBounceMessage_(subject, snippet, message) {
  var from = trimLower_(message.getFrom());
  var bounceIndicators = [
    'mailer-daemon', 'postmaster', 'mail delivery',
    'delivery status', 'undeliverable', 'nedoručitelné',
    'delivery failed', 'failure notice', 'returned mail'
  ];
  for (var i = 0; i < bounceIndicators.length; i++) {
    if (from.indexOf(bounceIndicators[i]) !== -1 ||
        subject.indexOf(bounceIndicators[i]) !== -1) {
      return true;
    }
  }
  return false;
}


function isOooMessage_(subject, snippet) {
  var oooIndicators = [
    'out of office', 'mimo kancelář', 'automatická odpověď',
    'automatic reply', 'auto-reply', 'autoreply',
    'jsem mimo', 'na dovolené', 'nepřítomnost',
    'abwesenheitsnotiz'
  ];
  for (var i = 0; i < oooIndicators.length; i++) {
    if (subject.indexOf(oooIndicators[i]) !== -1 ||
        snippet.indexOf(oooIndicators[i]) !== -1) {
      return true;
    }
  }
  return false;
}


/* ═══════════════════════════════════════════════════════════════
   WRITE METADATA TO ROW
   ═══════════════════════════════════════════════════════════════ */

/**
 * Writes email metadata into extension columns for a single row.
 * Does NOT touch any business/sales fields.
 */
function writeEmailMetadata_(hr, row, data, account) {
  if (!data.ok) {
    hr.set(row, 'email_sync_status', EMAIL_SYNC_STATUS.ERROR);
    hr.set(row, 'email_last_error', data.error || 'Unknown error');
    return;
  }

  hr.set(row, 'email_thread_id', data.threadId);
  hr.set(row, 'email_last_message_id', data.messageId);
  hr.set(row, 'email_subject_last', data.subject);
  hr.set(row, 'email_mailbox_account', account);
  hr.set(row, 'email_reply_type', data.replyType);
  hr.set(row, 'email_last_error', '');

  if (data.lastSentAt) {
    hr.set(row, 'last_email_sent_at', data.lastSentAt);
  }
  if (data.lastReceivedAt) {
    hr.set(row, 'last_email_received_at', data.lastReceivedAt);
    hr.set(row, 'email_sync_status', EMAIL_SYNC_STATUS.REPLIED);
  } else {
    // Preserve SENT status if we sent but got no reply yet
    var curStatus = trimLower_(hr.get(row, 'email_sync_status'));
    if (curStatus !== 'sent') {
      hr.set(row, 'email_sync_status', EMAIL_SYNC_STATUS.LINKED);
    }
  }
}
