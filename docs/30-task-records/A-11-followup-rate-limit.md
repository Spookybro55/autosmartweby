# Task Record: A-11-followup-rate-limit

## Metadata

| Pole | Hodnota |
|------|---------|
| **Task ID** | A-11-followup-rate-limit |
| **Title** | Rate limit on scrape job dispatch — hourly per-user + daily global caps |
| **Owner** | Stream A |
| **Status** | code-complete |
| **Date** | 2026-04-28 |
| **Stream** | A |

## Scope

A-11 (PR #76) shipped `/api/scrape/trigger` and `recordScrapeJob_` with
**zero rate limiting**. A 100× burst (operator misclick, browser autofill
loop, scripted retry) would dispatch 100 GitHub Actions workflows
(~5% of the free monthly minutes tier in seconds), risk firmy.cz
IP-banning the shared GH Actions outbound IP, and pollute
`_scrape_history` with redundant rows. `findRecentMatchingJob_` only
catches identical (portal, segment, city, district) 4-tuples — any
tuple variation bypasses it.

This task adds a pre-flight rate-limit gate inside `recordScrapeJob_`,
running inside the existing script lock (atomic with respect to the
appendRow that follows, so two concurrent dispatches cannot both pass
when only one should). Two rolling-window caps:

1. **Per-operator hourly** — `RATE_LIMIT_HOURLY_PER_USER = 10` per
   `requested_by` per rolling 60 min. Catches operator misclicks +
   stuck autofill loops in the operator's own session.
2. **Global daily** — `RATE_LIMIT_DAILY_GLOBAL = 50` across all
   operators per rolling 24 h. Caps GH Actions cost / firmy.cz blast
   radius even if every operator independently maxes their hourly.

Single sheet read counts both windows in one pass (2 adjacent columns:
`requested_at` + `requested_by`). Hourly check is evaluated first
(more common, faster feedback for the actor who triggered).

On exceed: `enforceScrapeRateLimit_` throws an `Error` with a tagged
`.rateLimitDetails` property `{scope, limit, current, retry_after_seconds}`.
`handleTriggerScrape_`'s catch unwraps it and returns
`{ok: false, error: 'rate_limit_exceeded', details: {...}}`. Vercel
`/api/scrape/trigger` returns **HTTP 429 Too Many Requests** + the
RFC 9110 §15.5.27 mandated `Retry-After` header. Frontend renders a
Czech toast "Příliš mnoho požadavků — překročen hodinový limit (10
jobů/hod na operátora). Zkus to znovu za N min." with the form left
open + inputs preserved (no auto-retry, operator decides when to retry).

`retry_after_seconds` is calculated as the time remaining until the
**oldest** counted row falls out of its rolling window — i.e. when the
cap mathematically drops by 1 and the next slot opens. This is the
floor of the actual wait for sustained throughput; for a single retry
it is exact.

## Code Changes

