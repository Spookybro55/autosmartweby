# Plan: agent-team-make-activation-v1

> **Track:** B (plan-driven)
> **Stream:** B (infrastructure / dev velocity)
> **Status:** ACTIVE — activated 2026-04-30
> **Owner:** Sebastián
> **Plan ID:** `agent-team-make-activation-v1`

## Goal

Operationalize the 5 Make scenarios that wire the `agent team` knowledge loop and notification surface. After this plan ships, Sebastián receives ntfy notifications on agent activity (queue triage, PR review backlog, backpressure, weekly digest) and the **learning loop** auto-appends `PATTERNS.md` / `GOTCHAS.md` / `REGRESSION-LOG.md` from each merged agent PR via Anthropic Sonnet — closing the Phase 3 activation gap that has been pending since 2026-04-30 (per memory `project_phase3_learning_loop_activation.md`, now obsolete after this plan ships).

This plan is **explicitly scoped down** from the originally-imagined 6 phases after a reality check against the working tree on 2026-04-30:
- 5 new Make blueprint exports already in `docs/agents/make/Agent Team — *.blueprint.json` (untracked, owner-created).
- All 5 scenarios **already imported into Make** with real production tokens (per owner statement 2026-04-30).
- 2 GitHub webhooks already pointing at Make (`hook.eu2.make.com/svjf4...` and `.../5507l...`), both subscribed to `pull_request` events — at least one is the Learning Loop, the other needs identifying.
- Old hand-written blueprints `docs/agents/make/0{1..5}-*.json` are tombstoned (`git status` shows them as deleted in working tree).

What ships here is therefore a **commit + verify + close-out plan, not an integration plan.**

## Background — evidence on main HEAD `f073db2` (verified 2026-04-30)

| Concern | File / surface | Reality |
|---|---|---|
| 5 new blueprints in working tree (untracked) | `docs/agents/make/Agent Team — *.blueprint.json` | Daily Triage (1 mod, ntfy POST), PR Review Reminder (2 mod, GitHub Search → ntfy), Learning Loop (9 mod, webhook → diff → Anthropic → 3× GET+PUT), Backpressure Check (2 mod, search → ntfy if ≥5), Weekly Digest (2 mod, search → ntfy summary). |
| Literal token leakage in 4 of 5 blueprints | `Agent Team — *.blueprint.json` | `Bearer ghp_b68w...` appears 9× total across PR Review Reminder, Backpressure Check, Weekly Digest, Learning Loop (Learning Loop has 7 of those because it hits GitHub Contents API 6× plus the diff fetch). `sk-ant-api03-iJU6...` appears 1× in Learning Loop M3. `autosmartweby-agents-123456789` (ntfy topic, predictable) in all 5. **Owner has regenerated all tokens — these are now placeholders, but visually look like live secrets.** |
| Old hand-written blueprints | `docs/agents/make/0{1..5}-*.json` | Deleted in working tree (`git status: deleted`) but still on `main`. Owner judged "k ničemu" (useless). |
| GitHub webhooks pointing to Make | repo Settings → Webhooks | 2 active webhooks, both `pull_request` events, both `hook.eu2.make.com/...`. Learning Loop is one of them; the other is unknown (likely orphan from prior experiment). |
| Make scenarios imported | Make UI (out of git) | Owner-confirmed all 5 imported with real tokens 2026-04-30. Schedules + activation status not yet verified. |
| Phase 3 prerequisites | `docs/agents/SETUP-CHECKLIST.md` rows 1, 2, 8, 9 | Anthropic key, Make secret store, scenarios import, GitHub webhook — all ⏳ pending in checklist; reality is owner has done the work, just not yet ticked the boxes. |
| `QUESTIONS-FOR-HUMAN.md` items still open | `QFH-0001` (Anthropic key), `QFH-0008` (Make scenarios import) | Real-world resolved by owner; QFH file not yet updated. |

## Decisions (pre-resolved)

