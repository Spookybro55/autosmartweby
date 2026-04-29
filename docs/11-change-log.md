# Change Log — Autosmartweby

> **Auto-generated** from task records (`docs/30-task-records/`).
> Regenerate: `node scripts/docs/build-changelog.mjs`
> Do NOT edit manually — changes will be overwritten.

---

## 2026-04-29

### [B/AGENT-TEAM-PHASE-1] AI Agent Team — Phase 1: knowledge base + Tech Lead + Bug Hunter — CODE-COMPLETE
- **Scope:** Phase 1 of 3 — bootstrap AI agent team setup per `docs/agents/_discovery-report.md`
(approved 2026-04-29) and `~/agent-team-setup-files/03-master-plan.md` v1.0.

Creates the Obsidian-compatible knowledge base structure under `docs/agents/`,
seeds it with project-specific patterns/gotchas, and ships the first 2 agent
roles: **Tech Lead** (single entry point + role dispatcher) and **Bug Hunter**
(reproduce-fix-test pattern for FF-* / AS-* findings).

Phase 1 does **not** include:
- Remaining 3 roles (security-engineer, qa-engineer, docs-guardian) — Phase 2
- Automation scripts (triage.mjs, validate-task-record.mjs) — Phase 2
- CI workflow (agent-pr-validation.yml) — Phase 2
- CRM dashboard (`/admin/dev-team`) — Phase 3
- Make scenarios + learning loop — Phase 3
- Anthropic API key + Make secret store setup — Phase 3 prerequisite

Discovery report Sekce 8 — all 8 architectural amendments are applied
across the new files (Stream ⊥ Track, real audit prefixes not BUG-, ad-hoc
task IDs, status enum extension, DoD harmonization with new "Agent Done"
section, PATTERNS auto-append vs manual entries split, OWNER_EMAIL env,
diff-size dichotomy).

