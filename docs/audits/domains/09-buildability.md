# Fáze 9 — Buildability Audit

> **Cíl:** Ověřit, jestli jde projekt rozjet z čistého cloneu bez tribal knowledge.
> **Mód:** AUDIT-ONLY — pouze read-only / verification commands. Žádný `npm audit fix`, deploy, clasp push.

## Audit context

| Field | Value |
|-------|-------|
| Audited repository URL | `https://github.com/Spookybro55/autosmartweby.git` |
| Audited ref | `origin/main` |
| Audited commit SHA | `fb2372d60971efb290cbfa95ea794bd0b3bd242c` |
| Audit datum (ISO 8601) | `2026-04-25T14:14:01+02:00` |
| Audit machine | Windows 11 + Git Bash, fresh clone v `/tmp/autosmartweby-audit-phase-09/autosmartweby/` (mimo OneDrive working copy) |
| Working tree clean before audit | ✅ ano (`git status` = clean post-clone) |
| Node version | `v24.14.1` |
| npm version | `11.11.0` |
| clasp version (lokální install, ne v repu) | `3.3.0` (`/c/Users/spook/AppData/Roaming/npm/clasp`) |

Source-of-truth protokol: per memory `feedback_audit_source_of_truth.md` — celý audit běží v fresh `git clone` mimo OneDrive working copy. Findings odkazují na `soubor:řádek @ fb2372d`.

---

## A. Frontend (`crm-frontend/`)

### A.1 Setup soubory

| Soubor | Status | Velikost | Poznámka |
|--------|--------|----------|----------|
| `crm-frontend/package.json` | ✅ | 923 B | scripts: `dev`, `build`, `start`, `lint` |
| `crm-frontend/package-lock.json` | ✅ | 391 KB | npm@11 lockfile |
| `crm-frontend/.env.example` | ✅ | 827 B | viz **A.5** detailní analýza |
| `crm-frontend/tsconfig.json` | ✅ | 745 B | strict, noEmit, paths `@/*` |
| `crm-frontend/eslint.config.mjs` | ✅ | 483 B | next-config + TypeScript |
| `crm-frontend/next.config.ts` | ✅ | 140 B | prázdný (`{}` config) |
| `crm-frontend/postcss.config.mjs` | ✅ | 101 B | Tailwind |
| `crm-frontend/README.md` | ✅ | per Phase 6 stale, no deploy section |
| `crm-frontend/AGENTS.md` | ✅ | warning "this is NOT the Next.js you know" |
| `crm-frontend/CLAUDE.md` | ✅ | imports `@AGENTS.md` |

### A.2 npm ci (fresh install)

```
$ cd crm-frontend && npm ci
added 677 packages, and audited 678 packages in 1m
237 packages are looking for funding
4 vulnerabilities (3 moderate, 1 high)
```

**Result:** ✅ **PASS** (exit 0, 1m 16s)
**Warnings:**
- `node-domexception@1.0.0: Use your platform's native DOMException instead`
- 4 vulnerabilities (cross-ref **SEC-012**, **SEC-020**)

### A.3 npm run build

```
$ npm run build
▲ Next.js 16.2.2 (Turbopack)
⚠ The "middleware" file convention is deprecated. Please use "proxy" instead.
✓ Compiled successfully in 30.3s
✓ Running TypeScript ... Finished TypeScript in 33.8s
[CRM Auth] NEXTAUTH_SECRET is not set — session tokens will not be signed securely.
✓ Generating static pages using 11 workers (13/13) in 1016ms

Route (app)
┌ ○ /
├ ○ /_not-found
├ ƒ /api/auth/login
├ ƒ /api/leads
├ ƒ /api/leads/[id]
├ ƒ /api/leads/[id]/update
├ ƒ /api/preview/render
├ ƒ /api/stats
├ ○ /dashboard
├ ○ /follow-ups
├ ○ /leads
├ ○ /login
├ ○ /pipeline
└ ƒ /preview/[slug]

ƒ Proxy (Middleware)
```

