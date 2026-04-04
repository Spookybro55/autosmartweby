/**
 * ============================================================
 *  Helpers.gs — HeaderResolver, logging, spreadsheet access, utils
 *  Load order: 2/5 (depends on Config.gs)
 * ============================================================
 */

/* ═══════════════════════════════════════════════════════════════
   Safe UI — works from menu AND from editor Run button
   ═══════════════════════════════════════════════════════════════ */

/**
 * Show alert dialog if possible, otherwise log to Logger.
 * SpreadsheetApp.getUi() throws when called outside menu/dialog context.
 */
function safeAlert_(message) {
  try {
    SpreadsheetApp.getUi().alert(String(message).substring(0, 2000));
  } catch (e) {
    Logger.log(message);
  }
}

/**
 * Show YES/NO confirmation. Returns true if user clicks YES.
 * Falls back to true (proceed) when UI is not available.
 */
function safeConfirm_(title, message) {
  try {
    var ui = SpreadsheetApp.getUi();
    var result = ui.alert(title, message, ui.ButtonSet.YES_NO);
    return result === ui.Button.YES;
  } catch (e) {
    Logger.log('CONFIRM (auto-YES, no UI): ' + title + ' — ' + message);
    return true;
  }
}


/* ═══════════════════════════════════════════════════════════════
   HeaderResolver — handles duplicate header names safely
   ═══════════════════════════════════════════════════════════════ */

/**
 * Build a resolver from a raw header row array.
 *
 *   var hr = buildHeaderResolver(headers);
 *   hr.col('email')           → 1-based column index
 *   hr.col('status', 0)       → first  "status"
 *   hr.col('status', 1)       → second "status"
 *   hr.get(rowArr, 'email')   → cell value
 *   hr.set(rowArr, 'email', v)→ sets value in array
 *   hr.has('email')           → true/false
 *   hr.duplicates()           → { status: [14, 30] }
 */
function buildHeaderResolver(headerRow) {
  var nameMap = {};
  for (var i = 0; i < headerRow.length; i++) {
    var name = String(headerRow[i] || '').trim().toLowerCase();
    if (!name) continue;
    if (!nameMap[name]) nameMap[name] = [];
    nameMap[name].push(i + 1);
  }

  return {
    col: function(name, occurrence) {
      var key = String(name).trim().toLowerCase();
      var occ = occurrence || 0;
      if (!nameMap[key] || !nameMap[key][occ]) {
        throw new Error('Header "' + name + '" (occ ' + occ + ') not found');
      }
      return nameMap[key][occ];
    },

    colOrNull: function(name, occurrence) {
      var key = String(name).trim().toLowerCase();
      var occ = occurrence || 0;
      if (!nameMap[key] || !nameMap[key][occ]) return null;
      return nameMap[key][occ];
    },

    idx: function(name, occurrence) {
      return this.col(name, occurrence) - 1;
    },

    idxOrNull: function(name, occurrence) {
      var c = this.colOrNull(name, occurrence);
      return c === null ? null : c - 1;
    },

    get: function(rowArr, name, occurrence) {
      var i = this.idxOrNull(name, occurrence);
      if (i === null) return '';
      return rowArr[i] !== undefined ? rowArr[i] : '';
    },

    set: function(rowArr, name, value, occurrence) {
      var i = this.idx(name, occurrence);
      rowArr[i] = value;
    },

    has: function(name) {
      return !!nameMap[String(name).trim().toLowerCase()];
    },

    row: function(dataRow) {
      var obj = {};
      var seen = {};
      for (var i = 0; i < headerRow.length; i++) {
        var raw = String(headerRow[i] || '').trim().toLowerCase();
        if (!raw) continue;
        if (!seen[raw]) seen[raw] = 0;
        var occIdx = seen[raw];
        seen[raw]++;
        var key = (nameMap[raw] && nameMap[raw].length > 1)
          ? raw + '_' + occIdx
          : raw;
        obj[key] = dataRow[i];
      }
      return obj;
    },

    allHeaders: function() {
      return headerRow.map(function(h) { return String(h || ''); });
    },

    duplicates: function() {
      var dupes = {};
      for (var key in nameMap) {
        if (nameMap[key].length > 1) dupes[key] = nameMap[key].slice();
      }
      return dupes;
    },

    width: function() {
      return headerRow.length;
    }
  };
}


