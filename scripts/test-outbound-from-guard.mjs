#!/usr/bin/env node
/**
 * Outbound From: guard — Local Proof
 *
 * Mirrors the logic of `resolveOutboundFromAddress_` and
 * `assertOutboundFromUsable_` from `apps-script/OutboundEmail.gs`.
 *
 * The Apps Script versions call PropertiesService and GmailApp; this
 * harness ports the same logic over injected dependencies (the Apps
 * Script versions accept a `deps` parameter for exactly this purpose).
 *
 * Asserts the four mandatory scenarios from PR #79 hardening:
 *
 *   1. OUTBOUND_FROM_EMAIL missing                    → blocked
 *   2. OUTBOUND_FROM_EMAIL non-autosmartweb.cz domain → blocked
 *   3. OUTBOUND_FROM_EMAIL @autosmartweb.cz, not in   → blocked
 *      Gmail aliases
 *   4. OUTBOUND_FROM_EMAIL @autosmartweb.cz, in       → allowed
 *      Gmail aliases
 *
 * Plus 2 extra scenarios that exercise the resolver edge paths:
 *   5. getAliases() throws                            → blocked
 *   6. OUTBOUND_FROM_EMAIL has surrounding whitespace → trimmed and
 *                                                       evaluated as
 *                                                       the trimmed value
 *
 * No Google Sheets calls. No clasp push. Pure logic test.
 */

// ── Constants mirroring apps-script/OutboundEmail.gs ───────────

const OUTBOUND_ALLOWED_FROM_DOMAIN_ = 'autosmartweb.cz';

// ── Pure copies of the resolver + guard ────────────────────────
// These MUST stay byte-equivalent to the implementations in
// apps-script/OutboundEmail.gs (modulo `var` → `const`/`let`).
// If the production code drifts, this harness must be updated and
// re-run.

function resolveOutboundFromAddress_(deps) {
  const d = deps;

  const configured = String(d.getProperty('OUTBOUND_FROM_EMAIL') || '').trim();

  if (!configured) {
    return {
      from: null,
      registered: false,
      allowed: false,
      configured: '',
      reason: 'OUTBOUND_FROM_EMAIL Script Property not set'
    };
  }

  const allowed = new RegExp(
    '@' + OUTBOUND_ALLOWED_FROM_DOMAIN_.replace(/\./g, '\\.') + '$',
    'i'
  ).test(configured);

  if (!allowed) {
    return {
      from: null,
      registered: false,
      allowed: false,
      configured,
      reason:
        'OUTBOUND_FROM_EMAIL=' + configured +
        ' is not on allowed domain @' + OUTBOUND_ALLOWED_FROM_DOMAIN_
    };
  }

  let aliases = [];
  try {
    aliases = d.getAliases() || [];
  } catch (e) {
    return {
      from: null,
      registered: false,
      allowed: true,
      configured,
      reason: 'GmailApp.getAliases() failed: ' + e.message
    };
  }

  const registered = aliases.indexOf(configured) !== -1;
  if (!registered) {
    return {
      from: null,
      registered: false,
      allowed: true,
      configured,
      reason:
        'OUTBOUND_FROM_EMAIL=' + configured +
        ' is not registered as Gmail "Send mail as" alias for runtime account'
    };
  }

  return {
    from: configured,
    registered: true,
    allowed: true,
    configured,
    reason: 'OK'
  };
}

function assertOutboundFromUsable_(deps) {
  const info = resolveOutboundFromAddress_(deps);
  if (info.from) return info;

  const msg =
    'Outbound blocked: OUTBOUND_FROM_EMAIL is missing or not a verified ' +
    'Gmail alias. Refusing to send from runtime account. ' +
    'Detail: ' + info.reason + '. ' +
    'Fix: (1) set Script Property OUTBOUND_FROM_EMAIL to a company ' +
    '@' + OUTBOUND_ALLOWED_FROM_DOMAIN_ + ' address, ' +
    '(2) register that address as a Gmail "Send mail as" alias for ' +
    'the runtime account (Gmail Settings → Accounts → Send mail as → ' +
    'Add another email address), (3) re-run the action.';

  throw new Error(msg);
}

