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

_(vyplňuje se postupně jak fáze běží)_

| # | Fáze | Co ověřit | Kde | Očekávaný výsledek |
|---|------|-----------|-----|---------------------|
| D1 | 3 | Skutečný stav triggerů v PROD Apps Script (počet, handler names, last run, next run) | Apps Script editor → Triggers (PROD scriptId) | 5 triggerů: processPreviewQueue, autoWebCheckTrigger, autoQualifyTrigger (CLOCK 15min); onOpen (ON_OPEN); onContactSheetEdit (ON_EDIT). Žádné obsolete. |
| D2 | 3 | Execution time distribution `processPreviewQueue` posledních 7 dní | Apps Script → Executions → filter `processPreviewQueue` | Průměr < 3 min, žádný > 6 min timeout error |
| D3 | 3 | Stackdriver error rate 7/30 dní | Apps Script → Executions → Failed | Baseline < 1% per trigger |

### Ops checks

_(vyplňuje se postupně)_

| # | Fáze | Co ověřit | Kde | Očekávaný výsledek |
|---|------|-----------|-----|---------------------|
| O1 | 3 | Skutečné hodnoty Script Properties v PROD | Apps Script editor → Project Settings → Script Properties (PROD) | ASW_ENV=PROD; ASW_SPREADSHEET_ID=správné PROD ID; PREVIEW_WEBHOOK_SECRET set; SERPER_API_KEY set; FRONTEND_API_SECRET set |
| O2 | 3 | WebApp deployment URL + version vs git main HEAD | Apps Script → Deployments → Web App | Deployment version matches latest main merge; URL shared with frontend |
| O3 | 3 | Gmail send quota spend (denní, posledních 30 dní) | Apps Script → Quotas → Email quota | < 10% of 100/den limit |
| O4 | 3 | Editor access list Apps Script projektu | Apps Script editor → Project sharing | Minimum needed (1-3 team members s Editor role) |

### Product / business checks

_(vyplňuje se postupně)_

| # | Fáze | Co ověřit | Kde | Očekávaný výsledek |
|---|------|-----------|-----|---------------------|

### Security checks

_(vyplňuje se postupně)_

| # | Fáze | Co ověřit | Kde | Očekávaný výsledek |
|---|------|-----------|-----|---------------------|
| S1 | 3 | `.clasp.json.prod` stav v PROD (obsahuje-li scriptId committed v git) | local clone + git ls-files | `apps-script/.clasp.json.prod` NE v `.gitignore`, scriptId shodný s blob `9b96ff52` → rotate scriptId nebo extract to env |
| S2 | 3 | Rotace `FRONTEND_API_SECRET` po poslední incidentu / nikdy | Script Properties + team channel / changelog | Rotation history existuje; poslední rotation < 90 dní |
| S3 | 3 | Rotace `SERPER_API_KEY` po poslední incidentu / nikdy | Script Properties + Serper.dev dashboard | Rotation history existuje; usage baseline normal |

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