**Result:** ✅ **PASS** (exit 0, 1m 14s)
**Warnings:**
- `middleware` deprecated → `proxy` (Next.js 16 migration) → **BLD-009**
- `NEXTAUTH_SECRET not set` warning during static page gen → cross-ref **SEC-016** → **BLD-011**

### A.4 npx tsc --noEmit

```
$ npx tsc --noEmit
(žádný výstup, exit 0)
```

**Result:** ✅ **PASS** (exit 0, 29s, žádné TS errory)
**Caveat:** `crm-frontend/package.json` **nemá `typecheck` script** — `npx tsc --noEmit` musí dev volat ručně → **BLD-006**

### A.5 npm run lint

```
$ npm run lint
14 problems (0 errors, 14 warnings)

priority-leads-widget.tsx:3 'useEffect' / 'useState' unused
lead-detail-drawer.tsx:5 'cs' unused
lead-detail-drawer.tsx:39 'StatusBadge' unused
lead-filters.tsx:4 'Input' unused
leads-table.tsx:17 'FilterState' unused
template-family.ts:22 'TemplateType' unused
... (více)
```

**Result:** ✅ **PASS** (exit 0, 24s) ale 14 warnings → **BLD-012**

### A.6 npm run dev

**Status:** NOT TESTED (vyžaduje skutečné Google credentials pro Sheets API a žádný `.env.local` v fresh clone). Mock mode (`mock-service.ts`) by měl fungovat při missing credentials, ale nelze spolehlivě bez user input. Manual check item.

### A.7 `.env.example` analýza

Detail z fresh clone (`crm-frontend/.env.example @ fb2372d`):

```
GOOGLE_SERVICE_ACCOUNT_EMAIL=your-service-account@your-project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
GOOGLE_SPREADSHEET_ID=1RBcLZkn3AruiqaQdJ7PHIxvCcoO5SC9Qnlw_NiLnpYc
APPS_SCRIPT_WEB_APP_URL=https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec
APPS_SCRIPT_SECRET=your-shared-secret-token
ALLOWED_EMAILS=user1@example.com,user2@example.com
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-nextauth-secret
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
```

#### A.7.1 Plně vyplněný PROD identifier v `.env.example`

`GOOGLE_SPREADSHEET_ID` je nastaven na **plnou produkční hodnotu** (`1RBc…`, 44-char Sheet ID). Není to placeholder. Fresh dev po `cp .env.example .env.local` má v lokálním env reálný PROD ID. Cross-ref **SEC-001**, **DP-001** — toto je **nový file path** kde PROD ID figuruje. → **BLD-001**

#### A.7.2 Missing env vars (vs runtime usage)

Cross-check vůči Phase 6 sekce D.18 + Phase 9 fresh-clone scan:

| Env var | V kódu | V `.env.example`? |
|---------|--------|--------------------|
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | `sheets-reader.ts:13` | ✅ |
| `GOOGLE_PRIVATE_KEY` | `sheets-reader.ts:14` | ✅ |
| `GOOGLE_SPREADSHEET_ID` | `lib/config.ts:2` | ✅ (s plnou hodnotou — BLD-001) |
| `APPS_SCRIPT_WEB_APP_URL` | `lib/config.ts:7` | ✅ |
| `APPS_SCRIPT_SECRET` | `apps-script-writer.ts:56` | ✅ |
| `NEXTAUTH_SECRET` | `auth/login/route.ts:7`, `middleware.ts:4` | ✅ |
| `ALLOWED_EMAILS` | `auth/login/route.ts:5` | ✅ |
| **`AUTH_PASSWORD`** | `auth/login/route.ts:6` | ❌ **chybí** |
| **`PREVIEW_WEBHOOK_SECRET`** | `api/preview/render/route.ts:62` | ❌ **chybí** |
| **`PUBLIC_BASE_URL`** | `api/preview/render/route.ts:56` | ❌ **chybí** |

