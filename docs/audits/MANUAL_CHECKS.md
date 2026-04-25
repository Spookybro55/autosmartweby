# Manual Checks — co musí ověřit člověk

> Items, které audit nemohl ověřit ze zdrojáků (označené ⚪). Každá fáze sem přesouvá všechny své ⚪ items. Finální konsolidace ve Fázi 12.

---

## Jak používat

Každá položka má:
- **Co ověřit:** konkrétní otázka
- **Kde ověřit:** systém / UI / konzole / dokument
- **Očekávaný výsledek:** co by mělo být
- **Jak zaznamenat:** zpátky do audit dokumentu nebo sem

---

## By role

### Developer checks

| # | Fáze | Co ověřit | Kde | Očekávaný výsledek |
|---|------|-----------|-----|---------------------|
| MC-IN-D-01 | 5 | Že `crm-frontend/.env.example` deklaruje všechny env vars používané v contractu: `APPS_SCRIPT_WEB_APP_URL`, `APPS_SCRIPT_SECRET`, `PREVIEW_WEBHOOK_SECRET`, `PUBLIC_BASE_URL`, `NEXTAUTH_SECRET`, `AUTH_PASSWORD`, `ALLOWED_EMAILS`, `GOOGLE_SPREADSHEET_ID`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`. Audit nemá read access do tohoto souboru (sandbox-blocked). | `crm-frontend/.env.example` (manuálně otevřít) | Všechny env vars deklarované s placeholdery. Pokud chybí, finding pro Phase 10 DOC. |
| MC-IN-D-02 | 5 | Aktuální deployed verzi Apps Script Web App (HEAD vs explicit deployment) a zda matchuje obsah `apps-script/WebAppEndpoint.gs` na main. | Apps Script Console → Deploy → Manage deployments | Deployed version vrací stejný kód jako main. Pokud HEAD-only deployment, je drift mezi main a runtime možný. |
| MC-IN-D-03 | 5 | Zda je `apps-script-endpoint.gs.example` reference dokument nebo zapomenutý draft. | Git history `git log -- crm-frontend/src/lib/google/apps-script-endpoint.gs.example` | Pokud se nemodifikoval po vzniku reálného `WebAppEndpoint.gs`, je to dead reference (cross-ref IN-001). |
| MC-IN-D-04 | 5 | Že hook `useLeadUpdate` byl skutečně zamýšlen jako alternativa k drawer fetch (vs dead code). | `git log -- crm-frontend/src/hooks/use-lead-update.ts` + původní task record | Buď byl plánován pro budoucí page, nebo je to remnant z refactoru → owner rozhodne (cross-ref IN-004). |
| MC-IN-D-05 | 5 | In-memory preview store chování na Vercel serverless: cold start frequency, kolik preview URLs se "ztratí" za týden. | Vercel logs, observed 404 rate na `/preview/<slug>` | Definovat acceptable threshold; pokud > 1% requestů 404, eskalovat (cross-ref IN-014). |
| MC-DP-D-01 | 6 | Obsah `crm-frontend/.env.example` (audit nemá read access — sandbox-blocked). Cross-check vůči seznamu env vars použitým v kódu (viz Phase 6 audit, sekce D.18). | `crm-frontend/.env.example` (manuálně otevřít) | Měl by obsahovat: `GOOGLE_SPREADSHEET_ID`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `APPS_SCRIPT_WEB_APP_URL`, `APPS_SCRIPT_SECRET`, `PREVIEW_WEBHOOK_SECRET`, `PUBLIC_BASE_URL`, `NEXTAUTH_SECRET`, `AUTH_PASSWORD`, `ALLOWED_EMAILS`. Pokud chybí, finding pro Phase 10. |
| MC-DP-D-02 | 6 | Existuje `vercel.json` v root frontendu na Vercel platformě (nikoli v repu)? Pokud ano, jaké jsou settings? | Vercel Dashboard → Project → Settings → Build & Development | Pokud production branch ≠ `main`, nebo build cmd ≠ `npm run build`, eskalovat. |
| MC-DP-D-03 | 6 | Žádný `clasp deploy` v `clasp-deploy.sh` — Apps Script Web App vždy servíruje HEAD. Existuje custom rollback skript v týmu, který audit nezná? | Tým interview / interní wiki | Pokud chybí, oprávněně vznikne `docs/ROLLBACK.md` (DP-018). |
| MC-DP-D-04 | 6 | Aktuální deployed verze Apps Script v PROD vs HEAD `apps-script/` na main. | Apps Script Console → Deploy → Manage deployments → "Latest deployment" timestamp + manifest file IDs | Drift indikuje, že někdo zapomněl `clasp push` po merge. Critical pokud > 7 dní. |

### Ops checks

| # | Fáze | Co ověřit | Kde | Očekávaný výsledek |
|---|------|-----------|-----|---------------------|
| MC-IN-O-01 | 5 | Že Script Properties v PROD obsahují `FRONTEND_API_SECRET` a hodnota matchuje Vercel `APPS_SCRIPT_SECRET`. | Apps Script Console → Project Settings → Script Properties; Vercel Dashboard → Settings → Env Variables | Hodnoty identické. Pokud ne, `updateLead` v PROD vrací `Unauthorized` 100% případů. |
| MC-IN-O-02 | 5 | Že Script Properties v PROD obsahují `WEBHOOK_URL` ukazující na PROD frontend a `PREVIEW_WEBHOOK_SECRET` matchuje Vercel `PREVIEW_WEBHOOK_SECRET`. | Apps Script Console → Script Properties; Vercel Env Variables | Hodnoty matchují, URL je https a non-localhost. |
| MC-IN-O-03 | 5 | Existuje runbook pro rotaci `FRONTEND_API_SECRET` a `PREVIEW_WEBHOOK_SECRET`? Je popsán overlap window pro zero-downtime rotaci? | `docs/`, případně interní wiki | Pokud chybí, finding pro Phase 10. Bez overlap = downtime per rotace. |
| MC-IN-O-04 | 5 | Latency p50/p95 pro FE→GAS `updateLead` round-trip pod běžnou zátěží. | Apps Script Console → Executions; Vercel Analytics; nebo manuální test (5-10 calls) | p50 < 2 s, p95 < 5 s. Pokud p95 > 10 s, cross-ref IN-009 (timeout). |
| MC-IN-O-05 | 5 | Frequency `Could not acquire lock` chyb v Apps Script logs (lock contention). | Apps Script Console → Executions → filter `Could not acquire lock` | < 1% volání. Pokud výše, je třeba zvýšit `tryLock` timeout nebo decompose write path. |
| MC-IN-O-06 | 5 | Frequency 502 odpovědí z `/api/leads/[id]/update`. | Vercel Logs / Analytics | < 0.5% per den. Vyšší = systemic backend chyba (`Lead not found`, identity mismatch). |
| MC-DP-O-01 | 6 | Hosting platforma frontendu (Vercel? jiná?), production branch, environment variables, kdo má deploy access. | Hosting provider Dashboard (předp. Vercel) → Project → Settings | Production branch = `main`, env vars match seznam z DP-016, deploy access omezený na owner + 1-2 ops. |
| MC-DP-O-02 | 6 | GitHub Actions secrets scope (Environment vs Repository) — pokud existují. | `gh api repos/Spookybro55/autosmartweby/actions/secrets` (jako repo admin) | Aktuálně docs-governance žádné secrets nepoužívá, takže prázdný list = OK. Pokud secrets existují bez Environment-level protection, dokumentovat v Phase 7. |
| MC-DP-O-03 | 6 | Owner/editor seznamy obou Apps Script projektů (TEST `1Sjd…`, PROD `1fnL…`) — kdo může spustit `clasp push` (= deploynout). | Apps Script Console → Project → Share | TEST: tým + ops. PROD: pouze 1-2 lidi. Žádný "anyone with link can edit" setting. |
| MC-DP-O-04 | 6 | Existence interní rotation runbooku pro shared secrets (mimo repo per DP-019). | 1Password / Bitwarden / interní wiki | Buď doloženo, nebo vytvořit (cross-ref DP-019). |
| MC-DP-O-05 | 6 | Last `clasp push` timestamp do PROD — kdy reálně proběhl poslední deploy. | Apps Script Console → Project → Apps Script Editor → File metadata | Pokud > 30 dní od poslední změny `apps-script/*.gs` v main, asi drift. |
| MC-DP-O-06 | 6 | Existuje Vercel preview deployment per PR? Jsou env vars per-environment (production vs preview)? | Vercel Dashboard → Project → Deployments | Preview = ON; preview env vars = subset bez production secrets. |
| MC-DP-O-07 | 6 | Pokud někdo nastavil `ASW_ENV=PROD` v TEST Apps Script projektu (špatná konfigurace), `envGuard_()` by měl odhalit drift. Verify Script Properties v obou projektech. | Apps Script Console → Project Settings → Script Properties (pro oba projekty) | TEST: `ASW_ENV=TEST`, `ASW_SPREADSHEET_ID=14U9…`. PROD: `ASW_ENV=PROD`, `ASW_SPREADSHEET_ID=1RBc…`. Manuálně spustit `diagEnvConfig` v každém. |

### Product / business checks

| # | Fáze | Co ověřit | Kde | Očekávaný výsledek |
|---|------|-----------|-----|---------------------|
| MC-IN-P-01 | 5 | Že operátoři skutečně vidí strukturované error messages při neúspěšném save (vs jen "Chyba při ukládání"). | Manual UI test: vyvolat 502 (např. token mismatch) a zkontrolovat toast | Aktuálně FAIL — toast je generický (cross-ref IN-006). Otázka: má product owner tolerance, nebo chce P1 fix? |
| MC-IN-P-02 | 5 | Že u Czech operators je akceptovatelné vidět anglické error messages (`Unauthorized`, `Lead not found`). | UAT s reálným operátorem | Pokud "ne" → IN-011 eskalovat na P1. |

### Security checks

| # | Fáze | Co ověřit | Kde | Očekávaný výsledek |
|---|------|-----------|-----|---------------------|
| MC-IN-S-01 | 5 | Sheet `1RBc…` (44-char ID, prvních 4 znaků `1RBc`) — bylo veřejně exposnuto v Git history? Pokud ano, zhodnotit migraci. | `git log -p apps-script/Config.gs` + threat model review | Sheet IDs nejsou tajné per se, ale + sharing settings = potenciální attack surface. Cross-ref IN-016 a Phase 7. |
| MC-IN-S-02 | 5 | Apps Script Web App access level: `Anyone` (nutné pro shared-secret auth bez Google account). Není veřejně exposnutá URL bez secrets v query? | Apps Script Console → Deploy → Manage deployments → Access | Access = "Anyone (with link)". URL je secret + token check ji chrání. Pokud `Anyone with Google account` jen, secret check stále funguje. |
| MC-IN-S-03 | 5 | Vercel logs neobsahují `payload.token` v plaintextu (např. nelogovat celé request body). | Vercel Logs search pro `token` | Žádné výskyty `APPS_SCRIPT_SECRET` value. Stejně Apps Script `aswLog_` nelogovat full payload. |
| MC-IN-S-04 | 5 | Existuje rate limiting na Apps Script Web App nebo na FE proxy `/api/leads/[id]/update`? | Apps Script Console (žádné built-in), Vercel (Edge Middleware?) | Žádný rate limit zjištěn z kódu. Je to akceptovatelné riziko? Cross-ref Phase 7. |
| MC-DP-S-01 | 6 | Sheet IDs `1RBc…` (PROD), `14U9…` (TEST) — public exposure scope v Git history. | `git log -p` (jen indikace, ne celý dump) + threat-model review | Sheet IDs nejsou per se secret, ale + sharing settings = potenciální data exposure. Cross-ref DP-001, DP-002, IN-016 a Phase 7. |
| MC-DP-S-02 | 6 | Apps Script Web App access level pro PROD (`appsscript.json:13` `"access": "ANYONE_ANONYMOUS"`). | Apps Script Console → Deploy → Manage deployments | `ANYONE_ANONYMOUS` je nutné pro `executeAs: USER_DEPLOYING` + shared-secret model. Verifikovat, že URL je dostatečně dlouhá / unguessable a nikde public exposed. |
| MC-DP-S-03 | 6 | `enforce_admins: false` na main protection — kdo má admin rights na repu, kdo by mohl bypassovat? | GitHub repo settings → Manage access → Roles | Ideálně 1-2 admins, MFA enforced. Pokud > 3 admins, eskalovat. |

---

## Kontexty bez přístupu z auditu (anticipated)

Audit nemá přístup k následujícím systémům a proto sem v průběhu fází přidá relevantní otázky:

- **Live Apps Script Console** — triggery v cloudu, execution history, Script Properties
- **Live Google Sheets** — reálný obsah LEADS, Ke kontaktování, _raw_import
- **Produkční env variables** — hodnoty v Vercel / hosting provider
- **GCP / Google Workspace admin** — OAuth apps, service accounts, quotas
- **Penetrační testování** — aktivní security testing
- **Load / stress testing** — reálné chování pod zátěží
- **Compliance audit** — GDPR právní review
- **CI secrets** — GitHub Actions secret values
