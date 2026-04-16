/**
 * ============================================================
 *  PreviewPipeline.gs — Qualification, dedup, templates, briefs,
 *                       email drafts, processing queue, webhook
 *  Load order: 3/5 (depends on Config.gs + Helpers.gs)
 * ============================================================
 */


/* ═══════════════════════════════════════════════════════════════
   SETUP — append-only schema extension
   ═══════════════════════════════════════════════════════════════ */

function setupPreviewExtension() {
  var ss = openCrmSpreadsheet_();
  var sheet = getExternalSheet_(ss);
  var lastCol = sheet.getLastColumn();
  var headers = lastCol > 0
    ? sheet.getRange(HEADER_ROW, 1, 1, lastCol).getValues()[0]
    : [];

  var existingSet = {};
  for (var i = 0; i < headers.length; i++) {
    var h = String(headers[i] || '').trim().toLowerCase();
    if (h) existingSet[h] = true;
  }

  var toAdd = [];
  for (var c = 0; c < EXTENSION_COLUMNS.length; c++) {
    if (!existingSet[EXTENSION_COLUMNS[c].toLowerCase()]) {
      toAdd.push(EXTENSION_COLUMNS[c]);
    }
  }

  if (toAdd.length === 0) {
    aswLog_('INFO', 'setupPreviewExtension', 'All columns already exist');
    safeAlert_('Všechny rozšiřující sloupce už existují.');
    return;
  }

  var startCol = lastCol + 1;
  var headerRange = sheet.getRange(HEADER_ROW, startCol, 1, toAdd.length);
  headerRange.setValues([toAdd]);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#D9E2F3');

  ensureLogSheet_(ss);

  aswLog_('INFO', 'setupPreviewExtension',
    'Added ' + toAdd.length + ' columns at col ' + startCol + ': ' + toAdd.join(', '));

  safeAlert_(
    'Přidáno ' + toAdd.length + ' nových sloupců:\n\n' + toAdd.join('\n')
  );
}


/* ═══════════════════════════════════════════════════════════════
   ENSURE LEAD IDs — backfill stable immutable IDs
   Locates lead_id column via HeaderResolver (extension column).
   ID format: ASW-{timestamp_base36}-{random4}
   ═══════════════════════════════════════════════════════════════ */

function ensureLeadIds() {
  var ss = openCrmSpreadsheet_();
  var sheet = getExternalSheet_(ss);

  if (!ensurePreviewExtensionReady_(sheet)) return;

  var hr = getHeaderResolver_(sheet);
  var idCol = hr.colOrNull('lead_id');
  if (!idCol) {
    safeAlert_('Sloupec "lead_id" nenalezen.\nSpusťte nejdřív "Setup preview extension".');
    return;
  }

  var lastRow = sheet.getLastRow();
  if (lastRow < DATA_START_ROW) {
    safeAlert_('Žádná data.');
    return;
  }

  var numRows = lastRow - DATA_START_ROW + 1;
  var ids = sheet.getRange(DATA_START_ROW, idCol, numRows, 1).getValues();

  var filled = 0;
  for (var i = 0; i < ids.length; i++) {
    if (!String(ids[i][0] || '').trim()) {
      ids[i][0] = generateLeadId_();
      filled++;
    }
  }

  if (filled === 0) {
    aswLog_('INFO', 'ensureLeadIds', 'All rows already have lead_id');
    safeAlert_('Všechny řádky už mají lead_id.');
    return;
  }

  sheet.getRange(DATA_START_ROW, idCol, numRows, 1).setValues(ids);
  aswLog_('INFO', 'ensureLeadIds', 'Backfilled ' + filled + ' lead_ids (col ' + idCol + ')');
  safeAlert_('Doplněno ' + filled + ' chybějících lead_id.');
}

function generateLeadId_() {
  var ts = new Date().getTime().toString(36);
  var rnd = Math.random().toString(36).substring(2, 6);
  return 'ASW-' + ts + '-' + rnd;
}


/* ═══════════════════════════════════════════════════════════════
   AUDIT LEAD IDs — read-only diagnostic scan
   ═══════════════════════════════════════════════════════════════
   Reports lead_id coverage, uniqueness, format consistency,
   and contact-ready coverage. Pure read-only — never modifies
   any cell values. Output goes to Logger + safeAlert_ only.
   ═══════════════════════════════════════════════════════════════ */

function auditLeadIds() {
  var ss = openCrmSpreadsheet_();
  var sheet = getExternalSheet_(ss);

  if (!ensurePreviewExtensionReady_(sheet)) return;

  var hr = getHeaderResolver_(sheet);
  var idCol = hr.colOrNull('lead_id');
  if (!idCol) {
    Logger.log('AUDIT FAIL: sloupec lead_id neexistuje. Spustte Setup preview extension.');
    safeAlert_('Sloupec "lead_id" nenalezen.\nSpusťte nejdřív "Setup preview extension".');
    return;
  }

  var bulk = readAllData_(sheet);
  if (bulk.data.length === 0) {
    Logger.log('AUDIT: Zadna data.');
    safeAlert_('Žádná data k auditu.');
    return;
  }

  var total = bulk.data.length;
  var empty = 0;
  var ids = {};
  var formatOk = 0;
  var formatBad = 0;
  var formatBadExamples = [];
  var contactReady = 0;
  var contactReadyMissing = 0;
  var emptyExamples = [];

  // Accepts ASW-* (generated) and FIRMYCZ-* (legacy) and similar alphanumeric-with-hyphen IDs
  var VALID_ID_PATTERN = /^[A-Z][\w]+-\d{3,}$|^ASW-[a-z0-9]+-[a-z0-9]{4}$/i;

  for (var i = 0; i < bulk.data.length; i++) {
    var row = bulk.data[i];
    var leadId = String(row[idCol - 1] || '').trim();

    // Check contact readiness for this row
    var isContactReady = false;
    try {
      var readiness = buildContactReadiness_(hr, row);
      isContactReady = readiness.ready;
    } catch (e) {
      // Ignore errors in readiness evaluation
    }

    if (!leadId) {
      empty++;
      if (emptyExamples.length < 5) {
        var name = String(hr.get(row, 'business_name') || '').trim();
        emptyExamples.push('Row ' + (i + DATA_START_ROW) + ': ' + (name || '(prazdny nazev)'));
      }
      if (isContactReady) contactReadyMissing++;
    } else {
      ids[leadId] = (ids[leadId] || 0) + 1;
      if (VALID_ID_PATTERN.test(leadId)) {
        formatOk++;
      } else {
        formatBad++;
        if (formatBadExamples.length < 5) formatBadExamples.push(leadId);
      }
    }

    if (isContactReady) contactReady++;
  }

  // Count duplicate IDs
  var dupeIds = [];
  for (var id in ids) {
    if (ids[id] > 1) dupeIds.push(id + ' (x' + ids[id] + ')');
  }

  var verdict;
  if (empty === 0 && dupeIds.length === 0) {
    verdict = 'READY: Vsechny radky maji unikatni lead_id. Varianta B pripravena.';
  } else if (contactReadyMissing === 0 && dupeIds.length === 0) {
    verdict = 'CONDITIONAL: ' + empty + ' radku bez lead_id, ale zadny neni contact-ready. ' +
      'Doporuceno spustit "Ensure lead IDs", pak Varianta B.';
  } else {
    verdict = 'NOT READY: ' +
      (contactReadyMissing > 0 ? contactReadyMissing + ' contact-ready radku BEZ lead_id. ' : '') +
      (dupeIds.length > 0 ? dupeIds.length + ' duplicitnich lead_id. ' : '') +
      'Nutne opravit pred Variantou B.';
  }

  var report = [
    '=== LEAD ID AUDIT ===',
    'Date: ' + new Date().toISOString(),
    '',
    '--- COVERAGE ---',
    'Total rows:           ' + total,
    'WITH lead_id:         ' + (total - empty),
    'WITHOUT lead_id:      ' + empty,
    'Coverage:             ' + Math.round((total - empty) / total * 100) + '%',
    '',
    '--- CONTACT-READY ---',
    'Contact-ready:        ' + contactReady,
    'CR missing lead_id:   ' + contactReadyMissing,
    '',
    '--- UNIQUENESS ---',
    'Unique IDs:           ' + Object.keys(ids).length,
    'Duplicate IDs:        ' + dupeIds.length,
    dupeIds.length > 0 ? 'Dupes: ' + dupeIds.slice(0, 10).join(', ') : '',
    '',
    '--- FORMAT ---',
    'Valid format:          ' + formatOk,
    'Non-standard:         ' + formatBad,
    formatBadExamples.length > 0 ? 'Bad examples: ' + formatBadExamples.join(', ') : '',
    '',
    '--- EMPTY EXAMPLES ---',
    emptyExamples.length > 0 ? emptyExamples.join('\n') : '(none)',
    '',
    '=== VERDICT: ' + verdict + ' ==='
  ].join('\n');

  Logger.log(report);
  safeAlert_(report.substring(0, 1500));
}


