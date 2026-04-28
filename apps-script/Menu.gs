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
 *    on the spreadsheet for the CURRENT environment
 *    even when the script is standalone (not container-bound).
 * ============================================================
 */

function onOpen() {
  // Show environment banner on spreadsheet open
  try { showEnvBanner_(); } catch (e) { /* EnvConfig not available */ }

  var ui;
  try {
    ui = SpreadsheetApp.getUi();
  } catch (e) {
    // getUi() is not available in time-driven or installable trigger contexts
    return;
  }

  ui.createMenu('Autosmartweby CRM')
    .addItem('Setup preview extension', 'setupPreviewExtension')
    .addItem('Setup email templates', 'setupEmailTemplates')
    .addItem('Setup scrape history', 'setupScrapeHistory')
    .addItem('Reap stuck scrape jobs', 'manualReapStuckJob')
    .addItem('Migrate legacy assignees → bootstrap', 'migrateAndBootstrap')
    .addItem('Bootstrap no-website v1 (only)', 'bootstrapNoWebsiteV1')
    .addItem('Ensure lead IDs', 'ensureLeadIds')
    .addSeparator()
    .addItem('Qualify leads', 'qualifyLeads')
    .addItem('Process preview queue', 'processPreviewQueue')
    .addItem('Rebuild drafts', 'buildEmailDrafts')
    .addSeparator()
    .addItem('Simulace + zápis (dry run)', 'simulateAndWrite')
    .addItem('Audit sheet structure (read-only)', 'auditCurrentSheetStructure')
    .addItem('Audit lead IDs (read-only)', 'auditLeadIds')
    .addSeparator()
    .addItem('Webhook pilot test (5-10 rows)', 'runWebhookPilotTest')
    .addSeparator()
    .addSubMenu(
      ui.createMenu('Ingest report')
        .addItem('Report pro source_job_id…', 'generateIngestReportPrompt')
        .addItem('Report pro vsechny joby', 'generateIngestReportsForAllJobs')
    )
    .addSeparator()
    .addItem('🔄 Import raw → LEADS', 'processRawImportBatch')
    .addSeparator()
    .addSubMenu(
      ui.createMenu('Ke kontaktování')
        .addItem('Evaluate contact readiness', 'evaluateContactReadiness')
        .addItem('Refresh "Ke kontaktování"', 'refreshContactingSheet')
    )
    .addSeparator()
    .addSubMenu(
      ui.createMenu('E-mail')
        .addItem('Create draft pro vybraný lead', 'createCrmDraft')
        .addItem('Odeslat e-mail pro vybraný lead', 'sendCrmEmail')
        .addSeparator()
        .addItem('Sync mailbox metadata', 'syncMailboxMetadata')
        .addItem('Ensure CRM labels (ASW/CRM)', 'ensureCrmLabels')
    )
    .addSeparator()
    .addItem('Install ALL triggers', 'installProjectTriggers')
    .addToUi();

  ui.createMenu('Web check')
    .addItem('Uložit Serper API key', 'setSerperApiKey')
    .addSeparator()
    .addItem('Zkontrolovat 20 řádků', 'runWebsiteCheck20')
    .addItem('Zkontrolovat 50 řádků', 'runWebsiteCheck50')
    .addItem('Zkontrolovat 100 řádků', 'runWebsiteCheck100')
    .addToUi();
}


/**
 * Installs an installable onOpen trigger on the spreadsheet
 * for the CURRENT environment so that the custom menu appears
 * even though the script is standalone (not container-bound).
 *
 * Run this ONCE from the Apps Script editor.
 * Requires authorization to access the current environment spreadsheet.
 */
function installMenuTrigger() {
  var spreadsheetId = getSpreadsheetId_();
  try { envGuard_(spreadsheetId); } catch (e) { throw e; }

  var ss = SpreadsheetApp.openById(spreadsheetId);

  // Remove any existing onOpen triggers to avoid duplicates
  var triggers = ScriptApp.getUserTriggers(ss);
  for (var i = 0; i < triggers.length; i++) {
    if (
      triggers[i].getHandlerFunction() === 'onOpen' &&
      triggers[i].getEventType() === ScriptApp.EventType.ON_OPEN
    ) {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  ScriptApp.newTrigger('onOpen')
    .forSpreadsheet(ss)
    .onOpen()
    .create();

  var envLabel = 'CURRENT';
  try { envLabel = getEnvConfig_().env; } catch (e) { /* ignore */ }

  safeAlert_(
    'Menu trigger installed.\n' +
    'Installable onOpen trigger was created for environment: ' + envLabel + '.\n' +
    'The custom menu will now appear when you open the spreadsheet.'
  );
}