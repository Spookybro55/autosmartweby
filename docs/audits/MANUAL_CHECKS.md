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

### Ops checks

| # | Fáze | Co ověřit | Kde | Očekávaný výsledek |
|---|------|-----------|-----|---------------------|
| MC-IN-O-01 | 5 | Že Script Properties v PROD obsahují `FRONTEND_API_SECRET` a hodnota matchuje Vercel `APPS_SCRIPT_SECRET`. | Apps Script Console → Project Settings → Script Properties; Vercel Dashboard → Settings → Env Variables | Hodnoty identické. Pokud ne, `updateLead` v PROD vrací `Unauthorized` 100% případů. |
| MC-IN-O-02 | 5 | Že Script Properties v PROD obsahují `WEBHOOK_URL` ukazující na PROD frontend a `PREVIEW_WEBHOOK_SECRET` matchuje Vercel `PREVIEW_WEBHOOK_SECRET`. | Apps Script Console → Script Properties; Vercel Env Variables | Hodnoty matchují, URL je https a non-localhost. |
| MC-IN-O-03 | 5 | Existuje runbook pro rotaci `FRONTEND_API_SECRET` a `PREVIEW_WEBHOOK_SECRET`? Je popsán overlap window pro zero-downtime rotaci? | `docs/`, případně interní wiki | Pokud chybí, finding pro Phase 10. Bez overlap = downtime per rotace. |
| MC-IN-O-04 | 5 | Latency p50/p95 pro FE→GAS `updateLead` round-trip pod běžnou zátěží. | Apps Script Console → Executions; Vercel Analytics; nebo manuální test (5-10 calls) | p50 < 2 s, p95 < 5 s. Pokud p95 > 10 s, cross-ref IN-009 (timeout). |
| MC-IN-O-05 | 5 | Frequency `Could not acquire lock` chyb v Apps Script logs (lock contention). | Apps Script Console → Executions → filter `Could not acquire lock` | < 1% volání. Pokud výše, je třeba zvýšit `tryLock` timeout nebo decompose write path. |
| MC-IN-O-06 | 5 | Frequency 502 odpovědí z `/api/leads/[id]/update`. | Vercel Logs / Analytics | < 0.5% per den. Vyšší = systemic backend chyba (`Lead not found`, identity mismatch). |

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
