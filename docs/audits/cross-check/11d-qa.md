# Fáze 11d — Cross-check: QA tester / acceptance tester

> **Perspektiva:** QA tester nebo product acceptance tester. Otázka: "Lze tohle vůbec acceptance-testnout? Co bude testem _verified_?"
> **Cíl:** Identifikovat testability gaps, missing acceptance criteria, end-to-end coverage holes.

## Audit context

Same as 11a (fresh clone `61129bc` @ 2026-04-25T14:54:01+02:00).

---

## Persona summary

QA tester potřebuje: (a) reproducibilní test data; (b) jasné acceptance criteria per task; (c) end-to-end test path; (d) negative scenarios; (e) regression matrix.

---

## QA Go/No-Go verdict

⚠️ **PARTIAL GO** pro lokální / unit testing — full E2E acceptance je ⛔ **NO-GO**.

**Co lze testovat:**
- ✅ Unit/integration tests for B-stream (`test:b03..b06`) + A-stream (manual `node` invocation) — všechny PASS (Phase 9 verified)
- ✅ B-06 review writeback TEST runtime verified (per task record)
- ✅ Mock mode pro frontend dev/integration tests

**Co nelze testovat (E2E):**
- ❌ Scraper → `_raw_import` → LEADS → web check → qualify → preview brief → webhook → render → review → outreach → email send → reply detection (FF-001/2 missing link, no integration test)
- ❌ Operator review workflow (no acceptance criteria for "review queue done")
- ❌ Send pipeline post-approval (no `send_allowed` enforcement test, FF-006)
- ❌ Reply/bounce/unsubscribe handling (manual MailboxSync, no triggered test, FF-008)
- ❌ Follow-up engine (SPEC-only, FF-013)
- ❌ Lifecycle state consistency (no canonical state, FF-015)

---

## Top blockers (ranked for QA)

| Rank | Blocker | Existing finding | Severity |
|------|---------|------------------|----------|
| 1 | E2E flow not wired (scraper → _raw_import gap) → no full pipeline test possible | FF-001, FF-002 | P0 |
| 2 | No CI runs tests (BLD-015 + DP-005) → drift mezi tests a code is invisible | DP-005, BLD-015 | P1 |
| 3 | C-04..C-11 SPEC-only (sendability, queue, providers, inbound, follow-up, exception, perf, config) → 8 SPEC contracts bez runtime acceptance criteria | FF-009..FF-014 | P1 |
| 4 | Lifecycle state SPEC-only → 4 separate state machines, no canonical state → test consistency hard | FF-015 | P1 |
| 5 | No `npm test` aggregator → QA spustí 4-12 commands manual | BLD-014 | P2 |
| 6 | A-stream tests não in package.json scripts → discoverability | BLD-013 | P2 |
| 7 | Žádný "test environment" runbook (TEST sheet, TEST clasp, TEST Vercel) | DOC-021 | P1 |
| 8 | Žádné acceptance criteria per task v task records (`docs/30-task-records/`) | — | new CC-QA |
| 9 | TEST runtime nelze ověřit pro některé tasks ("LOCAL VERIFIED only") | per FF flow map | P1 |
| 10 | No load test → unknown scale ceiling | — | new CC-QA |

---

## Testability map per stage