/* ═══════════════════════════════════════════════════════════════
   QUALIFY LEADS
   ═══════════════════════════════════════════════════════════════ */

function qualifyLeads() {
  var ss = openCrmSpreadsheet_();
  var sheet = getExternalSheet_(ss);

  // FIX #3: guard check
  if (!ensurePreviewExtensionReady_(sheet)) return;

  var hr = getHeaderResolver_(sheet);
  var bulk = readAllData_(sheet);

  if (bulk.data.length === 0) {
    safeAlert_('Žádná data k kvalifikaci.');
    return;
  }

  aswLog_('INFO', 'qualifyLeads', 'Starting for ' + bulk.data.length + ' rows');

  // --- Pass 1: compute company keys for dedup ---
  var companyGroups = {};
  var rowKeys = [];

  for (var i = 0; i < bulk.data.length; i++) {
    var row = bulk.data[i];
    var companyKey = computeCompanyKey_(hr, row);
    var branchKey = computeBranchKey_(hr, row, i);
    rowKeys.push({ companyKey: companyKey, branchKey: branchKey });
    if (companyKey) {
      if (!companyGroups[companyKey]) companyGroups[companyKey] = [];
      companyGroups[companyKey].push(i);
    }
  }

  // --- Pass 2: qualify each row ---
  var updatedRows = [];
  for (var i = 0; i < bulk.data.length; i++) {
    updatedRows.push(bulk.data[i].slice());
  }

  var stats = { qualified: 0, disqualified: 0, review: 0, dupes: 0 };

  for (var i = 0; i < updatedRows.length; i++) {
    try {
      var row = updatedRows[i];
      var dk = rowKeys[i];

      // Company / branch keys
      hr.set(row, 'company_key', dk.companyKey);
      hr.set(row, 'branch_key', dk.branchKey);

      // Dedup
      var dedupeGroup = dk.companyKey || '';
      var isDupe = false;
      if (dedupeGroup && companyGroups[dedupeGroup] && companyGroups[dedupeGroup].length > 1) {
        isDupe = (companyGroups[dedupeGroup][0] !== i);
      }
      hr.set(row, 'dedupe_group', dedupeGroup);
      hr.set(row, 'dedupe_flag', isDupe ? 'TRUE' : 'FALSE');
      if (isDupe) stats.dupes++;

      // Qualification
      var qual = evaluateQualification_(hr, row);

      // GUARD: do NOT overwrite ANY qualification-derived fields for advanced stages
      var currentLeadStage = trimLower_(hr.get(row, 'lead_stage'));
      var isAdvancedStage = (currentLeadStage === trimLower_(LEAD_STAGES.IN_PIPELINE) ||
                             currentLeadStage === trimLower_(LEAD_STAGES.PREVIEW_SENT));

      if (isAdvancedStage) {
        aswLog_('INFO', 'qualifyLeads',
          'Row ' + (i + DATA_START_ROW) + ': skipping qualification fields, already ' + currentLeadStage);
      } else {
        hr.set(row, 'qualified_for_preview', qual.qualified ? 'TRUE' : 'FALSE');
        hr.set(row, 'qualification_reason', qual.reason);
        hr.set(row, 'lead_stage', qual.stage);
        hr.set(row, 'send_allowed', qual.sendAllowed ? 'TRUE' : 'FALSE');
        hr.set(row, 'personalization_level', qual.personalizationLevel);
      }

      if (qual.stage === LEAD_STAGES.QUALIFIED) stats.qualified++;
      else if (qual.stage === LEAD_STAGES.DISQUALIFIED) stats.disqualified++;
      else if (qual.stage === LEAD_STAGES.REVIEW) stats.review++;

      // Set initial preview_stage if qualified and not yet set
      var currentStage = trimLower_(hr.get(row, 'preview_stage'));
      if (!currentStage && qual.qualified) {
        hr.set(row, 'preview_stage', PREVIEW_STAGES.NOT_STARTED);
      }

      // FIX #4: outreach_stage — set to NOT_CONTACTED on qualification
      if (qual.qualified) {
        var currentOutreach = trimLower_(hr.get(row, 'outreach_stage'));
        if (!currentOutreach) {
          hr.set(row, 'outreach_stage', 'NOT_CONTACTED');
        }
      }

    } catch (e) {
      aswLog_('ERROR', 'qualifyLeads', 'Row ' + (i + DATA_START_ROW) + ': ' + e.message,
        { row: i + DATA_START_ROW });
    }
  }

  writeExtensionColumns_(sheet, hr, updatedRows, bulk.data);

  aswLog_('INFO', 'qualifyLeads',
    'Done. Q=' + stats.qualified + ' D=' + stats.disqualified +
    ' R=' + stats.review + ' Dupes=' + stats.dupes);

  safeAlert_(
    'Kvalifikace dokončena.\n' +
    'Kvalifikováno: ' + stats.qualified + '\n' +
    'Vyřazeno: ' + stats.disqualified + '\n' +
    'K přezkoumání: ' + stats.review + '\n' +
    'Duplikáty: ' + stats.dupes
  );
}


/* --- Company key computation --- */

function computeCompanyKey_(hr, row) {
  var ico = normalizeIco_(hr.get(row, 'ičo'));
  if (ico) return 'ico:' + ico;
  var domain = extractDomainFromUrl_(hr.get(row, 'website_url'));
  if (domain && !isBlockedDomain_(domain)) return 'dom:' + domain;
  var emailDomain = extractBusinessDomainFromEmail_(hr.get(row, 'email'));
  if (emailDomain && !isBlockedDomain_(emailDomain)) return 'edom:' + emailDomain;
  var name = normalizeBusinessName_(hr.get(row, 'business_name'));
  var city = normalizeCityForDedupe_(hr.get(row, 'city'));
  if (name && city) return 'name:' + name + '|' + city;
  return '';
}


/* --- A-05: Standalone company key from plain object --- */

function computeCompanyKeyFromRecord_(record) {
  var ico = normalizeIco_(record.ico);
  if (ico) return 'ico:' + ico;
  var domain = extractDomainFromUrl_(record.website_url || record.website || '');
  if (domain && !isBlockedDomain_(domain)) return 'dom:' + domain;
  var emailDomain = extractBusinessDomainFromEmail_(record.email || '');
  if (emailDomain && !isBlockedDomain_(emailDomain)) return 'edom:' + emailDomain;
  var name = normalizeBusinessName_(record.business_name || '');
  var city = normalizeCityForDedupe_(record.city || '');
  if (name && city) return 'name:' + name + '|' + city;
  return '';
}

function computeBranchKey_(hr, row, rowIndex) {
  var leadId = trimLower_(hr.get(row, 'lead_id'));
  if (leadId) return 'lid:' + leadId;
  return 'row:' + (rowIndex + DATA_START_ROW);
}


/* --- Qualification evaluation --- */

