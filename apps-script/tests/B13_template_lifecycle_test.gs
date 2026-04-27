/**
 * B-13 T12: Apps Script integration test for template lifecycle.
 *
 * MANUAL RUNNER — run from Apps Script editor against TEST sheet
 * BEFORE deploying to PROD. Tests exercise the full draft+publish
 * cycle end-to-end without modifying production data.
 *
 * Suite functions:
 *   B13_runAll()                    — run all tests, alert summary
 *   B13_test_setupIdempotence()     — setupEmailTemplates twice, no errors
 *   B13_test_bootstrapIdempotence() — bootstrap twice, second is no-op
 *   B13_test_draftLifecycle()       — save → publish cycle, version bump
 *   B13_test_emptyDraftPublish()    — empty subject blocks publish
 *   B13_test_commitMessage()        — < 5 chars rejected
 *   B13_test_renderTemplate()       — render with full lead, verify substitution
 *   B13_test_chooseTemplate()       — auto-select for has_website states
 *   B13_test_fallbackPath()         — composeDraft with no active template
 *
 * Each test is self-contained — uses unique template_key like
 * '_test_b13_<timestamp>' to avoid stomping on real data. Cleans up
 * after run.
 *
 * NOT for production deploy. .claspignore excludes apps-script/tests/**
 * so this file isn't pushed via clasp.
 */

var B13_TEST_RESULTS_ = [];
var B13_TEST_KEY_PREFIX_ = '_test_b13_';

function B13_runAll() {
  B13_TEST_RESULTS_ = [];

  B13_test_setupIdempotence();
  B13_test_bootstrapIdempotence();
  B13_test_draftLifecycle();
  B13_test_emptyDraftPublish();
  B13_test_commitMessage();
  B13_test_renderTemplate();
  B13_test_chooseTemplate();
  B13_test_fallbackPath();

  // Cleanup any leftover _test_ rows
  B13_cleanup_();

  var passed = 0, failed = 0;
  var details = [];
  for (var i = 0; i < B13_TEST_RESULTS_.length; i++) {
    var r = B13_TEST_RESULTS_[i];
    if (r.ok) passed++;
    else { failed++; details.push('✗ ' + r.name + ': ' + r.error); }
  }

  var summary = 'B13 lifecycle tests: ' + passed + '/' + (passed + failed) + ' passed';
  if (failed > 0) summary += '\n\n' + details.join('\n');
  Logger.log(summary);
  try { SpreadsheetApp.getUi().alert(summary); } catch (e) { /* no UI in time-driven */ }
}

function B13_assert_(name, condition, errMsg) {
  if (condition) {
    B13_TEST_RESULTS_.push({ name: name, ok: true });
  } else {
    B13_TEST_RESULTS_.push({ name: name, ok: false, error: errMsg || 'assertion failed' });
  }
}

function B13_test_setupIdempotence() {
  try {
    setupEmailTemplates();
    setupEmailTemplates();  // second run, no error expected
    B13_assert_('setup idempotence', true);
  } catch (e) {
    B13_assert_('setup idempotence', false, e.message);
  }
}

function B13_test_bootstrapIdempotence() {
  try {
    // Don't actually run bootstrapNoWebsiteV1 — it would publish a real
    // template. Instead test the underlying invariant: publishing twice
    // for the same key requires a fresh draft each time.
    var key = B13_TEST_KEY_PREFIX_ + 'boot_' + Date.now();

    saveTemplateDraft_(key, 'subj', 'body', 'name', 'desc');
    publishTemplate_(key, 'first publish');

    // Second publish without draft should fail
    var threwOnNoDraft = false;
    try {
      publishTemplate_(key, 'second publish');
    } catch (e) {
      threwOnNoDraft = (e.message.indexOf('No draft to publish') >= 0);
    }

    B13_assert_('bootstrap idempotence — second publish requires new draft', threwOnNoDraft);
  } catch (e) {
    B13_assert_('bootstrap idempotence', false, e.message);
  }
}

function B13_test_draftLifecycle() {
  try {
    var key = B13_TEST_KEY_PREFIX_ + 'cycle_' + Date.now();

    // Save draft
    var d1 = saveTemplateDraft_(key, 'Subj v1', 'Body v1', 'Name', 'Desc');
    B13_assert_('draft saved with status=draft', d1.status === 'draft');
    B13_assert_('draft initial version=0', d1.version === 0);

    // Update same draft (overwrite, not new row)
    var d2 = saveTemplateDraft_(key, 'Subj v1.1', 'Body v1.1', 'Name', 'Desc');
    B13_assert_('draft overwrite preserves template_id', d2.template_id === d1.template_id);

    // Publish v1
    var p1 = publishTemplate_(key, 'first version commit');
    B13_assert_('publish promotes to v1', p1.version === 1);
    B13_assert_('publish status=active', p1.status === 'active');
    B13_assert_('publish records commit_message', p1.commit_message === 'first version commit');

    // Save another draft (over published v1)
    var d3 = saveTemplateDraft_(key, 'Subj v2', 'Body v2', 'Name', 'Desc');
    B13_assert_('new draft after publish', d3.status === 'draft');
    B13_assert_('new draft references parent', d3.parent_template_id === p1.template_id);

    // Publish v2
    var p2 = publishTemplate_(key, 'second version commit');
    B13_assert_('publish v2', p2.version === 2);

    // Verify v1 is now archived
    var hist = listTemplateHistory_(key);
    var v1archived = false;
    for (var i = 0; i < hist.length; i++) {
      if (hist[i].version === 1 && hist[i].status === 'archived') v1archived = true;
    }
    B13_assert_('previous active flipped to archived', v1archived);

  } catch (e) {
    B13_assert_('draft lifecycle', false, e.message);
  }
}

