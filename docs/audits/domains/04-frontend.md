# Fáze 4 — Frontend Audit

> **Cíl:** Analyzovat Next.js aplikaci `crm-frontend/` — auth, routing, API vrstvu, state, bezpečnost, UX.
> **Agent pattern:** 🤖🤖🤖 — 3 paralelní agenty (Structure & routing + Data flow & state + Security & build), každý v čistém kontextu.
> **Scope:** `crm-frontend/` — Next.js 16.2.2 + React 19.2.4 + TypeScript 5 + App Router.
> **Reality-check:** Each claim verified against source. `[CORRECTED]` markers signal where agents disagreed or made false claims.

---

## Sekce 1 — Struktura & routing (Agent A)

### Project layout

`crm-frontend/src/` je root pro source code (Next.js standard `src/` mode):

| Adresář | Účel |
|---------|------|
| `src/app/` | App Router (Next.js 16, file-based routing) |
| `src/components/` | Reusable React komponenty (layout, dashboard, leads, pipeline, preview, ui) |
| `src/hooks/` | 4 custom hooks — **všechny mrtvé** (FE-005, viz níže) |
| `src/lib/` | Utility, domain modely, mock data, Google Sheets integration |
| `src/middleware.ts` | Auth middleware (HMAC token verify) |
| `public/` | 5 SVG souborů (next.svg, vercel.svg, atd. — boilerplate, nic citlivého) |

**Router:** App Router (žádný Pages Router, žádné route groups).

### Routes

7 user-facing pages:

| Route | Soubor | Auth | Komponenta |
|-------|--------|------|------------|
| `/` | `app/page.tsx` | redirect → `/dashboard` | RootPage |
| `/login` | `app/login/page.tsx` | public | LoginPage |
| `/dashboard` | `app/dashboard/page.tsx` | session | DashboardPage |
| `/leads` | `app/leads/page.tsx` | session | LeadsPage (Suspense → LeadsPageInner) |
| `/pipeline` | `app/pipeline/page.tsx` | session | PipelinePage |
| `/follow-ups` | `app/follow-ups/page.tsx` | session | FollowUpsPage |
| `/preview/[slug]` | `app/preview/[slug]/page.tsx` | public | PreviewPage |

`preview/[slug]/not-found.tsx` má vlastní 404. `preview/layout.tsx` má minimal max-width-4xl wrapper.

### API routes

6 internal API handlerů:

| Route | Method | Účel | External call |
|-------|--------|------|---------------|
| `/api/auth/login` | POST | Login (allowlist + password) → set `crm-session` cookie | — |
| `/api/leads` | GET | List leads | Google Sheets (sheets-reader) nebo mock |
| `/api/leads/[id]` | GET | Single lead | Google Sheets nebo mock |
| `/api/leads/[id]/update` | PATCH | Update 5 fields | Apps Script WebApp (apps-script-writer) |
| `/api/stats` | GET | Dashboard stats | Google Sheets nebo mock |
| `/api/preview/render` | POST | Webhook B-04 (preview brief upsert) | — (in-memory store) |

### Middleware

`src/middleware.ts:47` — matcher `/((?!_next/static|_next/image|favicon.ico).*)`.

Logic:
1. Public allowlist (`/login`, `/api/auth`, `/preview`) → pass through
2. Static assets → pass
3. Cookie `crm-session` musí existovat
4. HMAC-SHA256 verify přes `crypto.subtle.verify` (timing-safe ✓)
5. Expiry check 7 dní → cleared cookie + redirect na `/login`

Auth implementace: HMAC-signed JSON token v httpOnly cookie. Žádný OAuth, žádný next-auth runtime — vlastní implementace na `crypto.subtle`.

### Mrtvý / nepoužitý kód

**4 custom hooks v `src/hooks/` — všechny defined, žádný import (verified):**
- `use-leads.ts` — 0 references mimo def
- `use-lead-detail.ts` — 0 references
- `use-lead-update.ts` — 0 references
- `use-dashboard-stats.ts` — 0 references

Pages re-implementují fetch+useEffect+AbortController pattern inline. **[CORRECTED]** Agent B původně tvrdil, že hooks jsou používané — verifikace gepem `grep -rn "useLeads\|useLeadDetail..." src/app src/components` = 0 hits potvrdila Agent A.

**1 UI komponenta:**
- `src/components/ui/input-group.tsx` — defined, nikdy importovaná

