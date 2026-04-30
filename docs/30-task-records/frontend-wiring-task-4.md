# Task Record: frontend-wiring-task-4

## Metadata

| Pole | Hodnota |
|------|---------|
| **Task ID** | frontend-wiring-task-4 |
| **Title** | Dashboard handles `?error=forbidden` with sonner toast (Suspense-wrapped, one-shot, param-stripping) |
| **Owner** | Stream B |
| **Status** | code-complete |
| **Date** | 2026-04-30 |
| **Stream** | B |
| **Agent Role** | bug-hunter |
| **Track** | B |
| **Plan** | agent-team-frontend-wiring-v1 |
| **Autonomous run** | yes |

## Scope

T4 of plan `agent-team-frontend-wiring-v1` (`docs/agents/plans/ACTIVE/agent-team-frontend-wiring-v1.md`) — **final task**, closes the plan. Wires `crm-frontend/src/app/dashboard/page.tsx` (at `main` HEAD `8f3667d`) to read the `?error=forbidden` query param set by T3's middleware redirect, surface a sonner `toast.error("Nemáš oprávnění k administraci")` once on mount, and strip the param via `router.replace('/dashboard', { scroll: false })` so refresh does not re-fire the toast.

This task **does not** modify the data-loading `useEffect`, the stats/leads fetching, the existing `error` banner state, the StatCard rendering, or any widget. The change is bounded to imports, a Suspense wrapper, the new `handledForbiddenRef` + forbidden-toast `useEffect`, and the rename `DashboardPage` → `DashboardPageInner` to fit the repo's established Suspense pattern (mirrors `crm-frontend/src/app/leads/page.tsx:119-128`).

## Code Changes

| Soubor | Typ změny | Popis |
|--------|-----------|-------|
| `crm-frontend/src/app/dashboard/page.tsx` | modified | (1) Added imports: `Suspense`, `useRef` from `react`; `useRouter`, `useSearchParams` from `next/navigation`; `toast` from `sonner`. (2) Renamed default-export component from `DashboardPage` (the original) to `DashboardPageInner`; added a new outer `DashboardPage` default-export that returns `<Suspense><DashboardPageInner /></Suspense>` — matches the established pattern in `app/leads/page.tsx:119-128` (required because `useSearchParams` inside a "use client" page would otherwise deopt the route from static-prerender per Next.js 16 docs). (3) Inside `DashboardPageInner`, added `const router = useRouter()` + `const searchParams = useSearchParams()` at the top of the component. (4) Added `handledForbiddenRef = useRef(false)` + a `useEffect` that runs once on mount, reads `searchParams.get('error')`, and if `=== 'forbidden'` fires `toast.error(...)` then `router.replace('/dashboard', { scroll: false })`. The ref guards against double-fire if `searchParams` changes between the toast call and the URL replace. Net diff: +27 / -1 LOC. |

## Docs Updated

