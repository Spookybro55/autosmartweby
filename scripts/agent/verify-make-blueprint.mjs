#!/usr/bin/env node
// scripts/agent/verify-make-blueprint.mjs
//
// Imports a Make blueprint JSON file via Make UI to verify its format
// passes Make's import validator.
//
// Usage:
//   node scripts/agent/verify-make-blueprint.mjs <path-to-blueprint.json>
//
// Same prerequisites as extract-make-blueprint.mjs (Chrome on 9222 + logged in).
//
// Exit codes:
//   0 = blueprint imports successfully (no "invalid blueprint" error)
//   2 = Chrome unreachable
//   4-9 = step-specific failures (screenshot saved)
//   1 = blueprint failed import (rejected by Make validator)

import { chromium } from 'playwright';
import { readFileSync, existsSync } from 'fs';
import { join, basename } from 'path';
import { tmpdir } from 'os';

const TMP = tmpdir();
const SHOT = (n, label) => join(TMP, `verify-step-${String(n).padStart(2, '0')}-${label}.png`);
const log = (...args) => console.error('[verify]', ...args);

const args = process.argv.slice(2);
const saveAfterImport = args.includes("--save");
const blueprintPath = args.find((a) => !a.startsWith("--"));
if (!blueprintPath || !existsSync(blueprintPath)) {
  log(`Usage: node ${process.argv[1]} [--save] <blueprint.json>`);
  process.exit(2);
}
log(`Blueprint: ${blueprintPath}${saveAfterImport ? " (will save after import)" : ""}`);

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

