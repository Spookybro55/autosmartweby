#!/usr/bin/env node
// scripts/agent/inventory-make-scenarios.mjs
//
// Connects to Sebastián's Chrome session via CDP (port 9222), navigates to
// the Make scenarios list, and extracts all visible scenario names with
// their status indicators. Cross-references against the 5 planned agent-team
// scenarios + flags test artifacts left over from PR #93 verification runs.
//
// Read-only — does NOT delete or create scenarios. STOPS after printing
// inventory and proposed plan; waits for human confirmation in next turn.
//
// Usage:
//   node scripts/agent/inventory-make-scenarios.mjs

import { chromium } from "playwright";
import { join } from "path";
import { tmpdir } from "os";

const TMP = tmpdir();
const SHOT = (label) => join(TMP, `inventory-${label}.png`);

const log = (...args) => console.error("[inventory]", ...args);

const PLANNED_SCENARIOS = [
  "Agent Team — Daily Triage",
  "Agent Team — PR Review Reminder",
  "Agent Team — Learning Loop",
  "Agent Team — Backpressure Check",
  "Agent Team — Weekly Digest",
];

async function main() {
  let browser;
  try {
    browser = await chromium.connectOverCDP("http://localhost:9222");
  } catch (e) {
    log(`Cannot connect to Chrome: ${e.message}`);
    process.exit(2);
  }

  const ctx = browser.contexts()[0];
  const pages = ctx.pages();

  // Find the existing Make Scenarios tab if open; else navigate one.
  let page = pages.find((p) => /\/scenarios(\?|$)/.test(p.url()) && p.url().includes("make.com"));
  if (!page) {
    page = pages.find((p) => p.url().includes("make.com")) ?? (await ctx.newPage());
  }

  // Always re-navigate to ensure list is fresh (and contained the same query
  // params). We saw eu2.make.com with org-prefixed scenarios path.
  const target = "https://eu2.make.com/1845515/scenarios?type=scenario&folder=all&tab=all&sort=nameAsc";
  log(`navigate: ${target}`);
  try {
    await page.goto(target, { waitUntil: "networkidle", timeout: 30000 });
  } catch (e) {
    log(`navigate non-fatal: ${e.message}`);
  }
  await page.waitForTimeout(3500);
  // Screenshot is best-effort — Make's font loader sometimes hangs.
  try {
    await page.screenshot({ path: SHOT("01-list"), timeout: 10000 });
  } catch (e) {
    log(`screenshot skipped: ${e.message}`);
  }

  // Heuristic extraction: scenarios in Make UI are rendered as table-rows or
  // card grids. We look for any clickable scenario-link element. Try both
  // common shapes:
  const items = await page.evaluate(() => {
    const found = new Map(); // name -> { name, status, lastRun, ariaSnippet }

    // Try anchors that link to a specific scenario URL: /<orgId>/scenarios/<scenId>
    const anchors = Array.from(document.querySelectorAll('a[href*="/scenarios/"]'));
    for (const a of anchors) {
      const href = a.getAttribute("href") ?? "";
      // Skip the list link itself ("/<id>/scenarios?...") — we want links to
      // *individual* scenarios, which look like "/<id>/scenarios/<n>"
      if (!/\/scenarios\/\d/.test(href)) continue;
      // Climb to row container to find sibling status / last-run cells.
      let row = a;
      for (let i = 0; i < 6; i++) {
        if (!row.parentElement) break;
        row = row.parentElement;
        if (row.matches("tr") || row.getAttribute("role") === "row") break;
      }
      // Scenario name = first non-numeric text node inside anchor with
      // length > 4 chars. Make UI lays out [icon][name][counters][owner]
      // [date][folder] as flex siblings. textContent concatenates them
      // without separators, so we walk individual TEXT_NODEs and filter.
      let name = "";
      const walker = document.createTreeWalker(a, NodeFilter.SHOW_TEXT);
      const texts = [];
      while (walker.nextNode()) {
        const t = (walker.currentNode.textContent ?? "").trim();
        if (t) texts.push(t);
      }
      // Try heading-like text: longest text > 4 chars that doesn't start
      // with a digit (counters/dates) and isn't a short label like "Grid".
      const candidates = texts.filter(
        (t) => t.length > 4 && !/^\d/.test(t) && !/^(Grid|ADMIN|active|inactive|draft)$/i.test(t)
      );
      // Often the name is the first such candidate; sometimes the owner
      // comes earlier in DOM order. Heuristic: prefer first candidate
      // whose length is between 5 and 80.
      name = candidates.find((t) => t.length >= 5 && t.length <= 80) || candidates[0] || "";
      // Strip trailing icon-like artefacts (file-size descriptors with KB/MB)
      name = name.replace(/\s+\d+(?:[\.,]\d+)?\s*[KMG]?B.*$/i, "").trim();
      if (!name || name.length > 200) continue;

      // Status: look for "Active" / "Inactive" or toggle aria-checked
      let status = "unknown";
      const toggle = row.querySelector('[role="switch"], input[type="checkbox"]');
      if (toggle) {
        const checked =
          toggle.getAttribute("aria-checked") === "true" ||
          toggle.checked === true;
        status = checked ? "active" : "inactive";
      } else {
        const txt = (row.textContent ?? "").toLowerCase();
        if (/\bactive\b/.test(txt)) status = "active";
        else if (/\binactive\b|\bdraft\b/.test(txt)) status = "inactive";
      }

      // Last run: look for "ago", "min", "hour", "day", "month" near row.
      let lastRun = "—";
      const tds = row.querySelectorAll("td, [role='cell']");
      for (const td of Array.from(tds)) {
        const t = (td.textContent ?? "").trim();
        if (!t) continue;
        if (/\b(ago|min|hour|day|week|month|year)\b/i.test(t) && t.length < 60) {
          lastRun = t;
          break;
        }
      }

      const url = href.startsWith("http") ? href : new URL(href, location.href).href;
      const id = url.match(/\/scenarios\/(\d+)/)?.[1] ?? null;

      if (!found.has(name)) {
        found.set(name, { name, status, lastRun, url, id });
      }
    }

    return Array.from(found.values());
  });

  log(`found ${items.length} scenario rows`);

  // Sort by name
  items.sort((a, b) => a.name.localeCompare(b.name));

  // Print inventory
  console.log("");
  console.log("Existing scenarios in Make (sorted by name):");
  if (items.length === 0) {
    console.log("  (none — empty scenario list or DOM extraction missed)");
  } else {
    items.forEach((it, i) => {
      console.log(`  ${i + 1}. ${it.name} — ${it.status} — last run ${it.lastRun}${it.id ? ` — id ${it.id}` : ""}`);
    });
  }

  // Match against planned
  console.log("");
  console.log("Plan match:");
  const planMatches = {};
  for (const planName of PLANNED_SCENARIOS) {
    const exists = items.find((it) => it.name === planName);
    planMatches[planName] = exists;
    const tag = planName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^agent-team-/, "");
    console.log(`  ${tag}: ${exists ? `EXISTS (id ${exists.id ?? "?"}, ${exists.status})` : "MISSING"}`);
  }

  // Test artifacts: scenarios named "Agent Team — *" but NOT planned, OR
  // duplicates (>1 with same name), OR clearly placeholder names.
  const testArtifacts = items.filter((it) => {
    if (!it.name.startsWith("Agent Team")) return false;
    // If exactly matching a planned name, NOT a test artifact unless
    // there are duplicates.
    return !PLANNED_SCENARIOS.includes(it.name);
  });

  // Plus duplicates of planned names beyond first occurrence
  const seenPlanned = new Set();
  const duplicates = [];
  for (const it of items) {
    if (PLANNED_SCENARIOS.includes(it.name)) {
      if (seenPlanned.has(it.name)) duplicates.push(it);
      else seenPlanned.add(it.name);
    }
  }

  console.log("");
  if (testArtifacts.length || duplicates.length) {
    console.log(
      `Found ${testArtifacts.length + duplicates.length} test artifact(s) that should be deleted before building real scenarios:`
    );
    for (const it of testArtifacts) {
      console.log(`  • ${it.name} (id ${it.id ?? "?"}) — non-planned name`);
    }
    for (const it of duplicates) {
      console.log(`  • ${it.name} (id ${it.id ?? "?"}) — duplicate of planned`);
    }
  } else {
    console.log("Found 0 test artifacts.");
  }

  // Plan summary
  const missing = PLANNED_SCENARIOS.filter((n) => !planMatches[n]);
  const existingValid = PLANNED_SCENARIOS.filter((n) => planMatches[n]);

  console.log("");
  console.log("Proposed plan:");
  if (testArtifacts.length || duplicates.length) {
    console.log(`  1. Delete ${testArtifacts.length + duplicates.length} test artifact(s).`);
  }
  if (existingValid.length === PLANNED_SCENARIOS.length && testArtifacts.length === 0) {
    console.log("  Already complete — all 5 scenarios exist with no test artifacts.");
  } else if (missing.length === PLANNED_SCENARIOS.length) {
    console.log(`  Build all 5 scenarios from scratch.`);
  } else {
    if (existingValid.length) {
      console.log(`  Skip ${existingValid.length} already-existing scenario(s):`);
      for (const n of existingValid) console.log(`    - ${n}`);
    }
    if (missing.length) {
      console.log(`  Build ${missing.length} missing scenario(s):`);
      for (const n of missing) console.log(`    - ${n}`);
    }
  }

  console.log("");
  console.log("Sebastián, schvaluješ plán? Reply 'go' to proceed, 'stop' to abort, or specify changes.");
  console.log("");
  console.log(`(Screenshot saved: ${SHOT("01-list")})`);

  await browser.close().catch(() => {});
}

main().catch((e) => {
  log(`UNCAUGHT: ${e.stack || e.message || e}`);
  process.exit(1);
});
