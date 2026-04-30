#!/usr/bin/env node
// scripts/agent/delete-make-scenario.mjs
//
// Deletes a single Make scenario by ID via the UI: navigates to scenarios
// list, finds the row, opens row's actions menu, clicks Delete, confirms.
//
// Usage:
//   node scripts/agent/delete-make-scenario.mjs <scenarioId>

import { chromium } from "playwright";
import { join } from "path";
import { tmpdir } from "os";

const TMP = tmpdir();
const SHOT = (label) => join(TMP, `delete-${label}.png`);
const log = (...a) => console.error("[delete]", ...a);

const id = process.argv[2];
if (!id || !/^\d+$/.test(id)) {
  log("Usage: node delete-make-scenario.mjs <scenarioId>");
  process.exit(2);
}

const ORG = "1845515";
const LIST_URL = `https://eu2.make.com/${ORG}/scenarios?type=scenario&folder=all&tab=all&sort=nameAsc`;

async function main() {
  const browser = await chromium.connectOverCDP("http://localhost:9222");
  const ctx = browser.contexts()[0];
  let page = ctx.pages().find((p) => p.url().includes("make.com"));
  if (!page) page = await ctx.newPage();

  // Strategy: navigate to scenario VIEW page (not /edit) — view shows the
  // top-right Options dropdown that contains Delete. Edit mode replaces
  // the toolbar.
  const viewUrl = `https://eu2.make.com/${ORG}/scenarios/${id}`;
  log(`navigate to ${viewUrl}`);
  try {
    await page.goto(viewUrl, { waitUntil: "networkidle", timeout: 30000 });
  } catch (e) {
    log(`navigate non-fatal: ${e.message}`);
  }
  await page.waitForTimeout(5000);
  try { await page.screenshot({ path: SHOT("00-view"), timeout: 8000 }); } catch {}

  // Discard "Recover unsaved changes" if it appears
  try {
    const discardBtn = page.getByRole("button", { name: /discard/i }).first();
    if (await discardBtn.count()) {
      log("dismissing recover modal");
      await discardBtn.click({ timeout: 3000 });
      await page.waitForTimeout(1000);
    }
  } catch {}

  // Close any module picker overlay
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(500);

  // Click "Options" button (top-right). Try several locator strategies.
  log("clicking Options button");
  const candidates = [
    page.locator('button:has-text("Options")').first(),
    page.locator('[aria-label*="options" i]').first(),
    page.locator('button').filter({ hasText: /^Options$/i }).first(),
    page.getByText("Options", { exact: false }).first(),
  ];
  let clicked = false;
  for (const loc of candidates) {
    if (await loc.count()) {
      try {
        log(`trying Options candidate (visible? ${await loc.isVisible().catch(() => "?")})`);
        await loc.click({ timeout: 4000, force: true });
        clicked = true;
        break;
      } catch (e) {
        log(`candidate failed: ${e.message?.slice(0, 80)}`);
      }
    }
  }
  if (!clicked) {
    log("Options button could not be clicked");
    process.exit(6);
  }
  await page.waitForTimeout(1500);
  try { await page.screenshot({ path: SHOT("01-options-menu"), timeout: 8000 }); } catch {}

  // Click "Delete" menu item — may be div/li with text + icon, not button
  await page.waitForTimeout(800); // let dropdown finish opening
  log("clicking Delete menu item");
  const deleteCandidates = [
    page.getByRole("menuitem", { name: /delete/i }).first(),
    page.locator('[role="menuitem"]:has-text("Delete")').first(),
    page.locator('li:has-text("Delete"), div:has-text("Delete")').filter({ hasText: /^Delete\s*$/i }).first(),
    page.getByText("Delete", { exact: true }).first(),
    page.getByText(/^Delete$/).first(),
  ];
  let deleteClicked = false;
  for (const loc of deleteCandidates) {
    if (await loc.count()) {
      try {
        log(`trying Delete candidate (visible? ${await loc.isVisible().catch(() => "?")})`);
        await loc.click({ timeout: 4000, force: true });
        deleteClicked = true;
        break;
      } catch (e) {
        log(`delete candidate failed: ${e.message?.slice(0, 80)}`);
      }
    }
  }
  if (!deleteClicked) {
    log("Delete menu item could not be clicked");
    try { await page.screenshot({ path: SHOT("01b-delete-not-found"), timeout: 8000 }); } catch {}
    process.exit(7);
  }
  await page.waitForTimeout(1500);
  try { await page.screenshot({ path: SHOT("02-confirm-dialog"), timeout: 8000 }); } catch {}

  // Confirm dialog — click confirm/delete button (Make confirmation usually
  // requires typing scenario name OR has a Delete button right there)
  log("confirming delete");
  const confirmBtn = page.getByRole("button", { name: /^(delete|confirm|yes|smazat|potvrdit)$/i }).first();
  await confirmBtn.waitFor({ state: "visible", timeout: 5000 });
  await confirmBtn.click({ timeout: 5000, force: true });
  await page.waitForTimeout(3000);
  try { await page.screenshot({ path: SHOT("03-after-delete"), timeout: 8000 }); } catch {}

  log(`scenario id ${id} delete request sent`);
  console.log(JSON.stringify({ ok: true, deletedId: id, url: page.url() }, null, 2));
  await browser.close().catch(() => {});
}

main().catch((e) => {
  log(`UNCAUGHT: ${e.stack || e.message || e}`);
  process.exit(1);
});
