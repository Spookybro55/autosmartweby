# Task Record: frontend-wiring-task-3

## Metadata

| Pole | Hodnota |
|------|---------|
| **Task ID** | frontend-wiring-task-3 |
| **Title** | Middleware `/admin/*` redirect adds `?error=forbidden` query param |
| **Owner** | Stream B |
| **Status** | code-complete |
| **Date** | 2026-04-30 |
| **Stream** | B |
| **Agent Role** | security-engineer |
| **Track** | B |
| **Plan** | agent-team-frontend-wiring-v1 |
| **Autonomous run** | yes |

## Scope

T3 of plan `agent-team-frontend-wiring-v1` (`docs/agents/plans/ACTIVE/agent-team-frontend-wiring-v1.md`). Adds an informational `?error=forbidden` query param to the existing `/admin/*` non-owner redirect in `crm-frontend/src/middleware.ts` (at `main` HEAD `f16ae68`). The dashboard (T4) will read this param and surface a sonner toast so the user understands why they were bounced — currently the redirect is silent.

This task **does not** modify the security boundary itself. The owner-gate condition `if (!ownerEmail || userEmail !== ownerEmail)` is byte-identical before and after; only the redirect URL construction changes (now carries a query string). The HTTP status remains `307` (Next.js default for `NextResponse.redirect`).

## Code Changes

| Soubor | Typ změny | Popis |
|--------|-----------|-------|
| `crm-frontend/src/middleware.ts` | modified | (1) Replaced single-line `return NextResponse.redirect(new URL('/dashboard', request.url));` at the admin-gate branch with 3-line construction: build URL → set `error=forbidden` searchParam → redirect. (2) Updated the inline comment block above the gate to mention the new query param and explicitly note it does not loosen the gate. Net diff: +6 / −1 LOC. |

## Docs Updated