function evaluateQualification_(hr, row) {
  var businessName = trimLower_(hr.get(row, 'business_name'));
  var email        = trimLower_(hr.get(row, 'email'));
  var phone        = trimLower_(hr.get(row, 'phone'));
  var hasWebsite   = trimLower_(hr.get(row, 'has_website'));
  var webQuality   = trimLower_(hr.get(row, 'website_quality'));
  var segment      = trimLower_(hr.get(row, 'segment'));
  var serviceType  = trimLower_(hr.get(row, 'service_type'));

  // Must have a contact channel
  if (isBlank_(email) && isBlank_(phone)) {
    return {
      qualified: false,
      reason: 'NO_CONTACT: chybí email i telefon',
      stage: LEAD_STAGES.DISQUALIFIED,
      sendAllowed: false,
      personalizationLevel: 'none'
    };
  }

  // Must have a business name
  if (isBlank_(businessName)) {
    return {
      qualified: false,
      reason: 'NO_NAME: chybí název firmy',
      stage: LEAD_STAGES.DISQUALIFIED,
      sendAllowed: false,
      personalizationLevel: 'none'
    };
  }

  // Enterprise / chain detection (conservative → REVIEW, not reject)
  var nameNorm = removeDiacritics_(businessName);
  var suspectReasons = [];
  for (var i = 0; i < KNOWN_CHAINS.length; i++) {
    if (nameNorm.indexOf(KNOWN_CHAINS[i]) !== -1 && nameNorm.length < KNOWN_CHAINS[i].length + 8) {
      suspectReasons.push('CHAIN:' + KNOWN_CHAINS[i]);
    }
  }
  for (var i = 0; i < ENTERPRISE_KEYWORDS.length; i++) {
    if (nameNorm.indexOf(ENTERPRISE_KEYWORDS[i]) !== -1) {
      suspectReasons.push('ENTERPRISE:' + ENTERPRISE_KEYWORDS[i]);
    }
  }
  if (suspectReasons.length > 0) {
    return {
      qualified: false,
      reason: 'REVIEW: ' + suspectReasons.join('; '),
      stage: LEAD_STAGES.REVIEW,
      sendAllowed: false,
      personalizationLevel: 'none'
    };
  }

  // Website need check — uses resolveWebsiteState_ for conflict-safe logic
  var rd = hr.row(row);
  var webState = resolveWebsiteState_(rd);
  var needsWebsite = false;
  var websiteReason = '';
  var reasons = [];

  if (webState === 'NO_WEBSITE') {
    needsWebsite = true;
    websiteReason = 'NO_WEBSITE';
    reasons.push('nemá web');
  } else if (webState === 'WEAK_WEBSITE') {
    needsWebsite = true;
    websiteReason = 'WEAK_WEBSITE';
    reasons.push('slabý web');
  } else if (webState === 'CONFLICT') {
    // Data is contradictory — still qualify but flag it
    needsWebsite = true;
    websiteReason = 'CONFLICT';
    reasons.push('konflikt has_website vs website_url');
  } else if (webState === 'UNKNOWN') {
    // Not enough info — qualify conservatively
    needsWebsite = true;
    websiteReason = 'UNKNOWN';
    reasons.push('stav webu nejasný');
  }

  if (!needsWebsite) {
    // HAS_WEBSITE with no quality issues → not our target
    return {
      qualified: false,
      reason: 'HAS_GOOD_WEBSITE',
      stage: LEAD_STAGES.DISQUALIFIED,
      sendAllowed: false,
      personalizationLevel: 'none'
    };
  }

  // Personalization level
  var pScore = 0;
  if (!isBlank_(hr.get(row, 'contact_name'))) pScore++;
  if (!isBlank_(segment)) pScore++;
  if (!isBlank_(serviceType)) pScore++;
  if (!isBlank_(hr.get(row, 'city'))) pScore++;
  if (!isBlank_(hr.get(row, 'pain_point'))) pScore++;
  if (!isBlank_(hr.get(row, 'rating'))) pScore++;
  var pLevel = pScore >= 5 ? 'high' : (pScore >= 3 ? 'medium' : 'basic');

  return {
    qualified: true,
    reason: websiteReason + '; data=' + pScore + '/6; ' + reasons.join(', '),
    stage: LEAD_STAGES.QUALIFIED,
    sendAllowed: !isBlank_(email),
    personalizationLevel: pLevel
  };
}


/* ═══════════════════════════════════════════════════════════════
   TEMPLATE SELECTION
   ═══════════════════════════════════════════════════════════════ */

function chooseTemplateType_(rd) {
  var segment     = removeDiacritics_(trimLower_(rd.segment || ''));
  var serviceType = removeDiacritics_(trimLower_(rd.service_type || ''));
  var combined    = segment + ' ' + serviceType;

  var webState = resolveWebsiteState_(rd);
  var noWeb    = (webState === 'NO_WEBSITE');
  var weakWeb  = (webState === 'WEAK_WEBSITE');
  var conflict = (webState === 'CONFLICT' || webState === 'UNKNOWN');

  // Emergency services
  for (var i = 0; i < EMERGENCY_SEGMENTS.length; i++) {
    if (combined.indexOf(EMERGENCY_SEGMENTS[i]) !== -1) {
      if (noWeb) return 'emergency-service-no-website';
      if (weakWeb) return 'emergency-service-weak-website';
      if (conflict) return 'emergency-service-data-conflict';
      return 'emergency-service-basic';
    }
  }

  // Trade-specific templates
  var trades = [
    { keys: ['instalat','plumber','vodo','topo'], pre: 'plumber' },
    { keys: ['elektr','electric'], pre: 'electrician' },
    { keys: ['zamecn','locksmith','klice'], pre: 'locksmith' },
    { keys: ['malar','painter','nater'], pre: 'painter' },
    { keys: ['zedni','mason','stavb'], pre: 'construction' },
    { keys: ['uklid','clean'], pre: 'cleaning' },
    { keys: ['zahrad','garden'], pre: 'gardener' },
    { keys: ['autoserv','mechani','auto'], pre: 'auto-service' },
    { keys: ['kader','salon','beauty','kosmet'], pre: 'beauty' },
    { keys: ['restaur','hospod','bistro','kavarn'], pre: 'restaurant' }
  ];

  for (var t = 0; t < trades.length; t++) {
    for (var k = 0; k < trades[t].keys.length; k++) {
      if (combined.indexOf(trades[t].keys[k]) !== -1) {
        if (noWeb) return trades[t].pre + '-no-website';
        if (weakWeb) return trades[t].pre + '-weak-website';
        if (conflict) return trades[t].pre + '-data-conflict';
        return trades[t].pre + '-basic';
      }
    }
  }

  if (noWeb) return 'local-service-no-website';
  if (weakWeb) return 'local-service-weak-website';
  if (conflict) return 'local-service-data-conflict';
  return 'local-service-basic';
}


/* ═══════════════════════════════════════════════════════════════
   PREVIEW BRIEF BUILDER
   ═══════════════════════════════════════════════════════════════ */