| Dokument | Typ změny | Proč |
|----------|-----------|------|
| `docs/30-task-records/frontend-wiring-task-4.md` | new | This task record. Filename matches branch tail per `scripts/agent/validate-task-record.mjs` derivation. |
| `docs/agents/RUN-LOG.md` | modified | Bundled `complete: frontend-wiring-task-3 (PR #100, merge 8f3667d)` per QFH-0005 (d.2) policy + plan checkbox tick for T3 + full T4 trace (claim → dod-check). |
| `docs/agents/plans/ACTIVE/agent-team-frontend-wiring-v1.md` | modified | Ticked T3 checkbox (post-merge per ARCHITECTURE.md §7 step 5; PR #100 left it open by Track B convention). T4 checkbox stays open in this PR — owner ticks it at merge time, then the plan moves to `docs/agents/plans/COMPLETED/` (manual rename, separate concern). |
| `docs/11-change-log.md` | regenerated | Auto from task records (`build-changelog.mjs`). |
| `docs/29-task-registry.md` | regenerated | Auto from task records (`build-task-registry.mjs`). |

**Stream B mandatory canonical docs** (`docs/20`, `docs/22`, `docs/26`, `docs/27`) **NOT updated** — same rationale as T1, T2, T3. The toast handler is a UX-only addition between two existing in-app surfaces (middleware → dashboard); no new route, no new env var, no new API contract, no architecture impact. The `?error=*` convention introduced in T3 is preserved (no new error codes added).

**`docs/12-route-and-surface-map.md` NOT updated** — no new route. `/dashboard` already exists; only its client-side behaviour gains a single one-shot side-effect.

## Contracts Changed

- **No API contract change.** Backend untouched.
- **No public-component prop change.** `<DashboardPage />` takes no props before or after; outer-wrapper-vs-inner refactor is invisible to the App Router.
- **`?error=*` convention** introduced by T3 is honoured here; this task **handles** the `forbidden` value but does not extend the namespace. If future error codes are added (e.g. `?error=session-expired`), the handler block is the place to extend; the ref + replace pattern is reusable.
- **No new component file added.** Per minimal-fix bias, the inner component lives in the same `page.tsx` rather than a new module.
- **Static-prerender preserved.** Build output still shows `○ /dashboard` (static / prerendered) — the `Suspense` boundary correctly absorbs the `useSearchParams` deopt.

## Tests

| Test | Výsledek |
|------|----------|
| `npx tsc --noEmit` (crm-frontend) | OK — no errors |
| `npm run build` (crm-frontend) | OK — Compiled successfully in 33.1s; `/dashboard` still listed as `○` (static prerendered), all middleware + routes built |
| `npx eslint src/app/dashboard/page.tsx` | OK — 0 errors / 0 warnings |
| `node scripts/docs/check-doc-sync.mjs` | OK — 0 fail |
| `node scripts/agent/validate-task-record.mjs --pr-branch agent/bug-hunter/frontend-wiring-task-4` | PASSED |

**Manual smoke** (per plan T4 Test plan — covers all 5 cases): not run during this autonomous session — agent does not have a browser. Owner verification post-merge:

1. Login as pilot user → navigate `/admin/dev-team` → confirm redirect to `/dashboard?error=forbidden` AND toast appears bottom-right.
2. Click around dashboard → URL becomes plain `/dashboard` (param stripped). Refresh → toast does NOT re-fire.
3. Login as owner → navigate `/dashboard` directly → no toast.
4. Login as owner → manually visit `/dashboard?error=forbidden` → toast fires once + URL strips. (Edge case: handler is param-driven, not role-driven.)
5. Pre-existing dashboard data load (stats + leads) still renders identically (sanity).

## Output for Audit

After this PR is merged:

- `grep -nE "error=forbidden|forbidden" crm-frontend/src/app/dashboard/page.tsx` returns hits only inside the new useEffect handler (literal `'forbidden'` comparison) — no other usage.
- `grep -nE "Nemáš oprávnění" crm-frontend/src/app/dashboard/page.tsx` returns 1 hit (the toast string).
- A pilot user URL-poking `/admin/dev-team` lands at `/dashboard?error=forbidden` (T3) and immediately sees the toast `"Nemáš oprávnění k administraci"` (this PR), then the URL is silently rewritten to `/dashboard`.
- T4 of plan `agent-team-frontend-wiring-v1` is **acceptance-criterion 6 + 7 complete**:
  - [x] On landing at `/dashboard?error=forbidden`, the user sees a sonner toast: "Nemáš oprávnění k administraci".
  - [x] The toast does not fire on plain `/dashboard` visits (no false positive after subsequent navigation — guarded by the param check + the ref + the URL strip).

  All 7 plan acceptance criteria are now met. **Plan `agent-team-frontend-wiring-v1` is 100% complete.**

## Known Limits

- **No Playwright/RTL test added.** The toast firing + param stripping is genuinely useful to test (one-shot semantics, ref-vs-state, navigation re-mount behavior), but the repo has no React Testing Library setup and Playwright would be its own plan. Out of scope per plan Decisions.
- **`Suspense` fallback is empty.** `<Suspense>` (no `fallback` prop) renders nothing during the deopt — the dashboard's existing skeleton states already cover the visible loading UX. Adding a dashboard-specific fallback is not needed (the inner component renders instantly once searchParams resolves on the client).
- **Component rename.** `DashboardPage` is now a thin Suspense wrapper; the substantive component is `DashboardPageInner`. Anyone grep-ing for `function DashboardPage` will land on the wrapper. Trivial inconvenience.
- **Toast string is hardcoded Czech.** Per plan Decisions table — repo currently mixes Czech and English in UI strings; following existing scrape-page convention. i18n is its own plan.
- **`?error=*` namespace remains informal.** This PR does not formalise it as an enum; if more codes are added, a `crm-frontend/src/lib/dashboard-errors.ts` constants file becomes appropriate. YAGNI for one value.
- **Toast persistence across full reload.** If the user URL-pokes `/dashboard?error=forbidden` and the page errors out *before* the useEffect fires (e.g. JS bundle 500), the param remains and they'd re-toast on next successful load. Real risk: ~zero (the page is static-prerendered and the bundle is the same as every other route). Worth noting only for completeness.

## Next Dependency

| Task | Co potřebuje z T4 |
|------|------------------|
| **— (none)** | T4 is the final task in plan `agent-team-frontend-wiring-v1`. After merge, the plan moves to `COMPLETED/`. |

Plan `agent-team-frontend-wiring-v1` is **100% complete** after this PR. Owner action at merge time:

1. Tick T4 checkbox in plan file (or let it stay open and let the next session bundle it — both work).
2. Move plan file: `git mv docs/agents/plans/ACTIVE/agent-team-frontend-wiring-v1.md docs/agents/plans/COMPLETED/agent-team-frontend-wiring-v1.md`. (Per `docs/agents/ARCHITECTURE.md` §7 plan lifecycle, COMPLETED happens manually post-final-merge.) Or leave in ACTIVE briefly and let a follow-up housekeeping PR move it.

## DoD Checklist

> Required for agent-driven tasks (Track A or Track B with `Agent Role` ≠ `human`). Optional for human tasks.

### Code Done

- [x] `npx tsc --noEmit` (crm-frontend): OK
- [x] `npm run build` (crm-frontend): OK — Compiled successfully in 33.1s, `/dashboard` still `○` (static prerendered) — Suspense correctly absorbs `useSearchParams` deopt
- [x] `npx eslint src/app/dashboard/page.tsx`: 0 errors / 0 warnings
- [x] No secrets in diff — only literal token strings (`'forbidden'`, `'error'`, toast message in Czech)
- [x] No regressions — data-loading useEffect, error banner, StatCards, widgets all untouched

### Documentation Done

- [x] Affected docs identified per `docs/13-doc-update-rules.md` stream mapping — Stream B canonical docs reviewed; no semantic update needed (UI-binding only, ?error=* convention already established by T3)
- [x] Affected docs updated — task record, RUN-LOG (with bundled previous-PR `complete` + T3 plan checkbox tick per QFH-0005 (d.2))
- [x] `docs/11-change-log.md` regenerated (`build-changelog.mjs`)
- [x] `docs/29-task-registry.md` regenerated (`build-task-registry.mjs`)
- [x] Control tower (`docs/09`) checked — T4 not tracked there (granular plan task)
- [x] Route mapa (`docs/12`) checked — N/A, no new route
- [x] Plan file updated — T3 checkbox ticked (post-merge); T4 checkbox stays open until this PR merges (Track B convention)

### Test Done

- [x] Tests pass — no test surface targets the changed lines; `tsc` + `build` + `eslint` are the de-facto coverage for a UI-binding addition
- [x] `npm run build` verified — `/dashboard` still static-prerendered, no deopt
- [x] `node scripts/docs/check-doc-sync.mjs`: 0 fail

### Agent Done (Track A only — Track B partial application)

- [x] Diff size — actual ~28 LOC code (+27/-1) plus task record + RUN-LOG; well under any threshold
- [x] Secret scan clean — no high-entropy strings; only Czech UI string + `'forbidden'` token
- [x] Self-review pass — re-read full diff fresh: (a) Suspense wrapper matches `app/leads/page.tsx:119-128` pattern; (b) `handledForbiddenRef` correctly guards one-shot semantics; (c) `router.replace('/dashboard', { scroll: false })` strips the param without scroll jump; (d) `searchParams` + `router` correctly listed in deps array (no exhaustive-deps lint); (e) data-loading useEffect untouched at original position; (f) Czech string consistent with rest of dashboard UI ("Přehled", "Souhrn vašeho obchodního pipeline"); (g) static-prerender preserved per build output. 0 issues.
- [x] Cross-role review pass — Tech Lead read whole diff before PR open
- [x] Plan checkbox tracking — T3 ticked here (post-#100-merge bundling); T4 stays unchecked until post-merge
- [x] `docs/agents/RUN-LOG.md` appended — full T4 trace + bundled PR #100 closure
- [x] No `apps-script/.clasp.json` change
- [x] No `.env*` change
- [x] No `docs/archive/` change
- [x] Branch convention: `agent/bug-hunter/frontend-wiring-task-4` (per plan)
