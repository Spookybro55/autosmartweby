# Task Record: email-cleanup-eliminate-legacy

## Metadata

| Pole | Hodnota |
|------|---------|
| **Task ID** | email-cleanup-eliminate-legacy |
| **Title** | Eliminate all 4 legacy assignee email forms — canonical-only state |
| **Owner** | Stream B |
| **Status** | code-complete |
| **Date** | 2026-04-29 |
| **Stream** | B |

## Scope

Project had 4 legacy assignee email forms scattered across code, config, and
docs (specific addresses redacted as `<legacy>` per Option A — concrete
strings live only in git history before this PR).

3 canonical replacements (login-id form `<initial>.<lastname>@autosmartweb.cz`):
- `s.fridrich@autosmartweb.cz`
- `t.maixner@autosmartweb.cz`
- `j.bezemek@autosmartweb.cz`

**Active production bug:** When operator logged in as
`s.fridrich@autosmartweb.cz` (canonical), the `/leads` "Mé leady" filter
showed empty because LEADS sheet still had rows with one of the `<legacy>`
forms AND frontend `ASSIGNEE_NAMES` had never been migrated to the new keys
(Apps Script side was migrated only partially on 2026-04-27).

Operator decision: **eliminate all legacy references everywhere** — no
fallback, no migration map, no historical compatibility. Clean state.

This task was 3 phases:

- **Phase A (operator pre-step, doc only):** run `migrateLegacyAssigneeEmails_`
  one last time before merge so Sheet data is clean before the migration code
  is deleted.
- **Phase B (this PR — code):** delete migration apparatus, flip
  `DEFAULT_REPLY_TO_EMAIL`, rewrite frontend `ASSIGNEE_NAMES`, fix one
  hardcoded fallback in `lead-detail-drawer.tsx`.
- **Phase C (this PR — docs):** purge legacy email references from active
  20-29 canonical docs, all PILOT-* docs, README.md, and source task records
  via Option A redaction (`<legacy>` placeholder preserves narrative; canonical
  3 stay visible).

## Code Changes

| Soubor | Typ změny | Popis |
|--------|-----------|-------|
| apps-script/Config.gs | modified | DELETED `LEGACY_ASSIGNEE_EMAIL_MAP` constant + 14-line comment block above it. Flipped `DEFAULT_REPLY_TO_EMAIL` from a `<legacy>` value to `'s.fridrich@autosmartweb.cz'` (`DEFAULT_REPLY_TO_NAME` unchanged). |
| apps-script/EmailTemplateStore.gs | modified | DELETED `migrateLegacyAssigneeEmails_` function (52 lines, lock-protected scanner). DELETED `migrateAndBootstrap` convenience wrapper (24 lines). |
| apps-script/Menu.gs | modified | DELETED menu item `'Migrate legacy assignees → bootstrap'`. Kept `'Bootstrap no-website v1 (only)'` next to it. |
| crm-frontend/src/lib/config.ts | modified | Rewrote `ASSIGNEE_NAMES` to exactly 3 canonical entries: `s.fridrich@autosmartweb.cz` → 'Sebastián Fridrich', `t.maixner@autosmartweb.cz` → 'Tomáš Maixner', `j.bezemek@autosmartweb.cz` → 'Jan Bezemek'. `ALLOWED_USERS` auto-narrows via `Object.keys(ASSIGNEE_NAMES)`. |
| crm-frontend/src/components/leads/lead-detail-drawer.tsx | modified | Single line: `senderEmail` fallback flipped from a `<legacy>` value to `"s.fridrich@autosmartweb.cz"` (used when `lead.assigneeEmail` is empty/orphan). |
| scripts/test-email-cleanup.mjs | new | 130 lines. 48 assertions across 4 sections: (1) frontend ASSIGNEE_NAMES has exactly 3 keys, all match canonical pattern `^[a-z]\.[a-z]+@autosmartweb\.cz$`, all map to expected names, no legacy keys; (2) formatAssignee mock returns canonical name for canonical email + 'Neznámý' for legacy by design; (3) Apps Script via `vm.runInContext`: `LEGACY_ASSIGNEE_EMAIL_MAP === undefined`, `DEFAULT_REPLY_TO_EMAIL === 's.fridrich@autosmartweb.cz'`, `ASSIGNEE_PROFILES` still has 3 canonical keys; (4) cross-check: 6 source files (Config.gs, EmailTemplateStore.gs, Menu.gs, OutboundEmail.gs, config.ts, lead-detail-drawer.tsx) verified to NOT include any of the 4 legacy email substrings. |