function buildPreviewBrief_(rd) {
  var bName       = String(rd.business_name || '').trim();
  var city        = String(rd.city || '').trim();
  var area        = String(rd.area || '').trim();
  var serviceType = String(rd.service_type || '').trim();
  var segment     = String(rd.segment || '').trim();
  var painPoint   = String(rd.pain_point || '').trim();
  var phone       = String(rd.phone || '').trim();
  var email       = String(rd.email || '').trim();
  var contactName = String(rd.contact_name || '').trim();
  var hasWebsite  = trimLower_(rd.has_website || '');
  var webQuality  = String(rd.website_quality || '').trim();
  var rating      = rd.rating || '';
  var reviewsCnt  = rd.reviews_count || '';

  // Headline — uses natural Czech helpers
  var headline = buildNaturalHeadline_(bName, serviceType, city);

  // Subheadline — grammatically safe
  var subheadline = buildNaturalSubheadline_(serviceType, city, painPoint);

  // CTA
  var cta = 'Kontaktujte nás';
  if (phone) cta = 'Zavolejte nám: ' + phone;
  else if (email) cta = 'Napište nám na ' + email;

  // Benefits (only grounded)
  var benefits = [];
  var locPhrase = formatLocationPhrase_(city, area);
  if (locPhrase) benefits.push('Lokální služby ' + locPhrase);
  if (area && !city) benefits.push('Působnost: ' + area);
  if (rating && Number(rating) >= 4.0) {
    var rText = 'Hodnocení ' + rating;
    if (reviewsCnt) rText += ' (' + reviewsCnt + ' recenzí)';
    benefits.push(rText);
  }
  if (phone) benefits.push('Rychlý kontakt po telefonu');
  if (email) benefits.push('Online poptávka e-mailem');
  if (serviceType) benefits.push(serviceType);

  // Sections
  var sections = ['hero', 'services', 'contact'];
  if (rating && Number(rating) >= 3.5) sections.splice(2, 0, 'reviews');
  if (city || area) sections.splice(1, 0, 'location');
  if (painPoint) sections.push('faq');

  // Website status — uses conflict-safe resolver
  var webState = resolveWebsiteState_(rd);
  var websiteStatus = webState.toLowerCase();

  // Confidence
  var confScore = 0;
  if (bName) confScore += 2;
  if (city) confScore++;
  if (serviceType) confScore++;
  if (phone || email) confScore++;
  if (segment) confScore++;
  var confidence = confScore >= 5 ? 'high' : (confScore >= 3 ? 'medium' : 'low');

  return {
    business_name: bName,
    contact_name: contactName,
    city: city,
    area: area,
    service_type: serviceType,
    segment: segment,
    pain_point: painPoint,
    headline: headline,
    subheadline: subheadline,
    key_benefits: benefits,
    suggested_sections: sections,
    cta: cta,
    contact_phone: phone,
    contact_email: email,
    website_status: websiteStatus,
    rating: rating,
    reviews_count: reviewsCnt,
    confidence_level: confidence
  };
}


/* ═══════════════════════════════════════════════════════════════
   SLUG BUILDER
   ═══════════════════════════════════════════════════════════════ */

function buildSlug_(name, city) {
  var base = removeDiacritics_(trimLower_(name || 'preview'));
  var slug = base.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (city) {
    var citySlug = removeDiacritics_(trimLower_(city)).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    slug += '-' + citySlug;
  }
  return slug.substring(0, 60);
}


/* ═══════════════════════════════════════════════════════════════
   EMAIL DRAFT BUILDER
   ═══════════════════════════════════════════════════════════════ */

function buildEmailDrafts() {
  var ss = openCrmSpreadsheet_();
  var sheet = getExternalSheet_(ss);

  // FIX #3: guard check
  if (!ensurePreviewExtensionReady_(sheet)) return;

  var hr = getHeaderResolver_(sheet);
  var bulk = readAllData_(sheet);

  if (bulk.data.length === 0) {
    safeAlert_('Žádná data.');
    return;
  }

  aswLog_('INFO', 'buildEmailDrafts', 'Starting for ' + bulk.data.length + ' rows');

  var updatedRows = [];
  for (var i = 0; i < bulk.data.length; i++) {
    updatedRows.push(bulk.data[i].slice());
  }

  var count = 0;

  for (var i = 0; i < updatedRows.length; i++) {
    try {
      var row = updatedRows[i];
      if (trimLower_(hr.get(row, 'qualified_for_preview')) !== 'true') continue;
      if (trimLower_(hr.get(row, 'send_allowed')) !== 'true') continue;

      // FIX #5: skip duplicates
      if (trimLower_(hr.get(row, 'dedupe_flag')) === 'true') continue;

      var rd = hr.row(row);
      var draft = composeDraft_(rd);
      hr.set(row, 'email_subject_draft', draft.subject);
      hr.set(row, 'email_body_draft', draft.body);

      // FIX #4 + P0.2: outreach_stage → DRAFT_READY only if not already progressed
      var curOutreach = trimLower_(hr.get(row, 'outreach_stage'));
      if (!curOutreach || curOutreach === 'not_contacted') {
        hr.set(row, 'outreach_stage', 'DRAFT_READY');
      }

      count++;
    } catch (e) {
      aswLog_('ERROR', 'buildEmailDrafts', 'Row ' + (i + DATA_START_ROW) + ': ' + e.message,
        { row: i + DATA_START_ROW });
    }
  }

  writeExtensionColumns_(sheet, hr, updatedRows, bulk.data);

  aswLog_('INFO', 'buildEmailDrafts', 'Done. Drafts: ' + count);
  safeAlert_('E-mail drafty dokončeny.\nVytvořeno: ' + count);
}

/**
 * Compose email draft with conflict-safe website state detection.
 * Uses resolveWebsiteState_() for robust has_website vs website_url handling.
 *
 * States handled:
 *   NO_WEBSITE   — cautious: "nenašel jsem web, je možné že ho nemáte"
 *   WEAK_WEBSITE — specific observations only
 *   CONFLICT     — neutral, never claims web missing/present
 *   HAS_WEBSITE  — acknowledges existing web, offers improvement
 *   UNKNOWN      — neutral approach
 */
function composeDraft_(rd) {
  var name = String(rd.business_name || '').trim();
  var contactName = String(rd.contact_name || '').trim();
  var city = String(rd.city || '').trim();
  var serviceType = String(rd.service_type || '').trim();
  var painPoint = String(rd.pain_point || '').trim();

  var greeting = contactName ? ('Dobrý den, ' + contactName) : 'Dobrý den';
  // "vaši firmu" for generic reference, name only in safe positions
  var firmRef = name || 'vaši firmu';

  // Location phrase in lokativ (safe Czech)
  var locPhrase = formatLocationPhrase_(city);

  // Service label — convert raw segment to natural Czech phrase
  // "instalatér" → "instalatérské služby", etc.
  var svcLabel = humanizeServiceType_(serviceType);

  // Build context phrase: "firem nabízejících instalatérské služby v Praze"
  var contextPhrase = '';
  if (svcLabel && locPhrase) {
    contextPhrase = 'firem nabízejících ' + svcLabel + ' ' + locPhrase;
  } else if (svcLabel) {
    contextPhrase = 'firem nabízejících ' + svcLabel;
  } else if (locPhrase) {
    contextPhrase = 'firem ' + locPhrase;
  }

  var situation = resolveWebsiteState_(rd);

  // --- Subject (uses name directly — safe in this position) ---
  var subject;
  if (situation === 'NO_WEBSITE') {
    subject = 'Webová prezentace pro ' + firmRef;
  } else if (situation === 'WEAK_WEBSITE') {
    subject = 'Návrh na vylepšení webu – ' + firmRef;
  } else if (situation === 'HAS_WEBSITE') {
    subject = 'Moderní web pro ' + firmRef;
  } else {
    subject = 'Návrh webu pro ' + firmRef;
  }

  // --- Opening line (situation-dependent, factually safe) ---
  var openingLine;

  if (situation === 'NO_WEBSITE') {
    if (contextPhrase) {
      openingLine =
        'při procházení ' + contextPhrase +
        ' jsem narazil na vaši firmu, ale nenašel jsem k ní samostatný web. ' +
        'Je možné, že ho zatím nemáte, nebo jsem ho přehlédl — ' +
        'každopádně bych vám rád ukázal, jak by mohl vypadat.';
    } else {
      openingLine =
        'oslovuji vás, protože jsem nenašel samostatný web pro vaši firmu. ' +
        'Je možné, že ho zatím nemáte, nebo jsem ho přehlédl — ' +
        'rád bych vám ukázal, jak by mohl vypadat.';
    }

  } else if (situation === 'WEAK_WEBSITE') {
    var observations = [];
    var hasCta = trimLower_(rd.has_cta || '');
    var mobileOk = trimLower_(rd.mobile_ok || '');
    if (hasCta === 'no' || hasCta === 'ne' || hasCta === 'false') {
      observations.push('chybějící výzvu k akci');
    }
    if (mobileOk === 'no' || mobileOk === 'ne' || mobileOk === 'false') {
      observations.push('možné problémy se zobrazením na mobilech');
    }
    openingLine =
      'podíval jsem se na současný web vaší firmy a vidím prostor pro zlepšení';
    if (observations.length > 0) {
      openingLine += ' — zaznamenal jsem například ' + observations.join(' a ');
    }
    openingLine += '. Připravil jsem návrh, jak by váš web mohl lépe sloužit zákazníkům.';

  } else if (situation === 'HAS_WEBSITE') {
    if (contextPhrase) {
      openingLine =
        'při procházení ' + contextPhrase +
        ' jsem narazil na váš web. Vypadá dobře — připravil jsem návrh, ' +
        'jak by mohl ještě lépe oslovit nové zákazníky.';
    } else {
      openingLine =
        'specializuji se na webové prezentace a vím, že vaše firma už web má. ' +
        'Připravil jsem návrh, jak by mohl ještě lépe fungovat.';
    }

  } else if (situation === 'CONFLICT') {
    if (contextPhrase) {
      openingLine =
        'při procházení ' + contextPhrase +
        ' jsem narazil na vaši firmu. Připravil jsem ukázkový návrh webu, ' +
        'který by vám mohl pomoci získat víc zákazníků online.';
    } else {
      openingLine =
        'zaměřuji se na webové prezentace a připravil jsem ukázkový návrh, ' +
        'který by vaší firmě mohl pomoci získat víc zákazníků online.';
    }

  } else {
    // UNKNOWN
    if (contextPhrase) {
      openingLine =
        'při procházení ' + contextPhrase +
        ' jsem narazil na vaši firmu. Rád bych vám ukázal, ' +
        'jak by moderní web mohl pomoci oslovit víc zákazníků.';
    } else {
      openingLine =
        'zaměřuji se na webové prezentace a rád bych vám ukázal, ' +
        'jak by moderní web mohl vaší firmě pomoci oslovit víc zákazníků.';
    }
  }

  // --- Pain point mention (if available and grounded) ---
  var painLine = '';
  if (painPoint) {
    painLine = '\n\n' +
      'V oboru se často řeší: ' + painPoint + '. ' +
      'Moderní web může pomoci právě s tímto.';
  }

  // --- Body ---
  var body =
    greeting + ',\n\n' +
    openingLine +
    painLine + '\n\n' +
    'Připravil jsem pro vás ukázkový náhled stránky na míru — ' +
    'nezávazně a zdarma. Můžete se podívat, jak by to mohlo vypadat.\n\n' +
    'Pokud vás to zaujme, rád vám vše ukážu a probereme, ' +
    'co by pro vás dávalo smysl.\n\n' +
    'S pozdravem,\n[Vaše jméno]\n[Telefon / E-mail]';

  return { subject: subject, body: body };
}


