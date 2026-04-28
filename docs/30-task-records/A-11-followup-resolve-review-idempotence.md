# Task Record: A-11-followup-resolve-review-idempotence

## Metadata

| Pole | Hodnota |
|------|---------|
| **Task ID** | A-11-followup-resolve-review-idempotence |
| **Title** | handleResolveReview_ idempotence guard — block double-submit before LEADS duplication |
| **Owner** | Stream A |
| **Status** | code-complete |
| **Date** | 2026-04-28 |
| **Stream** | A |

## Scope

A-11 (PR #76) shipped the `/scrape/review` queue and the
`POST /api/scrape/review/[id]/resolve` route, backed by
`handleResolveReview_` in Apps Script. The frontend dialog uses
`disabled={submitting}` to suppress accidental double-clicks, but **the
server has no idempotence guard** — it is the contract boundary and must
enforce.

The real failure mode is `decision='import'`: the second call would re-run
`appendLeadRow_` and create a **duplicate row in LEADS** (data integrity
violation). `decision='skip'` and `decision='merge'` second-calls are
benign in practice (skip is a no-op overwrite of `updated_at`; merge has
an existing no-clobber whitelist), but inconsistent — they should also be
rejected so the API has uniform semantics.

This task adds a single guard at the top of `handleResolveReview_` (after
input validation + row lookup, before decision-specific branches) that
mirrors the `listPendingReview` filter exactly: a row is resolvable iff
both `normalized_status === 'duplicate_candidate'` AND
`import_decision === 'pending_review'`. After any of the three resolutions,
both fields flip to terminal values, so the second call short-circuits
with `error: 'already_resolved'` + structured `details` (current_status,
current_decision, resolved_at).

Frontend mirrors the new error code: route returns 409 Conflict, writer
forwards `details`, dialog shows a Czech toast ("Tento záznam už byl
vyřešen jiným operátorem. Obnovuji frontu…"), removes the stale row
locally, triggers a full refetch via a new optional `onAlreadyResolved`
prop wired from the page component, and closes the dialog.

Production has not hit this yet (no review queue activity to date). This
is a preventive fix before the queue is used at scale or by multiple
operators.

## Code Changes

| Soubor | Typ změny | Popis |
|--------|-----------|-------|
| apps-script/WebAppEndpoint.gs | modified | +20 lines. Idempotence guard inserted in `handleResolveReview_` after `raw_import_not_found` check and before decision branches. Reads `normalized_status` + `import_decision` from the already-loaded row, returns `{ok: false, error: 'already_resolved', details: {current_status, current_decision, resolved_at}}` when either field has flipped to a terminal value. Logs WARN to `_asw_logs` for telemetry. Gate condition mirrors `listPendingReview` (lines 771-772) so semantics are: "if the operator can see it in the queue, this call can resolve it; otherwise short-circuit." |
| crm-frontend/src/types/scrape.ts | modified | +44 lines. New `ResolveReviewAlreadyResolvedDetails` interface for the structured-details shape. New `RESOLVE_REVIEW_ERROR_CODES` const map (single source of truth for error string literals; mirrors handler-side codes). New `RESOLVE_REVIEW_ERROR_LABELS` Czech-label map for all 8 error codes (used by dialog catch branch). |
| crm-frontend/src/lib/google/apps-script-writer.ts | modified | +6 lines. `ResolveReviewWriterResult` extended with optional `details?: Record<string, unknown>`; the error path now forwards `data.details` from the AS response so route + dialog can read it. |
| crm-frontend/src/app/api/scrape/review/[id]/resolve/route.ts | modified | +6 lines. New 409 Conflict branch when AS returns `already_resolved` — semantically correct HTTP status for "resource state prevents this operation". Forwards `details` in body. JSDoc updated. |
| crm-frontend/src/components/scrape/dedupe-review-dialog.tsx | modified | +18 lines. New optional `onAlreadyResolved?: () => void \| Promise<void>` prop. The error-handling branch in `submit()` now switches on error code: on `already_resolved` it shows the Czech toast, calls `onResolved` (optimistic remove), invokes `onAlreadyResolved` (full refetch), and closes the dialog. Generic-error fallback now uses the central label map. |
| crm-frontend/src/app/scrape/review/page.tsx | modified | +1 line. Wires `onAlreadyResolved={() => fetchItems(true)}` so the dialog can trigger a queue refetch when the server short-circuits. |
| scripts/test-resolve-review-idempotence.mjs | new | 270 lines. Port-and-prove test mirroring the pattern of test-stale-job-reaper.mjs. 5 scenarios, **43 assertions, all passing**: (1) first-import-success + second-import-rejected with the critical assertion that `LEADS_ROWS.length === 1` after the blocked second call (no duplicate insert — the actual data-integrity bug); (2) all 3 terminal states × all 3 decisions = 9 attempts all rejected; (3) row-not-found returns `raw_import_not_found`, NOT `already_resolved` (different operator UX); (4) skip→skip blocked (uniform semantics, no silent updated_at overwrite); (5) skip→import blocked (terminal states are immutable from the API). |

## Docs Updated

| Dokument | Typ změny | Proč |
|----------|-----------|------|
| docs/30-task-records/A-11-followup-resolve-review-idempotence.md | new | Tento task record. |
| docs/11-change-log.md | regenerated | Auto z task records. |
| docs/29-task-registry.md | regenerated | Auto z task records. |

## Contracts Changed

- **Apps Script Web App:** `resolveReview` action gains a new error code `already_resolved` with structured `details` field. Existing success shape (`{ok: true, decision, raw_import_id, lead_id?, merged_fields?}`) and existing error codes (`missing_rawImportId`, `invalid_decision`, `raw_import_not_found`, `lock_timeout`, `normalize_failed`, `no_match_to_merge_with`, `matched_lead_not_found`) are unchanged.
- **Next.js API:** `POST /api/scrape/review/[id]/resolve` gains 409 Conflict status for `already_resolved`. Body shape on this case: `{error: 'already_resolved', details: {current_status, current_decision, resolved_at}}`. 200 / 400 / 404 / 502 paths unchanged.
- **Sheets:** no schema change. The guard is purely a read-side check on existing `normalized_status` + `import_decision` columns.
- **Frontend types:** new exports `RESOLVE_REVIEW_ERROR_CODES`, `RESOLVE_REVIEW_ERROR_LABELS`, `ResolveReviewAlreadyResolvedDetails`, `ResolveReviewErrorCode`. Existing `ResolveReviewResponse` / `ResolveReviewInput` unchanged.
- **Component contract:** `DedupeReviewDialog` gains an optional `onAlreadyResolved` prop. Existing callers without it still compile (the dialog falls back to onResolved-only behaviour).

## Tests

| Test | Výsledek |
|------|----------|
| `node scripts/test-resolve-review-idempotence.mjs` | OK — 43/43 assertions across 5 scenarios |
| `node scripts/test-stale-job-reaper.mjs` (regression smoke) | OK — 32/32 (unchanged) |
| `node scripts/test-a09-ingest-report.mjs` (regression smoke) | OK — 136/136 (unchanged) |
| `npx tsc --noEmit` (crm-frontend) | OK — no errors |
| `npx eslint` on the 5 touched frontend files | OK — no errors / warnings |
| `npm run build` (crm-frontend) | OK — Compiled successfully in 12.1s; all 23 routes including `/api/scrape/review/[id]/resolve` |
| `node --check` of edited `WebAppEndpoint.gs` | OK |
| TEST clasp deploy + manual end-to-end verification | pending operator action (see "How to verify after merge" in PR description) |

## Output for Audit

After this PR ships and is `clasp push`ed to TEST + PROD:

- A double-submit on `decision='import'` (network retry, browser autofill, or rapid double-click that bypasses the React `disabled` flag) **cannot create a duplicate LEADS row**. The second call returns 409 with structured details before any write.
- The dialog shows a clear Czech toast in the multi-operator race case ("Tento záznam už byl vyřešen jiným operátorem. Obnovuji frontu…") and reconciles the queue.
- `_asw_logs` records a `WARN handleResolveReview_ already_resolved <rawImportId> status=<x> decision=<y>` line for every blocked attempt — visible in audit trail.
- All 8 resolveReview error codes now have Czech labels in a single source of truth for future UI consistency.

## Known Limits

- **Out of scope (tracked separately):** rate limiting on `triggerScrape`, `apps-script-endpoint.gs.example` drift, hardcoded sheet IDs in docs (SEC-001), `SUPPORTED_SCRAPE_PORTALS` dual-source sync, auth model overhaul (D-7), GDPR / PRIVACY.md (A-12), cache invalidation in /leads (IN-006). The stale-job reaper is already done in the previous follow-up PR.
- **Lock contention with concurrent ingest:** `handleResolveReview_` already used `LockService.getScriptLock()`. The guard runs inside the same lock, so it is atomic with respect to any other write to `_raw_import` from the same Apps Script project.
- **Cross-Apps-Script-instance race not addressed:** if two operators hit the route through two different Apps Script instances (shouldn't happen — the deployment is a single web-app), the script lock alone wouldn't serialize them. The guard's read-then-check inside the lock still produces the right result for any single-instance deployment.
- **No "recover from failed half-write" path:** if `appendLeadRow_` succeeds but `updateRawImportRow_` fails (extremely unlikely; both inside the same lock and same sheet `getRange`/`setValue` calls), the row would stay `pending_review` and a re-submit would create a second LEADS row. This is the same risk profile as before the guard — the guard does not introduce the risk, and fixing it would require a transaction wrapper that Sheets does not natively offer. Documented for awareness.
- **Frontend "stale local state" UX:** the dialog removes the row optimistically and refetches, but if the user has the dialog open for a while and another operator resolves the row meanwhile, the user sees the toast on first action. Acceptable — full real-time push would require a websocket layer that's out of scope.

## Next Dependency

| Task | Co potřebuje z A-11 followup resolve-review-idempotence |
|------|---------------------------------------------------------|
| Rate limiting on triggerScrape (separate followup) | Independent. |
| Multi-operator review queue assignment (backlog) | The 409 error code + Czech label scaffold lands now; assignment-collision UX can reuse the same toast pattern. |
| `apps-script-endpoint.gs.example` drift cleanup (separate task) | The new error code list in `RESOLVE_REVIEW_ERROR_CODES` will need to be reflected in the docs example when that drift gets cleaned up. |