| Soubor | Typ změny | Popis |
|--------|-----------|-------|
| apps-script/Config.gs | modified | +14 lines. New `RATE_LIMIT_HOURLY_PER_USER = 10` and `RATE_LIMIT_DAILY_GLOBAL = 50` constants under the existing A-11 followup section, with rationale comment explaining the burst-protection / GH-Actions-cost / firmy.cz-IP-ban risk that motivated them. |
| apps-script/ScrapeHistoryStore.gs | modified | +95 lines. New `enforceScrapeRateLimit_(sheet, actor)` helper. Reads only the 2 adjacent columns (requested_at + requested_by) in a single `getValues()` call; iterates once and counts both rolling windows. Hourly per-user check first, then global daily. On exceed, throws `Error` with `.rateLimitDetails` attached + WARN log to `_asw_logs`. Defensive on malformed `requested_at` (skip + don't crash + don't over-count). `recordScrapeJob_` calls it after `actor` is determined and before `appendRow` — inside the existing `LockService.getScriptLock()` window for atomicity. |
| apps-script/WebAppEndpoint.gs | modified | +9 lines. `handleTriggerScrape_`'s catch branch detects `err.rateLimitDetails` and forwards as structured `{ok: false, error: 'rate_limit_exceeded', details: {...}}` via existing `jsonResponse_`. Other errors still flow through the original ERROR-log + generic-error path. |
| crm-frontend/src/types/scrape.ts | modified | +60 lines. New `TriggerScrapeRateLimitDetails` interface. New `TRIGGER_SCRAPE_ERROR_CODES` const map covering all 12 trigger error codes (mirrors PR #78's `RESOLVE_REVIEW_ERROR_CODES` pattern — single source of truth, prevents scattered enum drift). New `TRIGGER_SCRAPE_ERROR_LABELS` Czech-label map. Migrated all error labels from the inline `errMap` previously embedded in `scrape-form.tsx`. |
| crm-frontend/src/lib/google/apps-script-writer.ts | modified | +6 lines. `TriggerScrapeWriterResult` extended with optional `details?: Record<string, unknown>`; the error path now forwards `data.details` from the AS response so the route + form can read it. |
| crm-frontend/src/app/api/scrape/trigger/route.ts | modified | +20 lines. New 429 branch when AS returns `rate_limit_exceeded`. Includes RFC 9110 `Retry-After` header (in seconds, per spec) when `details.retry_after_seconds` is present. JSDoc updated with the new response shape. Existing 409 (duplicate query) / 502 / 500 paths unchanged. |
| crm-frontend/src/components/scrape/scrape-form.tsx | modified | +24 lines (-13 lines for the inlined errMap that moved to types/scrape.ts). New code-switching error-handling branch: on `rate_limit_exceeded`, renders Czech toast "Příliš mnoho požadavků — překročen hodinový/denní limit (X jobů/period). Zkus to znovu za N min." (8 s duration), then `return` without resetting state — form stays open, inputs preserved, no auto-retry. Generic-error fallback now uses central `TRIGGER_SCRAPE_ERROR_LABELS`. |
| scripts/test-rate-limit.mjs | new | 290 lines. Port-and-prove test mirroring test-resolve-review-idempotence.mjs / test-stale-job-reaper.mjs style. **9 scenarios, 26 assertions, all passing**: (1) below cap succeeds; (2) at cap rejected — critical assertion: `SHEET_ROWS.length` unchanged after rejection (no append on block, the actual data-integrity guarantee); (3) cross-operator isolation; (4) global daily cap rejection; (5) old rows outside window do not count; (6) realistic mixed traffic succeeds; (7) `retry_after_seconds` math exact at 1800s for oldest row 30 min in (±30s tolerance for execution time); (8) malformed/empty `requested_at` skipped, does not crash; (9) `requested_by` matched case-insensitively. |

## Docs Updated

| Dokument | Typ změny | Proč |
|----------|-----------|------|
| docs/30-task-records/A-11-followup-rate-limit.md | new | Tento task record. |
| docs/11-change-log.md | regenerated | Auto z task records. |
| docs/29-task-registry.md | regenerated | Auto z task records. |

## Contracts Changed

- **Apps Script Web App:** `triggerScrape` action gains a new error code `rate_limit_exceeded` with structured `details` field (`scope`, `limit`, `current`, `retry_after_seconds`). All existing trigger error codes (`missing_portal`, `missing_segment`, `missing_city`, `unsupported_portal`, `*_too_long`, `invalid_max_results`) and the success shape (`{ok: true, duplicate, job_id, job_token, previousJob?}`) are unchanged.
- **Next.js API:** `POST /api/scrape/trigger` gains **HTTP 429 Too Many Requests** status for `rate_limit_exceeded`, with the RFC 9110 `Retry-After` header (in seconds). 200 / 400 / 409 (duplicate) / 502 / 500 paths unchanged. Distinct from PR #78's 409 on `/api/scrape/review/[id]/resolve` (different route, different semantic).
- **Sheets:** no schema change. The gate is purely a read-side count on existing `requested_at` + `requested_by` columns.
- **Frontend types:** new exports `TRIGGER_SCRAPE_ERROR_CODES`, `TRIGGER_SCRAPE_ERROR_LABELS`, `TriggerScrapeRateLimitDetails`, `TriggerScrapeErrorCode`. Existing `ScrapeJobInput` / `ScrapeTriggerResponse` / `ScrapeJob` unchanged.
- **No new dependencies.** No new env vars. No new sheets, no new menu items, no new triggers.

## Tests

| Test | Výsledek |
|------|----------|
| `node scripts/test-rate-limit.mjs` | OK — **26/26** assertions across 9 scenarios |
| `node scripts/test-resolve-review-idempotence.mjs` (regression) | OK — 43/43 |
| `node scripts/test-stale-job-reaper.mjs` (regression) | OK — 32/32 |
| `node scripts/test-a09-ingest-report.mjs` (regression) | OK — 136/136 |
| `npx tsc --noEmit` (crm-frontend) | OK — no errors |
| `npx eslint` on the 4 touched frontend files | OK — no errors / warnings |
| `npm run build` (crm-frontend) | OK — Compiled in 9.8s, all 23 routes |
| `node --check` of edited `Config.gs`, `ScrapeHistoryStore.gs`, `WebAppEndpoint.gs` | OK |
| `node scripts/docs/check-doc-sync.mjs` | OK — 43 pass / 0 fail |
| TEST clasp deploy + manual rate-limit verification | pending operator action (see "How to verify after merge" in PR description) |

## Output for Audit

After this PR ships and is `clasp push`ed:

- A 100× burst on `/api/scrape/trigger` from a single operator stops at the 11th attempt within the rolling hour. Attempts 11+ get HTTP 429 + Czech toast naming the scope and minutes-until-retry. **No GH Actions dispatch is issued and no row is appended on rejection** (gate runs before both side effects).
- Across all operators, the global daily cap fires at 51+ within any 24h rolling window — same shape, scope label flips to "denní limit (50 jobů/den globálně)".
- `_asw_logs` records a `WARN enforceScrapeRateLimit_ (hourly_per_user|daily_global) actor=<email> current=<n> limit=<n>` line for every blocked attempt.
- `Retry-After` header on 429 lets non-browser HTTP clients (curl, future API consumers) handle backoff without parsing the JSON body.
- Existing flows (single-job dispatch, duplicate-query 409, review queue, stale-job reaper) are unaffected.

## Known Limits

- **Out of scope (tracked separately, FOLLOWUP not modified):** failed-jobs UX in `/scrape` history table, `apps-script-endpoint.gs.example` drift cleanup, `SUPPORTED_SCRAPE_PORTALS` dual-source consolidation, hardcoded sheet IDs in docs (SEC-001), auth model overhaul (D-7 / SEC-007), GDPR / PRIVACY.md (A-12), cache invalidation in `/leads` (IN-006).
- **`retry_after_seconds` is a floor, not exact for sustained throughput.** It tells the operator when the *first* slot opens (oldest row exits window). If they want sustained dispatch, they should wait roughly `retry_after_seconds + (60 / RATE_LIMIT_HOURLY_PER_USER) × 60` for steady-state. The toast wording ("Zkus to znovu za N min.") matches the floor case which is the common operator UX (one retry, not a script).
- **Lock contention:** the gate runs inside the existing `LockService.getScriptLock()` window in `recordScrapeJob_`, so two concurrent triggers serialize cleanly — the second one sees the first's appended row and counts it. No race-window where both pass when only one should.
- **Cross-Apps-Script-instance race not addressed:** if two operators hit the route through two different Apps Script instances (shouldn't happen — the deployment is a single web-app), the script lock alone wouldn't serialize them. The gate's read-then-check inside the lock still produces the right result for any single-instance deployment.
- **Limits not per-portal:** all portals share the same hourly per-user + daily global buckets. If a future portal needs different ceilings (e.g. `zivefirmy.cz` with stricter target-side limits), refactor `enforceScrapeRateLimit_` to accept a `portal` arg and look up the correct limit map.
- **No "burst credit"** — strict rolling window, no leaky-bucket. A flat 10/h ceiling is simpler to reason about and prevents accidental scripted bursts. If operators legitimately need >10/h sustained, raise the constant; don't game the algorithm.

## Next Dependency

| Task | Co potřebuje z A-11 followup rate-limit |
|------|------------------------------------------|
| Failed-jobs UX in /scrape history (separate followup) | Independent. |
| `apps-script-endpoint.gs.example` drift cleanup | The new `TRIGGER_SCRAPE_ERROR_CODES` will need to be reflected in the docs example when that drift gets cleaned up. |
| Multi-portal rate limits (hypothetical future) | `enforceScrapeRateLimit_(sheet, actor)` signature can grow `portal` arg with a lookup table; existing call site passes a static value. |
| External API consumers / programmatic access | `Retry-After` header is already RFC-correct, no further work needed on the backoff contract. |
