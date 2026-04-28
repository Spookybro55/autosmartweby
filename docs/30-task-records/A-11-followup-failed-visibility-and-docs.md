# Task Record: A-11-followup-failed-visibility-and-docs

## Metadata

| Pole | Hodnota |
|------|---------|
| **Task ID** | A-11-followup-failed-visibility-and-docs |
| **Title** | Failed jobs visibility in /scrape table + apps-script-endpoint.gs.example refresh |
| **Owner** | Stream A |
| **Status** | code-complete |
| **Date** | 2026-04-29 |
| **Stream** | A |

## Scope

A-11 has been hardened by three followup PRs (#77 reaper, #78 idempotence,
#80 rate limit). The reaper writes `error_message='timeout_no_callback'`
into `_scrape_history` rows it flips, and ingest callbacks write upstream
error strings on genuine failures. Frontend `/scrape` history table had
inline status colors but rendered the error indicator as a separate
`⚠ chyba` element with a native `title` attribute — inconsistent with
the rest of the codebase, no styling, no centralized state-color logic.

This PR does two things:

1. **Failed jobs visibility** — extracts the inline status pill into
   a reusable `ScrapeStatusBadge` component using the project's
   `@base-ui/react/tooltip` primitive (consistent with
   `lead-detail-drawer.tsx` pattern). On `failed` rows with a non-empty
   `error_message`, the badge becomes its own tooltip trigger;
   the redundant `⚠ chyba` adornment is removed.
2. **`apps-script-endpoint.gs.example` refresh** — onboarding sketch
   had drifted to a single stale action (`updateLead`) while
   `WebAppEndpoint.gs` grew to 19 actions across B-13 + Phase 2 + A-11.
   Refreshed with banner pointing to canonical source + sync commit
   SHA, full action list grouped by feature, request/response contract,
   HTTP status mapping documentation (mirrors PRs #76, #78, #80), and
   one representative handler stub commented as scaffolding only.

Both fixes share the visibility/onboarding theme so they bundle
cleanly under one task record + one changelog entry.

**Backend untouched.** Verified during exploration: `stripJobInternal_`
spreads all fields except `_rowNum` + `job_token`, so `error_message`
already reaches the frontend without any AS change. `ScrapeJob` type
already declares `error_message: string`. Writer wrapper passes
`data.history` through without per-field destructure. Only frontend
+ docs in this PR.

## Code Changes

| Soubor | Typ změny | Popis |
|--------|-----------|-------|
| crm-frontend/src/components/scrape/scrape-status-badge.tsx | new | 47 lines. New `ScrapeStatusBadge` component with 4 status colors (`pending`/`dispatched`/`completed`/`failed`) + Czech labels (`čeká`/`běží`/`hotovo`/`selhalo`) extracted from the previous inline `STATUS_LABELS` map. When `status === 'failed' && errorMessage` is non-empty, wraps the badge in a `<Tooltip>` with the error string in `<TooltipContent>`. Uses the project-standard `<TooltipTrigger render={<span tabIndex={0} />}>` pattern (matches `lead-detail-drawer.tsx`). |
| crm-frontend/src/components/scrape/scrape-history-table.tsx | modified | Removed the inline `STATUS_LABELS` map (-7 lines) and the redundant `⚠ chyba` adornment (-5 lines). Replaced status-cell content with `<ScrapeStatusBadge status={j.status} errorMessage={j.error_message} />` (-1 line, +1 line net). Imports updated. |
| crm-frontend/src/lib/google/apps-script-endpoint.gs.example | rewritten | 109 lines (was 99). Banner pointing at canonical source + sync commit SHA `1eacdb9`. Full enumeration of 19 doPost actions grouped by feature area (Lead management 2 / Phase 2 preview 3 / B-13 templates 9 / A-11 scraping 5). Request/response contract documented. HTTP status mapping table covering 200/404/409 (×2 codes)/429/502/500 across all four PRs (#76, #78, #80, this one). Real `handleUpdateLead_` body removed — replaced with commented-stub describing the steps so the example never drifts on implementation details, only on routing. |

## Docs Updated

| Dokument | Typ změny | Proč |
|----------|-----------|------|
| docs/30-task-records/A-11-followup-failed-visibility-and-docs.md | new | Tento task record. |
| docs/11-change-log.md | regenerated | Auto z task records. |
| docs/29-task-registry.md | regenerated | Auto z task records. |

## Contracts Changed

- **Frontend component contract:** new export `ScrapeStatusBadge` from `@/components/scrape/scrape-status-badge`. `ScrapeHistoryTable` still takes the same `history: ScrapeJob[]` prop — no caller change.
- **No backend contract change.** No new error codes, no new fields, no schema change. The `error_message` column (existing since A-11 PR #76) is now visibly surfaced in UI; it was already in the API response.
- **No new dependencies.** Tooltip primitive already in use (`@base-ui/react/tooltip` via `@/components/ui/tooltip`); `TooltipProvider` already mounted in root layout.
- **`apps-script-endpoint.gs.example` is a sketch, not a runtime artifact.** It is not imported anywhere, not deployed, not validated. The commit SHA + action list are documentation about what the live `WebAppEndpoint.gs` looks like at sync time; they are expected to drift between syncs.

## Tests

| Test | Výsledek |
|------|----------|
| `npx tsc --noEmit` (crm-frontend) | OK — no errors |
| `npx eslint` on `scrape-status-badge.tsx` + `scrape-history-table.tsx` | OK — no errors / warnings |
| `npm run build` (crm-frontend) | OK — Compiled in 38.8s, all 23 routes |
| `node scripts/test-rate-limit.mjs` (regression) | 26/26 |
| `node scripts/test-stale-job-reaper.mjs` (regression) | 32/32 |
| `node scripts/test-resolve-review-idempotence.mjs` (regression) | 43/43 |
| `node scripts/test-a09-ingest-report.mjs` (regression) | 136/136 |
| `node scripts/docs/check-doc-sync.mjs` | OK — 43 pass / 0 fail |
| Component-level tests for `ScrapeStatusBadge` | not added — project has no `*.test.tsx` infrastructure (Jest/Vitest), per spec defer to manual visual verification |

**Manual visual verification (operator):**
- `/scrape` history table renders 4 distinct colors per status (gray/blue/green/red).
- Hover over a `failed` row's badge → tooltip surfaces `error_message` text (e.g. `timeout_no_callback`).
- Hover over `completed`/`pending`/`dispatched` badges → no tooltip.
- Tab focus reaches the badge (tabIndex=0) — keyboard-accessible.

## Output for Audit

After this PR ships:
- Operator sees at a glance which scrape jobs failed (red badge) without opening the sheet.
- Hover reveals the upstream error reason in plain Czech-friendly text (`timeout_no_callback` from reaper, or upstream scraper error string).
- New devs reading `apps-script-endpoint.gs.example` get the routing pattern + a complete inventory of what's deployed, with the sync SHA so they know how stale the doc is and where to look for current truth.
- Future audits can grep for the SHA and validate it against `git log` to detect drift.

## Known Limits

- **Out of scope (tracked separately):** `SUPPORTED_SCRAPE_PORTALS` dual-source consolidation, hardcoded sheet IDs in docs (SEC-001), auth model overhaul (D-7 / SEC-007), GDPR / PRIVACY.md (A-12), `apps-script-writer.ts` IN-005 default `success ?? true`, cache invalidation in `/leads` (IN-006).
- **No automated drift detection on the example file.** The sync SHA is manually maintained — if a contributor adds a new doPost action without bumping the SHA + action list, the example silently drifts. Future improvement: a tiny check in `scripts/docs/check-doc-sync.mjs` that greps action names from `WebAppEndpoint.gs` and verifies every name appears in the example. Tracked as low-priority — the example is documentation, not contract.
- **No component test framework.** `ScrapeStatusBadge` has no unit tests because the project has no Jest/Vitest setup. Adding one for a single 47-line component would be an architectural decision out of scope for a visibility fix. The component logic is purely presentational (label/color mapping + conditional tooltip) and is verified by manual hover.
- **Tooltip uses `tabIndex={0}` per project convention** — keyboard-accessible. Screen-reader announcement is whatever `@base-ui/react/tooltip` provides by default (project hasn't customized).

## Next Dependency

| Task | Co potřebuje z A-11 followup failed-visibility |
|------|-------------------------------------------------|
| `SUPPORTED_SCRAPE_PORTALS` dual-source consolidation | Independent. |
| Future endpoint actions | Bump the sync SHA in `apps-script-endpoint.gs.example` and append to the action list. |
| Hypothetical "retry failed scrape from UI" feature | The badge tooltip already exposes `error_message`; that text is the operator's input for retry vs. give-up decision. |
