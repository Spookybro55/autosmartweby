/**
 * ============================================================
 *  Menu.gs — Custom menus for the spreadsheet
 *  Load order: 6/6 (depends on all other files)
 *
 *  Every function referenced here is defined in:
 *    - PreviewPipeline.gs: setupPreviewExtension, qualifyLeads,
 *        processPreviewQueue, buildEmailDrafts, simulateAndWrite,
 *        auditCurrentSheetStructure, installProjectTriggers,
 *        runWebhookPilotTest, refreshProcessedPreviewCopy
 *    - ContactSheet.gs: evaluateContactReadiness, refreshContactingSheet,
 *        installContactEditTrigger
 *    - OutboundEmail.gs: createCrmDraft, sendCrmEmail
 *    - MailboxSync.gs: syncMailboxMetadata
 *    - GmailLabels.gs: ensureCrmLabels
 *    - LegacyWebCheck.gs: setSerperApiKey, runWebsiteCheck20/50/100
 *
 *  installMenuTrigger(): installs an installable onOpen trigger
 *    on the PRODUCTION spreadsheet so the custom menu appears
 *    even when the script is standalone (not container-bound).
 * ============================================================
 */

function onOpen() {
  var ui;
  try {
    ui = SpreadsheetApp.getUi();
  } catch (e) {
    // getUi() is not available in time-driven or installable trigger contexts
    return;
  }

  ui.createMenu('Autosmartweby CRM')
    .addItem('Setup preview extension',            'setupPreviewExtension')
    .addItem('Ensure lead IDs',                    'ensureLeadIds')
    .addSeparator()
    .addItem('Qualify leads',                      'qualifyLeads')
    .addItem('Process preview queue',              'processPreviewQueue')
    .addItem('Rebuild drafts',                     'buildEmailDrafts')
    .addSeparator()
    .addItem('Simulace + z\u00e1pis (dry run)',    'simulateAndWrite')
    .addItem('Audit sheet structure (read-only)',   'auditCurrentSheetStructure')
    .addSeparator()
    .addItem('Webhook pilot test (5-10 rows)',     'runWebhookPilotTest')
    .addSeparator()
    .addSubMenu(ui.createMenu('Ke kontaktov\u00e1n\u00ed')
      .addItem('Evaluate contact readiness',       'evaluateContactReadiness')
      .addItem('Refresh "Ke kontaktov\u00e1n\u00ed"', 'refreshContactingSheet'))
    .addSeparator()
    .addSubMenu(ui.createMenu('E-mail')
      .addItem('Create draft pro vybran\u00fd lead',   'createCrmDraft')
      .addItem('Odeslat e-mail pro vybran\u00fd lead', 'sendCrmEmail')
      .addSeparator()
      .addItem('Sync mailbox metadata',                'syncMailboxMetadata')
      .addItem('Ensure CRM labels (ASW/CRM)',          'ensureCrmLabels'))
    .addSeparator()
    .addItem('Install ALL triggers',               'installProjectTriggers')
    .addToUi();

  ui.createMenu('Web check')
    .addItem('Ulo\u017eit Serper API key',    'setSerperApiKey')
    .addSeparator()
    .addItem('Zkontrolovat 20 \u0159\u00e1dk\u016f',    'runWebsiteCheck20')
    .addItem('Zkontrolovat 50 \u0159\u00e1dk\u016f',    'runWebsiteCheck50')
    .addItem('Zkontrolovat 100 \u0159\u00e1dk\u016f',   'runWebsiteCheck100')
    .addToUi();
}


/**
 * Installs an installable onOpen trigger on the PRODUCTION CRM
 * spreadsheet so that the custom menu appears even though the
 * script is standalone (not container-bound).
 *
 * Run this ONCE from the Apps Script editor.
 * Requires authorization to access the production spreadsheet.
 */
function installMenuTrigger() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  // Remove any existing onOpen triggers to avoid duplicates
  var triggers = ScriptApp.getUserTriggers(ss);
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'onOpen'
        && triggers[i].getEventType() === ScriptApp.EventType.ON_OPEN) {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  ScriptApp.newTrigger('onOpen')
    .forSpreadsheet(ss)
    .onOpen()
    .create();

  safeAlert_(
    'Menu trigger installed.\n' +
    'Installable onOpen trigger was created for the production CRM.\n' +
    'The custom menu will now appear when you open the spreadsheet.');
}