**Phantom dependency:**
- `package.json:20` `"next-auth": "^5.0.0-beta.30"` — v deps, ale `grep -rn "next-auth\|from 'next-auth'" src/` = 0 výskytů. Beta verze NPM packagu, instalovaná do `node_modules/`, ale nepoužitá v kódu. → FE-004.

---

## Sekce 2 — Data flow & state (Agent B)

### API client

Žádný axios / SWR / React Query. Jen native `fetch()` přímo v komponentách a hookách:

- `useLeads` (dead): `fetch('/api/leads')`
- `LeadsPage`: inline `fetch('/api/leads')` v useEffect
- `LeadDetailDrawer`: `fetch('/api/leads/{id}')` na drawer open + `fetch('/api/leads/{id}/update')` na save
- `apps-script-writer.ts:45,56`: `fetch(SHEET_CONFIG.APPS_SCRIPT_URL, { body: JSON.stringify({ token: process.env.APPS_SCRIPT_SECRET, ... }) })`

Headers vždy jen `Content-Type: application/json`. Žádný `Authorization` header (cross-ref AS-012 v Phase 3 finding).

### State management

**Pattern: lokální `useState` + `useEffect` per page/component.** Žádný Zustand / Redux / Jotai / Context. Žádný globální cache.

LeadDetailDrawer má 6 separate state vars pro form fields (lead-detail-drawer.tsx:193-199). Forms přepisují dirty state pokaždé, žádný optimistic update.

### Server vs client components

Všechny data-fetching pages jsou `'use client'`:
- `dashboard/page.tsx:1`
- `leads/page.tsx:1` (LeadsPageInner uvnitř Suspense)
- `lead-detail-drawer.tsx:1`
- `pipeline/page.tsx`, `follow-ups/page.tsx`

API route handlery jsou server-side (RSC pattern), `googleapis` lib v `sheets-reader.ts` důsledkem nutí server execution. Žádný Server Action / form action.

### Caching

**Minimal:**
- `sheets-reader.ts:27-44` — header-cache TTL 5 min na column-header → index map
- **Žádný data cache.** Dashboard + Leads page volají `fetch('/api/leads')` nezávisle na sobě → 2 plné Sheets API reads per page transition

Žádné `revalidate`, `next: { revalidate: 60 }`, `unstable_cache`, React `cache()`. → FE-010.

### Form handling

`LeadDetailDrawer.handleSave()` (lead-detail-drawer.tsx:246-263) — fetch PATCH s 5-field whitelist body. **Server-side validation only:**
- `update/route.ts:7-46` — enum check pro outreachStage, regex `\d{4}-\d{2}-\d{2}` pro datum, salesNote cap 5000 chars
- Klient nemá žádnou validaci → bad input = round-trip 400

→ FE-007.

### Error & loading states

- Skeleton loadery v drawer (lead-detail-drawer.tsx:165-182)
- Sonner toast pro chyby (`toast.error('Chyba při ukládání')`)
- Žádná retry logika (apps-script-writer.ts:44-72 catches error, returns once)
- Žádný error boundary kromě default Next.js

LeadsPage `<Suspense>` wrap (leads/page.tsx:117-123) bez `fallback={...}` — Suspense fallback chybí; LeadsPageInner sám fetchuje data v `useEffect`, takže Suspense never triggers anyway. → FE-008.

### Type contracts

- `domain/lead.ts:6-59` — `Lead` interface, 50 fields, hand-written
- `mappers/sheet-to-domain.ts:18-24` — `mapRowToLead` se silent-fallbackem (`validOutreachStage` defaults na `'NOT_CONTACTED'`, `validPriority` defaults na `'LOW'`)
- **`LeadDetailDrawer` redefinuje lokálně `Lead` + `LeadEditableFields`** (lead-detail-drawer.tsx:59-104) → drift risk pokud canonical type změní. → FE-006.

### Optimistic updates

Žádné. Save = button disable → wait for ACK → toast → drawer refetch + parent page refetch. Pokud PATCH selže, user musí ručně retry.

---

## Sekce 3 — Security & build (Agent C)

### Environment variables