/* ═══════════════════════════════════════════════════════════════
   Spreadsheet access
   ═══════════════════════════════════════════════════════════════ */

function openCrmSpreadsheet_() {
  try {
    return SpreadsheetApp.openById(SPREADSHEET_ID);
  } catch (e) {
    throw new Error('Cannot open spreadsheet ' + SPREADSHEET_ID + ': ' + e.message);
  }
}

function getExternalSheet_(ss) {
  var s = ss || openCrmSpreadsheet_();
  var sheet = s.getSheetByName(MAIN_SHEET_NAME);
  if (!sheet) throw new Error('Sheet "' + MAIN_SHEET_NAME + '" not found');
  return sheet;
}

function getHeaderResolver_(sheet) {
  var lastCol = sheet.getLastColumn();
  if (lastCol < 1) throw new Error('Sheet has no columns');
  var headers = sheet.getRange(HEADER_ROW, 1, 1, lastCol).getValues()[0];
  return buildHeaderResolver(headers);
}

function readAllData_(sheet) {
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < DATA_START_ROW) {
    return { data: [], lastRow: lastRow, lastCol: lastCol };
  }
  var numRows = lastRow - HEADER_ROW;
  var data = sheet.getRange(DATA_START_ROW, 1, numRows, lastCol).getValues();
  return { data: data, lastRow: lastRow, lastCol: lastCol };
}


/* ═══════════════════════════════════════════════════════════════
   FIX #3 — Guard: ensure extension columns exist before pipeline ops
   ═══════════════════════════════════════════════════════════════ */

/**
 * Check that all EXTENSION_COLUMNS exist in the sheet.
 * Returns true if ready, false if not (and shows user-friendly alert).
 * Call this at the top of qualifyLeads, processPreviewQueue, buildEmailDrafts.
 */
function ensurePreviewExtensionReady_(sheet) {
  var lastCol = sheet.getLastColumn();
  if (lastCol < 1) {
    aswLog_('ERROR', 'ensurePreviewExtensionReady_', 'Sheet has no columns');
    safeAlert_('Chyba: Sheet nemá žádné sloupce.\nSpusťte nejprve "Setup preview extension".');
    return false;
  }

  var headers = sheet.getRange(HEADER_ROW, 1, 1, lastCol).getValues()[0];
  var existingSet = {};
  for (var i = 0; i < headers.length; i++) {
    var h = String(headers[i] || '').trim().toLowerCase();
    if (h) existingSet[h] = true;
  }

  var missing = [];
  for (var c = 0; c < EXTENSION_COLUMNS.length; c++) {
    if (!existingSet[EXTENSION_COLUMNS[c].toLowerCase()]) {
      missing.push(EXTENSION_COLUMNS[c]);
    }
  }

  if (missing.length > 0) {
    var msg = 'Chybí ' + missing.length + ' rozšiřujících sloupců.\n' +
      'Spusťte nejprve "Autosmartweby CRM → Setup preview extension".\n\n' +
      'Chybějící: ' + missing.slice(0, 5).join(', ') +
      (missing.length > 5 ? ' ...(+' + (missing.length - 5) + ')' : '');
    aswLog_('WARN', 'ensurePreviewExtensionReady_', msg);
    safeAlert_(msg);
    return false;
  }

  return true;
}


/* ═══════════════════════════════════════════════════════════════
   Logging — _asw_logs sheet
   ═══════════════════════════════════════════════════════════════ */

function ensureLogSheet_(ss) {
  ss = ss || openCrmSpreadsheet_();
  var logSheet = ss.getSheetByName(LOG_SHEET_NAME);
  if (!logSheet) {
    logSheet = ss.insertSheet(LOG_SHEET_NAME);
    logSheet.getRange(1, 1, 1, 7).setValues([[
      'timestamp', 'level', 'function', 'row', 'lead_id', 'message', 'payload'
    ]]);
    logSheet.setFrozenRows(1);
    logSheet.setColumnWidth(6, 400);
    logSheet.setColumnWidth(7, 300);
  }
  return logSheet;
}