| Decision | Resolution | Rationale |
|---|---|---|
| Sanitize the 4 token-leaking blueprints to `TODO_*` placeholders before commit? | **Yes — 100% always** | Even though tokens are revoked / regenerated, literal-looking strings in the repo (a) trigger every secret-scanner false-positive forever, (b) confuse future audits, (c) tempt copy-paste reuse. Cost is one mechanical replace pass. Per `feedback_make_blueprints_token_placeholders.md` the right pattern is: blueprints in repo = importable templates with `TODO_*`, real values live only in Make UI. |
| Which token-shaped string to use as placeholder? | `TODO_GITHUB_TOKEN`, `TODO_ANTHROPIC_API_KEY`, `TODO_NTFY_TOPIC` | Matches existing `IMPORT-GUIDE.md` convention (lines 34-38). Owner already trained on this pattern from prior iteration. |
| Delete the old hand-written 5 `0{1..5}-*.json` blueprints in same PR? | **Yes** | They're tombstoned in working tree, owner judged useless. No reason to keep them around — keeps `docs/agents/make/` minimally clear: 5 new blueprints + IMPORT-GUIDE. |
| Update `IMPORT-GUIDE.md` to reflect new blueprint filenames + module counts? | **Yes, but as separate concern from sanitize step** | The IMPORT-GUIDE was written for the old 0{1..5}-*.json filenames + a different module count assumption (e.g. it claimed `02-pr-review-reminder` had 4 modules but the new export has 2, because owner used GitHub Search API for server-side filtering). Updating the IMPORT-GUIDE in-line during sanitization would muddy the diff. Two clean PRs: T1 = sanitize blueprints; T2 = rewrite IMPORT-GUIDE. |
| Identify the orphan GitHub webhook before going further? | **Yes, in T3** | Two active `pull_request` webhooks pointing at Make is operationally noisy (every PR fires both scenarios) and may waste ops budget on the orphan side. Quick triage step: query Make scenarios via UI to find which webhook URL maps to which scenario; disable/delete the orphan. |
| Smoke-test scope for MVP activation | **5 quick run-once tests + 1 end-to-end Learning Loop test PR** | Just enough to verify each scenario fires correctly. Not full QA matrix (e.g. don't simulate "5+ open PRs" by manufacturing PRs — Backpressure Check fires only via real signal, MVP accepts smoke as "scenario invokes without error" and trusts the code path). |
| Leave Daily Triage as "tupý reminder" (no QUEUE.md state check)? | **Yes — accept as designed** | Daily Triage by design fires every morning regardless of queue state. If queue is empty, owner ignores; cost is one ntfy notif/day. Adding queue-state check would require GitHub Contents API call + parse + filter (~3 more modules, ~30 ops/day) — not worth the complexity for an opt-in reminder pattern. Documented as "by design" in T6. |
| Webhook signature validation (HMAC) | **Out of scope — MVP accepts it** | Per `IMPORT-GUIDE.md` MVP note: anyone with the Make webhook URL can post a fake `pull_request` payload. Webhook URL is effectively secret-in-URL but if leaked, Anthropic budget can be drained + repo files can be PUT'd. Acceptable risk for MVP since URL only lives in GitHub repo Settings → Webhooks (org-private, owner-only). Hardening = GOTCHA-005 follow-up after activation. |

## Out of scope

- **Refactoring blueprint module count / logic** — owner's exports are kept as-is. T1 sanitization is mechanical replace only; no logic changes.
- **HMAC signature validation** on Make webhook — see Decisions; deferred to a follow-up GOTCHA + hardening plan.
- **Per-role per-PR analytics** in Weekly Digest — current digest lists raw PRs without per-role aggregation. Per-role count requires nested aggregator chain in Make (deferred per IMPORT-GUIDE note line 24).
- **Automated `If-Match` SHA recheck loop** in Learning Loop to handle concurrent PUTs to the same doc — MVP accepts the rare 409 Conflict + relies on Make's default retry (3 attempts). Hardening if conflicts actually bite.
- **Make ops budget monitoring** — current expected ~1000 ops/month is 10% of Core plan ($9, 10k ops). No automation needed; if it exceeds, owner sees in Make UI.
- **PATTERNS.md / GOTCHAS.md / REGRESSION-LOG.md content QA** — Anthropic prompt + JSON shape is owner-tuned in Make scenario M3; if Claude produces noise, that's a prompt-engineering follow-up, not part of activation.
- **Per-environment (preview / dev) Make hookup** — only production GitHub webhook + production Anthropic / GitHub tokens. Preview deployments are out of scope for this learning loop.
- **Tests beyond manual smoke** — no Playwright / Vitest target a Make scenario; activation is verified by ntfy notifications + git commits to the 3 doc files (Learning Loop only).

## Acceptance criteria

- [ ] All 5 blueprints in `docs/agents/make/Agent Team — *.blueprint.json` are committed to `main` with `TODO_GITHUB_TOKEN` / `TODO_ANTHROPIC_API_KEY` / `TODO_NTFY_TOPIC` placeholders only — `grep -nE 'ghp_[A-Za-z0-9]{20,}|sk-ant-api03-[A-Za-z0-9_-]{40,}' docs/agents/make/` returns 0.
- [ ] Old hand-written blueprints `docs/agents/make/0{1..5}-*.json` removed from `main`.
- [ ] `docs/agents/make/IMPORT-GUIDE.md` rewritten to reflect new blueprint filenames + module counts + post-export sanitization workflow.
- [ ] 1 of the 2 GitHub webhooks identified as orphan and disabled (or both confirmed legitimate with documentation).
- [ ] Each of the 5 Make scenarios verified active + scheduled correctly (ntfy notif arrives for the 4 cron scenarios on Run-Once; Learning Loop fires on a deliberate test PR).
- [ ] Learning Loop end-to-end test: a small test PR `agent-team/learning-loop-smoke` is merged → Make scenario history shows green run → at least one of `PATTERNS.md` / `GOTCHAS.md` / `REGRESSION-LOG.md` receives a new commit from `Make Learning Loop` (or whatever bot identity the GitHub PAT renders).
- [ ] `docs/agents/SETUP-CHECKLIST.md` rows 1 (Anthropic), 2 (Make secret store), 8 (Make scenarios import), 9 (GitHub webhook) ticked complete.
- [ ] `docs/agents/QUESTIONS-FOR-HUMAN.md` items `QFH-0001` (Anthropic key) and `QFH-0008` (Make scenarios import) closed.
- [ ] Memory record `project_phase3_learning_loop_activation.md` deleted (no longer load-bearing).
- [ ] `node scripts/docs/check-doc-sync.mjs` 0 fail; `validate-task-record.mjs --pr-branch agent-team/...` PASSED for each task.

## Tasks

Each task ships as **its own PR** following Track A workflow nested in Track B (claim → classify → dispatch → fix → test → self-review → cross-review → dod-check → pr-open). T1, T2, T6 are agent-driven (no real-world Make UI work needed). T3, T4, T5 are owner-driven (require Make UI / GitHub UI / mobile ntfy app access — agent has neither).

**Branch convention (consistent with prior plan):** `agent-team/make-activation-task-N`

### Task 1 — Sanitize + commit 5 blueprints, drop old 5

- [ ] **Status:** todo
- **Role:** docs-guardian
- **Branch:** `agent-team/make-activation-task-1`
- **Depends on:** none
- **Estimated LOC:** medium-ish in additions (5 blueprints, total ~210 KB, mostly preserved verbatim) + 5 deletions of old files. Net diff is in the "lots of new files" category, but **modifications to existing files are 15 surgical token replacements**. Track B has no LOC limit; this is documentation/templates, not code.
- **Files:**
  - `docs/agents/make/Agent Team — Daily Triage.blueprint.json` (new)
  - `docs/agents/make/Agent Team — PR Review Reminder.blueprint.json` (new)
  - `docs/agents/make/Agent Team — Learning Loop.blueprint.json` (new)
  - `docs/agents/make/Agent Team — Backpressure Check.blueprint.json` (new)
  - `docs/agents/make/Agent Team — Weekly Digest.blueprint.json` (new)
  - `docs/agents/make/01-daily-triage.json` (delete)
  - `docs/agents/make/02-pr-review-reminder.json` (delete)
  - `docs/agents/make/03-learning-loop.json` (delete)
  - `docs/agents/make/04-backpressure-check.json` (delete)
  - `docs/agents/make/05-weekly-digest.json` (delete)
- **Change:**
  - In each new blueprint, replace the literal `Bearer ghp_***` (revoked GitHub PAT, original 4-byte prefix `b68w`, full string redacted to satisfy push-protection scanners) with `Bearer TODO_GITHUB_TOKEN` (use `replace_all: true` per file). Total 9 replacements across 4 files.
  - In `Agent Team — Learning Loop.blueprint.json` line ~984, replace the literal `sk-ant-api03-***` (revoked Anthropic key) value with `TODO_ANTHROPIC_API_KEY`. 1 replacement.
  - In all 5 blueprints, replace `autosmartweby-agents-123456789` with `TODO_NTFY_TOPIC`. 5 replacements.
  - `git rm` the 5 old `0{1..5}-*.json`.
  - Commit with message: `chore(make): sanitize 5 Make blueprint exports + drop old templates`.
  - Per-task RUN-LOG bundling: include `complete: agent-team-frontend-wiring-v1` plan-close (PR #102, #103) per QFH-0005 (d.2) policy if not already entered (it's already in RUN-LOG from prior session, just continue from there).
- **Test plan (automated):**
  - `grep -nE 'ghp_[A-Za-z0-9]{20,}|sk-ant-api03-[A-Za-z0-9_-]{40,}' docs/agents/make/` returns 0 hits.
  - `grep -nE 'autosmartweby-agents-[0-9]{9,}' docs/agents/make/` returns 0 hits.
  - JSON validity: `for f in docs/agents/make/*.blueprint.json; do node -e "JSON.parse(require('fs').readFileSync('$f','utf8'))"; done` exits 0 for every file.
  - `node scripts/docs/check-doc-sync.mjs` 0 fail.
- **Test plan (manual):** none beyond `grep` — pure docs change.

### Task 2 — Rewrite `IMPORT-GUIDE.md` to match new blueprints

- [ ] **Status:** todo
- **Role:** docs-guardian
- **Branch:** `agent-team/make-activation-task-2`
- **Depends on:** T1 merged (so the IMPORT-GUIDE references files that actually exist on `main` post-T1)
- **Estimated LOC:** ~150 — full rewrite of `docs/agents/make/IMPORT-GUIDE.md`.
- **Files:** `docs/agents/make/IMPORT-GUIDE.md`
- **Change:**
  - Update the file inventory list (line 8): from `0{1,2,3,4,5}-*.json` to `Agent Team — *.blueprint.json`.
  - Update the architecture table (lines 18-24): module counts (Daily Triage 1, PR Review Reminder 2, Learning Loop 9, Backpressure Check 2, Weekly Digest 2) — old assumed 1, 4, 10, 4, 3 respectively.
  - Update the import procedure section (lines 95-107): clarify that scenarios are now imported via "Create new scenario → ⋯ menu → Import Blueprint" with the new filenames.
  - Add a "post-export sanitization" recipe: "When you re-export a scenario from Make UI (after token rotation or scenario edits), run the same `TODO_*` replace pattern before committing. Do not commit a blueprint that has been freshly exported with live token values."
  - Update the troubleshooting + cost sections to reflect post-MVP reality: cron schedules confirmed, ntfy topic randomization, etc.
  - Reference `feedback_make_blueprints_token_placeholders.md` workflow pattern for future maintainers (note: this is a memory record, not a repo doc; reference style: "agent maintainers should default to: blueprints with `TODO_*` placeholders in repo, real tokens in Make UI only").
- **Test plan:**
  - `node scripts/docs/check-doc-sync.mjs` 0 fail.
  - Manual smoke (owner): re-read the rewritten guide as if onboarding cold; confirm it would have prevented the 2026-04-30 token-leak incident. (Subjective acceptance.)

### Task 3 — Identify + clean up GitHub webhook duplication

- [ ] **Status:** todo
- **Role:** human (Sebastián) + light agent assist
- **Branch:** `agent-team/make-activation-task-3` (only used if any docs need updating; if no docs change, the cleanup is invisible to git)
- **Depends on:** none (independent of T1/T2; can run in parallel)
- **Files:** likely none in repo; this is a GitHub repo Settings change. If we discover something noteworthy (e.g. one of the webhooks is for a non-Make destination), record it in `RUN-LOG.md` only.
- **Change (manual, owner-driven):**
  1. Owner opens https://github.com/Spookybro55/autosmartweby/settings/hooks
  2. For each of the 2 webhooks (`hook.eu2.make.com/svjf4...` and `.../5507l...`):
     - Click the webhook → Recent Deliveries tab → look at last 7 days of payloads.
     - Cross-reference with Make UI → Scenarios → Learning Loop → click M1 webhook module → see what URL it lists.
  3. The webhook URL listed in Learning Loop M1 is the keeper; the other is the orphan.
  4. Click orphan webhook → bottom of page → **Delete**.
  5. Confirm only one `pull_request` webhook remains: `gh api repos/Spookybro55/autosmartweby/hooks --jq '[.[] | select(.events | contains(["pull_request"]))] | length'` returns `1`.
- **Agent assist:** if owner pastes both webhook URLs and the Learning Loop M1 URL, agent can confirm the matching by string compare and tell owner which to delete (saves the cross-reference click sequence).
- **Test plan:**
  - Post-cleanup `gh api repos/Spookybro55/autosmartweby/hooks` returns exactly 1 active `pull_request` webhook pointing at Make.

### Task 4 — Smoke-test 4 cron scenarios (manual)

- [ ] **Status:** todo
- **Role:** human (Sebastián)
- **Branch:** none (manual UI work)
- **Depends on:** none (independent of all other tasks; can run as soon as Make scenarios are activated)
- **Change (manual, owner-driven):**
  1. **Daily Triage:** Make UI → scenarios → Daily Triage → "Run once" button. Within 5s, ntfy notif "Agent Team — Daily Triage" arrives in mobile / web subscriber.
  2. **PR Review Reminder:** Make UI → "Run once". If there are 0 open agent PRs older than 24h, no notification (filter blocks); manufacture state by either waiting until tomorrow with current PR open, or temporarily lowering the filter threshold from `total_count > 0` to `total_count >= 0` and Run once (revert after).
  3. **Backpressure Check:** Make UI → "Run once". Same logic as PR Review Reminder but threshold is 5 — likely 0 notif unless ≥5 open agent PRs (currently we have 0 open, so this won't fire). Optional skip.
  4. **Weekly Digest:** Make UI → "Run once". Window is "merged in last 7d" + `head:agent` — should show today's session PRs (#98-103 = 6 merged agent PRs in last 7d).
- **Acceptance:** Daily Triage and Weekly Digest definitely produce ntfy. PR Review Reminder and Backpressure Check are filter-gated; "scenario runs without error" is sufficient acceptance for those two (Make scenario history shows green).
- **Test plan:** captured above; ntfy delivery logged in scenario history (Make UI → Scenarios → click name → History tab).

### Task 5 — Smoke-test Learning Loop end-to-end (manual + light agent)

- [ ] **Status:** todo
- **Role:** human (Sebastián) + agent assist (creates the test PR)
- **Branch:** `agent-team/learning-loop-smoke` (the test PR branch — distinct from this plan's task branches)
- **Depends on:** T1 merged (placeholder blueprints in repo are reference for "what should fire"), T3 done (one webhook only — otherwise both webhooks fire and we can't tell which scenario actually closed the loop)
- **Change:**
  1. Agent: create branch `agent-team/learning-loop-smoke` from `main` with one trivial-but-meaningful change (e.g. add a comment to a non-load-bearing file like `docs/agents/RUN-LOG.md`).
  2. Agent: open PR with title `chore(test): learning-loop smoke (DELETE AFTER MERGE)`.
  3. Owner: review + merge the smoke PR.
  4. Within 60s of merge:
     - GitHub repo → Settings → Webhooks → click the Make webhook → Recent Deliveries should show a green ✓ for the merge event.
     - Make UI → Scenarios → Learning Loop → History should show one green run.
     - GitHub repo → check for new commit by the bot identity (the GitHub PAT's effective user) on `docs/agents/PATTERNS.md`, `docs/agents/GOTCHAS.md`, or `docs/agents/REGRESSION-LOG.md` (any one of the three is sufficient — Anthropic may judge the diff has nothing to learn for some categories).
  5. If commit appears: ✅ end-to-end works. If commit does not appear, debug per `IMPORT-GUIDE.md` troubleshooting (Anthropic returned non-JSON, JSONParse failed, base64 round-trip wrong, etc.).
- **Acceptance criterion:** at least 1 of the 3 docs gets a new commit, OR Make scenario history is green AND Anthropic returned `{}` (legitimately found nothing to add) — both are passing states.
- **Test plan:** captured above. Cleanup: revert the `docs/agents/RUN-LOG.md` no-op edit in a follow-up commit (don't leave smoke residue in `main`).

### Task 6 — Close-out documentation (agent)

- [ ] **Status:** todo
- **Role:** docs-guardian
- **Branch:** `agent-team/make-activation-task-6`
- **Depends on:** T1, T2, T3, T4, T5 all complete (this task documents that the activation loop is operational)
- **Files:**
  - `docs/agents/SETUP-CHECKLIST.md` — tick rows 1, 2, 8, 9.
  - `docs/agents/QUESTIONS-FOR-HUMAN.md` — close `QFH-0001` (Anthropic API key) and `QFH-0008` (Make scenarios import).
  - `docs/agents/PATTERNS.md` — replace placeholder note `*Empty until Phase 3 learning loop ships.*` with `*Auto-append active since YYYY-MM-DD via Make scenario "Agent Team — Learning Loop". See ADR / RUN-LOG for activation history.*`. Same for `GOTCHAS.md` and `REGRESSION-LOG.md`.
  - `docs/agents/RUN-LOG.md` — append `complete: agent-team-make-activation-v1` plan-close entry.
  - Plan housekeeping: `git mv docs/agents/plans/ACTIVE/agent-team-make-activation-v1.md docs/agents/plans/COMPLETED/`.
  - Memory cleanup (out-of-repo, agent does it): delete `project_phase3_learning_loop_activation.md`, update `MEMORY.md` index entry.
- **Change:** mechanical updates per the file list above. No code; pure docs.
- **Test plan:**
  - `node scripts/docs/check-doc-sync.mjs` 0 fail.
  - `validate-task-record.mjs` PASSED.
  - Manual: re-read the activation status across the 4 doc files and confirm they all tell the same story (loop is live).

## Branch + commit convention

- **Per-task branches:** `agent-team/make-activation-task-N` (consistent with prior plan's `agent-team/...` and `agent/{role}/...` conventions; this plan uses the team-prefix because some tasks are owner-driven, not strictly role-tagged).
- **Commit messages** per `docs/agents/ARCHITECTURE.md` §9 — `{type}(make-activation-task-N): summary` with `[role]`, `[track]: B`, `[plan]: agent-team-make-activation-v1` trailers.
- **Plan activation PR (this PR):** `chore(plans): activate agent-team-make-activation-v1` on branch `agent-team/plan-make-activation-v1`.

## Order of execution

```
T1 (sanitize blueprints)  ───┐
T3 (webhook cleanup)      ───┤  parallel
T4 (cron smoke tests)     ───┘
                              ↓
T2 (IMPORT-GUIDE rewrite) ───  depends on T1 (filenames must match main)
T5 (LL smoke E2E)         ───  depends on T1 + T3
                              ↓
T6 (close-out docs)       ───  depends on T1-T5 all complete
```

Owner can collapse T3 + T4 into a single Make-UI session.

## Done definition

Plan is **COMPLETED** (moves to `docs/agents/plans/COMPLETED/`) when:
- All 6 task checkboxes ticked.
- Each task has its own task record in `docs/30-task-records/make-activation-task-N.md`.
- All Acceptance criteria checkboxes ticked.
- `node scripts/docs/check-doc-sync.mjs` 0 fail on the merged main.
- Memory record `project_phase3_learning_loop_activation.md` deleted; MEMORY.md index entry removed.

## Tech Lead notes for execution session

- **Bootstrap:** standard (`tech-lead.md` + `ARCHITECTURE.md` + `GOTCHAS.md` + `CLAUDE.md` + `docs/13` + `docs/14`). GOTCHA-004 (parallel env vars) is adjacent context for any future Make-related env handling but not load-bearing here. **GOTCHA-001 (clasp swap)** is a parallel-discipline reminder: the same "external system has its own state, don't desync from repo" pattern applies to Make scenarios — repo blueprint is template, Make UI is runtime, agent NEVER touches Make UI.
- **Per-task RUN-LOG bundling:** first task in this plan's first run carries `complete: agent-team-frontend-wiring-v1` plan-close per QFH-0005 (d.2) policy if not already in RUN-LOG. (At time of plan activation 2026-04-30, the prior plan's `plan-close` entry is already in RUN-LOG via PR #102, so the next task here just continues from there.)
- **Token sanitization is the blast-radius blocker for T1.** Triple-check the grep before committing. The 9 PAT occurrences and 1 Anthropic key are easy to count by eyeballing the diff; a single missed replacement keeps the repo audit-failed.
- **Webhook orphan investigation in T3:** if owner discovers the orphan is for a non-Make destination (e.g. Vercel deploy, but Vercel doesn't use a `pull_request` event hook), record the discovery in RUN-LOG + open a follow-up audit task — but don't block T1 / T2 / T4 / T5 / T6 on it.
- **`crm-frontend/AGENTS.md` warning irrelevant** — this plan touches no Next.js code.
- **Apps Script untouched** — Make scenarios talk to GitHub REST API, not Apps Script. GOTCHA-001 (clasp swap) is referenced as a *discipline* analogy, not a literal dependency.
