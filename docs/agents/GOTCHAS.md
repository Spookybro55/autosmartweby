# Gotchas — Autosmartweby

> **Auto-appended by learning loop** (`## Auto-generated`) + 3 seed entries
> below in `## Manual entries`.
>
> **Format per entry:**
> ```
> ### GOTCHA-{NNNN}: {Short title}
> - **Where it bites:** file/path or situation
> - **Symptom:** what looks broken
> - **Root cause:** why
> - **Fix / avoidance:** what to do instead
> - **References:** finding ID, PR, commit
> ```

---

## Auto-generated

*Empty until Phase 3 learning loop ships.*

<!-- learning-loop-marker: GOTCHA-AUTO-START -->
<!-- learning-loop-marker: GOTCHA-AUTO-END -->

---

## Manual entries

### GOTCHA-001: Apps Script clasp swap risk (TEST ↔ PROD)

- **Where it bites:** `apps-script/.clasp.json` `parentId` and `scriptId` fields.
- **Symptom:** Code intended for TEST sheet ends up overwriting PRODUCTION
  Apps Script project. Worst case: production users hit a half-deployed pipeline.
- **Root cause:** `apps-script/.clasp.json` parentId is the **TEST** spreadsheet
  (`13fyA63p6g9eLMdy9KhBUO6lrbdtMhsL0kbHOVafvmyo`) **as a deliberate safety
  pin**. Per `apps-script/README.md` § Deployment, PROD deploy is **manual**
  (clasp push to PROD requires temporarily flipping `parentId` and `scriptId`
  to PROD IDs, push, then flip back). If anyone (agent or human) leaves
  `.clasp.json` flipped to PROD, the next innocent `clasp push` hits prod.
- **Fix / avoidance:**
  - **Agent:** **NEVER** edit `apps-script/.clasp.json`. Hard rule in every
    SKILL. Phase 2 CI gate (`agent-pr-validation.yml`) fails any PR touching
    `apps-script/.clasp.json` with author=agent.
  - **Human (Sebastián):** flip → `clasp push` → flip back **in the same
    terminal session**. Don't leave it flipped overnight. Audit finding DP-003
    is the historical context.
- **References:** `apps-script/README.md:147-154`; `CLAUDE.md` § "Apps Script
  deployment"; finding DP-003 (clasp swap risk).

### GOTCHA-002: EXTENSION_COLUMNS resolution via HeaderResolver

- **Where it bites:** Any `apps-script/*.gs` code that touches the LEADS sheet
  by column position instead of by header name.
- **Symptom:** Code reads/writes the wrong column. Often silent — values land
  in adjacent columns that happen to be string-typed. Surfaces weeks later
  when a downstream consumer (Apps Script trigger or frontend filter) picks
  up garbage.
- **Root cause:** LEADS sheet has **35 legacy columns** (untouched, hardcoded
  positions in `LEGACY_COL`) **plus 28+ EXTENSION_COLUMNS** appended on the
  right (per `apps-script/README.md`). Extension columns shift every time a
  new one is added. **Two `status` headers exist** (legacy + extension layer).
  Hardcoding column index = bug.
- **Fix / avoidance:**
  - **Always use `HeaderResolver`** (`apps-script/Helpers.gs`) — pass header
    name, get index. HeaderResolver tracks duplicates by occurrence index and
    is the only safe way to read EXTENSION_COLUMNS.
  - For `LEGACY_COL` constants in `Config.gs` (positions 4, 9, 11, 12, 13, 20):
    these are intentional — legacy code paths. Don't add new code that hardcodes
    positions; route everything new through HeaderResolver.
  - When adding a new extension column: append to `EXTENSION_COLUMNS` in
    `Config.gs`, run "Setup preview extension" menu (idempotent), verify with
    "Audit sheet structure".
- **References:** `apps-script/README.md:128-143` § "Assumptions and edge cases";
  `apps-script/Config.gs` (LEGACY_COL + EXTENSION_COLUMNS); finding C-1, C-2
  in `docs/09-project-control-tower.md`.

### GOTCHA-003: HMAC timing-safe comparison required for auth

- **Where it bites:** Anywhere we compare a user-provided secret (token,
  HMAC tag, password hash) against an expected value. Most relevant in
  `crm-frontend/src/middleware.ts` (session cookie validation) and
  `crm-frontend/src/app/api/preview/render/route.ts` (B-04 webhook header
  `X-Preview-Webhook-Secret`).
- **Symptom:** Timing-oracle attack — attacker measures response time
  difference between "first character wrong" and "first character right",
  brute-forces the secret byte-by-byte.