// ── Test harness ───────────────────────────────────────────────

let pass = 0;
let fail = 0;
const failures = [];

function assert(cond, label) {
  if (cond) {
    pass++;
    console.log('  ✓ ' + label);
  } else {
    fail++;
    failures.push(label);
    console.log('  ✗ ' + label);
  }
}

function assertThrows(fn, expectedMsgPart, label) {
  let err = null;
  try {
    fn();
  } catch (e) {
    err = e;
  }
  if (!err) {
    fail++;
    failures.push(label + ' (expected throw, got success)');
    console.log('  ✗ ' + label + ' (expected throw, got success)');
    return;
  }
  if (expectedMsgPart && err.message.indexOf(expectedMsgPart) === -1) {
    fail++;
    failures.push(
      label + ' (threw, but message lacks "' + expectedMsgPart + '")'
    );
    console.log(
      '  ✗ ' + label +
      ' (threw, but message lacks "' + expectedMsgPart + '")'
    );
    console.log('    actual: ' + err.message);
    return;
  }
  pass++;
  console.log('  ✓ ' + label);
}

function makeDeps({ propValue, aliases, aliasesThrows }) {
  return {
    getProperty: (key) => {
      if (key === 'OUTBOUND_FROM_EMAIL') return propValue;
      return null;
    },
    getAliases: () => {
      if (aliasesThrows) throw new Error('Mocked Gmail API failure');
      return aliases || [];
    }
  };
}

// ── Scenarios ──────────────────────────────────────────────────

console.log('\nScenario 1 — OUTBOUND_FROM_EMAIL missing → blocked');
{
  const deps = makeDeps({ propValue: '', aliases: [] });
  const info = resolveOutboundFromAddress_(deps);
  assert(info.from === null, 'resolver returns from=null');
  assert(info.allowed === false, 'allowed=false');
  assert(info.registered === false, 'registered=false');
  assert(
    info.reason.indexOf('not set') !== -1,
    'reason mentions "not set"'
  );
  assertThrows(
    () => assertOutboundFromUsable_(deps),
    'Outbound blocked',
    'guard throws "Outbound blocked"'
  );
  assertThrows(
    () => assertOutboundFromUsable_(deps),
    'missing or not a verified',
    'guard message mentions missing/not verified'
  );
}

console.log(
  '\nScenario 2 — OUTBOUND_FROM_EMAIL non-autosmartweb.cz → blocked'
);
{
  const deps = makeDeps({
    propValue: 'sfridrich@unipong.cz',
    aliases: ['sfridrich@unipong.cz'] // even if registered, wrong domain
  });
  const info = resolveOutboundFromAddress_(deps);
  assert(info.from === null, 'resolver returns from=null');
  assert(info.allowed === false, 'allowed=false (wrong domain)');
  assert(info.configured === 'sfridrich@unipong.cz', 'configured echoed');
  assert(
    info.reason.indexOf('not on allowed domain') !== -1,
    'reason mentions "not on allowed domain"'
  );
  assertThrows(
    () => assertOutboundFromUsable_(deps),
    'Outbound blocked',
    'guard throws on wrong domain'
  );
}

console.log(
  '\nScenario 3 — OUTBOUND_FROM_EMAIL @autosmartweb.cz but NOT alias → blocked'
);
{
  const deps = makeDeps({
    propValue: 'info@autosmartweb.cz',
    aliases: ['some-other@autosmartweb.cz', 'another@autosmartweb.cz']
  });
  const info = resolveOutboundFromAddress_(deps);
  assert(info.from === null, 'resolver returns from=null');
  assert(info.allowed === true, 'allowed=true (correct domain)');
  assert(info.registered === false, 'registered=false (not in aliases)');
  assert(
    info.reason.indexOf('not registered as Gmail') !== -1,
    'reason mentions "not registered as Gmail"'
  );
  assertThrows(
    () => assertOutboundFromUsable_(deps),
    'Outbound blocked',
    'guard throws on missing alias'
  );
}

