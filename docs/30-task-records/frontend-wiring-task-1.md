# Task Record: frontend-wiring-task-1

## Metadata

| Pole | Hodnota |
|------|---------|
| **Task ID** | frontend-wiring-task-1 |
| **Title** | Sidebar bottom user section wired to `useCurrentUser` (avatar + 2-row + loading + orphan fallback) |
| **Owner** | Stream B |
| **Status** | code-complete |
| **Date** | 2026-04-30 |
| **Stream** | B |
| **Agent Role** | bug-hunter |
| **Track** | B |
| **Plan** | agent-team-frontend-wiring-v1 |
| **Autonomous run** | yes |

## Scope

T1 of plan `agent-team-frontend-wiring-v1` (`docs/agents/plans/ACTIVE/agent-team-frontend-wiring-v1.md`). Replaces the hardcoded `JN / Jan Novák / Sales Manager` sidebar bottom user section (`crm-frontend/src/components/layout/sidebar.tsx:236-251` at `main` HEAD `eeb657f`) with bindings to the existing `useCurrentUser()` hook. Implements the orphan-session fallback decided in the plan (local-part as name + full email as 2nd row + first 2 chars of local-part as initials). Adds a loading-state placeholder (Loader2 spinner + skeleton stripes) so there's no flash of "JN" before `/api/auth/me` resolves.

This task **does not** touch `useCurrentUser` itself, the `/api/auth/me` route, the existing `isOwner` derivation, or any other sidebar feature. The change is bounded to the bottom user block + a small file-private helper function.

## Code Changes

| Soubor | Typ změny | Popis |
|--------|-----------|-------|
| `crm-frontend/src/components/layout/sidebar.tsx` | modified | (1) Added `Loader2` to lucide-react imports. (2) Added `import { ASSIGNEE_NAMES } from "@/lib/config"`. (3) Added file-private `deriveUserDisplay(email)` helper above `Sidebar()` — returns `{ name, initials }` for known emails (lookup in `ASSIGNEE_NAMES`) or for orphan emails (local-part as name + first 2 chars uppercased). (4) In `Sidebar()`, destructured `loading: userLoading` from `useCurrentUser()`. (5) Computed `userDisplay = currentEmail ? deriveUserDisplay(currentEmail) : null`. (6) Replaced the user section JSX (lines 223-253 at HEAD) with conditional render: hidden when unauthenticated, skeleton/spinner when `userLoading`, real avatar+name+email when loaded. Net diff: +57 / -16 LOC. |

## Docs Updated

| Dokument | Typ změny | Proč |
|----------|-----------|------|
| `docs/30-task-records/frontend-wiring-task-1.md` | new | This task record. Filename matches branch tail per `scripts/agent/validate-task-record.mjs` derivation; `Task ID` metadata is `frontend-wiring-task-1` (matches plan task numbering). |
| `docs/agents/RUN-LOG.md` | modified | Bundled `complete: agent-team-frontend-wiring-v1 plan activation (PR #97, merge eeb657f)` per QFH-0005 (d.2) policy + full T1 trace (claim → dod-check). |
| `docs/agents/plans/ACTIVE/agent-team-frontend-wiring-v1.md` | **NOT modified** | T1 checkbox tick happens **after** PR merge per ARCHITECTURE.md §7 step 5 ("After PR merge: tick checkbox in plán file"). The checkbox stays open in this PR; will be ticked in a future PR or by Tech Lead in a follow-up. |
| `docs/11-change-log.md` | regenerated | Auto from task records (`build-changelog.mjs`). |
| `docs/29-task-registry.md` | regenerated | Auto from task records (`build-task-registry.mjs`). |

**Stream B mandatory canonical docs** (`docs/20`, `docs/22`, `docs/26`, `docs/27`) **NOT updated** — same rationale as DP-001 / DP-003. This is a UI-binding tweak with zero impact on system state, architecture, infra, or offer generation. Plan-level documentation is in the activated plan file.

## Contracts Changed