/* ═══════════════════════════════════════════════════════════════
   PROCESS PREVIEW QUEUE
   ═══════════════════════════════════════════════════════════════ */

function processPreviewQueue() {
  var ss = openCrmSpreadsheet_();
  var sheet = getExternalSheet_(ss);

  // FIX #3: guard check
  if (!ensurePreviewExtensionReady_(sheet)) return;

  var hr = getHeaderResolver_(sheet);
  var bulk = readAllData_(sheet);

  if (bulk.data.length === 0) {
    aswLog_('INFO', 'processPreviewQueue', 'No data rows');
    return;
  }

  aswLog_('INFO', 'processPreviewQueue',
    'Starting. DRY_RUN=' + DRY_RUN + ' WEBHOOK=' + ENABLE_WEBHOOK + ' BATCH=' + BATCH_SIZE);

  var updatedRows = [];
  for (var i = 0; i < bulk.data.length; i++) {
    updatedRows.push(bulk.data[i].slice());
  }

  var processed = 0;
  var errors = 0;
  var now = new Date();

  for (var i = 0; i < updatedRows.length; i++) {
    if (processed >= BATCH_SIZE) break;

    var row = updatedRows[i];

    // --- Eligibility check ---
    if (trimLower_(hr.get(row, 'qualified_for_preview')) !== 'true') continue;

    // FIX #1: BRIEF_READY is eligible for processing (allows dry→production flow)
    var stage = trimLower_(hr.get(row, 'preview_stage'));
    var eligibleStages = ['', 'not_started', 'failed', 'review_needed', 'brief_ready'];
    var isEligible = false;
    for (var es = 0; es < eligibleStages.length; es++) {
      if (stage === eligibleStages[es]) { isEligible = true; break; }
    }
    if (!isEligible) continue;

    if (trimLower_(hr.get(row, 'dedupe_flag')) === 'true') continue;

    // FIX #1: If BRIEF_READY and still in dry-run with no webhook, skip re-processing
    //         (brief is already built — no point rebuilding the same data)
    if (stage === 'brief_ready' && (DRY_RUN || !ENABLE_WEBHOOK || !WEBHOOK_URL)) continue;

    processed++;
    var rowNum = i + DATA_START_ROW;

    try {
      var rd = hr.row(row);
      var leadId = rd.lead_id || '';

      // Step 1: Template
      var templateType = chooseTemplateType_(rd);
      hr.set(row, 'template_type', templateType);

      // Step 2: Brief
      var brief = buildPreviewBrief_(rd);
      hr.set(row, 'preview_brief_json', JSON.stringify(brief));
      hr.set(row, 'preview_headline', brief.headline);
      hr.set(row, 'preview_subheadline', brief.subheadline);
      hr.set(row, 'preview_cta', brief.cta);
      hr.set(row, 'preview_stage', PREVIEW_STAGES.BRIEF_READY);

      // Step 3: Slug
      hr.set(row, 'preview_slug', buildSlug_(rd.business_name, rd.city));

      // Step 4: Email draft (if send_allowed and not a dupe)
      if (trimLower_(hr.get(row, 'send_allowed')) === 'true') {
        var draft = composeDraft_(rd);
        hr.set(row, 'email_subject_draft', draft.subject);
        hr.set(row, 'email_body_draft', draft.body);
        // FIX #4 + P0.2: outreach_stage → DRAFT_READY only if not already progressed
        var curOutreach2 = trimLower_(hr.get(row, 'outreach_stage'));
        if (!curOutreach2 || curOutreach2 === 'not_contacted') {
          hr.set(row, 'outreach_stage', 'DRAFT_READY');
        }
      }

      // Step 5: Webhook (only when NOT dry run AND webhook enabled)
      if (!DRY_RUN && ENABLE_WEBHOOK && WEBHOOK_URL) {
        hr.set(row, 'preview_stage', PREVIEW_STAGES.QUEUED);

        var payload = {
          spreadsheet_id: SPREADSHEET_ID,
          sheet_name: MAIN_SHEET_NAME,
          row_number: rowNum,
          company_key: hr.get(row, 'company_key'),
          branch_key: hr.get(row, 'branch_key'),
          template_type: templateType,
          preview_brief: brief,
          contact: {
            name: brief.contact_name || '',
            phone: brief.contact_phone || '',
            email: brief.contact_email || ''
          },
          source: {
            lead_id: leadId,
            source: rd.source || '',
            created_at: rd.created_at || '',
            segment: brief.segment,
            city: brief.city
          },
          timestamp: new Date().toISOString()
        };
        hr.set(row, 'webhook_payload_json', JSON.stringify(payload));

        try {
          hr.set(row, 'preview_stage', PREVIEW_STAGES.SENT_TO_WEBHOOK);

          var resp = UrlFetchApp.fetch(WEBHOOK_URL, {
            method: 'post',
            contentType: 'application/json',
            payload: JSON.stringify(payload),
            muteHttpExceptions: true,
            headers: { 'User-Agent': 'Autosmartweby-CRM/1.0' }
          });

          var httpCode = resp.getResponseCode();
          var respBody = resp.getContentText();

          if (httpCode < 200 || httpCode >= 300) {
            throw new Error('HTTP ' + httpCode + ': ' + respBody.substring(0, 300));
          }

          var respObj = JSON.parse(respBody);

          if (!respObj || !respObj.ok) {
            hr.set(row, 'preview_stage', PREVIEW_STAGES.FAILED);
            hr.set(row, 'preview_error', 'Webhook ok=false: ' + respBody.substring(0, 300));
          } else {
            hr.set(row, 'preview_url', respObj.preview_url || '');
            hr.set(row, 'preview_screenshot_url', respObj.preview_screenshot_url || '');
            hr.set(row, 'preview_generated_at', new Date());
            hr.set(row, 'preview_version', respObj.preview_version || '');
            if (respObj.preview_quality_score !== undefined) {
              hr.set(row, 'preview_quality_score', respObj.preview_quality_score);
            }
            var needsReview = respObj.preview_needs_review === true ||
              (respObj.preview_quality_score !== undefined && respObj.preview_quality_score < 0.7);
            hr.set(row, 'preview_needs_review', needsReview ? 'TRUE' : 'FALSE');
            hr.set(row, 'preview_stage', needsReview ? PREVIEW_STAGES.REVIEW_NEEDED : PREVIEW_STAGES.READY);
            hr.set(row, 'preview_error', '');
          }

          aswLog_('INFO', 'processPreviewQueue', 'Webhook OK row ' + rowNum, { row: rowNum, leadId: leadId });

        } catch (whErr) {
          hr.set(row, 'preview_stage', PREVIEW_STAGES.FAILED);
          hr.set(row, 'preview_error', 'WEBHOOK_ERROR: ' + whErr.message);
          errors++;
          aswLog_('ERROR', 'processPreviewQueue', 'Webhook fail row ' + rowNum + ': ' + whErr.message,
            { row: rowNum, leadId: leadId });
        }

      } else {
        // Dry run or webhook disabled — stays at BRIEF_READY
        hr.set(row, 'preview_error', '');
      }

      // Step 6: Update lead_stage
      if (trimLower_(hr.get(row, 'lead_stage')) === trimLower_(LEAD_STAGES.QUALIFIED)) {
        hr.set(row, 'lead_stage', LEAD_STAGES.IN_PIPELINE);
      }

      hr.set(row, 'last_processed_at', now);

    } catch (e) {
      errors++;
      aswLog_('ERROR', 'processPreviewQueue', 'Row ' + rowNum + ': ' + e.message, { row: rowNum });
      try {
        hr.set(row, 'preview_stage', PREVIEW_STAGES.FAILED);
        hr.set(row, 'preview_error', 'PROCESSING_ERROR: ' + e.message);
        hr.set(row, 'last_processed_at', now);
      } catch (ignore) {}
    }
  }

  // Batch write (P1.2: only changed rows)
  writeExtensionColumns_(sheet, hr, updatedRows, bulk.data);

  aswLog_('INFO', 'processPreviewQueue',
    'Done. Processed=' + processed + ' Errors=' + errors);

  // Alert only if UI available (not from trigger)
  try {
    safeAlert_(
      'Pipeline dokončen.\nZpracováno: ' + processed + '\nChyby: ' + errors +
      '\nDRY_RUN: ' + (DRY_RUN ? 'ANO' : 'NE'));
  } catch (e) { /* triggered from timer, no UI */ }
}


