/**
 * DP-003 regression test for `scripts/clasp-deploy.sh`.
 *
 * Verifies the trap-based atomic restore: if the script is interrupted
 * between the swap (TEST .clasp.json → PROD .clasp.json) and the explicit
 * restore, the trap on EXIT/INT/TERM still puts .clasp.json back to TEST
 * state. Without the trap, an aborted prod deploy left .clasp.json in
 * PROD state and the next innocent `./clasp-deploy.sh test` would push
 * to PROD silently.
 *
 * Run with:
 *   node --test scripts/tests/clasp-deploy-trap.test.mjs
 *
 * Or via npm:
 *   npm run test:clasp-deploy-trap
 *
 * The test sources scripts/clasp-deploy.sh in CLASP_DEPLOY_TEST_MODE so
 * only the helper functions load (no real deploy logic runs). It then
 * mimics the prod swap path in a sub-shell, aborts mid-deploy via
 * `exit 42`, and asserts post-mortem state of the temp .clasp.json.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLASP_DEPLOY_PATH = resolve(__dirname, '..', 'clasp-deploy.sh');

function shellQuote(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

test('clasp-deploy.sh trap restores .clasp.json after abort mid-deploy (DP-003)', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dp003-'));
  try {
    const TEST_CONTENT = '{"scriptId":"FAKE_TEST_SCRIPT_ID","parentId":"FAKE_TEST_PARENT"}';
    const PROD_CONTENT = '{"scriptId":"FAKE_PROD_SCRIPT_ID","parentId":"FAKE_PROD_PARENT"}';
    const claspActive = join(tmp, '.clasp.json');
    const claspProd = join(tmp, '.clasp.json.prod');
    const claspBackup = join(tmp, '.clasp.json.bak');
    writeFileSync(claspActive, TEST_CONTENT);
    writeFileSync(claspProd, PROD_CONTENT);

    const script = `
      set -uo pipefail
      # Source first; the script defines CLASP_ACTIVE/PROD/BACKUP from
      # the real apps-script/ paths. We then override them with our temp
      # paths so restore_clasp_config (dynamic-scope bash function) sees
      # the test values.
      CLASP_DEPLOY_TEST_MODE=1 source ${shellQuote(CLASP_DEPLOY_PATH)}
      CLASP_ACTIVE=${shellQuote(claspActive)}
      CLASP_PROD=${shellQuote(claspProd)}
      CLASP_BACKUP=${shellQuote(claspBackup)}
      type restore_clasp_config >/dev/null || { echo "FAIL: restore_clasp_config not defined"; exit 99; }
      trap restore_clasp_config EXIT INT TERM
      cp "$CLASP_ACTIVE" "$CLASP_BACKUP"
      cp "$CLASP_PROD" "$CLASP_ACTIVE"
      # Sanity: at this point .clasp.json should be PROD content
      grep -q FAKE_PROD_SCRIPT_ID "$CLASP_ACTIVE" || { echo "FAIL: swap did not happen"; exit 98; }
      # Simulate Ctrl+C / kill / panic mid-deploy
      exit 42
    `;
    const result = spawnSync('bash', ['-c', script], { encoding: 'utf-8' });

    assert.equal(result.status, 42, `subscript should exit 42 (got ${result.status}); stderr=${result.stderr}`);

    const restored = readFileSync(claspActive, 'utf-8');
    assert.equal(restored, TEST_CONTENT, '.clasp.json must be restored to TEST content by trap');
    assert.equal(existsSync(claspBackup), false, '.clasp.json.bak must be cleaned up by trap');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('clasp-deploy.sh trap is idempotent: explicit restore + trap fire = single restore', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dp003-'));
  try {
    const TEST_CONTENT = '{"scriptId":"FAKE_TEST_SCRIPT_ID"}';
    const PROD_CONTENT = '{"scriptId":"FAKE_PROD_SCRIPT_ID"}';
    const claspActive = join(tmp, '.clasp.json');
    const claspProd = join(tmp, '.clasp.json.prod');
    const claspBackup = join(tmp, '.clasp.json.bak');
    writeFileSync(claspActive, TEST_CONTENT);
    writeFileSync(claspProd, PROD_CONTENT);

    const script = `
      set -uo pipefail
      CLASP_DEPLOY_TEST_MODE=1 source ${shellQuote(CLASP_DEPLOY_PATH)}
      CLASP_ACTIVE=${shellQuote(claspActive)}
      CLASP_PROD=${shellQuote(claspProd)}
      CLASP_BACKUP=${shellQuote(claspBackup)}
      trap restore_clasp_config EXIT INT TERM
      cp "$CLASP_ACTIVE" "$CLASP_BACKUP"
      cp "$CLASP_PROD" "$CLASP_ACTIVE"
      # Happy path: explicit restore call (mimics post-clasp-push line)
      restore_clasp_config
      # Trap will fire on EXIT — must be idempotent (no-op when backup gone)
      exit 0
    `;
    const result = spawnSync('bash', ['-c', script], { encoding: 'utf-8' });

    assert.equal(result.status, 0, `subscript should exit 0 (got ${result.status}); stderr=${result.stderr}`);

    const restored = readFileSync(claspActive, 'utf-8');
    assert.equal(restored, TEST_CONTENT, '.clasp.json must be TEST content after happy-path + trap');
    assert.equal(existsSync(claspBackup), false, '.clasp.json.bak must not linger');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('clasp-deploy.sh test mode source does not run deploy logic', () => {
  const script = `
    set -uo pipefail
    CLASP_DEPLOY_TEST_MODE=1 source ${shellQuote(CLASP_DEPLOY_PATH)}
    type restore_clasp_config >/dev/null
    echo OK
  `;
  const result = spawnSync('bash', ['-c', script], { encoding: 'utf-8' });
  assert.equal(result.status, 0, `test-mode source should exit 0; stderr=${result.stderr}`);
  assert.match(result.stdout, /OK/);
  // If test mode was ignored, the script would print "Usage: ..." (no $1).
  assert.doesNotMatch(result.stdout, /Usage:/);
});
