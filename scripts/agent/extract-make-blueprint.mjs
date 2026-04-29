#!/usr/bin/env node
// scripts/agent/extract-make-blueprint.mjs
//
// Connects to Sebastián's existing Chrome session via CDP (port 9222),
// creates a minimal Make scenario (1 GitHub trigger + 1 HTTP action),
// exports the scenario blueprint, and prints the JSON to stdout.
//
// Required precondition (Sebastián manual):
//   1. Quit all Chrome windows.
//   2. Launch Chrome with debug port:
//      Windows: "C:\Program Files\Google\Chrome\Application\chrome.exe" \
//          --remote-debugging-port=9222 \
//          --user-data-dir="C:\temp\chrome-debug"
//   3. Log into Make (https://eu2.make.com or your region).
//
// Usage:
//   node scripts/agent/extract-make-blueprint.mjs > /tmp/make-reference-blueprint.json
//
// Failure modes:
//   - Chrome not running on 9222 → exit 2
//   - Not logged in to Make → exit 3 with screenshot
//   - Any scenario step failure → exit 4-9, screenshot saved to /tmp/make-step-*.png

import { chromium } from 'playwright';
import { writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const TMP = tmpdir(); // C:\Users\spook\AppData\Local\Temp on Windows
const SHOT = (n, label) => join(TMP, `make-step-${String(n).padStart(2, '0')}-${label}.png`);

const log = (...args) => console.error('[extract]', ...args);
const fail = async (page, n, label, err) => {
  const path = SHOT(n, label);
  try {
    await page.screenshot({ path, fullPage: true });
    log(`SCREENSHOT: ${path}`);
  } catch (e) {
    log(`screenshot failed: ${e.message}`);
  }
  log(`FAIL at step ${n} (${label}): ${err.message || err}`);
  process.exit(4 + n);
};

async function findMakePage(browser, contexts) {
  // Search all contexts and pages for an open Make tab.
  for (const ctx of contexts) {
    for (const p of ctx.pages()) {
      const url = p.url();
      if (url.includes('make.com')) {
        log(`Found existing Make tab: ${url}`);
        return { context: ctx, page: p };
      }
    }
  }
  // No Make tab found — open a new one in the first context.
  const ctx = contexts[0];
  const page = await ctx.newPage();
  return { context: ctx, page };
}

async function detectRegion(page) {
  // Make has multi-region (eu1/eu2/us1/...). Use whatever region the user is on.
  const url = page.url();
  const m = url.match(/https:\/\/([a-z0-9]+)\.make\.com/);
  return m ? m[1] : 'eu1';
}

async function ensureLoggedIn(page) {
  const url = page.url();
  // Logged-in pages redirect to /organization/{N}/... or /scenarios.
  // Login pages contain /login or /signin.
  if (url.includes('/login') || url.includes('/signin') || url === 'about:blank' || url.includes('://www.make.com/en/')) {
    log('Not logged in (or on marketing page). Sebastián must log in first.');
    return false;
  }
  // Heuristic: look for any element typical to logged-in Make
  // (avatar / org switcher / nav items). Be permissive.
  try {
    await page.waitForLoadState('domcontentloaded', { timeout: 5000 });
  } catch {}
  return true;
}

async function gotoScenariosList(page, region) {
  // Make uses organization-scoped URLs. The "+ Create scenario" button lives
  // in the global header on any org-scoped page, so all we need is to be on
  // a non-404 Make page. Try to recover org ID from current URL or fall back
  // to a known good landing.
  const url = page.url();
  const isMakePage = url.includes('.make.com') && !url.endsWith('/login') && !url.endsWith('/signin');

  // If page looks like 404 or marketing — navigate to org dashboard
  let needNav = !isMakePage;
  try {
    // Detect Make 404 page (purple, "Page Not Found" body)
    const titleText = await page.title();
    if (/404|not found/i.test(titleText)) needNav = true;
  } catch {}

  // Always re-extract org ID from URL or try to find via heuristic API call
  const orgMatch = url.match(/\/organization\/(\d+)/);
  let orgId = orgMatch ? orgMatch[1] : null;

  if (needNav || !orgId) {
    // Go to root, Make will redirect to user's default org dashboard
    const target = `https://${region}.make.com/`;
    try {
      log(`navigate to root: ${target}`);
      await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(2500);
      const newUrl = page.url();
      log(`landed at: ${newUrl}`);
      const m = newUrl.match(/\/organization\/(\d+)/);
      if (m) orgId = m[1];
    } catch (e) {
      log(`root navigate failed: ${e.message}`);
    }
  }

  log(`org id: ${orgId || 'unknown'}; current url: ${page.url()}`);
  return page.url();
}

async function clickByText(page, ...texts) {
  for (const t of texts) {
    const loc = page.getByText(t, { exact: false }).first();
    if (await loc.count()) {
      log(`click text: ${t}`);
      await loc.click({ timeout: 5000 });
      return true;
    }
  }
  return false;
}

async function main() {
  log('Connecting to Chrome on localhost:9222 ...');
  let browser;
  try {
    browser = await chromium.connectOverCDP('http://localhost:9222');
  } catch (e) {
    log(`Cannot connect to Chrome: ${e.message}`);
    log('Make sure Chrome is running with --remote-debugging-port=9222.');
    process.exit(2);
  }

  const contexts = browser.contexts();
  log(`Got ${contexts.length} browser context(s).`);

  const { context, page } = await findMakePage(browser, contexts);

  // Set up download handler BEFORE any action that may trigger download.
  let downloadedJson = null;
  context.on('page', (newPage) => {
    log(`new tab: ${newPage.url()}`);
  });
  page.on('download', async (download) => {
    const fname = download.suggestedFilename();
    log(`DOWNLOAD: ${fname}`);
    const dest = join(TMP, fname);
    await download.saveAs(dest);
    log(`saved to: ${dest}`);
    try {
      downloadedJson = readFileSync(dest, 'utf-8');
    } catch (e) {
      log(`could not read downloaded file: ${e.message}`);
    }
  });

  // Step 1: confirm logged in
  try {
    const ok = await ensureLoggedIn(page);
    if (!ok) {
      await fail(page, 1, 'not-logged-in', new Error('User not logged in to Make. Open Make in this Chrome and log in, then re-run.'));
    }
    await page.screenshot({ path: SHOT(1, 'initial') });
    log(`SCREENSHOT (initial): ${SHOT(1, 'initial')}`);
  } catch (e) {
    await fail(page, 1, 'login-check', e);
  }

  const region = await detectRegion(page);
  log(`Region: ${region}`);

  // Step 2: navigate to scenarios
  try {
    const u = await gotoScenariosList(page, region);
    log(`scenarios URL: ${u}`);
    await page.waitForTimeout(2000);
    await page.screenshot({ path: SHOT(2, 'scenarios') });
    log(`SCREENSHOT (scenarios list): ${SHOT(2, 'scenarios')}`);
  } catch (e) {
    await fail(page, 2, 'goto-scenarios', e);
  }

  // Step 3: click the "+ Create scenario" button (purple, top-right header)
  try {
    log('looking for + Create scenario button ...');
    // The button is in the header on every Make page; prefer button role match.
    const btn = page.getByRole('button', { name: /create scenario/i }).first();
    if (await btn.count()) {
      log('clicking role=button [Create scenario]');
      await btn.click({ timeout: 5000 });
    } else {
      // Fallback to text-based locator
      const ok = await clickByText(
        page,
        '+ Create scenario',
        'Create scenario',
        'Create a new scenario',
        'New scenario'
      );
      if (!ok) {
        // Last fallback: any anchor/button containing "scenario" near the top of the page
        const fallback = page.locator('a:has-text("scenario"), button:has-text("scenario")').first();
        if (await fallback.count()) {
          await fallback.click({ timeout: 5000 });
        } else {
          throw new Error('No Create scenario button found.');
        }
      }
    }
    // Editor loads slowly; wait for the editor canvas to mount.
    await page.waitForTimeout(4000);

    // Handle "Recover unsaved changes?" modal if it appears (orphan from prior runs).
    try {
      const discardBtn = page.getByRole('button', { name: /discard/i }).first();
      if (await discardBtn.count()) {
        log('found "Recover unsaved changes" modal — clicking Discard');
        await discardBtn.click({ timeout: 3000 });
        await page.waitForTimeout(1500);
      }
    } catch (e) {
      log(`discard modal handling non-fatal: ${e.message}`);
    }

    await page.screenshot({ path: SHOT(3, 'editor-blank') });
    log(`SCREENSHOT (blank editor): ${SHOT(3, 'editor-blank')}`);
  } catch (e) {
    await fail(page, 3, 'create-scenario', e);
  }

  // Step 4: click big "+" to add first module
  try {
    log('locating first-module placeholder via DOM eval ...');
    // The "+" is a clickable wrapper around an SVG. Use page.evaluate to
    // find any clickable element with cursor:pointer that contains an
    // SVG and is reasonably big (placeholder is ~250-300px).
    const target = await page.evaluate(() => {
      // Look for clickable wrappers that contain plus SVG
      const all = [...document.querySelectorAll('button, div, [role="button"]')];
      let best = null;
      let bestSize = 0;
      for (const el of all) {
        const rect = el.getBoundingClientRect();
        if (rect.width < 100 || rect.height < 100) continue;
        if (rect.width > 600 || rect.height > 600) continue;
        const style = getComputedStyle(el);
        if (style.cursor !== 'pointer') continue;
        // Must contain SVG (the plus icon)
        if (!el.querySelector('svg')) continue;
        // Prefer purple-ish background (Make accent)
        const bg = style.backgroundColor || '';
        const isPurple = /rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+/.test(bg) &&
                         (bg.includes('14') || bg.includes('80') || bg.includes('120'));
        const size = rect.width * rect.height;
        if (size > bestSize) {
          bestSize = size;
          best = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, w: rect.width, h: rect.height, purple: isPurple };
        }
      }
      return best;
    });

    log(`first-module candidate: ${JSON.stringify(target)}`);

    if (target) {
      log(`clicking at (${target.x}, ${target.y})`);
      await page.mouse.click(target.x, target.y);
    } else {
      // Fallback: click coords matching screenshot (purple plus is ~ 505, 410 on 929×906 viewport)
      log('no DOM candidate; using hardcoded screenshot coords');
      await page.mouse.click(505, 410);
    }

    await page.waitForTimeout(3000);
    await page.screenshot({ path: SHOT(4, 'after-plus-click') });
    log(`SCREENSHOT (after + click): ${SHOT(4, 'after-plus-click')}`);
  } catch (e) {
    await fail(page, 4, 'click-first-module', e);
  }

  // Step 5: search HTTP and pick a module (HTTP is simpler than GitHub —
  // doesn't require connection setup; gives us a valid blueprint structure).
  try {
    log('searching for HTTP module ...');

    // Make uses [data-testid="app-search-input"] for the module-picker search.
    const searchInput = page.locator('[data-testid="app-search-input"]').first();
    if (await searchInput.count()) {
      log('filling search via fill() (skip click — overlay intercepts)');
      // fill() implicitly focuses; doesn't need a click first.
      await searchInput.fill('HTTP', { timeout: 5000 }).catch(async (e) => {
        log(`fill failed; trying type via keyboard: ${e.message}`);
        await searchInput.click({ force: true }).catch(() => {});
        await page.keyboard.type('HTTP');
      });
      await page.waitForTimeout(2500);
    } else {
      throw new Error('app-search-input not found in module picker — picker may not have opened');
    }

    await page.screenshot({ path: SHOT(5, 'after-search-http') });
    log(`SCREENSHOT (after search): ${SHOT(5, 'after-search-http')}`);

    // Click HTTP app card. Make displays results as cards — likely
    // [data-testid*="app-card"] or app-name elements containing "HTTP".
    log('clicking HTTP app card ...');
    const httpCardCandidates = [
      page.locator('[data-testid*="app-card"]:has-text("HTTP")').first(),
      page.locator('[role="button"]:has-text("HTTP")').first(),
      page.locator('button:has-text("HTTP")').first(),
      page.locator('a:has-text("HTTP")').first(),
      page.getByText(/^HTTP$/i).first(),
    ];
    let httpClicked = false;
    for (const loc of httpCardCandidates) {
      if (await loc.count()) {
        try {
          await loc.click({ timeout: 5000, force: true });
          httpClicked = true;
          log('HTTP app clicked');
          break;
        } catch (e) {
          log(`HTTP card candidate failed: ${e.message}`);
        }
      }
    }
    if (!httpClicked) {
      throw new Error('HTTP app card not clickable via any selector');
    }

    await page.waitForTimeout(2500);
    await page.screenshot({ path: SHOT(6, 'http-app-clicked') });
    log(`SCREENSHOT (http app clicked): ${SHOT(6, 'http-app-clicked')}`);

    // Pick "Make a request" action — same overlay-intercept issue may apply.
    log('picking Make a request action ...');
    const actionCandidates = [
      page.locator('[role="button"]:has-text("Make a request")').first(),
      page.locator('button:has-text("Make a request")').first(),
      page.locator('li:has-text("Make a request")').first(),
      page.getByText('Make a request', { exact: false }).first(),
    ];
    let actionClicked = false;
    for (const loc of actionCandidates) {
      if (await loc.count()) {
        try {
          await loc.click({ timeout: 5000, force: true });
          actionClicked = true;
          log('Make a request clicked');
          break;
        } catch (e) {
          log(`action candidate failed: ${e.message}`);
        }
      }
    }
    if (!actionClicked) {
      // Take any HTTP-action with "request" in title
      const anyAction = page.locator('div, button, li').filter({ hasText: /request/i }).first();
      if (await anyAction.count()) {
        await anyAction.click({ force: true, timeout: 5000 }).catch(() => {});
      } else {
        throw new Error('No HTTP action found');
      }
    }
    await page.waitForTimeout(3500);
    await page.screenshot({ path: SHOT(7, 'http-action-selected') });
    log(`SCREENSHOT (http action selected): ${SHOT(7, 'http-action-selected')}`);
  } catch (e) {
    await fail(page, 5, 'pick-http', e);
  }

  // Step 6: close any modal / connection dialog without configuring
  try {
    log('attempting to close connection dialog ...');
    const closes = ['Cancel', 'Close', 'Zavřít', 'Skip'];
    for (const t of closes) {
      const c = page.getByRole('button', { name: t }).first();
      if (await c.count()) {
        await c.click({ timeout: 3000 }).catch(() => {});
        log(`clicked: ${t}`);
        break;
      }
    }
    await page.waitForTimeout(1500);
    // Press Escape twice for safety
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: SHOT(7, 'after-close-modal') });
    log(`SCREENSHOT (after close modal): ${SHOT(7, 'after-close-modal')}`);
  } catch (e) {
    log(`close-dialog non-fatal: ${e.message}`);
  }

  // Step 7: save (Ctrl+S) — Make may allow saving even with unconfigured module
  try {
    log('saving scenario via Ctrl+S ...');
    await page.keyboard.press('Control+S');
    await page.waitForTimeout(3000);
    await page.screenshot({ path: SHOT(8, 'saved') });
    log(`SCREENSHOT (after save): ${SHOT(8, 'saved')}`);
  } catch (e) {
    log(`save non-fatal: ${e.message}`);
  }

  // Step 8: open scenario menu (... button) → Export Blueprint
  try {
    log('opening scenario more-menu ...');
    const moreMenu = page.locator(
      '[aria-label*="more" i], [aria-label*="možnosti" i], [data-test-id*="more"], button:has-text("⋯"), button:has-text("...")'
    ).first();
    if (await moreMenu.count()) {
      await moreMenu.click({ timeout: 5000 });
      await page.waitForTimeout(1000);
    } else {
      log('more-menu button not found by typical selectors; will try menu items directly');
    }

    log('clicking Export Blueprint ...');
    const exportClicked = await clickByText(
      page,
      'Export Blueprint',
      'Export blueprint',
      'Exportovat blueprint',
      'Export'
    );
    if (!exportClicked) {
      throw new Error('Export Blueprint menu item not found.');
    }
    // Wait for download
    log('waiting for download (max 15s) ...');
    const start = Date.now();
    while (!downloadedJson && Date.now() - start < 15000) {
      await page.waitForTimeout(500);
    }
    await page.screenshot({ path: SHOT(9, 'export-clicked') });
    log(`SCREENSHOT (export clicked): ${SHOT(9, 'export-clicked')}`);
  } catch (e) {
    await fail(page, 8, 'export-blueprint', e);
  }

  // Step 9: print result
  if (!downloadedJson) {
    log('No file downloaded. Maybe Make returned blueprint inline in a modal?');
    // Try to read from clipboard or open modal text
    try {
      const modalText = await page.locator('textarea, pre, code').first().textContent({ timeout: 3000 });
      if (modalText && modalText.trim().startsWith('{')) {
        downloadedJson = modalText;
        log('extracted JSON from in-page element');
      }
    } catch {}
  }

  if (!downloadedJson) {
    log('FAILURE: no blueprint JSON obtained.');
    await page.screenshot({ path: SHOT(99, 'final-no-json') });
    process.exit(9);
  }

  log(`SUCCESS: blueprint length = ${downloadedJson.length} bytes`);
  // Print to stdout (so caller can pipe into a file)
  process.stdout.write(downloadedJson);
  await browser.close().catch(() => {});
  process.exit(0);
}

main().catch(async (e) => {
  log(`UNCAUGHT: ${e.stack || e.message || e}`);
  process.exit(1);
});
