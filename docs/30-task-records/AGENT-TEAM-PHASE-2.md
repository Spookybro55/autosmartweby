# Task Record: AGENT-TEAM-PHASE-2

## Metadata

| Pole | Hodnota |
|------|---------|
| **Task ID** | AGENT-TEAM-PHASE-2 |
| **Title** | AI Agent Team — Phase 2: remaining roles + CI workflow + triage scripts |
| **Owner** | Sebastián Fridrich |
| **Status** | code-complete |
| **Date** | 2026-04-29 |
| **Stream** | B |
| **Agent Role** | human |
| **Track** | B |
| **Plan** | 03-master-plan.md (v1.0) + Phase 2 green-light prompt |
| **Autonomous run** | no |

## Scope

Phase 2 of 3 — completes the agent role layer (3 remaining SKILLs), adds CI
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

## Code Changes

| Soubor | Typ změny | Popis |
|--------|-----------|-------|
| docs/agents/roles/security-engineer.md | new | SKILL pro SEC-* + CC-SEC-* findings. 8 sekcí (Mission / Workflow / Project-specific patterns / Worked examples / Forbidden / Required / Reference docs / Reflection). Hard rule: irreversible P0 → MUST escalate even if "autonomně" approved. Reference patterns: middleware.ts HMAC timing-safe (H-2 resolved), EnvConfig.gs envGuard_, BX1 doPost timing-insensitive compare. |
| docs/agents/roles/qa-engineer.md | new | SKILL pro CC-QA-* findings + general test authoring. 7 sekcí. Test types matrix (unit / integration / smoke / e2e). Project-specific: existing scripts test:b03/b04/b05/b06, CC-QA-002 awareness (E2E gap), CC-QA-004 (preview store loss regression). |
| docs/agents/roles/docs-guardian.md | new | SKILL pro doc-side closure of every task. 9 sekcí. Stream-doc mapping table (full from docs/13). FINDINGS.md `**Resolved**` convention. Generated vs auto-appended files distinction. Validation pipeline. |
| .github/workflows/agent-pr-validation.yml | new | CI workflow triggered on `agent/*` + `agent-team/*` branches. Runs tsc, build, B-stream tests, docs:check, validate-task-record.mjs, diff size enforcement (Track A 500 LOC unless [size-override]), gitleaks scan. Non-blocking for missing optional tools (uses --if-present and \|\| true gracefully). |
| scripts/agent/triage.mjs | new | Parses docs/audits/FINDINGS.md, filters Open findings, classifies by prefix (SEC/CC-SEC → security-engineer, FF/IN/AS → bug-hunter, DOC/BLD/DP → docs-guardian or bug-hunter, CC-QA → qa-engineer), sorts by priority P0..P3, updates QUEUE.md "Ready" section preserving other sections. CLI: --dry-run, --top N. |
| scripts/agent/validate-task-record.mjs | new | Used by CI agent-pr-validation. Reads --pr-branch arg, derives task ID, checks docs/30-task-records/{task-id}.md exists, validates metadata fields filled (no placeholders), valid status/stream/track/role enum values, DoD checklist section present. Tolerant of ad-hoc IDs (cleanup-and-sec-016 style). |
| scripts/docs/build-task-registry.mjs | modified | Optional 9th column "Role" added. Backwards compatible — existing 46 records without agent_role get "-" in Role column. |

## Docs Updated

| Dokument | Typ změny | Proč |
|----------|-----------|------|
| docs/30-task-records/AGENT-TEAM-PHASE-2.md | new | Tento task record. |
| docs/agents/roles/security-engineer.md | new | New SKILL file. |
| docs/agents/roles/qa-engineer.md | new | New SKILL file. |
| docs/agents/roles/docs-guardian.md | new | New SKILL file. |
| docs/11-change-log.md | regenerated | Auto z task records. |
| docs/29-task-registry.md | regenerated | Auto z task records (with new optional Role column). |

## Contracts Changed

- **Task registry schema extended** (additive). New optional 9th column `Role`.
  Existing 46 records without `Agent Role` field get `-` placeholder in that
  column. Build script remains backwards compatible.
- **CI gate added** for `agent/*` + `agent-team/*` branches via
  `agent-pr-validation.yml`. Status check name `validate-agent-pr`. NOT yet
  added to branch protection required checks (Sebastián can add manually
  in GitHub UI after first successful run).
- **Triage helper** establishes new format expectation for QUEUE.md "Ready"
  section: each entry has `### {priority} {finding-id}: {title}` heading
  with deterministic metadata block. Existing Phase 1 manual seed in QUEUE.md
  is compatible with this format.
- **Task record validation** introduces machine-parseable contract: required
  fields, valid enums. Future agent records must comply or CI rejects PR.
- **No code contract changes** in apps-script/ or crm-frontend/.

## Tests

| Test | Výsledek |
|------|----------|
| `node scripts/docs/check-doc-sync.mjs` | OK — 43+ pass / 0 fail |
| `node scripts/docs/build-changelog.mjs` | OK — regenerated |
| `node scripts/docs/build-task-registry.mjs` | OK — backwards compatible (46 existing records get "-" in Role column) |
| `node scripts/agent/triage.mjs --dry-run` | OK — smoke test classifies findings |
| `node scripts/agent/validate-task-record.mjs --pr-branch agent-team/phase-2-roles-and-automation` | OK — finds AGENT-TEAM-PHASE-2.md, all fields valid |
| `npx tsc --noEmit` (crm-frontend) | N/A — no frontend code changes |
| `npm run build` (crm-frontend) | N/A — no frontend code changes |
| YAML syntax check (agent-pr-validation.yml) | manual review (no actionlint installed) |