→ **BLD-003** P0: bez `AUTH_PASSWORD` fresh dev nemůže přihlásit (login route returns `503 'Přihlášení není nakonfigurováno'`).

#### A.7.3 Zombie env vars (v `.env.example`, nepoužívané v `crm-frontend/src`)

| Env var | Používá se v `crm-frontend/src`? |
|---------|----------------------------------|
| `NEXTAUTH_URL` | ❌ (NextAuth není wired up — middleware používá vlastní HMAC, ne next-auth lib) |
| `GOOGLE_CLIENT_ID` | ❌ |
| `GOOGLE_CLIENT_SECRET` | ❌ |

→ **BLD-004** P1: confusing pro fresh dev — předpoklad, že NextAuth + Google OAuth fungují, ale runtime používá vlastní HMAC + AUTH_PASSWORD.

---

## B. Apps Script (`apps-script/`)

### B.1 Setup tooling

| Toolset | Status |
|---------|--------|
| `clasp` (Google Apps Script CLI) | Vyžadováno, **NEPATŘÍ do repo `package.json`** ani `apps-script/`. Fresh dev musí znát příkaz `npm i -g @google/clasp`. → **BLD-007** |
| `.clasp.json` | ✅ committed (cross-ref **SEC-002**, **DP-002** — security risk) |
| `.clasp.json.prod` | ✅ committed |
| `.claspignore` | ❌ neexistuje (cross-ref **DP-007**) |
| `appsscript.json` | ✅ |

### B.2 `apps-script/README.md` setup steps

Stále stale per **DP-013**:
- Říká "Create files (click + → Script)" — vágní, neukazuje clasp workflow
- Listuje `Code.gs`, `Qualify.gs`, `Preview.gs`, `Pipeline.gs` — neexistují (real: `Menu.gs`, `AutoQualifyHook.gs`, `PreviewPipeline.gs`)
- Říká "28 new columns" — real: 55+

→ **BLD-008** (cross-ref DP-013): fresh dev čte README, hledá soubory které neexistují, ztratí čas.

### B.3 Local execution

