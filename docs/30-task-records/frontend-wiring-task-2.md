# Task Record: frontend-wiring-task-2

## Metadata

| Pole | Hodnota |
|------|---------|
| **Task ID** | frontend-wiring-task-2 |
| **Title** | Sidebar Dev Team icon swap: `ShieldCheck` → `Bot` |
| **Owner** | Stream B |
| **Status** | code-complete |
| **Date** | 2026-04-30 |
| **Stream** | B |
| **Agent Role** | bug-hunter |
| **Track** | B |
| **Plan** | agent-team-frontend-wiring-v1 |
| **Autonomous run** | yes |

## Scope

T2 of plan `agent-team-frontend-wiring-v1` (`docs/agents/plans/ACTIVE/agent-team-frontend-wiring-v1.md`). Replaces the generic admin/security `ShieldCheck` icon on the `Dev Team` sidebar nav item (`crm-frontend/src/components/layout/sidebar.tsx` at `main` HEAD `605a9bc`) with the semantically-precise `Bot` icon — `/admin/dev-team` IS the AI agent team dashboard, so `Bot` is the literal match. Owner had a weak preference for `Bot` per plan Decisions table.

This task **does not** touch any other icon, the `ADMIN_NAV` href, the runtime `isOwner` gating logic, the middleware, or T1's `useCurrentUser` wiring. The change is bounded to two tokens in `sidebar.tsx`: one in the lucide-react import block, one in the `ADMIN_NAV.icon` const.

## Code Changes

| Soubor | Typ změny | Popis |
|--------|-----------|-------|
| `crm-frontend/src/components/layout/sidebar.tsx` | modified | (1) Replaced `ShieldCheck,` with `Bot,` in the `lucide-react` import block (the existing block is grouped by domain, not strict alphabetical, so the swap stays in place to minimise diff). (2) Replaced `icon: ShieldCheck,` with `icon: Bot,` in the `ADMIN_NAV` const. Net diff: +2 / -2 LOC. |

## Docs Updated

| Dokument | Typ změny | Proč |
|----------|-----------|------|
| `docs/30-task-records/frontend-wiring-task-2.md` | new | This task record. Filename matches branch tail per `scripts/agent/validate-task-record.mjs` derivation. |
| `docs/agents/RUN-LOG.md` | modified | Bundled `complete: frontend-wiring-task-1 (PR #98, merge 605a9bc)` per QFH-0005 (d.2) policy + plan checkbox tick for T1 + full T2 trace (claim → dod-check). |
| `docs/agents/plans/ACTIVE/agent-team-frontend-wiring-v1.md` | modified | Ticked T1 checkbox (post-merge per ARCHITECTURE.md §7 step 5; previous PR #98 left it open by Track B convention). T2 checkbox stays open in this PR — will be ticked in T3's PR or after this PR merges. |
| `docs/11-change-log.md` | regenerated | Auto from task records (`build-changelog.mjs`). |
| `docs/29-task-registry.md` | regenerated | Auto from task records (`build-task-registry.mjs`). |

**Stream B mandatory canonical docs** (`docs/20`, `docs/22`, `docs/26`, `docs/27`) **NOT updated** — same rationale as T1. This is a single-icon visual swap with zero impact on system state, architecture, infra, contracts, or offer generation.

## Contracts Changed

- **No API contract change.** No backend touched.
- **No public-component prop change.** `<Sidebar />` takes no props before or after.
- **No internal helper change.** `deriveUserDisplay` (added in T1) and the rest of the file are untouched.
- **No icon-glyph contract impact** — the `ADMIN_NAV` const is exposed only via the rendered nav list inside `Sidebar()`, no other consumer.

## Tests

| Test | Výsledek |
|------|----------|
| `npx tsc --noEmit` (crm-frontend) | OK — no errors |
| `npm run build` (crm-frontend) | OK — Compiled successfully in 11.1s; all routes including `/admin/dev-team`, middleware, etc. built clean |
| `node scripts/docs/check-doc-sync.mjs` | OK — 0 fail |
| `node scripts/agent/validate-task-record.mjs --pr-branch agent/bug-hunter/frontend-wiring-task-2` | PASSED |

**Manual smoke** (per plan T2 Test plan): not run during this autonomous session — agent does not have a browser. Plan acceptance criterion 4 ("`Dev Team` sidebar nav item uses the `Bot` icon from `lucide-react`") is verified by code grep + build success; visual confirmation (collapsed + expanded states render the bot glyph) is owner's responsibility post-merge. The icon class (`h-5 w-5 shrink-0`) is unchanged, so collapsed-state rendering cannot regress structurally.

## Output for Audit

After this PR is merged:

- `grep -nE "ShieldCheck" crm-frontend/src/components/layout/sidebar.tsx` returns 0.
- The owner sees a `Bot` glyph (lucide-react) on the `Dev Team` nav item — semantically matches what the route is (AI agent team dashboard).
- Pilot users (`isOwner === false`) still don't see the nav item at all (T1's `isOwner` gate is unchanged).
- T2 of plan `agent-team-frontend-wiring-v1` is **acceptance-criterion 4 complete**:
  - [x] `Dev Team` sidebar nav item uses the `Bot` icon from `lucide-react`.

  T1 (criteria 1-3) shipped via PR #98. T3/T4 (criteria 5-7 + regressions) remain open per plan order of execution.