Discovery report Sekce 9 — answers from Sebastián applied:
- Q1 backfill 46 records: NO (option c)
- Q2 stream labeling: option (a) derive from affected docs
- Q3 enforce_admins: false (keep)
- Q4 dashboard: read-only
- Q5 Make: Core plan ($9/měs)
- Q6 Anthropic API: Sebastián creates manually before Phase 3
- Q7 PR strategy: 3 separate PRs
- **Owner:** Sebastián Fridrich
- **Code:** docs/agents/README.md (new), docs/agents/ARCHITECTURE.md (new), docs/agents/PATTERNS.md (new), docs/agents/GOTCHAS.md (new), docs/agents/REGRESSION-LOG.md (new), docs/agents/DECISIONS.md (new), docs/agents/PLAYBOOKS.md (new), docs/agents/QUEUE.md (new), docs/agents/QUESTIONS-FOR-HUMAN.md (new), docs/agents/RUN-LOG.md (new), docs/agents/roles/tech-lead.md (new), docs/agents/roles/bug-hunter.md (new), docs/agents/SETUP-CHECKLIST.md (new), CLAUDE.md (modified), docs/30-task-records/_template.md (modified), docs/14-definition-of-done.md (modified)
- **Docs:** docs/30-task-records/AGENT-TEAM-PHASE-1.md, docs/agents/*, CLAUDE.md, docs/30-task-records/_template.md, docs/14-definition-of-done.md, docs/11-change-log.md, docs/29-task-registry.md

### [B/AGENT-TEAM-PHASE-2] AI Agent Team — Phase 2: remaining roles + CI workflow + triage scripts — CODE-COMPLETE
- **Scope:** Phase 2 of 3 — completes the agent role layer (3 remaining SKILLs), adds CI
guardrails for agent-driven PRs, and ships triage + task-record validation
helpers. Builds on Phase 1 vault structure (PR #88 merged as `2b03ed1`).

Phase 2 includes:
- `roles/security-engineer.md` — SEC-* / CC-SEC-* findings, secrets handling,
  threat modeling, GDPR/PII-aware writeups. Includes irreversible-action
  escalation rule (P0 + rotate Sheet IDs / change auth model → MUST escalate
  to QFH even when "SEC autonomně" was approved).
- `roles/qa-engineer.md` — test authoring (unit, integration, smoke), regression
  suite maintenance, test gap detection, CC-QA-* findings.
- `roles/docs-guardian.md` — task record completeness, stream-doc mapping
  enforcement (per docs/13), build-changelog/build-task-registry orchestration,
  FINDINGS.md `**Resolved**` annotation convention. **Najčastěji invokovaná
  role** — every Track A task ends with Docs Guardian step.
- `.github/workflows/agent-pr-validation.yml` — CI gate for `agent/*` and
  `agent-team/*` branches. Runs tsc, build, tests, docs:check, task-record
  validation, diff size enforcement (Track A 500 LOC), gitleaks scan.
- `scripts/agent/triage.mjs` — parses FINDINGS.md, classifies findings into
  roles + streams, produces ranked candidate list for QUEUE.md "Ready" section.
- `scripts/agent/validate-task-record.mjs` — used by CI; validates that task
  record exists for PR branch, all metadata fields filled, valid enums.

Phase 2 does NOT include:
- CRM `/admin/dev-team` dashboard (Phase 3)
- Make scenarios (daily triage, learning loop, weekly digest, review reminder, backpressure) — Phase 3
- Anthropic API key + Make secret store wiring — Phase 3 prerequisite
- First real autonomous agent run — separate task post-Phase-2 merge
- **Owner:** Sebastián Fridrich
- **Code:** docs/agents/roles/security-engineer.md (new), docs/agents/roles/qa-engineer.md (new), docs/agents/roles/docs-guardian.md (new), .github/workflows/agent-pr-validation.yml (new), scripts/agent/triage.mjs (new), scripts/agent/validate-task-record.mjs (new), scripts/docs/build-task-registry.mjs (modified)
- **Docs:** docs/30-task-records/AGENT-TEAM-PHASE-2.md, docs/agents/roles/security-engineer.md, docs/agents/roles/qa-engineer.md, docs/agents/roles/docs-guardian.md, docs/11-change-log.md, docs/29-task-registry.md

### [B/AGENT-TEAM-PHASE-3-PREREQUISITES] Phase 3 prerequisites — Make blueprints + IMPORT-GUIDE + autonomous setup actions — CODE-COMPLETE
- **Scope:** Autonomous setup of Phase 3 prerequisites per admin prompt. Sebastián
explicitly requested "udělej co nejvíc autonomně, ptej se JEN když nejde
jinak". This task records what was done autonomously vs deferred to manual
Sebastián steps.

**Done autonomously:**
- Merge of PR #89 (Phase 2) via `gh pr merge 89 --squash --delete-branch --admin`
- GitHub branch protection PATCH: required_status_checks contexts now
  `["docs-governance", "validate-agent-pr"]` (strict=true)
- Vercel CLI install (`npm install -g vercel`) + login (browser device flow)
- Vercel project re-link from auto-created orphan `crm-frontend` to actual
  pilot project `autosmartweby`
- Vercel env: `OWNER_EMAIL=s.fridrich@autosmartweb.cz` added to production
  + development on `autosmartweby` project (preview blocked — see Known Limits)
- 5 Make scenario blueprint JSON files (`docs/agents/make/0{1,2,3,4,5}-*.json`)
- `docs/agents/make/IMPORT-GUIDE.md` (~250 LOC step-by-step manual setup guide)
- `docs/agents/SETUP-CHECKLIST.md` updated with auto-setup status
- `docs/agents/QUESTIONS-FOR-HUMAN.md` populated with 3 entries (QFH-0001..0003)

**Deferred to Sebastián manual** (documented in QFH + SETUP-CHECKLIST):
- Anthropic API key creation (`/tmp/anthropic-key-instructions.md`) — requires
  browser session at console.anthropic.com
- Make plan upgrade Free → Core ($9/měs) — billing decision
- Make scenarios import (5 blueprints) — Make API doesn't support auto-import,
  must be UI-driven
- ntfy topic creation — privacy decision (topic name leaks = anyone subscribes)
- GitHub webhook configuration for learning loop — depends on Make webhook URL
  (created post-import)
- Vercel preview env OWNER_EMAIL — blocked by missing Git repo connection
  to Vercel project (open in QFH-0002)
- Cleanup orphan `crm-frontend` Vercel project (open in QFH-0003)
- **Owner:** Claude Code (Sonnet 4.6, autonomous admin run)
- **Code:** docs/agents/make/01-daily-triage.json (new), docs/agents/make/02-pr-review-reminder.json (new), docs/agents/make/03-learning-loop.json (new), docs/agents/make/04-backpressure-check.json (new), docs/agents/make/05-weekly-digest.json (new), docs/agents/make/IMPORT-GUIDE.md (new), docs/agents/SETUP-CHECKLIST.md (modified), docs/agents/QUESTIONS-FOR-HUMAN.md (modified), crm-frontend/.gitignore (modified)
- **Docs:** docs/30-task-records/AGENT-TEAM-PHASE-3-PREREQUISITES.md, docs/agents/SETUP-CHECKLIST.md, docs/agents/QUESTIONS-FOR-HUMAN.md, docs/11-change-log.md, docs/29-task-registry.md

### [B/audit-reconciliation-2026-04] Audit reconciliation pass — verify all FINDINGS against current code — CODE-COMPLETE
- **Scope:** PR #83 revealed audit drift (SEC-016 marked Open but actually fixed in `24e3d65`).
This pass systematically verifies every Open finding in `docs/audits/FINDINGS.md`
against current main HEAD and updates the Status column accordingly.

**Repo-only verification.** No code change. No fixes during the pass — every
finding either flips to `**Resolved** in <commit>` (with verification timestamp),
moves to `**In Progress**` (partially addressed), or stays Open. Findings whose
evidence requires Vercel/GitHub/external system inspection are flagged for
operator action.

CC-* persona findings (CC-NB, CC-OPS, CC-SEC, CC-QA) were not re-verified per
spec scope — most need manual operator review.
- **Owner:** Stream B
- **Code:** docs/audits/FINDINGS.md (modified), docs/audits/12-summary.md (modified)
- **Docs:** docs/30-task-records/audit-reconciliation-2026-04.md, docs/audits/FINDINGS.md, docs/audits/12-summary.md, docs/11-change-log.md, docs/29-task-registry.md

### [B/cleanup-and-sec-016] Cleanup junk files + audit-doc reconciliation for SEC-016 (already fixed in `24e3d65`) — CODE-COMPLETE
- **Scope:** Two unrelated cleanups bundled per the spec:

**Part 1 — Junk file cleanup.** Repo accumulated 9 stray 0-byte files
from broken codegen (shell redirect typos like `> 0)` instead of
`> "0)"`). Per audit finding M-1. All untracked, none load-bearing.

**Part 2 — SEC-016 NEXTAUTH_SECRET fail-fast.** The spec instructed
me to implement this fix (audit's #1 P1 blocker per `12-summary.md`).
On exploration I discovered **the fix already shipped in commit
`24e3d65`** ("fix(pilot): NEXTAUTH_SECRET fail-fast (KROK 3, SEC-016)"):
- `crm-frontend/src/lib/auth/session-secret.ts` exists. Validates
  min 32 chars, throws on missing/short with a clear remediation
  message.
- `SESSION_SECRET` is exported as a module-level const, so the throw
  fires at app init — not lazily on first auth request.
- Three callsites already import it: `middleware.ts`,
  `app/api/auth/me/route.ts`, `app/api/auth/login/route.ts`. No
  remaining `process.env.NEXTAUTH_SECRET || ''` fallback in the repo.

The audit docs (`docs/audits/FINDINGS.md`, `docs/audits/12-summary.md`)
were stale — still listed SEC-016 as Open and as the #1 P1 blocker.
This task reconciles the audit with reality so future readers don't
chase a fixed problem. The status column now shows **Resolved** with
the commit reference. The summary's P1 ranking, Wave 0 plan, and
attacker-persona table all annotate SEC-016 as ✅ closed.

Manual fail-fast verification was performed end-to-end (logic test
6/6, build with `NEXTAUTH_SECRET=` fails loud, build with valid 48-char
secret succeeds in 28.9 s) — concrete proof that the existing fix
works in practice, not just by code inspection. The verification date
is captured in the FINDINGS.md status note.

**No code change.** This PR is exclusively cleanup + docs reconciliation.
- **Owner:** Stream B
- **Code:** `0)`, `1)`, `5`, `crm-frontend/100)`, `crm-frontend/500)`, `crm-frontend/void`, `limit)`, `maxVersion)`, ``setupPreviewExtension` `` (deleted), docs/audits/FINDINGS.md (modified), docs/audits/12-summary.md (modified)
- **Docs:** docs/30-task-records/cleanup-and-sec-016.md, docs/audits/FINDINGS.md, docs/audits/12-summary.md, docs/11-change-log.md, docs/29-task-registry.md

### [B/email-cleanup-eliminate-legacy] Eliminate all 4 legacy assignee email forms — canonical-only state — CODE-COMPLETE
- **Scope:** Project had 4 legacy assignee email forms scattered across code, config, and
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
- **Owner:** Stream B
- **Code:** apps-script/Config.gs (modified), apps-script/EmailTemplateStore.gs (modified), apps-script/Menu.gs (modified), crm-frontend/src/lib/config.ts (modified), crm-frontend/src/components/leads/lead-detail-drawer.tsx (modified), scripts/test-email-cleanup.mjs (new)
- **Docs:** README.md, docs/22-technical-architecture.md, docs/PHASE2-RECON.md, docs/PILOT-SMOKE-TEST.md, docs/PILOT-OPERATIONS.md, docs/PILOT-INCIDENT-RESPONSE.md, docs/PILOT-ENV-VARS.md, docs/30-task-records/B-13.md, docs/30-task-records/B-11.md, docs/30-task-records/email-cleanup-eliminate-legacy.md, docs/11-change-log.md, docs/29-task-registry.md

### [B/redesign-lead-detail-modal] Redesign LeadDetailDrawer — side drawer → centered glass modal — CODE-COMPLETE
- **Scope:** Operator UX request: the right-side `Sheet` drawer (max-w 520px) felt
cramped when working with email drafts and lead-edit forms. Redesign as
a centered modal at ~80% viewport with glass effect (backdrop-blur,
semi-transparent), 2-column layout for the dense top-row sections,
sticky footer with primary actions always visible, and an unsaved-
changes guard on close.

**Operator-locked decisions** preserved as-is:
1. Layout: large centered modal, ~80% viewport, all content together
   with internal scroll (NOT tabs, NOT wizard).
2. Close behavior: confirmation prompt when closing iff form is dirty
   OR email draft modified from baseline; if clean, close silently.
3. Visual style: glass effect via `backdrop-blur-xl` + semi-transparent
   `bg-background/85` + soft shadow + rounded corners.

The component name (`LeadDetailDrawer`) and filename
(`crm-frontend/src/components/leads/lead-detail-drawer.tsx`) are
preserved to avoid breaking imports across leads page, dashboard,
pipeline, and follow-ups widgets.

Layout was approved by operator before implementation per
mid-task check-in (one addition: AssigneeBadge added in header
left of PriorityBadge).
- **Owner:** Stream B
- **Code:** crm-frontend/src/components/leads/lead-detail-drawer.tsx (rewritten)
- **Docs:** docs/30-task-records/redesign-lead-detail-modal.md, docs/11-change-log.md, docs/29-task-registry.md

### [B/visual-restyle-dark-futuristic-pr1] Visual restyle — dark futuristic premium SaaS look (PR 1 of 2) — CODE-COMPLETE
- **Scope:** Operator UX request: re-skin the CRM as premium AI-native dark SaaS
(navy-black background, cyan/violet glow accents, glass cards, breathing
room). PR 1 of 2 — global tokens + sidebar + app shell + component-level
class swaps. PR 2 (after operator review) will polish specific spots.

**Pure visual restyle.** No structural changes, no new components, no new
features, no removed components, no changed routes, no changed component
logic, no new dependencies. Every page, navigation entry, button, table,
form, and route works exactly as before — just looks different.

Mid-task layout was approved by operator (sidebar at 288 px confirmed)
before second-half sweep per spec ("DO NOT skip this check").
- **Owner:** Stream B
- **Code:** crm-frontend/src/app/globals.css (rewritten), crm-frontend/src/app/layout.tsx (modified), crm-frontend/src/components/layout/app-shell.tsx (modified), crm-frontend/src/components/layout/sidebar.tsx (rewritten), crm-frontend/src/components/layout/header.tsx (modified), crm-frontend/src/components/dashboard/stat-card.tsx (modified), crm-frontend/src/components/pipeline/kanban-column.tsx (modified), crm-frontend/src/components/pipeline/kanban-board.tsx (modified), crm-frontend/src/app/follow-ups/page.tsx (modified), crm-frontend/src/app/pipeline/page.tsx (modified), crm-frontend/src/components/leads/status-badge.tsx (modified), crm-frontend/src/components/leads/priority-badge.tsx (modified)
- **Docs:** docs/30-task-records/visual-restyle-dark-futuristic-pr1.md, docs/11-change-log.md, docs/29-task-registry.md

## 2026-04-28

### [A/A-11-followup-rate-limit] Rate limit on scrape job dispatch — hourly per-user + daily global caps — CODE-COMPLETE
- **Scope:** A-11 (PR #76) shipped `/api/scrape/trigger` and `recordScrapeJob_` with
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
- **Owner:** Stream A
- **Code:** apps-script/Config.gs (modified), apps-script/ScrapeHistoryStore.gs (modified), apps-script/WebAppEndpoint.gs (modified), crm-frontend/src/types/scrape.ts (modified), crm-frontend/src/lib/google/apps-script-writer.ts (modified), crm-frontend/src/app/api/scrape/trigger/route.ts (modified), crm-frontend/src/components/scrape/scrape-form.tsx (modified), scripts/test-rate-limit.mjs (new)
- **Docs:** docs/30-task-records/A-11-followup-rate-limit.md, docs/11-change-log.md, docs/29-task-registry.md

### [A/A-11-followup-resolve-review-idempotence] handleResolveReview_ idempotence guard — block double-submit before LEADS duplication — CODE-COMPLETE
- **Scope:** A-11 (PR #76) shipped the `/scrape/review` queue and the
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
- **Owner:** Stream A
- **Code:** apps-script/WebAppEndpoint.gs (modified), crm-frontend/src/types/scrape.ts (modified), crm-frontend/src/lib/google/apps-script-writer.ts (modified), crm-frontend/src/app/api/scrape/review/[id]/resolve/route.ts (modified), crm-frontend/src/components/scrape/dedupe-review-dialog.tsx (modified), crm-frontend/src/app/scrape/review/page.tsx (modified), scripts/test-resolve-review-idempotence.mjs (new)
- **Docs:** docs/30-task-records/A-11-followup-resolve-review-idempotence.md, docs/11-change-log.md, docs/29-task-registry.md

### [A/A-11-followup-stale-job-reaper] Stale scrape job reaper — flip stuck pending/dispatched jobs to failed — CODE-COMPLETE
- **Scope:** A-11 (PR #76) shipped the scraping pipeline; first successful production run on
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
- **Owner:** Stream A
- **Code:** apps-script/Config.gs (modified), apps-script/ScrapeHistoryStore.gs (modified), apps-script/PreviewPipeline.gs (modified), apps-script/Menu.gs (modified), scripts/test-stale-job-reaper.mjs (new)
- **Docs:** docs/30-task-records/A-11-followup-stale-job-reaper.md, docs/11-change-log.md, docs/29-task-registry.md

### [A/A-11] Frontend scraping trigger + history + cross-portal dedupe + side-by-side review UI — CODE-COMPLETE
- **Scope:** Connects the existing-but-dormant A-04 scraper pipeline (firmy.cz Node.js scraper +
A-02 _raw_import staging + A-03 normalizer + A-05 dedupe + A-10 batch orchestrator)
to a CRM frontend UI. Operator can dispatch scrape jobs from `/scrape` page, sees
duplicate-query alert before re-running the same search, and resolves cross-portal
dedupe candidates via side-by-side comparison in `/scrape/review`.

Cross-portal dedupe extension (Stream A primary value): existing dedupe matched on
IČO + website domain + email domain + name+city. New layer adds **phone exact match**
and **owned-domain email exact match** as primary signals — catches cases where the
same firm appears on different portals under slightly different names with
identical contact info.

Multi-portal extensibility designed in: portal name flows through types → trigger
payload → AS validation → GH workflow input → scraper CLI dispatch. Adding
`zivefirmy.cz` etc. requires only:
1. Append to `SUPPORTED_SCRAPE_PORTALS` (Config.gs + types/scrape.ts)
2. Add parser in `scripts/scraper/lib/{portal}-parser.mjs`
3. Add portal case in `scripts/scraper/{name}.mjs` dispatch (or unify into single `scraper.mjs`)

Auto-import: NEW_LEAD → LEADS, HARD_DUP → skip with log, SOFT/REVIEW → held in
`_raw_import` for operator review queue. Operator decides per-row: skip / merge
(fill-only-empty fields) / import-as-new (with explicit confirm).
- **Owner:** Stream A
- **Code:** apps-script/Helpers.gs (modified), apps-script/Config.gs (modified), apps-script/ScrapeHistoryStore.gs (new), apps-script/DedupeEngine.gs (modified), apps-script/WebAppEndpoint.gs (modified), apps-script/Menu.gs (modified), crm-frontend/src/types/scrape.ts (new), crm-frontend/src/lib/google/apps-script-writer.ts (modified), crm-frontend/src/app/api/scrape/trigger/route.ts (new), crm-frontend/src/app/api/scrape/history/route.ts (new), crm-frontend/src/app/api/scrape/review/route.ts (new), crm-frontend/src/app/api/scrape/review/[id]/resolve/route.ts (new), crm-frontend/src/components/scrape/scrape-form.tsx (new), crm-frontend/src/components/scrape/scrape-duplicate-modal.tsx (new), crm-frontend/src/components/scrape/scrape-history-table.tsx (new), crm-frontend/src/components/scrape/dedupe-review-dialog.tsx (new), crm-frontend/src/app/scrape/page.tsx (new), crm-frontend/src/app/scrape/review/page.tsx (new), crm-frontend/src/components/layout/sidebar.tsx (modified), .github/workflows/scrape.yml (new)
- **Docs:** docs/30-task-records/A-11.md, docs/11-change-log.md, docs/29-task-registry.md

### [B/B-13] Email template schema + CRUD + runtime wiring + bootstrap + backend + API layer + UI listing + editor + consumer integration + analytics dashboard + testing layer (T1-T9 + T11 + T12 of 13-task email templating + analytics project; T10 deferred to backlog) — READY_FOR_DEPLOY
- **Scope:** Foundation pro multi-task projekt: nahradit hardcoded `composeDraft_` editovatelnym template systemem s versioning + analytikou per template+segment.

T1 je jen schema migration — zadna business logika, zadne doPost akce, zadny frontend. To prijde v T2-T13.

Co T1 dodava:
- Novy hidden sheet `_email_templates` (16 sloupcu) s 5 placeholder radky pro default template keys: `no-website`, `weak-website`, `has-website`, `follow-up-1`, `follow-up-2` (status='empty', version=0).
- 4 nove `EXTENSION_COLUMNS` v LEADS pro per-lead template tracking: `email_template_key`, `email_template_version`, `email_template_id`, `email_segment_at_send`.
- Idempotentni setup funkce `setupEmailTemplates()` volana z menu — wrapper, ktery (1) zavola `setupPreviewExtension` aby pribyly 4 LEADS sloupce, (2) zavola `ensureEmailTemplatesSheet_` pro vytvoreni hidden listu, (3) zavola `bootstrapEmptyTemplates_` pro nasem 5 placeholder radku.

T1 NEMENI `composeDraft_`, `buildEmailDrafts`, `OutboundEmail.gs`, `WebAppEndpoint.gs`, `PreviewStore.gs` ani frontend. Po clasp push + spusteni `setupEmailTemplates` v editoru je sheet pripraveny pro CRUD operace v T2.

**T2 update (commit pridany ve stejnem PR):** CRUD vrstva nad `_email_templates` sheetem. 10 novych funkci v `EmailTemplateStore.gs` (file: 195 -> 585 radku). Drafts + Publish flow:
- `saveTemplateDraft_(key, subject, body, name, description)` — upsert draft (1-per-key invariant, overwrite-on-update, parent_template_id zachycen z aktualniho active).
- `publishTemplate_(key, commitMessage)` — promotuje draft na novy active (povinny commit message ≥ 5 znaku, blokuje publish prazdneho subject/body, archivuje predchozi active, maze empty placeholder, version+1).
- `discardTemplateDraft_(key)` — smaze draft row (no-op kdyz neexistuje).
- Read API: `loadActiveTemplate_`, `getTemplateDraft_`, `listAllTemplates_`, `listTemplateHistory_`.
- Helpers: `buildTemplateRowMap_`, `rowToTemplate_`, `extractPlaceholders_`.
- Mutace chranene `LockService.getScriptLock()` (5s timeout, try/finally release).
- Zadny in-memory cache — vse ze Sheet.

T2 stale NEMENI `composeDraft_`, `WebAppEndpoint.gs` ani frontend — to je T3 a T5.

**T3 update (commit pridany ve stejnem PR):** runtime wiring. `composeDraft_` v `PreviewPipeline.gs` ted dispatchuje pres template store. 3 nove funkce v `EmailTemplateStore.gs`:
- `renderTemplate_(template, leadData)` — placeholder substitution `{name}` → value, unknown → empty, case-insensitive. Computed convenience tokens: `{greeting}` (`Dobrý den[, jméno]`), `{firm_ref}` (`{business_name}` nebo `vaši firmu`), `{contact_name_comma}` (`, {contact_name}` nebo `''`).
- `buildPlaceholderValues_(ld)` — interni helper, mapuje rd na placeholder dict. Skupiny: LEAD (business_name, contact_name, city, area, service_type, segment, pain_point), PREVIEW (preview_url), SENDER (sender_name, sender_email), COMPUTED (greeting, firm_ref, contact_name_comma).
- `chooseEmailTemplate_(rd)` — auto-route via `resolveWebsiteState_`: NO_WEBSITE → `no-website`, WEAK_WEBSITE → `weak-website`, HAS_WEBSITE → `has-website`. CONFLICT/UNKNOWN/jakekoliv jine → `no-website` (safest default). Nikdy nethrowuje.

`composeDraft_(rd)` v `PreviewPipeline.gs`:
- Stary kod prejmenovan na `composeDraftFallback_` (pure rename, telo nezmeneno).
- Novy `composeDraft_` (~73 radku) volá `chooseEmailTemplate_` → `loadActiveTemplate_` → `renderTemplate_` v try/catch. Pri chybe (vc. `No active template for key:`) fallback na `composeDraftFallback_` + `aswLog INFO`.
- Vraci 6-field shape `{subject, body, template_key, template_version, template_id, segment_at_send}`. Pri fallback path jsou template_*  prazdne (analytics oznaci jako "untemplated").
- Sender identity resolvovana inline z `rd.assignee_email` přes `ASSIGNEE_NAMES` map (s defensive `typeof !== 'undefined'` checky pro test contexty), fallback na `DEFAULT_REPLY_TO_*`.

Caller capture pattern (4× `hr.colOrNull` + `hr.set`) zaveden ve vsech 4 LEADS write-back cestach: `buildEmailDrafts`, `processPreviewQueue` (via `artifacts.draft`), `refreshProcessedPreviewCopy`, `processPreviewForLead_` (writes[] array). Spec zminila jen prvni dva, ale ostatni dva jsou stejnou code-path (composeDraft + LEADS row write), takze stejny princip aplikovan vsude pro consistency v analytics.

T3 NEMENI Config.gs, Menu.gs, OutboundEmail.gs, WebAppEndpoint.gs, frontend. Bez `_email_templates` content (T4 ho bootstrapuje) vsechny drafty jdou pres fallback path — ZADNY behavioural change v pilot az do T4.

**T3.5+T4 update (commits ve stejnem PR):** dokoncena cesta od schematu k publikovane prvni sablone.

T3.5 race fix:
- `composeDraft_` v `computePreviewArtifacts_` se volal PRED tim, nez byl `preview_url` v `rd`. `{preview_url}` placeholder by tedy renderoval prazdne.
- Fix: `computePreviewArtifacts_` nyni resolvuje `previewUrl = resolvePreviewUrl_(slug, false)` a in-place zapise do `rd.preview_url` pred `composeDraft_(rd)`. Guarded `if (!rd.preview_url)` aby se neclobberovaly existujici hodnoty.
- Ostatni 2 LEADS-side call sites (`buildEmailDrafts:712`, `refreshProcessedPreviewCopy:1398`) cetly `hr.row(row)` ktery uz obsahuje LEADS row data vc. preview_url, takze tam fix neni potreba.

T4a — assignee profile extension + legacy migration:
- `ASSIGNEE_NAMES` zmena ze stareho `email→name` literal mapy na IIFE-derived map z noveho `ASSIGNEE_PROFILES`. Domena konsolidovana na `autosmartweb.cz`: 4 stare emaily (`<legacy>`, `<legacy>`, `<legacy>`, `<legacy>`) → 3 nove (`s.fridrich@autosmartweb.cz`, `t.maixner@autosmartweb.cz`, `j.bezemek@autosmartweb.cz`).
- `ASSIGNEE_PROFILES` ma `{name, role, phone, email_display, web}` per assignee. `DEFAULT_ASSIGNEE_PROFILE` pro empty/unknown fallback.
- `getAssigneeProfile_(email)` always returns valid profile object.
- `LEGACY_ASSIGNEE_EMAIL_MAP` map starych klicu na nove + `migrateLegacyAssigneeEmails_` funkce: scanuje LEADS `assignee_email` column, rewritne legacy keys, prazdne cells nikdy nemodifikuje, LockService 10s, vraci pocet upravenych radku.
- `composeDraft_` v `PreviewPipeline.gs` swap z inline `ASSIGNEE_NAMES[email]` na `getAssigneeProfile_`. Augmented objekt nese kompletni sender block (`sender_name`, `sender_role`, `sender_phone`, `sender_email`, `sender_email_display`, `sender_web`).
- `buildPlaceholderValues_` rozsireno z 13 na 18 placeholders: pridany sender_role/phone/email_display/web + `service_type_humanized` (defensive `typeof humanizeServiceType_ === 'function'` guard, try/catch fallback na raw service_type).

T4b — first published template:
- `bootstrapNoWebsiteV1()`: idempotentni publish prvni `no-website` v1 sablony s aprovovanym textem (Phase 2 launch v1.0). Subject: `Dotaz k vašemu webu {business_name}`. Body obsahuje `{service_type_humanized}` / `{city}` / `{preview_url}` / signaturu se sender_*.
- `migrateAndBootstrap`: convenience wrapper migrace → `setupEmailTemplates` → `bootstrapNoWebsiteV1`. Single-click cutover z menu.

Po spusteni `migrateAndBootstrap` v Apps Script editoru:
- 3 rows v TEST sheetu maji `<legacy>` -> remapnuto na `t.maixner@autosmartweb.cz` (per-mapping count: 3).
- `_email_templates` rozšireno o 4 LEADS sloupce (idempotent, run #2 bude no-op).
- `no-website` v1 publikovana s template_id `ASW-TPL-...`, status='active'. Empty placeholder `no-website` row smazana per `publishTemplate_` step 4.
- Od te chvile `composeDraft_` pro NO_WEBSITE leady prestane padat do fallbacku → vsechny novy drafty jsou template-rendered + maji `email_template_*` metadata.

T4 NEMENI `OutboundEmail.gs:resolveSenderIdentity_` (per spec). `DEFAULT_REPLY_TO_*` zustavaji na legacy `<legacy>` — viz Known Limits. (Note 2026-04-29: `DEFAULT_REPLY_TO_EMAIL` flipped na `s.fridrich@autosmartweb.cz` v rámci email-cleanup-eliminate-legacy task.)

**T5 update (commit ve stejnem PR):** backend doPost endpoints + live analytics aggregation. ZADNY behavioural change v existujicim flow — pure additive surface area pro frontend (T6+).

3 nove funkce v `EmailTemplateStore.gs`:
- `getTemplateAnalytics_()` — single-pass LEADS scan, groupuje podle `(template_key, version)` + per-segment breakdown. Counts: `sent` (rows kde `email_sync_status` ∈ {SENT, REPLIED, LINKED} a non-empty `email_template_id` — fallback drafts excluded), `replied` (subset s `email_reply_type === 'REPLY'`), `won` (subset s `status === 'WON'`). Vraci aktivni-template zero-state entries i kdyz 0 sends, aby UI ukazalo 0/0/0 misto skryti. Stable sort: key ASC, version DESC. Range fetch optimalizovan na min/max needed columns (~50ms / 800 rows ocekavano).
- `_emptyAnalyticsForAllActiveTemplates_()` — interni helper pro pre-migration pripad.
- `regenerateDraftForLead_(leadId, templateKeyOverride)` — LockService 5s, lookup row pres existing `findRowByLeadId_`, primy `getRange()` row read (`readSingleRow_` neexistuje v codebase), spusti `composeDraft_(rd)`, zapise 6 cells. Required cells (`email_subject_draft`, `email_body_draft`) pres `hr.col` (throws on missing), metadata cells pres `hr.colOrNull` guard. `templateKeyOverride` param prijima ale ignoruje — placeholder pro T9 manual override path (vyzaduje composeDraft_ refactor s template injection).

9 novych doPost handlers v `WebAppEndpoint.gs`:
- Read: `listTemplates`, `getTemplate`, `getTemplateDraft`, `getTemplateHistory` (vsechny strip `_rowNum` z return objektu).
- Write: `saveTemplateDraft` (subject ≤ 500, body ≤ 50000 chars validation, returns `subject_too_long` / `body_too_long`), `discardTemplateDraft`, `publishTemplate` (mapuje 3 publish-gate failures: `commit_message_too_short`, `no_draft`, `empty_draft_content` — frontend mapuje na localized cz hlasky).
- Analytics: `getTemplateAnalytics`.
- Operator: `regenerateDraft` (T9 dependency — frontend zatim posila `templateKey` ale handler ho ignoruje az do T9 wiring).

`{ ok: true/false, error: '<reason>' }` shape matches Phase 2 KROK 4-6 (`getPreview`, `sendEmail`, `generatePreview`). Token verification handled upstream v `doPost` `FRONTEND_API_SECRET` check — handlers don't repeat. Existing 5 actions (`updateLead`, `assignLead`, `getPreview`, `generatePreview`, `sendEmail`) untouched.

T5 NEMENI Config.gs, Menu.gs, PreviewPipeline.gs, OutboundEmail.gs, frontend.

**T6 update (commit ve stejnem PR):** Next.js API layer + writer wrappers. Pure proxy vrstva — zadna business logika, jen request validation, AS dispatch, error mapping. Po T6 mohou frontend pages (T7-T11) volat tyto routy primo bez znalosti AS payload shape.

Novy soubor `crm-frontend/src/types/templates.ts`:
- 4 main interfaces: `EmailTemplate` (16 fields mirror AS sheet schema), `TemplateAnalyticsTotals`, `TemplateAnalyticsEntry`, `RegenerateDraftResult`.
- `TemplateStatus` union type.
- `DEFAULT_TEMPLATE_KEYS` const tuple — sync s `EMAIL_TEMPLATE_DEFAULT_KEYS` v `apps-script/Config.gs`.
- `TEMPLATE_KEY_LABELS` map ('Bez webu', 'Slabý web', 'Má web', 'Follow-up 1/2') pro UI fallback display jmena kdyz template je empty.

`crm-frontend/src/lib/google/apps-script-writer.ts` (+317 radku):
- 9 new exported async wrappers s Result interfaces — same pattern jako existing `generatePreview` / `sendEmail`: `SHEET_CONFIG.APPS_SCRIPT_URL` POST s `process.env.APPS_SCRIPT_SECRET` token, AS `{ ok }` response shape mapped to `{ success }`.
- Existujici wrappers (`updateLeadFields`, `generatePreview`, `sendEmail`) untouched.

7 new Next.js API routes (vsechny pouzivaji Next 16 async `params: Promise<...>` pattern dle docs in `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/dynamic-routes.md`):

| Route | Methods | Notes |
|-------|---------|-------|
| `/api/templates` | GET | List all templates. 502 on AS upstream failure. |
| `/api/templates/[key]` | GET | Active template. 404 on `no_active_template`. |
| `/api/templates/[key]/draft` | GET / PUT / DELETE | Per-key draft CRUD. PUT validates `subject ≤ 500`, `body ≤ 50000`. |
| `/api/templates/[key]/history` | GET | All versions for key. |
| `/api/templates/[key]/publish` | POST | Body `{ commitMessage }`. Front-loads `commit_message_too_short` validation. AS publish-gate failures (`no_draft`, `empty_draft_content`) → 400. |
| `/api/analytics/templates` | GET | Live aggregation per (key, version) + by_segment. |
| `/api/leads/[id]/regenerate-draft` | POST | Optional `{ templateKey }` (T9 placeholder). 404 on `lead_not_found`. |

Error mapping konvence: 400 = validation (chybi key, JSON parse fail, length over limit), 404 = not found (`no_active_template`, `lead_not_found`), 502 = AS upstream `{ ok: false }`, 500 = unexpected catch.

T6 NEMENI Apps Script files, frontend pages, ostatni komponenty.

**T7 update (commit ve stejnem PR):** prvni UI stranka — landing pro spravu sablon. URL `/settings/templates`. Listing only — editor je T8.

Novy soubor `crm-frontend/src/app/settings/page.tsx` (server component, prerendered):
- Top-level `/settings` landing s 2 cards: "Šablony emailů" -> `/settings/templates`, "Analýza šablon" -> `/analytics/templates`.
- Lucide icons (Mail, BarChart3). `metadata.title` set.

Novy soubor `crm-frontend/src/app/settings/templates/page.tsx` (client component):
- Fetch z `/api/templates` v `useEffect`. Loading state -> `TemplatesPageSkeleton`. Error state -> destruktivni rounded box s "Zkusit znovu" retry tlacitkem + `sonner` toast.
- `groupByKey` helper — buckets pres `template_key` na `{ active, draft, empty }`. Filtruje `archived` (patri do history view T8).
- Pre-bootstrap state: pred prvnim spustenim `bootstrapEmptyTemplates_` `/api/templates` muze vratit `[]`. Page presto renderuje 5 placeholder cards (po jedne za kazdy klic v `DEFAULT_TEMPLATE_KEYS`) se statusom `empty`. Klik vede na `/settings/templates/[key]` (T8 — zatim 404).
- Stable sort: `DEFAULT_TEMPLATE_KEYS` order first (no-website, weak-website, has-website, follow-up-1, follow-up-2), pak custom keys alphabetical.

Novy soubor `crm-frontend/src/components/templates/template-card.tsx`:
- `StatusBadge` 3 variants: active (green pill `aktivní · v{n}`), draft (amber pill s ✎ icon), empty (gray pill s outline circle). Archived varianta neni — archivovane verze se v listingu nezobrazuji.
- Shows `name` v uvozovkach kdyz active. Italic "— připraveno k vytvoření —" kdyz empty.
- "Rozpracovaná verze" amber pill below name kdyz oba `active` + `draft` existuji (operator je v polovine editovani v2).
- Activated_at byline format: "{authorShort}, {day}. {month}." (e.g. `s.fridrich, 28. 4.`).
- CTA: "Upravit" (kdyz je active) nebo "Vytvořit" (kdyz empty/no active), oba s ArrowRight icon ktery se posune na hover.

Novy soubor `crm-frontend/src/components/templates/templates-page-skeleton.tsx`:
- 5 skeleton cards mimicking actual layout (used existing `<Skeleton>` shadcn primitive z `src/components/ui/skeleton.tsx`).

`crm-frontend/src/components/layout/sidebar.tsx` modified (+2 radky): pridana navigation entry "Nastavení" -> `/settings` (Settings lucide icon) na konec `navigation` array. Nav infrastruktura uz existuje — pridani je trivial.

T7 NEMENI: API routes (T6), apps-script-writer (T6), AS files, lead drawer, ostatni komponenty. Editor (T8 sub-task) zatim neni — klik na card v T7 vede na neexistujici cestu, planovane.

**T8 update (commit ve stejnem PR):** plne funkcni editor `/settings/templates/[key]`. Largest frontend task v projektu.

Novy klient renderer `crm-frontend/src/lib/templates/render-preview.ts`:
- Mirror of AS `EmailTemplateStore.gs:renderTemplate_` + `buildPlaceholderValues_`. Sync requirement — drift mezi tymto a AS = visible bug.
- 18 known placeholders (LEAD/PREVIEW/SENDER/COMPUTED). Unknown → renderuje prázdné, vrací jejich seznam pro warning UI.
- `humanizeServiceType` ma 12-entry Czech approximation map (instalatér → instalatérské služby etc.). Best-effort — AS-side puvodni `humanizeServiceType_` v `PreviewPipeline.gs` je canonical, frontend je informativni preview.

`SAMPLE_LEADS` fixture (`sample-leads.ts`): 3 leady s ruznymi profily (s/bez contact_name, s/bez area, s/bez pain_point) aby editor preview umel ukazat vsechny code paths. Sender block hard-coded na Sebastiana — T9 swap na real leads dropdown.

5 novych komponent v `crm-frontend/src/components/templates/`:

| Komponenta | Role |
|------------|------|
| `template-editor.tsx` | Hlavni client komponenta, ~280 LOC. Split-pane editor + preview, dirty tracking proti baseline snapshotu, beforeunload warning, paralelni fetch active+draft, AS error code → cz toast mapping. |
| `template-preview-pane.tsx` | Lead dropdown + email-style preview card (Komu/Předmět/Tělo). useMemo na render. |
| `placeholder-legend.tsx` | Collapsible panel s 18 placeholdery, click-to-copy `{name}`, warning ribbon kdyz template pouziva unknown tokens. |
| `publish-dialog.tsx` | shadcn Dialog s commit message Textarea (≥ 5 chars required), AS error code mapping, Loader2 spinner. |
| `history-drawer.tsx` | shadcn Sheet (right, max-w-xl) s GET `/api/templates/[key]/history`, expandable rows pro detail subject + body, status badges. Refactored na `useCallback`+`useEffect` pattern aby uspokojil React 19 lint rule (`react-you-might-not-need-an-effect`). |

Page route `crm-frontend/src/app/settings/templates/[key]/page.tsx` (server component, dynamic) — async params unwrap, `generateMetadata` for cz title, renders `<TemplateEditor>`.

User flow:
1. `/settings/templates` (T7) — operator klikne card -> `/settings/templates/no-website` (T8).
2. Editor nacita active + draft paralelne. Pokud draft existuje, zacina v editoru s draftem (rozpracovano), jinak s active content.
3. Operator edituje. `dirty` flag se vypocita realtime, "Neuložené změny" badge svítí, beforeunload guard aktivni.
4. "Uložit draft" -> PUT (`saveTemplateDraft_`). Baseline se posune na nove ulozeny stav.
5. "Zahodit změny" -> kdyz draft existuje, confirm() + DELETE (`discardTemplateDraft_`); jinak jen reset na active.
6. "Publikovat..." -> Dialog s commit message ≥ 5 chars -> POST (`publishTemplate_`). Po success: baseline reset na new active, draft cleared.
7. "Historie" -> Sheet s GET history. Expand row pro inline preview (read-only).

Live preview: na kazdou zmenu editoru se subject + body re-rendituji s vybranym sample leadem. PlaceholderLegend warning ukaze unknown tokens v real-time.

T8 NEMENI: API routes (T6), apps-script-writer (T6), AS files, lead drawer (T9 scope), listing page (T7).

**T9 update (commit ve stejnem PR):** consumer integration. Dva uplne separatni features ktere oba consumuji T6 endpoints — zadne nove API, zadne AS zmeny, pure UI work.

Feature 1 — lead drawer template selector + regenerate (`lead-detail-drawer.tsx`):
- Pridana sekce nad subject input: `<select>` s 6 options (auto-select default + 5 template keys: no-website, weak-website, has-website, follow-up-1, follow-up-2) + "Vygenerovat znovu" button.
- State seedovan z `data.emailTemplateKey` pri fetchLead — operator hned vidi ktera sablona byla pouzita pro current draft.
- Click "Vygenerovat znovu" -> POST `/api/leads/[id]/regenerate-draft` s `{ templateKey }`. Confirm dialog kdyz current draft neni prazdny (zabranuje accidental overwrite).
- Po success: drawer state refreshovan z response (subject/body/templateKey), success toast s template_key + version pokud bylo template-renderovano, "fallback text" toast pokud doslo k fallback path.
- Below selector: amber warning hláška kdyz draft existuje ale `templateKey === ''` (= fallback). Vizualni signal pro operatora ze tento draft NEPOUZIL T8 sablony.

Feature 2 — real leads in editor preview pane (`template-preview-pane.tsx`):
- On mount fetch `/api/leads`, mapuje pres novy `leadToSampleLead` helper (LeadListItem -> SampleLead shape).
- Filter: jen leady s `previewUrl` (jinak `{preview_url}` placeholder by renderoval prazdne, useless preview). Cap 10 entries.
- Dropdown rendering: `<optgroup>` "Reálné leady (qualified, s preview)" first, pak `<optgroup>` "— ukázková data —" se 3 sample leads jako fallback.
- Auto-select: pri prvním load po fetch, pokud current `selectedLeadId` patri sample leadu, prepne na first real lead (operator usually wants real data).
- Graceful fallback: pokud fetch selze nebo prázdne → zobrazi se jen sample leads, zadny error toast (silent).
- Cancellation flag v cleanup zabranuje setState po unmount.

Type infrastruktura — `emailTemplateKey: string` field threaded through 6 souboru:
- `lib/domain/lead.ts` — canonical Lead interface (mezi emailBodyDraft a emailSyncStatus)
- `lib/mappers/sheet-to-domain.ts` — map z `email_template_key` Sheets sloupce
- `lib/mock/leads-data.ts` — 12 mock entries s `emailTemplateKey: ''`
- `components/leads/lead-detail-drawer.tsx` — local Lead interface + state hydration

T9 NEMENI: AS files, API routes, apps-script-writer, T8 editor main shell, T7 listing.

**T11 update (commit ve stejnem PR):** analytics dashboard. Pure consumer UI nad `/api/analytics/templates` (T6). T10 — history view enhancements — preskocen, deferred do backlogu (current `HistoryDrawer` z T8 je dostatecny pro MVP).

5 novych souboru, 1 modifikovany:

| File | Role |
|------|------|
| `app/analytics/page.tsx` | `/analytics` landing (server, prerendered). 1 card → `/analytics/templates`. |
| `app/analytics/templates/page.tsx` | Main page (client). Fetch on mount + manual refresh button. Summary box (sent/replied/won across active templates). Card grid keyed by `template_key::template_version`. Zero-state link na settings. |
| `components/analytics/template-stats-card.tsx` | Card per template version. 3-column metrics. Reply rate `replied/sent`, win rate `won/replied` (stricter denominator). Expand "Per segment ({n})" → `SegmentBreakdown`. ExternalLink icon → editor. |
| `components/analytics/segment-breakdown.tsx` | Per-segment rows, sorted by sent desc. Each row: name + sent/replied/won counts + percentages. |
| `components/analytics/analytics-skeleton.tsx` | 3 skeleton cards mimicking TemplateStatsCard layout. |
| `components/layout/sidebar.tsx` | +1 nav item "Analýza" → `/analytics`, BarChart3 icon. |

UX decisions:
- Win rate denominator: `won / replied` (ne `won / sent`). Per spec — stricter, more meaningful pro sales konverzi (z odpovědí, kolik zavřených dealů). Sent → replied je separate funnel step.
- Summary box agreguje pouze `status === 'active'` templates. Archived versions ma kazdy svou kartu, ale neceleknuje se do rolling totals (jejich sent/replied/won ovlivňují historicke data, ne current performance).
- Card per VERSION (ne per key): pokud no-website ma v1 (archived) a v2 (active), uvidis 2 karty. Listing per key by zatemnoval performance srovnani mezi verzemi.
- Žádný cache — refresh button je explicit, fetch on mount. Backend AS-side `getTemplateAnalytics_` je single-pass LEADS scan (~50ms/800 rows), low cost.
- Zero-state na cards: kdyz `totals.sent === 0`, "Zatím žádné odeslané emaily s touto šablonou." (active template ale 0 sends — typicky just-published nebo bez fitting leadu).

T11 NEMENI: AS files, API routes, T7-T9 components.

**T12 update (commit ve stejnem PR):** testing layer. Tri vrstvy ochrany B-13 invariantu:

1. **Drift detection** (`scripts/tests/b13-render-drift.test.ts`) — frontend `renderPreview` MUSI rendrovat byte-identicky s AS `renderTemplate_`. Drift = klient dostane jiny email, nez obchodnik schvalil. Catastrophic UX bug. 14 assertions pinning expected outputs pro znamy fixtures (full no-website body, greeting variants, firm_ref fallback, unknown placeholders, service_type humanization, case-insensitive matching, preview_url + sender block).

2. **Routes smoke** (`scripts/tests/b13-routes-smoke.mjs`) — 7 assertions hitting kazdou novou T6 routu. Validuje response shape proti `types/templates.ts` kontraktu + znama error-code paths. Gracefully SKIP pokud `NEXT_TEST_URL` unset — local dev bez serveru je normalni.

3. **AS lifecycle** (`apps-script/tests/B13_template_lifecycle_test.gs`) — 8 manual-runner funkci pro lifecycle: setup idempotence, save/publish/archive cykly, commit message validace (< 5 chars block), empty draft block, render output, chooseTemplate auto-select pro 3 web stavy, fallback path. `B13_runAll` aggregator + `B13_cleanup_` pro `_test_b13_*` rows. Manual editor run before deploy; nepushne se na PROD (`.claspignore` excluduje `tests/**`).

`npm run test:b13` chainuje drift + smoke (drift fails CI hard, smoke skips graceful). AS lifecycle staying as editor-run only — Apps Script nelze rozumne integrovat do node-based test runneru bez clasp run, ktere je heavy + flaky.

T12 caught real bug on first drift run: pinned expected `v Praze` (Czech locative declension) ale neither AS nor frontend declines city names — raw `{city}` substituce produkuje `v Praha`. Demonstrace ze drift test funguje. Updated expected na realistic raw form. Documented in Decisions: kdyz se v budoucnu pridava city declension helper, MUSI byt pridan do obou rendereru zaroven, jinak T12 fails na CI.

T12 NEMENI: production AS code, production frontend code, existing B-stream tests.
- **Owner:** Stream B
- **Code:** apps-script/Config.gs (modified), apps-script/EmailTemplateStore.gs (new (T1)), apps-script/EmailTemplateStore.gs (modified (T2)), apps-script/EmailTemplateStore.gs (modified (T3)), apps-script/PreviewPipeline.gs (modified (T3)), apps-script/Config.gs (modified (T4)), apps-script/EmailTemplateStore.gs (modified (T4)), apps-script/PreviewPipeline.gs (modified (T3.5+T4)), apps-script/Menu.gs (modified (T4)), apps-script/EmailTemplateStore.gs (modified (T5)), apps-script/WebAppEndpoint.gs (modified (T5)), crm-frontend/src/types/templates.ts (new (T6)), crm-frontend/src/lib/google/apps-script-writer.ts (modified (T6)), crm-frontend/src/app/api/templates/route.ts (new (T6)), crm-frontend/src/app/api/templates/[key]/route.ts (new (T6)), crm-frontend/src/app/api/templates/[key]/draft/route.ts (new (T6)), crm-frontend/src/app/api/templates/[key]/history/route.ts (new (T6)), crm-frontend/src/app/api/templates/[key]/publish/route.ts (new (T6)), crm-frontend/src/app/api/analytics/templates/route.ts (new (T6)), crm-frontend/src/app/api/leads/[id]/regenerate-draft/route.ts (new (T6)), crm-frontend/src/app/settings/page.tsx (new (T7)), crm-frontend/src/app/settings/templates/page.tsx (new (T7)), crm-frontend/src/components/templates/template-card.tsx (new (T7)), crm-frontend/src/components/templates/templates-page-skeleton.tsx (new (T7)), crm-frontend/src/components/layout/sidebar.tsx (modified (T7)), crm-frontend/src/lib/templates/sample-leads.ts (new (T8)), crm-frontend/src/lib/templates/render-preview.ts (new (T8)), crm-frontend/src/components/templates/placeholder-legend.tsx (new (T8)), crm-frontend/src/components/templates/template-preview-pane.tsx (new (T8)), crm-frontend/src/components/templates/publish-dialog.tsx (new (T8)), crm-frontend/src/components/templates/history-drawer.tsx (new (T8)), crm-frontend/src/components/templates/template-editor.tsx (new (T8)), crm-frontend/src/app/settings/templates/[key]/page.tsx (new (T8)), crm-frontend/src/lib/domain/lead.ts (modified (T9)), crm-frontend/src/lib/mappers/sheet-to-domain.ts (modified (T9)), crm-frontend/src/lib/mock/leads-data.ts (modified (T9)), crm-frontend/src/lib/templates/sample-leads.ts (modified (T9)), crm-frontend/src/components/templates/template-preview-pane.tsx (modified (T9)), crm-frontend/src/components/leads/lead-detail-drawer.tsx (modified (T9)), crm-frontend/src/app/analytics/page.tsx (new (T11)), crm-frontend/src/app/analytics/templates/page.tsx (new (T11)), crm-frontend/src/components/analytics/template-stats-card.tsx (new (T11)), crm-frontend/src/components/analytics/segment-breakdown.tsx (new (T11)), crm-frontend/src/components/analytics/analytics-skeleton.tsx (new (T11)), crm-frontend/src/components/layout/sidebar.tsx (modified (T11)), scripts/tests/b13-render-drift.test.ts (new (T12)), scripts/tests/b13-routes-smoke.mjs (new (T12)), apps-script/tests/B13_template_lifecycle_test.gs (new (T12)), apps-script/.claspignore (new (T12)), package.json (modified (T12)), apps-script/Menu.gs (modified)
- **Docs:** docs/30-task-records/B-13.md, docs/11-change-log.md, docs/29-task-registry.md

## 2026-04-27

### [B/B-12] Phase 2 hotfix — brief phone/email aliases for marketing web compat — DONE
- **Scope:** Phase 2 launch hotfix po prvnim e2e produkcnim run (lead "ALVITO s.r.o. PLYNOSERVIS"). Marketing web `autosmartweb.cz/preview/<slug>` vracel **HTTP 500** na vsechny CRM-generovane preview slugs. Test slug `test-bauhaus-praha` fungoval (200) — mock data v `preview-reader.ts` mela spravne field names.

**Root cause — schema mismatch:**
- CRM Apps Script `buildPreviewBrief_` (`apps-script/PreviewPipeline.gs:634-653`) vracel brief s `contact_phone` + `contact_email` (legacy CRM frontend names).
- Marketing web `ClientBrief` interface (`Spookybro55/ASW-MARKETING-WEB:src/templates/core/types.ts`) vyžaduje `phone` + `email`.
- Render: `<EmergencyProfessional>` template volá `telHref(brief.phone)` v `Header`, `Hero`, `Services`, `Pricing`, `Locations`, `Contact`, `Footer`, `MobileStickyCta` — `brief.phone === undefined` → `undefined.replace(/\s/g, "")` → **TypeError** → SSR throw → 500.

Fix C (hybrid) — implementovan dual-side:
- **PR #73 (CRM Apps Script source-side):** `buildPreviewBrief_` přidá `phone:` a `email:` aliasy vedle existujicich `contact_phone:` a `contact_email:`. Newly-written `_previews` rows budou mit oba klice.
- **ASW-MARKETING-WEB#2 (read-time fallback, companion PR):** `preview-reader.ts:getPreviewBySlug` mapuje `rawBrief.contact_phone → brief.phone` (a email/website) pri čteni z Sheet. Existing rows zapsane pred B-12 (vc. ALVITO + 8 dalsich pilot leadů) renderuji okamzite po Vercel auto-deploy.
- **Owner:** Stream B
- **Code:** apps-script/PreviewPipeline.gs (modified)
- **Docs:** docs/30-task-records/B-12.md

## 2026-04-26

### [B/B-09] Phase 2 KROK 4 — manual "Vygenerovat preview" button v CRM — DONE
- **Scope:** Phase 2 KROK 4 doplnuje operatorske manualni vygenerovani preview pro 1 lead z CRM lead detail draweru. Flow: kliknuti "Vygenerovat preview" → frontend POST `/api/leads/[id]/generate-preview` → Apps Script doPost akce `generatePreview` → `processPreviewForLead_(leadId)` → `_previews` row + LEADS write-back → response s `previewUrl`. Frontend drawer ukaze "Preview hotov" + odkaz "Otevrit".

Reuse existujicich Phase 2 KROK 2 primitiv: `upsertPreviewRecord_` (Sheets-backed `_previews` storage), `buildPreviewBrief_` (18-pole brief). Refactor: extrakce `computePreviewArtifacts_(rd)` (pure helper sdileny `processPreviewQueue` + manual flow) a `persistPreviewArtifacts_(artifacts, leadId)` wrapper.

KROK 4 NEMENI B-04 webhook endpoint, NEMENI B-01 `PreviewBrief` shape, nemeni B-05 testy (regression PASS).
- **Owner:** Stream B
- **Code:** apps-script/PreviewPipeline.gs (modified), apps-script/WebAppEndpoint.gs (modified), crm-frontend/src/lib/google/apps-script-writer.ts (modified), crm-frontend/src/app/api/leads/[id]/generate-preview/route.ts (new), crm-frontend/src/lib/mock/mock-service.ts (modified), crm-frontend/src/components/leads/lead-detail-drawer.tsx (modified)
- **Docs:** docs/30-task-records/B-09.md

### [B/B-10] Phase 2 KROK 5 — auto trigger lands READY_FOR_REVIEW directly — DONE
- **Scope:** Phase 2 KROK 5 narovnava `processPreviewQueue` (15-min cron) tak, aby leady BEZ preview_slug skoncily end-to-end na `READY_FOR_REVIEW` v ramci jednoho run. Templaty jsou staticke na `autosmartweb.cz`, neexistuje runtime webhook → KROK 5 obchazi B-04 webhook block, zapisuje do `_previews` (Sheets-backed storage z KROK 2) + LEADS row a posuva preview_stage rovnou na READY_FOR_REVIEW.

Webhook code (B-05 cesta) zachovan s DEPRECATED bannerem — B-05 testy stale beze zmeny (42/42 PASS) protoze beziu izolovane unit-test mode.

Sjednoceni s KROK 4 (B-09): novy helper `resolvePreviewUrl_(slug, allowEmpty)` — single source of truth pro preview URL resolution (honors `PUBLIC_BASE_URL` Script Property pro staging override). Replace 3 inline duplicates v `persistPreviewArtifacts_`, `processPreviewForLead_`, novy queue write.

KROK 5 NEMENI B-04 endpoint, NEMENI B-01 brief, NEMENI B-05 webhook block (jen deprecation banner v komentari).
- **Owner:** Stream B
- **Code:** apps-script/PreviewPipeline.gs (modified), crm-frontend/src/app/api/preview/render/route.ts (modified)
- **Docs:** docs/30-task-records/B-10.md

### [B/B-11] Phase 2 KROK 6 — email z CRM (UI editor + Odeslat button) — DONE
- **Scope:** Phase 2 KROK 6 doplnuje operatorske posilani emailu primo z CRM lead detail draweru. Operator vidi pre-generated email draft (z KROK 4/5), edituje subject/body inline, klikne "Odeslat" → confirm Dialog → email letiu klientovi pres existing pilot send primitives.

Reuse pilot KROK 4 primitives bez modifikace: `resolveSenderIdentity_` (Reply-To assignee map), `sendGmailMessage_` (GmailApp send), `persistOutboundMetadata_` (LEADS write-back).

**Drift uznán (Q1 decision):** frontend send má mírnější gate než Sheet path:
- **Sheet path** (`executeCrmOutbound_` operator menu): `assertSendability_` requires `review_decision === 'APPROVE'`.
- **Frontend path** (`sendEmailForLead_` z drawer Odeslat): jen `qualified + preview_stage=READY_FOR_REVIEW + drafts + email valid`.

Argument: KROK 4/5 generuji preview do `READY_FOR_REVIEW` ale `review_decision=''` (B-06 review queue se aktivuje jen pri Sheet edit). Pokud by frontend send vyzadoval APPROVE, kazdý CRM-only workflow by byl zablokovany. Operator klik "Odeslat" + Dialog confirm IS the approval. Sheet path keeps APPROVE pro operatory kteri preferuji Sheet review queue.

**Backlog:** sjednotit gates jakmile CRM-only workflow stabilizuje (likely: drop B-06 review queue + assertSendability_, frontend confirm dialog becomes single source of approval).

KROK 6 NEMENI Sheet outbound flow, NEMENI pilot send primitives, NEMENI B-04 contract.
- **Owner:** Stream B
- **Code:** apps-script/Config.gs (modified), apps-script/OutboundEmail.gs (modified), apps-script/WebAppEndpoint.gs (modified), crm-frontend/src/lib/google/apps-script-writer.ts (modified), crm-frontend/src/lib/mock/mock-service.ts (modified), crm-frontend/src/app/api/leads/[id]/send-email/route.ts (new), crm-frontend/src/components/leads/lead-detail-drawer.tsx (modified)
- **Docs:** docs/30-task-records/B-11.md

## 2026-04-24

### [B/B-07] Buffer / podpora — pilot support package pro soucasny preview lifecycle (B-05) — DONE
- **Scope:** B-07 je **support / buffer / pilot-preparation task**. Osoba B nema vlastni runtime feature task ve vlne 7. Task dodava **pouze dokumentaci a pilotni test-data scenare**, ktere pripravuji projekt na pripadny pilot operatorsky provoz nad jiz existujici B-05 preview pipeline.

Task je zalozen na skutecnem stavu repository (k 2026-04-24):

- Existujici B task records: `B1`, `B2`, `B3`, `B4`, `B5`, `BX1`.
- **Zadny B-06 task record v `docs/30-task-records/` neexistuje.** Vsechny odkazy na "B-06" v repu (`docs/26-offer-generation.md:124`, `docs/30-task-records/B4.md:89-92,102`, `docs/30-task-records/B3.md:98`, `crm-frontend/src/lib/preview/preview-store.ts:11`, `crm-frontend/src/lib/preview/quality-score.ts:16`) jsou **proposed future scope** pro externi persistence / CDN / screenshot pipeline / real versioning / multi-instance store — **NE** review-decision layer.
- **Zadna formalni review-decision metadata neexistuje** v tomto repu. Fields `review_decision`, `review_note`, `reviewed_at`, `reviewed_by` v kodu ani dokumentaci nejsou definovany. Tri-state enum `APPROVE / REJECT / CHANGES_REQUESTED` neexistuje.
- Jedina existujici review-like akce je **manualni operator transition** `READY_FOR_REVIEW → APPROVED` pres sloupec `preview_stage` v Google Sheets (viz `apps-script/Config.gs:131-142`, `docs/23-data-model.md:54-63`, `docs/30-task-records/B5.md:18,28`).
- `preview_needs_review` je **boolean signal** (quality hint z webhook response), **ne** tri-stav rozhodnuti.

Task NEDODAVA:
- Zadny novy runtime kod (apps-script, crm-frontend, scripts).
- Zadny B-06 substitute, zadny novy review metadata / review enum.
- Zadny B-08 pilot runbook (prichazi v B-08).
- Zadnou novou state machine, zadny outbound sending, zadny novy webhook, zadnou zmenu B-05 lifecycle.
- Zadny novy preview backend ani zmenu `PreviewBrief` kontraktu.
- Nemenime `docs/29-task-registry.md` ani `docs/11-change-log.md` rucne — regeneruji se generatorem.
- **Owner:** Stream B
- **Code:** — (—)
- **Docs:** docs/30-task-records/B-07.md, docs/11-change-log.md, docs/29-task-registry.md

## 2026-04-22

### [C/C-11] Config, secrets, limity a budget guardrails — SPEC-only kontrakt pro 6 ortogonalnich configuration planes (config / secret / limit / budget / kill switch / feature flag) — DONE
- **Scope:** Formalizuje **authoritative specifikaci** pro configuration vrstvu nad celou automatizaci Autosmartweby. Predmetem SPEC je **jak system cte a meni sve chovani** aniz by se mneil kod — pres environment-bound config, secrets, per-stage limits, budget guardrails, kill switches a feature flags. Brief otazky typu "jak zastavime odesilani v 5:30 pri incidentu?", "kolik stoji serper API denne?", "jak testovat preview bez skutecneho posilani?", "co se stane kdyz Gmail API zacne odmitat?", "kam patri `DRY_RUN`?", "jak oddelit config od tajemstvi?".

Scope je **SPEC-only** — neimplementuje runtime `ConfigManager` / `getConfig_()` / `isKillSwitchActive_()` / `checkBudget_()` helper, nevytvari `_asw_budget_ledger` sheet, nezapisuje do `apps-script/Config.gs`, nepridava PROPOSED Script Properties do runtime environment, neimplementuje frontend UI pro kill-switch toggling, neintegruje feature flag SDK, neautomatizuje secret rotation. Vsechny nove artefakty jsou oznacene **PROPOSED FOR C-11** a budou materializovany implementacnim taskem.

Task dodava:

- **6-plane ortogonalni taxonomie s tvrdou separaci invariantem `CONFIG ≠ SECRET ≠ LIMIT ≠ BUDGET ≠ KILL_SWITCH ≠ FEATURE`:** kazdy config artefakt patri do **prave jedne** role. Zakazane kolapsy (12 polozek v sekci 3.10): NIKDY "`SERPER_API_KEY` jako CONFIG" (patri do SECRET pres Script Properties s redaction mask); NIKDY "`MAX_BATCH_SIZE` jako BUDGET" (patri do LIMIT — hard cap per stage, ne ekonomicka burn rate); NIKDY "`DRY_RUN=true` jako CONFIG do budoucna" (patri do KILL_SWITCH `KILL_SWITCH_ALL_WRITES` — operational shutdown); NIKDY "`EMAIL_SYNC_ENABLED` jako CONFIG" (patri do FEATURE `FEATURE_EMAIL_SYNC` — feature flag lifecycle); NIKDY "`KILL_SWITCH_GMAIL` jako FEATURE" (kill switch je emergency, feature je product optionality); NIKDY "`BUDGET_GMAIL_DAILY_QUOTA` jako LIMIT" (budget je cost / quota accounting s ledger append-only; limit je hard cap bez ledger); NIKDY "`WEBHOOK_URL` jako SECRET" (sam URL neni tajemstvi, ale auth header je); NIKDY "Config = Script Properties by definition" (CONFIG zdroje jsou hierarchicke: Script Properties → Config.gs defaults → runtime override — viz sekce 4).
- **Dependency narrowing `C-02, C-06, C-10` → `CS2, C-06, C-10`:** explicitni dokumentace proc (C-02 neexistuje, `C2.md` je governance unrelated, CS2 je foundational orchestrator SPEC a jediny logicky kontext, ve kterem dava C-11 smysl). Uvod docs/24 C-11 sekce + tento task record.
- **DRY_RUN → KILL_SWITCH_ALL_WRITES reklasifikace:** dnesni `DRY_RUN=true` v Config.gs je **hybrid artifact** — formalne CONFIG bool, ale funkcne kill switch. C-11 ho reklasifikuje a definuje migrace plan (target state = Script Property `KILL_SWITCH_ALL_WRITES` s backward-compat fallback na `DRY_RUN` const). Dokud runtime migrace neproběhne, `DRY_RUN=true` zustava kanonicky kill switch — C-11 dokumentuje target state.
- **EMAIL_SYNC_ENABLED → FEATURE_EMAIL_SYNC reklasifikace:** dnesni `EMAIL_SYNC_ENABLED=true` je CONFIG bool ale funkcni role je feature flag pro mailbox sync. C-11 plan: reklasifikace na `FEATURE_EMAIL_SYNC` Script Property s rollout lifecycle (draft / pilot / rollout / stable / deprecated).
- **Canonical config table — 13-column schema:** `key` / `plane` (CONFIG|SECRET|LIMIT|BUDGET|KILL_SWITCH|FEATURE) / `scope` (global / env / stage / provider) / `source` (Script Property / Config.gs / ledger sheet) / `type` (bool|int|string|enum|secret_ref|json) / `default_value` / `prod_value` / `test_value` / `allowed_values_or_range` / `owner_stream` / `affected_consumers[]` / `change_control` / `label` (VERIFIED / INFERRED / PROPOSED). **17 VERIFIED IN REPO entries** (ASW_ENV, ASW_SPREADSHEET_ID, PREVIEW_WEBHOOK_SECRET, SERPER_API_KEY, DRY_RUN const, ENABLE_WEBHOOK const, WEBHOOK_URL const, BATCH_SIZE const, EMAIL_MAILBOX_ACCOUNT const, EMAIL_SYNC_LOOKBACK_DAYS const, EMAIL_SYNC_MAX_THREADS const, EMAIL_SYNC_REQUIRE_EXACT_MATCH const, EMAIL_SYNC_ENABLED const, MAIN_SHEET_NAME const, LOG_SHEET_NAME const, RAW_IMPORT_SHEET_NAME const, CONTACT_SHEET_NAME const) + **PROPOSED 4 CONFIG / 9 LIMIT / 7 BUDGET / 14 KILL_SWITCH / 10 FEATURE / 2 SECRET entries** per sekce 5.
- **Secrets inventory — 10-field contract:** `key` / `provider` (Script Properties / GCP Secret Manager / external vault) / `rotation_policy` (manual / 90d / 180d / on-incident) / `redaction_mask_pattern` / `used_in_step[]` / `access_pattern` (read-at-start / read-per-call / read-on-rotation) / `timing_insensitive_compare` (bool) / `pii_class` (none / low / high) / `last_rotated_at` / `owner`. Inventory v docs/24 sekce 5 je **5 VERIFIED entries** per entry explicitne klasifikovanych pres `kind`: **3 true secrets** (S1 `SERPER_API_KEY` kind=API_KEY, S2 `PREVIEW_WEBHOOK_SECRET` kind=SHARED_SECRET, S3 `FRONTEND_API_SECRET` kind=SHARED_SECRET) + **1 TENANT_ID** (S4 `ASW_SPREADSHEET_ID` kind=TENANT_ID — **explicitne reclassified z SECRET na CONFIG s TENANT_ID roli**, ne pure secret ale sensitive env-bound identifier; inventorovan v sekci 5 kvuli rotation / leak-response workflow, ne jako autorizacni material) + **1 platform OAUTH_TOKEN** (S5 Apps Script platform identity, kind=OAUTH_TOKEN — implicit, Google-managed, informational only). Hard-separation invariant `CONFIG ≠ SECRET ≠ LIMIT ≠ BUDGET ≠ KILL_SWITCH ≠ FEATURE` zustava intaktni: S4 nepatri do SECRET plane (patri do CONFIG s TENANT_ID kind), S5 je platform-managed mimo ops surface. + **2 PROPOSED true secrets** (S6 `SENDGRID_API_KEY` kind=API_KEY / S7 `MAILGUN_API_KEY` kind=API_KEY, conditional on `EMAIL_PROVIDER` selection per C-06).
- **Per-stage limits for 9 pipeline stages — 9 PROPOSED LIMIT_* Script Properties (canonical inventory v docs/24 sekce 6):** A-04 firmy.cz scraper (`LIMIT_A04_SCRAPE_PAGES_PER_PORTAL=50`, `LIMIT_A04_SCRAPE_BATCH_TIMEOUT_MS=300000`), A-05 dedupe (reuse VERIFIED `BATCH_SIZE=100` — ne novy LIMIT_*), A-06 auto web check (`LIMIT_A06_WEBCHECK_QPS=2`, `LIMIT_A06_WEBCHECK_BATCH_SIZE=100`), A-07 auto qualify (reuse VERIFIED `BATCH_SIZE=100` — ne novy LIMIT_*), A-08 preview queue (reuse VERIFIED `BATCH_SIZE=100` — ne novy LIMIT_*), B-04 preview render endpoint (`LIMIT_B04_PREVIEW_RENDER_TIMEOUT_MS=60000`), C-05 outbound queue worker (`LIMIT_C05_OUTBOUND_BATCH_SIZE=50`, `LIMIT_C05_OUTBOUND_MAX_CONCURRENCY=1`), C-06 provider send (`LIMIT_C06_SEND_TIMEOUT_MS=30000`), C-08 follow-up engine (`LIMIT_C08_FOLLOWUP_BATCH_SIZE=20`). **9 LIMIT_* celkem** (A-05/A-07/A-08 zamerne zustavaji na VERIFIED `BATCH_SIZE` bez duplicitniho PROPOSED entry — limit kontrakt se rozsiruje tam, kde existujici konstanta nepokryva novy aspekt stage). Invariant: limits jsou **hard caps per stage** — pri prekroceni stage safe-stopne s `limit_exceeded` event, nesmi se retryovat proti limitu.
- **Budget guardrails — 10-field contract + 5 kategorii:** Contract per entry (`budget_id`, `category`, `provider_or_api`, `scope` stage / cs2_run / day / month, `reset_policy` never / daily / monthly / on-reset-call, `warning_threshold_pct`=80%, `critical_threshold_pct`=100%, `hard_stop_on_critical` bool, `current_consumption` counter, `last_reset_at`, `owner`). **5 kategorii**: (1) **BG-PROV-OPS** — provider operational quotas (Gmail API daily send quota, Serper monthly quota, Gemini/OpenAI token budget); (2) **BG-RETRY-EXPLOSION** — retry count explosion prevention (max retries per step per day, prevents runaway retry loops caused by CS3 retry matice mis-classification); (3) **BG-COST-EXPLOSION** — API cost explosion (Serper per-query cost × queries per day; Gemini tokens per day × rate); (4) **BG-RUNAWAY-BATCH** — batch size explosion (napr. A-04 scraper skriptem vyvolan se spatnym URL — unlimited scrape); (5) **BG-SILENT-DEGRADATION** — degradation without alerts (napr. Gmail soft bounce percentage trend — pokud soft bounce > 5% prumeru za 7 dni = mozna reputation damage). PROPOSED 7 BUDGET entries (BUDGET_SERPER_DAILY_QUERY_QUOTA=1000, BUDGET_GMAIL_DAILY_SEND_QUOTA=2000, BUDGET_GEMINI_DAILY_TOKEN_BUDGET=100000, BUDGET_RETRY_MAX_PER_STEP_DAY=50, BUDGET_PREVIEW_RENDER_DAILY=200, BUDGET_FOLLOWUP_SEND_DAILY=500, BUDGET_BOUNCE_RATE_7D_ROLLING_PCT=5). **`_asw_budget_ledger` 12-field sheet** (PROPOSED append-only): `ledger_id` / `budget_id` / `cs2_run_id` / `stage` / `delta_amount` / `delta_unit` (call / token / row / dollar) / `cumulative_at_time` / `threshold_status` (OK / WARNING / CRITICAL) / `triggering_step` / `triggering_event_id` / `timestamp` / `note`.
- **Kill switch model — 5-scope taxonomy:** (1) **GLOBAL** — `KILL_SWITCH_ALL_WRITES` (celosystemovy incident shutdown; aktivovan → zadny CS2 step nesmi zapisovat do ZADNEHO sheetu; safe-stop ne hard-stop — rozbehnute operace dokonci, nove nestartuji); (2) **ENV** — `KILL_SWITCH_PROD_ENFORCE` (ENV-scoped guardrail — napr. vypnuti PROD spreadsheetu pro integrity audit); (3) **CATEGORY** — `KILL_SWITCH_EMAIL_ALL` / `KILL_SWITCH_SCRAPE_ALL` / `KILL_SWITCH_WEBHOOK_ALL` (stage-family shutdown, napr. reputation incident — vypne vsechny C-05/C-06/C-08 pipeline emails); (4) **PROVIDER** — `KILL_SWITCH_GMAIL` / `KILL_SWITCH_SENDGRID` / `KILL_SWITCH_MAILGUN` / `KILL_SWITCH_SERPER` (provider-level isolation, incident na konkretnim ESP); (5) **API_SURFACE** — `KILL_SWITCH_DOPOST_WRITE` / `KILL_SWITCH_PREVIEW_WEBHOOK` (API endpoint surface shutdown, napr. compromise podezreni na PREVIEW_WEBHOOK_SECRET). **Safe-stop semantics**: aktivace → inflight operace dokonci transakcni celek ale nezapisuji novy commit; nove operace vidi kill switch a safe-stopnou s `kill_switch_triggered` event + `cs2_run_id` + `triggering_step` + `intended_sheet_writes[]` audit trail. **Reset**: manualni pres Script Property update + `kill_switch_reset` event. **Testing**: PROPOSED `diagKillSwitchState()` diagnostic tool vraci JSON se stavem vsech 14 kill switches. **Idempotency**: kill switch check je idempotent — volan pri kazdem CS2 step entry. **Escalation**: PROPOSED auto-escalation — pokud CATEGORY kill switch aktivni > 24h, auto-promote na GLOBAL (s konfirmaci pres Script Property `KILL_SWITCH_AUTO_ESCALATE=true`).
- **Feature flag kontrakt — 8-field contract:** per entry (`flag_id`, `rollout_stage` draft / pilot / rollout / stable / deprecated, `default_value_per_env` map env → bool, `target_audience` internal / 10pct / 50pct / all, `owner_stream`, `related_task`, `sunset_date`, `label`). **Rollout patterns**: draft (off everywhere) → pilot (on in TEST only) → rollout (on in TEST + 10% PROD) → stable (on everywhere) → deprecated (off, planned removal). **State safety rules**: flag flip BEHEM CS2 run-u nesmi korumpovat in-progress stepy — kazdy CS2 run snapshotuje flag state na starte (`_asw_logs.feature_snapshot_json`); zmena flag behem runu = nez viditelna az dalsi run. PROPOSED 10 feature flags: FEATURE_EMAIL_SYNC (rollout z VERIFIED `EMAIL_SYNC_ENABLED=true`), FEATURE_PREVIEW_WEBHOOK_V2, FEATURE_AUTO_QUALIFY_HOOK, FEATURE_AUTO_WEB_CHECK_HOOK, FEATURE_DOPOST_WRITE, FEATURE_FOLLOWUP_ENGINE, FEATURE_INBOUND_EVENT_INGEST, FEATURE_PERFORMANCE_REPORT (po C-10 impl), FEATURE_EXCEPTION_QUEUE (po C-09 impl), FEATURE_PROVIDER_ABSTRACTION (po C-06 impl).
- **State safety rules:** (1) **Config change atomicity** — change Script Property je atomic (GAS native guaranty), ale CS2 step beh ma pouzit snapshot config state na starte (`configSnapshot_()` pattern); (2) **Kill switch activation timing** — aktivace mezi CS2 stepy, ne uprostred; inflight step dokonci transakcni celek; (3) **Budget threshold crossing** — prechod WARNING → CRITICAL musi vyvolat observability event i kdyz hard_stop_on_critical=false (visibility nad cost); (4) **Feature flag flip during run** — snapshot na run start, flip viditelny az dalsi CS2 run; (5) **Secret rotation during run** — secret read-at-start, rotace behem runu nerozbi probehajici step; pro long-running steps (A-04 firmy.cz scraping) explicit re-read na kazdem batch boundary.
- **Sample scenarios (7):** (1) Reputation incident on Gmail → operator activates `KILL_SWITCH_EMAIL_ALL` → vsechny C-05/C-06/C-08 safe-stop + log; (2) Serper quota prekrocena → BUDGET warning 80% trigger → email notification → CRITICAL 100% trigger + `BUDGET_SERPER_DAILY_QUERY_QUOTA.hard_stop_on_critical=true` → A-06 safe-stop; (3) Transient Gmail API 500 → CS3 retry matrix classify TRANSIENT → retry NOT counted toward BUDGET_GMAIL_DAILY_SEND_QUOTA (only permanent sends); (4) Feature flag rollout FEATURE_FOLLOWUP_ENGINE from pilot → rollout → snapshot on run start; (5) DRY_RUN → KILL_SWITCH_ALL_WRITES migration — `DRY_RUN=true` in Config.gs continues to work + runtime guard checks `KILL_SWITCH_ALL_WRITES` Script Property first, fallback to `DRY_RUN` const; (6) Secret rotation PREVIEW_WEBHOOK_SECRET → operator updates Script Property → next doPost uses new secret, old requests still in flight pass timing-insensitive compare against old value via short-lived dual-read window; (7) Config drift detection — diagConfigState() vraci diff mezi expected Script Properties and actual, flagne missing / stale entries.
- **Testing / verification:** `diagConfigState()` diagnostic tool (PROPOSED) vraci JSON se stavem vsech 17 VERIFIED + PROPOSED CONFIG entries; `diagKillSwitchState()` vraci stavy 14 kill switches; `diagBudgetLedger()` vraci cumulative consumption per budget_id; `diagSecretInventory()` vraci redacted view vsech 7 VERIFIED+PROPOSED secrets; `configSnapshot_()` utility for CS2 step entry. Testing approach: (1) Unit test `getConfigValue_()` fallback hierarchy (Script Property → Config.gs default → error); (2) Integration test kill switch activation — artificial `KILL_SWITCH_EMAIL_ALL=true` in TEST, spawn C-05 queue worker, assert safe-stop + log event; (3) Budget threshold crossing test — artificially inflate `current_consumption` to 81%, assert `budget_warning_crossed` event emitted; (4) Feature flag snapshot test — flip flag mid-run, assert old snapshot used until next CS2 run.
- **Anti-patterns (12-row table):** (1) "SERPER_API_KEY as CONFIG const" → SECRET violation (pii_class=high); (2) "DRY_RUN=true forever as CONFIG" → hybrid role (migrate to KILL_SWITCH_ALL_WRITES); (3) "Hardcode PREVIEW_WEBHOOK_SECRET in code" → SECRET leak; (4) "BATCH_SIZE=1000 as BUDGET" → category confusion (LIMIT not BUDGET — no cost/ledger); (5) "KILL_SWITCH_GMAIL as FEATURE flag" → emergency vs product optionality; (6) "Change CONFIG mid-run" → atomicity violation (use snapshot); (7) "Retry against LIMIT" → infinite loop; (8) "No ledger for BUDGET" → audit gap; (9) "Single-scope kill switch" → no provider isolation (use 5-scope taxonomy); (10) "Feature flag without sunset_date" → flag debt; (11) "SECRET without rotation_policy" → stale credential risk; (12) "No KILL_SWITCH_RESET event" → silent re-enable.
- **Auditability:** 9 PROPOSED `_asw_logs` event types (`config_value_changed`, `secret_rotated`, `limit_exceeded`, `budget_warning_crossed`, `budget_critical_crossed`, `kill_switch_triggered`, `kill_switch_reset`, `feature_flag_enabled`, `feature_flag_disabled`) + cross-ref graph (Config.gs ↔ Script Properties ↔ `_asw_budget_ledger` ↔ `_asw_logs` ↔ C-10 `_asw_perf_reports` operational block) + 4 diagnostic tools (`diagConfigState`, `diagKillSwitchState`, `diagBudgetLedger`, `diagSecretInventory`) + runtime API surface (`getConfigValue_`, `getSecret_`, `getLimit_`, `getBudgetState_`, `isKillSwitchActive_`, `isFeatureEnabled_`).
- **Handoff tabulka (13 radku):** CS2 / C-04 / C-05 / C-06 / C-07 / C-08 / C-09 / C-10 / BX1 / A-04 / A-06 / future runtime impl / future frontend UI. Per-row "jak C-11 konzumuje" + "jak C-11 prispiva".
- **Non-goals:** runtime `ConfigManager`, `_asw_budget_ledger` sheet creation, `apps-script/Config.gs` zapisy, PROPOSED Script Properties runtime setup, frontend UI pro kill-switch toggling, feature flag SDK integration, secret rotation automation, backup of Script Properties, external vault (GCP Secret Manager) migration, config change dashboard.
- **Acceptance checklist (23 polozek):** vsechny checked.
- **PROPOSED vs INFERRED vs VERIFIED label summary** (sekce 19).

**CS2 kompatibilita:**
- CS2 step kontrakt je **upstream** rozhodnutim — C-11 se zapojuje jako **vstupni brana** pred kazdym CS2 step exec. `isKillSwitchActive_(scope)` check na step entry; `checkBudget_(budget_id)` check pri provider call; `checkLimit_(stage)` check pri batch iteration.
- `cs2_run_id` je **klic** pro per-run budget accounting (`_asw_budget_ledger.cs2_run_id`) — umoznuje per-run burn rate analysis v C-10 reports.
- PROPOSED nova CS2 step: `config_snapshot_capture` (start of run) + `config_snapshot_verify` (end of run — drift detection).
- C-11 nemutuje CS2 step taxonomy ani event model. Jen pridava **observability layer** nad nim.

**C-06 kompatibilita:**
- C-06 `EMAIL_PROVIDER` Script Property je **kanonicka vzorovy CONFIG entry** pro provider selection. C-11 formalizuje pattern.
- C-06 `NormalizedSendErrorClass` enum je **zdroj rozhodovani** pro budget accounting: transient fails (TIMEOUT, RATE_LIMIT, PROVIDER_UNAVAILABLE) → retry-able, NE accounted to `BUDGET_GMAIL_DAILY_SEND_QUOTA`; permanent fails (INVALID_RECIPIENT, AUTH_FAILED) + success → accounted.
- PROPOSED provider-level kill switch `KILL_SWITCH_GMAIL` / `KILL_SWITCH_SENDGRID` / `KILL_SWITCH_MAILGUN` prestupne pres C-06 sender interface: pred `EmailSender.send` check `isKillSwitchActive_('GMAIL')` → safe-stop bez mutace C-06 kontraktu.
- C-11 **nemutuje** `NormalizedSendResponse` / `SendRequest` / `EmailSender` interface. Zadne pridavani sloupcu.

**C-10 kompatibilita:**
- C-11 9 PROPOSED `_asw_logs` event types feeds do C-10 `_asw_perf_reports` operational block.
- C-10 `data_completeness_flags_json` zaznamena degradace zpusobenou C-11 guardraily: `kill_switch_email_all_active=true` → `delivery_yield=null` + `c11_kill_switch_degraded=true` flag + `summary_status=DEGRADED`.
- C-10 5 event types + C-11 9 event types sdileji jednu observability vrstvu (`_asw_logs`) bez kolize — explicit dokumentovano v sekci 14 handoff tabulce.
- C-11 nemutuje C-10 `_asw_perf_reports` schema. C-10 rozpoznava C-11 degradation states pres data_completeness_flags_json.
- **Owner:** Claude
- **Code:** — (—)
- **Docs:** docs/24-automation-workflows.md, docs/20-current-state.md

## 2026-04-21

### [B/B5] Preview URL return + statusy (caller-side + lifecycle) — DONE
- **Scope:** Navazuje na B-01 (preview contract), B-02 (preview renderer), B-03 (template family mapping), B-04 (`POST /api/preview/render` endpoint). Uzavira CRM-side smycku: Apps Script caller splnuje B-04 contract (slug v payloadu + X-Preview-Webhook-Secret header), response se parsuje do LEADS a `preview_stage` je narovnany do operator-facing lifecycle `NOT_STARTED → BRIEF_READY → GENERATING → READY_FOR_REVIEW → APPROVED`, s `FAILED` jako retry-eligible.

B-05 NEMENI B-04 endpoint contract, NEMENI B-01 `PreviewBrief`, NEMENI B-03 mapping. Neotevira B-06 (storage/screenshot/CDN), neresi frontend UI pro `APPROVED` (ta je manualni operator akce v Google Sheets), nepridava `preview_attempts` counter.
- **Owner:** Stream B
- **Code:** apps-script/Config.gs (modified), apps-script/EnvConfig.gs (modified), apps-script/PreviewPipeline.gs (modified), apps-script/PreviewPipeline.gs (modified), scripts/test-b05-preview-webhook.mjs (new), package.json (modified)
- **Docs:** docs/20-current-state.md, docs/22-technical-architecture.md, docs/23-data-model.md, docs/24-automation-workflows.md, docs/26-offer-generation.md, docs/30-task-records/B5.md

### [B/B6] Minimal preview review layer — DONE
- **Scope:** Minimalni review vrstva nad existujicim derived listem "Ke kontaktovani". Operator vidi preview URL, zvoli Schvalit / Zamitnout / Zmeny a rozhodnuti se atomicky propise do LEADS vcetne transition `preview_stage`. LEADS zustava source of truth; "Ke kontaktovani" je pure working layer.

**B-06 NEDELA:**
- zadny novy frontend (next.js review UI)
- zadny outbound send
- zadny webhook redesign
- zadnou zmenu preview rendereru
- zadne pouziti `send_allowed` jako approval flag
- zadny PROD deploy
- **Owner:** Stream B
- **Code:** apps-script/Config.gs (modified), apps-script/ContactSheet.gs (modified), scripts/test-b06-review-writeback.mjs (new), package.json (modified), docs/30-task-records/B6.md (new), docs/20-current-state.md (modified), docs/22-technical-architecture.md (modified), docs/23-data-model.md (modified), docs/26-offer-generation.md (modified)
- **Docs:** docs/20-current-state.md, docs/22-technical-architecture.md, docs/23-data-model.md, docs/26-offer-generation.md

### [C/C-04] Sendability Gate pravidla — autoritativni SPEC gate mezi preview a outreach — DONE
- **Scope:** Formalizuje rozhodovaci logiku, ktera stoji mezi fazi "preview hotove" a fazi "outreach queued". Definuje jedine autoritativni pravidlo pro kazdy lead, zda smi jit do auto-send, zda potrebuje manualni review, nebo zda je blokovan. Scope je **SPEC-only** — zadny runtime sender, queue, UI, webhook ani observability pipeline se v tomto tasku neimplementuje.

Task dodava:
- 3 **gate outcomes** (ne lifecycle states): `AUTO_SEND_ALLOWED` / `MANUAL_REVIEW_REQUIRED` / `SEND_BLOCKED`
- 19 hard conditions (H1–H19) pro pripusteni auto-sendu
- 21 blocking reasons (B1–B21) se stabilnimi reason codes, **rozclenenymi do 4 kategorii** (canonical-lifecycle / compliance / outbound-signal / data-deficit)
- 3 review reasons (R1–R3)
- 8-ORDER precedence rules (terminal > compliance > already-sent > qualifier > identity > content > review > allow)
- Deterministicky pseudocode evaluatoru (lookup-only, zadny side-effect)
- 5 sample leadu (2x AUTO_SEND + 2x BLOCK + 1x REVIEW) pro acceptance
- Observability contract (reason codes, log schema) a boundary rules proti double-send
- Handoff do C-05 (outbound queue), C-06 (ESP abstrakce), C-08/C-09 (rate limit / suppression)

**CS1 konzistence (2026-04-21 fix round):**
- `TERMINAL_STATE_*` block reasons (B2–B5) pokryvaji **pouze** CS1 canonical terminals: `DISQUALIFIED`, `REPLIED`, `BOUNCED`, `UNSUBSCRIBED`.
- `WON` a `LOST` jsou downstream sales outcomes (hodnoty auxiliary pole `outreach_stage`), **NE** canonical lifecycle states. CS1 sekce 10.4 je derivuje na `effective_lifecycle_state = REPLIED` → B3.
- `DEAD` neni canonical lifecycle state, neni to aux hodnota a neni to gate outcome. V C-04 spec se nepouziva.
- Sample leady pouzivaji pouze CS1 canonical states.

Task NEDODAVA:
- Runtime sender, ESP provider, queue, retry stroj, outbound rate limiter
- UI pro review frontu ani Sheets sloupec `sendability_outcome` jako editable pole
- Apps Script zmeny, webhooky, cron scheduler
- Frontend zmeny (read-only preview renderer zustava)
- Zadne PROPOSED pole se **nezapisuji** do LEADS v ramci C-04 — navrh je pouze v SPEC sekci "Implementation notes" jako podklad pro C-05/C-06
- **Owner:** Claude
- **Code:** — (—)
- **Docs:** docs/24-automation-workflows.md, docs/21-business-process.md, docs/20-current-state.md

### [C/C-05] Outbound queue + send payload kontrakt — SPEC-only vrstva mezi C-04 gatem a budoucim senderem — DONE
- **Scope:** Formalizuje datovou vrstvu mezi C-04 sendability gate a budoucim senderem. Odděluje čtyři fáze: "lead je sendable" / "queue item čeká" / "sender posílá" / "provider potvrdil". Definuje `_asw_outbound_queue` sheet schema, queue status enum, povolené/zakázané přechody, send payload kontrakt v1.0, immediate vs scheduled pravidla, failure design a cross-ref na CS2/CS3/C-04.

Scope je **SPEC-only** — žádný runtime worker, sender, ESP provider, mailbox sync, cron ani frontend se neimplementuje. Žádné nové sloupce se v tomto tasku nezapisuji do `apps-script/Config.gs` ani do LEADS. Všechny nové sloupce jsou označené PROPOSED FOR C-05 a budou materializovány až implementačním taskem.

Task dodává:
- `_asw_outbound_queue` schema (32 polí — 15 povinných per zadání + 17 auditability/integrity rozšíření se zdůvodněním)
- 5 queue statusů (`QUEUED`, `SENDING`, `SENT`, `FAILED`, `CANCELLED`) s matrixem allowed/disallowed transitions a 5 invarianty
- Deterministický pseudocode pro queue create / worker claim / cancel / fail
- Send payload kontrakt v1.0 (12 top-level polí, snapshot vs runtime-derived rozlišené)
- Immediate vs scheduled pravidla (field semantics, worker eligibility, cancel, rescheduling zakázané)
- Failure design (6 povinných polí pro diagnostiku, vztah k CS3 retry + dead-letter)
- Cross-ref graph (LEADS ↔ queue ↔ `_asw_logs` ↔ `_asw_dead_letters`)
- 4 sample rows (QUEUED, SENT, FAILED, CANCELLED)
- 13 boundary rules / handoff body do C-04 / CS1 / CS2 / CS3 / C-06 / C-07 / C-08 / C-09
- VERIFIED / INFERRED / PROPOSED labely

**CS1/CS3 kompatibilita:**
- C-05 queue je **ortogonální** datová vrstva; nezavádí žádný nový canonical lifecycle state. T17 (`OUTREACH_READY → EMAIL_QUEUED`) mapuje na queue row insert; T18 (`EMAIL_QUEUED → EMAIL_SENT`) mapuje na queue.send_status=SENT.
- Queue status `SENDING`/`FAILED` **není** CS1 canonical state — žije pouze v queue.
- CS3 S12 `process_email_queue` pravidlo `max_attempts=1` + okamžitý dead-letter je respektováno: retry nad stejnou row je zakázán. Retry = nový queue row s jiným `idempotency_key` (jinak duplicate blocked producer-side).
- `idempotency_key` reuses CS3 section 4 S12 pattern `send:{lead_id}:{SHA256(email + subject + body)}`.

**C-04 kompatibilita:**
- Queue row smí vzniknout **pouze** pokud C-04 vrátí `AUTO_SEND_ALLOWED`. Snapshot outcome se freezne v `created_from_sendability_outcome` — audit invariant proti pozdější změně gate semantiky.
- `MANUAL_REVIEW_REQUIRED` jde do C-09 exception queue (jiná struktura, ne `_asw_outbound_queue`).
- `SEND_BLOCKED` queue row nevytváří.

Task NEDODÁVÁ:
- Runtime worker / cron / trigger / polling loop
- Sender / Gmail call / ESP integraci
- Mailbox sync změny
- Follow-up engine (C-07)
- Rate limiting, quiet hours, daily caps (C-08)
- Suppression list management (C-09)
- Frontend queue UI / exception review UI
- `_asw_outbound_queue` sheet creation v `apps-script/` runtime kódu
- Změny v `apps-script/Config.gs` `EXTENSION_COLUMNS`
- Změny v `docs/23-data-model.md` (queue sheet je PROPOSED; materializace až v implementačním tasku)
- Nové canonical lifecycle states
- Nové gate outcomes
- **Owner:** Claude
- **Code:** — (—)
- **Docs:** docs/24-automation-workflows.md, docs/20-current-state.md

### [C/C-06] Provider abstraction + sender interface — SPEC-only vrstva mezi outbound queue a konkretnim ESP — DONE
- **Scope:** Formalizuje provider-agnostickou vrstvu mezi `_asw_outbound_queue` a konkretnim ESP (Gmail / SendGrid / Mailgun / …). Oddeluje ctyri vrstvy identity statusu: provider raw response / normalized provider status / queue send status / CS1 lifecycle state. Definuje `EmailSender` interface (1 metoda), `SendRequest` (17 poli), `NormalizedSendResponse` (17 poli), `NormalizedProviderStatus` (7 hodnot), `NormalizedSendErrorClass` (8 hodnot) s fixnim mappingem na CS3 `failure_class`, rate limiting jako kontrakt, 3 fail scenare, Gmail vs generic ESP sample mapping a sender selection via config (ne runtime).

Scope je **SPEC-only** — zadny runtime sender, Gmail adapter, SendGrid adapter, Mailgun adapter, queue worker, factory, mailbox sync, frontend UI ani provider webhook ingest se neimplementuje. Zadne nove enumy ani Script Property se v tomto tasku nezapisuji do `apps-script/Config.gs`. Vsechny nove artefakty jsou oznacene PROPOSED FOR C-06 a budou materializovany implementacnim taskem.

Task dodava:
- `EmailSender` interface (1 metoda `send(request: SendRequest) → NormalizedSendResponse`)
- `SendRequest` kontrakt (17 poli — 13 immutable snapshot z C-05 payload v1.0 + 4 runtime-derived, PII-safe)
- `NormalizedSendResponse` kontrakt (17 poli — 7 povinnych per zadani + 10 auditability rozsireni se zduvodnenim)
- `NormalizedProviderStatus` enum (7 hodnot: ACCEPTED, QUEUED_BY_PROVIDER, REJECTED, THROTTLED, TIMEOUT, AUTH_FAILED, UNKNOWN)
- `NormalizedSendErrorClass` enum (8 hodnot: TIMEOUT, RATE_LIMIT, INVALID_RECIPIENT, AUTH_FAILED, PROVIDER_UNAVAILABLE, PROVIDER_REJECTED, INVALID_REQUEST, UNKNOWN) s deterministickym mappingem na CS3 `failure_class`
- 4-vrstva separace statusu (A: provider raw / B: `NormalizedProviderStatus` / C: `QUEUE_SEND_STATUS` / D: CS1 lifecycle state) s fixnim deterministickym lookup table
- Provider adapter model (shared logic / provider-specific logic / anti-branching rules — queue worker nevi, jaky provider je aktivni)
- Rate limiting jako kontrakt: adapter report `rate_limit_reset_at` + `THROTTLED` status; scheduling rozhoduje C-08 (mimo C-06)
- 3 fail scenare s plnymi `NormalizedSendResponse` tabulkami a CS3 handoffem (TIMEOUT → AMBIGUOUS HOLD, RATE_LIMIT → TRANSIENT, INVALID_RECIPIENT → PERMANENT)
- Gmail sample mapping (`GmailApp.sendEmail` + `GmailApp.search` pro message_id retrieval, constraints: no native message_id, no API idempotency)
- Generic ESP sample mapping (SendGrid 202 + 429 examples; HTTP+JSON payload + X-Message-Id header)
- Gmail vs generic ESP tabulka odlisnosti (idempotency / rate limit signal / authentication / bounce signal / attachments)
- Auditability + cross-ref do `_asw_logs` + queue (correlation_id, sender_run_id, sender_event_id, provider_response_excerpt)
- Sender selection via Script Property `EMAIL_PROVIDER` (GMAIL default / SENDGRID / MAILGUN), multi-provider fallback explicitly out-of-scope
- Sample pseudocode flow (queue worker volajici sender.send)
- PII safety invariant pro `provider_response_excerpt` a `error_message` (sanitizace pre-log)
- 13 boundary rules / handoff body do C-05 / CS1 / CS2 / CS3 / C-04 / C-07 / C-08 / C-09 / mailbox sync / 2x budoucich implementacnich tasku
- VERIFIED / INFERRED / PROPOSED labely

**CS3 kompatibilita:**
- `NormalizedSendErrorClass` (8 hodnot) je jemnejsi nez CS3 `failure_class` (TRANSIENT / PERMANENT / AMBIGUOUS). C-06 definuje **deterministicky 1:N lookup table** (TIMEOUT→AMBIGUOUS, RATE_LIMIT→TRANSIENT, INVALID_RECIPIENT→PERMANENT, AUTH_FAILED→PERMANENT, PROVIDER_UNAVAILABLE→TRANSIENT, PROVIDER_REJECTED→PERMANENT, INVALID_REQUEST→PERMANENT, UNKNOWN→AMBIGUOUS). Queue worker mapuje 1:N.
- CS3 S12 `process_email_queue` invariant `max_attempts=1` je respektovany — `EmailSender.send` nikdy nerestrykuje interne. Retry = novy queue row (C-05 pravidlo). C-06 pouze emituje `retryable: boolean` hint pro diagnostiku.
- C-06 neemituje `_asw_logs` sam; queue worker to dela s normalized payloadem. `sender_run_id` + `sender_event_id` jsou echoed zpet v response.

**C-05 kompatibilita:**
- `SendRequest` je stavebni derivat C-05 payload kontraktu v1.0 (sekce 6 docs/24). 13 poli je immutable snapshot z queue row; 4 pole (`sender_run_id`, `sender_event_id`, `timeout_ms`, `payload_version`) jsou runtime-derived.
- `NormalizedSendResponse.provider_message_id` + `sent_at` jsou pole, ktera queue worker zapise do queue row pri `QUEUED → SENT` transition.
- Queue statusy (`QUEUED`, `SENDING`, `SENT`, `FAILED`, `CANCELLED`) nejsou touto SPEC dotcene — ortogonalne existuji vuci `NormalizedProviderStatus`.
- C-05 `idempotency_key` je predavan do `SendRequest.idempotency_key`; adapter rozhoduje, zda ho propne do provider API (SendGrid `X-Message-Id` header) nebo drzi pouze lokalne (Gmail nema native idempotency).

**CS1 kompatibilita:**
- C-06 nezavadi zadny novy canonical lifecycle state. T18 (`EMAIL_QUEUED → EMAIL_SENT`) je triggered queue workerem po `success: true`. C-06 samotny nezapisuje do LEADS.
- C-06 fail → CS1 zustava `EMAIL_QUEUED`. Transition na potencialny `EMAIL_FAILED` je manualni operator akce (T25), ne C-06 responsibility.

**C-04 kompatibilita:**
- C-04 zije **pred** queue; C-06 zije **za** queue. Zadna prima interakce. Oddelene C-05 queue vrstvou.

Task NEDODAVA:
- Runtime `EmailSender` implementaci / `GmailAdapter` / `SendGridAdapter` / `MailgunAdapter`
- `getEmailSender()` factory / sender registry
- Queue worker loop (worker, ktery volа adapter, je budouci implementacni task)
- Zapis `EMAIL_PROVIDER` Script Property (vcetne default GMAIL)
- Zapis `NormalizedProviderStatus` / `NormalizedSendErrorClass` do `apps-script/Config.gs`
- Mailbox sync zmeny / bounce/reply ingest
- Provider webhook ingest (bounce, complaint, open, click)
- Rate limiting / quiet hours / daily caps scheduling (handoff → C-08)
- Follow-up engine / thread reply (handoff → C-07)
- Suppression list management (handoff → C-09)
- Multi-provider fallback / primary+secondary routing
- Attachment support (v1.0 `SendRequest.attachments` je rezerva, vzdy prazdne)
- HTML body rendering (v1.0 `SendRequest.body.html` je rezerva; queue worker predava `plain`)
- Frontend provider config UI
- **Owner:** Claude
- **Code:** — (—)
- **Docs:** docs/24-automation-workflows.md, docs/20-current-state.md

### [C/C-07] Inbound event ingest — SPEC-only kontrakt pro reply / bounce / unsubscribe eventy po úspěšném sendu — DONE
- **Scope:** Formalizuje ingest vrstvu mezi mailbox syncem / ESP webhookem a CS1 lifecycle stavem pro 3 primarni event families (REPLY / BOUNCE / UNSUBSCRIBE) + 2 rezervni (UNKNOWN_INBOUND / COMPLAINT). Oddeluje ctyri identity vrstvy: **raw source** (Gmail thread / DSN thread / ESP webhook / manual) → **normalized event** (`InboundEvent` tvar) → **lifecycle transition** (CS1 T20/T21/T22 nebo skip) → **review flag** (`reply_needs_manual` boolean, NE CS1 state). Definuje event schemata (18 / 15 / 14 poli), 3-tier stop rule model (follow-up / address / lead), deterministickou lifecycle mapping tabulku (8 radku + 4 invarianty), idempotency kontrakt na event-level i lifecycle-level, cross-ref graf a 3 sample lifecycle scenare.

Scope je **SPEC-only** — neimplementuje mailbox polling worker, ESP webhook HTTP handler, Gmail `List-Unsubscribe` header detekci, `_asw_inbound_events` sheet creation, reply classifier, follow-up cadence engine, operator reply-handling UI ani zapisy do `apps-script/Config.gs`. Vsechny nove artefakty jsou oznacene **PROPOSED FOR C-07** a budou materializovany implementacnim taskem. Existing `apps-script/MailboxSync.gs` (`classifyReplyType_()`, `isBounceMessage_()`, `isOooMessage_()`) je VERIFIED reference pro reuse v implementaci.

Task dodava:
- 5-family event taxonomy (REPLY, BOUNCE, UNSUBSCRIBE primarni; UNKNOWN_INBOUND, COMPLAINT rezervni)
- `reply_event` schema (18 poli)
- `bounce_event` schema (15 poli)
- `unsubscribe_event` schema (14 poli)
- 4-vrstva separace (raw source → normalized event → lifecycle transition → review flag) s nezamenitelnym assignment per vrstvu
- Lifecycle mapping tabulka (8 radku) + 4 explicit invarianty:
  1. C-07 nezavadi zadny novy canonical CS1 state (REPLIED/BOUNCED/UNSUBSCRIBED existuji, NEEDS_MANUAL_REPLY je review flag ne state)
  2. `reply_needs_manual=TRUE` je **review flag** nad lifecycle state, NE canonical CS1 state (rozpor s uzivatelovym pripousteni "pokud neni" resolved — NENI)
  3. Terminalni states jsou final (kompletnosti priority: UNSUBSCRIBED > COMPLAINT > BOUNCED > REPLIED > UNKNOWN_INBOUND pro multi-event ordering)
  4. Multi-event-per-message ordering: pri souboznych signalech (reply + bounce + unsubscribe najednou) UNSUBSCRIBE wins (nejsilnejsi compliance signal)
- 3-tier stop rule model:
  - Tier 1 (follow-up stop): REPLY, UNKNOWN_INBOUND → jen konkretni thread/queue_row
  - Tier 2 (address stop): BOUNCE → vsechny dalsi sendy na tu emailovou adresu (pres C-04 novy block reason `ADDRESS_BOUNCED`)
  - Tier 3 (lead stop): UNSUBSCRIBE, COMPLAINT → vsechna outreach na lead napric kanaly (pres C-04 B7 `UNSUBSCRIBED`)
- Idempotency kontrakt:
  - Event-level: `ingest_event_id` = `gmail:{gmail_message_id}` | `esp:{provider_name}:{webhook_event_id}` | `manual:{operator_email}:{lead_id}:{event_type}:{SHA256(excerpt)}`
  - Lifecycle-level: transition guards (allow REPLIED→UNSUBSCRIBED, block UNSUBSCRIBED→REPLIED, etc.)
  - CS3 alignment: ingest job respektuje S1-S12 locking pattern, failure_class, dead-letter
- Source variants tabulka (4 zdroje: GMAIL_THREAD / GMAIL_DSN_THREAD / ESP_WEBHOOK / MANUAL_OPERATOR_INPUT) bez zavazku k implementaci
- 3 sample lifecycle scenare s plnymi tabulkami (positive reply / hard bounce DSN 5.1.1 / unsubscribe via List-Unsubscribe + reply body intent)
- Unknown/manual handling: `reply_class=UNCLASSIFIED` → konzervativni CS1 `EMAIL_SENT → REPLIED` + `reply_needs_manual=TRUE` review flag. Soft-bounce eskalace (threshold N=3) je PROPOSED dodatek.
- Cross-ref graf: LEADS ↔ `_asw_inbound_events` ↔ `_asw_outbound_queue` ↔ `_asw_logs` ↔ `_asw_dead_letters`
- Visibility v systemu: ktere LEADS sloupce se aktualizuji, kde zije operator review signal (bez implementace v B6)
- Auditability: retention policy pro `_asw_inbound_events` (append-only, immutable row-level), PII boundary
- Non-goals explicit: runtime mailbox ingest, ESP webhook endpoint, B6 UI, follow-up engine, Config.gs zapisy, C-06/C-05 schema mutation
- Acceptance checklist (16 polozek) + PROPOSED/INFERRED/VERIFIED label summary
- Nomenklatura rename disclosure: C-06 handoff tabulka labelovala old C-07 jako "Follow-up cadence engine"; vlna 7 reassigned C-07 na **reply/bounce/unsubscribe ingest**. Follow-up cadence engine je separatni downstream task (mimo C-07), pro ktery C-07 je **prerekvizita** (engine potrebuje vedet, kdy NEposilat).

**CS1 kompatibilita:**
- C-07 NIKDY neemituje novy canonical CS1 state. Pouziva existujici terminaly REPLIED (#15), BOUNCED (#16), UNSUBSCRIBED (#17) a transitions T20/T21/T22 z `docs/21-business-process.md`.
- `reply_needs_manual=TRUE` (puvodne v user briefu zvazovano jako "NEEDS_MANUAL_REPLY") je klasifikovano jako **review flag**, NE canonical state. Rozpor s uzivatelovym podminenym dotazem vyresen: NENI canonical, takze je to flag nad CS1.
- OOO (`email_reply_type=OOO`) podle docs/21 M-8 je auxiliary metadata bez lifecycle zmeny. C-07 respektuje — OOO event se zaznamena jako `reply_event` s `reply_class=OOO`, ale lifecycle mapping se preskakuje (lead zustava EMAIL_SENT, follow-up se ale pozastavi — hold pravidla mimo C-07).
- Terminalni priority pro multi-event-per-message: UNSUBSCRIBE > COMPLAINT > BOUNCE > REPLY > UNKNOWN_INBOUND. Silnejsi compliance / reputation signal prepisuje slabsi.

**CS3 kompatibilita:**
- Ingest job lock pattern reuse z CS3 (`LockService.getScriptLock()` per inbound run, separate from outbound S12).
- `failure_class` mapping: GMAIL_API_TIMEOUT → TRANSIENT, ESP_WEBHOOK_AUTH → PERMANENT, CLASSIFIER_AMBIGUOUS → AMBIGUOUS (defer to review flag).
- Dead-letter pattern: Pokud ingest opakovane fail (> N attempts), dead-letter row v `_asw_dead_letters` s `raw_source` + error kontext. `_asw_inbound_events` sam je append-only (nikdy se nedela retry primo do eventu — retry = novy ingest pokus).
- Idempotency key `ingest_event_id` respektuje CS3 S1-S12 deterministic-first-then-hash pattern.

**C-06 kompatibilita:**
- C-07 jen **cte** `provider_message_id` a `provider_thread_id` z C-06 `NormalizedSendResponse`, ktere queue worker zapsal do queue row pri SENT transition. C-07 nezapisuje do queue statusu ani do send response.
- Thread pairing: inbound Gmail thread ID match na queue row `provider_thread_id` (Gmail) nebo `In-Reply-To` header match na `provider_message_id` (ESP).
- `SendRequest.thread_hint` z C-06 je forward-compat pro follow-up engine (mimo C-07).

**C-05 kompatibilita:**
- C-07 jen cte `_asw_outbound_queue` radek (pres `outreach_queue_id` foreign key v event). Nezapisuje do queue status poli (`QUEUED`/`SENDING`/`SENT`/`FAILED`/`CANCELLED`).
- Navrh `last_inbound_event_id` je **PROPOSED dodatek** k C-05 queue schema (backlink pro audit), materializuje implementacni task, ne C-07.
- Po bounce/unsubscribe vznikne future block v C-04 gate, ne cancellation existujici queue row (SENT radek je terminalni per C-05).

**C-04 kompatibilita:**
- Tier 2 (address bounce) vyzaduje novy block reason `ADDRESS_BOUNCED` — **PROPOSED extension** k C-04. Do materializace implementacnim taskem pouziva C-04 existujici B8 (`SUPPRESSED`) jako interim.
- Tier 3 (unsubscribe/complaint) pouziva existujici C-04 B7 (`UNSUBSCRIBED`) — VERIFIED v C-04 spec.
- C-07 je **downstream** C-04 — inbound event vznikne az po sendu, ktery prosel C-04 gate. Signal ale zpetne propnuty do C-04 pres LEADS flag `unsubscribed` / `bounced_addresses` (PROPOSED storage).

**B6 vztah:**
- B6 (operator reply-handling UI) **NENI blocker** pro C-07 SPEC. C-07 definuje, co se do event store + review flag zapisuje; B6 implementuje, jak operator tyto signaly cte a reaguje.
- C-07 explicitne zminuje pouze "kde zije review signal" (LEADS sloupec `reply_needs_manual` + event store), ne UI.

Task NEDODAVA:
- Runtime mailbox ingest (`apps-script/MailboxSync.gs` extension pro unsubscribe/complaint)
- ESP webhook HTTP handler (Apps Script Web App doPost pro inbound)
- Gmail `List-Unsubscribe` header real-time detekci
- `_asw_inbound_events` sheet creation
- Reply classifier (`rule-based-v1`) runtime
- Soft-bounce escalation counter logiku
- Follow-up cadence engine
- Operator reply-handling UI (B6)
- Suppression list propagaci do C-04 (handoff)
- GDPR audit log (compliance task)
- Zapisy do `apps-script/Config.gs` enumu (`EMAIL_SYNC_STATUS` BOUNCED/UNSUBSCRIBED extensions, `EMAIL_REPLY_TYPE` UNSUBSCRIBE/COMPLAINT extensions)
- Mutaci C-05 queue schema ani C-06 sender interface
- Novy canonical CS1 state
- **Owner:** Claude
- **Code:** — (—)
- **Docs:** docs/24-automation-workflows.md, docs/20-current-state.md

### [C/C-08] Follow-up engine — SPEC-only sekvence / časování / stop podmínky pro follow-up automation — DONE
- **Scope:** Formalizuje follow-up engine — logickou vrstvu mezi C-05 queue a budoucim scheduler/worker runtime — definuje **3-stage sekvenci** (`initial` → `follow_up_1` → `follow_up_2`), maximum **2 follow-upy** po initial (total 3 queue rows per sekvence), **T+3 / T+7 business days** rozestupy pocitane z actual `sent_at` predchozi stage, **quiet hours 09:00–17:00 Europe/Prague**, **5 stop condition kategorii** (REPLY / UNSUBSCRIBE / BOUNCE / MANUAL_BLOCK / REVIEW_FLAG|UNKNOWN_INBOUND) + **5 composite stop invariants** (vcetne C-04 gate re-check s `is_followup=true` + C-07 inbound event store check + CS1 terminal lookup), **triple-redundant reply guard** (CS1 REPLIED + C-04 B3 + inbound event store), **3 decision outcomes** (AUTO_INSERT / REVIEW_REQUIRED / STOP), **pregenerate-vs-regenerate** tabulku (IMMUTABLE recipient/sender_identity/preview_url/personalization vs REGENERATED subject/body/CTA vs STAGE-DERIVED thread_hint/scheduled_at/priority/idempotency_key), idempotency pattern `followup:{lead_id}:{sequence_root_queue_id}:{sequence_stage}`, manual block model diferencovany od UNSUBSCRIBE, **5-vrstvovou tvrdou separaci** (stage / lifecycle / queue status / inbound event / review flag) s 5 zakazanymi kolapsi, sample queue rows pro vsechny 3 stage s field-level INHERITED/REGENERATED/STAGE-DERIVED/IMMUTABLE markers, **5 sample lead timelines** (silent happy path / reply → stop / bounce → stop / unsubscribe → stop / unknown-inbound → review → manual_stop), auditability approach (`_asw_logs` 8 event types + cross-ref graph + observability bez B6 UI), handoff tabulku na C-04/C-05/C-06/C-07/CS1/CS2/CS3/scheduler/B6/copy-gen/C-09/implementation task (12 radku).

Scope je **SPEC-only** — neimplementuje scheduler runtime, cron trigger, queue worker claim loop, mailbox sync runtime, ESP webhook HTTP handler, frontend UI (B6), text-generation engine, holiday calendar detail ani zapisy do `apps-script/Config.gs`. Vsechny nove artefakty jsou oznacene **PROPOSED FOR C-08** a budou materializovany implementacnim taskem. B6 (operator reply-handling UI) **NENI blocker** pro C-08 SPEC — operator muze `followup_manual_block` flag nastavit rucne v Google Sheets bunce.

Task dodava:
- 3-stage follow-up sequence definition (`initial` / `follow_up_1` / `follow_up_2`) s per-stage tabulkou (purpose, timing, input, output, queue row, thread hint)
- Max follow-up count invariant (max=2, initial nepocita, total 3 rows per sekvence) + 4 enforcement mechanisms (sequence counter check / idempotency key stage-aware / stage progression deterministic / lookup na poslední SENT row v sekvenci)
- Timing rules: T+3 business days od `initial.sent_at` → `follow_up_1.scheduled_at`; T+7 business days od `follow_up_1.sent_at` → `follow_up_2.scheduled_at`; vzdy od **actual** `sent_at` (ne scheduled/queued/created); business days = Po-Pá, stat. svatky mimo v1.0; quiet hours 09:00–17:00 Europe/Prague deterministic posun
- 5 stop condition kategorii s tabulkou (co aktivuje / scope / zastavi jen automatiku nebo i manual / z ktereho tasku pochazi)
- 5 composite stop invariants (CS1 terminal lookup / C-04 gate re-check s `is_followup=true` / C-07 inbound event store check / manual block flag / OOO review hold s PROPOSED 14 dni pauze)
- **Triple-redundant reply guard** (garantuje acceptance criteria #4 "lead s reply uz nikdy nedostane follow-up") pres (a) CS1 state check, (b) C-04 gate re-check B3, (c) inbound event store check
- Pregenerate vs regenerate rules per field (14-radkova tabulka s Initial / follow_up_1 / follow_up_2 / pravidlo sloupci + 3 klicove invariants)
- 3 decision outcomes (AUTO_INSERT / REVIEW_REQUIRED / STOP) s explicit podminkami pro kazdy + role `reply_needs_manual` + role `unknown_inbound` + dalsi review guardy
- **5-vrstva tvrda separace** (1. Follow-up stage / 2. Lifecycle state / 3. Queue status / 4. Inbound event / 5. Review flag) s tabulkou "co to je / kde zije / hodnoty / kdo meni" + 5 zakazanych kolapsi + engine konzumacni mapa
- Sample queue rows (initial, follow_up_1, follow_up_2) s field-level rozlisenim INHERITED / REGENERATED / STAGE-DERIVED / STAGE-OVERRIDE / IMMUTABLE
- **5 sample lead timelines:**
  - (1) silent happy path (initial → follow_up_1 → follow_up_2 bez reakce → SEQUENCE_COMPLETE)
  - (2) reply → stop (initial → reply → CS1 REPLIED → `followup_skip` stop_reason=REPLY)
  - (3) bounce → stop (initial → hard bounce DSN 5.1.1 → CS1 BOUNCED → Tier 2 address stop, PROPOSED C-04 `ADDRESS_BOUNCED`)
  - (4) unsubscribe → stop (initial → follow_up_1 → reply "unsubscribe" → CS1 UNSUBSCRIBED → Tier 3 lead stop, `followup_skip` stop_reason=UNSUBSCRIBE)
  - (5) unknown-inbound → review → manual_stop (initial → reply s UNCLASSIFIED class → `reply_needs_manual=TRUE` → `followup_review_required` → operator rozhodne stop_followup → `followup_manual_stop`)
- Auditability: `_asw_logs` events pro C-08 (8 PROPOSED event types: `followup_insert`, `followup_skip`, `followup_review_required`, `followup_pause_ooo`, `followup_manual_stop`, `followup_stale_review_abandoned`, `followup_engine_run_summary`, `followup_auto_block_soft_bounce`), cross-ref graph (LEADS ↔ queue ↔ inbound events ↔ logs ↔ dead_letters), observability bez B6 UI (query patterns)
- Idempotency pattern `followup:{lead_id}:{sequence_root_queue_id}:{sequence_stage}` + 4 invariants (unique per stage×sekvence×lead, safe-to-run-twice, race-safe, ne-rollback-safe) + design rationale (proc ne obsahovy hash pro follow-upy)
- Manual block model: `followup_manual_block` boolean flag na LEADS + kdo nastavi (operator manual / B6 budouci / engine auto-set edge case) + co presne zastavi (jen automatiku, ne existing QUEUED rows bez C-05 CANCELLED) + reversibilita + diferenciace od UNSUBSCRIBE (6-dimension table: zdroj / scope / CS1 state change / reversible / storage / compliance)
- Handoff tabulka (12 radku) na C-04/C-05/C-06/C-07/CS1/CS2/CS3/scheduler/B6/copy-gen/C-09/implementation task s per-row popisem "jak C-08 konzumuje" + "jak C-08 prispiva"
- Non-goals explicit (14 polozek)
- Acceptance checklist (16 polozek) + PROPOSED/INFERRED/VERIFIED label summary (sekce 18)

**CS1 kompatibilita:**
- C-08 NIKDY neemituje novy canonical CS1 state. Pouziva existujici terminaly REPLIED (#15), BOUNCED (#16), UNSUBSCRIBED (#17), DISQUALIFIED + T20/T21/T22 transitions z `docs/21-business-process.md`.
- Engine **cte** lifecycle state pres LEADS (pro terminal check) ale **NIKDY nezapisuje** do `lifecycle_state` — to dela C-05 queue worker (T17, T18) + C-07 ingest (T20, T21, T22) + operator.
- Triple-redundant reply guard: (a) CS1 terminal check `lifecycle_state IN terminal_states`; (b) C-04 gate re-check B3 `TERMINAL_STATE_REPLIED`; (c) C-07 inbound event store `event_type=REPLY` existence check.

**CS2 kompatibilita:**
- Engine je novy CS2 step: `followup_engine_run` — batch daily orchestrator (typically 23:00 Europe/Prague cron).
- Jeden run eviduje `run_id` → `_asw_logs` event `followup_engine_run_summary` s `run_id`, `leads_evaluated`, `inserts`, `skips`, `reviews`, `pauses`, `duration_ms`.
- Respektuje CS2 event-driven pattern: engine se spusti periodicky + reactivly (po inbound event klidne hned re-vyhodnoti dotcene leady — PROPOSED optimalizace, v1.0 postaci daily batch).

**CS3 kompatibilita:**
- Engine run respektuje CS3 `LockService.getScriptLock()` pattern (stejne jako C-05 worker + C-07 ingest).
- `failure_class` mapping pro engine errors: `ENGINE_TIMEOUT` → TRANSIENT, `C04_GATE_FAIL` → PERMANENT (lead-level, operator musi resolve), `PARENT_NOT_SENT` → TRANSIENT (wait pro SENT), `MAX_RETRIES_EXCEEDED` → PERMANENT.
- Dead-letter pattern: pokud engine run failne pri inserting konkretni follow-up, row se presune do `_asw_dead_letters` s diagnostikou (retry = novy engine run, idempotency klic garantuje ze nedojde k duplicitnimu insertu).
- Idempotency key `followup:{lead_id}:{sequence_root_queue_id}:{sequence_stage}` respektuje CS3 S1-S12 deterministic-first-then-hash pattern (stage scope = deterministic, content hash se nepouziva — viz design rationale).

**C-04 kompatibilita:**
- Engine **re-vola** C-04 sendability gate pred kazdym follow-up insert. Predava `is_followup=true` context → C-04 bypasses B16 `ALREADY_SENT` (initial uz byl odeslan, to je expected).
- Gate vrati `AUTO_SEND_ALLOWED` / `MANUAL_REVIEW_REQUIRED` / `SEND_BLOCKED` — engine route na AUTO_INSERT / REVIEW_REQUIRED / STOP.
- Gate zohlednuje existing B3/B4/B5 (CS1 terminal), B7 (UNSUBSCRIBED), B8 (SUPPRESSED), PROPOSED C-07 `ADDRESS_BOUNCED`.
- PROPOSED C-04 extension: `is_followup` context parameter — do materializace pouziva operator interim "initial je odeslan = nevytvaret follow-up" pres C-04 fallback logic (degraded, vyzaduje manual handling).

**C-05 kompatibilita:**
- Engine je **C-05 producer** — vytvari nove queue rows stejne jako C-04 pro initial. Respektuje C-05 insert contract (sekce 5 docs/24).
- PROPOSED C-05 schema extensions: `sequence_stage` (string enum), `parent_queue_id` (string nullable), `sequence_root_queue_id` (string), `sequence_position` (integer 1-indexed), `created_from_followup_engine_run` (string audit ref).
- Do materializace PROPOSED fields engine pracuje s 3 samostatnymi queue rows per sekvence (initial + follow_up_1 + follow_up_2) bez explicitniho stage metadata — funkcni, ale ztraci audit granularitu.
- Engine **nezapisuje** do existing queue row (parent row je immutable po SENT per C-05). Kazda stage = novy row.
- Idempotency: `followup:{lead_id}:{sequence_root_queue_id}:{sequence_stage}` respektuje C-05 unique-per-idempotency_key invariant.

**C-06 kompatibilita:**
- Engine populuje `SendRequest.thread_hint` (C-06 merged PR #29 forward-compat pole):
  - initial: `thread_hint = null`
  - follow_up_1: `thread_hint = {thread_id: initial.provider_thread_id, in_reply_to_message_id: initial.provider_message_id}`
  - follow_up_2: `thread_hint = {thread_id: initial.provider_thread_id, in_reply_to_message_id: follow_up_1.provider_message_id}`
- Engine **nezapisuje** do C-06 sender interface ani `NormalizedSendResponse`. Jen **cte** `provider_message_id` + `provider_thread_id` + `sent_at` z C-06 response (propsany do queue row pri SENT transition per C-05).
- Gmail adapter pouzije `GmailApp.getThreadById(thread_id).reply(body)` nebo ESP adapter prevede na `In-Reply-To` + `References` headers — to je C-06 implementacni task, ne C-08.

**C-07 kompatibilita:**
- Engine **cte** `_asw_inbound_events` pro stop detection. Respektuje C-07 3-tier stop model:
  - Tier 1 (REPLY, UNKNOWN_INBOUND): sekvence stop (per thread / sekvence)
  - Tier 2 (BOUNCE): sekvence stop + Tier 2 address stop siri na dalsi sekvence na tu adresu (pres C-04 PROPOSED `ADDRESS_BOUNCED`)
  - Tier 3 (UNSUBSCRIBE, COMPLAINT): celkovy lead stop napric kanaly (pres C-04 B7 + B8)
- OOO (`reply_class=OOO`) = **pauze** (ne stop) — engine odlozi next stage o PROPOSED 14 kalendarnich dni, pak re-vyhodnoti.
- `unknown_inbound` → `reply_needs_manual=TRUE` → REVIEW_REQUIRED. Engine NIKDY auto-inserts pri review flag.
- Engine **nezapisuje** do `_asw_inbound_events` (append-only, jen C-07 ingest).

**B6 vztah:**
- B6 (operator reply-handling UI) **NENI blocker** pro C-08 SPEC. Operator muze v interim manage follow-up manual block + review resolution primo v Google Sheets bunce.
- B6 (budouci task) agreguje do per-lead view: queue sekvence rows, `_asw_logs` follow-up events, LEADS flagy (`reply_needs_manual`, `followup_manual_block`, `followup_review_required`, `unsubscribed`), pause/stop buttons.
- PROPOSED operator actions pro B6 (mimo C-08 scope): `resolve_review → continue_followup`, `resolve_review → stop_followup`, `set_manual_block`, `clear_manual_block`.

Task NEDODAVA:
- Runtime scheduler / cron trigger / daily batch job v Apps Script
- Queue worker claim loop (C-05 implementacni task)
- Mailbox sync runtime (C-07 implementacni task)
- ESP webhook HTTP handler (C-07 implementacni task)
- Frontend UI pro follow-up management (B6)
- Text-generation engine pro stage-specific copy (follow-up copy-gen task)
- Holiday calendar implementaci (ops config)
- Timezone-per-lead personalizaci (v1.0 single timezone)
- Multi-channel follow-up (SMS, phone, LinkedIn)
- A/B testing / experiment harness
- Zapisy do `apps-script/Config.gs` (PROPOSED enumy + Script Properties)
- Mutaci C-05 queue schema (PROPOSED extensions pouze)
- Mutaci C-06 sender interface
- Mutaci C-07 inbound event schema
- Novy canonical CS1 state
- **Owner:** Claude
- **Code:** — (—)
- **Docs:** docs/24-automation-workflows.md, docs/20-current-state.md

### [C/C-09] Exception queue & human-in-the-loop — SPEC-only kontrakt pro centralizovanou review queue + operator resolution — DONE
- **Scope:** Formalizuje **centralizovanou exception queue** a **operator resolution kontrakt** pro pripady, ktere automat neumi / nesmi rozhodnout sam. Misto "tichych" skipu a sheet error sloupcu roztrousenych po LEADS (`preview_error`, `email_reply_type=UNCLASSIFIED`, `bounce_class=SOFT`) nebo `_asw_dead_letters` (CS3 technicky retry exhaustion) definuje C-09 **jeden human-facing sheet** (`_asw_exceptions`) s jasnym resolution kontraktem, priority modelem, SLA targety, auditabilitou a deterministickym flow re-entry.

Scope je **SPEC-only** — neimplementuje runtime review worker, cron trigger, queue worker, mailbox sync runtime, ESP webhook, frontend UI (B6), suppression list management, AI-based auto-triage ani zapisy do `apps-script/Config.gs`. Vsechny nove artefakty jsou oznacene **PROPOSED FOR C-09** a budou materializovany implementacnim taskem. B6 (operator exception dashboard UI) **NENI blocker** pro C-09 SPEC — operator muze v interim resolvovat exceptions primo v Google Sheets bunce (`_asw_exceptions` row edit).

Task dodava:
- **Dependency narrowing C-03 → CS3:** explicitni dokumentace proc (C-03 neexistuje, C3 je governance unrelated, CS3 je jediny reliability prerekvizita). Uvod docs/24 sekce + tento task record.
- **Exception taxonomy:** 10 exception typu (6 kanonickych z user briefu + 4 rozsireni z repo analyzy): `preview_render_fail`, `missing_email`, `ambiguous_duplicate`, `broken_personalization`, `provider_fail_after_max_retries`, `unclear_reply`, `sendability_manual_review`, `compliance_hard_stop`, `normalization_error`, `followup_stale_review`. Kazdy typ ma popis, odkud vznika, severity tier, blocking-vs-review, retry-eligibility, typicky operator role.
- **Priority model:** 4 tiers P1-P4 (compliance > delivery > content > data-quality) + SLA targets (P1 < 24h, P2 < 2 dny business, P3 < 5 dni business, P4 < 10 dni business), sort order (`priority ASC` / `detected_at ASC` / `exception_type alphabetic` tiebreaker), auto-priority-bump pravidla (pending > 2 SLA → promote; P4 pending > 14 dni → auto-downgrade na CLOSED_STALE; C-08 sekvence v OOO hold > 7 dni → promote P2), compliance precedence invariant (P1 nesmi byt merged/approved/retried, jen reject + audit note).
- **Co jde do manual review:** 4-cestny routing table (transient retry-exhausted / permanent classifier-status / review-flag / compliance-hard-stop) + invariant "problematicke leady nejsou ztracene".
- **Exception queue schema:** `_asw_exceptions` sheet 24 poli (append-only-with-resolution-update) — `exception_id` (format `EX-{YYYY-MM-DD}-{NNNNN}`), `lead_id` (FK), `outreach_queue_id` (FK C-05, nullable), `source_job_id` (FK batch), `inbound_event_id` (FK C-07, nullable), `exception_type` (10-value enum), `exception_priority` (1-4), `exception_status` (5-value enum), `detected_at` / `detected_by_step` (step identifier e.g. `A-08:processPreviewQueue`), `summary` (max 500 chars), `diagnostic_payload_json` (PII-masked, max 4KB), `operator_decision` (4-value enum), `operator_note`, `operator_edited_fields_json`, `resolved_at` / `resolved_by`, `resolution_outcome` (6-value enum), `retry_reference_queue_id`, `retry_reference_exception_id` (retry chain), `next_action` (6-value enum), `cs2_run_id`, `related_dead_letter_id`, `sla_target_at`.
- **Minimal review interface:** sheet-row-based read-only/editable/derived fields, on-edit trigger contract, B6-less interim operator workflow pres Google Sheets bunku.
- **Resolution outcomes:** 4 discrete operator decisions (`approve`, `reject`, `retry`, `edit_and_continue`) s kompletnim kontraktem per outcome (definice / kdy pouzit / kdo muze / co se stane / next_action derivation / invariants / vytvori novy queue row?).
- **Resolution outcome × exception type compatibility matrix:** enforced at resolution time (napr. `compliance_hard_stop` + `approve` = validation error; `ambiguous_duplicate` + `retry` = NE, jen merge/reject).
- **Resolution flow pseudocode:** deterministicky dispatcher od `operator_decision` + `exception_type` → `next_action` → downstream trigger. 5 flow re-entry paths (`RETURN_TO_C04_GATE`, `CREATE_NEW_QUEUE_ROW`, `RESUME_C08_SEQUENCE`, `UPDATE_CS1_LIFECYCLE`, `LEAD_RE_INGEST`, `TERMINAL_STOP`).
- **Exception status model:** 5 statusu (OPEN / IN_REVIEW / RESOLVED / CLOSED / CANCELLED) s allowed/disallowed transitions + state diagram. Invariants: CLOSED/CANCELLED terminal (no reopen — novy exception row s `retry_reference_exception_id`); OPEN → RESOLVED NELZE (musi projit IN_REVIEW); IN_REVIEW → CLOSED NELZE (musi projit RESOLVED); RESOLVED je mezistav (cekame na engine downstream).
- **5 sample exception rows** s realistickym `diagnostic_payload_json` (preview_render_fail, missing_email, ambiguous_duplicate, unclear_reply, compliance_hard_stop).
- **Sample resolutions:** 4 full operator workflows ilustrujici each outcome.
- **Flow re-entry / continuation rules:** tabulka per resolution outcome × exception type → next_action. 5 invariants (napr. retry chain depth limit=3, CANCELLED/CLOSED immutable, edit_and_continue nesmi mutovat immutable fields, downstream failure = nova exception ne reopen, compliance hard-stop vzdy terminal).
- **Auditability / observability:** 9 `_asw_logs` event types (`exception_created`, `exception_claimed`, `exception_released`, `exception_resolved`, `exception_flow_reentry`, `exception_closed`, `exception_cancelled`, `exception_priority_bumped`, `exception_retry_chain_broken`) + cross-ref graph (LEADS ↔ exceptions ↔ queue ↔ inbound events ↔ logs ↔ dead_letters) + observability query patterns bez B6 UI.
- **Idempotency / dedupe rules:** per-type dedup key pattern (napr. `exc:preview_render_fail:{queue_id}`, `exc:unclear_reply:{inbound_event_id}`, `exc:compliance_hard_stop:{lead_id}:{reason_code}`), recent-closed window (7 dni — nezakladej duplicitni exception pokud nedavno closed), reopen rules (vzdy novy row + `retry_reference_exception_id` pointer), CS3 alignment (exception je human-facing vrstva nad dead-letter, ne konkurenci).
- **Human-in-the-loop boundaries:** oddelene compliance vs operational judgment, decision compatibility matrix, kdo smi vs kdo musi, audit-immutable po resolve.
- **Handoff tabulka (12 radku)** na C-04/C-05/C-06/C-07/C-08/CS1/CS2/CS3/A-02-A-08/B6/implementacni task/future C-10 s per-row popisem "jak C-09 konzumuje" + "jak C-09 prispiva".
- **Non-goals (14 polozek)** explicit — runtime review worker, frontend UI, mailbox sync, provider webhook, queue worker, AI auto-triage, Config.gs zapisy, novy canonical CS1 state, suppression list centralizace, per-operator SLA, multi-tenant routing, notification system, archive/retention detail, detectException() hooks v A-*/B-*/C-* steps.
- **Acceptance checklist (19 polozek)** vcetne dependency narrowing C-03 → CS3 explicit dokumentace.
- **PROPOSED vs INFERRED vs VERIFIED label summary** (sekce 20).