/* ═══════════════════════════════════════════════════════════════
   FIX #2 — SIMULATE & WRITE (renamed from dryRunAudit)
   Writes into extension columns with DRY_RUN forced on.
   Shows clear warning that it modifies the sheet.
   ═══════════════════════════════════════════════════════════════ */

function simulateAndWrite() {
  var proceed = safeConfirm_(
    'Simulace s zápisem',
    'Tato funkce spustí kvalifikaci a preview pipeline v režimu DRY_RUN.\n\n' +
    'POZOR: Zapíše data do rozšiřujících sloupců (extension columns).\n' +
    'Existující business data zůstanou nedotčená.\n' +
    'Žádný webhook nebude volán.\n\n' +
    'Pokračovat?'
  );

  if (!proceed) return;

  var savedDR = DRY_RUN;
  var savedWH = ENABLE_WEBHOOK;
  DRY_RUN = true;
  ENABLE_WEBHOOK = false;

  try {
    qualifyLeads();
    processPreviewQueue();

    var ss = openCrmSpreadsheet_();
    var sheet = getExternalSheet_(ss);
    var hr = getHeaderResolver_(sheet);
    var bulk = readAllData_(sheet);

    var s = { total: bulk.data.length, qualified: 0, disq: 0, review: 0,
              briefReady: 0, dupes: 0, withEmail: 0, withDraft: 0 };

    for (var i = 0; i < bulk.data.length; i++) {
      var row = bulk.data[i];
      if (trimLower_(hr.get(row, 'qualified_for_preview')) === 'true') s.qualified++;
      var ls = trimLower_(hr.get(row, 'lead_stage'));
      if (ls === 'disqualified') s.disq++;
      if (ls === 'review') s.review++;
      if (trimLower_(hr.get(row, 'preview_stage')) === 'brief_ready') s.briefReady++;
      if (trimLower_(hr.get(row, 'dedupe_flag')) === 'true') s.dupes++;
      if (!isBlank_(hr.get(row, 'email'))) s.withEmail++;
      if (!isBlank_(hr.get(row, 'email_subject_draft'))) s.withDraft++;
    }

    var report =
      '=== SIMULACE DOKONČENA (zapsáno) ===\n\n' +
      'Celkem řádků: ' + s.total + '\n' +
      'Kvalifikováno: ' + s.qualified + '\n' +
      'Vyřazeno: ' + s.disq + '\n' +
      'K přezkoumání: ' + s.review + '\n' +
      'Brief připraven: ' + s.briefReady + '\n' +
      'Duplikáty: ' + s.dupes + '\n' +
      'S e-mailem: ' + s.withEmail + '\n' +
      'S draftem: ' + s.withDraft + '\n\n' +
      'Data byla zapsána do ext. sloupců.\n' +
      'Žádný webhook nebyl volán (DRY_RUN=true).';

    aswLog_('INFO', 'simulateAndWrite', report);
    safeAlert_(report);

  } finally {
    DRY_RUN = savedDR;
    ENABLE_WEBHOOK = savedWH;
  }
}


/* ═══════════════════════════════════════════════════════════════
   REFRESH — rebuild copy for already-processed rows
   Re-runs template, brief, headline, subheadline, CTA, drafts
   using the current (fixed) logic. Does NOT touch business data,
   does NOT call webhook, does NOT change preview_stage.
   ═══════════════════════════════════════════════════════════════ */

function refreshProcessedPreviewCopy() {
  var ss = openCrmSpreadsheet_();
  var sheet = getExternalSheet_(ss);

  if (!ensurePreviewExtensionReady_(sheet)) return;

  var hr = getHeaderResolver_(sheet);
  var bulk = readAllData_(sheet);

  if (bulk.data.length === 0) {
    safeAlert_('Žádná data.');
    return;
  }

  aswLog_('INFO', 'refreshProcessedPreviewCopy', 'Starting for ' + bulk.data.length + ' rows');

  var updatedRows = [];
  for (var i = 0; i < bulk.data.length; i++) {
    updatedRows.push(bulk.data[i].slice());
  }

  var refreshed = 0;

  for (var i = 0; i < updatedRows.length; i++) {
    try {
      var row = updatedRows[i];

      // Only refresh rows that were already processed
      var templateType = trimLower_(hr.get(row, 'template_type'));
      var previewStage = trimLower_(hr.get(row, 'preview_stage'));
      if (!templateType && previewStage !== 'brief_ready') continue;

      // Skip duplicates — no point refreshing them
      if (trimLower_(hr.get(row, 'dedupe_flag')) === 'true') continue;

      var rd = hr.row(row);

      // Re-evaluate qualification reason with new resolveWebsiteState_
      var webState = resolveWebsiteState_(rd);
      var oldReason = String(hr.get(row, 'qualification_reason') || '');
      // Only update the website part of the reason, keep data score
      var dataMatch = oldReason.match(/data=\d+\/\d+/);
      var dataInfo = dataMatch ? '; ' + dataMatch[0] : '';
      hr.set(row, 'qualification_reason', webState + dataInfo);

      // Re-compute template
      var newTemplate = chooseTemplateType_(rd);
      hr.set(row, 'template_type', newTemplate);

      // Re-build brief (headline, subheadline, CTA)
      var brief = buildPreviewBrief_(rd);
      hr.set(row, 'preview_brief_json', JSON.stringify(brief));
      hr.set(row, 'preview_headline', brief.headline);
      hr.set(row, 'preview_subheadline', brief.subheadline);
      hr.set(row, 'preview_cta', brief.cta);

      // Re-build slug
      hr.set(row, 'preview_slug', buildSlug_(rd.business_name, rd.city));

      // Re-build email draft (if send_allowed)
      // GUARD: do NOT overwrite drafts or outreach_stage for leads that
      // have already progressed beyond DRAFT_READY (e.g. SENT, REPLIED)
      var curOutreach = trimLower_(hr.get(row, 'outreach_stage'));
      var outreachIsEarly = (!curOutreach || curOutreach === 'not_contacted' || curOutreach === 'draft_ready');

      if (trimLower_(hr.get(row, 'send_allowed')) === 'true' && outreachIsEarly) {
        var draft = composeDraft_(rd);
        hr.set(row, 'email_subject_draft', draft.subject);
        hr.set(row, 'email_body_draft', draft.body);
      } else if (!outreachIsEarly) {
        aswLog_('INFO', 'refreshProcessedPreviewCopy',
          'Row ' + (i + DATA_START_ROW) + ': skipping draft rebuild, outreach_stage=' + curOutreach);
      }

      hr.set(row, 'last_processed_at', new Date());
      refreshed++;

    } catch (e) {
      aswLog_('ERROR', 'refreshProcessedPreviewCopy', 'Row ' + (i + DATA_START_ROW) + ': ' + e.message,
        { row: i + DATA_START_ROW });
    }
  }

  writeExtensionColumns_(sheet, hr, updatedRows, bulk.data);

  var report = 'Refresh dokončen.\nAktualizováno řádků: ' + refreshed +
    '\nWebhook: NE\nPůvodní data: nedotčena';
  aswLog_('INFO', 'refreshProcessedPreviewCopy', report);
  safeAlert_(report);
}


