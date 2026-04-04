/**
 * ============================================================
 *  LegacyWebCheck.gs — Original web-check via Serper API
 *  Load order: 4/5 (depends on Config.gs + Helpers.gs)
 *
 *  CHANGED vs original:
 *  - getActiveSheet() replaced with explicit getExternalSheet_()
 *  - Uses LEGACY_COL from Config.gs
 *  - Uses shared helpers from Helpers.gs
 *  - No arrow functions / const / Set (V8-safe but compatible)
 * ============================================================
 */

function setSerperApiKey() {
  var ui = SpreadsheetApp.getUi();
  var response = ui.prompt(
    'Serper API key',
    'Vlož svůj Serper API key:',
    ui.ButtonSet.OK_CANCEL
  );
  if (response.getSelectedButton() !== ui.Button.OK) return;
  var apiKey = (response.getResponseText() || '').trim();
  if (!apiKey) { ui.alert('API key je prázdný.'); return; }
  PropertiesService.getScriptProperties().setProperty('SERPER_API_KEY', apiKey);
  ui.alert('API key uložen.');
}

function runWebsiteCheck20()  { processMissingWebsites_(20);  }
function runWebsiteCheck50()  { processMissingWebsites_(50);  }
function runWebsiteCheck100() { processMissingWebsites_(100); }

function processMissingWebsites_(limit) {
  var ss = openCrmSpreadsheet_();
  var sheet = getExternalSheet_(ss);
  var apiKey = getSerperApiKey_();
  var helperCols = ensureLegacyHelperColumns_(sheet);

  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();

  if (lastRow < DATA_START_ROW) {
    safeAlert_('V listu nejsou žádná data.');
    return;
  }

  var numRows = lastRow - HEADER_ROW;
  var values = sheet.getRange(DATA_START_ROW, 1, numRows, lastCol).getValues();

  var websiteValues     = [];
  var hasWebsiteValues  = [];
  var noteValues        = [];
  var confidenceValues  = [];
  var checkedAtValues   = [];

  for (var r = 0; r < values.length; r++) {
    websiteValues.push([values[r][LEGACY_COL.WEBSITE - 1] || '']);
    hasWebsiteValues.push([values[r][LEGACY_COL.HAS_WEBSITE - 1] || '']);
    noteValues.push([values[r][helperCols.noteCol - 1] || '']);
    confidenceValues.push([values[r][helperCols.confidenceCol - 1] || '']);
    checkedAtValues.push([values[r][helperCols.checkedAtCol - 1] || '']);
  }

  var checked = 0;
  var found = 0;

  for (var i = 0; i < values.length; i++) {
    if (checked >= limit) break;

    var row = values[i];
    var currentWebsite = String(row[LEGACY_COL.WEBSITE - 1] || '').trim();
    var businessName   = String(row[LEGACY_COL.BUSINESS_NAME - 1] || '').trim();

    if (!businessName) continue;
    if (currentWebsite) continue;

    var city  = String(row[LEGACY_COL.CITY - 1] || '').trim();
    var phone = String(row[LEGACY_COL.PHONE - 1] || '').trim();
    var email = String(row[LEGACY_COL.EMAIL - 1] || '').trim();

    checked++;

    var result;
    try {
      result = findWebsiteForLead_(businessName, city, phone, email, apiKey);
    } catch (e) {
      result = { url: '', note: 'ERROR: ' + e.message, confidence: '' };
    }

    if (result.url) {
      websiteValues[i][0] = result.url;
      hasWebsiteValues[i][0] = 'yes';
      found++;
    } else {
      if (!String(hasWebsiteValues[i][0] || '').trim()) {
        hasWebsiteValues[i][0] = 'no';
      }
    }

    noteValues[i][0] = result.note || '';
    confidenceValues[i][0] = result.confidence || '';
    checkedAtValues[i][0] = new Date();

    Utilities.sleep(150);
  }

  // Batch write
  sheet.getRange(DATA_START_ROW, LEGACY_COL.WEBSITE, numRows, 1).setValues(websiteValues);
  sheet.getRange(DATA_START_ROW, LEGACY_COL.HAS_WEBSITE, numRows, 1).setValues(hasWebsiteValues);
  sheet.getRange(DATA_START_ROW, helperCols.noteCol, numRows, 1).setValues(noteValues);
  sheet.getRange(DATA_START_ROW, helperCols.confidenceCol, numRows, 1).setValues(confidenceValues);
  sheet.getRange(DATA_START_ROW, helperCols.checkedAtCol, numRows, 1).setValues(checkedAtValues);

  safeAlert_(
    'Hotovo.\nZkontrolováno řádků: ' + checked + '\nDoplněno webů: ' + found
  );
}