**CS1 kompatibilita:**
- C-09 NIKDY neemituje novy canonical CS1 state. Pouziva existujici `REVIEW_REQUIRED` (CS1 #18 non-terminal review flag) pro exception-induced review + canonical terminals DISQUALIFIED (#14), REPLIED (#15), BOUNCED (#16), UNSUBSCRIBED (#17).
- Exception resolution muze triggerovat CS1 transition pres `UPDATE_CS1_LIFECYCLE` next_action (T14 DISQUALIFIED, T21 BOUNCED, T22 UNSUBSCRIBED). Zapis do `LEADS.lifecycle_state` dela engine resolution dispatcher, ne exception row sama.

**CS2 kompatibilita:**
- C-09 detection engine je **novy CS2 step** (reactive, triggered z existujicich steps pri fail). Resolution flow re-entry je orchestrator-driven (next CS2 run pro downstream step).
- PROPOSED CS2 kroky: `exception_detector` (hook do existing steps — A-02/A-03/A-05/A-06/A-07/A-08/B-04/C-04/C-05/C-06/C-07/C-08 pri fail signal) + `exception_resolution_dispatcher` (po operator resolve).

**CS3 kompatibilita:**
- C-09 je **downstream konzument** CS3 dead-letter. `provider_fail_after_max_retries` vznika z CS3 `_asw_dead_letters` row, FK cross-ref pres `related_dead_letter_id`.
- CS3 technicky dead-letter (retry exhausted) vs C-09 business exception (operator review) — jasne oddelene vrstvy. C-09 rozsiruje CS3 audit trail human-facing vrstvou bez mutace CS3 schema.
- `failure_class` mapping pro C-09 engine errors (PROPOSED): `EXCEPTION_INSERT_FAIL`→TRANSIENT, `DEDUP_KEY_CONFLICT`→TRANSIENT, `LEAD_NOT_FOUND`→PERMANENT. LockService pattern dedeno z CS3.

**C-04 kompatibilita:**
- C-04 gate outcome `MANUAL_REVIEW_REQUIRED` → C-09 exception creation (`sendability_manual_review`, reasons R1-R3).
- C-04 `SEND_BLOCKED` reasons B7 (UNSUBSCRIBED), B8 (SUPPRESSED), PROPOSED `ADDRESS_BOUNCED` → `compliance_hard_stop` (P1 terminal reject-only).
- PROPOSED C-04 `MANUAL_REVIEW_OVERRIDE` context parameter — po `approve` resolution operator triggers re-eval gate s override flag.

**C-05 kompatibilita:**
- `FAILED` queue status + fail fields → CS3 dead-letter → C-09 exception (`provider_fail_after_max_retries`).
- Retry outcome vytvari novy queue row (C-09 je producer), idempotency_key rozsiren o `retry_of=exception_id` suffix per PROPOSED extension.
- C-09 **nezapisuje** do existing queue row — retry = novy row per C-05 invariant.

**C-06 kompatibilita:**
- `NormalizedSendErrorClass` + `failure_class=PERMANENT` (napr. `INVALID_RECIPIENT`, `AUTH_FAILED`) po max_attempts=1 exhausted → CS3 dead-letter → C-09.
- C-09 **nemutuje** C-06 `EmailSender` interface ani `NormalizedSendResponse`.

**C-07 kompatibilita:**
- `reply_class=UNCLASSIFIED` + `reply_needs_manual=TRUE` → C-09 exception (`unclear_reply`, P2).
- `unknown_inbound` event → exception.
- Operator reclassification z resolve (approve = klasifikuj jako POSITIVE; reject = spam/noise) aktualizuje LEADS reply classification pres `UPDATE_CS1_LIFECYCLE` nebo `RESUME_C08_SEQUENCE` next_action.
- C-09 **nemutuje** `_asw_inbound_events` schema (append-only, jen C-07 ingest).

**C-08 kompatibilita:**
- `REVIEW_REQUIRED` decision outcome → C-09 exception (`sendability_manual_review` nebo `unclear_reply` dle duvodu).
- `followup_stale_review_abandoned` (> 30 dni pending review) → C-09 exception (`followup_stale_review`, P4).
- Resolution `approve` / `edit_and_continue` → C-08 engine resumes sequence (next_action=`RESUME_C08_SEQUENCE`).
- Resolution `reject` → C-08 sequence stop (next_action=`TERMINAL_STOP`).

**B6 vztah:**
- B6 (budouci operator exception dashboard) **NENI blocker** pro C-09 SPEC. Operator v interim resolvuje exceptions **primo v Google Sheets** bunce (`_asw_exceptions` row edit s on-edit trigger).
- C-09 definuje read/write contract: `_asw_exceptions` sheet schema + resolution flow state machine + editable vs read-only fields. B6 agreguje do per-lead view + per-operator queue.

**Future C-10 (suppression list aggregation) vztah:**
- Zadna direktni dependency. C-09 audit trail pro `compliance_hard_stop` resolve + `unsubscribed=TRUE` poskytuje source data pro budouci centralizovany suppression list.

Task NEDODAVA:
- Runtime review worker / cron / scheduler v Apps Script
- Queue runtime (C-05 implementacni task)
- Mailbox sync runtime / ESP webhook runtime (C-07 implementacni task)
- Frontend UI (B6 budouci task)
- Suppression list management (C-10 future task)
- AI-based auto-triage / priority prediction (v2.0)
- Notification system (email alerts, Slack integration)
- Exception archive / retention policy detail
- Zapisy do `apps-script/Config.gs` (PROPOSED enumy materializuje implementacni task)
- Novy canonical CS1 state
- Mutaci C-04 gate signature / C-05 queue schema / C-06 sender interface / C-07 inbound event schema / CS3 dead-letter schema (pouze EXTENSIONS PROPOSED)
- `detectException()` helper hooks v A-02/A-03/A-05/A-06/A-07/A-08/B-04/C-04/C-05/C-06/C-07/C-08 (implementacni task)
- SLA auto-bump cron runtime
- Compatibility matrix validation logic (runtime enforcement)
- **Owner:** Claude
- **Code:** — (—)
- **Docs:** docs/24-automation-workflows.md, docs/20-current-state.md

### [C/C-10] Automation performance report — SPEC-only kontrakt pro funnel / operational / quality metriky cele automatizace — DONE
- **Scope:** Formalizuje **authoritative specifikaci** pro reportovaci vrstvu nad celou automatizaci Autosmartweby — od INGEST (A-01..A-10) pres PREVIEW/OUTREACH (B-01..B-05, C-04..C-06) po INBOUND/LIFECYCLE (C-07, CS1) a RELIABILITY (CS3, C-09). Predmetem SPEC je **jak automatizace cislem odpovi na otazky** typu "kolik leadu dnes proslo do BRIEF_READY?", "jaka je reply rate za minuly tyden?", "kde se zastavuje funnel?", "splnujeme SLA pro review queue?", "kolik exceptions vznikli na 1000 poslanych mailu?".

Scope je **SPEC-only** — neimplementuje runtime report worker, cron trigger, `buildPerformanceReport_()` helper, `_asw_perf_reports` sheet creation, Config.gs zapisy, frontend dashboard UI, alerting integraci (email/Slack notifications), BI export, ani `apps-script/PerfReport.gs` kod. Vsechny nove artefakty jsou oznacene **PROPOSED FOR C-10** a budou materializovany implementacnim taskem.

Task dodava:
- **Dependency narrowing `A-09, C-01 az C-09` → `A-09, CS1, CS2, CS3, C-04..C-09`:** explicitni dokumentace proc (C-01/C-02/C-03 neexistuji, C2/C3/C4 jsou governance unrelated, CS1/CS2/CS3 jsou foundational SPEC prerekvizity). Uvod docs/24 C-10 sekce + tento task record.
- **Reporting grain taxonomy:** 5 grains (G1 per-job pro ingest; G2 per-day pro operational rhythms; G3 per-run pro CS2 orchestrator visibility; G4 per-stage pro funnel analysis; G5 per-segment pro business slice) s invariants "jedna zprava = jeden grain" a "grains jsou ortogonalni ne nested".
- **3-dimension reporting taxonomy (tvrda separace):** **Dim A — Funnel** (10 canonical progression stages F1-F10 mapovane na CS1 az #12 OUTREACH_READY; invariant monotonic progression bez back-edge). **Dim B — Queue** (5 operational statusu QUEUED/SENDING/SENT/FAILED/CANCELLED per C-05 — ORTOGONALNI nad queue radkem, NEJSOU funnel stages). **Dim C — Outcome** (4 terminalni outcomes DISQUALIFIED/REPLIED/BOUNCED/UNSUBSCRIBED mapovane na CS1 terminaly resp. C-07 event_type — ortogonalni end-of-lifecycle metrics, NEJSOU funnel stages). Tvrde oddeleni invariantem: funnel stage ≠ lifecycle state ≠ queue status ≠ outcome ≠ review flag ≠ alert state. Zakazane kolapsy: NIKDY "email_queued funnel stage" (= queue_queued_count v dim B); NIKDY "replied funnel stage" (= outcome_replied_count v dim C); NIKDY mixing queue statusu / outcomes do funnel taxonomy.
- **Funnel metrics (dim A):** 10 stage counts (F1..F10) + 9 funnel-internal conversion rates (conv_f1_to_f2 .. conv_f9_to_f10) + `funnel_yield_to_outreach_ready` (F10/F1) + drop-off counts (worst-stage by rate + worst-absolute-count).
- **Queue metrics (dim B):** queue_queued/sending/sent/failed/cancelled_count + queue_status_breakdown_json + send_success_rate (dim B interna: sent/(sent+failed)) + queue_latency_avg_ms.
- **Outcome metrics (dim C):** outcome_disqualified_count + outcome_replied_count + outcome_bounced_count + outcome_unsubscribed_count + reply_class/bounce_class/unsubscribe_source breakdowns.
- **Cross-dimension rates (Blok D):** send_yield (A→B: queue_sent / f10_outreach_ready), reply_yield / bounce_yield / unsubscribe_yield (B→C: outcome_* / queue_sent_count), delivery_yield (A+B: (sent − bounced) / f10_outreach_ready).
- **Review load (Blok E, ortogonalni):** blocked_by_sendability_count + review_queue_load_count + manual_review_entered_count + sequence_followup_reach_count.
- **Operational metrics:** processing time stats (avg_ms / p50_ms / p95_ms / max_ms per step pres `_asw_logs` consecutive timestamps), fail_rate (fail / total per step), retry_count + retry_success_rate (CS3 retry matrix), dead_letter_count + dead_letter_rate (CS3 `_asw_dead_letters`), review_queue_load (C-09 open exceptions snapshot), review_sla_compliance_rate (resolved_on_time / total_resolved per SLA tier), stale_pending_count (P4 > 14 dni pending), queue_latency_avg_ms (C-05 queued_at → sent_at), exception_rate (C-09 new exceptions per 1000 leadu per period).
- **Quality metrics:** bounce_rate (C-07 BOUNCE events / sent), hard_bounce_rate (`bounce_class=HARD` / sent), soft_bounce_rate (`bounce_class=SOFT` / sent), reply_rate (C-07 REPLY / sent), positive_reply_rate (`reply_class=POSITIVE` / REPLY), unclear_reply_rate (`reply_class=UNCLASSIFIED` / REPLY), unsubscribe_rate (C-07 UNSUBSCRIBE / sent), followup_yield_rate (C-08 follow-up stages generated response vs initial-only), preview_approval_rate (PREVIEW_READY_FOR_REVIEW → APPROVED / total reviewed), exception_rate_per_stage (C-09 exceptions / stage throughput), compliance_hard_stop_rate (C-04 `compliance_hard_stop` + B7/B8 blocked / total evaluated).
- **Metric definition contract template:** kazda metrika ma kontrakt (`metric_id`, `name`, `grain`, `unit`, `formula`, `source_fields[]`, `null_handling`, `min_sample_size`, `value_range`, `baseline_ref`, `interpretation`, `alert_enabled`, `warning_threshold`, `critical_threshold`, `threshold_type`) — sekce 8 + 2 plne priklady (bounce_rate, review_queue_load).
- **Alert threshold model:** WARNING / CRITICAL severity, 3 threshold typy (ABS absolute, REL relative vs baseline, COMBO kombinovany), min_sample invariant (pod min_sample = `summary_status=INCOMPLETE` misto alert), baseline reference pattern (previous_day / previous_week / rolling_7d / rolling_30d / absolute_number).
- **Bottleneck detection 3-lens algoritmus:** funnel lens (najit stage F_n kde conv_rate(F_n → F_{n+1}) < baseline - threshold; weight by absolute drop-off count), latency lens (najit step s p95_ms > baseline * multiplier; weight by throughput), review lens (najit priority tier s SLA compliance < threshold; weight by open count). Priority tiebreaker: funnel > latency > review pri equal severity; alphabetical stage_id pri equal within lens.
- **Report schema `_asw_perf_reports`:** 67-field sheet (append-only) v blokove strukture podle dimenze: metadata (8) + Blok A funnel/dim A (14: 10 stage counts + 9 conv rates + funnel_yield + drop-off 3) + Blok B queue/dim B (8: 5 statusy + breakdown_json + send_success_rate + queue_latency) + Blok C outcome/dim C (4: disqualified/replied/bounced/unsubscribed counts) + Blok D cross-dim rates (5: send_yield / reply_yield / bounce_yield / unsubscribe_yield / delivery_yield) + Blok E review load (4: blocked/review_queue/manual_review_entered/sequence_followup_reach) + operational (9) + quality aliases (8) + synthetic summary (7). Per-field VERIFIED / INFERRED / PROPOSED label.
- **Sample report:** full realisticky G2 per-day report pro 2026-04-19 s 5 jobs, AT_RISK status, 4 warnings + 3 criticals + bottleneck detekce (primary lens=funnel, stage F5→F6 preview approval rate 62% vs baseline 85%).
- **Comparison rules per grain:** G1 job-vs-job same portal/segment; G2 day-vs-day (weekday-matching DOW grouping); G3 run-vs-run same step; G4 stage-vs-stage cross-day rolling; G5 segment-vs-segment within same day. Outlier handling: >3 stddev excluded pres `PERF_REPORT_OUTLIER_EXCLUDE_STDDEV` Script Property.
- **Auditability:** 5 `_asw_logs` event types (`performance_report_started` / `performance_report_generated` / `performance_report_failed` / `performance_alert_threshold_crossed` / `performance_bottleneck_detected`) + cross-ref graph (`_ingest_reports` A-09 ↔ `_asw_perf_reports` C-10 ↔ source tables LEADS/queue/inbound_events/exceptions/dead_letters ↔ `_asw_logs`) + observability query patterns bez dashboard UI.
- **Known limitations:** per-layer dependency completeness flags (`data_completeness_flags_json` structure) — ze pokud C-05/C-06/C-07/C-09 nejsou runtime, report ma null values + `INCOMPLETE` summary_status + data_completeness_flags_json audit trail (proc null).
- **Handoff tabulka (14 radku):** A-09 / CS1 / CS2 / CS3 / C-04 / C-05 / C-06 / C-07 / C-08 / C-09 / future dashboard / future alerting / future BI-export / future runtime-worker. Per-row "jak C-10 konzumuje" + "jak C-10 prispiva".
- **Non-goals (18 polozek):** explicit — runtime worker, cron, dashboard UI, alerting integration, BI export, novy canonical CS1 state, mutace existing schema, frontend charts, real-time metrics, per-operator attribution, cost metrics, SEO/marketing KPIs, CS3 retry matrix mutace, A/B testing framework, predictive analytics, AI-based anomaly detection, per-recipient drill-down, multi-tenant reporting.
- **Acceptance checklist (23 polozek):** vsechny checked.
- **PROPOSED vs INFERRED vs VERIFIED label summary** (sekce 19).

**A-09 kompatibilita:**
- A-09 `_ingest_reports` je NEZAVISLE report artefakt (ingest-only, per-job grain). C-10 `_asw_perf_reports` je **rozsireny** report pokryvajici cely reporting prostor 3-dimension modelu (funnel dim A F1-F10, queue dim B 5 statusu, outcome dim C 4 terminaly + operational + quality). A-09 je **upstream zdroj** pro funnel dim A F1-F4 (raw / imported / normalization_error / duplicate counts); C-10 konzumuje `duplicate_count`, `raw_count`, `imported_count`, `bottleneck_stage` z posledniho A-09 zaznamu matchujiciho `source_job_id`.
- Report pattern (summary_status enum, append-only, full JSON payload do `_asw_logs`, derived rates, fail_reason_breakdown) je **dedden** z A-09 a rozsiren. A-09 G1 per-job je de facto **subset** C-10 G1 per-job (ingest section).
- C-10 **nemutuje** A-09 `_ingest_reports` schema. Zadne pridavani sloupcu. A-09 zustava authoritative pro ingest-only reports.

**CS1 kompatibilita:**
- CS1 18-state lifecycle je **zdroj pravdy** pro funnel dim A stages F2-F10 (IMPORTED → WEB_CHECKED → QUALIFIED → IN_PIPELINE → PREVIEW_PENDING → PREVIEW_READY_FOR_REVIEW → BRIEF_READY → DRAFT_READY → … → OUTREACH_READY #12). Funnel dim A konci na F10=OUTREACH_READY; queue a outcome jsou separatni dimenze.
- CS1 terminal stavy DISQUALIFIED (#6), REPLIED (#15), BOUNCED (#16), UNSUBSCRIBED (#17) jsou zdroj **outcome dim C** (separatni dimenze od funnel dim A, NE drop-off "stages"). CS1 review stavy REVIEW_REQUIRED (#7), PREVIEW_READY_FOR_REVIEW (#10), FAILED (#18) jsou **review flags** (separatni dimenze v Bloku E).
- C-10 NIKDY neemituje novy canonical CS1 state. Nemutuje `lifecycle_state` field, nemutuje CS1 transitions T1-T24.
- Funnel stages F1-F10 jsou **reporting abstrakce** nad CS1 + A-09 ingest — zadny vlastni runtime zapis. Queue dim B cte C-05 `_asw_outbound_queue.status`; outcome dim C cte CS1 terminal state + C-07 `_asw_inbound_events.event_type`.

**CS2 kompatibilita:**
- CS2 `cs2_run_id` je **klic** pro G3 per-run grain. C-10 G3 reports filtrovane per `cs2_run_id` na `_asw_logs`.
- PROPOSED CS2 step: `performance_report_generator` (nereactive post-run hook + optional daily cron + manual menu trigger).
- C-10 nemutuje CS2 step taxonomy ani event model. Jen konzumuje `cs2_run_id` + `_asw_logs` timestamps.

**CS3 kompatibilita:**
- CS3 `_asw_dead_letters` je **primarni zdroj** pro `dead_letter_count` + `dead_letter_rate` + per-step `failure_class` breakdown operational metrics.
- CS3 `failure_class` enum (TRANSIENT / PERMANENT / AMBIGUOUS) driv per-step fail classification v C-10 reports.
- CS3 retry matrix zdroj `retry_count` + `retry_success_rate`.
- CS3 LockService pattern **dedden** pro budouci C-10 runtime worker (lock per-grain report generation race prevention).
- C-10 nemutuje CS3 dead_letter schema. Jen cte append-only.

**C-04 kompatibilita:**
- C-04 gate outcomes jsou zdroj `manual_review_required_count` + `compliance_hard_stop_rate` + `send_blocked_count` + `blocking_reason_breakdown_json` (21 blocking reason codes).
- C-04 gate latency (pres `_asw_logs` timestamps gate_evaluated event) driv operational metrics.
- PROPOSED C-04 extension: zadne. C-10 cte `sendability_outcome` + `blocking_reasons[]` per-lead.

**C-05 kompatibilita:**
- C-05 `_asw_outbound_queue.status` je zdroj **queue dim B** (celych 5 statusu QUEUED/SENDING/SENT/FAILED/CANCELLED) + queue_status_breakdown_json + send_success_rate (dim B interna) + queue_latency_avg_ms.
- C-05 5 queue statusu jsou **ortogonalni dimenze nad queue radkem** per C-05 invariant — NEJSOU funnel stages, NEJSOU lifecycle states. Mapovani do funnel dim A NEEXISTUJE (NEMAPOVAT queue_sent_count na jakoukoli F-stage).
- C-10 nemutuje `_asw_outbound_queue` schema.

**C-06 kompatibilita:**
- C-06 `NormalizedSendResponse` + `NormalizedProviderStatus` + `NormalizedSendErrorClass` jsou zdroj provider_status_breakdown + send_latency_stats.
- C-10 cte `provider_send_duration_ms` + `normalized_status` + `normalized_error_class` per queue row.

**C-07 kompatibilita:**
- C-07 `_asw_inbound_events.event_type` je zdroj **outcome dim C** (outcome_replied/bounced/unsubscribed counts) + `reply_class` breakdown (POSITIVE / NEGATIVE / UNCLASSIFIED) + `bounce_class` breakdown (HARD / SOFT).
- Cross-dim rates reply_yield / bounce_yield / unsubscribe_yield (B→C) + quality aliasy reply_rate / bounce_rate / unsubscribe_rate / positive_reply_rate / unclear_reply_rate / hard_bounce_rate jsou **derivaty** s denominatorem `queue_sent_count` z C-05 (NE funnel F-stage count).
- Outcome dim C NEJSOU funnel stages. Mapovani z outcome na F-stage NEEXISTUJE.
- C-10 nemutuje `_asw_inbound_events` schema.

**C-08 kompatibilita:**
- C-08 3-stage follow-up sekvence (initial / follow_up_1 / follow_up_2) je zdroj followup_yield_rate (% sequences kde stage > 1 vygeneroval response) + per-stage sent counts + stop_reason breakdown (10-value enum).
- `sequence_stage` dimenze zachycena v per-stage sent / reply counts.

**C-09 kompatibilita:**
- C-09 `_asw_exceptions` je zdroj review_queue_load + review_sla_compliance_rate + exception_rate + exception_type_breakdown (10 types) + retry_chain_depth_breakdown.
- C-09 4-tier priority (P1/P2/P3/P4) + SLA targets jsou zdroj per-priority SLA compliance metrics.
- exception_rate_per_stage = C-09 exceptions / C-10 stage throughput (stage-scoped attribution).

**Future dashboard task vztah:**
- Dashboard **konzumuje** `_asw_perf_reports` schema (read-only). C-10 SPEC je **vstupni kontrakt** pro dashboard task. Dashboard NENI blocker pro C-10.

**Future alerting task vztah:**
- Alerting konzumuje `alert_summary_json.triggered[]` field + 5 PROPOSED `_asw_logs` event types. Notification channel (email/Slack) mimo C-10 scope.

**Future BI export task vztah:**
- BI export mirror `_asw_perf_reports` schema do external data warehouse. C-10 poskytuje stable schema contract.

Task NEDODAVA:
- Runtime report worker / cron / scheduler / `buildPerformanceReport_()` helper v Apps Script
- `_asw_perf_reports` sheet creation
- `apps-script/PerfReport.gs` soubor
- `apps-script/Config.gs` zapisy (PERF_REPORT_* Script Properties)
- 5 `_asw_logs` event type emissions
- Dashboard / UI / charts
- Alerting / notification system (email alerts, Slack integration)
- BI export / data warehouse mirror
- Per-operator attribution / workload balancing
- Cost metrics / token usage / API billing tracking
- SEO / marketing KPIs / conversion funnel (downstream WON/LOST)
- CS3 retry matrix mutace
- A/B testing framework
- Predictive analytics / forecasting
- AI-based anomaly detection
- Per-recipient drill-down
- Multi-tenant reporting
- Frontend deployment / CDN
- Retention / archive policy pro `_asw_perf_reports`
- Backfill cron pro historicka data
- Real-time streaming metrics (> daily grain mimo scope v1.0)
- CI/CD integration (napr. alert na PR merge blok)
- A-09 `_ingest_reports` schema mutace
- Novy canonical CS1 state
- **Owner:** Claude
- **Code:** — (—)
- **Docs:** docs/24-automation-workflows.md, docs/20-current-state.md

## 2026-04-20

### [A/A8] Preview queue → BRIEF_READY — DONE
- **Scope:** Uzavira prechod kvalifikovaneho leadu (QUALIFIED, preview_stage=NOT_STARTED) do stavu BRIEF_READY bez cekani na 15-min casovy trigger. Symetrie vuci A-06 -> A-07 post-web-check hooku.

What this task delivers:
- **Post-qualify hook** v `AutoQualifyHook.gs` — po uspesne kvalifikaci (`stats.qualified > 0`) a pri `dryRun === false` primo vola `processPreviewQueue()`. Non-fatal wrap — chyba preview hooku nezneplatni vysledek A-07.
- **Local evidence harness** `scripts/test-a08-preview-queue.mjs` — 6 scenaru, 38 assertions, portuje kriticke GAS helpery (`resolveWebsiteState_`, `chooseTemplateType_`, `buildPreviewBrief_`, `buildSlug_`, `composeDraft_`) a replikuje per-row logiku `processPreviewQueue`.
- **Task record** + sync do `docs/20-current-state.md` a `docs/24-automation-workflows.md`.

What this task does NOT deliver:
- Zmeny `processPreviewQueue()`, `buildPreviewBrief_()`, `buildSlug_()`, `composeDraft_()` (reused as-is z PreviewPipeline.gs)
- Pridani `preview_slug` do webhook payloadu (znamy gap z B-01 — out of scope, blokovano B-05)
- B-04 preview endpoint, B-05 slug write-back
- Lock sjednoceni mezi `runAutoQualify_` a `processPreviewQueue()` (neni nutne — processPreviewQueue neakviruje lock a je volany uvnitr A-07 lock scope)
- Zivy TEST runtime clasp deployment (vyzaduje push na TEST skript)

**Status rationale:** done — code complete, lokalne verifikovano (38 assertions), existujici 15-min timer + post-hook pokryvaji obe cesty. Fail izolace prokazana per-row try/catch scenariem (row 1 of 3 throws, rows 0 a 2 dosahnou BRIEF_READY).
- **Owner:** Stream A
- **Code:** apps-script/AutoQualifyHook.gs (modified), scripts/test-a08-preview-queue.mjs (new), docs/30-task-records/A8.md (new), docs/20-current-state.md (modified), docs/24-automation-workflows.md (modified)
- **Docs:** docs/20-current-state.md, docs/24-automation-workflows.md

### [A/A9] Ingest quality report per source_job_id — DONE
- **Scope:** Reportovaci vrstva nad existujicim ingest funnellem. Pro kazdy `source_job_id` produkuje jeden radek v append-only `_ingest_reports` sheetu + full JSON payload do `_asw_logs`. Ne novy subsystem — cista agregace nad `_raw_import` + LEADS.

What this task delivers:
- `apps-script/IngestReport.gs` — `ensureIngestReportsSheet_()`, `buildIngestReport_()` (pure), `writeIngestReport_()` + `reportToRow_()` (type-preserving), `loadRawRowsByJob_()` (header-validated), `loadLeadsRowsByJob_()`, `generateIngestReportForJob()`, `generateIngestReportsForAllJobs()`, `generateIngestReportPrompt()` (menu)
- Report unit: **1 report = 1 `source_job_id`** (= 1 scraping job = 1 query na 1 portalu v 1 city/segment)
- 41-sloupcove schema: identity, timing, raw-stage counts, LEADS-stage counts, derived rates, bottleneck, summary_status, **snapshot_stage** (RAW_ONLY / DOWNSTREAM_PARTIAL / FINAL — orthogonal to summary_status), fail_reason_breakdown_json, audit
- `report_id` format `rpt-{source_job_id}-{ts14}-{uuid8}` — timestamp for human readability + UUID suffix for collision resistance (via `Utilities.getUuid()`)
- `loadRawRowsByJob_` **validates required headers** (`source_job_id`, `import_decision`, `normalized_status`) per A-02 contract; throws loudly on malformed sheet instead of silent empty result
- `reportToRow_()` **preserves numeric types** when writing to Sheets (counts, rates, durations stay numbers — not stringified)
- Post-batch hook v `processRawImportBatch_()` — po uspesnem batch-i vygeneruje report per distinct source_job_id, non-fatal wrap. `snapshot_stage` auto-computed z data state → pokud A-06/A-07/A-08 chain dobehl inline, report je `FINAL`; jinak `DOWNSTREAM_PARTIAL`
- Menu submenu "Ingest report → ..." s dvema manualnimi akcemi
- Local evidence harness `scripts/test-a09-ingest-report.mjs` — 12 scenaru, 136 assertions, all pass

What this task does NOT deliver:
- Frontend dashboard (mimo scope)
- Refactor ingest funnelu
- `run_id` runtime field (CS2 M7 gap zustava)
- Historicke backfill stare joby (manualni `generateIngestReportsForAllJobs()` to umoznuje, ale neni povinny deliverable)
- Zivy TEST runtime clasp push proof

**Status rationale:** done v implementation / repo scope. Lokalne overeno (136 assertions). TEST runtime end-to-end NOT VERIFIED (vyzaduje clasp push + realny `_raw_import` + LEADS v TEST projektu).
- **Owner:** Stream A
- **Code:** apps-script/IngestReport.gs (new), apps-script/RawImportWriter.gs (modified), apps-script/Menu.gs (modified), scripts/test-a09-ingest-report.mjs (new), docs/30-task-records/A9.md (new), docs/20-current-state.md (modified), docs/23-data-model.md (modified), docs/24-automation-workflows.md (modified)
- **Docs:** docs/20-current-state.md, docs/23-data-model.md, docs/24-automation-workflows.md

### [B/B4] Preview render endpoint — POST /api/preview/render — DONE
- **Scope:** Navazuje na B-01 (preview contract), B-02 (preview renderer) a B-03 (template family mapping). Zavadi Next.js API endpoint, ktery prijima webhook payload z Apps Scriptu, validuje ho proti B-01 `MinimalRenderRequest`, upsertne brief do in-memory preview store, zvoli render family pres B-03 resolvery a vrati B-01 `MinimalRenderResponseOk` s `preview_url = ${PUBLIC_BASE_URL}/preview/${preview_slug}`.

B-04 NEMENI B-01 contract, NEMENI B-03 mapping, NEMENI Apps Script. Zive GAS propojeni vyzaduje B-05 (GAS payload zatim neobsahuje `preview_slug`).
- **Owner:** Stream B
- **Code:** crm-frontend/src/app/api/preview/render/route.ts (new), crm-frontend/src/lib/preview/preview-store.ts (new), crm-frontend/src/lib/preview/validate-render-request.ts (new), crm-frontend/src/lib/preview/quality-score.ts (new), crm-frontend/src/lib/mock/sample-brief-loader.ts (modified), crm-frontend/tsconfig.json (modified), scripts/tests/preview-render-endpoint.test.ts (new), package.json (modified)
- **Docs:** docs/12-route-and-surface-map.md, docs/20-current-state.md, docs/22-technical-architecture.md, docs/26-offer-generation.md, docs/30-task-records/B4.md

## 2026-04-17

### [A/A10] Ingest runtime bridge — LEADS append + segment taxonomy fix — DONE
- **Scope:** Complete the ingest runtime bridge by implementing the missing LEADS append step and fixing the segment taxonomy mismatch that caused a data validation crash.

What this task delivers:
- `appendLeadRow_()` in RawImportWriter.gs — appends a normalized lead to LEADS using HeaderResolver for dynamic column mapping
- Replacement of the TODO placeholder at processRawImportBatch_ step 3 with actual `appendLeadRow_()` call
- `SEGMENT_SLUG_TO_LABEL_` mapping in Normalizer.gs — converts internal slugs (e.g. `instalaterstvi`) to Czech display labels (e.g. `instalater`) compatible with SETTINGS!A2:A11 validation
- `resolveSegmentLabel_()` function applied during normalization
- Full end-to-end ingest pipeline: raw → normalize → dedupe → LEADS append

What this task does NOT deliver:
- Changes to dedupe logic (A-05, reused as-is)
- Changes to scraper output (A-04, reused as-is)
- Sheet cleanup of diagnostic test data (done during verification, not part of deliverable)

**Status rationale:** done — TEST runtime verified (leadsBefore=799, leadsAfter=800, leadsAppended=1). Segment taxonomy mismatch root-caused and fixed. All diagnostic functions removed in closeout.
- **Owner:** Stream A
- **Code:** apps-script/RawImportWriter.gs (edit), apps-script/Normalizer.gs (edit)
- **Docs:** docs/20-current-state.md, docs/24-automation-workflows.md, docs/30-task-records/A10.md

### [A/A6] Auto web check hook — DONE
- **Scope:** Automatic web check hook that runs Serper-based website discovery on new LEADS rows without manual menu interaction. Reuses existing `findWebsiteForLead_()` from LegacyWebCheck.gs.

What this task delivers:
- `AutoWebCheckHook.gs` — GAS module with `runAutoWebCheck_(opts)`, `autoWebCheckTrigger()`, `runWebCheckForImportedLeads_(leadIds)`
- **Automatic trigger installation** via `installProjectTriggers()` in PreviewPipeline.gs — trigger is auto-installed alongside processPreviewQueue, onOpen, onContactSheetEdit (no manual ScriptApp.newTrigger needed)
- **Ingest pipeline wiring** — `processRawImportBatch_()` in RawImportWriter.gs calls `runWebCheckForImportedLeads_()` after importing leads (A-06 ← A-10 integration)
- Filtering logic: skip leads with existing website_url, skip already-checked leads (website_checked_at), skip empty business_name
- Batch size guard (default 20, configurable)
- Per-row error isolation (one Serper failure does not abort batch)
- LockService guard (prevents concurrent runs)
- Double-run prevention via website_checked_at column
- lead_id targeting mode for post-import hook integration
- DRY_RUN support
- Local proof harness with 9 evidence scenarios, 31 assertions, all passing

What this task does NOT deliver:
- Live Serper API verification (requires API key in Script Properties — not available locally)
- Google Sheets runtime verification (requires clasp push after merge)
- LEADS append in processRawImportBatch_ is still TODO (A-10 gap) — the web check hook IS wired, but the import step that feeds it lead_ids does not yet write to LEADS

**Status rationale:** done — code merged to main (PR #16), deployed to TEST GAS project, verified via controlled TEST runtime delta proof on 3 LEADS rows (2026-04-17). Diagnostic function `diagA06LiveDelta` exercised `runAutoWebCheckInner_` with `dryRun: false`, producing row-level BEFORE/AFTER evidence: 1 FOUND (URL + confidence + note + timestamp written), 2 NOT_FOUND (note + timestamp written). Post-import hook path wired and code-complete (end-to-end blocked on A-10 LEADS append TODO — separate task).
- **Owner:** Stream A
- **Code:** apps-script/AutoWebCheckHook.gs (new), apps-script/PreviewPipeline.gs (edit), apps-script/RawImportWriter.gs (edit), scripts/test-a06-webcheck-hook.mjs (new), docs/30-task-records/A6.md (new), docs/20-current-state.md (edit), docs/24-automation-workflows.md (edit)

### [A/A7] Auto qualify hook — DONE
- **Scope:** Automatic qualification hook that runs `evaluateQualification_()` on LEADS rows after web check completes. Eliminates the need for manual "Qualify leads" menu action for newly web-checked leads.

What this task delivers:
- `AutoQualifyHook.gs` — GAS module with `runAutoQualify_(opts)`, `autoQualifyTrigger()`, `runQualifyForWebCheckedLeads_(leadIds)`
- **Automatic trigger installation** via `installProjectTriggers()` in PreviewPipeline.gs (15-min timer alongside A-06)
- **Post-web-check hook** — `runAutoWebCheckInner_` calls `runQualifyForWebCheckedLeads_()` after web check writes complete
- Eligible row criteria: `lead_stage` empty + `business_name` present + (`website_checked_at` set OR `has_website` has value)
- Per-row error isolation (one qualification failure does not abort batch)
- LockService guard (prevents concurrent runs)
- Double-run prevention via `lead_stage` field (if already set, skip)
- DRY_RUN support
- Local proof harness with 23 assertions, all passing

What this task does NOT deliver:
- Changes to `evaluateQualification_()` logic itself (reused as-is from PreviewPipeline.gs)
- Within-LEADS batch dedupe recalculation (handled separately by existing `qualifyLeads()`)
- Live TEST runtime verification (requires clasp push + SERPER_API_KEY in TEST project)

**Status rationale:** done — code complete, locally verified (23 assertions), TEST runtime verified (QUALIFIED, DISQUALIFIED, REVIEW, SKIPPED guard). Failure isolation proven by code structure + local harness (not by live forced exception). Bug fix: `extractDomainFromUrl_` now requires dot in domain (prevents `dom:nenalezeno`).
- **Owner:** Stream A
- **Code:** apps-script/AutoQualifyHook.gs (new), apps-script/AutoWebCheckHook.gs (edit), apps-script/PreviewPipeline.gs (edit), scripts/test-a07-qualify-hook.mjs (new), docs/30-task-records/A7.md (new), apps-script/Helpers.gs (edit), docs/20-current-state.md (edit), docs/24-automation-workflows.md (edit)
- **Docs:** docs/20-current-state.md, docs/24-automation-workflows.md

### [B/B3] Template family mapping vrstva mezi template_type a renderer — DONE
- **Scope:** Navazuje na B-01 (preview brief contract) a B-02 (preview renderer). Zavadi MVP mapping vrstvu mezi runtime `template_type` (emitovanym GAS `chooseTemplateType_`) a 4 renderovaci family: `emergency`, `community-expert`, `technical-authority`, `generic-local`.

B-03 NEMENI B-01 contract, NEMENI B-02 renderer strukturu, nepridava `template_type` do `PreviewBrief`, nepridava B-04 endpoint vrstvu ani webhook aktivaci. Renderer zustava template-agnostic; family vrstva je pripravena a testovatelna pro nasledne family-specificke layouty.
- **Owner:** —
- **Code:** crm-frontend/src/lib/domain/preview-contract.ts (modified), crm-frontend/src/lib/domain/template-family.ts (new), crm-frontend/src/lib/mock/sample-brief-loader.ts (modified), crm-frontend/src/lib/mock/preview-brief.emergency.json (new), crm-frontend/src/lib/mock/preview-brief.community.json (new), crm-frontend/src/lib/mock/preview-brief.technical.json (new), scripts/tests/template-family.test.ts (new), package.json (monorepo root) (modified)
- **Docs:** docs/20-current-state.md, docs/22-technical-architecture.md, docs/26-offer-generation.md, docs/30-task-records/B3.md

### [B/BX1] CRM write path — doPost handler for frontend writes — DONE
- **Scope:** Implement the missing `doPost()` handler in Apps Script to enable CRM frontend write-back via HTTP POST. The frontend writer (`apps-script-writer.ts`) was already implemented but had no server-side endpoint.

What this task delivers:
- `WebAppEndpoint.gs` — `doPost()`, `handleUpdateLead_()`, `jsonResponse_()`
- Token verification via Script Properties `FRONTEND_API_SECRET`
- Lead lookup via `findRowByLeadId_()` (Variant B, row-shift immune)
- Identity verification (business_name + city)
- LockService guard (shared with onContactSheetEdit)
- 5 allowed fields: outreach_stage, next_action, last_contact_at, next_followup_at, sales_note
- outreach_stage reverse-humanization (Czech label → English key)
- `appsscript.json` webapp config for Web App deployment

What this task does NOT deliver:
- Web App UI deployment (manual step via Apps Script editor)
- Frontend `.env.local` configuration
- Frontend → Web App e2e verification
- New frontend code (existing `apps-script-writer.ts` already matches)

**Status rationale:** done — inner doPost logic TEST runtime verified (writeVerified=true, restored=true). External Web App HTTP path and frontend e2e not yet verified (requires manual Web App deployment).
- **Owner:** Stream B
- **Code:** apps-script/WebAppEndpoint.gs (new), apps-script/appsscript.json (edit)
- **Docs:** docs/20-current-state.md, docs/30-task-records/BX1.md

## 2026-04-16

### [A/A5] Dedupe & company_key matching — DONE
- **Scope:** Formalizace a rozšíření existující dedupe logiky v Apps Script. Cílem je:
- deterministický company_key algoritmus se strict IČO validací (8 číslic)
- rozlišení HARD_DUPLICATE / SOFT_DUPLICATE / REVIEW / NEW_LEAD
- decision_reason audit trail pro každé rozhodnutí
- blocked domain check v company_key computation
- povinné city pro T4 (name+city) — eliminace name-only false positives
- izolovaný dedupe engine připravený na _raw_import integraci
- synthetic batch test (50 záznamů) s vyhodnocením

Scope explicitně NEOBSAHUJE:
- runtime _raw_import sheet (ten dosud neexistuje v runtime kódu)
- review UI
- fuzzy matching
- IČO checksum mod 11 (připraveno jako poznámka, ne blocker)
- **Owner:** Stream A
- **Code:** apps-script/DedupeEngine.gs (new), apps-script/Helpers.gs (edit), apps-script/PreviewPipeline.gs (edit), apps-script/Config.gs (edit), docs/contracts/dedupe-decision.md (new), docs/23-data-model.md (edit), docs/24-automation-workflows.md (edit), docs/30-task-records/A5.md (new)

## 2026-04-11

### [A/A4] firmy.cz scraper — 1 portal runtime — DONE
- **Scope:** Implementace scraper runtime pro **jeden portál (firmy.cz)**. Pro 1 `ScrapingJobInput` (A-01)
vrací pole `RawImportRow` objektů (A-02) s `raw_payload_json` ve tvaru očekávaném A-03
normalizačním kontraktem. Per-record try/catch zajišťuje, že chyba 1 záznamu neshodí
celý job. Pilot pokrývá listing fetch → detail fetch → structured-data extraction →
raw row assembly → summary metrics. Zápis do Google Sheets `_raw_import` je explicitně
mimo scope (downstream krok).
- **Owner:** Stream A
- **Code:** scripts/scraper/firmy-cz.mjs (new), scripts/scraper/lib/job-id.mjs (new), scripts/scraper/lib/raw-row.mjs (new), scripts/scraper/lib/html-extract.mjs (new), scripts/scraper/lib/firmy-cz-parser.mjs (new), scripts/scraper/lib/fetch-polite.mjs (new), scripts/scraper/README.md (new), scripts/scraper/samples/job.sample.json (new), scripts/scraper/samples/fixtures/firmy-cz-listing.html (new), scripts/scraper/samples/fixtures/firmy-cz-detail-01-novak.html (new), scripts/scraper/samples/fixtures/firmy-cz-detail-02-svoboda.html (new), scripts/scraper/samples/fixtures/firmy-cz-detail-03-dvorak.html (new), scripts/scraper/samples/fixtures/firmy-cz-detail-04-horak.html (new), scripts/scraper/samples/fixtures/firmy-cz-detail-05-prochazka.html (new), scripts/scraper/samples/fixtures/firmy-cz-detail-06-kamarad.html (new), scripts/scraper/samples/fixtures/firmy-cz-detail-07-zeleny.html (new), scripts/scraper/samples/fixtures/firmy-cz-detail-08-broken.html (new), scripts/scraper/samples/output.sample.json (new)
- **Docs:** docs/20-current-state.md, docs/23-data-model.md, docs/24-automation-workflows.md, docs/30-task-records/A4.md

## 2026-04-08

### [B/B2] Preview renderer na sample briefu — DONE
- **Scope:** MVP preview renderer nad B-01 contractem. Vykresli route `/preview/[slug]`, ktera nacte hardcoded sample brief a vyrenderuje landing page pro remeslnika. Pouziva `PreviewBrief` a `SectionId` z B-01 bez redefinice.

### Route intent vs MVP implementace

- **Cilovy intent:** `/[slug]`
- **B-02 MVP implementace:** `/preview/[slug]`
- **Duvod:** Docasna implementacni ochrana. Root `[slug]` by kolidoval s existujicimi CRM routes (`/dashboard`, `/leads`, atd.) v soucasne single-app architekture. Prefix `/preview/` umoznuje bezpecny middleware bypass, AppShell bypass a izolaci preview layoutu. Toto neni finalni produktove rozhodnuti.
- **Owner:** —
- **Code:** crm-frontend/src/middleware.ts (modified), crm-frontend/src/components/layout/app-shell.tsx (modified), crm-frontend/src/app/preview/layout.tsx (new), crm-frontend/src/app/preview/[slug]/page.tsx (new), crm-frontend/src/app/preview/[slug]/not-found.tsx (new), crm-frontend/src/lib/mock/sample-brief-loader.ts (new), crm-frontend/src/components/preview/hero-section.tsx (new), crm-frontend/src/components/preview/services-section.tsx (new), crm-frontend/src/components/preview/contact-section.tsx (new), crm-frontend/src/components/preview/reviews-section.tsx (new), crm-frontend/src/components/preview/location-section.tsx (new), crm-frontend/src/components/preview/faq-section.tsx (new)
- **Docs:** docs/20-current-state.md, docs/22-technical-architecture.md, docs/26-offer-generation.md, docs/30-task-records/B2.md

## 2026-04-06

### [A/A1] Scraping Job Input Contract — DONE
- **Scope:** Definice kanonickeho datoveho kontraktu pro jeden scraping job. 1 job = 1 query na 1 portalu v 1 meste/segmentu. Kontrakt obsahuje 12 poli, vsechna required (key musi byt explicitne pritomen; nullable pole maji hodnotu null). Lifecycle envelope (created/running/completed/failed) a deterministicky `source_job_id` odvozeny z (portal, segment, city, district, max_results, creation second) pres SHA-256 hash10. `error_message` zachycuje chybovy detail pri stavu failed. Zadne nested objekty. Zaklad pro A-02 staging layer a A-04 scraper runtime.
- **Owner:** Stream A
- **Code:** docs/contracts/scraping-job-input.schema.json (new), docs/contracts/scraping-job-input.md (new), crm-frontend/src/lib/contracts/scraping-job-input.ts (new)
- **Docs:** docs/23-data-model.md, docs/20-current-state.md, docs/24-automation-workflows.md, docs/30-task-records/A1.md

### [A/A2] RAW_IMPORT Staging Layer — DONE
- **Scope:** Navrzeni staging vrstvy `_raw_import` jako noveho system sheetu ve stejnem SPREADSHEET_ID jako LEADS. Cilem je oddelit surovy scraper output od produkcniho LEADS sheetu a zavest explicitni ingest lifecycle (raw -> normalized -> dedupe -> imported / error). LEADS zustava source of truth pro ciste leady; `_raw_import` je source of truth pro surova vstupni data a jejich lifecycle. Kontrakt definuje 16 sloupcu, 5-stavovy status model, 4-hodnotovy decision model, invariants matici a hranici mezi stagingem a produkcnim leadem.
- **Owner:** Stream A
- **Code:** docs/contracts/raw-import-row.schema.json (new), docs/contracts/raw-import-staging.md (new), crm-frontend/src/lib/contracts/raw-import-row.ts (new)
- **Docs:** docs/20-current-state.md, docs/23-data-model.md, docs/24-automation-workflows.md, docs/30-task-records/A2.md

### [A/A3] Normalization Raw to LEADS Rules — DONE
- **Scope:** Definice kanonickych pravidel pro transformaci surovych dat z `_raw_import.raw_payload_json` na validni LEADS radek. Kontrakt pokryva: field mapping (23 sloupcu), cleaning rules per pole, reject/null/empty policy, `lead_id` generation (reuse existujiciho formatu), a 6 novych `source_*` metadata sloupcu appendovanych do LEADS. Zadne paralelni helpery — vsechny cleaning operace pres existujici `Helpers.gs` funkce.
- **Owner:** Stream A
- **Code:** docs/contracts/normalization-raw-to-leads.md (new), docs/contracts/raw-to-leads-mapping.json (new)
- **Docs:** docs/20-current-state.md, docs/23-data-model.md, docs/24-automation-workflows.md, docs/30-task-records/A3.md

## 2026-04-05

### [B/B1] Preview brief data contract — formalizace datoveho kontraktu — DONE
- **Scope:** Formalizace datoveho kontraktu mezi Apps Script CRM backendem a preview renderer. Pouze specifikace a typy — zadna implementace endpointu, routu, nebo webhooku.
- **Owner:** —
- **Code:** crm-frontend/src/lib/domain/preview-contract.ts (new), crm-frontend/src/lib/mock/preview-brief.minimal.json (new), crm-frontend/src/lib/mock/preview-brief.rich.json (new)
- **Docs:** docs/23-data-model.md, docs/26-offer-generation.md, docs/30-task-records/B1.md

### [C/C2] Hardening audit — přepis sekce Souhrn v docs/20 — DONE
- **Scope:** Nahrazení sekce „Souhrn" v docs/20-current-state.md schváleným textem z hardening auditu. Text explicitně rozlišuje commitnutý kód, governance vrstvu (definovaná/validovaná/nevynucovaná) a uncommitted změny v working tree.
- **Owner:** claude
- **Code:** — (—)
- **Docs:** docs/20-current-state.md

### [C/C3] Repo governance hardening — CLAUDE.md, branch protection, cleanup — DONE
- **Scope:** Kompletni hardening repa pro 3-osobni tym: nahrazeni CLAUDE.md (z generickeho RuFlo V3 na project-specific governance), nahrazeni docs/13 (.new → aktivni), nastaveni branch protection na GitHubu, pridani collaboratora, odstraneni duplicit a smeti, aktualizace docs/github-collaboration-setup.md.
- **Owner:** claude
- **Code:** CLAUDE.md (modified), scripts/check-doc-sync.mjs (deleted)
- **Docs:** CLAUDE.md, docs/13-doc-update-rules.md, docs/github-collaboration-setup.md, docs/00-folder-inventory.md, docs/00-project-map.md, docs/CRM-SYSTEM-MAP.md

### [C/C4] Post-audit docs corrections — docs/20, docs/23, governance wording — DONE
- **Scope:** Oprava fakticke nepravdy v docs/20-current-state.md (Souhrn tvrdil "frontend neobsahuje dashboard" — commitnuty kod ho obsahuje). Oprava poctu extension sloupcu v docs/23 (43 → 45). Zpreseni governance wordingu v CLAUDE.md a docs/13 — CI vynucuje aktuálnost generated files, ale nevynucuje existenci task recordu.
- **Owner:** claude
- **Code:** — (—)
- **Docs:** docs/20-current-state.md, docs/23-data-model.md, CLAUDE.md, docs/13-doc-update-rules.md

### [C/CS1] Definovat end-to-end lifecycle leadu jako state machine — DONE
- **Scope:** Definice jedineho kanonicky lifecycle stavu (`lifecycle_state`) pro kazdy lead v systemu. Pokryva cestu od importu az po reakci leadu (REPLIED/BOUNCED/UNSUBSCRIBED) nebo diskvalifikaci. WON/LOST jsou downstream sales outcome mimo scope CS1. Specifikace — ne implementace.

**Explicitni scope disclaimer:**
- Tento PR nezavadi runtime enforcement lifecycle_state.
- Tento PR nevytvari fyzickou migraci na sloupec lifecycle_state.
- Tento PR nemeni aktualni chovani systemu.
- Tento PR je ciste autoritativni specifikace — zadny kod, zadna migrace, zadna zmena runtime.
- **Owner:** Claude
- **Code:** *(zadne code changes)* (—)
- **Docs:** docs/21-business-process.md, docs/23-data-model.md, docs/20-current-state.md, docs/11-change-log.md, docs/29-task-registry.md

### [C/CS2] Navrhnout workflow orchestrator — co spousti co po zmene stavu leadu — DONE
- **Scope:** Logicka orchestracni vrstva nad CS1 lifecycle. Definuje co se stane po kazde zmene lifecycle_state, formalni workflow step kontrakt, event katalog, run history design a orchestration model (hybrid: poll + manual + reactive). Specifikace — ne implementace.
- **Owner:** Claude
- **Code:** *(zadne code changes)* (—)
- **Docs:** docs/24-automation-workflows.md, docs/20-current-state.md

### [C/CS3] Definovat idempotency keys, retry politiku a dead-letter handling — DONE
- **Scope:** Reliability vrstva nad CS2 orchestratorem. Definuje idempotency key pro kazdy automaticky krok, retry matici (transient/permanent/ambiguous failures, max_attempts, backoff), dead-letter handling v dedickovany `_asw_dead_letters` sheet (append-only, separatni od `_asw_logs` run history), locking pravidla pro LockService. Specifikace — ne implementace.
- **Owner:** Claude
- **Code:** *(zadne code changes)* (—)
- **Docs:** docs/24-automation-workflows.md, docs/20-current-state.md