/* ═══════════════════════════════════════════════════════════════
   AUDIT SHEET STRUCTURE (read-only — no writes)
   ═══════════════════════════════════════════════════════════════ */

function auditCurrentSheetStructure() {
  var ss = openCrmSpreadsheet_();
  var sheet = getExternalSheet_(ss);
  var lastCol = sheet.getLastColumn();
  var lastRow = sheet.getLastRow();

  if (lastCol < 1) {
    safeAlert_('Sheet je prázdný.');
    return;
  }

  var headers = sheet.getRange(HEADER_ROW, 1, 1, lastCol).getValues()[0];
  var hr = buildHeaderResolver(headers);

  // Header list
  var headerList = [];
  for (var i = 0; i < headers.length; i++) {
    headerList.push('  ' + (i + 1) + ': ' + (headers[i] || '(empty)'));
  }

  // Duplicates
  var dupes = hr.duplicates();
  var dupeLines = [];
  for (var name in dupes) {
    dupeLines.push('  "' + name + '" → sloupce ' + dupes[name].join(', '));
  }

  // Missing extension columns
  var existingSet = {};
  for (var i = 0; i < headers.length; i++) {
    var h = String(headers[i] || '').trim().toLowerCase();
    if (h) existingSet[h] = true;
  }
  var missing = [];
  for (var c = 0; c < EXTENSION_COLUMNS.length; c++) {
    if (!existingSet[EXTENSION_COLUMNS[c].toLowerCase()]) {
      missing.push('  ' + EXTENSION_COLUMNS[c]);
    }
  }

  // Data quality (sample first 100 rows)
  var warnings = [];
  if (lastRow > 1) {
    var sampleSize = Math.min(lastRow - 1, 100);
    var sample = sheet.getRange(DATA_START_ROW, 1, sampleSize, lastCol).getValues();
    var emptyName = 0;
    var emptyContact = 0;
    var nameIdx = hr.idxOrNull('business_name');
    var emailIdx = hr.idxOrNull('email');
    var phoneIdx = hr.idxOrNull('phone');

    for (var r = 0; r < sample.length; r++) {
      if (nameIdx !== null && isBlank_(sample[r][nameIdx])) emptyName++;
      if (emailIdx !== null && phoneIdx !== null &&
          isBlank_(sample[r][emailIdx]) && isBlank_(sample[r][phoneIdx])) {
        emptyContact++;
      }
    }
    if (emptyName > 0) warnings.push('  ' + emptyName + '/' + sampleSize + ' bez business_name');
    if (emptyContact > 0) warnings.push('  ' + emptyContact + '/' + sampleSize + ' bez email i telefon');
  }

  var report =
    '=== AUDIT (read-only) ===\n\n' +
    'List: ' + MAIN_SHEET_NAME + '\n' +
    'Sloupců: ' + lastCol + '\n' +
    'Datových řádků: ' + Math.max(0, lastRow - 1) + '\n\n' +
    '--- Hlavičky ---\n' + headerList.join('\n') + '\n\n' +
    '--- Duplicitní ---\n' + (dupeLines.length > 0 ? dupeLines.join('\n') : '  žádné') + '\n\n' +
    '--- Chybějící ext. sloupce ---\n' + (missing.length > 0 ? missing.join('\n') : '  vše přidáno') + '\n\n' +
    '--- Data quality ---\n' + (warnings.length > 0 ? warnings.join('\n') : '  OK');

  aswLog_('INFO', 'auditCurrentSheetStructure', 'Audit done');
  Logger.log(report);
  safeAlert_(report);
}


/* ═══════════════════════════════════════════════════════════════
   FIX #6 — TRIGGERS — only timer, no redundant onOpen
   ═══════════════════════════════════════════════════════════════ */

function installProjectTriggers() {
  var ss = openCrmSpreadsheet_();
  var existing = ScriptApp.getUserTriggers(ss);

  var hasTime = false;
  var hasOnOpen = false;
  var hasOnEdit = false;
  var hasWebCheck = false;
  var hasAutoQualify = false;

  for (var i = 0; i < existing.length; i++) {
    var fn = existing[i].getHandlerFunction();
    var evType = existing[i].getEventType();

    if (fn === 'processPreviewQueue' && evType === ScriptApp.EventType.CLOCK) {
      hasTime = true;
    }
    if (fn === 'onOpen' && evType === ScriptApp.EventType.ON_OPEN) {
      hasOnOpen = true;
    }
    if (fn === 'onContactSheetEdit' && evType === ScriptApp.EventType.ON_EDIT) {
      hasOnEdit = true;
    }
    if (fn === 'autoWebCheckTrigger' && evType === ScriptApp.EventType.CLOCK) {
      hasWebCheck = true;
    }
    if (fn === 'autoQualifyTrigger' && evType === ScriptApp.EventType.CLOCK) {
      hasAutoQualify = true;
    }
  }

  var installed = [];

  if (!hasTime) {
    ScriptApp.newTrigger('processPreviewQueue')
      .timeBased()
      .everyMinutes(15)
      .create();
    installed.push('Timer: processPreviewQueue (15 min)');
  }

  if (!hasWebCheck) {
    ScriptApp.newTrigger('autoWebCheckTrigger')
      .timeBased()
      .everyMinutes(15)
      .create();
    installed.push('Timer: autoWebCheckTrigger (15 min) — A-06');
  }

  if (!hasAutoQualify) {
    ScriptApp.newTrigger('autoQualifyTrigger')
      .timeBased()
      .everyMinutes(15)
      .create();
    installed.push('Timer: autoQualifyTrigger (15 min) — A-07');
  }

  if (!hasOnOpen) {
    ScriptApp.newTrigger('onOpen')
      .forSpreadsheet(ss)
      .onOpen()
      .create();
    installed.push('Menu: onOpen trigger pro ' + ss.getName());
  }

  if (!hasOnEdit) {
    ScriptApp.newTrigger('onContactSheetEdit')
      .forSpreadsheet(ss)
      .onEdit()
      .create();
    installed.push('Write-back: onContactSheetEdit trigger');
  }

  var msg = installed.length > 0
    ? 'Nainstalováno:\n' + installed.join('\n')
    : 'V\u0161echny triggery u\u017e existuj\u00ed.';

  aswLog_('INFO', 'installProjectTriggers', msg);
  safeAlert_(msg);
}