function getSerperApiKey_() {
  var apiKey = PropertiesService.getScriptProperties().getProperty('SERPER_API_KEY');
  if (!apiKey) {
    throw new Error('Chybí SERPER_API_KEY. V menu spusť "Web check → Uložit Serper API key".');
  }
  return apiKey;
}

function ensureLegacyHelperColumns_(sheet) {
  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(HEADER_ROW, 1, 1, lastCol).getValues()[0];

  function getOrCreate(name) {
    for (var i = 0; i < headers.length; i++) {
      if (String(headers[i]).trim() === name) return i + 1;
    }
    var newCol = headers.length + 1;
    sheet.getRange(HEADER_ROW, newCol).setValue(name);
    headers.push(name);
    return newCol;
  }

  return {
    noteCol:       getOrCreate('website_check_note'),
    confidenceCol: getOrCreate('website_check_confidence'),
    checkedAtCol:  getOrCreate('website_checked_at')
  };
}

function findWebsiteForLead_(businessName, city, phone, email, apiKey) {
  // 1) Try email domain first
  var emailDomain = extractBusinessDomainFromEmail_(email);
  if (emailDomain) {
    var candidates = ['https://' + emailDomain, 'http://' + emailDomain];
    for (var c = 0; c < candidates.length; c++) {
      var check = validateWebsite_(candidates[c]);
      if (check.ok) {
        return {
          url: canonicalizeUrl_(candidates[c]),
          note: 'FOUND_BY_EMAIL_DOMAIN | ' + emailDomain + ' | ' + check.reason,
          confidence: 0.98
        };
      }
    }
  }

  // 2) Search API
  var query = buildLegacySearchQuery_(businessName, city, phone, emailDomain);
  var searchData = searchSerper_(query, apiKey);
  var organic = Array.isArray(searchData.organic) ? searchData.organic : [];

  var scored = [];
  for (var o = 0; o < organic.length; o++) {
    var item = organic[o];
    if (!item.link || isBlockedResult_(item.link)) continue;
    scored.push({
      link: item.link,
      title: item.title || '',
      snippet: item.snippet || '',
      score: scoreLegacyResult_(item, businessName, city)
    });
  }
  scored.sort(function(a, b) { return b.score - a.score; });

  for (var s = 0; s < scored.length; s++) {
    var candidate = canonicalizeUrl_(scored[s].link);
    if (!candidate) continue;
    var check = validateWebsite_(candidate);
    if (!check.ok) continue;
    return {
      url: candidate,
      note: 'FOUND_BY_SEARCH | score=' + scored[s].score + ' | ' + check.reason + ' | q=' + query,
      confidence: Math.min(0.95, 0.65 + scored[s].score * 0.05)
    };
  }

  return { url: '', note: 'NOT_FOUND | q=' + query, confidence: '' };
}

function buildLegacySearchQuery_(businessName, city, phone, emailDomain) {
  var parts = ['"' + businessName + '"'];
  if (city) parts.push('"' + city + '"');
  var np = normalizePhone_(phone);
  if (np) parts.push('"' + np + '"');
  else if (emailDomain) parts.push('"' + emailDomain + '"');
  parts.push('web');
  return parts.join(' ');
}

