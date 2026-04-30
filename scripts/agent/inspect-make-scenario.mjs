#!/usr/bin/env node
// scripts/agent/inspect-make-scenario.mjs
//
// Inspects a single Make scenario by ID — opens its editor, exports the
// blueprint via the "..." menu, parses module list, reports whether it
// uses real modules or util:GetVariables placeholders (PR #93 leftover).
//
// Usage:
//   node scripts/agent/inspect-make-scenario.mjs <scenarioId>
//
// Same prerequisites as extract-make-blueprint.mjs (Chrome on 9222 + logged in
// to eu2.make.com).
//
// Exit codes:
//   0 = inspection successful
//   2 = Chrome unreachable
//   4-9 = step-specific failures (screenshot saved)

import { chromium } from "playwright";
import { readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const TMP = tmpdir();
const SHOT = (label) => join(TMP, `inspect-${label}.png`);
const log = (...args) => console.error("[inspect]", ...args);

const scenarioId = process.argv[2];
if (!scenarioId || !/^\d+$/.test(scenarioId)) {
  log("Usage: node scripts/agent/inspect-make-scenario.mjs <scenarioId>");
  process.exit(2);
}

const ORG_ID = "1845515"; // Sebastián's Make org
// Saved scenarios show Options menu (no Export Blueprint) in display mode;
// Export Blueprint lives in the editor's "..." menu instead. So enter edit
// mode by going to view URL first then clicking the Edit button.
const VIEW_URL = `https://eu2.make.com/${ORG_ID}/scenarios/${scenarioId}`;
const SCENARIO_URL = VIEW_URL;

async function main() {
  let browser;
  try {
    browser = await chromium.connectOverCDP("http://localhost:9222");
  } catch (e) {
    log(`Cannot connect to Chrome: ${e.message}`);
    process.exit(2);
  }

  const ctx = browser.contexts()[0];
  let page = ctx.pages().find((p) => p.url().includes("make.com"));
  if (!page) page = await ctx.newPage();

  let downloadedJson = null;
  page.on("download", async (download) => {
    const fname = download.suggestedFilename();
    log(`DOWNLOAD: ${fname}`);
    const dest = join(TMP, fname);
    await download.saveAs(dest);
    try {
      downloadedJson = readFileSync(dest, "utf-8");
    } catch (e) {
      log(`could not read ${dest}: ${e.message}`);
    }
  });

  // Step 1: navigate to scenario editor
  try {
    log(`navigate: ${SCENARIO_URL}`);
    await page.goto(SCENARIO_URL, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(4000);
    try {
      await page.screenshot({ path: SHOT("01-editor"), timeout: 8000 });
    } catch {}
  } catch (e) {
    log(`navigate failed: ${e.message}`);
    process.exit(5);
  }

  // Discard "Recover unsaved changes?" modal if present
  try {
    const discardBtn = page.getByRole("button", { name: /discard/i }).first();
    if (await discardBtn.count()) {
      log("dismissing recover modal");
      await discardBtn.click({ timeout: 3000 });
      await page.waitForTimeout(1000);
    }
  } catch {}

  // Close module-picker overlay (if Make auto-opened it on a non-saved scenario)
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(500);

  // Step 2a: click "Edit" button (top-right) to enter editor mode where
  // the "..." menu with Export Blueprint lives.
  try {
    log("clicking Edit button to enter editor");
    const editBtn = page.locator('button:has-text("Edit"), a:has-text("Edit")').first();
    await editBtn.waitFor({ state: "visible", timeout: 5000 });
    await editBtn.click({ timeout: 4000, force: true });
    await page.waitForTimeout(4000);
  } catch (e) {
    log(`Edit button click non-fatal: ${e.message}`);
  }

  // Discard any "Recover unsaved changes" modal
  try {
    const discardBtn = page.getByRole("button", { name: /discard/i }).first();
    if (await discardBtn.count()) {
      log("dismissing recover modal");
      await discardBtn.click({ timeout: 3000, force: true });
      await page.waitForTimeout(1500);
    }
  } catch {}

  // Step 2b: click top-right "..." menu (right-most small button)
  try {
    log("opening top-right ... menu in editor");
    const target = await page.evaluate(() => {
      const buttons = [...document.querySelectorAll('button, [role="button"]')];
      const vw = window.innerWidth;
      const candidates = buttons
        .map((b) => {
          const r = b.getBoundingClientRect();
          return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height };
        })
        .filter((c) => c.x > vw * 0.8 && c.y < 100 && c.w < 60 && c.h < 60);
      candidates.sort((a, b) => b.x - a.x);
      return candidates[0] ? { x: candidates[0].x, y: candidates[0].y } : null;
    });
    if (target) {
      log(`clicking ... at (${Math.round(target.x)}, ${Math.round(target.y)})`);
      await page.mouse.click(target.x, target.y);
    } else {
      log("... menu not found via DOM eval — fallback coords");
      await page.mouse.click(880, 44);
    }
    await page.waitForTimeout(1500);
    try {
      await page.screenshot({ path: SHOT("02-menu"), timeout: 8000 });
    } catch {}
  } catch (e) {
    log(`menu open failed: ${e.message}`);
    process.exit(6);
  }

  // Step 3: click Export Blueprint (try multiple locator strategies)
  try {
    log("clicking Export Blueprint");
    const exportCandidates = [
      page.getByRole("menuitem", { name: /export.{0,5}blueprint/i }).first(),
      page.locator('[role="menuitem"]:has-text("Export blueprint")').first(),
      page.getByText("Export blueprint", { exact: true }).first(),
      page.getByText(/^Export blueprint$/i).first(),
      page.getByText(/export.{0,5}blueprint/i).first(),
    ];
    let exportClicked = false;
    for (const loc of exportCandidates) {
      if (await loc.count()) {
        try {
          await loc.click({ timeout: 4000, force: true });
          exportClicked = true;
          break;
        } catch {}
      }
    }
    if (!exportClicked) throw new Error("Export Blueprint menu item not found");

    log("waiting for download (max 15s)");
    const start = Date.now();
    while (!downloadedJson && Date.now() - start < 15000) {
      await page.waitForTimeout(500);
    }
  } catch (e) {
    log(`export failed: ${e.message}`);
    process.exit(7);
  }

  if (!downloadedJson) {
    log("FAILURE: blueprint not downloaded");
    process.exit(8);
  }

  // Step 4: parse + analyze modules
  let blueprint;
  try {
    blueprint = JSON.parse(downloadedJson);
  } catch (e) {
    log(`JSON parse failed: ${e.message}`);
    process.exit(9);
  }

  const flow = Array.isArray(blueprint.flow) ? blueprint.flow : [];
  const modules = flow.map((node, i) => ({
    pos: i + 1,
    id: node.id ?? null,
    module: node.module ?? "(missing)",
    hasParameters: !!node.parameters && Object.keys(node.parameters).length > 0,
    hasMapper: !!node.mapper,
  }));

  const placeholderCount = modules.filter((m) => m.module === "util:GetVariables").length;
  const realCount = modules.length - placeholderCount;

  // Output summary
  console.log("");
  console.log(`Scenario inspect: ${blueprint.name || "(unnamed)"} (id ${scenarioId})`);
  console.log(`  Total modules: ${modules.length}`);
  console.log(`  Placeholders (util:GetVariables): ${placeholderCount}`);
  console.log(`  Real modules: ${realCount}`);
  console.log("");
  console.log("Module list:");
  for (const m of modules) {
    const tag = m.module === "util:GetVariables" ? "PLACEHOLDER" : "REAL";
    console.log(`  ${m.pos}. [${tag}] ${m.module} (id ${m.id}, params=${m.hasParameters}, mapper=${m.hasMapper})`);
  }
  console.log("");
  console.log("Verdict:");
  if (placeholderCount === modules.length && modules.length > 0) {
    console.log(`  PLACEHOLDER scenario — all ${modules.length} modules are util:GetVariables.`);
    console.log(`  Recommendation: this is a leftover from PR #93 verification or a fresh import that hasn't been customised yet. SAFE TO DELETE before rebuilding.`);
  } else if (realCount > 0 && placeholderCount === 0) {
    console.log(`  REAL scenario — all ${modules.length} modules are configured.`);
    console.log(`  Recommendation: SKIP — Sebastián already configured this. Don't rebuild.`);
  } else {
    console.log(`  PARTIAL — mix of ${realCount} real + ${placeholderCount} placeholder modules.`);
    console.log(`  Recommendation: Sebastián decides. Either complete configuration manually or rebuild from blueprint.`);
  }

  // Print full blueprint JSON to stdout for downstream use
  console.log("");
  console.log("--- Full blueprint JSON ---");
  process.stdout.write(JSON.stringify(blueprint, null, 2));
  console.log("");

  await browser.close().catch(() => {});
}

main().catch((e) => {
  log(`UNCAUGHT: ${e.stack || e.message || e}`);
  process.exit(1);
});