## Docs Updated

| Dokument | Typ změny | Proč |
|----------|-----------|------|
| README.md | modified | Owner email + Reply-To fallback (3 instances) → canonical. |
| docs/22-technical-architecture.md | modified | DELETED 2 rows from Mailbox role table that documented legacy aliases as deprecated. Per spec, no need to keep "deprecated" rows — they exist nowhere now. |
| docs/PHASE2-RECON.md | modified | Q3 fallback note (1 instance) → canonical. |
| docs/PILOT-SMOKE-TEST.md | modified | Login example (1) + outbound test (3 instances combined into 1 line edit) → canonical. |
| docs/PILOT-OPERATIONS.md | modified | Escalation header + clasp login note + fallback narrative (3 instances) → canonical. |
| docs/PILOT-INCIDENT-RESPONSE.md | modified | Escalation header + Gmail Undo note + escalation narrative + Quick reference table rows (5 instances) → canonical. |
| docs/PILOT-ENV-VARS.md | modified | `ALLOWED_EMAILS` example value (line 59) + Apps Script project owner reference (line 176) → canonical. |
| docs/30-task-records/B-13.md | modified | 5 occurrences redacted with `<legacy>` placeholder per Option A (preserves narrative; 3 canonical addresses stay visible). Added closing note "(Note 2026-04-29: ... deleted in email-cleanup-eliminate-legacy task.)" to 2 spots so future readers know the Known Limit was resolved. |
| docs/30-task-records/B-11.md | modified | Email-sender narrative (1 instance) — `<legacy>` → `deployer Google účtu (master)`. |
| docs/30-task-records/email-cleanup-eliminate-legacy.md | new | Tento task record. |
| docs/11-change-log.md | regenerated | Auto z task records — picks up B-13 + B-11 redactions. |
| docs/29-task-registry.md | regenerated | Auto z task records. |

## Contracts Changed

- **Apps Script symbol surface contract:** Two functions and one constant are
  now `undefined`:
  - `LEGACY_ASSIGNEE_EMAIL_MAP` (was top-level `var` in Config.gs)
  - `migrateLegacyAssigneeEmails_` (was top-level function in EmailTemplateStore.gs)
  - `migrateAndBootstrap` (was top-level function in EmailTemplateStore.gs)
  Test 5/6 explicitly assert this absence. Any external code/menu/test
  expecting these names breaks loudly — by design.
- **Sheet menu contract:** "Autosmartweby CRM → Migrate legacy assignees →
  bootstrap" item no longer exists. Operator must run
  `bootstrapNoWebsiteV1` directly if needed (already separate menu item).
- **Frontend type narrowing:** `ALLOWED_USERS` (= `Object.keys(ASSIGNEE_NAMES)`)
  shrinks from 4 strings to 3 strings. Login attempts with the 4 legacy email
  forms will be rejected by the route at `/api/auth/login` because they're not
  in `ALLOWED_USERS` — by design.
- **Reply-To fallback semantics:** Both Apps Script (`DEFAULT_REPLY_TO_EMAIL`)
  and frontend (`lead-detail-drawer.tsx` `senderEmail` fallback) now point to
  `s.fridrich@autosmartweb.cz`. Behavior change: emails sent for
  unassigned/orphan leads will have Reply-To `s.fridrich@autosmartweb.cz`
  instead of the prior `<legacy>` value. Legitimate flow change per task spec.
- **No new error codes, no new schema, no new env vars.**

## Tests

