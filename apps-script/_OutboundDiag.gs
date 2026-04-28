/**
 * ============================================================
 *  _OutboundDiag.gs — Outbound sender diagnostic + safe TEST send
 *  TEMPORARY FILE. Delete after verification.
 *
 *  Why: investigates the actual From address used by Gmail.sendEmail
 *  in this Apps Script project, to verify outbound flow does not
 *  leak personal/legacy account (e.g. sfridrich@unipong.cz) as
 *  the From header for client communication.
 *
 *  Two functions:
 *    diagOutboundSender()        — READ-ONLY. Logs aliases, account,
 *                                   replyTo defaults. NO send.
 *    diagOutboundSafeTestSend()  — Sends ONE test email to
 *                                   info@autosmartweb.cz so the team
 *                                   can inspect the actual delivered
 *                                   From header. Hard-coded recipient.
 *
 *  Usage (Apps Script editor):
 *    1. Run diagOutboundSender    → check log output in _asw_logs
 *                                    or in editor execution transcript
 *    2. Run diagOutboundSafeTestSend → check info@autosmartweb.cz inbox
 *    3. Delete this file after verification
 *
 *  Constraints respected:
 *    - No external recipient
 *    - No bulk send
 *    - No mutation of LEADS / Ke kontaktování
 *    - Logs all relevant identity fields separately
 * ============================================================
 */

/**
 * READ-ONLY diagnostic. Logs:
 *   - Apps Script project owner / runtime account (mailbox sync account)
 *   - Available Gmail aliases (registered "Send mail as" addresses)
 *   - DEFAULT_REPLY_TO_EMAIL / DEFAULT_REPLY_TO_NAME from Config.gs
 *   - EMAIL_MAILBOX_ACCOUNT from Config.gs
 *   - Script Property OUTBOUND_FROM_EMAIL (if set; PROPOSED for KROK 7)
 *   - ASSIGNEE_PROFILES keys (allowed assignees)
 *
 * NO email is sent.
 */
