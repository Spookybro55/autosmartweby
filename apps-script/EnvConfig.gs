/**
 * ============================================================
 *  EnvConfig.gs — Runtime Environment Detection & Guards
 *  Load order: 0/6 (must load before Config.gs)
 * ============================================================
 *
 *  HOW IT WORKS
 *  ────────────
 *  Each Apps Script cloud project has its own Script Properties.
 *  When you create the TEST project, set these Script Properties:
 *
 *    ASW_ENV            = TEST
 *    ASW_SPREADSHEET_ID = 14U9CC0q5gpFr2p7CD1s4rf3i0lCettIVYIqrO8lsj9c
 *
 *  For the PROD project, set:
 *
 *    ASW_ENV            = PROD
 *    ASW_SPREADSHEET_ID = 1RBcLZkn3AruiqaQdJ7PHIxvCcoO5SC9Qnlw_NiLnpYc
 *
 *  If ASW_ENV is not set, the script defaults to TEST (safe default).
 *  If ASW_SPREADSHEET_ID is not set, it falls back to Config.gs constant.
 */

/* ── Known environment definitions ───────────────────────────── */
var ASW_ENVIRONMENTS = {
  PROD: {
    label: 'PROD',
    spreadsheetId: '1RBcLZkn3AruiqaQdJ7PHIxvCcoO5SC9Qnlw_NiLnpYc',
    color: '#cc0000'
  },
  TEST: {
    label: 'TEST',
    spreadsheetId: '14U9CC0q5gpFr2p7CD1s4rf3i0lCettIVYIqrO8lsj9c',
    color: '#0066cc'
  }
};

/* ── Singleton cache ─────────────────────────────────────────── */
var _envConfigCache = null;

/**
 * Returns the current environment config object.
 * Reads Script Properties once and caches for the execution lifetime.
 *
 * @return {{env: string, spreadsheetId: string, label: string, isProduction: boolean, isTest: boolean}}
 */
function getEnvConfig_() {
  if (_envConfigCache) return _envConfigCache;

  var props = PropertiesService.getScriptProperties();
  var env = (props.getProperty('ASW_ENV') || 'TEST').toUpperCase().trim();

  // Validate environment name
  if (!ASW_ENVIRONMENTS[env]) {
    Logger.log('[WARN] Unknown ASW_ENV="' + env + '", falling back to TEST');
    env = 'TEST';
  }

  var envDef = ASW_ENVIRONMENTS[env];

  // Spreadsheet ID: Script Property > env definition > Config.gs fallback
  var ssId = props.getProperty('ASW_SPREADSHEET_ID');
  if (!ssId || ssId.trim() === '') {
    ssId = envDef.spreadsheetId;
  }

  _envConfigCache = {
    env: env,
    label: '[' + env + ']',
    spreadsheetId: ssId,
    expectedSpreadsheetId: envDef.spreadsheetId,
    isProduction: env === 'PROD',
    isTest: env !== 'PROD'
  };

  return _envConfigCache;
}

/**
 * Returns the environment-resolved SPREADSHEET_ID.
 * Use this instead of the raw SPREADSHEET_ID constant.
 */
function getSpreadsheetId_() {
  return getEnvConfig_().spreadsheetId;
}

/**
 * Returns true if running in PROD environment.
 */
function isProduction_() {
  return getEnvConfig_().isProduction;
}

/* ── Guards ───────────────────────────────────────────────────── */

/**
 * Validates that the active spreadsheet matches the expected environment.
 * Call this at the start of any destructive or trigger-based operation.
 *
 * @param {string=} actualSsId  Optional spreadsheet ID to check.
 *                               Defaults to the configured spreadsheet.
 * @return {boolean} true if OK
 * @throws {Error} if mismatch detected and env is PROD
 */
function envGuard_(actualSsId) {
  var cfg = getEnvConfig_();
  var checkId = actualSsId || cfg.spreadsheetId;

  // Check if someone accidentally connected PROD code to TEST sheet or vice versa
  if (cfg.isProduction && checkId !== ASW_ENVIRONMENTS.PROD.spreadsheetId) {
    var msg = 'PROD environment but spreadsheet ID does not match PROD sheet! ' +
              'Expected: ' + ASW_ENVIRONMENTS.PROD.spreadsheetId + ', ' +
              'Got: ' + checkId;
    Logger.log('[CRITICAL] ' + msg);
    throw new Error('ENV GUARD: ' + msg);
  }

  if (cfg.isTest && checkId === ASW_ENVIRONMENTS.PROD.spreadsheetId) {
    var msg2 = 'TEST environment but pointing to PROD spreadsheet! ' +
               'This would write test data into production.';
    Logger.log('[CRITICAL] ' + msg2);
    throw new Error('ENV GUARD: ' + msg2);
  }

  return true;
}

/**
 * Shows a toast or alert with the current environment.
 * Useful for visual confirmation when opening the sheet.
 *
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet=} ss  Spreadsheet object.
 */
function showEnvBanner_(ss) {
  var cfg = getEnvConfig_();
  try {
    var sheet = ss || SpreadsheetApp.getActiveSpreadsheet();
    if (sheet && sheet.toast) {
      sheet.toast(
        'Environment: ' + cfg.env + '\nSheet: ' + cfg.spreadsheetId.substring(0, 12) + '...',
        cfg.label + ' Autosmartweby',
        5
      );
    }
  } catch (e) {
    // toast not available (e.g. time-driven trigger) — ignore
  }
}

/**
 * Returns a prefixed log string for the current environment.
 * Use in aswLog_ to distinguish TEST vs PROD entries.
 *
 * @param {string} message
 * @return {string}
 */
function envLogPrefix_(message) {
  return getEnvConfig_().label + ' ' + message;
}

/**
 * Diagnostic: dumps current environment config to Logger.
 * Run manually from Apps Script editor to verify setup.
 */
function diagEnvConfig() {
  var cfg = getEnvConfig_();
  var lines = [
    '=== Autosmartweby Environment Diagnostic ===',
    'ASW_ENV:            ' + cfg.env,
    'Spreadsheet ID:     ' + cfg.spreadsheetId,
    'Expected SS ID:     ' + cfg.expectedSpreadsheetId,
    'Is Production:      ' + cfg.isProduction,
    'Is Test:            ' + cfg.isTest,
    'Label:              ' + cfg.label,
    '============================================='
  ];
  lines.forEach(function(l) { Logger.log(l); });

  // Also run the guard to check consistency
  try {
    envGuard_();
    Logger.log('ENV GUARD: OK — spreadsheet matches environment.');
  } catch (e) {
    Logger.log('ENV GUARD: FAILED — ' + e.message);
  }
}