```
┌──────────────────────────────────────────────────────────────────────┐
│  TESTABILITY PER FUNNEL STAGE — current state                       │
└──────────────────────────────────────────────────────────────────────┘

  Stage 1: Scrape (firmy-cz.mjs)
    ✅ test-wave4-pipeline.mjs (LOCAL VERIFIED)
    ✅ Fixture mode + sample output JSON
    ⚠️ Live mode (real firmy.cz) NOT in CI/automation
    ❌ No integration test "scraper → sheet" (FF-001 gap)

  Stage 2: _raw_import → LEADS (processRawImportBatch_)
    🔵 test-ingest-runtime.mjs LOCAL VERIFIED
    🟢 TEST RUNTIME VERIFIED (per docs/24:72)
    ❌ No menu/trigger → "is this auto-running?" cannot acceptance-test (FF-002)

  Stage 3: Auto web check (autoWebCheckTrigger)
    🟢 TEST RUNTIME VERIFIED (A-06 task record 2026-04-17)
    ✅ test-a06-webcheck-hook.mjs (31/0 pass)
    ❌ Live Serper API quota / rate behavior NOT acceptance-tested

  Stage 4: Auto qualify (autoQualifyTrigger)
    🟢 TEST RUNTIME VERIFIED (A-07 task record)
    ✅ test-a07-qualify-hook.mjs (23/0 pass)
    ⚠️ Edge cases for new categories not regression-tested

  Stage 5: processPreviewQueue
    🔵 test-a08-preview-queue.mjs LOCAL VERIFIED (38/0)
    ⚠️ TEST RUNTIME not verified
    ❌ Concurrency race (FF-003) NOT acceptance-tested
    ❌ CHANGES_REQUESTED loop (FF-005) NOT in test matrix

  Stage 6: Preview render webhook
    🔵 test-b04 + test-b05 LOCAL VERIFIED (51 tests)
    ⚠️ Vercel cold-start broken preview_url (FF-004) NOT acceptance-tested
    ❌ In-memory preview-store loss on restart (IN-014) NOT in test matrix

  Stage 7: Operator review (handleReviewDecisionEdit_)
    🟢 TEST RUNTIME VERIFIED (B-06, 3/3 scenarios)
    🔵 test-b06-review-writeback.mjs LOCAL VERIFIED (105/0)
    ⚠️ Concurrent edits race (FF-019) NOT acceptance-tested

  Stage 8: Frontend lead update (PATCH)
    ⚪ NOT VERIFIED in PROD
    ❌ Identity verification edge cases (IN-007 conditional) NOT tested
    ❌ Double-submit (IN-004 useLeadUpdate hook is unused) NOT tested

  Stage 9: Outbound (createCrmDraft / sendCrmEmail)
    ⚪ NOT VERIFIED in PROD
    ❌ No send_allowed enforcement test (FF-006)
    ❌ Double-send guard is prompt-only (FF-007) — UI test only manual

  Stage 10: Mailbox sync
    ⚪ NOT VERIFIED — manual menu only (FF-008)
    ❌ Reply/bounce/OOO classification NOT acceptance-tested in production-like env

  Stages 11+: SPEC-only (C-04..C-11)
    ❌ NOT IMPLEMENTED → NOT TESTABLE
```

---

## Missing acceptance criteria

Per task record review (`docs/30-task-records/*.md`), few tasks include explicit "Definition of Done" checklist beyond compile/build. Specifically:

| Task | DoD criteria explicit? | TEST/LOCAL verified? | Acceptance scenario list? |
|------|------------------------|----------------------|---------------------------|
| A-06 (web check) | ⚠️ partial | 🟢 TEST | ⚠️ test scenarios listed in task |
| A-07 (qualify) | ⚠️ partial | 🟢 TEST | ⚠️ |
| A-08 (preview queue) | ⚠️ partial | 🔵 LOCAL only | ⚠️ |
| A-09 (ingest report) | ⚠️ partial | 🔵 LOCAL only | ⚠️ |
| B-04 (preview render) | ✅ acceptance section | 🔵 LOCAL only | ⚠️ partial |
| B-05 (preview webhook) | ✅ | 🔵 LOCAL only | ⚠️ partial |
| B-06 (review writeback) | ✅ | 🟢 TEST (3/3 scenarios) | ✅ scenarios documented |
| B-07 (pilot support) | ⚠️ | ⚪ unknown | ⚠️ |
| B-08 (preview pilot prep) | ⚠️ | ⚪ unknown | ⚠️ |
| C-04..C-11 | n/a (SPEC-only) | n/a | ⚠️ contracts but no test plan |
| CS1, CS2, CS3 | n/a (SPEC-only) | n/a | n/a |

**General gap:** acceptance criteria are inconsistently documented per task. No template "Acceptance criteria" section in `docs/30-task-records/_template.md` (verified: template does not include acceptance section).

→ **CC-QA-001**

---

## End-to-end test gaps

| Gap | Impact | New CC-QA |
|-----|--------|-----------|
| Scraper → `_raw_import` ingest path nelze E2E test (žádný link, FF-001) | E2E test impossible | CC-QA-002 |
| Outbound (send → reply → follow-up) cesta SPEC-only (FF-008/12/13) | Cannot acceptance-test outreach loop | CC-QA-003 |
| Vercel cold-start preview store loss (IN-014, FF-004) | No regression test for "URL becomes 404 after deploy" | CC-QA-004 |
| `processPreviewQueue` concurrency (FF-003, FF-019) | No race condition test (manual-only repro) | CC-QA-005 |
| Identity verification conditional (IN-007) | No negative test "missing businessName" | CC-QA-006 |
| Lifecycle state cross-checks (FF-015) | 4 state machines, no consistency check | CC-QA-007 |
| Vercel → Apps Script latency / timeout (IN-009) | No timeout test | CC-QA-008 |