function diagOutboundSender() {
  var report = {};

  // 1. Account that runs this Apps Script (= mailbox sync account
  //    + default From for GmailApp.sendEmail without options.from)
  try {
    report.runtime_account = Session.getActiveUser().getEmail();
  } catch (e) {
    report.runtime_account_error = String(e.message);
  }

  // 2. Gmail aliases — addresses Gmail allows the runtime account to
  //    use as "from" via "Send mail as" Settings. Only these can be
  //    passed to GmailApp.sendEmail({from: ...}) without exception.
  try {
    var aliases = GmailApp.getAliases();
    report.gmail_aliases = aliases || [];
    report.gmail_aliases_count = (aliases || []).length;
  } catch (e) {
    report.gmail_aliases_error = String(e.message);
  }

  // 3. Config.gs constants
  report.config_default_reply_to_email = (typeof DEFAULT_REPLY_TO_EMAIL !== 'undefined')
    ? DEFAULT_REPLY_TO_EMAIL : '(undefined)';
  report.config_default_reply_to_name = (typeof DEFAULT_REPLY_TO_NAME !== 'undefined')
    ? DEFAULT_REPLY_TO_NAME : '(undefined)';
  report.config_email_mailbox_account = (typeof EMAIL_MAILBOX_ACCOUNT !== 'undefined')
    ? (EMAIL_MAILBOX_ACCOUNT || '(empty — falls back to runtime_account)')
    : '(undefined)';
  report.config_dry_run = (typeof DRY_RUN !== 'undefined') ? DRY_RUN : '(undefined)';

  // 4. ASSIGNEE_PROFILES keys (allowed assignees for Reply-To)
  try {
    var profileKeys = [];
    if (typeof ASSIGNEE_PROFILES !== 'undefined') {
      for (var k in ASSIGNEE_PROFILES) {
        if (Object.prototype.hasOwnProperty.call(ASSIGNEE_PROFILES, k)) {
          profileKeys.push(k);
        }
      }
    }
    report.assignee_profiles_keys = profileKeys;
  } catch (e) {
    report.assignee_profiles_error = String(e.message);
  }

  // 5. Script Property OUTBOUND_FROM_EMAIL (PROPOSED — read if exists)
  try {
    var props = PropertiesService.getScriptProperties();
    report.script_prop_outbound_from_email =
      props.getProperty('OUTBOUND_FROM_EMAIL') || '(not set)';
    report.script_prop_outbound_from_name =
      props.getProperty('OUTBOUND_FROM_NAME') || '(not set)';
    report.script_prop_email_provider =
      props.getProperty('EMAIL_PROVIDER') || '(not set)';
    report.script_prop_email_dry_run =
      props.getProperty('EMAIL_DRY_RUN') || '(not set)';
    report.script_prop_outbound_mailbox_account =
      props.getProperty('OUTBOUND_MAILBOX_ACCOUNT') || '(not set)';
  } catch (e) {
    report.script_prop_error = String(e.message);
  }

  // 6. Compute verdict for current outbound behaviour
  report.verdict = (function () {
    var v = {};
    var alias = report.script_prop_outbound_from_email;
    var aliases = report.gmail_aliases || [];
    var aliasIsCompany = /@autosmartweb\.cz$/i.test(String(alias));
    var aliasIsRegistered = aliases.indexOf(alias) !== -1;

    v.outbound_from_property_set = alias !== '(not set)';
    v.outbound_from_property_is_company = aliasIsCompany;
    v.outbound_from_property_is_registered_alias = aliasIsRegistered;

    if (!v.outbound_from_property_set) {
      v.current_from_header = report.runtime_account +
        ' (no OUTBOUND_FROM_EMAIL → Gmail uses runtime account)';
      v.action_needed = 'Set Script Property OUTBOUND_FROM_EMAIL to a company alias ' +
        'AND register that address as "Send mail as" alias in Gmail Settings of ' +
        report.runtime_account;
    } else if (!aliasIsCompany) {
      v.current_from_header = '(would attempt: ' + alias + ')';
      v.action_needed = 'OUTBOUND_FROM_EMAIL is non-company (' + alias +
        '). Must be *@autosmartweb.cz address.';
    } else if (!aliasIsRegistered) {
      v.current_from_header = '(would attempt: ' + alias +
        ' but Gmail will reject — not in aliases)';
      v.action_needed = 'Register ' + alias + ' as "Send mail as" alias in Gmail ' +
        'Settings of ' + report.runtime_account +
        ' (Gmail Settings → Accounts → Send mail as → Add another email)';
    } else {
      v.current_from_header = alias + ' (Gmail will use this — alias is registered)';
      v.action_needed = 'NONE — outbound from is company-aligned and registered';
    }
    return v;
  })();

  // 7. Log the report (multiline JSON, easy to read in _asw_logs)
  var json = JSON.stringify(report, null, 2);
  Logger.log('=== diagOutboundSender ===\n' + json);
  try {
    aswLog_('INFO', 'diagOutboundSender', 'sender diagnostic', report);
  } catch (e) {
    Logger.log('aswLog_ failed: ' + e.message);
  }

  return report;
}

/**
 * SAFE TEST SEND — sends ONE email to info@autosmartweb.cz so the
 * team can inspect the actual delivered From header.
 *
 * Hard-coded recipient: info@autosmartweb.cz (internal mailbox).
 * Hard-coded subject:  "[ASW TEST] outbound sender verification"
 * Body: detected runtime account + aliases + replyTo + provider info.
 *
 * Uses CURRENT OutboundEmail.gs send path (GmailApp.sendEmail).
 * If options.from from Script Property OUTBOUND_FROM_EMAIL is
 * registered as alias, Gmail uses it. Otherwise Gmail falls back
 * to runtime account.
 *
 * After running:
 *   1. Open info@autosmartweb.cz inbox
 *   2. Find "[ASW TEST] outbound sender verification"
 *   3. View full headers (Show original / Zobrazit originál)
 *   4. Confirm From: header matches expected company address
 */
