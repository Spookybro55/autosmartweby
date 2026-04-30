# Plan: agent-team-frontend-wiring-v1

> **Track:** B (plan-driven)
> **Stream:** B (frontend infrastructure)
> **Status:** ACTIVE — activated 2026-04-30
> **Owner:** Sebastián
> **Plan ID:** `agent-team-frontend-wiring-v1`

## Goal

Close the four genuine UI/UX gaps in the `/admin/dev-team` agent dashboard wiring that PR #94 (Phase 3) and KROK 5 (auth/me) left behind. After this plan ships, the owner sees their real identity in the sidebar, the Dev Team nav uses a semantically correct icon, and pilot users (Tomáš / Jan) who try to URL-poke `/admin/*` get a clear toast notification instead of a silent redirect.

This plan is **explicitly scoped down** from the originally-requested 4 tasks after a reality check against `main` HEAD `4a42e7b` showed that:
- `/api/auth/me` — **already exists** (KROK 5)
- `useCurrentUser()` hook — **already exists** (KROK 5)
- Sidebar `Dev Team` nav item gated on `isOwner` — **already exists** (PR #94)
- Middleware `/admin/*` owner gate — **already exists** (PR #94)

What ships here is therefore a **delta plan, not a rebuild plan.**

## Background — evidence on main HEAD `4a42e7b` (verified 2026-04-30)

| Concern | File | Lines | Reality |
|---|---|---|---|
| Sidebar bottom user section is hardcoded | `crm-frontend/src/components/layout/sidebar.tsx` | 236-251 | Avatar `JN`, name "Jan Novák", role "Sales Manager" — not wired to `useCurrentUser` |
| Dev Team nav uses `ShieldCheck` icon | `crm-frontend/src/components/layout/sidebar.tsx` | 15, 39 | Imported as `ShieldCheck` from lucide-react, used in `ADMIN_NAV.icon` |
| Middleware `/admin/*` redirect lacks query param | `crm-frontend/src/middleware.ts` | 99 | `NextResponse.redirect(new URL('/dashboard', request.url))` — no `?error=forbidden` |
| Dashboard page has no `?error=forbidden` toast handler | `crm-frontend/src/app/dashboard/page.tsx` | 1-50 (full component) | Reads no search params; no toast on forbidden redirect |

Toast infrastructure already in place: `sonner` v2.0.7 in `package.json`; `<Toaster position="bottom-right" richColors closeButton />` mounted in `crm-frontend/src/app/layout.tsx:54`; existing usage pattern `import { toast } from 'sonner'` then `toast.error(...)` (e.g. `crm-frontend/src/app/scrape/page.tsx:9`).

`getAssigneeDisplayName` already exists at `crm-frontend/src/lib/config.ts:97`; `ASSIGNEE_NAMES` map at `:80`. The sidebar can call it inline; no hook expansion needed.

## Decisions (pre-resolved)

| Decision | Resolution | Rationale |
|---|---|---|
| Expand `useCurrentUser` hook to expose `displayName` + `isOwner`? | **No** — keep hook minimal | Behavioral parity with current minimal scope. Sidebar inlines `getAssigneeDisplayName(email)` and the 2-line `isOwner` check. Avoids changing a contract used by future consumers; YAGNI for one-callsite duplication. |
| Dev Team icon: `ShieldCheck` vs `Bot`? | **`Bot`** | Sémantická shoda: `/admin/dev-team` IS the AI agent team dashboard. `ShieldCheck` is generic admin/security; `Bot` is the specific match. Owner had weak preference for `Bot`; technical agreement. |
| Sidebar bottom user layout | **2 rows** — display name (top) + email (bottom, smaller, muted) | Matches owner's stated preference; preserves the existing 2-row markup at `:244-251` so the diff is small. |
| Forbidden-redirect UX | Toast via `sonner.toast.error("Nemáš oprávnění k administraci")` | Existing infra; consistent with rest of app. Inline alert/banner alternative rejected — toast is less intrusive and matches scrape/page error pattern. |
| Fallback when email is not in `ASSIGNEE_NAMES` (orphan session) | Display the **email's local-part** (before `@`) as name + the full email as second row; avatar initials = first 2 chars of local-part uppercased | Defensive but informative. Doesn't say "Unknown" (alarming for owner) and doesn't expose internal config drift. The login allowlist (`ALLOWED_USERS`) already constrains who can sign in, so orphan sessions are rare but possible after roster changes. |

## Out of scope

- **Refactor `useCurrentUser`** to expose `displayName` / `isOwner` — see Decisions; explicitly punted.
- **`/api/auth/me` rewrite** — the existing implementation (KROK 5) is correct and timing-safe; not touched.
- **Sidebar nav item ordering / spacing / collapsed-state polish** beyond what is needed to keep the user section visually unchanged.
- **Login flow / session expiry / cookie attributes** — separate concerns; this plan does not touch authentication semantics, only UX of an already-implemented redirect.
- **`/admin/*` access for additional roles** (e.g. ops, QA) — current model is owner-only and stays owner-only. Multi-role admin gating is a future plan.
- **i18n of toast string** — repo currently mixes Czech and English in UI strings; this plan follows the existing scrape-page convention of Czech for owner-facing messages.
- **Tests beyond manual smoke** for the 4 deltas — these are UI tweaks; the existing test surface (`b04`, `b06`, `b13`) already covers the API layer that backs the auth flow. Adding Playwright/RTL coverage for sidebar render is its own plan (CC-QA backlog).

## Acceptance criteria

- [ ] Logged-in owner sees their real display name + email in sidebar bottom section (no more "Jan Novák / Sales Manager").
- [ ] Sidebar bottom user section renders a non-empty placeholder while `useCurrentUser` is loading (no layout jump, no flash of "JN").
- [ ] If the logged-in email is not in `ASSIGNEE_NAMES`, the section gracefully falls back per Decisions.
- [ ] `Dev Team` sidebar nav item uses the `Bot` icon from `lucide-react`.
- [ ] Pilot user (e.g. `tomas@example.com`) navigating to `/admin/dev-team` is redirected to `/dashboard?error=forbidden`.
- [ ] On landing at `/dashboard?error=forbidden`, the user sees a `sonner` toast: "Nemáš oprávnění k administraci".
- [ ] The toast does not fire on plain `/dashboard` visits (no false positive after subsequent navigation).
- [ ] No regression in: existing `npm run test:b04`, `b06`, `b13`; `npx tsc --noEmit` in `crm-frontend`; `npm run build` in `crm-frontend`.
- [ ] `node scripts/docs/check-doc-sync.mjs` 0 fail; per-task `validate-task-record.mjs` PASSED.

## Tasks

Each task ships as **its own PR** following Track A workflow (claim → classify → dispatch → fix → test → self-review → cross-review → dod-check → pr-open). Track A 500 LOC limit applies per task; this plan's tasks are far smaller. Sebastián merges each PR before the next task starts (per QFH-0005 (d.2) policy: previous task's `complete` entry is bundled into the next run's RUN-LOG additions).

**Branch convention (owner-specified):** `agent/{role}/frontend-wiring-task-N`

### Task 1 — Sidebar bottom user section wired to `useCurrentUser`

- [ ] **Status:** todo
- **Role:** bug-hunter
- **Branch:** `agent/bug-hunter/frontend-wiring-task-1`
- **Depends on:** none
- **Estimated LOC:** ~30 (`sidebar.tsx` only; possibly ±5 in test snapshot if any exists)
- **Files:** `crm-frontend/src/components/layout/sidebar.tsx`
- **Change:**
  - Import `getAssigneeDisplayName` from `@/lib/config` (already exported there at `:97`).
  - In `Sidebar()`, add: `const displayName = currentEmail ? getAssigneeDisplayName(currentEmail) : null;`
  - Compute avatar initials from `displayName` (first letter of first word + first letter of last word, uppercased; for orphan-session email-local-part fallback, take first 2 letters uppercased).
  - Replace lines 236-251 `JN / Jan Novák / Sales Manager` block with bindings:
    - **Loading state** (`useCurrentUser.loading === true`): avatar shows `…` (or a small `<Loader2 className="animate-spin h-4 w-4">` from `lucide-react`); name row shows skeleton stripe (`<span className="h-3 w-20 bg-sidebar-accent/40 rounded animate-pulse">`); email row hidden.
    - **Loaded + email in `ASSIGNEE_NAMES`:** avatar = computed initials; name = `displayName`; email = `currentEmail` (smaller, muted).
    - **Loaded + email is `null` (unauthenticated)**: do not render the user section at all — middleware would have redirected, so this is just a safety branch. Component returns its current shell without the user block.
    - **Loaded + email not in `ASSIGNEE_NAMES` (orphan)**: avatar = first 2 letters of local-part uppercased; name = local-part with first letter capitalised; email = full email.
- **Test plan (manual smoke):**
  1. `cd crm-frontend && npm run dev`.
  2. Login as owner (per `.env.local` `AUTH_PASSWORD` + `OWNER_EMAIL`). Verify sidebar bottom shows owner's display name + email.
  3. Hard-refresh; verify no flash of "JN" or "Jan Novák" before useCurrentUser resolves.
  4. Login as a non-owner pilot user. Verify sidebar bottom shows that user's display name + email; verify Dev Team nav is hidden (existing `isOwner` gate).
  5. Open DevTools → Application → Cookies → delete `crm-session`. Reload. Verify redirect to `/login` (no JS error from null email).
- **Test plan (automated):** none — UI binding, no easy unit-test target without RTL/Playwright (out of scope per Decisions). `npx tsc --noEmit` + `npm run build` must pass.

### Task 2 — Sidebar Dev Team icon swap: `ShieldCheck` → `Bot`

- [ ] **Status:** todo
- **Role:** bug-hunter
- **Branch:** `agent/bug-hunter/frontend-wiring-task-2`
- **Depends on:** none (parallelisable with Task 1, but recommended sequential merge to keep diffs reviewable)
- **Estimated LOC:** ~2 (one import line, one usage line)
- **Files:** `crm-frontend/src/components/layout/sidebar.tsx`
- **Change:**
  - In the `lucide-react` import block (`:5-18`), replace `ShieldCheck` with `Bot`. Keep alphabetical order if the existing block is sorted.
  - In `ADMIN_NAV` const (`:36-40`), change `icon: ShieldCheck` to `icon: Bot`.
- **Test plan (manual smoke):**
  1. Login as owner. Sidebar shows Dev Team item with the bot icon.
  2. Sidebar collapsed state still renders the icon (currently uses `h-5 w-5 shrink-0` class — should not regress).
- **Test plan (automated):** `npx tsc --noEmit` + `npm run build` must pass.

### Task 3 — Middleware `/admin/*` redirect adds `?error=forbidden` query

- [ ] **Status:** todo
- **Role:** security-engineer
- **Branch:** `agent/security-engineer/frontend-wiring-task-3`
- **Depends on:** none (independent of Tasks 1, 2; explicitly **does not depend on Task 4** — the query param is informational, dashboard-side handler can land later)
- **Estimated LOC:** ~3 (one URL construction; possibly +1 comment)
- **Files:** `crm-frontend/src/middleware.ts`
- **Change:**
  - At `:99`, replace `return NextResponse.redirect(new URL('/dashboard', request.url));` with:
    ```
    const forbiddenUrl = new URL('/dashboard', request.url);
    forbiddenUrl.searchParams.set('error', 'forbidden');
    return NextResponse.redirect(forbiddenUrl);
    ```
  - Update the inline comment at `:93-94` to mention the query param.
- **Test plan (manual smoke):**
  1. Login as a non-owner pilot user.
  2. Navigate to `/admin/dev-team`. Verify URL becomes `/dashboard?error=forbidden`.
  3. Login as owner; navigate to `/admin/dev-team`. Verify NO redirect (page renders).
  4. With dev tools Network tab, confirm the redirect is `307` (Next.js default) and Location header carries the query param.
- **Test plan (automated):** `npx tsc --noEmit` + `npm run build` must pass. No middleware unit test exists in the repo; adding one is out of scope.
- **Security note:** This is a **UX-only** change. The actual security boundary (the `if (!ownerEmail || userEmail !== ownerEmail)` check at `:98`) is unchanged. The query param does not loosen the gate; it only conveys cause to the dashboard handler.

### Task 4 — Dashboard handles `?error=forbidden` with sonner toast

- [ ] **Status:** todo
- **Role:** bug-hunter
- **Branch:** `agent/bug-hunter/frontend-wiring-task-4`
- **Depends on:** Task 3 merged (the query param has to exist for the handler to read it; landing this PR before Task 3 would make it a no-op until Task 3 lands, which is fine but introduces dead code into a release)
- **Estimated LOC:** ~10 (new `useEffect` hook + toast call + searchParams clear)
- **Files:** `crm-frontend/src/app/dashboard/page.tsx`
- **Change:**
  - Import `useSearchParams` from `next/navigation` and `toast` from `sonner` and `useRouter` from `next/navigation`.
  - In `DashboardPage()`, add a `useEffect(() => { ... }, [])` that runs once on mount:
    - Read `searchParams.get('error')`.
    - If `=== 'forbidden'`: call `toast.error('Nemáš oprávnění k administraci')`.
    - Strip the query param from the URL via `router.replace('/dashboard', { scroll: false })` so a refresh doesn't re-fire the toast.
- **Test plan (manual smoke):**
  1. Login as pilot user; navigate to `/admin/dev-team`.
  2. Confirm redirect to `/dashboard?error=forbidden`; toast appears bottom-right with the message.
  3. Click around the dashboard; URL becomes plain `/dashboard` (param stripped). Refresh — toast does NOT re-fire.
  4. Login as owner; navigate to `/dashboard` directly. No toast.
  5. Manually visit `/dashboard?error=forbidden` while logged in as owner. Toast fires once, URL strips. (Edge case verifying the handler is param-driven, not role-driven.)
- **Test plan (automated):** `npx tsc --noEmit` + `npm run build` must pass.

## Branch + commit convention

- **Per-task branches:** `agent/{role}/frontend-wiring-task-N` (owner-specified)
- **Commit messages** per `docs/agents/ARCHITECTURE.md` §9 — `{type}(frontend-wiring-task-N): summary` with `[role]`, `[track]: B`, `[plan]: agent-team-frontend-wiring-v1` trailers
- **Plan activation PR (this PR):** `chore(plans): activate agent-team-frontend-wiring-v1` on branch `chore/activate-frontend-wiring-plan`

## Order of execution

```
T1 (sidebar user)  ─────────┐
T2 (icon swap)     ─────────┤  any order, independent merges
T3 (mw redirect)   ─────────┘
                            ↓
T4 (dashboard toast)  — requires T3 merged
```

If owner prefers, T1+T2 can be bundled into one PR (both touch only `sidebar.tsx`, ~32 LOC total) and T3+T4 into another (sequential dependency anyway). Default execution = 4 separate PRs per the plan task list; owner may collapse at merge time.

## Done definition

Plan is **COMPLETED** (moves to `docs/agents/plans/COMPLETED/`) when:
- All 4 task checkboxes ticked above.
- Each task has its own task record in `docs/30-task-records/frontend-wiring-task-N.md`.
- All Acceptance criteria checkboxes ticked.
- `node scripts/docs/check-doc-sync.mjs` 0 fail on the merged main.

## Tech Lead notes for execution session

- **Bootstrap:** standard (`tech-lead.md` + `ARCHITECTURE.md` + `GOTCHAS.md` + `CLAUDE.md` + `docs/13` + `docs/14`). No GOTCHA in `GOTCHAS.md` is directly load-bearing for these UI tweaks; HMAC GOTCHA-003 is adjacent context for Task 3 but the actual security-engineer change does not touch the HMAC verify path.
- **Per-task RUN-LOG bundling:** first task in this plan's first run carries DP-001 closure entry per QFH-0005 (d.2) policy if not already bundled into the DP-003 WIP branch. (DP-003 WIP commit `41445bb` already includes the DP-001 `complete` entry, so the next task here starts with a clean RUN-LOG continuation.)
- **WIP DP-003 unaffected:** branch `agent/bug-hunter/DP-003-clasp-deploy-trap-restore` lives on origin; this plan does not touch deploy infrastructure.
- **`crm-frontend/AGENTS.md` reminder:** "This is NOT the Next.js you know — read `node_modules/next/dist/docs/` before writing any code." Tasks 1, 2, 4 are pure component / hook code; Task 3 is middleware. Tech Lead should skim the relevant Next.js docs (`middleware`, `useSearchParams`, `useRouter`) under `node_modules/next/dist/docs/` before each task to catch any version-specific drift.
