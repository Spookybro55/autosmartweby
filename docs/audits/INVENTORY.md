# Repo Inventory (Fáze 1)

> Faktický, úplný soupis repa. Žádné hodnocení, jen "co tady je". Slouží jako mapa pro všechny další fáze.

---

## A. Globální přehled

### Strom adresářů (do úrovně 3)

```
.
├── apps-script/           — Google Apps Script backend (V8)
├── crm-frontend/          — Next.js 16 frontend
│   ├── public/
│   └── src/
│       ├── app/           — App Router pages + API
│       ├── components/    — UI + feature komponenty
│       ├── hooks/
│       └── lib/           — contracts, google clients, mappers, mock, domain
├── docs/                  — governance, task records, audit, archive
│   ├── 30-task-records/   — 33 task records (A1-A10, B1-B6, B-07, BX1, C-*, CS*)
│   ├── archive/           — legacy / superseded docs
│   ├── audits/            — tato audit struktura (Fáze 0+)
│   └── contracts/         — JSON schemas + contract markdown
├── offers/                — statické HTML/PDF obchodní nabídky + Python html2pdf
└── scripts/               — tooling (docs build, tests, scraper, clasp deploy)
    ├── docs/              — docs generation + doc-sync check
    ├── scraper/           — A-04 scraper runtime
    │   └── lib/, samples/
    └── tests/             — B-03/B-04 TS tests
```

### Top-level adresáře — 1-věta popis

| Složka | Popis |
|--------|-------|
| `apps-script/` | CRM backend v Google Apps Script V8 (pipeline A-01..A-10, write-back BX1, B-04/B-05 webhook caller, B-06 review handler, doPost web app endpoint) |
| `crm-frontend/` | Next.js 16 App Router (dashboard, leads, pipeline, follow-ups, preview renderer, login) |
| `docs/` | Governance docs (20-28 canonical), task records (30-), audits (tato složka), contracts (JSON schemas + md) |
| `offers/` | Statické obchodní nabídky (HTML + PDF) a Python HTML→PDF skripty |
| `scripts/` | Tooling — docs generation (build-changelog, build-task-registry), per-task Node test harness, scraper runtime, clasp-deploy.sh |

### Velikost, počet souborů, LOC per language

- **Total disk size** (excl. `node_modules`, `.next`, `.git`, `.claude*`): **4.9 MB**
- **Total tracked files** (stejný filter): **277**
- **File type distribution**:

| Extension | Count |
|-----------|-------|
| `.md` | 101 |
| `.tsx` | 49 |
| `.ts` | 33 |
| `.mjs` | 22 |
| `.json` | 19 |
| `.gs` | 17 |
| `.html` | 11 |
| `.py` | 2 |
| `.yml` | 1 |
| `.sh` | 1 |
| `.css` | 1 |

- **LOC totals** (`wc -l`):

| Kategorie | LOC |
|-----------|-----|
| TypeScript (`.ts` + `.tsx`) | **8 230** |
| Apps Script (`.gs`) | **7 670** |
| Node scripts (`.mjs`) | **5 534** |
| Markdown (`.md`) | **23 344** |
| JSON (`.json`) | **11 787** |

---

## B. Git & historie

### Aktuální stav