function diagOutboundSafeTestSend() {
  var INTERNAL_RECIPIENT = 'info@autosmartweb.cz';
  var SUBJECT = '[ASW TEST] outbound sender verification';

  var diag = diagOutboundSender();

  var bodyLines = [
    'Toto je TEST e-mail z Apps Script projektu Autosmartweby (CRM).',
    '',
    'Účelem testu je ověřit, jaká adresa skutečně dorazí jako From: header.',
    '',
    '--- Detected runtime ---',
    'runtime_account: ' + diag.runtime_account,
    'gmail_aliases: ' + JSON.stringify(diag.gmail_aliases || []),
    'config_default_reply_to_email: ' + diag.config_default_reply_to_email,
    'config_default_reply_to_name: ' + diag.config_default_reply_to_name,
    'config_email_mailbox_account: ' + diag.config_email_mailbox_account,
    'config_dry_run: ' + diag.config_dry_run,
    'script_prop_outbound_from_email: ' + diag.script_prop_outbound_from_email,
    'script_prop_outbound_from_name: ' + diag.script_prop_outbound_from_name,
    'assignee_profiles_keys: ' + JSON.stringify(diag.assignee_profiles_keys || []),
    '',
    '--- Verdict ---',
    'current_from_header: ' + diag.verdict.current_from_header,
    'action_needed: ' + diag.verdict.action_needed,
    '',
    '--- Sent at ---',
    new Date().toISOString(),
    '',
    'Po doručení zkontrolujte plné hlavičky e-mailu (Show original / ' +
      'Zobrazit originál v Gmail) a porovnejte:',
    '  - Hlavička From:  (musí být *@autosmartweb.cz, NE @unipong.cz)',
    '  - Hlavička Reply-To: (zde nastavená na ' +
      diag.config_default_reply_to_email + ')',
    '',
    'Po ověření smažte _OutboundDiag.gs ze projektu.'
  ];

  var body = bodyLines.join('\n');

  // Build options. Try options.from if OUTBOUND_FROM_EMAIL is set AND
  // is a registered alias; otherwise omit (Gmail will use runtime
  // account, which is exactly what we want to detect).
  var options = {
    replyTo: diag.config_default_reply_to_email,
    name: diag.config_default_reply_to_name
  };

  var outboundFrom = diag.script_prop_outbound_from_email;
  if (outboundFrom && outboundFrom !== '(not set)' &&
      diag.gmail_aliases && diag.gmail_aliases.indexOf(outboundFrom) !== -1) {
    options.from = outboundFrom;
  }

  Logger.log('=== diagOutboundSafeTestSend ===');
  Logger.log('recipient: ' + INTERNAL_RECIPIENT);
  Logger.log('subject:   ' + SUBJECT);
  Logger.log('options:   ' + JSON.stringify(options));

  try {
    GmailApp.sendEmail(INTERNAL_RECIPIENT, SUBJECT, body, options);

    var msg = 'TEST sent to ' + INTERNAL_RECIPIENT +
      '. Open inbox and inspect From: header. ' +
      'Used options.from=' + (options.from || '(not set — runtime account)');
    Logger.log(msg);
    try {
      aswLog_('INFO', 'diagOutboundSafeTestSend', msg, {
        recipient: INTERNAL_RECIPIENT,
        used_from: options.from || '(none)'
      });
    } catch (e) {}

    return { ok: true, recipient: INTERNAL_RECIPIENT, options: options };
  } catch (err) {
    var errMsg = 'TEST send failed: ' + String(err.message);
    Logger.log(errMsg);
    try {
      aswLog_('ERROR', 'diagOutboundSafeTestSend', errMsg);
    } catch (e) {}
    return { ok: false, error: errMsg };
  }
}
