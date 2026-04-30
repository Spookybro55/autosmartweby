# Task Record: make-activation-task-2

## Metadata

| Pole | Hodnota |
|------|---------|
| **Task ID** | make-activation-task-2 |
| **Title** | Rewrite `docs/agents/make/IMPORT-GUIDE.md` to match new blueprints + add post-export sanitization recipe |
| **Owner** | Stream B |
| **Status** | code-complete |
| **Date** | 2026-04-30 |
| **Stream** | B |
| **Agent Role** | docs-guardian |
| **Track** | B |
| **Plan** | agent-team-make-activation-v1 |
| **Autonomous run** | yes |

## Scope

T2 of plan `agent-team-make-activation-v1`. After T1 (PR #105) committed the 5 sanitized blueprints + dropped the 5 old hand-written templates, the existing `IMPORT-GUIDE.md` now references files that no longer exist (`0{1..5}-*.json`) and module counts that don't match the new exports (e.g. it claimed PR Review Reminder had 4 modules; the new blueprint has 2 thanks to GitHub Search API server-side filtering).

This task rewrites the IMPORT-GUIDE end-to-end to match the new reality, adds a post-export sanitization recipe (the missing piece that would have prevented the 2026-04-30 token-leak incident), formalizes the "Maintenance pattern" section pointing at the feedback memory record, and ticks T1's checkbox in the plan file (post-merge per Track B convention) with a note about the branch-convention adjustment.

## Code Changes

| Soubor | Typ změny | Popis |
|--------|-----------|-------|
| `docs/agents/make/IMPORT-GUIDE.md` | rewritten | Full rewrite (~280 lines vs prior ~235). New file inventory (`Agent Team — *.blueprint.json`), updated architecture table with correct module counts (Daily Triage 1, PR Review Reminder 2, Learning Loop 9, Backpressure Check 2, Weekly Digest 2), new § "Post-export sanitization recipe" with copy-paste Node script + verification grep, new § "Maintenance pattern" formalizing the pattern from the feedback memory, added Push-Protection troubleshooting entry. Old "Architecture (HTTP-only against GitHub REST API)" header preserved + extended; cron tables, cost tables, kill-switch section all kept verbatim. |
| `docs/agents/plans/ACTIVE/agent-team-make-activation-v1.md` | modified | (a) T1 checkbox ticked: `[ ] todo` → `[x] complete (PR #105, merged 2026-04-30, commit 1cd92bf)`, with branch-convention adjustment note. (b) Branch convention section corrected from `agent-team/make-activation-task-N` to `agent/{role}/make-activation-task-N` per `CLAUDE.md`; 5 occurrences total (header note, T2/T3/T6 task branches, "Per-task branches" footer). T3/T4/T5 description updated to clarify which tasks ship branches vs which are owner-driven Make-UI / GitHub-UI work. |

## Docs Updated

| Dokument | Typ změny | Proč |
|----------|-----------|------|
| `docs/agents/make/IMPORT-GUIDE.md` | rewritten | Primary deliverable — see § Code Changes. |
| `docs/agents/plans/ACTIVE/agent-team-make-activation-v1.md` | modified | T1 checkbox tick + branch convention correction (see § Code Changes). |
| `docs/30-task-records/make-activation-task-2.md` | new | This task record. |
| `docs/agents/RUN-LOG.md` | modified | Bundled `complete: make-activation-task-1 (PR #105, merge 1cd92bf)` + `plan-activate complete (PR #104)` per QFH-0005 (d.2) policy + full T2 trace. |
| `docs/11-change-log.md` | regenerated | Auto from task records (`build-changelog.mjs`). |
| `docs/29-task-registry.md` | regenerated | Auto from task records (`build-task-registry.mjs`). |

**Stream B mandatory canonical docs** (`docs/20`, `docs/22`, `docs/26`, `docs/27`) **NOT updated** — same rationale as T1. IMPORT-GUIDE rewrite is operator documentation for an external runtime (Make UI) that's already operational; no change to internal architecture, env, infra, or offer generation. The architecture itself is documented within IMPORT-GUIDE for context, not in the canonical layer.

## Contracts Changed

- **No API contract change.**
- **No public-component prop change.**
- **Documentation contract:** `IMPORT-GUIDE.md` is now the single source of truth for the Make scenario import / maintenance workflow. The post-export sanitization recipe formalizes the rule "blueprints in repo = `TODO_*` placeholders, real tokens in Make UI only" — anyone re-exporting from Make UI must run the recipe before staging.
- **No env / config change.**
- **Plan file branch convention:** `agent-team/...` → `agent/{role}/...`. Affects T3-T6 future-task branches (T1 already shipped under the corrected convention). No impact on already-merged content.

## Tests

| Test | Výsledek |
|------|----------|
| `node scripts/docs/check-doc-sync.mjs` | OK — 43 pass / 0 warn / 0 fail |
| `node scripts/agent/validate-task-record.mjs --pr-branch agent/docs-guardian/make-activation-task-2` | PASSED |
| Token grep on `docs/agents/make/` (post-rewrite) | OK — `grep -nE 'ghp_[A-Za-z0-9]{15,}\|sk-ant-api03-[A-Za-z0-9_-]{15,}\|autosmartweby-agents-[0-9]{6,}' docs/agents/make/` returns 0 |
| Manual: re-read rewritten IMPORT-GUIDE as if onboarding cold | Subjective acceptance — covers prereq → import → 3-placeholder swap → schedule → activate → smoke → kill-switch flow without dangling references to deleted `0{1..5}-*.json` files or wrong module counts |

**Manual smoke** (per plan T2 Test plan): would-have-prevented test — re-read the rewrite and asked "would the 2026-04-30 token-leak incident have happened if a maintainer followed this guide cold?" Answer: no, because (a) § Post-export sanitization recipe is now front-and-center, (b) § ntfy topic prereq explicitly forbids predictable names like `123456789`, (c) § Maintenance pattern formalizes "real tokens never round-trip back into repo on re-export". Acceptance: yes.

## Output for Audit

After this PR is merged:

- `docs/agents/make/IMPORT-GUIDE.md` references only `Agent Team — *.blueprint.json` filenames; old `0{1..5}-*.json` references are fully removed.
- Module counts in the architecture table match the actual flow lengths in the 5 committed blueprints (1, 2, 9, 2, 2).
- A new maintainer running the document cold has a copy-paste sanitization recipe + an explicit "do not commit raw exports" rule in § Maintenance pattern.
- T1 checkbox in the plan is ticked, marking the post-merge state correctly.
- Plan branch convention is consistent with `CLAUDE.md` and with what T1 actually shipped under.

T2 of plan `agent-team-make-activation-v1` is complete. Plan progress: 33% (T1, T2 done; T3-T6 todo).

## Known Limits

- **No automated lint of the IMPORT-GUIDE → blueprints link.** If a future re-export adds / removes a module, the IMPORT-GUIDE module-count table can drift. A small lint script (read each blueprint's `flow.length`, compare with table) would catch this — out of scope for T2; if drift bites, easy follow-up.
- **Recipe is `node -e` based, not a committed tool script.** Trade-off: keeping the recipe inline in the doc avoids a "second front of secret-scanning false positives" concern (a generic `sanitize.mjs` script can't know which token strings to look for without hardcoding). Anyone who needs it can copy-paste from the doc; explicit env-var inputs (`GH_PAT`, `ANTHROPIC_KEY`, `NTFY_TOPIC`) prevent the recipe from being a foot-gun.
- **Push Protection mention is informational, not a substitute for the recipe.** Push Protection caught the leak in the plan v1 PR but does not prevent secrets from sitting on local disk / OneDrive sync before the push. The recipe + § ntfy topic NEVER-commit rule are the primary defence.
- **No screenshot / visual walkthrough.** The Make UI changes between minor versions (Find&Replace location, schedule tab name, etc.). A text-only guide is more robust to UI drift; if a maintainer struggles, screenshots can be added — out of scope.

## Next Dependency

| Task | Co potřebuje z T2 |
|------|------------------|
| **T3** (webhook orphan cleanup) | None directly — T3 is owner-driven GitHub UI work. T2's troubleshooting section now mentions the "2 webhooks pointing at same repo" symptom which is what T3 fixes. |
| **T4** (cron smoke tests) | None directly — T4 is Make-UI Run-Once smoke. T2's § Test postup now references T4's exact procedure. |
| **T5** (Learning Loop E2E) | T2's § Test postup line 3 documents the smoke recipe T5 will follow. |
| **T6** (close-out docs) | Hard dependency. T6 ticks acceptance criteria including the IMPORT-GUIDE rewrite criterion. |

Plan `agent-team-make-activation-v1` is **33% complete** after this PR (2 of 6 tasks done).

## DoD Checklist

> Required for agent-driven tasks (Track A or Track B with `Agent Role` ≠ `human`). Optional for human tasks.

### Code Done

- [x] No code in this PR — pure docs rewrite.
- [x] No secrets in diff — IMPORT-GUIDE rewrite uses placeholders / ENV vars in recipe; grep across `docs/agents/make/` post-rewrite returns 0 token shapes.
- [x] No regressions — guide rewrite is additive in scope (more sections, same/wider audience), no Make scenario behavior change.

### Documentation Done

- [x] Affected docs identified per `docs/13-doc-update-rules.md` stream mapping — Stream B canonical docs reviewed; no semantic update needed (operator docs only).
- [x] Affected docs updated — IMPORT-GUIDE rewrite, plan T1 checkbox + branch convention, RUN-LOG bundled with previous-PR `complete` entries.
- [x] `docs/11-change-log.md` regenerated (`build-changelog.mjs`).
- [x] `docs/29-task-registry.md` regenerated (`build-task-registry.mjs`).
- [x] Control tower (`docs/09`) checked — T2 not tracked there (granular plan task).
- [x] Route mapa (`docs/12`) checked — N/A.
- [x] Plan file updated — T1 checkbox ticked, T2 stays open until this PR merges.

### Test Done

- [x] Tests pass — no test surface; `check-doc-sync` 0 fail + grep clean.
- [x] `npm run build` not applicable (docs only).

### Agent Done

- [x] Diff size — IMPORT-GUIDE rewrite ~280 lines (vs prior 235); plan file ~10-line edits; task record ~150 lines. Track B has no hard limit; this PR is operator-doc heavy. `[size-override]` should not be needed (insertions probably ~400 LOC, well under 500), but plan is Track B regardless.
- [x] Secret scan clean — no token shapes introduced.
- [x] Self-review pass — re-read rewrite fresh: prereq order makes sense (PAT → Anthropic → ntfy), 3-placeholder swap is the only manual edit, post-export recipe is the missing piece, kill-switch is preserved verbatim. 0 issues.
- [x] Cross-role review pass — Tech Lead read full diff before PR open.
- [x] Plan checkbox tracking — T1 ticked (post-#105-merge), T2 stays open.
- [x] `docs/agents/RUN-LOG.md` appended — full T2 trace + bundled #104 + #105 closures.
- [x] No `apps-script/.clasp.json` change.
- [x] No `.env*` change.
- [x] No `docs/archive/` change.
- [x] Branch convention: `agent/docs-guardian/make-activation-task-2` (canonical per `CLAUDE.md`).
