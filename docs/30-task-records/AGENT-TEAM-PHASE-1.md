# Task Record: AGENT-TEAM-PHASE-1

## Metadata

| Pole | Hodnota |
|------|---------|
| **Task ID** | AGENT-TEAM-PHASE-1 |
| **Title** | AI Agent Team — Phase 1: knowledge base + Tech Lead + Bug Hunter |
| **Owner** | Sebastián Fridrich |
| **Status** | code-complete |
| **Date** | 2026-04-29 |
| **Stream** | B |
| **Agent Role** | human |
| **Track** | B |
| **Plan** | 03-master-plan.md (v1.0, schváleno) |
| **Autonomous run** | no |

## Scope

Phase 1 of 3 — bootstrap AI agent team setup per `docs/agents/_discovery-report.md`
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

## Code Changes

| Soubor | Typ změny | Popis |
|--------|-----------|-------|
| docs/agents/README.md | new | Entry point for the vault. Explains how to read the directory, when to call Tech Lead from Claude Code terminal, what NOT to use the agent system for, Obsidian setup hint. |
| docs/agents/ARCHITECTURE.md | new | Master plan §3 + §4 + §5 expanded for this repo. Explicit Stream ⊥ Track callout (per Sekce 8 #1). Real prefixes (Sekce 8 #2). 5 agent roles with role-loading mechanism. Tracks A vs B detail. Stop conditions. |
| docs/agents/PATTERNS.md | new | Auto-appended file (learning loop target). Header marks `## Auto-generated` vs `## Manual entries` split per Sekce 8 #6. Phase 1 ships empty stub. |
| docs/agents/GOTCHAS.md | new | Auto-appended file with 3 seed entries: clasp swap risk (TEST↔PROD), EXTENSION_COLUMNS pitfall (apps-script HeaderResolver), HMAC timing (timing-safe compare requirement). All grounded in real code paths. |
| docs/agents/REGRESSION-LOG.md | new | Auto-appended file. Format spec for "this bug was fixed once before" entries. Phase 1 ships empty stub. |
| docs/agents/DECISIONS.md | new | ADR log. Phase 1 seeds ADR-001 "Adopt agent team architecture" referencing master plan + discovery report. |
| docs/agents/PLAYBOOKS.md | new | Step-by-step recipes. Phase 1 ships 2 sample playbooks: "Resolve a P2 SEC finding" and "Document a stream-mapping update". |
| docs/agents/QUEUE.md | new | Track A queue. Phase 1 seeds top 10 P2 findings extracted from FINDINGS.md as initial green-light tasks. Format spec for queue entries. |
| docs/agents/QUESTIONS-FOR-HUMAN.md | new | Escalation log. Empty stub with format spec. |
| docs/agents/RUN-LOG.md | new | Append-only run history. Empty stub with format spec (timestamp, role, task_id, step, outcome, notes). |
| docs/agents/roles/tech-lead.md | new | Default role. Single entry point. Classification logic (Track A vs B, Stream A/B/C derivation from affected docs per Sekce 9 Q2). Role dispatch. Self-review checkpoint. Stop conditions enforcement. |
| docs/agents/roles/bug-hunter.md | new | Reproduce → fix → test pattern. FF-* and AS-* finding types. Concrete reference to existing fixes in repo (PR #80 rate limit, PR #78 idempotence guard, PR #77 stale reaper) as templates. |
| docs/agents/SETUP-CHECKLIST.md | new | Manual prerequisites Sebastián must complete before Phase 3 (Anthropic API key, Make scenarios import, ntfy topic if used, Vercel env OWNER_EMAIL). Phase 1+2 do not need any manual setup. |
| CLAUDE.md | modified | Add "AI Agent Team" section with link to docs/agents/, hard rule extensions (NEVER edit .clasp.json, NEVER touch Apps Script Properties, NEVER bypass branch protection), Stream ⊥ Track callout. |
| docs/30-task-records/_template.md | modified | Add 4 new metadata fields: Agent Role, Track, Plan, Autonomous run. Add `## DoD Checklist` section with the 4 sub-DoDs (Code/Doc/Test/Agent). Status enum extended to: draft / in-progress / code-complete / ready-for-deploy / done / blocked / cancelled. |
| docs/14-definition-of-done.md | modified | Add 4th section "Agent Done" mapping master plan §4 (10 bodů) to checklist items: diff size <500 LOC for Track A, secret-scan clean, self-review pass, cross-role review pass, queue updated, run-log appended. |

## Docs Updated

| Dokument | Typ změny | Proč |
|----------|-----------|------|
| docs/30-task-records/AGENT-TEAM-PHASE-1.md | new | Tento task record. |
| docs/agents/* | new (12 files) | Vault foundation per Phase 1 scope. |
| CLAUDE.md | modified | Governance must reference new agent system; hard rules extended. |
| docs/30-task-records/_template.md | modified | New agent-aware fields needed for future records. |
| docs/14-definition-of-done.md | modified | Agent Done section added per Sekce 8 #5. |
| docs/11-change-log.md | regenerated | Auto z task records. |
| docs/29-task-registry.md | regenerated | Auto z task records. |

## Contracts Changed

- **Task record schema extended** (additive only, no breaking change). New
  metadata fields are optional for existing 46 records (Q1 = no backfill).
  Build scripts (`build-changelog.mjs`, `build-task-registry.mjs`) parse
  existing fields via the same regex; new fields are simply ignored if
  absent. Registry table sloupce remain 8 (Task ID / Stream / Title / Owner
  / Status / Date / Affected Docs / Code Areas) — `Agent Role` not added
  to registry per Q1 decision.
- **Status enum extended** (additive). Existing values (draft / in-progress
  / done / blocked) preserved. Added: code-complete, ready-for-deploy,
  cancelled. Existing records using old enum values keep working.
- **Commit convention extended** (documented, not enforced by tooling
  yet — Phase 2 adds CI lint). Format: `fix({task-id-or-finding-id}):
  [role]: summary` plus `[track]:` and `[plan]:` metadata lines.
- **Branch convention extended** (documented). New namespace `agent/{role}/{task-id}`
  coexists with existing `task/{TASK_ID}-{name}`. Branch protection rules
  unchanged (allow `*` pattern matches both).
- **DoD contract extended** with 4th sub-DoD ("Agent Done"). Existing
  3-section DoD (Code/Doc/Test) remains canonical; Agent Done applies
  additively to autonomous Track A runs.

## Tests

| Test | Výsledek |
|------|----------|
| `node scripts/docs/check-doc-sync.mjs` | OK — see post-implementation log |
| `node scripts/docs/build-changelog.mjs` | OK — regenerated |
| `node scripts/docs/build-task-registry.mjs` | OK — regenerated |
| `npx tsc --noEmit` (crm-frontend) | N/A — no frontend code changes in Phase 1 |
| `npm run build` (crm-frontend) | N/A — no frontend code changes in Phase 1 |
| Manual review of role files for project-specificity | required — Sebastián PR review |

## Output for Audit

After this PR ships:
- `docs/agents/` exists as Obsidian-compatible vault with 12 files + 1 subfolder.
- 5 architectural decisions from discovery report Sekce 8 are visible
  in ARCHITECTURE.md and reinforced in role SKILL.md files.
- Tech Lead has classification table mapping audit prefix → Stream → docs.
- Bug Hunter has 3 concrete worked-example references to past PRs in
  this repo (rate limit, idempotence, stale reaper) — agent doesn't need
  to invent the pattern, has live precedent.
- CLAUDE.md hard rules extended: NEVER edit .clasp.json, NEVER touch
  Apps Script Properties, NEVER push to main, NEVER edit docs/archive/.
- Task record template carries Agent Role / Track / Plan / Autonomous
  run / DoD Checklist sections — usable for first agent-driven PR in
  Phase 2.
- 0 frontend code changes, 0 Apps Script changes, 0 secrets in diff.

## Known Limits

- **No CI enforcement of agent rules yet** — Phase 2 adds
  `agent-pr-validation.yml`. Phase 1 relies on documentation discipline.
- **Tech Lead is documentation-only** — no `tech-lead.mjs` runtime
  yet. Operator (or Claude in interactive session) reads
  `docs/agents/roles/tech-lead.md` as system prompt context. Auto-load
  is Phase 2.
- **Learning loop NOT active** — PATTERNS.md / GOTCHAS.md /
  REGRESSION-LOG.md ship empty (or 3 seed entries for GOTCHAS). No
  Make scenario, no Anthropic API call. Phase 3.
- **CRM dashboard NOT built** — `/admin/dev-team` route doesn't exist.
  Phase 3.
- **Diff size for this PR exceeds 500 LOC** — Phase 1 setup is plan-driven
  (Track B), not Track A. The 500 LOC limit applies only to autonomous
  Track A runs (per Sekce 8 #8). PR description flags this explicitly.
- **No backfill of 46 existing records** (Q1 = c). Past task records do
  not have Agent Role / Track / Plan / Autonomous run fields. They
  parse fine with existing build scripts.
- **Commit convention not enforced** — documented in CLAUDE.md, but no
  commitlint hook. Phase 2 may add `.husky/commit-msg` validation.

## Next Dependency

| Task | Co potřebuje z AGENT-TEAM-PHASE-1 |
|------|------------------------------------|
| AGENT-TEAM-PHASE-2 (security-engineer + qa-engineer + docs-guardian + agent-pr-validation.yml + triage.mjs + validate-task-record.mjs) | All Phase 1 vault files; ARCHITECTURE.md is canonical reference for SKILL.md style; tech-lead.md classification table is reused by triage.mjs. |
| AGENT-TEAM-PHASE-3 (CRM `/admin/dev-team` + learning loop) | RUN-LOG.md format (now-panel reads it); QUEUE.md format (queue-panel renders it); PATTERNS.md auto-append structure (Make scenario writes to it); SETUP-CHECKLIST.md references API key prerequisite. |
| First agent-driven PR (post-Phase-2) | Tech Lead and Bug Hunter SKILL.md must be production-ready; QUEUE.md must have at least 1 well-classified Track A task. |
