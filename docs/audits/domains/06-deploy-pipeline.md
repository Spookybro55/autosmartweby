# Fáze 6 — Deploy Pipeline Audit

> **Cíl:** Zjistit, jestli z GitHub repa jde deterministicky nasadit do TEST a PROD. A jestli je TEST bezpečně oddělený od PROD.
> **Scope:** `.clasp.json`, `appsscript.json`, GitHub Actions workflows, deploy scripts, deploy docs, Vercel, env vars, branch protection.
> **Baseline:** `origin/main` @ `69acc78` (po merge PR #43 — Phase 5 audit).
> **Audit datum:** 2026-04-25
> **Mód:** AUDIT-ONLY — žádné změny produkčního kódu, žádný deploy, žádný `clasp push`.

---

## A. Clasp setup

### 1. Kolik `.clasp.json` v repu a kde?

| Soubor | Obsah | Účel |
|--------|-------|------|
| `apps-script/.clasp.json` | scriptId (TEST, prvních 4 znaky `1Sjd`, 58 chars), parentId (TEST sheet, prvních 4 znaky `13fy`, 44 chars), `scriptExtensions: [".gs", ".js"]` | aktivní config — defaultně ukazuje na TEST |
| `apps-script/.clasp.json.prod` | scriptId (PROD, prvních 4 znaky `1fnL`, 58 chars), žádný parentId, `scriptExtensions: [".js", ".gs"]` | PROD šablona, načítá ji `clasp-deploy.sh prod` |

Oba soubory jsou **trackovány Gitem** (`git ls-files` potvrzuje). Hodnoty redagovány do prvních 4 znaků dle pravidel auditu — viz **DP-002**.

### 2. Přepínání TEST vs PROD

- **Ne env var, ne symlink, ne branch.** Mechanismus je **swap** v `scripts/clasp-deploy.sh:74-87`:
  1. `cp .clasp.json .clasp.json.bak`
  2. `cp .clasp.json.prod .clasp.json`
  3. `clasp push`
  4. `cp .clasp.json.bak .clasp.json`
  5. `rm .clasp.json.bak`
- Mezi krokem 2 a 4 je `.clasp.json` (working file) **přepsaný na PROD config**. Pokud shell padne mezi 2 a 4 (Ctrl+C, kill, panic), `.clasp.json` zůstane v PROD stavu — viz **DP-003**.

### 3. Ochrana proti omylem pushnutí do PROD

`scripts/clasp-deploy.sh:51-72` má 3 layery:

1. `git rev-parse --abbrev-ref HEAD` musí vrátit `main` (`:51-56`). ✅
2. `git diff --quiet HEAD` — žádné uncommitted changes (`:59-62`). ✅
3. Interaktivní prompt `Type 'DEPLOY PROD' to confirm` (`:68-72`). ✅ unikátní string, ne jen `y/N`.

Co **chybí**:
- Žádná ověření, že lokální `main` je aktuální vůči `origin/main` (`git fetch` + porovnání). Lokální main může být týden stará.
- Žádná verifikace, že právě HEAD prošel docs-governance CI checkem (PR merged, ne push --force).
- Žádný audit log — kdo, kdy, jaký commit deployl. Mimo Apps Script Console.

### 4. `.clasprc.json` v `.gitignore`?

❌ **NE.** `.gitignore` (root) hlídá `.env*` (kromě `.env.example`), ale **neobsahuje** `.clasprc.json`, `.clasprc`, ani jakákoli OAuth credentials patterns. Viz **DP-006**.

`clasp` ukládá auth token defaultně do `~/.clasprc.json`, ale CLI také akceptuje per-project `.clasprc.json` v cwd. Pokud user spustí `clasp login` z `apps-script/`, token tam zůstane a může být `git add`-nutý.

### 5. `.claspignore` — co se nepushuje

❌ **Neexistuje** — ani `apps-script/.claspignore`, ani v rootu. Default clasp behavior:
- Pushuje vše matchující `scriptExtensions` (`.gs`, `.js`) a `htmlExtensions` (`.html`) a `jsonExtensions` (`.json`).
- **Nezahrnuje** `.md` soubory (README.md tedy nepushuje).
- **Ale**: jakýkoli budoucí `.json` v `apps-script/` (např. omylem zkopírovaný service-account JSON) by se pushnul. Viz **DP-007**.

`apps-script/appsscript.json` je nutný (manifest) → musí být v projektu. ✅
`apps-script/.clasp.json.prod` má extension `.json` ale clasp ji **nezahrne** protože filtruje `.clasp.json` patterny. Empirically OK, ale bez `.claspignore` je to jen z konvence clasp CLI.

---

## B. Apps Script deploy flow

### 6. Deploy do TEST — postup

1. Developer udělá změny v `apps-script/*.gs`.
2. Commit + PR + merge do `main` (mandatorní per `CLAUDE.md`).
3. Někdo (kdokoli s clasp credentials a Sheet edit access) lokálně spustí:
   ```bash
   ./scripts/clasp-deploy.sh test
   ```
4. Skript volá `clasp push` v `apps-script/` adresáři. `.clasp.json` je defaultně TEST → pushuje do TEST projektu. Žádný confirmation prompt.
5. Žádné `clasp deploy` — pushuje se jen HEAD verze. Neukládá se snapshot.

Riziko: skript **nevynucuje merged-to-main**. Spuštění z feature branche **ho nezablokuje** pro TEST (jen PROD má `branch=main` check). Tj. lze pushnout neovařenou WIP verzi do TEST runtime → drift mezi `origin/main` a TEST runtime.

### 7. Deploy do PROD — postup

1. Stejný source code workflow (PR → main).
2. Lokálně spustit:
   ```bash
   ./scripts/clasp-deploy.sh prod
   ```
3. Skript ověří:
   - `branch == main`
   - žádné uncommitted changes (`git diff --quiet HEAD`)
4. Interaktivní prompt: `Type 'DEPLOY PROD' to confirm:`
5. Swap `.clasp.json` ↔ `.clasp.json.prod`, `clasp push`, restore.
6. Žádný `clasp deploy` — opět jen HEAD.
7. **Žádný post-deploy verification** (smoke test, log check).

### 8. Kdo může deploynout do PROD?

Prakticky každý, kdo má:
- Clone repa
- `clasp login` (Google OAuth scope `script.projects` na PROD project)
- Svolení od owner Apps Script projektu

Žádné **PR-based gate**, žádný **GitHub-side audit log**, žádný **2-person rule**. Skript běží lokálně. Owner Apps Script projektu může v Google Workspace admin nastavit, kdo může editovat — ale to je out-of-band a out-of-repo. → MANUAL_CHECK.

### 9. `clasp push` vs `clasp deploy` (verze)

- Skript volá pouze `clasp push` (`clasp-deploy.sh:41,82`).
- **Nikdy** se nevolá `clasp deploy` ani `clasp version`.
- Tj. PROD Web App je vždy "HEAD" — webapp URL servíruje aktuální HEAD source.
- Bonus risk: `executeAs: USER_DEPLOYING` v `appsscript.json:13` znamená, že běží pod identitou toho, kdo ten Web App deployoval naposled. Pokud se to liší od triggers owner, dojde k konfliktům scope-grants. → MANUAL_CHECK.

### 10. Rollback strategie

Není dokumentovaná. Implicitně:
- Detekce vady → `git revert <commit>` v main → `clasp-deploy.sh prod`.
- Zhruba 2-3 minuty TTR za předpokladu, že rollback commit proleze docs-governance + reviewer.
- **Pokud problém je v deploys-only změně** (např. `appsscript.json` scope), revert + push.
- **Bez `clasp deploy` verzí** nelze pinnout starou verzi instantně — musí se restorovat ze sourcu.

Viz **DP-008**.

---

## C. CI/CD

### 11. GitHub Action pro clasp push?

❌ **Žádná.** Jediný workflow je `.github/workflows/docs-governance.yml`:
- Trigger: `pull_request: branches: [main]`
- Jobs: `docs-governance`
- Steps: setup-node, build-changelog, build-task-registry, verify generated files up-to-date, check-doc-sync.

Žádný workflow pro:
- ❌ TypeScript check (`tsc --noEmit`)
- ❌ ESLint
- ❌ Frontend `npm run build`
- ❌ Frontend tests
- ❌ Backend tests (`test:b03`–`test:b06` ze `package.json:11-14`)
- ❌ Apps Script clasp push
- ❌ Vercel deploy

Viz **DP-005** (CI gates), **DP-011** (testy se nespouští).

### 12. Auth clasp v CI (refresh token v secrets?)

N/A — clasp v CI neběží.

### 13. GH secrets scope (Environment vs Repository)

`gh api repos/Spookybro55/autosmartweby/actions/secrets` audit nemá oprávnění → MANUAL_CHECK. Ze zdrojáků: žádné `${{ secrets.* }}` v `docs-governance.yml`, takže docs-governance žádné secrets nepoužívá.

### 14. Separate workflow TEST vs PROD, required reviewers

N/A — neexistuje. Ale **branch protection** na `main` (z `gh api repos/.../branches/main/protection`):

| Setting | Hodnota |
|---------|---------|
| `required_status_checks.contexts` | `["docs-governance"]` |
| `required_pull_request_reviews.required_approving_review_count` | `1` |
| `dismiss_stale_reviews` | `true` ✅ |
| `require_last_push_approval` | `false` ⚠️ → **DP-020** |
| `enforce_admins` | `false` ⚠️ → **DP-010** |
| `required_signatures` | `false` (no GPG) |
| `allow_force_pushes` | `false` ✅ |
| `allow_deletions` | `false` ✅ |
| `required_linear_history` | `false` |

---

## D. Frontend deploy

### 15. Kam deployuje (Vercel / self-hosted / jiné)?

⚪ **Z repa nelze určit.** Žádný `vercel.json`, žádný `.vercel/` directory, žádný `Dockerfile`, žádný GitHub Action s deploy stepem. Existence Vercel deploy je **silně implikovaná**:

- Env var `PUBLIC_BASE_URL` (`crm-frontend/src/app/api/preview/render/route.ts:56`) — typický Vercel `process.env.VERCEL_URL` substitute.
- Komentář v B-04: "Vercel" výslovně zmíněna v Phase 5 audit drafted finding (`docs/audits/domains/05-integration.md`).
- `next.config.ts` je prázdný (`crm-frontend/next.config.ts:3-7`) → naznačuje hosting platforma defaultní (Vercel).

→ MANUAL_CHECK pro skutečnou platformu, branch který deployuje, env vars set, kdo má přístup. Viz **DP-009**.

### 16. Automatic from git push? Which branch?

⚪ Stejně, mimo repo. Implicitně Vercel default = production deploy z `main`, preview deploys z PR branches.

### 17. Preview deployments pro PR

⚪ Vercel PR Preview se aktivuje automaticky, ale audit nemůže ověřit. → MANUAL_CHECK.

### 18. Env variables dokumentovaný seznam

Audit **nemá read access** do `crm-frontend/.env.example` (sandbox-blocked). Viz **MC-DP-D-01**.

Z repa lze vyčíst všechny env vars použité v kódu:

| Env var | Použito v | Účel |
|---------|-----------|------|
| `GOOGLE_SPREADSHEET_ID` | `crm-frontend/src/lib/config.ts:2` | Sheets read target |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | `…/sheets-reader.ts:13` | service account auth |
| `GOOGLE_PRIVATE_KEY` | `…/sheets-reader.ts:14` | service account key |
| `APPS_SCRIPT_WEB_APP_URL` | `…/config.ts:7` | URL pro write-back |
| `APPS_SCRIPT_SECRET` | `…/google/apps-script-writer.ts:56` | shared secret pro write-back |
| `PREVIEW_WEBHOOK_SECRET` | `…/api/preview/render/route.ts:62` | shared secret webhook receiver |
| `PUBLIC_BASE_URL` | `…/api/preview/render/route.ts:56` | base pro preview URLs |
| `NEXTAUTH_SECRET` | `…/api/auth/login/route.ts:7`, `middleware.ts:4` | HMAC session signing |
| `AUTH_PASSWORD` | `…/api/auth/login/route.ts:6` | shared login password |
| `ALLOWED_EMAILS` | `…/api/auth/login/route.ts:5`, `…/config.ts:75` | login allowlist |
| `MOCK_MODE` (implicit) | `…/lib/mock/mock-service.ts` | dev mock toggle |

Cross-check vůči `crm-frontend/README.md:25-31`:

| Env var | V README? |
|---------|-----------|
| `GOOGLE_SPREADSHEET_ID` | ✅ |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | ✅ |
| `GOOGLE_PRIVATE_KEY` | ✅ |
| `APPS_SCRIPT_WEB_APP_URL` | ✅ |
| `NEXTAUTH_SECRET` | ✅ |
| `AUTH_PASSWORD` | ✅ |
| `ALLOWED_EMAILS` | ✅ |
| `APPS_SCRIPT_SECRET` | ❌ chybí |
| `PREVIEW_WEBHOOK_SECRET` | ❌ chybí |
| `PUBLIC_BASE_URL` | ❌ chybí |

Cross-check vůči `docs/27-infrastructure-storage.md:30-39`:

| Env var | V doc/27? |
|---------|-----------|
| `GOOGLE_SPREADSHEET_ID` | ✅ |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | ✅ |
| `GOOGLE_PRIVATE_KEY` | ✅ |
| `APPS_SCRIPT_WEB_APP_URL` | ✅ |
| `NEXTAUTH_SECRET` | ✅ |
| `AUTH_PASSWORD` | ✅ |
| `ALLOWED_EMAILS` | ✅ |
| `APPS_SCRIPT_SECRET` | ✅ |
| `PREVIEW_WEBHOOK_SECRET` | ❌ chybí |
| `PUBLIC_BASE_URL` | ❌ chybí |
| `NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID` | ✅ uveden, ale **nepoužitý v aktuálním kódu** (grep crm-frontend/src nenajde) |
| `GOOGLE_OAUTH_CLIENT_ID` | ✅ uveden, ale **nepoužitý v aktuálním kódu** |

→ **DP-016** — `crm-frontend/README.md` neobsahuje 3 env vars.
→ **DP-014** — `docs/27` chybí 2, navíc obsahuje 2 zombie env vars (Google OAuth — vypadá jako budoucí auth feature, ale ne v současném kódu).

### 19. Secrets rotation

Žádný runbook v repu. Žádný script `rotate-secrets.sh`. Viz **DP-019**.

---

## E. Deployment konzistence

### 20. Frontend ↔ backend inconsistency detection

Žádná. Pokud někdo nasadí Apps Script s novou verzí kontraktu (např. nový allowed field `assigned_to`) ale zapomene FE deploynout (nebo opačně), dojde k drift:

- FE → GAS s neznámým fieldem → backend vrátí `'Disallowed field: assigned_to'` → FE 502.
- GAS → FE webhook s novým payload polem → FE validátor `validateRenderRequest` ho zatím akceptuje (kontroluje jen required fields), ale chybí typed handling.

Žádný `/api/health` endpoint, žádný backend version endpoint. → cross-ref **IN-017** (Phase 5).

### 21. Version stamp v backendu

Pouze pro preview render: `PREVIEW_VERSION = 'b04-mvp-1'` v `…/preview/render/route.ts:32`. Apps Script ho ukládá do `preview_version` sloupce v LEADS po každém webhook callu.

Pro `updateLead` kontrakt: žádná verze (cross-ref **IN-017**).

Pro celkový backend: žádný "deployed at" timestamp ani build hash zveřejněný.

Viz **DP-017**.

---

## F. Dokumentace

### 22. DEPLOY.md / README sekce

❌ **Neexistuje root `DEPLOY.md`** ani `RELEASE.md`. Deploy info rozprostřeno mezi:

- `apps-script/README.md:145-155` — deploy sekce
- `crm-frontend/README.md:5-39` — pouze setup pro local dev
- `docs/27-infrastructure-storage.md:50-59` — Deployment postup
- `docs/22-technical-architecture.md:49-53` — Deployment

### 23. Dokumentace vs realita

#### `apps-script/README.md` (drift)

| Doc tvrdí | Realita | Severity |
|-----------|---------|----------|
| `apps-script/README.md:148-150`: "Pro deploy do produkce: rucne zkopirovat soubory do Apps Script editoru" | `scripts/clasp-deploy.sh prod` swap-deploy automatizuje | **DP-012** |
| `apps-script/README.md:151`: "NIKDY nemenit parentId na produkcni ID bez vedomi vlastnika" | `clasp-deploy.sh prod` přechodně **přepisuje** `.clasp.json` na PROD config (řádky 77-78) | **DP-012** |
| `apps-script/README.md:38-44`: soubory `Code.gs`, `Qualify.gs`, `Preview.gs`, `Pipeline.gs` | reálné soubory: `Menu.gs`, `AutoQualifyHook.gs`, `PreviewPipeline.gs`, etc. — žádný z 4 zmíněných nexistuje | **DP-013** |
| `apps-script/README.md:46-59`: "28 new columns appended" | `Config.gs:68-125` `EXTENSION_COLUMNS` má **55+ položek** (po B-06 review fields) | **DP-013** |
| `apps-script/README.md:65-73`: setup steps "create files (click + → Script)" | reálný flow přes clasp pull/push, viz `clasp-deploy.sh` | **DP-013** |

#### `docs/27-infrastructure-storage.md` (drift)

| Doc tvrdí | Realita | Severity |
|-----------|---------|----------|
| `:16` "Frontend Next.js (lokalne) Lokalni dev" | env vars (PUBLIC_BASE_URL apod.), webhook URL z GAS, atd. implikují Vercel hosting | **DP-014** |
| `:17` "Auth: HMAC session + Google OAuth — Implementovano (OAuth ceka na .env)" | OAuth v aktuálním kódu **nenalezen** (grep `OAUTH_CLIENT_ID` v `crm-frontend/src` = 0 hits) | **DP-014** |
| `:19` "Source code | Git (lokalni) | Lokalni, GitHub pending" | repo je na GitHub jako Spookybro55/autosmartweby | **DP-014** |
| `:47` "Zadny hosting pro frontend" | Vercel deploy implikováno | **DP-014** |
| `:48` "Zadny CI/CD" | `.github/workflows/docs-governance.yml` exists, branch protection vyžaduje docs-governance check | **DP-014** |
| `:59` "Frontend Zatim jen lokalni vyvoj (npm run dev). Zadny hosting." | viz výše | **DP-014** |
| Last update: `2026-04-05` | dnes 2026-04-25 → 20 dní stará. Mezitím B-06, B-07, B-08 work, audit framework, atd. | **DP-014** |

#### `docs/22-technical-architecture.md` (drift)

| Doc tvrdí | Realita | Severity |
|-----------|---------|----------|
| `:46` "Zadny CI/CD, zadne testy" | docs-governance + 4 test scripts v root package.json | **DP-015** |
| `:47` "Frontend bezi lokalne" | Vercel implikováno | **DP-015** |
| `:52-53` "Frontend: zatim jen npm run dev (lokalne). Zadny hosting nakonfigurovan" | viz výše | **DP-015** |

#### `crm-frontend/README.md` (drift)

| Doc tvrdí | Realita | Severity |
|-----------|---------|----------|
| `:5-9` Prerequisites + `:11-39` Setup → cílí pouze na local dev | žádná deploy sekce, ale runtime používá Vercel-style env vars | **DP-016** |
| Env list `:25-31` | chybí `APPS_SCRIPT_SECRET`, `PREVIEW_WEBHOOK_SECRET`, `PUBLIC_BASE_URL` | **DP-016** |
| `:60` "use-leads, use-lead-detail, use-lead-update, use-dashboard-stats" | `use-lead-update` je definovaný ale neimportovaný (viz IN-004) | **DP-016** |
| `:91` odkazuje na `docs/CRM-SYSTEM-MAP.md` | dokument je v archivu: `docs/archive/CRM-SYSTEM-MAP.md` | **DP-016** |

---

## G. TEST/PROD data isolation v kódu

### 24. Grep hardcoded Sheet IDs `\b1[A-Za-z0-9_-]{40,}\b`

Provedeno proti celému repu (excl. `node_modules`, `package-lock.json` integrity hashes nejsou Sheet IDs, ale grep je vrací — manuálně odfiltrováno).

#### Tracked (v `git ls-files`):

| Soubor:řádek | Typ | Prvních 4 znaky | Poznámka |
|--------------|-----|-----------------|----------|
| `apps-script/Config.gs:14` | sheet_id (PROD) | `1RBc` | cross-ref **IN-016** |
| `apps-script/EnvConfig.gs:13` | sheet_id (TEST, v komentáři) | `14U9` | docstring příklad |
| `apps-script/EnvConfig.gs:18` | sheet_id (PROD, v komentáři) | `1RBc` | docstring příklad |
| `apps-script/EnvConfig.gs:28` | sheet_id (PROD) | `1RBc` | `ASW_ENVIRONMENTS.PROD.spreadsheetId` literal |
| `apps-script/EnvConfig.gs:33` | sheet_id (TEST) | `14U9` | `ASW_ENVIRONMENTS.TEST.spreadsheetId` literal |
| `apps-script/.clasp.json:2` | script_id (TEST) | `1Sjd` | clasp config |
| `apps-script/.clasp.json:4` | sheet_id parent (TEST) | `13fy` | clasp parentId |
| `apps-script/.clasp.json.prod:2` | script_id (PROD) | `1fnL` | clasp PROD shadow |
| `scripts/tests/preview-render-endpoint.test.ts:56` | sheet_id (PROD) | `1RBc` | **test fixture** |
| `docs/09-project-control-tower.md:66` | sheet_id (PROD) | `1RBc` | tracked doc |
| `docs/20-current-state.md:45` | sheet_id (PROD) | `1RBc` | tracked doc |
| `docs/30-task-records/B6.md:118,179` | sheet_id (TEST) | `14U9` | task record (specifický pro testovou verifikaci) |

#### Archive (read-only references — `docs/archive/*`):

`docs/archive/01-audit-consolidation.md:41` (H-4 finding o stejném tématu z předchozí audit consolidace), `docs/archive/00-project-map.md:49`, `docs/archive/09-project-control-tower.md.updated:67`, `docs/archive/04-git-and-deploy-decisions.md:154,155,159,219,310,313`, `docs/archive/17-writeback-rollout-checklist.md:23`, `docs/archive/CRM-SYSTEM-MAP.md:12,64`. Všechny archive — neměnné per `CLAUDE.md`. Ne-finding samy o sobě, ale rozšiřují plochu citlivého ID v Git history.

### 25. `SpreadsheetApp.openById(...)` call sites — odkud je ID?

| Soubor:řádek | Volání | Odkud ID | Použito přes guard? |
|--------------|--------|----------|---------------------|
| `apps-script/Helpers.gs:openCrmSpreadsheet_` | `SpreadsheetApp.openById(getSpreadsheetId_())` | env-resolved | ✅ |
| `apps-script/PreviewPipeline.gs:976` | `spreadsheet_id: SPREADSHEET_ID` (webhook payload) | **raw constant** | ❌ → **DP-004** |
| `apps-script/PreviewPipeline.gs:1561` | `spreadsheet_id: SPREADSHEET_ID` (pilot webhook) | **raw constant** | ❌ → **DP-004** |
| `apps-script/ContactSheet.gs:991` | log: `'Trigger installed for ' + SPREADSHEET_ID` | raw constant | ❌ (log only — low impact) |

→ Webhook payload obsahuje hardcoded PROD `spreadsheet_id` i v TEST runs. Pokud frontend někdy začne validovat `spreadsheet_id` v `MinimalRenderRequest`, TEST runs budou rejectované nebo poškozené.

### 26. Centralized `Config.js` / `Environment.js`

✅ **Existuje** `apps-script/EnvConfig.gs` (`getEnvConfig_`, `getSpreadsheetId_`, `envGuard_`).

**Pokrytí:**
- `getSpreadsheetId_()` použito v `Helpers.gs:openCrmSpreadsheet_` → ostatní moduly procházejí přes tento helper. ✅
- `envGuard_()` definováno (`EnvConfig.gs:119`), ale **grep volání mimo `diagEnvConfig` ukazuje 0 explicitních volání** v destruktivních cestách. Navíc `envGuard_` se volá pouze ručně přes `diagEnvConfig` (`EnvConfig.gs:194-199`). Není automaticky vyvolán před `processPreviewQueue`, `qualifyAllLeads`, atd. → soft gap (cross-domain s SEC).

---

## Findings (DP-XXX)

_(linkuje do [../FINDINGS.md](../FINDINGS.md))_

| ID | Severity | Stručně |
|----|----------|---------|
| DP-001 | P0 | PROD Sheet ID hardcoded v test fixture `scripts/tests/preview-render-endpoint.test.ts:56` |
| DP-002 | P0 | `.clasp.json` a `.clasp.json.prod` committed s plnými scriptIds + parentId |
| DP-003 | P1 | `clasp-deploy.sh` swap-and-restore není atomic — interrupt zanechá `.clasp.json` na PROD |
| DP-004 | P1 | `PreviewPipeline.gs:976,1561` posílá `SPREADSHEET_ID` (raw PROD const) místo `getSpreadsheetId_()` v webhook payloadu |
| DP-005 | P1 | CI nemá build/lint/typecheck/test gate — pouze docs-governance |
| DP-006 | P1 | `.gitignore` nehlídá `.clasprc.json` (clasp credentials) |
| DP-007 | P2 | Žádný `.claspignore` — clasp implicit defaults rozhodují co se pushuje |
| DP-008 | P2 | `clasp push` HEAD-only (no `clasp deploy` versions) — rollback jen přes git revert + redeploy |
| DP-009 | P1 | Vercel deploy mimo repo (žádný `vercel.json`, žádný GH workflow) — branch, env vars, oprávnění **nelze** ověřit ze zdrojáků |
| DP-010 | P1 | `enforce_admins: false` — admin může bypassnout docs-governance + reviewers |
| DP-011 | P2 | Test scripts `test:b03..b06` v `package.json` se v CI nespouští |
| DP-012 | P2 | `apps-script/README.md:145-155` — deploy sekce stale (manual-copy přístup contradicts `clasp-deploy.sh prod`) |
| DP-013 | P2 | `apps-script/README.md:35-73` — soubory & setup stale (Code.gs/Qualify.gs/Preview.gs/Pipeline.gs neexistují, EXTENSION_COLUMNS count z 28 na 55+) |
| DP-014 | P1 | `docs/27-infrastructure-storage.md` — multi-line drift: tvrdí "Zadny CI/CD", "Zadny hosting", "OAuth ceka na .env"; chybí 2 env vars; obsahuje 2 zombie env vars |
| DP-015 | P2 | `docs/22-technical-architecture.md:46,52,53` — stejný drift jako DP-014 |
| DP-016 | P2 | `crm-frontend/README.md` chybí deploy sekce; env list neúplný (chybí `APPS_SCRIPT_SECRET`, `PREVIEW_WEBHOOK_SECRET`, `PUBLIC_BASE_URL`); odkaz `docs/CRM-SYSTEM-MAP.md` ukazuje na archive |
| DP-017 | P2 | Apps Script nemá globální version stamp / health endpoint pro frontend (pouze `PREVIEW_VERSION` pro webhook) |
| DP-018 | P2 | Žádná dokumentovaná rollback procedura |
| DP-019 | P1 | Žádná dokumentovaná secrets rotation procedura |
| DP-020 | P2 | Branch protection nemá `require_last_push_approval` — re-push po approval bypassuje review |
| DP-021 | P1 | `envGuard_()` definován ale nikdy **automaticky** nevolán před destruktivními operacemi (jen ručně přes `diagEnvConfig`) |

Plný popis findingů v [../FINDINGS.md](../FINDINGS.md).

---

## Co nelze ověřit ze zdrojáků (přesunuto do MANUAL_CHECKS.md)

⚪ Hosting platforma frontendu (Vercel? jiná?), branch který deployuje, env vars set
⚪ GitHub Actions secrets scope (Environment vs Repository)
⚪ Owner Apps Script projektů (kdo má edit access pro PROD a TEST)
⚪ Aktuální deployment HEAD vs main (zda je `clasp push` aktuální)
⚪ Vercel preview deployments (jsou aktivní pro PR?)
⚪ `crm-frontend/.env.example` obsah (sandbox-blocked)
⚪ Existence rotation runbooku v interní wiki / mimo repo
⚪ Kdo může spustit `clasp-deploy.sh prod` (Apps Script projekt access list)
⚪ Last `clasp push` timestamp do PROD (kdy byl reálně poslední deploy)