## Output for Audit

After this PR ships:
- 3 remaining role SKILLs available in `docs/agents/roles/`. Tech Lead can
  dispatch to all 5 roles.
- Agent-driven PRs run through `agent-pr-validation.yml` CI workflow on every
  push. Failures block merge (once Sebastián adds it as required status check).
- `triage.mjs` automatable as cron (Phase 3 Make scenario "Daily triage 8:00").
- `validate-task-record.mjs` used by CI; rejects malformed task records before
  merge.
- `build-task-registry.mjs` includes optional Role column without breaking 46
  existing records.
- 0 frontend code changes, 0 Apps Script changes, 0 secrets in diff.

## Known Limits

- **CI workflow not yet required** by branch protection. Sebastián must add
  `validate-agent-pr` to required status checks in GitHub UI Settings →
  Branch protection rules → main, after Phase 2 PR shows green.
- **gitleaks-action** uses defaults if `.github/gitleaks.toml` doesn't exist
  (it doesn't in Phase 2). Consider adding custom config in Phase 3.
- **triage.mjs is read-only against FINDINGS.md** — does NOT update finding
  status. That remains Docs Guardian's manual job during task closure.
- **validate-task-record.mjs is tolerant** of ad-hoc IDs (e.g. `cleanup-and-sec-016`).
  It checks file existence + basic metadata, not strict task-id-prefix match.
- **No commitlint hook** — commit convention `fix({task-id}): [role]: ...`
  is documented (CLAUDE.md, ARCHITECTURE.md §9) but not enforced. Could
  be added in a Phase 2 follow-up.
- **No `actionlint` validation** in repo — YAML workflow correctness is
  manual review only. CI will catch syntax errors on first PR run.
- **Diff size for this PR exceeds 500 LOC** — Phase 2 setup is plan-driven
  (Track B). Track A 500 LOC limit applies only to autonomous bug-fix
  runs. PR description flags `[size-override]` explicitly.

## Next Dependency

| Task | Co potřebuje z AGENT-TEAM-PHASE-2 |
|------|------------------------------------|
| AGENT-TEAM-PHASE-3 (CRM dashboard + Make scenarios) | All Phase 2 SKILLs (referenced by dashboard knowledge panel); triage.mjs (Make scenario invokes daily); validate-task-record.mjs (no direct dependency, but CI must pass for Phase 3 PR). |
| First agent-driven autonomous PR (post-Phase-2-merge, separate task) | All 5 role SKILLs ready; triage.mjs populated QUEUE.md; validate-task-record.mjs guards PR; manual: Sebastián adds `validate-agent-pr` as required status check. |
| Phase 3 prerequisite (Sebastián manual setup) | docs/agents/SETUP-CHECKLIST.md (created in Phase 1) — Anthropic API key, Make Core plan, Vercel OWNER_EMAIL env, optional GitHub PAT for dashboard. |

## DoD Checklist

### Code Done

- [x] No frontend changes — N/A `npx tsc --noEmit` / `npm run build`
- [x] No secrets in diff (manual scan: 3 role files + workflow YAML + 2 scripts + 1 modified script — no API keys, tokens, sheet IDs in plain text)
- [x] No regressions — modified `build-task-registry.mjs` is backwards-compatible (new optional Role column, existing 46 records get `-`)

### Documentation Done

- [x] Affected docs identified: only `docs/30-task-records/AGENT-TEAM-PHASE-2.md` (this file) + `docs/agents/roles/*.md` (3 new SKILLs) — all Phase 2 deliverables ARE the doc changes
- [x] Affected docs updated (this PR creates them)
- [x] `docs/11-change-log.md` regenerated post-task-record-write
- [x] `docs/29-task-registry.md` regenerated post-task-record-write (with new Role column)
- [x] Control tower (`docs/09-project-control-tower.md`) — no impact (Phase 2 is meta-layer, doesn't change tracked items)
- [x] Route mapa (`docs/12-route-and-surface-map.md`) — no impact (no new routes)

### Test Done

- [x] `node scripts/agent/triage.mjs --dry-run --top 5`: OK — parses 161 findings, 66 Open, sorts by priority correctly
- [x] `node scripts/agent/validate-task-record.mjs --pr-branch agent-team/phase-2-roles-and-automation`: PASSED
- [x] `node scripts/agent/validate-task-record.mjs --pr-branch agent/bug-hunter/FF-020`: correctly exits 1 with "missing record" error (negative test)
- [x] `node scripts/agent/validate-task-record.mjs --pr-branch task/A-11-followup-rate-limit`: PASSED on legacy record (backwards compatibility)
- [x] `node scripts/docs/build-task-registry.mjs`: OK — 47 records regenerated with new Role column, existing records get `-`
- [x] `node scripts/docs/check-doc-sync.mjs`: 43+ pass / 0 fail
- [ ] CI workflow `agent-pr-validation.yml` self-test — runs on this PR opening, validated by GitHub Actions

### Agent Done (Track B with size-override)

- [x] `[size-override]` — Track B setup PR, ~1500 LOC across 7 files. Track A 500 LOC limit applies only to autonomous bug-fix runs (per discovery Sekce 8 #8).
- [x] No secrets in diff (mental gitleaks scan: clean)
- [x] Self-review pass — re-read each role SKILL, workflow YAML, and 2 scripts; project-specific references verified (FINDINGS.md anchors, real PR refs, real file paths)
- [x] No `apps-script/.clasp.json` change
- [x] No `.env*` change
- [x] No `docs/archive/` change
- [x] Branch: `agent-team/phase-2-roles-and-automation` (Phase-prefix variant per Phase 1 convention)