console.log(
  '\nScenario 4 — OUTBOUND_FROM_EMAIL @autosmartweb.cz AND in aliases → allowed'
);
{
  const deps = makeDeps({
    propValue: 'info@autosmartweb.cz',
    aliases: ['info@autosmartweb.cz', 's.fridrich@autosmartweb.cz']
  });
  const info = resolveOutboundFromAddress_(deps);
  assert(info.from === 'info@autosmartweb.cz', 'from=info@autosmartweb.cz');
  assert(info.allowed === true, 'allowed=true');
  assert(info.registered === true, 'registered=true');
  assert(info.reason === 'OK', 'reason="OK"');

  // Guard must not throw — must return same info
  let guardResult = null;
  let guardThrew = false;
  try {
    guardResult = assertOutboundFromUsable_(deps);
  } catch (e) {
    guardThrew = true;
  }
  assert(!guardThrew, 'guard does not throw on valid alias');
  assert(
    guardResult && guardResult.from === 'info@autosmartweb.cz',
    'guard returns valid from'
  );
}

console.log('\nScenario 5 — GmailApp.getAliases() throws → blocked');
{
  const deps = makeDeps({
    propValue: 'info@autosmartweb.cz',
    aliasesThrows: true
  });
  const info = resolveOutboundFromAddress_(deps);
  assert(info.from === null, 'resolver returns from=null');
  assert(info.allowed === true, 'allowed=true');
  assert(
    info.reason.indexOf('GmailApp.getAliases() failed') !== -1,
    'reason mentions getAliases() failure'
  );
  assertThrows(
    () => assertOutboundFromUsable_(deps),
    'Outbound blocked',
    'guard throws on getAliases failure'
  );
}

console.log(
  '\nScenario 6 — OUTBOUND_FROM_EMAIL with surrounding whitespace → trimmed'
);
{
  const deps = makeDeps({
    propValue: '  info@autosmartweb.cz  ',
    aliases: ['info@autosmartweb.cz']
  });
  const info = resolveOutboundFromAddress_(deps);
  assert(info.from === 'info@autosmartweb.cz', 'from is trimmed');
  assert(info.registered === true, 'registered after trim');
  assert(info.reason === 'OK', 'reason="OK" after trim');
}

console.log('\nScenario 7 — case-insensitive domain match');
{
  const deps = makeDeps({
    // Domain part uppercase — RFC says local-part is case-sensitive but
    // domain is case-insensitive. Resolver uses /i flag on regex.
    propValue: 'info@AutoSmartWeb.cz',
    aliases: ['info@AutoSmartWeb.cz']
  });
  const info = resolveOutboundFromAddress_(deps);
  assert(info.allowed === true, 'allowed=true (domain match is case-insensitive)');
  // Note: aliases.indexOf is case-sensitive by design — we don't lowercase
  // the configured value because Gmail registration is case-sensitive at
  // the lookup level. Test reflects current behaviour.
  assert(info.from === 'info@AutoSmartWeb.cz', 'from preserves casing');
}

// ── Summary ────────────────────────────────────────────────────

console.log('\n' + '═'.repeat(60));
console.log('Outbound From: guard — test harness summary');
console.log('═'.repeat(60));
console.log('  Pass:    ' + pass);
console.log('  Fail:    ' + fail);

if (fail > 0) {
  console.log('\nFailures:');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}

console.log('\nAll outbound From: guard scenarios PASS.');
console.log(
  '\nMandatory scenarios from PR #79 hardening (per task brief):'
);
console.log('  1. OUTBOUND_FROM_EMAIL missing                      → BLOCKED  ✓');
console.log('  2. OUTBOUND_FROM_EMAIL non-autosmartweb.cz domain   → BLOCKED  ✓');
console.log('  3. OUTBOUND_FROM_EMAIL @autosmartweb.cz, not alias  → BLOCKED  ✓');
console.log('  4. OUTBOUND_FROM_EMAIL @autosmartweb.cz, is alias   → ALLOWED  ✓');
console.log(
  '\nNo silent fallback to runtime account is possible from the resolver/guard.'
);
process.exit(0);