## Known Limits

- **No visual regression test.** A 2-pixel icon glyph swap is genuinely below the bar for adding Playwright/RTL coverage; reviewer's eyes are sufficient.
- **`ShieldCheck` import removed completely.** No other call site in `sidebar.tsx` uses it. If any future task needs `ShieldCheck` for, e.g., a security-only nav item, the import will need to be re-added — trivial.
- **lucide-react import block remains domain-grouped, not alphabetical.** This is the file's pre-existing convention; not normalising here per minimal-fix bias.

## Next Dependency

| Task | Co potřebuje z T2 |
|------|------------------|
| **T3** (middleware redirect) | Independent — different file. |
| **T4** (dashboard toast) | Independent of T2; depends on **T3** per plan. |

Plan `agent-team-frontend-wiring-v1` is **50% complete** after this PR (T1 + T2 shipped; T3 + T4 todo).

## DoD Checklist

> Required for agent-driven tasks (Track A or Track B with `Agent Role` ≠ `human`). Optional for human tasks.

### Code Done

- [x] `npx tsc --noEmit` (crm-frontend): OK
- [x] `npm run build` (crm-frontend): OK — Compiled successfully in 11.1s
- [x] No secrets in diff — only icon-name token swap
- [x] No regressions — adjacent test suites unaffected (the swap is import-token only)

### Documentation Done

- [x] Affected docs identified per `docs/13-doc-update-rules.md` stream mapping — Stream B canonical docs reviewed; no semantic update needed (visual UI swap only)
- [x] Affected docs updated — task record, RUN-LOG (with bundled previous-PR `complete` + T1 plan checkbox tick per QFH-0005 (d.2))
- [x] `docs/11-change-log.md` regenerated (`build-changelog.mjs`)
- [x] `docs/29-task-registry.md` regenerated (`build-task-registry.mjs`)
- [x] Control tower (`docs/09`) checked — T2 not tracked there (granular plan task)
- [x] Route mapa (`docs/12`) checked — N/A, no route change
- [x] Plan file updated — T1 checkbox ticked (post-merge); T2 checkbox stays open until this PR merges (Track B convention)

### Test Done

- [x] Tests pass — no test surface targets the changed lines; `tsc` + `build` are the de-facto coverage for an icon swap
- [x] `npm run build` verified
- [x] `node scripts/docs/check-doc-sync.mjs`: 0 fail

### Agent Done (Track A only — Track B partial application)

- [x] Diff size — actual ~4 LOC code (+2/-2) plus task record + RUN-LOG; well under any threshold
- [x] Secret scan clean — only icon-name token introduced
- [x] Self-review pass — re-read diff fresh; 0 issues; `Bot` is exported by `lucide-react` (verified via build success)
- [x] Cross-role review pass — Tech Lead read whole diff before PR open
- [x] Plan checkbox tracking — T1 ticked here (post-#98-merge bundling); T2 stays unchecked until post-merge
- [x] `docs/agents/RUN-LOG.md` appended — full T2 trace + bundled PR #98 closure
- [x] No `apps-script/.clasp.json` change
- [x] No `.env*` change
- [x] No `docs/archive/` change
- [x] Branch convention: `agent/bug-hunter/frontend-wiring-task-2` (per plan)