Apps Script kód je server-side (Google's V8 runtime). Na lokále **nelze přímo spustit** `.gs` funkce. Local tests jsou v `scripts/test-XXX.mjs` které **simulují** Apps Script API přes mock objects.

| Test | Status | Run via |
|------|--------|---------|
| test-a05-backward-compat.mjs | ✅ PASS | `node scripts/test-a05-backward-compat.mjs` |
| test-a05-batch.mjs | ✅ PASS | `node scripts/test-a05-batch.mjs` |
| test-a06-webcheck-hook.mjs | ✅ PASS (31/0) | `node scripts/test-a06-webcheck-hook.mjs` |
| test-a07-qualify-hook.mjs | ✅ PASS (23/0) | `node scripts/test-a07-qualify-hook.mjs` |
| test-a08-preview-queue.mjs | ✅ PASS (38/0) | `node scripts/test-a08-preview-queue.mjs` |
| test-a09-ingest-report.mjs | ✅ PASS (136/0) | `node scripts/test-a09-ingest-report.mjs` |
| test-b05-preview-webhook.mjs | ✅ PASS (42/0) | `npm run test:b05` (✅ scripted) |
| test-b06-review-writeback.mjs | ✅ PASS (105/0) | `npm run test:b06` (✅ scripted) |
| test-ingest-runtime.mjs | ✅ PASS | `node scripts/test-ingest-runtime.mjs` |
| test-wave4-pipeline.mjs | ✅ PASS | `node scripts/test-wave4-pipeline.mjs` |

→ **BLD-013** P2: A-stream tests **nejsou v `package.json` scripts** (pouze test:b03..b06 jsou). Fresh dev nezná konvenci spouštění (musí grep nebo runbook).

---

## C. Root scripts

### C.1 docs governance

| Script | Result | Notes |
|--------|--------|-------|
| `npm run docs:check` | ✅ PASS (43 pass, 0 warn, 0 fail) | exit 0 |
| `npm run docs:build-changelog` | ✅ PASS (Generated 32 task records) | exit 0; output je idempotent (no diff after second run) |
| `npm run docs:build-task-registry` | ✅ PASS (Generated 32 tasks) | exit 0; idempotent |
| `npm run docs:new-task` | NOT RUN (vyžaduje arg) | by-design — `npm run docs:new-task -- TASK_ID "Title"` |

Po regen `git status` ukázal modifikované `docs/11-change-log.md` a `docs/29-task-registry.md` — analyzováno: pouze EOL difference (CRLF/LF), `git diff -w` = empty. Tj. content identical, jen Windows checkout normalizuje EOL. Linux CI (`docs-governance.yml runs-on: ubuntu-latest`) nemá tento problem.

### C.2 b-stream tests

| Script | Result |
|--------|--------|
| `npm run test:b03` (template-family) | ✅ PASS (13/0) |
| `npm run test:b04` (preview-render-endpoint) | ✅ PASS (9/0) |
| `npm run test:b05` (preview-webhook) | ✅ PASS (42/0) |
| `npm run test:b06` (review-writeback) | ✅ PASS (105/0) |

### C.3 Co chybí v root scripts

- ❌ `npm test` (no aggregator)
- ❌ `npm run typecheck` v root nebo crm-frontend
- ❌ `npm run ci` / `npm run verify` (combined gate)
- ❌ A-stream tests scripts (test:a05..a09)

→ **BLD-014** P2

### C.4 Root `package-lock.json`

❌ **Neexistuje.** Root `package.json` má 0 dependencies (pouze scripts), takže technicky není potřeba. Ale Node `--experimental-strip-types` (`test:b03`, `test:b04`) je TypeScript-strip flag který se v různých Node verzích chová různě (≥22.6 supports, exact behavior može mírně driftnout v ≥24).

→ **BLD-005** P2 (cross-ref BLD-019)

### C.5 Node version assumptions

| File | Node version pin? |
|------|--------------------|
| `package.json` (root) | ❌ no `engines.node` |
| `crm-frontend/package.json` | ❌ no `engines.node` |
| `.nvmrc` (root) | ❌ neexistuje |
| `.tool-versions` | ❌ neexistuje |

→ **BLD-019** P2: žádný Node version pin. Fresh dev s Node 18 / 20 / 22 / 24 dostane potenciálně jiné chování (TS-strip flag, ESM, atd.).

---

## D. Required env vars summary

| Env var | Where used | Required for | Has placeholder in `.env.example`? |
|---------|------------|--------------|-----------------------------------|
| `GOOGLE_SPREADSHEET_ID` | `lib/config.ts:2` | Read leads | ✅ (BUT plnou PROD hodnotou — BLD-001) |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | `sheets-reader.ts:13` | Sheets API auth | ✅ |
| `GOOGLE_PRIVATE_KEY` | `sheets-reader.ts:14` | Sheets API auth | ✅ |
| `APPS_SCRIPT_WEB_APP_URL` | `lib/config.ts:7` | Lead write-back | ✅ |
| `APPS_SCRIPT_SECRET` | `apps-script-writer.ts:56` | Webhook auth | ✅ |
| `NEXTAUTH_SECRET` | `auth/login/route.ts:7`, `middleware.ts:4` | HMAC session | ✅ |
| `AUTH_PASSWORD` | `auth/login/route.ts:6` | Login | ❌ **chybí** (BLD-003) |
| `ALLOWED_EMAILS` | `auth/login/route.ts:5` | User allowlist | ✅ |
| `PREVIEW_WEBHOOK_SECRET` | `api/preview/render/route.ts:62` | Webhook receiver auth | ❌ **chybí** (BLD-003) |
| `PUBLIC_BASE_URL` | `api/preview/render/route.ts:56` | Preview URL build | ❌ **chybí** (BLD-003) |

---

## E. Onboarding instructions vs reality

### E.1 Fresh dev journey (per current docs)

| Krok | Required files | Required secrets | Docs coverage | Risk |
|------|----------------|-------------------|---------------|------|
| 1. `git clone <url>` | — | — | ⚠️ no root README → fresh dev hledá kde začít → **BLD-002** | medium |
| 2. Install Node 20+ | `package.json` | — | ⚠️ no `engines.node` ani `.nvmrc` → **BLD-019** | low (any modern Node likely works) |
| 3. `cd crm-frontend && npm ci` | `package-lock.json` | — | ✅ `crm-frontend/README.md:13-17` | low |
| 4. `cp .env.example .env.local` | `.env.example` | All env vars need filling | ⚠️ `.env.example` má PROD ID hardcoded + 3 missing vars + 3 zombie vars → **BLD-001**, **BLD-003**, **BLD-004** | high |
| 5. `npm run dev` | `.env.local` | All required env vars | ⚠️ Bez `AUTH_PASSWORD` login fails 503; bez Google credentials Mock mode kicks in (silent fallback) | medium |
| 6. Setup Apps Script | `clasp` global install | clasp OAuth token | ❌ `clasp install` not documented; `apps-script/README.md` stale → **BLD-007**, **BLD-008** | high |

### E.2 Top blockers pro fresh dev

1. ❌ Žádný root `README.md` — first impression = kde začít? → **BLD-002**
2. ❌ `.env.example` chybí 3 must-have vars → bez `AUTH_PASSWORD` se nelze přihlásit → **BLD-003**
3. ❌ `apps-script/README.md` setup steps stale, žádné clasp instructions → **BLD-007**, **BLD-008**

---

## F. Windows compatibility

### F.1 Build v `/tmp/...` (no Czech chars, no spaces)

✅ **Verifikováno PASS** — tato Phase 9 audit běží v `C:\Users\spook\AppData\Local\Temp\autosmartweby-audit-phase-09\autosmartweby\`. Všechny kroky (npm ci, build, lint, tsc, tests, docs) PASS.

### F.2 Build v "C:/Users/spook/Nabídka weby" (s diakritikou + space)

NOT TESTED v Phase 9 (per request používat fresh clone mimo OneDrive). User-machine path obsahuje:
- Czech znak `í` (Unicode U+00ED)
- Space
- OneDrive sync layer

**Risks (theoretical, not verified):**
- npm cache lookup paths → defaultně OK (Node handles UTF-8 paths since v10)
- ESLint output paths → seen v Phase 9 lint output: `C:\Users\spook\AppData\Local\Temp\autosmartweby-audit-phase-09\...` (test path), works
- Windows path separator `\` vs Bash `/` → mixed paths v error messages
- OneDrive sync interfering s `node_modules` writes → potential lock contention

→ **BLD-017** P2: Windows + Czech path + OneDrive je komplikovaná kombinace; doporučuje se tým work mimo OneDrive paths.

### F.3 Shell compatibility

| Příkaz | Git Bash | PowerShell | cmd.exe |
|--------|----------|------------|---------|
| `npm ci` | ✅ | ✅ | ✅ |
| `npm run build` | ✅ | ✅ | ✅ |
| `node scripts/test-XXX.mjs` | ✅ | ✅ | ✅ |
| `bash scripts/clasp-deploy.sh test` | ✅ Git Bash | ❌ vyžaduje WSL/Cygwin | ❌ |

`scripts/clasp-deploy.sh` je shell skript → vyžaduje Bash. Windows-only dev s PowerShell/cmd by ho nemohl spustit. → **BLD-021** P2

---

## Summary table — Area × Status

| Area | Expected command | Actual command | Result | Evidence | Status |
|------|------------------|----------------|--------|----------|--------|
| Frontend install | `npm ci` (per package-lock) | `npm ci` | 677 packages, 4 vulns | console output, exit 0, 1m 16s | ✅ **PASS** |
| Frontend build | `npm run build` | `next build` | All routes built | ✓ Compiled successfully in 30.3s | ✅ **PASS** (with deprecations) |
| Typecheck | `npm run typecheck` (chybí) | `npx tsc --noEmit` | žádné errory | exit 0, 29s | ✅ **PASS** (no script in package.json) |
| Lint | `npm run lint` | `eslint` | 14 warnings, 0 errors | exit 0, 24s | ✅ **PASS** with warnings |
| Frontend dev | `npm run dev` | `next dev` | NOT RUN (no .env.local) | — | ⚪ **NOT TESTED** |
| Root tests b03 | `npm run test:b03` | `node --test scripts/tests/template-family.test.ts` | 13/0 | exit 0 | ✅ **PASS** |
| Root tests b04 | `npm run test:b04` | `node --test scripts/tests/preview-render-endpoint.test.ts` | 9/0 | exit 0 | ✅ **PASS** |
| Root tests b05 | `npm run test:b05` | `node scripts/test-b05-preview-webhook.mjs` | 42/0 | exit 0 | ✅ **PASS** |
| Root tests b06 | `npm run test:b06` | `node scripts/test-b06-review-writeback.mjs` | 105/0 | exit 0 | ✅ **PASS** |
| A-stream tests | `npm run test:a05` (chybí) | `node scripts/test-a05-batch.mjs` etc. | All PASS | exit 0 each | ✅ **PASS** ale nelze přes npm script |
| Docs sync | `npm run docs:check` | `node scripts/docs/check-doc-sync.mjs` | 43 pass | exit 0 | ✅ **PASS** |
| Docs regen | `npm run docs:build-changelog` | `node scripts/docs/build-changelog.mjs` | 32 records, idempotent | exit 0 | ✅ **PASS** |
| Apps Script local | `clasp pull` (vyžaduje OAuth) | NOT RUN | (vyžaduje credentials) | — | ⚪ **NOT TESTED** |
| Production audit | `npm audit --omit=dev` | same | 4 vulns (1 high, 3 mod) | next/postcss/hono | ⚠️ **PARTIAL** |

---

## Findings (BLD-XXX)

| ID | Severity | Stručně | Cross-ref |
|----|----------|---------|-----------|
| BLD-001 | P0 | `crm-frontend/.env.example` obsahuje **plnou produkční hodnotu** `GOOGLE_SPREADSHEET_ID=1RBc…` (44 znaků). Není to placeholder. Fresh dev po `cp .env.example .env.local` má v lokálním env reálný PROD Sheet ID | SEC-001, DP-001 |
| BLD-002 | P0 | Žádný root `README.md` v repu. Fresh dev po `git clone` nemá top-level setup instrukce. Musí najít README v `crm-frontend/` a `apps-script/`, ale nikdo mu neřekne, že jsou tam | DP-016 |
| BLD-003 | P0 | `.env.example` chybí 3 reálně používané env vars: `AUTH_PASSWORD`, `PREVIEW_WEBHOOK_SECRET`, `PUBLIC_BASE_URL`. Bez nich aplikace nelze plně provozovat (login fails 503, webhook 500, preview URLs broken) | DP-016 |
| BLD-004 | P1 | `.env.example` obsahuje 3 zombie env vars (`NEXTAUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`) které nejsou v `crm-frontend/src` použité. Confusing — NextAuth + Google OAuth není wired up | DP-014 |
| BLD-005 | P2 | Žádný root `package-lock.json`. Root scripts (`docs:*`, `test:*`) běží bez version-pinned dependencies | — |
| BLD-006 | P2 | `crm-frontend/package.json` nemá `typecheck` script. `npx tsc --noEmit` funguje, ale fresh dev musí znát příkaz | — |
| BLD-007 | P1 | Apps Script vyžaduje `@google/clasp` global install. Není v žádném `package.json` ani v setup docs. Fresh dev musí znát `npm i -g @google/clasp` | DP-013 |
| BLD-008 | P1 | `apps-script/README.md` setup steps stale (Code.gs/Qualify.gs/Preview.gs/Pipeline.gs files don't exist; "28 new columns" is now 55+). Cross-ref DP-013 | DP-013 |
| BLD-009 | P2 | Next.js 16 build warns: `middleware` file convention deprecated → use `proxy`. Build PASS ale future Next.js update může break | — |
| BLD-010 | P1 | Cross-ref SEC-012: `next@16.2.2` HIGH DoS CVE v `npm audit` output (3 moderate + 1 high). Fix v 16.2.4 | SEC-012 |
| BLD-011 | P1 | Build prints `[CRM Auth] NEXTAUTH_SECRET is not set — session tokens will not be signed securely.` při static page gen. Build succeeds ale runtime nejisté pokud env chybí | SEC-016 |
| BLD-012 | P3 | 14 ESLint warnings (unused imports/vars) napříč `crm-frontend/src/`. Code quality, ne blocker | — |
| BLD-013 | P2 | A-stream tests (`test-a05-*` až `test-a09-*`) nejsou v `package.json` scripts. Spuštění vyžaduje `node scripts/test-XXX.mjs` přímo. Inconsistent s b-stream | — |
| BLD-014 | P2 | Žádný root `npm test` ani `npm run verify` aggregator. Fresh dev musí ručně spustit 4× `test:b03..b06` plus 6× `test-a05..a09` | DP-005 |
| BLD-015 | P1 | CI nespouští žádné testy / build / lint / typecheck (cross-ref DP-005). Fresh dev nezná, jestli jeho PR test-suite passes před review | DP-005 |
| BLD-016 | P2 | `crm-frontend/README.md` postrádá deployment instructions a 3 env vars (cross-ref DP-016) | DP-016 |
| BLD-017 | P2 | Windows + Czech path + OneDrive ("`C:/Users/spook/Nabídka weby`") combo není v Phase 9 verifikováno (audit běží v `/tmp/...`). Theoretical risk: OneDrive sync vs `node_modules` lock contention, paths s diakritikou v error messages | — |
| BLD-018 | P3 | `crm-frontend/next.config.ts` je prázdný (`{}` config). Žádné customizace — default Next.js setup. Není to problém, ale signál absence performance / security tweaks | — |
| BLD-019 | P2 | Žádný `.nvmrc`, `.tool-versions`, ani `engines.node` v `package.json` (root nebo frontend). Fresh dev s nesprávnou Node verzí může mít subtle bugs (TS-strip flag, ESM behavior) | — |
| BLD-020 | P3 | `crm-frontend/package-lock.json` je 391 KB. Konzistentní (npm ci PASS), ale velký lockfile = pomalejší git operations | — |
| BLD-021 | P2 | `scripts/clasp-deploy.sh` je shell skript → vyžaduje Bash. Windows-only dev s pouze PowerShell/cmd ho nemůže spustit | — |

---

## Co nelze ověřit ze zdrojáků (přesunuto do MANUAL_CHECKS.md)

⚪ Reálné chování `npm run dev` se skutečnými Google credentials (mock mode fallback chování)
⚪ Apps Script `clasp pull` / `clasp push test` workflow s reálným Google account login
⚪ Build v Windows + Czech path + OneDrive (`C:/Users/spook/Nabídka weby`)
⚪ Reálná frequency Vercel preview build PASS / FAIL po každém push (no `vercel.json`)
⚪ `.env.local` skutečně používaný PROD operatorem (může mít další undocumented vars?)
⚪ Whether tým pravidelně spouští testy lokálně před push (CI je nespouští)
⚪ Whether `npm i -g @google/clasp` verze 3.3.0 je compatible se všemi `apps-script/*.gs` features