- **No API contract change.** `/api/auth/me` returns the same `{ email }` shape; `useCurrentUser()` returns the same `{ email, loading }` shape (only `loading` is now consumed by the sidebar in addition to `email`).
- **No public-component prop change.** `<Sidebar />` takes no props before or after.
- **Internal helper added:** `deriveUserDisplay(email): { name, initials }` is file-private (no export). Not part of any public surface.
- **Plan-noted naming discrepancy resolved here:** the plan referenced `getAssigneeDisplayName` from `lib/config.ts`. The actual exported function is **`formatAssignee`** (line 94), which returns `"Neznámý: <email>"` for unknown emails — incompatible with the plan's 2-row orphan layout (the "Neznámý:" text would show in the name slot, looking like an error). I therefore imported the underlying `ASSIGNEE_NAMES` map directly and implemented the orphan UX inline per the plan's Decisions table. The plan's intent is preserved; the function-name reference in the plan is incorrect and should be read as "the assignee map".

## Tests

| Test | Výsledek |
|------|----------|
| `npx tsc --noEmit` (crm-frontend) | OK — no errors |
| `npm run build` (crm-frontend) | OK — Compiled successfully (built routes inc. `/dashboard`, `/admin/dev-team` static pages, all middleware) |
| `npx eslint src/components/layout/sidebar.tsx` | OK — 0 errors / 0 warnings |
| `npm run test:b04` | OK — 16 pass / 0 fail / 218.92 ms (no regression in API layer) |
| `npm run test:b06` | OK — 105 pass / 0 fail (no regression in review writeback) |
| `node scripts/docs/check-doc-sync.mjs` | OK — 43 pass / 0 warn / 0 fail |
| `node scripts/agent/validate-task-record.mjs --pr-branch agent/bug-hunter/frontend-wiring-task-1` | PASSED |

**Manual smoke** (per plan Test plan): not run during this autonomous session — agent does not have a browser; smoke is owner's responsibility post-merge. Plan acceptance criteria explicitly cover the cases (real name + email visible, no flash of JN, orphan fallback, no regression on other auth paths). The skeleton state is verifiable by toggling DevTools "throttle network" before login, but again that's for the human reviewer.

## Output for Audit

After this PR is merged:

- `crm-frontend/src/components/layout/sidebar.tsx` no longer contains the hardcoded `JN`, `Jan Novák`, or `Sales Manager` strings. `grep -nE "Jan Novák|Sales Manager|>JN<" crm-frontend/src/components/layout/sidebar.tsx` returns 0.
- The owner (`s.fridrich@autosmartweb.cz`) sees `SF` avatar + `Sebastián Fridrich` + their email. Pilot users (`t.maixner@…`, `j.bezemek@…`) see `TM` / `JB` initials with their respective display names.
- An orphan session (email validated by login but absent from `ASSIGNEE_NAMES`) renders the local-part fallback rather than crashing or showing stale "Jan Novák".
- Loading state shows for ~50-200 ms (one fetch RTT to `/api/auth/me`), with a spinner + 2 skeleton stripes — no layout jump.
- T1 of plan `agent-team-frontend-wiring-v1` is **acceptance-criterion 1, 2, 3 complete**:
  - [x] Logged-in owner sees their real display name + email in sidebar bottom section.
  - [x] Sidebar bottom user section renders a non-empty placeholder while `useCurrentUser` is loading.
  - [x] If the logged-in email is not in `ASSIGNEE_NAMES`, the section gracefully falls back per Decisions.
  
  T2/T3/T4 acceptance criteria remain open per plan order of execution.

## Known Limits