/**
 * Validates that LEGACY_COL positions still match actual sheet headers.
 * Returns { ok: true } or { ok: false, mismatches: [...] }.
 */
function validateLegacyColHeaders_(sourceSheet) {
  var headerRow = sourceSheet.getRange(HEADER_ROW, 1, 1, sourceSheet.getLastColumn()).getValues()[0];
  var mismatches = [];
  var cols = Object.keys(LEGACY_COL_HEADERS);
  for (var i = 0; i < cols.length; i++) {
    var colNum = Number(cols[i]);
    var expected = LEGACY_COL_HEADERS[colNum];
    var actual = String(headerRow[colNum - 1] || '').trim().toLowerCase();
    if (actual !== expected) {
      mismatches.push('col ' + colNum + ': expected "' + expected + '", got "' + actual + '"');
    }
  }
  return mismatches.length === 0
    ? { ok: true }
    : { ok: false, mismatches: mismatches };
}

function aswLog_(level, fnName, message, opts) {
  opts = opts || {};
  try {
    var logSheet = ensureLogSheet_();

    // Log rotation: prune oldest 1000 rows when sheet exceeds 5000
    var rowCount = logSheet.getLastRow();
    if (rowCount > 5000) {
      logSheet.deleteRows(2, 1000);
    }

    logSheet.appendRow([
      new Date(),
      level,
      fnName,
      opts.row || '',
      opts.leadId || '',
      String(message).substring(0, 1000),
      opts.payload ? JSON.stringify(opts.payload).substring(0, 1000) : ''
    ]);
  } catch (e) {
    Logger.log('[' + level + '] ' + fnName + ': ' + message);
  }
}


/* ═══════════════════════════════════════════════════════════════
   String / normalization utilities
   ═══════════════════════════════════════════════════════════════ */