| Check | Výsledek |
|-------|----------|
| `node scripts/test-email-cleanup.mjs` | OK — **48/48** assertions across 4 sections |
| `node scripts/test-rate-limit.mjs` (regression) | 26/26 |
| `node scripts/test-stale-job-reaper.mjs` (regression) | 32/32 |
| `node scripts/test-resolve-review-idempotence.mjs` (regression) | 43/43 |
| `node scripts/test-a09-ingest-report.mjs` (regression) | 136/136 |
| `npx tsc --noEmit` (crm-frontend) | OK — clean |
| `npx eslint` on touched frontend files | OK — 0 errors / 1 pre-existing warning (`StatusBadge` unused import — not from this PR, BLD-012 backlog) |
| `npm run build` (crm-frontend) | OK — Compiled in 28.1 s |
| `node --check` of all 20 .gs files | OK |
| `node scripts/docs/check-doc-sync.mjs` | OK — 43 pass / 0 fail |
| Cross-codebase grep for 4 legacy patterns in `apps-script/`, `crm-frontend/src/`, `docs/` (active) | **0 matches** in apps-script/ + crm-frontend/src/ + docs/ active layer. (Archive `docs/archive/18-google-auth-*.md` excluded per CLAUDE.md "needitovat archive".) |

## Output for Audit

After this PR + Phase A operator action + clasp push:

- 0 occurrences of any of the 4 `<legacy>` patterns (the full strings live
  only in git history before this PR, plus `docs/archive/` and `offers/*.html`
  per Known Limits) anywhere in `apps-script/`, `crm-frontend/src/`, or
  active `docs/`.
- Frontend `ASSIGNEE_NAMES` has exactly 3 canonical keys; `ALLOWED_USERS` is
  derived from those 3 and rejects any other login.
- Apps Script Reply-To fallback for unassigned leads is now
  `s.fridrich@autosmartweb.cz`.
- Migration code is gone — there is no path to re-introduce legacy emails via
  fallback or back-compat layer.
- B-13 task record narrative preserved with `<legacy>` placeholder so audit
  history remains readable without exposing specific addresses.

## Known Limits

- **Phase A is operator action.** This PR's correctness depends on the
  operator running `migrateLegacyAssigneeEmails_` ONE LAST TIME against the
  live Sheet BEFORE merging. If skipped, any LEADS row with a legacy
  `assignee_email` becomes effectively orphan: it won't match any
  `assignee_email` filter in `/leads` and won't login as that user. The PR
  description spells out the pre-merge checklist.
- **Vercel `ALLOWED_EMAILS` env var** is operator action AFTER merge — not
  in this PR. The new `ALLOWED_USERS` narrows the `/api/auth/login`
  allowlist to 3 canonical entries; if Vercel still has legacy emails in
  `ALLOWED_EMAILS`, those entries are simply ignored (no error, just no
  effect). Operator should rotate `ALLOWED_EMAILS` for cleanliness.
- **Gmail "Send mail as" alias setup** — separate operator concern, not in
  this PR. Outbound emails still use the `executeAs: USER_DEPLOYING` Apps
  Script account; only Reply-To changes.
- **Marketing-web repo** (`Spookybro55/ASW-MARKETING-WEB`) — different repo,
  out of scope. Live marketing site still references one of the `<legacy>`
  forms per docs/22 prior comment — operator concern, separate work.
- **`offers/*.html` files at repo root** still reference one of the
  `<legacy>` forms (2 instances). These are sample marketing
  artifacts outside the spec's verification scope (`apps-script/` +
  `crm-frontend/src/` + `docs/`). Left alone per spec; document here for
  awareness — if these are sent to clients, separate cleanup task.
- **`docs/archive/*` left alone** per CLAUDE.md "Needituj archive docs". Two
  archive files reference one of the `<legacy>` forms
  (`18-google-auth-rollout-checklist.md`, `18-google-auth-and-email-architecture.md`).
  Acceptable — archive is a snapshot of historical state.

## Next Dependency

| Task | Co potřebuje z email-cleanup-eliminate-legacy |
|------|------------------------------------------------|
| Vercel `ALLOWED_EMAILS` rotation | Operator step after merge. |
| `offers/*.html` cleanup | Separate cosmetic PR if those files are still client-facing. |
| Marketing-web repo email update | Separate repo. |
| Gmail "Send mail as" alias for `s.fridrich@autosmartweb.cz` | Operator concern; would let outbound `From:` match canonical sender (currently still deployer Google account). |