/* ═══════════════════════════════════════════════════════════════
   WEBHOOK PILOT TEST — safe, small-batch webhook verification
   Processes max 10 rows matching strict pilot criteria.
   Ignores global DRY_RUN / ENABLE_WEBHOOK / BATCH_SIZE.
   Requires WEBHOOK_URL to be set in Config.gs.
   ═══════════════════════════════════════════════════════════════ */

var PILOT_MAX_ROWS = 10;

function runWebhookPilotTest() {
  // --- Guard: webhook URL must be configured ---
  if (!WEBHOOK_URL) {
    safeAlert_(
      'WEBHOOK_URL je prázdný.\n' +
      'Nastav ho v Config.gs před spuštěním pilotního testu.'
    );
    return;
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

  // --- Select pilot rows ---
  var candidates = [];

  for (var i = 0; i < bulk.data.length; i++) {
    var row = bulk.data[i];

    // Must be qualified
    if (trimLower_(hr.get(row, 'qualified_for_preview')) !== 'true') continue;

    // Must be BRIEF_READY
    if (trimLower_(hr.get(row, 'preview_stage')) !== 'brief_ready') continue;

    // No duplicates
    if (trimLower_(hr.get(row, 'dedupe_flag')) === 'true') continue;

    // Must have brief
    var briefJson = String(hr.get(row, 'preview_brief_json') || '').trim();
    if (!briefJson || briefJson === '{}') continue;

    // Skip CONFLICT and REVIEW — only clean rows
    var qualReason = String(hr.get(row, 'qualification_reason') || '');
    if (qualReason.indexOf('CONFLICT') !== -1) continue;

    var leadStage = trimLower_(hr.get(row, 'lead_stage'));
    if (leadStage === 'review') continue;

    // Prefer emergency-service-no-website
    var tmpl = String(hr.get(row, 'template_type') || '');

    candidates.push({
      index: i,
      rowNum: i + DATA_START_ROW,
      businessName: String(hr.get(row, 'business_name') || hr.row(row).business_name || '').trim(),
      template: tmpl,
      priority: tmpl.indexOf('no-website') !== -1 ? 0 : 1
    });
  }

  // Sort: no-website first, then by row order
  candidates.sort(function(a, b) {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.index - b.index;
  });

  // Take max PILOT_MAX_ROWS
  var selected = candidates.slice(0, PILOT_MAX_ROWS);

  if (selected.length === 0) {
    safeAlert_(
      'Nenalezeny žádné řádky splňující pilotní kritéria.\n' +
      '(qualified=TRUE, stage=BRIEF_READY, no dupe, no CONFLICT, has brief)'
    );
    return;
  }

  // --- Confirmation dialog ---
  var confirmLines = [
    'WEBHOOK PILOT TEST',
    '══════════════════',
    'Endpoint: ' + WEBHOOK_URL,
    'Řádků k odeslání: ' + selected.length,
    ''
  ];
  for (var s = 0; s < selected.length; s++) {
    confirmLines.push(
      'Řádek ' + selected[s].rowNum + ': ' +
      selected[s].businessName + ' [' + selected[s].template + ']'
    );
  }
  confirmLines.push('');
  confirmLines.push('Žádné emaily se NEODEŠLOU.');
  confirmLines.push('Pokračovat?');

  if (!safeConfirm_('Webhook Pilot', confirmLines.join('\n'))) {
    safeAlert_('Pilot test zrušen.');
    return;
  }

  // --- Process selected rows ---
  var updatedRows = [];
  for (var i = 0; i < bulk.data.length; i++) {
    updatedRows.push(bulk.data[i].slice());
  }

  var ok = 0;
  var failed = 0;
  var results = [];
  var now = new Date();

  for (var s = 0; s < selected.length; s++) {
    var idx = selected[s].index;
    var row = updatedRows[idx];
    var rowNum = selected[s].rowNum;

    try {
      var rd = hr.row(row);

      // Build payload (same structure as processPreviewQueue)
      var brief = JSON.parse(hr.get(row, 'preview_brief_json'));
      var templateType = String(hr.get(row, 'template_type') || '');

      var payload = {
        spreadsheet_id: SPREADSHEET_ID,
        sheet_name: MAIN_SHEET_NAME,
        row_number: rowNum,
        company_key: hr.get(row, 'company_key'),
        branch_key: hr.get(row, 'branch_key'),
        template_type: templateType,
        preview_brief: brief,
        contact: {
          name: brief.contact_name || '',
          phone: brief.contact_phone || '',
          email: brief.contact_email || ''
        },
        source: {
          lead_id: rd.lead_id || '',
          source: rd.source || '',
          created_at: rd.created_at || '',
          segment: brief.segment || '',
          city: brief.city || ''
        },
        pilot_test: true,
        timestamp: now.toISOString()
      };

      hr.set(row, 'webhook_payload_json', JSON.stringify(payload));
      hr.set(row, 'preview_stage', PREVIEW_STAGES.QUEUED);

      // --- Send webhook ---
      hr.set(row, 'preview_stage', PREVIEW_STAGES.SENT_TO_WEBHOOK);

      var resp = UrlFetchApp.fetch(WEBHOOK_URL, {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify(payload),
        muteHttpExceptions: true,
        headers: { 'User-Agent': 'Autosmartweby-CRM/1.0-pilot' }
      });

      var httpCode = resp.getResponseCode();
      var respBody = resp.getContentText();

      if (httpCode < 200 || httpCode >= 300) {
        throw new Error('HTTP ' + httpCode + ': ' + respBody.substring(0, 300));
      }

      var respObj = JSON.parse(respBody);

      if (!respObj || !respObj.ok) {
        hr.set(row, 'preview_stage', PREVIEW_STAGES.FAILED);
        hr.set(row, 'preview_error', 'Webhook ok=false: ' + respBody.substring(0, 300));
        failed++;
        results.push('FAIL řádek ' + rowNum + ': ok=false');
      } else {
        // Write response fields
        hr.set(row, 'preview_url', respObj.preview_url || '');
        hr.set(row, 'preview_screenshot_url', respObj.preview_screenshot_url || '');
        hr.set(row, 'preview_generated_at', now);
        hr.set(row, 'preview_version', respObj.preview_version || '');
        if (respObj.preview_quality_score !== undefined) {
          hr.set(row, 'preview_quality_score', respObj.preview_quality_score);
        }

        var needsReview = respObj.preview_needs_review === true ||
          (respObj.preview_quality_score !== undefined && respObj.preview_quality_score < 0.7);
        hr.set(row, 'preview_needs_review', needsReview ? 'TRUE' : 'FALSE');
        hr.set(row, 'preview_stage', needsReview ? PREVIEW_STAGES.REVIEW_NEEDED : PREVIEW_STAGES.READY);
        hr.set(row, 'preview_error', '');

        ok++;
        results.push('OK řádek ' + rowNum + ': stage=' +
          (needsReview ? 'REVIEW_NEEDED' : 'READY') +
          (respObj.preview_url ? ' url=' + respObj.preview_url : ''));
      }

      aswLog_('INFO', 'runWebhookPilotTest', 'Row ' + rowNum + ' done', { row: rowNum });

    } catch (e) {
      hr.set(row, 'preview_stage', PREVIEW_STAGES.FAILED);
      hr.set(row, 'preview_error', 'PILOT_ERROR: ' + e.message);
      failed++;
      results.push('FAIL řádek ' + rowNum + ': ' + e.message);
      aswLog_('ERROR', 'runWebhookPilotTest', 'Row ' + rowNum + ': ' + e.message, { row: rowNum });
    }

    hr.set(row, 'last_processed_at', now);

    // Small delay between requests
    if (s < selected.length - 1) Utilities.sleep(500);
  }

  // --- Batch write (P1.2: only changed rows) ---
  writeExtensionColumns_(sheet, hr, updatedRows, bulk.data);

  // --- Report ---
  var report = [
    'PILOT TEST DOKONČEN',
    '══════════════════',
    'Odesláno: ' + selected.length,
    'Úspěch: ' + ok,
    'Chyby: ' + failed,
    '',
    'Detail:'
  ].concat(results).join('\n');

  aswLog_('INFO', 'runWebhookPilotTest', report);
  safeAlert_(report);
}