- **Remote origin:** `https://github.com/Spookybro55/autosmartweby.git`
- **Default branch:** `main`
- **Current audit branch:** `audit/01-inventory` (branched from `audit/00-setup`)
- **Audit baseline:** `origin/main` @ `1dfc7e8` (merge PR #36 B-06)

### Posledních 10 commitů na `origin/main`

```
1dfc7e8 2026-04-24 Spookybro55 Merge pull request #36 from Spookybro55/task/B6-minimal-review-layer
80be0f0 2026-04-24 beeza66 fix(B-06): explicit oauthScopes + TEST RUNTIME VERIFIED evidence
0a1d24f 2026-04-24 beeza66 feat(B-06): add minimal preview review layer
9bc359f 2026-04-24 Spookybro55 Merge pull request #35 from Spookybro55/task/B-07-pilot-support
c3251da 2026-04-24 Sebastian Fridrich chore(B-07): add pilot support package for current preview lifecycle
9ed65da 2026-04-22 Spookybro55 Merge pull request #34 from Spookybro55/task/C-11-config-secrets-guardrails
6885ad3 2026-04-22 Sebastian Fridrich fix(C-11): micro-fix — KILL_SWITCH table header count 13 → 14
d9c8682 2026-04-22 Sebastian Fridrich fix(C-11): narrow audit fix — align LIMIT counts, kill-switch truthfulness, secrets taxonomy
9595235 2026-04-22 Sebastian Fridrich feat(C-11): config / secrets / limits / budget guardrails spec (SPEC-only)
22a3584 2026-04-22 Spookybro55 Merge pull request #33 from Spookybro55/task/C-10-performance-report
```

### Branches

- **Lokální branches:** 5 (incl. `audit/00-setup`, `audit/01-inventory`, `main-snapshot`, `main`, `task/B6-minimal-review-layer`)
- **Remote branches:** 20 (incl. 17 task branches, `audit/00-setup`, `chore/apps-script-test-setup`, `main`)
- **Aktivní remote task branches (unmerged feature work):** `task/A1-*`, `task/A2-*`, `task/A3-*`, `task/A6-*`, `task/A9-*`, `task/B1-*`, `task/B2-*`, `task/B3-*` (2× — auth-phase1 + template-family-mapping), `task/B4-*`, `task/B5-*`, `task/B6-*`, `task/BX1-*`, `task/C-02-*`, `task/C-05-*`, `task/C1-*`

### Tagy

- **Celkem: 0** (žádné git tagy nepoužity)

### Merge pattern

- **Pattern:** merge commits přes GitHub PR workflow (ne squash, ne rebase)
- Ukázka (posledních 5 merge commitů):
  ```
  1dfc7e8 Merge pull request #36 from Spookybro55/task/B6-minimal-review-layer
  9bc359f Merge pull request #35 from Spookybro55/task/B-07-pilot-support
  9ed65da Merge pull request #34 from Spookybro55/task/C-11-config-secrets-guardrails
  22a3584 Merge pull request #33 from Spookybro55/task/C-10-performance-report
  6bcc99a Merge pull request #32 from Spookybro55/task/C-09-exception-queue
  ```

### Celkový počet commitů

- **Na `origin/main`:** 128
- **Napříč všemi branches:** 132

---

## C. Apps Script část

### Cesta

- **Hlavní adresář:** `apps-script/`
- **Žádný subadresář** — všechny `.gs` + 1 `appsscript.json` + 2 clasp configy + 1 README na jedné úrovni

### Soubory `.gs`

17 souborů, **7 670 LOC** celkem:

| Soubor | LOC | Top-level funkcí |
|--------|-----|------------------|
| `AutoQualifyHook.gs` | 260 | 6 |
| `AutoWebCheckHook.gs` | 302 | 5 |
| `Config.gs` | 244 | 0 (pouze konstanty + enumy) |
| `ContactSheet.gs` | 1 190 | 16 |
| `DedupeEngine.gs` | 366 | 5 |
| `EnvConfig.gs` | 200 | 8 |
| `GmailLabels.gs` | 111 | 5 |
| `Helpers.gs` | 839 | 31 |
| `IngestReport.gs` | 633 | 11 |
| `LegacyWebCheck.gs` | 328 | 13 |
| `MailboxSync.gs` | 390 | 8 |
| `Menu.gs` | 121 | 2 |
| `Normalizer.gs` | 217 | 10 |
| `OutboundEmail.gs` | 384 | 7 |
| `PreviewPipeline.gs` | 1 670 | 20 |
| `RawImportWriter.gs` | 298 | 5 |
| `WebAppEndpoint.gs` | 117 | 3 |

**Total top-level funkcí: 155**

### `appsscript.json`

```json
{
  "timeZone": "Europe/Prague",
  "dependencies": {},
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8",
  "oauthScopes": [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/script.external_request",
    "https://www.googleapis.com/auth/script.scriptapp",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/script.send_mail",
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/gmail.labels"
  ],
  "webapp": {
    "executeAs": "USER_DEPLOYING",
    "access": "ANYONE_ANONYMOUS"
  }
}
```

### `.clasp.json` (redacted)

| File | scriptId first 4 | parentId first 4 | rootDir | Komentář |
|------|-------------------|-------------------|---------|----------|
| `apps-script/.clasp.json` | `1Sjd` | `13fy` | `""` | default, aktivní (TEST) |
| `apps-script/.clasp.json.prod` | `1fnL` | _(absent)_ | _(absent)_ | PROD, ne-swappuje se automaticky; `clasp-deploy.sh prod` kopíruje přes `.clasp.json` |

Další vlastnosti `.clasp.json` (neobsahující secrets):
- `scriptExtensions`: `[".gs", ".js"]`
- `htmlExtensions`: `[".html"]`
- `jsonExtensions`: `[".json"]`
- `filePushOrder`: `[]`
- `skipSubdirectories`: `false`

### `package.json` v Apps Script části

**Neexistuje** — Apps Script nemá vlastní Node packaging, závisí na root `package.json` pro tooling (test harness, docs build).

### Funkce — ukázka (PreviewPipeline.gs, 20 funkcí)

```
14:  setupPreviewExtension
64:  ensureLeadIds
105: generateLeadId_
120: auditLeadIds
245: qualifyLeads
365: computeCompanyKey_
381: computeCompanyKeyFromRecord_
394: computeBranchKey_
403: evaluateQualification_
519: chooseTemplateType_
575: buildPreviewBrief_
661: buildSlug_
676: buildEmailDrafts
744: composeDraft_
885: processPreviewQueue
1096: simulateAndWrite
1167: refreshProcessedPreviewCopy
1263: auditCurrentSheetStructure
1345: installProjectTriggers
1436: runWebhookPilotTest
```

Další funkce per soubor jsou mechanicky získatelné přes `grep -nE "^function " apps-script/<file>.gs`; úplná funkční mapa je deliverable **Fáze 3** (Apps Script audit).

---

## D. Frontend `crm-frontend/`

### Next.js + React verze

- **Next.js:** `16.2.2`
- **React:** `19.2.4`
- **React DOM:** `19.2.4`

### Router

**App Router** (`src/app/` existuje, `src/pages/` neexistuje)

### Routes (page.tsx)

| Route | Soubor |
|-------|--------|
| `/` | `src/app/page.tsx` |
| `/dashboard` | `src/app/dashboard/page.tsx` |
| `/follow-ups` | `src/app/follow-ups/page.tsx` |
| `/leads` | `src/app/leads/page.tsx` |
| `/login` | `src/app/login/page.tsx` |
| `/pipeline` | `src/app/pipeline/page.tsx` |
| `/preview/[slug]` | `src/app/preview/[slug]/page.tsx` |

### API routes

| Endpoint | Soubor |
|----------|--------|
| `POST /api/auth/login` | `src/app/api/auth/login/route.ts` |
| `GET /api/leads/[id]` | `src/app/api/leads/[id]/route.ts` |
| `POST /api/leads/[id]/update` | `src/app/api/leads/[id]/update/route.ts` |
| `GET /api/leads` | `src/app/api/leads/route.ts` |
| `POST /api/preview/render` | `src/app/api/preview/render/route.ts` |
| `GET /api/stats` | `src/app/api/stats/route.ts` |

### Layouts

- `src/app/layout.tsx` — root layout
- `src/app/preview/layout.tsx` — preview-specific layout (full-page, bez CRM shellu)

### Middleware

- `src/middleware.ts` — HMAC session verify, public paths allowlist

### Komponenty (top-level adresáře v `src/components/`)

- `dashboard/` — KPI widgets, charts
- `layout/` — AppShell, navigation
- `leads/` — table, detail drawer, filters
- `pipeline/` — kanban
- `preview/` — render sections (hero, services, contact, etc.)
- `ui/` — shadcn primitives

### Klíčové dependencies

**Runtime (deps):**
- `next` 16.2.2
- `react` / `react-dom` 19.2.4
- `next-auth` ^5.0.0-beta.30
- `googleapis` ^171.4.0
- `@base-ui/react` ^1.3.0
- `class-variance-authority` ^0.7.1
- `clsx` ^2.1.1
- `cmdk` ^1.1.1
- `date-fns` ^4.1.0
- `lucide-react` ^1.7.0
- `shadcn` ^4.1.2
- `sonner` ^2.0.7
- `tailwind-merge` ^3.5.0
- `tw-animate-css` ^1.4.0

**Dev:**
- `typescript` ^5
- `eslint` ^9 + `eslint-config-next` 16.2.2
- `tailwindcss` ^4 + `@tailwindcss/postcss` ^4
- `@types/node` ^20 + `@types/react` ^19 + `@types/react-dom` ^19

### `next.config.ts`

```typescript
import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  /* config options here */
};
export default nextConfig;
```

(Prázdný config — žádné rewrites, redirects, headers, images, experimental flags.)

### `tsconfig.json`

- `strict`: **true**
- `target`: `ES2017`
- `moduleResolution`: `bundler`
- `paths`: `{"@/*":["./src/*"]}`

### Styling

- **Tailwind CSS v4** + `@tailwindcss/postcss` (config v `postcss.config.mjs`)
- Globální styles: `src/app/globals.css`
- Žádný Tailwind config file v root (Tailwind v4 auto-detekce)

### Testy

**Žádné frontend unit / integration / e2e testy** — `find crm-frontend -name "*.test.*" -o -name "*.spec.*"` vrací 0 výsledků.

---

## E. Config a env

### `.env*` soubory v repu

| Soubor | Stav |
|--------|------|
| `crm-frontend/.env.example` | ✅ tracked |
| `.env`, `.env.local`, `.env.*.local` | ❌ v repu NEEXISTUJÍ (správně, per `.gitignore`) |

### `.env.example` keys (jen názvy)

Z `crm-frontend/.env.example`:
```
GOOGLE_SERVICE_ACCOUNT_EMAIL
GOOGLE_PRIVATE_KEY
GOOGLE_SPREADSHEET_ID
APPS_SCRIPT_WEB_APP_URL
APPS_SCRIPT_SECRET
ALLOWED_EMAILS
NEXTAUTH_URL
NEXTAUTH_SECRET
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
```

**10 klíčů.**

### `.gitignore` — secrets coverage

- ✅ `.env` pokrytý
- ✅ `.env.local` pokrytý
- ✅ `.env.*.local` pokrytý
- ✅ `!.env.example` (explicit allow)
- ❌ `.clasprc.json` — **NENÍ v `.gitignore`** (typicky žije v `~/`, ale repo-level ochrana chybí)
- ❌ `*.pem`, `*.key` — **NENÍ v `.gitignore`**
- ❌ `credentials.json`, `service-account*.json` — **NENÍ v `.gitignore`**
- ✅ `node_modules/`, `.next/`, build outputs pokryté
- ✅ `.claude/`, `.claude-flow/` pokryté
- ✅ `scripts/scraper/samples/output.live.json` (scraper PII output) pokrytý

### GitHub Actions workflows

Jediný workflow:
- **`.github/workflows/docs-governance.yml`**
  - **Trigger:** `pull_request` branches: `[main]`
  - **Job:** `docs-governance` on ubuntu-latest
  - **Kroky:** checkout → setup-node v20 → `node scripts/docs/build-changelog.mjs` → `node scripts/docs/build-task-registry.mjs` → diff check na generated docs → `node scripts/docs/check-doc-sync.mjs`
  - **Účel:** zajišťuje, že generated files (`docs/11-change-log.md`, `docs/29-task-registry.md`) jsou aktuální a doc-sync prochází

### PR template

- `.github/pull_request_template.md` — existuje

### Pre-commit hooks

- **`.husky/`:** ❌ neexistuje
- **`lefthook.yml`:** ❌ neexistuje
- **`.pre-commit-config.yaml`:** ❌ neexistuje

**Žádné pre-commit hooks nejsou aktivní.**

### Linter / formatter config

- **ESLint:** `crm-frontend/eslint.config.mjs` (flat config, extends `eslint-config-next/core-web-vitals` + `eslint-config-next/typescript`)
- **Prettier:** ❌ žádný `.prettierrc*` config v repu
- **editorconfig:** ❌ `.editorconfig` neexistuje

---

## F. Dokumentace

### READMEs v repu (rekurzivně)

- `./CLAUDE.md` — root instrukce pro Claude Code
- `./CONTRIBUTING.md` — team workflow (branch naming, task record, docs sync)
- `./apps-script/README.md` — Apps Script deployment + struktura
- `./crm-frontend/README.md` — frontend setup
- `./crm-frontend/CLAUDE.md` — frontend-specific instrukce
- `./crm-frontend/AGENTS.md` — frontend agent patterns
- `./scripts/scraper/README.md` — A-04 scraper
- `./.github/pull_request_template.md` — PR šablona

### Další `.md` v `docs/`

- **Top-level governance (18 souborů):** `01-decision-list`, `09-project-control-tower`, `10-documentation-governance`, `11-change-log` (generated), `12-route-and-surface-map`, `13-doc-update-rules`, `14-definition-of-done`, `20-current-state`, `21-business-process`, `22-technical-architecture`, `23-data-model`, `24-automation-workflows`, `25-lead-prioritization`, `26-offer-generation`, `27-infrastructure-storage`, `28-risks-bottlenecks-scaling`, `29-task-registry` (generated), `github-collaboration-setup`
- **Task records (33 souborů v `docs/30-task-records/`):** A1, A2, A3, A4, A5, A6, A7, A8, A9, A10, B1, B2, B3, B4, B5, B6, B-07, BX1, C-04, C-05, C-06, C-07, C-08, C-09, C-10, C-11, C2, C3, C4, CS1, CS2, CS3, `_template`
- **Contracts (4 souborů v `docs/contracts/`):** `dedupe-decision.md`, `normalization-raw-to-leads.md`, `raw-import-staging.md`, `scraping-job-input.md`
- **Archive (19 souborů v `docs/archive/`):** legacy governance, rollout checklists, `CRM-SYSTEM-MAP.md`, atd.
- **Audits (18 souborů v `docs/audits/`):** tato audit struktura (Fáze 0 + vyplňované fáze)

### `.md` count per dir

| Path | Count |
|------|-------|
| `docs/30-task-records/` | 33 (incl. `_template.md`) |
| `docs/archive/` | 19 |
| `docs/` (top-level) | 18 |
| `docs/audits/domains/` | 9 |
| `docs/audits/` (top-level) | 5 |
| `docs/contracts/` | 4 |
| `docs/audits/cross-check/` | 4 |
| `crm-frontend/` | 3 |
| Repo root | 3 (CLAUDE.md, CONTRIBUTING.md, pull_request_template.md) |
| `scripts/scraper/` | 1 |
| `apps-script/` | 1 |
| `.github/` | 1 |
| **Total** | **101** |

### TODO/FIXME/HACK/XXX komentáře v kódu

Napříč `apps-script/`, `crm-frontend/src/`, `scripts/` (`.gs` + `.ts` + `.tsx` + `.mjs` + `.js`):

| Tag | Count |
|-----|-------|
| TODO | 0 |
| FIXME | 0 |
| HACK | 0 |
| XXX | 0 |

**0 technical-debt komentářů** v celém codebase.

---

## G. Závislosti & bezpečnost (povrchový sken)

### `package.json` soubory

| File | Účel |
|------|------|
| `./package.json` | root monorepo — docs tooling + test harness scripts |
| `./crm-frontend/package.json` | Next.js app |

**Žádný `package.json` v `apps-script/` ani jinde.**

### Root `package.json` scripts

```
docs:build-changelog       node scripts/docs/build-changelog.mjs
docs:build-task-registry   node scripts/docs/build-task-registry.mjs
docs:check                 node scripts/docs/check-doc-sync.mjs
docs:new-task              node scripts/docs/create-task-record.mjs
test:b03                   node --experimental-strip-types --test scripts/tests/template-family.test.ts
test:b04                   node --experimental-strip-types --test scripts/tests/preview-render-endpoint.test.ts
test:b05                   node scripts/test-b05-preview-webhook.mjs
test:b06                   node scripts/test-b06-review-writeback.mjs
```

**Žádný dev/build/start script v root.** Frontend build žije výhradně v `crm-frontend/`.

### Lock files

| File | Commit status |
|------|---------------|
| `./crm-frontend/package-lock.json` | ✅ commitnutý (391 678 bytes) |
| `./package-lock.json` | ✅ commitnutý |
| `yarn.lock`, `pnpm-lock.yaml` | ❌ neexistují |

**Default package manager: npm** (based on lock file type).

### `npm audit --omit=dev` (crm-frontend production deps)

| Severity | Count |
|----------|-------|
| info | 0 |
| low | 0 |
| moderate | 3 |
| **high** | **1** |
| critical | 0 |
| **Total vulnerable packages** | **4** |

**Top vulnerable packages:** `@hono/node-server`, `hono`, `next`, `postcss`

Note: detailed severity breakdown per advisory → **Fáze 7** (dedicated security audit).

### `npm outdated`

Nespuštěno v této fázi — vyžaduje instalovaný `node_modules` a síťový přístup. Odloženo do **Fáze 9 (Buildability)** per runbook pravidlo.

---

## Meta

- **Generated:** 2026-04-24
- **Baseline commit:** `1dfc7e8` (origin/main — post merge B-06 PR #36)
- **Audit branch:** `audit/01-inventory` (based on `audit/00-setup`)
- **Tool versions:**
  - Node: `v24.15.0`
  - npm: `11.12.1`
  - Git: Git for Windows (MINGW64)
- **Scope:** read-only audit, žádné změny v produkčním kódu. Tato fáze nevytvořila žádné findings — pouze dokumentuje faktický stav repa.