`.env.example` vyjmenovává 10 klíčů:
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `GOOGLE_SPREADSHEET_ID`
- `APPS_SCRIPT_WEB_APP_URL`, `APPS_SCRIPT_SECRET`
- `ALLOWED_EMAILS`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`

**[CORRECTED]** Agent A tvrdil, že `.env.example` neobsahuje `AUTH_PASSWORD`. Verifikace: `AUTH_PASSWORD` je čteno v `auth/login/route.ts:6`, ale **NENÍ** v `.env.example`. Agent A měl pravdu — environment var bez doc → onboarding gap.

`NEXTAUTH_URL`, `GOOGLE_CLIENT_ID/SECRET` jsou v `.env.example`, ale grep ukazuje, že v kódu nejsou používané (jen `NEXTAUTH_SECRET` a `ALLOWED_EMAILS`).

**Žádné `NEXT_PUBLIC_*` env vars** → žádný secret v browser bundle ✓.

### Hardcoded secrets

Grep `AIza|sk-|gho_|ghp_|hex 32+` v `crm-frontend/src` → 0 výskytů. ✓
`.env*` correctly excluded přes root `.gitignore` (`/.env`, `/.env.local`, `/.env.*.local`, exclude `!.env.example`).

`.gitignore` **NEMÁ** patterns pro:
- `.clasprc.json` (clasp credentials, OAuth refresh token)
- `*.pem` (private keys)
- `credentials.json` (Google service account keyfile)
- `*.key`

Konzistentní s INVENTORY.md Phase 1 nálezem. → FE-009.

### Auth implementation

`api/auth/login/route.ts`:
- Line 7: `const SESSION_SECRET = process.env.NEXTAUTH_SECRET || '';`
- Line 9-11: `if (!SESSION_SECRET) console.warn(...)` — **jen warn, nefail-fast**. HMAC s prázdným klíčem produkuje deterministic signatures, attacker by mohl forge tokeny pokud env var nenastavena. → FE-001.
- Line 42: `if (password !== AUTH_PASSWORD)` — **non-constant-time string compare**. JS `!==` short-circuits na první rozdílný char → timing-attack umožňuje incremental password discovery. → FE-002.
- Line 50: cookie `crm-session` — `httpOnly: true`, `secure: NODE_ENV === 'production'`, `sameSite: 'lax'`, `maxAge: 7 dní` ✓
- Token = `base64url(json) + '.' + base64url(hmac_sha256(json, secret))`

Middleware verify použije `crypto.subtle.verify` (`middleware.ts:13`) — to je timing-safe na *signature verification* straně ✓ (Phase 3 H-2 fix). Login-side compare ale není.

### HTTP headers / CSP

`next.config.ts:4-7` — **prázdná konfigurace**:
```typescript
const nextConfig: NextConfig = { /* config options here */ };
```

**Chybí:**
- Content-Security-Policy
- X-Frame-Options (clickjacking risk)
- X-Content-Type-Options
- Strict-Transport-Security (HSTS)
- Referrer-Policy
- Permissions-Policy

→ FE-003.

### Input validation

Server-side OK:
- `update/route.ts:7-46` — whitelist 5 fields, enum + regex + length
- `preview/render/route.ts:60-117` — `validateRenderRequest()` + timing-safe webhook secret compare (line 68)

Klient žádná validace → FE-007.

### Apps Script webhook auth

`apps-script-writer.ts:56` — `body: JSON.stringify({ token: process.env.APPS_SCRIPT_SECRET, action, ...payload })`. Token v body → cross-reference s **AS-012** finding (Phase 3). Není double-counted, jen confirmation z FE strany.

### Dependencies

Per `package.json` + Phase 1 INVENTORY:
- `next: 16.2.2`, `react: 19.2.4`, `typescript: ^5`
- **`next-auth: ^5.0.0-beta.30`** — beta unreleased, v package.json, ale **0 imports v src/** → phantom dep. → FE-004.
- `googleapis: ^171.4.0`
- npm audit (--omit=dev): 1 HIGH + 3 MODERATE (next, postcss, hono, @hono/node-server) — Phase 7 deep-dive bude reviewovat advisory IDs.

### Build config

`next.config.ts` minimální. Žádný experimental flag, žádné `images.domains`, žádné headers/redirects/rewrites, žádný `output: 'standalone'`. Pro produkční deploy znamená default everything.

### TypeScript strictness

`tsconfig.json`:
- `strict: true` ✓ (zahrnuje noImplicitAny, strictNullChecks)
- 0 `@ts-ignore` v src/
- 0 `as any` v function signatures (našel jen 1 const-cast `as any` v `lib/domain/preview-contract.ts` — safe)

### Logging & error reporting

`console.warn / console.error` ve 3 routes:
- `auth/login/route.ts:10,32`
- `preview/render/route.ts:103-106` (info-log slug + template family)
- `leads/[id]/update/route.ts:109` (error-log raw error)

Žádný Sentry / Datadog / structured logging. Production logy v Vercel půjdou jen do platform-logs. → FE-011.

---

## Sekce 4 — Konsolidované findings (FE-XXX)

| ID | Popis | A | B | C | Severity |
|----|-------|---|---|---|----------|
| FE-001 | `SESSION_SECRET` empty fallback (`process.env.NEXTAUTH_SECRET \|\| ''`) — jen warn, nefail-fast → fakeable HMAC | ✓ | — | ✓ | P1 |
| FE-002 | Login `password !== AUTH_PASSWORD` non-constant-time compare → timing attack | — | — | ✓ | P1 |
| FE-003 | next.config.ts prázdný — chybí CSP, HSTS, X-Frame-Options, atd. | — | — | ✓ | P1 |
| FE-004 | Phantom dep `next-auth ^5.0.0-beta.30` v package.json, **0 imports** v src/ | — | — | ✓ | P1 |
| FE-005 | 4 dead custom hooks (use-leads, use-lead-detail, use-lead-update, use-dashboard-stats) | ✓ | ✓ | — | P2 |
| FE-006 | LeadDetailDrawer redefinuje lokální `Lead`/`LeadEditableFields` (type drift risk) | — | ✓ | — | P2 |
| FE-007 | Žádná client-side form validace; jen server-side → bad UX (round-trip 400) | — | ✓ | ✓ | P2 |
| FE-008 | `<Suspense>` wrap v LeadsPage bez `fallback` + LeadsPageInner fetchuje sám → Suspense unused | — | ✓ | — | P2 |
| FE-009 | `.gitignore` chybí `.clasprc.json`, `*.pem`, `credentials.json`, `*.key` | — | — | ✓ | P2 |
| FE-010 | Žádný data cache (dashboard + leads → 2× independent Sheets read per nav) | — | ✓ | — | P2 |
| FE-011 | `console.log/warn/error` v production routes (preview slug, error details) | — | — | ✓ | P3 |
| FE-012 | Pages reimplement fetch+AbortController inline (vs unused hooks) — code duplication | ✓ | ✓ | — | P3 |
| FE-013 | `input-group.tsx` UI komponenta nikdy importovaná | ✓ | — | — | P3 |
| FE-014 | Inline preview store (memory only) — known limitation B-04/B-05/B-06, doc-worthy | ✓ | — | — | P3 |

**Cross-references:**
- AS-012 (Phase 3) — token v body místo Authorization header — confirmed z FE strany v `apps-script-writer.ts:56`
- AS-006 (Phase 3) — PROD Sheet ID `1RBc...` v `.env.example` placeholder potenciálně shodné s AS-006 hardcoded fallback (manual check)

**Cross-validation hits:**
- FE-005 (dead hooks) — Agent A i B se shodli (B se nejdřív zmýlil tvrzením, že jsou používané; reality-check potvrdil A)
- FE-007 (no client validation) — Agent B i C se shodli
- FE-001 (empty SESSION_SECRET) — Agent A flagged warning, Agent C kvalifikoval jako P1 risk

Plný seznam s evidence/impact/action v [../FINDINGS.md](../FINDINGS.md).

---

## Blind spots (⚪ NEMOHU OVĚŘIT ZE ZDROJÁKŮ)

Přesunuto do [`../MANUAL_CHECKS.md`](../MANUAL_CHECKS.md):

- Vercel deploy state (production URL, env var values, CDN cache strategy)
- Real npm audit advisory IDs pro 1H/3M (Phase 7 deep-dive)
- Live behavior pod load (Sheets API quota spend, race conditions na dashboard refresh)
- Browser network log: zda token leakuje do request URL při proxy/CDN
- Penetration test (auth bypass attempt, IDOR na `/api/leads/[id]`, CSRF)
- Real user data v PROD `crm-session` cookies (delivery age, expiry distribution)

---

## Meta

- **Multi-agent pattern:** 3 paralelní sub-agenty v čistých kontextech
- **Reality-check corrections:** 2× (Agent B claim hooks-used → ověřeno A; AUTH_PASSWORD missing in .env.example double-check)
- **Secrets redacted:** všechny hodnoty zkráceny na first 4 chars
- **Evidence format:** `crm-frontend/src/...:řádek` odkaz na konkrétní místo