---

## Negative test gaps

| Negative scenario | Tested? | Impact |
|-------------------|---------|--------|
| Login: invalid email allowlist | ⚠️ partial (timing leak SEC-006 not tested) | identity gap |
| Login: rate limit attack | ❌ no rate limit (SEC-007) → no rate-limit test | brute-force unmitigated |
| Login: empty NEXTAUTH_SECRET → silent auth bypass (SEC-016) | ❌ NOT tested | full bypass risk |
| Apps Script doPost: missing token | ✅ "Unauthorized" (verified in B-04 test) | OK |
| Apps Script doPost: malformed JSON | ✅ "err.message" returned (IN-010 leak) | partial |
| Apps Script doPost: token leak rotation | ❌ NOT tested | rotation impact unknown |
| Frontend: PATCH with disallowed field | ✅ tested in route validation (Phase 5) | OK |
| Frontend: PATCH bezel session | ✅ middleware redirect | OK |
| Frontend: session forgery (CC-SEC-003) | ❌ NOT tested | post-revoke ex-employee retains |
| Sheet write: mid-batch fail recovery | ⚠️ per-row try/catch but no atomic write (FF) | partial |
| Webhook receiver: invalid X-Preview-Webhook-Secret | ✅ tested | OK |
| Webhook receiver: malformed JSON | ✅ tested (B-04 test) | OK |
| Vercel restart → preview-store empty | ❌ NOT in test matrix (FF-004) | broken `preview_url` |
| Apps Script crash mid-batch | ⚠️ per-row try/catch, but no global recovery test | partial |

---

## Existing findings that matter most for QA

### P0 / P1 (test infrastructure blockers)
- **FF-001** / **FF-002** — Scraper → `_raw_import` link missing → no E2E
- **FF-009..FF-015** — C-04..C-11 + CS1 SPEC-only → no test runtime
- **DP-005** / **BLD-015** — no CI tests
- **BLD-013** / **BLD-014** — A-stream tests not scripted, no aggregator

### P1 (test coverage blockers)
- **FF-003** — race in processPreviewQueue (no concurrency test)
- **FF-004** — preview store loss (no restart test)
- **FF-008** — MailboxSync no trigger (no auto inbound test)
- **IN-009** — no timeout/retry test
- **SEC-005..SEC-007** — login security gaps (no penetration test)

### P2 (test quality)
- **IN-007** — identity check conditional (no negative test)
- **FF-005** — CHANGES_REQUESTED loop (no manifest test)
- **FF-019** — operator review vs cron race
- **DOC-021** — no DEPLOY.md → no test environment runbook

---

## New CC-QA findings