function B13_test_emptyDraftPublish() {
  try {
    var key = B13_TEST_KEY_PREFIX_ + 'empty_' + Date.now();
    saveTemplateDraft_(key, '', '', 'Name', 'Desc');

    var threw = false;
    try {
      publishTemplate_(key, 'this should fail');
    } catch (e) {
      threw = (e.message.indexOf('empty subject or body') >= 0);
    }
    B13_assert_('empty draft publish blocked', threw);
  } catch (e) {
    B13_assert_('empty draft publish', false, e.message);
  }
}

function B13_test_commitMessage() {
  try {
    var key = B13_TEST_KEY_PREFIX_ + 'commit_' + Date.now();
    saveTemplateDraft_(key, 'subj', 'body', 'Name', 'Desc');

    var threw = false;
    try {
      publishTemplate_(key, 'x');  // 1 char, < 5
    } catch (e) {
      threw = (e.message.indexOf('Commit message required') >= 0);
    }
    B13_assert_('commit msg < 5 chars rejected', threw);
  } catch (e) {
    B13_assert_('commit message validation', false, e.message);
  }
}

function B13_test_renderTemplate() {
  try {
    var template = {
      subject_template: 'Pro {business_name}',
      body_template: 'Dobrý den{contact_name_comma}.\n\n{preview_url}'
    };
    var lead = {
      business_name: 'Test ALVITO',
      contact_name: 'Pavel',
      preview_url: 'https://test.local/preview',
      city: '',
      service_type: '',
      segment: '',
      pain_point: ''
    };
    var rendered = renderTemplate_(template, lead);
    B13_assert_('render subject', rendered.subject === 'Pro Test ALVITO');
    B13_assert_(
      'render body with greeting comma',
      rendered.body === 'Dobrý den, Pavel.\n\nhttps://test.local/preview'
    );

    // No contact_name → no comma
    lead.contact_name = '';
    var r2 = renderTemplate_(template, lead);
    B13_assert_('render body without contact — no comma', r2.body === 'Dobrý den.\n\nhttps://test.local/preview');
  } catch (e) {
    B13_assert_('render template', false, e.message);
  }
}

function B13_test_chooseTemplate() {
  try {
    // Fake rd objects mimicking different web states. resolveWebsiteState_
    // signature can shift — these inputs target the public auto-select
    // contract from chooseEmailTemplate_.
    var noWebRd = { has_website: 'no', website_quality: '' };
    var weakRd = { has_website: 'yes', website_quality: 'bad', website_url: 'http://x.cz' };
    var hasRd = { has_website: 'yes', website_quality: 'good', website_url: 'http://x.cz' };

    var k1 = chooseEmailTemplate_(noWebRd);
    B13_assert_('chooseTemplate NO_WEBSITE → no-website', k1 === 'no-website');

    var k2 = chooseEmailTemplate_(weakRd);
    B13_assert_('chooseTemplate WEAK_WEBSITE → weak-website', k2 === 'weak-website');

    var k3 = chooseEmailTemplate_(hasRd);
    B13_assert_('chooseTemplate HAS_WEBSITE → has-website', k3 === 'has-website');
  } catch (e) {
    B13_assert_('choose template', false, e.message);
  }
}

function B13_test_fallbackPath() {
  try {
    // composeDraft_ with a realistic rd. If no-website has an active
    // template (post-bootstrap), template_key='no-website'. If not,
    // template_key='' (fallback). Both are valid outcomes.
    var rd = {
      business_name: 'Fallback test',
      has_website: 'no',
      contact_name: '',
      city: 'Praha',
      service_type: 'instalatér',
      segment: 'instalatér',
      assignee_email: ''
    };
    var draft = composeDraft_(rd);

    B13_assert_('composeDraft returns object', typeof draft === 'object');
    B13_assert_('composeDraft has subject', !!draft.subject);
    B13_assert_('composeDraft has body', !!draft.body);
    B13_assert_(
      'composeDraft template_key in expected set',
      draft.template_key === '' || draft.template_key === 'no-website'
    );
  } catch (e) {
    B13_assert_('fallback path', false, e.message);
  }
}

function B13_cleanup_() {
  try {
    var sheet = ensureEmailTemplatesSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return;

    var keys = sheet.getRange(2, 2, lastRow - 1, 1).getValues();
    var rowsToDelete = [];
    for (var i = 0; i < keys.length; i++) {
      var k = String(keys[i][0] || '');
      if (k.indexOf(B13_TEST_KEY_PREFIX_) === 0) {
        rowsToDelete.push(i + 2);  // sheet row number
      }
    }
    // Delete from bottom to top so indices don't shift
    rowsToDelete.sort(function(a, b) { return b - a; });
    for (var i = 0; i < rowsToDelete.length; i++) {
      sheet.deleteRow(rowsToDelete[i]);
    }
    Logger.log('B13_cleanup_: deleted ' + rowsToDelete.length + ' test rows');
  } catch (e) {
    Logger.log('B13_cleanup_ error: ' + e.message);
  }
}