function removeDiacritics_(str) {
  return String(str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function normalizePhone_(phone) {
  return String(phone || '').replace(/[^\d+]/g, '').trim();
}

function trimLower_(val) {
  return String(val == null ? '' : val).trim().toLowerCase();
}

function isBlank_(val) {
  return String(val || '').trim() === '';
}

function extractBusinessDomainFromEmail_(email) {
  var cleaned = trimLower_(email);
  if (!cleaned || cleaned.indexOf('@') === -1) return '';
  var domain = cleaned.split('@')[1].trim();
  if (!domain || domain.indexOf('.') === -1) return '';
  for (var i = 0; i < FREE_EMAIL_DOMAINS.length; i++) {
    if (domain === FREE_EMAIL_DOMAINS[i]) return '';
  }
  return domain.replace(/^www\./, '');
}

function extractDomainFromUrl_(url) {
  var s = trimLower_(url);
  if (!s) return '';
  try {
    if (s.indexOf('://') === -1) s = 'https://' + s;
    var match = s.match(/^https?:\/\/([^\/\?#]+)/);
    if (!match) return '';
    return match[1].replace(/^www\./, '');
  } catch (e) {
    return '';
  }
}

function normalizeBusinessName_(name) {
  var s = removeDiacritics_(trimLower_(name));
  s = s.replace(/\b(s\.?r\.?o\.?|spol\.?\s*s\s*r\.?\s*o\.?|a\.?\s*s\.?|v\.?\s*o\.?\s*s\.?|k\.?\s*s\.?)\b/g, '');
  s = s.replace(/[^a-z0-9]+/g, ' ').trim();
  return s;
}

function isBlockedResult_(url) {
  try {
    var match = url.match(/^https?:\/\/([^\/]+)/);
    if (!match) return true;
    var host = match[1].toLowerCase().replace(/^www\./, '');
    for (var i = 0; i < BLOCKED_HOST_FRAGMENTS.length; i++) {
      if (host.indexOf(BLOCKED_HOST_FRAGMENTS[i]) !== -1) return true;
    }
    return false;
  } catch (e) {
    return true;
  }
}

function canonicalizeUrl_(url) {
  try {
    var s = String(url || '');
    if (s.indexOf('http') !== 0) s = 'https://' + s;
    var match = s.match(/^(https?:\/\/[^\/\?#]+)/);
    return match ? match[1] : '';
  } catch (e) {
    return '';
  }
}


/* ═══════════════════════════════════════════════════════════════
   Website state resolution — conflict-safe
   ═══════════════════════════════════════════════════════════════ */

/**
 * Values that mean the website_url field does NOT contain a real URL.
 */
var INVALID_URL_VALUES_ = [
  'nenalezeno', 'nenalezen', 'nezjisteno', 'neexistuje',
  'n/a', 'na', 'ne', 'no', 'none', '-', '—', ''
];

/**
 * Check if a website_url value looks like a real URL.
 * Returns true for anything that starts with http(s) or contains a dot
 * and is not in the invalid-values list.
 */
function isRealUrl_(url) {
  var s = trimLower_(url);
  if (!s) return false;
  for (var i = 0; i < INVALID_URL_VALUES_.length; i++) {
    if (s === INVALID_URL_VALUES_[i]) return false;
  }
  // Must contain a dot (domain) or protocol
  return s.indexOf('.') !== -1 || s.indexOf('://') !== -1;
}

/**
 * Resolve the actual website situation by cross-checking:
 *   - has_website  (declared flag)
 *   - website_url  (actual URL field)
 *   - website_quality
 *   - has_cta, mobile_ok
 *
 * Returns one of:
 *   'NO_WEBSITE'   — we're confident there's no website
 *   'HAS_WEBSITE'  — has a decent website (don't claim it's missing)
 *   'WEAK_WEBSITE' — has a website but with known issues
 *   'CONFLICT'     — data is contradictory, be cautious
 *   'UNKNOWN'      — not enough info to determine
 *
 * Priority: opatrnost > jistota. When in doubt → UNKNOWN or CONFLICT.
 */
function resolveWebsiteState_(rd) {
  var hasWebsite  = trimLower_(rd.has_website || '');
  var websiteUrl  = String(rd.website_url || '').trim();
  var webQuality  = removeDiacritics_(trimLower_(rd.website_quality || ''));
  var hasCta      = trimLower_(rd.has_cta || '');
  var mobileOk    = trimLower_(rd.mobile_ok || '');

  var flagSaysNo  = (hasWebsite === 'no' || hasWebsite === 'ne' || hasWebsite === 'false' || hasWebsite === '0');
  var flagSaysYes = (hasWebsite === 'yes' || hasWebsite === 'ano' || hasWebsite === 'true' || hasWebsite === '1');
  var flagEmpty   = isBlank_(hasWebsite);
  var urlIsReal   = isRealUrl_(websiteUrl);

  // --- Conflict detection ---
  // has_website=no but there's a real URL → CONFLICT
  if (flagSaysNo && urlIsReal) {
    return 'CONFLICT';
  }
  // has_website=yes but URL is missing/invalid → CONFLICT
  if (flagSaysYes && !urlIsReal) {
    return 'CONFLICT';
  }

  // --- No website (both signals agree or flag is clear + no URL) ---
  if (flagSaysNo && !urlIsReal) {
    return 'NO_WEBSITE';
  }
  if (flagEmpty && !urlIsReal) {
    return 'NO_WEBSITE';
  }

  // --- Has a URL (real) — check quality ---
  if (urlIsReal) {
    // Weak website indicators
    var isWeak = false;
    if (webQuality) {
      for (var i = 0; i < WEAK_WEBSITE_KEYWORDS.length; i++) {
        if (webQuality.indexOf(WEAK_WEBSITE_KEYWORDS[i]) !== -1) { isWeak = true; break; }
      }
    }
    if (!isWeak && (hasCta === 'no' || hasCta === 'ne' || hasCta === 'false')) isWeak = true;
    if (!isWeak && (mobileOk === 'no' || mobileOk === 'ne' || mobileOk === 'false')) isWeak = true;

    if (isWeak) return 'WEAK_WEBSITE';
    return 'HAS_WEBSITE';
  }

  return 'UNKNOWN';
}


/* ═══════════════════════════════════════════════════════════════
   Czech copy helpers — natural, grammatically safe
   ═══════════════════════════════════════════════════════════════ */

/**
 * Lokativ for the most common Czech cities.
 * For unknown cities, returns a preposition-free phrase.
 */
var CITY_LOCATIVES_ = {
  'praha': 'v Praze',
  'brno': 'v Brně',
  'ostrava': 'v Ostravě',
  'plzeň': 'v Plzni',
  'plzen': 'v Plzni',
  'liberec': 'v Liberci',
  'olomouc': 'v Olomouci',
  'české budějovice': 'v Českých Budějovicích',
  'ceske budejovice': 'v Českých Budějovicích',
  'hradec králové': 'v Hradci Králové',
  'hradec kralove': 'v Hradci Králové',
  'ústí nad labem': 'v Ústí nad Labem',
  'usti nad labem': 'v Ústí nad Labem',
  'pardubice': 'v Pardubicích',
  'zlín': 've Zlíně',
  'zlin': 've Zlíně',
  'havířov': 'v Havířově',
  'havirov': 'v Havířově',
  'kladno': 'v Kladně',
  'most': 'v Mostě',
  'opava': 'v Opavě',
  'frýdek-místek': 've Frýdku-Místku',
  'karviná': 'v Karviné',
  'karvina': 'v Karviné',
  'jihlava': 'v Jihlavě',
  'teplice': 'v Teplicích',
  'děčín': 'v Děčíně',
  'decin': 'v Děčíně',
  'karlovy vary': 'v Karlových Varech',
  'jablonec nad nisou': 'v Jablonci nad Nisou',
  'mladá boleslav': 'v Mladé Boleslavi',
  'mlada boleslav': 'v Mladé Boleslavi',
  'prostějov': 'v Prostějově',
  'přerov': 'v Přerově',
  'česká lípa': 'v České Lípě',
  'třebíč': 'v Třebíči',
  'třinec': 'v Třinci',
  'tábor': 'v Táboře',
  'znojmo': 've Znojmě',
  'příbram': 'v Příbrami',
  'cheb': 'v Chebu',
  'kolín': 'v Kolíně',
  'písek': 'v Písku',
  'kroměříž': 'v Kroměříži',
  'chomutov': 'v Chomutově',
  'šumperk': 'v Šumperku',
  'vsetín': 've Vsetíně',
  'valašské meziříčí': 've Valašském Meziříčí',
  'litoměřice': 'v Litoměřicích',
  'nový jičín': 'v Novém Jičíně',
  'uherské hradiště': 'v Uherském Hradišti',
  'břeclav': 'v Břeclavi',
  'hodonín': 'v Hodoníně',
  'vyškov': 've Vyškově',
  'blansko': 'v Blansku',
  'beroun': 'v Berouně',
  'kutná hora': 'v Kutné Hoře',
  'sokolov': 'v Sokolově',
  'rokycany': 'v Rokycanech',
  'strakonice': 've Strakonicích',
  'chrudim': 'v Chrudimi',
  'svitavy': 've Svitavách',
  'žďár nad sázavou': 've Žďáru nad Sázavou',
  'nymburk': 'v Nymburce',
  'benešov': 'v Benešově',
  'louny': 'v Lounech',
  'rakovník': 'v Rakovníku',
  'pelhřimov': 'v Pelhřimově',
  'domažlice': 'v Domažlicích',
  'klatovy': 'v Klatovech',
  'prachatice': 'v Prachaticích',
  'jeseník': 'v Jeseníku',
  'bruntál': 'v Bruntálu',
  'frýdlant': 've Frýdlantu',
  'semily': 'v Semilech',
  'trutnov': 'v Trutnově',
  'náchod': 'v Náchodě',
  'rychnov nad kněžnou': 'v Rychnově nad Kněžnou',
  'ústí nad orlicí': 'v Ústí nad Orlicí',
  'česká třebová': 'v České Třebové',
  'žatec': 'v Žatci',
  'litvínov': 'v Litvínově',
  'jirkov': 'v Jirkově',
  'kadaň': 'v Kadani',
  'kralupy nad vltavou': 'v Kralupech nad Vltavou',
  'mělník': 'v Mělníku',
  'brandýs nad labem': 'v Brandýse nad Labem',
  'říčany': 'v Říčanech',
  'černošice': 'v Černošicích'
};

/**
 * Build a location phrase in lokativ if possible, otherwise
 * use a preposition-free fallback that avoids grammatical errors.
 *
 * Known city → "v Praze"
 * Unknown city → "– Praha" or "– oblast Praha"
 */
function formatLocationPhrase_(city, area) {
  if (!city && !area) return '';

  if (city) {
    var key = trimLower_(city);
    // Try exact match first
    if (CITY_LOCATIVES_[key]) return CITY_LOCATIVES_[key];
    // Try without diacritics
    var keyNorm = removeDiacritics_(key);
    if (CITY_LOCATIVES_[keyNorm]) return CITY_LOCATIVES_[keyNorm];
    // Try matching known keys without diacritics
    for (var k in CITY_LOCATIVES_) {
      if (removeDiacritics_(k) === keyNorm) return CITY_LOCATIVES_[k];
    }
    // Fallback: use dash to avoid wrong declension
    return '– ' + city.trim();
  }

  if (area) return '– oblast ' + area.trim();
  return '';
}

/**
 * Build a natural Czech headline that avoids raw concatenation.
 * Never produces "instalatér v Praha" — either uses lokativ or avoids the preposition.
 */
function buildNaturalHeadline_(bName, serviceType, city) {
  var loc = formatLocationPhrase_(city);

  if (bName && serviceType && loc) {
    // "Novák Instalatér – Praze" doesn't work; use structure that reads naturally
    if (loc.charAt(0) === 'v' || loc.charAt(0) === 'V') {
      // lokativ available: "Novák Instalatér | Služby v Praze"
      return bName + ' | ' + serviceType + ' ' + loc;
    }
    // dash fallback: "Novák Instalatér – Praha"
    return bName + ' | ' + serviceType + ' ' + loc;
  }
  if (bName && loc) return bName + ' ' + loc;
  if (bName && serviceType) return bName + ' – ' + serviceType;
  return bName || 'Webová prezentace';
}

/**
 * Build a natural subheadline.
 * Avoids "Spolehlivé instalatér v Praha" — uses safe patterns.
 */
function buildNaturalSubheadline_(serviceType, city, painPoint) {
  if (painPoint) return painPoint;

  var loc = formatLocationPhrase_(city);

  if (serviceType && loc) {
    if (loc.charAt(0) === 'v' || loc.charAt(0) === 'V') {
      // "Profesionální služby v Praze a okolí"
      return 'Profesionální služby ' + loc + ' a okolí';
    }
    // "Profesionální služby – Praha a okolí"
    return 'Profesionální služby ' + loc + ' a okolí';
  }
  if (serviceType) return serviceType + ' – spolehlivě a na míru';
  if (loc) return 'Lokální služby ' + loc;
  return 'Přehledná prezentace služeb a snadný kontakt';
}


/**
 * Convert raw service_type into a natural Czech noun phrase.
 * "instalatér" → "instalatérské služby"
 * "elektrikář" → "elektrikářské služby"
 * Unknown → returns as-is (lowercased)
 */
function humanizeServiceType_(serviceType) {
  var s = trimLower_(serviceType);
  if (!s) return '';

  // Map of raw values → natural phrases
  var map = {
    'instalater': 'instalatérské služby',
    'instalatér': 'instalatérské služby',
    'vodoinstalace': 'vodoinstalační služby',
    'elektrikar': 'elektrikářské služby',
    'elektrikář': 'elektrikářské služby',
    'elektroinstalace': 'elektroinstalační služby',
    'zamecnik': 'zámečnické služby',
    'zámečník': 'zámečnické služby',
    'malar': 'malířské služby',
    'malíř': 'malířské služby',
    'zednik': 'zednické práce',
    'zedník': 'zednické práce',
    'uklid': 'úklidové služby',
    'úklid': 'úklidové služby',
    'zahradnik': 'zahradnické služby',
    'zahradník': 'zahradnické služby',
    'autoservis': 'autoservisní služby',
    'kadernik': 'kadeřnické služby',
    'kadeřník': 'kadeřnické služby',
    'beauty': 'kosmetické služby',
    'kosmetika': 'kosmetické služby',
    'restaurace': 'restaurační služby',
    'topenar': 'topenářské služby',
    'topenář': 'topenářské služby',
    'klempir': 'klempířské služby',
    'klempíř': 'klempířské služby',
    'truhlář': 'truhlářské služby',
    'truhlar': 'truhlářské služby',
    'pokryvac': 'pokrývačské služby',
    'pokrývač': 'pokrývačské služby',
    'stavba': 'stavební práce',
    'stavby': 'stavební práce',
    'rekonstrukce': 'rekonstrukční práce',
    'podlahar': 'podlahářské služby',
    'podlahář': 'podlahářské služby',
    'čištění': 'čisticí služby',
    'servis': 'servisní služby',
    'opravy': 'opravářské služby',
    'údržba': 'údržbářské služby'
  };

  // Try exact match
  var normalized = removeDiacritics_(s);
  if (map[s]) return map[s];
  if (map[normalized]) return map[normalized];

  // Try matching keys without diacritics
  for (var k in map) {
    if (removeDiacritics_(k) === normalized) return map[k];
  }

  // If it already ends with common service suffixes, return as-is
  if (s.indexOf('služby') !== -1 || s.indexOf('práce') !== -1 ||
      s.indexOf('servis') !== -1 || s.indexOf('opravy') !== -1) {
    return serviceType.toLowerCase();
  }

  // Fallback: return as-is lowercased
  return serviceType.toLowerCase();
}


/* ═══════════════════════════════════════════════════════════════
   Batch write — only touches EXTENSION columns
   ═══════════════════════════════════════════════════════════════ */

/**
 * Write ONLY the extension columns portion back to the sheet.
 * Existing business data is never overwritten.
 *
 * If originalRows is provided, only rows where extension data actually
 * changed are written (P1.2 — avoids overwriting fresh write-back edits).
 */
function writeExtensionColumns_(sheet, hr, rows, originalRows) {
  if (rows.length === 0) return;

  var extIndices = [];
  for (var c = 0; c < EXTENSION_COLUMNS.length; c++) {
    var colIdx = hr.idxOrNull(EXTENSION_COLUMNS[c]);
    if (colIdx !== null) extIndices.push(colIdx);
  }
  if (extIndices.length === 0) return;

  var minIdx = extIndices[0];
  var maxIdx = extIndices[0];
  for (var i = 1; i < extIndices.length; i++) {
    if (extIndices[i] < minIdx) minIdx = extIndices[i];
    if (extIndices[i] > maxIdx) maxIdx = extIndices[i];
  }

  var width = maxIdx - minIdx + 1;

  // If no originals provided, write all rows (legacy behavior)
  if (!originalRows || originalRows.length !== rows.length) {
    var output = [];
    for (var r = 0; r < rows.length; r++) {
      var outRow = [];
      for (var c = minIdx; c <= maxIdx; c++) {
        outRow.push(rows[r][c] !== undefined ? rows[r][c] : '');
      }
      output.push(outRow);
    }
    sheet.getRange(DATA_START_ROW, minIdx + 1, output.length, width).setValues(output);
    return;
  }

  // Changed-only write: compare extension columns and write only changed rows
  for (var r = 0; r < rows.length; r++) {
    var changed = false;
    for (var ci = 0; ci < extIndices.length; ci++) {
      var idx = extIndices[ci];
      var newVal = rows[r][idx] !== undefined ? rows[r][idx] : '';
      var oldVal = originalRows[r][idx] !== undefined ? originalRows[r][idx] : '';
      if (String(newVal) !== String(oldVal)) { changed = true; break; }
    }
    if (!changed) continue;

    var outRow = [];
    for (var c = minIdx; c <= maxIdx; c++) {
      outRow.push(rows[r][c] !== undefined ? rows[r][c] : '');
    }
    sheet.getRange(DATA_START_ROW + r, minIdx + 1, 1, width).setValues([outRow]);
  }
}