| ID | Severity | Stručně | Cross-ref |
|----|----------|---------|-----------|
| CC-QA-001 | P1 | **`docs/30-task-records/_template.md` neobsahuje "Acceptance criteria" section.** Per Phase 11 review, jen 3 task records (B-04, B-05, B-06) mají explicit acceptance criteria. Většina tasks má "Code Changes" + "Docs Updated" ale neformální acceptance. QA tester nemá per-task verifikační seznam. | DOC-022, BLD-014 |
| CC-QA-002 | P0 | **End-to-end pipeline NOT testable.** FF-001 + FF-002 zlomí scraper → _raw_import → LEADS link. QA nemůže spustit "full ingest acceptance test" — nelze. Single-test fail "kompletní funnel funguje" je **strukturální blocker**, ne edge case. Cross-domain s Phase 8 funnel flow. | FF-001, FF-002 |
| CC-QA-003 | P1 | **Outreach loop (send → reply → follow-up) je SPEC-only — žádný acceptance scenario možný.** C-07 inbound, C-08 follow-up SPEC bez runtime → QA nemůže ověřit "lead reagoval, systém auto-tagged jako RESPONDED". Manual MailboxSync (FF-008) nelze acceptance-test bez waiting for real email. Bottom-half of funnel = **untestable z QA perspective**. | FF-008, FF-012, FF-013 |
| CC-QA-004 | P1 | **No "Vercel restart preview integrity" regression test.** IN-014 / FF-004 (preview store loss) je known issue ale není v test matrix. Po každém Vercel deploy = N old `preview_url` v LEADS jsou broken. QA nemá způsob jak measure "kolik leadů bylo broken touto deploy" před/po. | IN-014, FF-004 |
| CC-QA-005 | P1 | **No concurrency / race test pro `processPreviewQueue`.** FF-003 + FF-019 — operator edit vs 15-min cron. Reproducer: manuálně nastavit `processPreviewQueue` na ~5 min interval, edit reviewa, observer overwrite. Manual-only test, žádný unit. | FF-003, FF-019 |
| CC-QA-006 | P2 | **No negative test pro identity verification conditional (IN-007).** Apps Script `WebAppEndpoint.gs:81-94` přeskočí identity check pokud `payload.businessName/city` chybí. Žádný test "PATCH bez businessName by měl FAIL pro security" — frontend writer vždy posílá, takže happy-path-tested only. | IN-007 |
| CC-QA-007 | P1 | **Lifecycle state consistency cross-check missing.** FF-015 — 4 separate state machines (`lead_stage`, `preview_stage`, `outreach_stage`, `email_sync_status`). QA nemá test "jsou stavy konzistentní?" (např. `outreach_stage=WON` ale `preview_stage=REJECTED` = invalid state). Žádné invariants documented or asserted. | FF-015 |
| CC-QA-008 | P2 | **No load test / scale ceiling baseline.** Apps Script má quotas (UrlFetchApp 20k/day, BATCH_SIZE 100, execution 6 min), Sheets má ~50k rows performance threshold (per `docs/27`). QA nezná: kolik leads/day systém zvládne, p50/p95 latency, kdy se začne degradovat. Žádný load testing tooling v repu. | FF-014 |
| CC-QA-009 | P2 | **No "test data fixtures" pro full happy path.** Existuje sample brief `crm-frontend/src/lib/mock/preview-brief.*.json` (5 fixtures pro renderer testing) + scraper fixtures. Ale žádný unified "happy lead" test fixture který projde celou pipeline (raw → leads → qualified → preview → ready_for_review → approved → drafted → sent → replied → won). QA musí ručně sestavit. | — |
| CC-QA-010 | P2 | **No regression matrix v audit docs.** Existuje `docs/audits/MANUAL_CHECKS.md` (61+ items) ale není to regression matrix per release. QA potřebuje "before-each-release smoke test" subset (např. 10 critical items). | DOC-022 |
| CC-QA-011 | P3 | **Test scripts používají console.log místo strukturovaného outputu.** Per Phase 9 evidence, tests output je human-readable text ("✓ ... PASS"). Pro CI integration / failure parsing by JSON output (`node:test --reporter=spec`) byl preferable. | BLD-013 |
| CC-QA-012 | P3 | **Žádný `.mocharc` / test config v repu.** Test scripts jsou self-contained `.mjs` files. Žádné common setup/teardown, žádný shared assertion helper. Drift mezi tests v stylu, custom assertions per file. | — |

---

## Manual checks added

| # | Otázka | Kde ověřit | Acceptance |
|---|--------|------------|------------|
| MC-CC-QA-01 | Existují kompletní E2E test scripts (manual playbook) mimo repo? | Tým QA interview | Pokud ne, eskalovat CC-QA-002. |
| MC-CC-QA-02 | Real lead acceptance walkthrough — operator processes 1 lead end-to-end with timing per step. | TEST environment + 1 operator | Baseline pro funnel acceptance time + identifikace stuck stages. |
| MC-CC-QA-03 | Load test: how many leads/day systém zvládne před degradací (Sheets, AS quota, Vercel)? | Synthetic load test | Define max throughput; document v `docs/28-risks-bottlenecks-scaling.md`. |
| MC-CC-QA-04 | Vercel deploy → preview_url integrity check: kolik existing leads má broken preview po deploy? | Pre + post deploy slug check | Acceptance: 0% loss; reality (per FF-004) = significant. |
| MC-CC-QA-05 | Operator workflow timing: review → approve → send acceptance time per lead. | Real operator session, stopwatch | Baseline pro UX acceptance + identifikace bottlenecks (e.g. SECTION D from 11a). |
| MC-CC-QA-06 | Cross-state lifecycle invariants — auditovat sample 100 LEADS rows pro inconsistencies (e.g. WON+REJECTED). | Sheets manual review | Pokud > 1% inconsistent, FF-015 manifest confirmed. |

---

_(Plný seznam findings v [../FINDINGS.md](../FINDINGS.md))_