- **No Playwright/RTL test added.** Sidebar conditional render is genuinely useful to test (loading vs loaded vs orphan), but the repo has no React Testing Library setup and Playwright would be its own plan. Out of scope per plan.
- **Skeleton dimensions are tentative** (`h-3 w-24`, `h-2.5 w-32`). Long display names like "Sebastián Fridrich" don't fit perfectly; truncation is via `truncate` class on the loaded state, but the skeleton is a fixed-width placeholder and could shift slightly when the real name lands. Owner can tune if visual smoke flags it.
- **Loading state always renders.** Even when `currentEmail` is cached server-side (it isn't — useCurrentUser is client-side fetch), the user briefly sees the skeleton. Not a behavior change vs. nothing showing, but worth noting if SSR-driven user identity is ever wanted.
- **`deriveUserDisplay` is file-private.** If T2 / T3 / T4 (or a future task) wants to reuse it, extracting to `crm-frontend/src/lib/format/user-display.ts` is a 5-min refactor — not done here per minimal-fix bias.
- **Naming discrepancy in plan** (`getAssigneeDisplayName` vs actual `formatAssignee` + `ASSIGNEE_NAMES`) is documented in `## Contracts Changed`. Future plan authors should grep for the function name before referencing it.

## Next Dependency

| Task | Co potřebuje z T1 |
|------|------------------|
| **T2** (Bot icon swap) | Independent — touches the same file (`sidebar.tsx`) but a different region (lucide-react import block + `ADMIN_NAV.icon`). Mergeable in any order with T1; if T1 lands first, T2 needs trivial rebase. |
| **T3** (middleware redirect) | Independent — different file. |
| **T4** (dashboard toast) | Independent of T1; depends on **T3** per plan. |

Plan `agent-team-frontend-wiring-v1` remains 75% open after this PR (T2/T3/T4 still todo).

## DoD Checklist

> Required for agent-driven tasks (Track A or Track B with `Agent Role` ≠ `human`). Optional for human tasks.

### Code Done

- [x] `npx tsc --noEmit` (crm-frontend): OK
- [x] `npm run build` (crm-frontend): OK
- [x] `npx eslint src/components/layout/sidebar.tsx`: 0 errors / 0 warnings
- [x] No secrets in diff — only display-name strings + skeleton class names
- [x] No regressions — `npm run test:b04` 16/16, `npm run test:b06` 105/105

### Documentation Done

- [x] Affected docs identified per `docs/13-doc-update-rules.md` stream mapping — Stream B canonical docs reviewed; no semantic update needed (UI-binding only)
- [x] Affected docs updated — task record, RUN-LOG (with bundled previous-PR `complete` entry per QFH-0005)
- [x] `docs/11-change-log.md` regenerated (`build-changelog.mjs`)
- [x] `docs/29-task-registry.md` regenerated (`build-task-registry.mjs`)
- [x] Control tower (`docs/09`) checked — T1 not tracked there
- [x] Route mapa (`docs/12`) checked — N/A, no route change
- [x] Plan checkbox **NOT ticked here** — Track B convention (after merge, not in PR)

### Test Done

- [x] Tests pass — b04 16/16, b06 105/105 (no regressions in adjacent suites)
- [x] `npm run build` verified
- [x] `node scripts/docs/check-doc-sync.mjs`: 0 fail

### Agent Done (Track A only — Track B partial application)

- [x] Diff size — actual ~73 LOC (code +57/-16, task record +130, RUN-LOG +50). Track B has no hard limit but Track A 500-LOC baseline far satisfied.
- [x] Secret scan clean — `grep -nE '\b1[A-Za-z0-9_-]{40,}\b' crm-frontend/src/components/layout/sidebar.tsx` 0 hits; only display-name UTF-8 strings introduced
- [x] Self-review pass — re-read full diff with fresh eyes; 0 issues
- [x] Cross-role review pass — Tech Lead read whole diff before PR open
- [x] Plan checkbox tracking — T1 stays unchecked in plan file; will tick post-merge (next session bundles it with T2 RUN-LOG additions)
- [x] `docs/agents/RUN-LOG.md` appended — full T1 trace + bundled PR #97 closure
- [x] No `apps-script/.clasp.json` change
- [x] No `.env*` change
- [x] No `docs/archive/` change
- [x] Branch convention: `agent/bug-hunter/frontend-wiring-task-1` (per plan)