- **Root cause:** Plain `===` string comparison short-circuits on first
  mismatch. `crypto.timingSafeEqual()` (Node) and `crypto.subtle.verify()`
  (Web Crypto) compare in constant time regardless of mismatch position.
- **Fix / avoidance:**
  - **In Next.js middleware / API routes:** use `crypto.subtle.verify()` (Web
    Crypto) — that's what `middleware.ts` does post-H-2 fix.
  - **In Apps Script:** `BX1` doPost handler implements timing-insensitive
    compare via custom helper (no `crypto.timingSafeEqual` in Apps Script
    runtime). See `apps-script/WebAppEndpoint.gs` for the pattern.
  - **NEW endpoints:** mirror the existing pattern. Don't introduce `===`
    string compare for any auth-sensitive value.
- **References:** finding H-2 (timing-safe HMAC, resolved); finding SEC-013
  (URL token defense in depth, open); `crm-frontend/src/middleware.ts`;
  `apps-script/WebAppEndpoint.gs` BX1 doPost.

### GOTCHA-004: Owner-gate split between server-side and client-side env vars

- **Where it bites:** The `/admin/*` owner gate is enforced in **two
  independent places**, each reading a **different env var** that must be
  kept in sync:
  - Server-side (middleware): `crm-frontend/src/middleware.ts:96` reads
    `process.env.OWNER_EMAIL` to decide whether a request can reach
    `/admin/*` routes.
  - Client-side (sidebar): `crm-frontend/src/components/layout/sidebar.tsx:129`
    reads `process.env.NEXT_PUBLIC_OWNER_EMAIL` to decide whether the
    `Dev Team` nav link appears in the sidebar.
- **Symptom:** Sidebar `Dev Team` link is **silently invisible** in
  production even though the user is the owner and middleware would let
  them in. The owner can reach `/admin/dev-team` only by typing the URL
  manually (and only because middleware lets them through). No error is
  logged; the nav simply renders without the admin item. Easy to mistake
  for a regression in a recent UI PR (e.g. icon swap, sidebar wiring) when
  the actual cause is missing env config.
- **Root cause:** `NEXT_PUBLIC_*` vars are baked into the **client bundle
  at build time**. They are not the same as runtime env on the server.
  When `OWNER_EMAIL` was added to Vercel during PR #94 / KROK 5
  rollout, the parallel `NEXT_PUBLIC_OWNER_EMAIL` was overlooked. Every
  subsequent build embedded `undefined` into the sidebar bundle, so
  `isOwner` evaluated to `false` for every user. Vercel's `env ls` shows
  the gap immediately — but no one ran it. **Real incident 2026-04-30:**
  T2 (PR #99) swapped `ShieldCheck` → `Bot` icon on the Dev Team nav.
  Owner reported "icon still missing" after merge. Investigation through
  Playwright + `vercel env ls` revealed the link itself never rendered;
  the icon was correct in the bundle but the entire nav item was gated
  out client-side. Fixed by `vercel env add NEXT_PUBLIC_OWNER_EMAIL
  production` + redeploy.
- **Fix / avoidance:**
  - **Whenever you add or change `OWNER_EMAIL` on any environment, add or
    update `NEXT_PUBLIC_OWNER_EMAIL` to the same value on the same
    environment.** They are a pair. Never one without the other.
  - **Apply to Production AND Preview** — preview deployments build their
    own bundle and need their own client-side var; otherwise PR previews
    silently lose the admin nav too.
  - **Verification command** (run before declaring an admin-UI task done):
    ```
    cd crm-frontend && npx vercel env ls | grep -E "OWNER_EMAIL|NEXT_PUBLIC_OWNER_EMAIL"
    ```
    If only one row appears, the gap is back.
  - **For agent-driven UI tasks touching `ADMIN_NAV` or `/admin/*`:** before
    blaming a recent code change, open Playwright + login as owner and
    confirm whether the nav item renders **at all**. If it doesn't, the
    code is fine and this gotcha is the real cause.
  - **Future hardening (deferred):** introduce a single `lib/auth/owner.ts`
    that reads only `NEXT_PUBLIC_OWNER_EMAIL` and have middleware import
    it too via a server-only `OWNER_EMAIL` shadow var, or a runtime fetch
    of the public var server-side. Avoids the dual-config trap entirely.
    Tracked as a "hardening" item, not a current blocker.
- **References:** real incident 2026-04-30 in plan
  `agent-team-frontend-wiring-v1` post-merge verification; sidebar gating
  at `crm-frontend/src/components/layout/sidebar.tsx:129-131`; middleware
  gating at `crm-frontend/src/middleware.ts:95-101`; Vercel project ID in
  `crm-frontend/.vercel/project.json`.