| Dokument | Typ změny | Proč |
|----------|-----------|------|
| `docs/30-task-records/frontend-wiring-task-3.md` | new | This task record. Filename matches branch tail per `scripts/agent/validate-task-record.mjs` derivation. |
| `docs/agents/RUN-LOG.md` | modified | Bundled `complete: frontend-wiring-task-2 (PR #99, merge f16ae68)` per QFH-0005 (d.2) policy + plan checkbox tick for T2 + full T3 trace (claim → dod-check). |
| `docs/agents/plans/ACTIVE/agent-team-frontend-wiring-v1.md` | modified | Ticked T2 checkbox (post-merge per ARCHITECTURE.md §7 step 5; PR #99 left it open by Track B convention). T3 checkbox stays open in this PR — will be ticked in T4's PR or after this PR merges. |
| `docs/11-change-log.md` | regenerated | Auto from task records (`build-changelog.mjs`). |
| `docs/29-task-registry.md` | regenerated | Auto from task records (`build-task-registry.mjs`). |

**Stream B mandatory canonical docs** (`docs/20`, `docs/22`, `docs/26`, `docs/27`) **NOT updated** — same rationale as T1, T2. The query param is a UX-only signal between two existing components (middleware → dashboard); no new route, no new env var, no new API contract, no architecture impact. Plan-level documentation is in the activated plan file.

**`docs/12-route-and-surface-map.md` NOT updated** — no new route. `/admin/*` and `/dashboard` already exist; only the redirect target URL gains a query string.

## Contracts Changed

- **No security-boundary change.** `if (!ownerEmail || userEmail !== ownerEmail)` is unchanged. The query param is added strictly **inside** the deny branch — no path through the gate is loosened.
- **No new env / config.** `OWNER_EMAIL` consumption unchanged.
- **HTTP behaviour:** still `307 Temporary Redirect`; `Location` header now carries `?error=forbidden`.
- **Convention introduced:** dashboard-side handlers (T4 forthcoming) treat `?error=forbidden` as "show the forbidden-toast then strip the param via `router.replace`". Other `?error=*` values are not yet defined; this is the first.
- **No middleware matcher change.** `config.matcher` at `:107` unchanged.

## Tests

| Test | Výsledek |
|------|----------|
| `npx tsc --noEmit` (crm-frontend) | OK — no errors |
| `npm run build` (crm-frontend) | OK — Compiled successfully in 9.2s; middleware (`ƒ Proxy (Middleware)`) rebuilt cleanly |
| `node scripts/docs/check-doc-sync.mjs` | OK — 0 fail |
| `node scripts/agent/validate-task-record.mjs --pr-branch agent/security-engineer/frontend-wiring-task-3` | PASSED |

**Manual smoke** (per plan T3 Test plan): not run during this autonomous session — agent does not have a browser. Plan acceptance criterion 5 ("Pilot user navigating to `/admin/dev-team` is redirected to `/dashboard?error=forbidden`") is verified by code inspection + build success. Owner verification post-merge:
1. Login as non-owner pilot → navigate to `/admin/dev-team` → URL should become `/dashboard?error=forbidden`, status `307`.
2. Login as owner → navigate to `/admin/dev-team` → no redirect (page renders).

**No middleware unit-test in repo** — adding one is its own plan (CC-QA backlog). The change is small enough that build + manual smoke is a proportional verification.

## Output for Audit

After this PR is merged:

- `grep -nE 'error=forbidden' crm-frontend/src/middleware.ts` returns 1 hit (the new `searchParams.set` line).
- A non-owner authenticated user URL-poking `/admin/dev-team` lands at `/dashboard?error=forbidden`.
- Owner authenticated session unaffected — `/admin/dev-team` renders.
- Unauthenticated session unaffected — earlier branches in middleware redirect to `/login` before the admin gate is reached.
- T3 of plan `agent-team-frontend-wiring-v1` is **acceptance-criterion 5 complete** (the redirect now carries the query param). Criterion 6 ("On landing at `/dashboard?error=forbidden`, the user sees a sonner toast") is wired up in T4. Criterion 7 ("toast does not fire on plain `/dashboard` visits") is also T4's responsibility.

## Known Limits

- **Without T4, the param is dead.** The dashboard does not yet read `?error=forbidden`. After this PR ships and before T4 ships, a non-owner who URL-pokes `/admin/dev-team` will see the URL `?error=forbidden` in the address bar but no toast. This is the documented intentional ordering (per plan dependency graph: T4 depends on T3, not vice versa). Risk window is small; T4 is queued next.
- **No middleware unit-test added.** The repo has no test surface for `middleware.ts`; adding Vitest + `@edge-runtime/vm` mock is its own plan.
- **`?error=*` namespace not yet formalised.** This is the first value; if more error codes are added (e.g. `?error=session-expired`), a small enum / constants file would be appropriate. For one value YAGNI applies; a comment in `middleware.ts` documents the convention.
- **No CSRF / open-redirect concern.** The redirect target is hardcoded (`/dashboard` + a fixed `searchParams.set`); no user-controlled input flows into the URL construction.

## Next Dependency

| Task | Co potřebuje z T3 |
|------|------------------|
| **T4** (dashboard toast) | **Hard dependency.** Reads `?error=forbidden` set by this PR. Without T3 merged, T4 is a no-op. With T3 merged but T4 not yet shipped, the param is set but ignored — see Known Limits. |

Plan `agent-team-frontend-wiring-v1` is **75% complete** after this PR (T1, T2, T3 shipped; T4 todo and unblocked).

## DoD Checklist

> Required for agent-driven tasks (Track A or Track B with `Agent Role` ≠ `human`). Optional for human tasks.

### Code Done

- [x] `npx tsc --noEmit` (crm-frontend): OK
- [x] `npm run build` (crm-frontend): OK — Compiled successfully in 9.2s, middleware rebuilt
- [x] No secrets in diff — only the literal string `'forbidden'` and `'error'` introduced
- [x] No regressions — security gate condition byte-identical; only redirect URL construction changed

### Documentation Done

- [x] Affected docs identified per `docs/13-doc-update-rules.md` stream mapping — Stream B canonical docs reviewed; no semantic update needed (no new route, no new env, no new contract beyond the `?error=*` convention which is documented inline)
- [x] Affected docs updated — task record, RUN-LOG (with bundled previous-PR `complete` + T2 plan checkbox tick per QFH-0005 (d.2))
- [x] `docs/11-change-log.md` regenerated (`build-changelog.mjs`)
- [x] `docs/29-task-registry.md` regenerated (`build-task-registry.mjs`)
- [x] Control tower (`docs/09`) checked — T3 not tracked there (granular plan task)
- [x] Route mapa (`docs/12`) checked — N/A, no new route; only redirect target query string
- [x] Plan file updated — T2 checkbox ticked (post-merge); T3 checkbox stays open until this PR merges (Track B convention)

### Test Done

- [x] Tests pass — no test surface targets the middleware; `tsc` + `build` are the de-facto coverage
- [x] `npm run build` verified
- [x] `node scripts/docs/check-doc-sync.mjs`: 0 fail

### Agent Done (Track A only — Track B partial application)

- [x] Diff size — actual ~7 LOC code (+6/-1) plus comment update plus task record + RUN-LOG; well under any threshold
- [x] Secret scan clean — no high-entropy strings; only literal token `forbidden`
- [x] Self-review pass — re-read diff fresh: (a) gate condition unchanged; (b) `searchParams.set` runs only inside deny branch; (c) `URL` constructor preserves base `/dashboard` correctly; (d) HTTP method / status unchanged; (e) cookie-clearing logic at `:88-91` (session-expiry branch) untouched; 0 issues
- [x] Cross-role review pass — Tech Lead read whole diff before PR open
- [x] Plan checkbox tracking — T2 ticked here (post-#99-merge bundling); T3 stays unchecked until post-merge
- [x] `docs/agents/RUN-LOG.md` appended — full T3 trace + bundled PR #99 closure
- [x] No `apps-script/.clasp.json` change
- [x] No `.env*` change
- [x] No `docs/archive/` change
- [x] Branch convention: `agent/security-engineer/frontend-wiring-task-3` (per plan)