function searchSerper_(query, apiKey) {
  var response = UrlFetchApp.fetch(SERPER_CONFIG.ENDPOINT, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'X-API-KEY': apiKey },
    payload: JSON.stringify({
      q: query,
      gl: SERPER_CONFIG.GL,
      hl: SERPER_CONFIG.HL,
      num: 5
    }),
    muteHttpExceptions: true
  });

  var code = response.getResponseCode();
  var text = response.getContentText();
  if (code < 200 || code >= 300) {
    throw new Error('Serper API chyba: HTTP ' + code + ' | ' + text);
  }
  return JSON.parse(text);
}

function validateWebsite_(url) {
  try {
    var response = UrlFetchApp.fetch(url, {
      method: 'get',
      muteHttpExceptions: true,
      followRedirects: true,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });

    var code = response.getResponseCode();
    var body = removeDiacritics_(String(response.getContentText() || '').toLowerCase()).slice(0, 7000);

    if (body.indexOf('domain is for sale') !== -1 ||
        body.indexOf('this domain is for sale') !== -1 ||
        body.indexOf('buy this domain') !== -1 ||
        body.indexOf('parked domain') !== -1 ||
        body.indexOf('sedo domain parking') !== -1 ||
        body.indexOf('website coming soon') !== -1) {
      return { ok: false, reason: 'parked_or_placeholder' };
    }

    if (code === 404 || code === 410) return { ok: false, reason: 'http_' + code };
    if ((code >= 200 && code < 400) || code === 401 || code === 403) {
      return { ok: true, reason: 'http_' + code };
    }
    return { ok: false, reason: 'http_' + code };
  } catch (e) {
    return { ok: false, reason: 'fetch_error' };
  }
}

function scoreLegacyResult_(item, businessName, city) {
  var score = 0;
  var link    = String(item.link || '');
  var title   = removeDiacritics_(String(item.title || '').toLowerCase());
  var snippet = removeDiacritics_(String(item.snippet || '').toLowerCase());
  var text    = title + ' ' + snippet;

  var host = '';
  try {
    var m = link.match(/^https?:\/\/([^\/]+)/);
    if (m) host = m[1].toLowerCase().replace(/^www\./, '');
  } catch (e) {}

  var tokens    = legacyNameTokens_(businessName);
  var cityToken = removeDiacritics_(String(city || '').toLowerCase());

  if (host.length > 3 && host.substring(host.length - 3) === '.cz') score += 1;
  if (cityToken && text.indexOf(cityToken) !== -1) score += 1;

  var hostMatches = 0;
  var textMatches = 0;
  for (var i = 0; i < tokens.length; i++) {
    if (host.indexOf(tokens[i]) !== -1) hostMatches++;
    if (text.indexOf(tokens[i]) !== -1) textMatches++;
  }
  score += Math.min(hostMatches, 2) * 2;
  score += Math.min(textMatches, 3);

  for (var i = 0; i < tokens.length; i++) {
    if (title.indexOf(tokens[i]) !== -1) { score += 1; break; }
  }

  return score;
}

function legacyNameTokens_(name) {
  var stopWords = [
    'sro','spol','firma','praha','servis','sluzba','sluzby',
    'instalater','instalaterstvi','instalace','vodo','topo','plyn',
    'nonstop','havarijni','prace'
  ];

  var normalized = removeDiacritics_(String(name || '').toLowerCase())
    .replace(/[^a-z0-9]+/g, ' ').trim();
  var raw = normalized.split(/\s+/);

  var tokens = [];
  for (var i = 0; i < raw.length; i++) {
    if (raw[i].length >= 4 && stopWords.indexOf(raw[i]) === -1) {
      if (tokens.indexOf(raw[i]) === -1) tokens.push(raw[i]);
    }
  }
  return tokens.slice(0, 5);
}