async function main() {
  let browser;
  try {
    browser = await chromium.connectOverCDP('http://localhost:9222');
  } catch (e) {
    log(`Cannot connect to Chrome: ${e.message}`);
    process.exit(2);
  }

  const contexts = browser.contexts();
  const ctx = contexts[0];
  let page = ctx.pages().find((p) => p.url().includes('make.com'));
  if (!page) page = await ctx.newPage();

  // Step 1: navigate to known org dashboard (Sebastián's org id 3872179
  // discovered during extractor run). Avoids "Make root" redirect race.
  try {
    log('navigate to org 3872179 dashboard');
    await page.goto('https://eu2.make.com/organization/3872179/dashboard', {
      waitUntil: 'networkidle',
      timeout: 30000,
    });
    await page.waitForTimeout(4000);
    await page.screenshot({ path: SHOT(1, 'dashboard') });
  } catch (e) {
    log(`navigate non-fatal: ${e.message}`);
    await page.waitForTimeout(4000);
  }

  // Step 2: open "Create scenario" → this gives us editor with Import Blueprint option
  try {
    log('waiting for "Create scenario" text element (max 60s)');
    // Multi-strategy: button role, anchor role, plain text. Same as extractor.
    const candidates = [
      page.getByRole('button', { name: /create scenario/i }).first(),
      page.getByRole('link', { name: /create scenario/i }).first(),
      page.getByText(/^Create scenario$/i).first(),
      page.getByText(/create scenario/i).first(),
      page.locator('a[href*="scenarios/add"], a[href*="scenarios/new"]').first(),
    ];
    let clicked = false;
    const start = Date.now();
    while (Date.now() - start < 60000 && !clicked) {
      for (const loc of candidates) {
        if (await loc.count()) {
          try {
            log(`trying click candidate (visible? ${await loc.isVisible().catch(() => 'unknown')})`);
            await loc.click({ timeout: 3000, force: true });
            clicked = true;
            log('clicked Create scenario');
            break;
          } catch (e) {
            log(`candidate failed: ${e.message?.slice(0, 80)}`);
          }
        }
      }
      if (!clicked) await page.waitForTimeout(2000);
    }
    if (!clicked) throw new Error('No Create scenario element clickable');
    await page.waitForTimeout(4000);

    // Discard any "Recover unsaved changes" modal
    const discardBtn = page.getByRole('button', { name: /discard/i }).first();
    if (await discardBtn.count()) {
      log('discard recover modal');
      await discardBtn.click({ timeout: 3000 });
      await page.waitForTimeout(1500);
    }

    // Close module picker if it auto-opened (Escape closes it; we don't want
    // to add a module — we want top-right "..." menu).
    log('pressing Escape to close any module picker');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(800);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1200);

    await page.screenshot({ path: SHOT(2, 'editor') });
  } catch (e) {
    await fail(page, 2, 'open-editor', e);
  }

  // Step 3: open top-right scenario "..." menu → Import Blueprint
  try {
    log('opening top-right scenario menu (...)');

    // The "..." button is in the top-right toolbar at approx (880, 44) on
    // a 929×906 viewport. Use DOM evaluate to find a button-like element
    // in the top-right that is NOT in the left sidebar.
    const target = await page.evaluate(() => {
      const buttons = [...document.querySelectorAll('button, [role="button"]')];
      const vw = window.innerWidth;
      const candidates = buttons
        .map((b) => {
          const r = b.getBoundingClientRect();
          return { el: b, x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height };
        })
        .filter((c) => c.x > vw * 0.8 && c.y < 100 && c.w < 60 && c.h < 60);
      // Pick the right-most (likely "..." menu at the very edge)
      candidates.sort((a, b) => b.x - a.x);
      const top = candidates[0];
      return top ? { x: top.x, y: top.y } : null;
    });

    log(`top-right menu candidate: ${JSON.stringify(target)}`);

    if (target) {
      await page.mouse.click(target.x, target.y);
    } else {
      // Hardcoded fallback per screenshot position (929×906 viewport).
      log('hardcoded fallback click (880, 44)');
      await page.mouse.click(880, 44);
    }
    await page.waitForTimeout(1500);
    await page.screenshot({ path: SHOT(3, 'more-menu') });

    log('clicking Import Blueprint');
    const importItem = page.getByText(/import.{0,5}blueprint/i).first();
    await importItem.waitFor({ state: 'visible', timeout: 5000 });
    await importItem.click({ timeout: 5000, force: true });

    await page.waitForTimeout(1500);
    await page.screenshot({ path: SHOT(4, 'import-dialog') });
  } catch (e) {
    await fail(page, 3, 'import-menu', e);
  }

  // Step 4: upload file
  try {
    log('uploading blueprint file');
    // The dialog should have a file input
    const fileInput = page.locator('input[type="file"]').first();
    if (await fileInput.count()) {
      await fileInput.setInputFiles(blueprintPath);
      log('file input set');
    } else {
      throw new Error('No file input in import dialog');
    }
    await page.waitForTimeout(3000);
    await page.screenshot({ path: SHOT(5, 'after-upload') });

    // Try to confirm/save the import if a button is shown
    const confirmBtn = page.getByRole('button', { name: /save|import|continue|ok/i }).first();
    if (await confirmBtn.count()) {
      log('clicking confirm button');
      await confirmBtn.click({ timeout: 5000, force: true }).catch((e) => log(`confirm failed: ${e.message}`));
      await page.waitForTimeout(2500);
    }
    await page.screenshot({ path: SHOT(6, 'after-confirm') });
  } catch (e) {
    await fail(page, 4, 'upload', e);
  }

  // Step 5: detect success vs failure
  try {
    log('checking import outcome');
    // Look for "invalid blueprint" / "error" text on the page
    const errorTextLoc = page.getByText(/invalid blueprint|cannot.{0,10}import|format.{0,5}error|invalid.{0,10}json/i).first();
    const hasError = await errorTextLoc.count();

    // Conversely, look for "success" indicators (scenario name, modules visible)
    // After successful import, page typically shows the scenario editor with the modules.
    const scenarioName = await page.title();
    log(`page title: ${scenarioName}`);
    const url = page.url();
    log(`final URL: ${url}`);

    await page.screenshot({ path: SHOT(7, 'final') });

    if (hasError) {
      const errorText = await errorTextLoc.textContent({ timeout: 1000 }).catch(() => 'unknown');
      log(`IMPORT FAILED — error visible: "${errorText}"`);
      console.log(JSON.stringify({ ok: false, blueprint: basename(blueprintPath), error: errorText, url }, null, 2));
      process.exit(1);
    }

    log('IMPORT SUCCESS — no error text detected');

    // Optionally save the scenario. Click the floppy "Save" button in the
    // bottom toolbar; Ctrl+S alone often doesn't fire if focus is wrong.
    let savedScenarioId = null;
    let savedUrl = url;
    if (saveAfterImport) {
      log('saving scenario via floppy Save button');
      // Try aria-label / title-based locator first
      const saveCandidates = [
        page.locator('button[aria-label*="save" i]:not([aria-label*="run" i])').first(),
        page.locator('button[title*="save" i]').first(),
        page.locator('[data-testid*="save"]').first(),
      ];
      let clicked = false;
      for (const loc of saveCandidates) {
        if (await loc.count()) {
          try {
            await loc.click({ timeout: 4000, force: true });
            clicked = true;
            log('Save button clicked');
            break;
          } catch {}
        }
      }
      if (!clicked) {
        log('floppy Save button not found via aria/title — falling back to Ctrl+S');
        await page.keyboard.press('Control+S');
      }
      await page.waitForTimeout(5000);
      savedUrl = page.url();
      const m = savedUrl.match(/\/scenarios\/(\d+)/);
      savedScenarioId = m ? m[1] : null;
      log(`post-save URL ${savedUrl}; id=${savedScenarioId ?? '?'}`);
      try { await page.screenshot({ path: SHOT(8, 'after-save') }); } catch {}
    }

    console.log(JSON.stringify({
      ok: true,
      blueprint: basename(blueprintPath),
      url: savedUrl,
      title: scenarioName,
      savedScenarioId,
    }, null, 2));
    process.exit(0);
  } catch (e) {
    await fail(page, 5, 'detect-outcome', e);
  }
}

main().catch(async (e) => {
  log(`UNCAUGHT: ${e.stack || e.message || e}`);
  process.exit(1);
});
