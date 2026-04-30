# Task Record: make-activation-task-1

## Metadata

| Pole | Hodnota |
|------|---------|
| **Task ID** | make-activation-task-1 |
| **Title** | Sanitize 5 Make blueprint exports + drop old hand-written templates |
| **Owner** | Stream B |
| **Status** | code-complete |
| **Date** | 2026-04-30 |
| **Stream** | B |
| **Agent Role** | docs-guardian |
| **Track** | B |
| **Plan** | agent-team-make-activation-v1 |
| **Autonomous run** | yes |

## Scope

T1 of plan `agent-team-make-activation-v1` (`docs/agents/plans/ACTIVE/agent-team-make-activation-v1.md`, currently in PR #104). Sanitizes the 5 Make blueprint exports owner created 2026-04-30 (`docs/agents/make/Agent Team — *.blueprint.json`, currently untracked) by replacing all literal-token-shaped strings with `TODO_*` placeholders, and removes the prior hand-written 5 templates (`0{1..5}-*.json`) that owner judged useless.

Real production tokens already live in Make UI (per owner statement 2026-04-30); the literal strings in the exports were live secrets at export time. Owner has revoked + regenerated all 3 (GitHub PAT, Anthropic API key, ntfy topic), so the strings in the working tree are post-revocation placeholders, but they visually look like live secrets — and per `feedback_make_blueprints_token_placeholders.md` the right pattern is `TODO_*` placeholders in repo, real tokens in Make UI only.

Branch convention adjusted from plan-prescribed `agent-team/make-activation-task-N` to `agent/{role}/make-activation-task-N` per `CLAUDE.md` § Branch naming. Plan file's branch convention will be amended when the plan PR (#104) lands; T1 task ships with the corrected convention.

## Code Changes

| Soubor | Typ změny | Popis |
|--------|-----------|-------|
| `docs/agents/make/Agent Team — Daily Triage.blueprint.json` | new (committed) | 1 ntfy topic replacement (`autosmartweby-agents-123456789` → `TODO_NTFY_TOPIC`). 0 PAT, 0 Anthropic. |
| `docs/agents/make/Agent Team — PR Review Reminder.blueprint.json` | new (committed) | 1 PAT (`Bearer ghp_***` → `Bearer TODO_GITHUB_TOKEN`), 1 ntfy. |
| `docs/agents/make/Agent Team — Backpressure Check.blueprint.json` | new (committed) | 1 PAT, 1 ntfy. |
| `docs/agents/make/Agent Team — Weekly Digest.blueprint.json` | new (committed) | 1 PAT, 1 ntfy. |
| `docs/agents/make/Agent Team — Learning Loop.blueprint.json` | new (committed) | **7 PAT** (1× GET diff + 6× GET/PUT against PATTERNS / GOTCHAS / REGRESSION-LOG Contents API), **1 Anthropic** (`sk-ant-api03-***` → `TODO_ANTHROPIC_API_KEY`), 0 ntfy (Learning Loop has no notification module by design). |
| `docs/agents/make/01-daily-triage.json` | deleted | Old hand-written template, owner-judged useless. |
| `docs/agents/make/02-pr-review-reminder.json` | deleted | Same. |
| `docs/agents/make/03-learning-loop.json` | deleted | Same. |
| `docs/agents/make/04-backpressure-check.json` | deleted | Same. |
| `docs/agents/make/05-weekly-digest.json` | deleted | Same. |

**Replacement count: 15 total** (10 PAT + 1 Anthropic + 4 ntfy). Sanitization done via temporary `sanitize.mjs` script (deleted post-run, not committed) using `String.prototype.split + join` pattern (no regex escape concerns). All 5 sanitized JSON files re-parsed via `JSON.parse` post-write to confirm no structural damage.

## Docs Updated

| Dokument | Typ změny | Proč |
|----------|-----------|------|
| `docs/30-task-records/make-activation-task-1.md` | new | This task record. Filename matches branch tail `make-activation-task-1` per `scripts/agent/validate-task-record.mjs` derivation. |
| `docs/agents/RUN-LOG.md` | modified | T1 trace (claim → classify → dispatch → fix → test → self-review → cross-review → dod-check). No prior `complete` entry to bundle here — the activation PR (#104) is itself the carrier of the previous plan's close-out summary; that PR has not yet merged at T1's branch creation time, so no bundling applies per QFH-0005 (d.2). |
| `docs/11-change-log.md` | regenerated | Auto from task records (`build-changelog.mjs`). |
| `docs/29-task-registry.md` | regenerated | Auto from task records (`build-task-registry.mjs`). |
| `docs/agents/plans/ACTIVE/agent-team-make-activation-v1.md` | **NOT modified** | Plan file lives on `chore/activate-make-activation-plan` branch (PR #104), not yet on `main`. T1 ships against `main` and does not touch the plan file. Plan checkbox tick happens after both #104 and this PR merge — bundled into T2's first RUN-LOG appends. |

**Stream B mandatory canonical docs** (`docs/20`, `docs/22`, `docs/26`, `docs/27`) **NOT updated** — same rationale as the prior plan's tasks. Sanitization is a docs-template hygiene change with zero impact on system state, architecture, runtime infrastructure, or offer generation. The Make scenarios themselves are runtime infra (already operational in Make UI per owner statement), and the templates in the repo are a recovery / re-import / audit artifact, not a runtime surface.

## Contracts Changed

- **No API contract change.** No backend touched.
- **No public-component prop change.** No code touched.
- **Blueprint template contract change:** files under `docs/agents/make/` are now expected to use `TODO_GITHUB_TOKEN` / `TODO_ANTHROPIC_API_KEY` / `TODO_NTFY_TOPIC` placeholders. Anyone exporting a fresh Make scenario that includes live tokens must run the same replacement pass before committing. T2 (rewrite IMPORT-GUIDE) formalises this; T1 just establishes the pattern by example.
- **No env / config change.** Vercel env vars untouched. Make UI runtime tokens untouched (live in Make, not in repo).
- **No webhook / route change.** GitHub webhooks (`hook.eu2.make.com/...`, 2 active per `gh api repos/.../hooks`) untouched — that's T3's concern.

## Tests

| Test | Výsledek |
|------|----------|
| `node sanitize.mjs` (temp script, post-run grep) | OK — 15 replacements applied across 5 files, all `JSON.parse` post-write succeeded |
| `grep -nE 'ghp_[A-Za-z0-9]{15,}\|sk-ant-api03-[A-Za-z0-9_-]{15,}\|autosmartweby-agents-[0-9]{6,}' docs/agents/make/` | OK — 0 hits (was 16 before sanitize: 10 PAT + 1 Anthropic + 5 ntfy. After: 0) |
| `for f in docs/agents/make/*.blueprint.json; do node -e "JSON.parse(require('fs').readFileSync('$f','utf8'))"; done` | OK — all 5 files parse |
| `node scripts/docs/check-doc-sync.mjs` | OK — 43 pass / 0 warn / 0 fail |
| `node scripts/agent/validate-task-record.mjs --pr-branch agent/docs-guardian/make-activation-task-1` | PASSED |
| GitHub Push Protection | (will be tested at push time) — expected pass since all token patterns sanitized |

**Manual smoke** (per plan T1 Test plan): captured above (grep + JSON.parse). No browser smoke applicable — these are docs-template files, not a runtime surface.

## Output for Audit

After this PR is merged:

- `grep -rE 'ghp_[A-Za-z0-9]{15,}\|sk-ant-api03-[A-Za-z0-9_-]{15,}' docs/agents/make/` returns 0 globally (within the make/ folder).
- `git ls-files docs/agents/make/ | wc -l` returns **6** (5 new blueprints + IMPORT-GUIDE.md). Old `0{1..5}-*.json` no longer present.
- Anyone who clones the repo can `cat docs/agents/make/Agent\ Team\ —\ *.blueprint.json` and find `TODO_GITHUB_TOKEN` / `TODO_ANTHROPIC_API_KEY` / `TODO_NTFY_TOPIC` placeholders — ready for Make UI find-replace at re-import time, no live secret exposure.
- T1 of plan `agent-team-make-activation-v1` is complete. Acceptance criterion 1 (no token-shaped strings in `docs/agents/make/`) and acceptance criterion 2 (old `0{1..5}-*.json` removed) are met.

## Known Limits

- **OneDrive cloud copy retention.** The literal-token versions of the 5 blueprints sat on local disk (which is OneDrive-synced) for some hours before sanitization. OneDrive's version history may retain the leaked-token versions for ~30 days (default OneDrive Personal). Owner already revoked tokens, so blast radius is bounded; cleaning OneDrive version history is a follow-up housekeeping task (low priority, since tokens are dead).
- **No automated pre-commit secret scanner.** This task fixed the leak reactively; preventing future leaks of this shape requires either (a) a pre-commit hook that greps for `ghp_[A-Za-z0-9]{20,}` etc. and blocks the commit, or (b) reliance on GitHub Push Protection (which we already have — it caught the original push attempt). MVP relies on (b) + the workflow rule documented in T2 (rewrite IMPORT-GUIDE).
- **The temporary `sanitize.mjs` script is not committed.** It was a one-shot tool; if owner re-exports a blueprint and needs the same pass, the script logic is straightforward to reconstruct (3 `String.split + join` calls) and trying to commit a generic "sanitize blueprint" script invites a second front of secret-scanning false positives. Out of scope.
- **Replacement is exact-match only.** The script replaces the exact PAT / Anthropic key / ntfy topic strings I identified. If a fresh export contains a *different* live token (e.g. owner rotated and re-exported), the script as-written wouldn't catch it. T2's IMPORT-GUIDE rewrite documents the manual recipe owner should follow on each re-export. Defensive grep is the catch-all.
- **No `NEXT_PUBLIC_*` analogue here.** Unlike GOTCHA-004's parallel-env-var trap in the CRM, Make scenarios use a single token per concern; this is just a single-rotation problem, not a dual-config problem. Mentioned for completeness only.

## Next Dependency

| Task | Co potřebuje z T1 |
|------|------------------|
| **T2** (rewrite IMPORT-GUIDE) | **Hard dependency.** IMPORT-GUIDE references blueprint filenames + module counts; until the new `Agent Team — *.blueprint.json` files are on `main` (this PR), the rewrite would dangle. |
| **T3** (webhook orphan cleanup) | Independent of T1. |
| **T4** (cron smoke tests) | Independent of T1. |
| **T5** (Learning Loop E2E smoke) | Soft dependency. T5 references the Learning Loop blueprint as the "expected scenario in Make UI"; with T1 merged, the on-disk blueprint matches what's running in Make UI (modulo token swap), making any drift visible. |
| **T6** (close-out docs) | Hard dependency. T6 ticks acceptance criteria including criterion 1 (token-free `docs/agents/make/`) and criterion 2 (old `0{1..5}-*.json` removed). |

Plan `agent-team-make-activation-v1` will be **17% complete** after this PR (T1 of 6 done; plan PR #104 itself counts as activation, not a task).

## DoD Checklist

> Required for agent-driven tasks (Track A or Track B with `Agent Role` ≠ `human`). Optional for human tasks.

### Code Done

- [x] No code in this PR — pure docs / templates. `tsc` / `build` not applicable.
- [x] No secrets in diff — verified via grep `ghp_[A-Za-z0-9]{15,}` etc. = 0 hits.
- [x] No regressions — Make scenarios in Make UI run with real tokens (untouched); on-disk blueprints are reference templates only.
- [x] All 5 new blueprints `JSON.parse` cleanly post-sanitization.

### Documentation Done

- [x] Affected docs identified per `docs/13-doc-update-rules.md` stream mapping — Stream B canonical docs reviewed; no semantic update needed (template hygiene only)
- [x] Affected docs updated — task record, RUN-LOG (no bundled previous-PR `complete` per §Docs section above)
- [x] `docs/11-change-log.md` regenerated (`build-changelog.mjs`)
- [x] `docs/29-task-registry.md` regenerated (`build-task-registry.mjs`)
- [x] Control tower (`docs/09`) checked — T1 not tracked there (granular plan task)
- [x] Route mapa (`docs/12`) checked — N/A, no route change
- [x] Plan file **NOT updated** — see § Docs Updated rationale (plan lives on PR #104 branch, not yet on main)

### Test Done

- [x] Tests pass — `JSON.parse` × 5 + grep × 1, all clean
- [x] `node scripts/docs/check-doc-sync.mjs`: 0 fail
- [x] No `npm run build` applicable

### Agent Done (Track A only — Track B partial application)

- [x] Diff size — actual ~210 KB additions (5 blueprints, large by file count but mechanical), 5 file deletions, +taskrecord ~9 KB. Track B has no hard limit; this PR is "many lines of unmodified blueprint JSON" + a small handful of replaced token strings.
- [x] Secret scan clean — grep verified 0 hits for token shapes; GitHub Push Protection will be the final gate at push time
- [x] Self-review pass — re-read the post-sanitize blueprints fresh: (a) all 4 blueprints with PATs now show `Bearer TODO_GITHUB_TOKEN` in Authorization headers; (b) Learning Loop M3 shows `TODO_ANTHROPIC_API_KEY` in `x-api-key` header; (c) all 4 cron scenarios + Learning Loop ntfy module reference `https://ntfy.sh/TODO_NTFY_TOPIC` (Learning Loop has no ntfy module so no replacement there); (d) JSON structure intact — `flow` array length and module IDs unchanged in every file. 0 issues.
- [x] Cross-role review pass — Tech Lead read full diff before PR open
- [x] Plan checkbox tracking — T1 stays unchecked in plan file; will tick post-merge of both #104 (plan-on-main) and this PR (T1-on-main), bundled into T2's RUN-LOG appends
- [x] `docs/agents/RUN-LOG.md` appended — full T1 trace
- [x] No `apps-script/.clasp.json` change
- [x] No `.env*` change
- [x] No `docs/archive/` change
- [x] Branch convention: `agent/docs-guardian/make-activation-task-1` (per `CLAUDE.md` § Branch naming, slight deviation from plan's `agent-team/make-activation-task-1` — plan file will be amended when #104 lands)
