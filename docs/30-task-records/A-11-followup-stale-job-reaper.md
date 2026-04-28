# Task Record: A-11-followup-stale-job-reaper

## Metadata

| Pole | Hodnota |
|------|---------|
| **Task ID** | A-11-followup-stale-job-reaper |
| **Title** | Stale scrape job reaper — flip stuck pending/dispatched jobs to failed |
| **Owner** | Stream A |
| **Status** | code-complete |
| **Date** | 2026-04-28 |
| **Stream** | A |

## Scope

A-11 (PR #76) shipped the scraping pipeline; first successful production run on
2026-04-27 19:06 imported 14 leads from Turnov correctly. However, a second job
`ASW-SCRAPE-mohz79iu-08zq` registered at 2026-04-28T01:57:16Z (UTC) by
`recordScrapeJob_` was never dispatched and never received a callback. Status
stayed `pending` forever, polluting `findRecentMatchingJob_` matches and the
history UI. Same pattern observed earlier with the initial-deploy "Malformed URL"
failure — when the failure callback itself fails, the row becomes terminal junk
with no cleanup mechanism.

This task adds the missing reaper: a time-driven function that finds rows with
status ∈ {pending, dispatched} older than `STALE_JOB_TIMEOUT_MIN` (30 min) and
flips them to `failed` with `error_message='timeout_no_callback'` and a
`completed_at` timestamp. Idempotent (terminal states are never touched).
Lock-protected against concurrent ingest callbacks. Defensive — rows with
malformed `requested_at` are skipped with a WARN log instead of crashing the
batch.

Operator gets two paths to invocation:
1. **Hourly trigger** registered in `installProjectTriggers` for hands-off cleanup.
2. **Menu item** "Reap stuck scrape jobs" → `manualReapStuckJob` for immediate
   cleanup when the operator sees a stuck job and doesn't want to wait up to an hour.

The known stuck production job will be reaped by either path after deploy — that
is the live integration test for the new code.

## Code Changes

| Soubor | Typ zmeny | Popis |
|--------|-----------|-------|
| apps-script/Config.gs | modified | +13 lines. New `STALE_JOB_TIMEOUT_MIN = 30` constant under A-11 section with rationale comment (normal end-to-end scrape runs well under 10 min, so 30 min is a generous cutoff that won't false-positive any legitimate slow run). |
| apps-script/ScrapeHistoryStore.gs | modified | +135 lines. New `reapStaleScrapeJobs_` (lock-protected, defensive row handling, routes status changes through existing `updateScrapeJobStatus_` so headers/columns stay consistent) returning `{reaped, ids, skipped}`. New `manualReapStuckJob` Menu companion showing a Czech UI alert with the result. Both functions are siblings of existing `setupScrapeHistory` at the bottom of the file. |
| apps-script/PreviewPipeline.gs | modified | +12 lines. `installProjectTriggers` now tracks `hasStaleJobReaper` flag in the existing scan loop and creates an hourly `reapStaleScrapeJobs_` trigger if not already present. Idempotent — re-running install does not create duplicate triggers. |
| apps-script/Menu.gs | modified | +1 line. "Reap stuck scrape jobs" entry under the existing CRM menu, next to "Setup scrape history". |
| scripts/test-stale-job-reaper.mjs | new | 280 lines. Port-and-prove test mirroring the pattern of test-a09-ingest-report.mjs. 4 scenarios: (1) 5-row mixed-state matrix proving stale pending + stale dispatched both flip, fresh stays, completed/failed are byte-identical untouched; (2) idempotent second run = no-op; (3) malformed/empty `requested_at` is skipped with WARN, well-formed neighbour still reaped; (4) empty sheet returns `{reaped:0, ids:[], skipped:0}`. 32 assertions total, all passing. |

## Docs Updated

| Dokument | Typ zmeny | Proc |
|----------|-----------|------|
| docs/30-task-records/A-11-followup-stale-job-reaper.md | new | Tento task record. |
| docs/11-change-log.md | regenerated | Auto z task records. |
| docs/29-task-registry.md | regenerated | Auto z task records. |

## Contracts Changed

- **Apps Script — public functions:** 2 additive (`reapStaleScrapeJobs_` internal helper exposed for trigger handler; `manualReapStuckJob` Menu handler). No existing function signatures or behaviour changed.
- **Sheets:** no schema change. `_scrape_history` row format identical; only the `status`, `error_message`, `completed_at` columns may now be written by an additional code path (the reaper) on rows previously frozen at status='pending' or 'dispatched'.
- **Triggers:** one additive hourly trigger (`reapStaleScrapeJobs_`). Existing trigger registrations untouched. The `installProjectTriggers` dedup logic was extended with one more `hasStaleJobReaper` flag check, in the same style as the other 5 scan flags.
- **Menu:** one additive item under CRM menu.

## Tests

| Test | Vysledek |
|------|----------|
| `node scripts/test-stale-job-reaper.mjs` | OK — 32/32 assertions pass across 4 scenarios |
| `node scripts/test-a09-ingest-report.mjs` (regression smoke) | OK — 136/136 (existing test, unaffected) |
| `node --check` syntax of edited .gs files | OK — Config.gs, ScrapeHistoryStore.gs, PreviewPipeline.gs, Menu.gs all parse |
| TEST clasp deploy + manual reaper run | pending operator action (see "How to verify after merge" in PR description) |
| Production stuck job (`ASW-SCRAPE-mohz79iu-08zq`) reaped after deploy | pending operator action — designed as the live integration test |

## Output for Audit

After this PR ships and the operator runs `installProjectTriggers` on the PROD
clasp environment:
- `_scrape_history` row for `ASW-SCRAPE-mohz79iu-08zq` will flip to
  `status=failed`, `error_message=timeout_no_callback`, `completed_at=<now>` —
  either within 1h via the trigger, or immediately if operator clicks the menu item.
- `_asw_logs` will record an INFO entry "Reaped 1 stale jobs [ASW-SCRAPE-mohz79iu-08zq]".
- Future stuck jobs (any pending/dispatched > 30 min old) will be cleaned up
  hourly without operator intervention.
- `findRecentMatchingJob_` no longer matches against junk-pending rows
  (failed status is excluded by the existing logic at line 178 of
  ScrapeHistoryStore.gs), so the duplicate-query "už hledáno" alert remains
  accurate.

## Known Limits

- **Out of scope (tracked separately):** rate limiting on `triggerScrape`,
  `resolveReview` idempotence, `apps-script-endpoint.gs.example` drift,
  hardcoded sheet IDs in docs (SEC-001), auth model overhaul (D-7), GDPR /
  PRIVACY.md (A-12), legacy `FIRMYCZ-XXXX` lead_id cosmetic migration.
- **Reaper does not retry the work** — it only marks the job as failed so
  history stays accurate and `findRecentMatchingJob_` doesn't false-match.
  Operators must re-dispatch the scrape manually if the original work was lost.
- **30-min timeout is a heuristic.** Normal end-to-end runtime is well under
  10 min (GH Actions cold start + scrape + ingest callback). 30 min gives
  ample headroom; if a future portal has legitimately slower scrapes, raise
  the constant. False-positive risk is bounded — flipping to `failed` is
  reversible by re-dispatch and does not lose data.
- **Lock contention with concurrent ingest** — both `reapStaleScrapeJobs_`
  and `updateScrapeJobStatus_` use the same `LockService.getScriptLock()`,
  so a worst-case race where reaper tries to flip a row while a tardy
  ingest callback is mid-flight will serialize cleanly. The ingest will win
  if it gets the lock first (job ends up status=completed); the reaper will
  win if it gets there first (job ends up status=failed and a later ingest
  for the same job_id will overwrite to status=completed via the same
  whitelisted update path). Either ordering is acceptable.

## Next Dependency

| Task | Co potrebuje z A-11 followup |
|------|------------------------------|
| Rate limiting on triggerScrape (separate followup) | Independent. |
| `resolveReview` idempotence (separate followup) | Independent. |
| Audit cleanup of `_scrape_history` legacy rows | After this lands, any pre-existing stuck rows in PROD will be reaped on first hourly tick or manual menu run. No further action needed. |
