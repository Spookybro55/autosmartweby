# PILOT-OPERATIONS

> **Audience:** Sebastian (operátor + deploy owner) a budoucí dev / ops.
> **Scope:** pilot-grade — krátké akční postupy, ne enterprise runbook.
> **Eskalace:** [s.fridrich@autosmartweb.cz](mailto:s.fridrich@autosmartweb.cz)

---

## 1. Deploy

### Apps Script
```bash
cd apps-script
npx clasp login              # jednou; otevře browser, přihlas se jako owner Google účet
npx clasp push --force       # pushne aktuální .gs do projektu 1SjdUXQc...
```
Po push v Apps Script Console:
1. Otevři projekt: https://script.google.com/u/0/home/projects/1SjdUXQc4i2RzYkRVKldp8q6Z7JtGrsY5TQwaBl4b_93hj8aD4_p-ScrT/edit
2. **Deploy → New deployment → Web app** (Execute as: Me, Access: Anyone) → Deploy.
3. Zkopíruj `Web app URL` (končí `/exec`); pokud se mění, aktualizuj `APPS_SCRIPT_WEB_APP_URL` ve Vercel env vars.
4. Spusť ručně **`installProjectTriggers`** v editoru (instaluje 30-min import + 60-min mailbox + ostatní triggery, idempotentně via FORCE_RECREATE).
5. Pokud měnily se EXTENSION_COLUMNS (např. `assignee_email` v KROKu 5): spusť v Sheet menu **"Autosmartweby CRM → Setup preview extension"** — přidá chybějící sloupce.

### Vercel frontend
```bash
git push origin main          # main branch je production
```
Vercel auto-deploy se spustí. Sleduj Deployments tab; preview na PR větvích vzniká automaticky. Env vars se nesynchronizují z repa — viz [PILOT-ENV-VARS.md](PILOT-ENV-VARS.md) pro inventory.

## 2. Ověření po deployi

Spusť plný [PILOT-SMOKE-TEST.md](PILOT-SMOKE-TEST.md) (15 bodů, ~10 minut). Pokud nemáš čas:

- Login + dashboard se načte se reálnými leady (ne mock 5 fake)
- Otevři lead detail → assignee dropdown nabízí 4 emaily + Nepřiděleno
- Apps Script: Executions log v posledních 24 h bez RED rows

## 3. Rollback

### Apps Script
1. Apps Script Console → **Deploy → Manage deployments**
2. Najdi předchozí "Pilot v0.X" verzi → klikni `…` → **Promote to active**
3. Web app URL zůstává stejné (deployment "verze" se mění); env vars netřeba přepisovat.

### Vercel
1. Vercel Dashboard → Project → Deployments
2. Najdi předchozí ✓ Production deployment → `…` → **Promote to Production**
3. Env vars zůstávají; pokud jsi je měnil, manually revert.

## 4. Logy — kde hledat

| Co | Kde |
|---|---|
| Apps Script execution failures | Apps Script Console → Executions (filter na Status: Failed) |
| Apps Script aswLog_ entries | Sheet `_asw_logs` (struktura: timestamp, level, fn, message) |
| Vercel runtime errors | Vercel Dashboard → Project → Logs (real-time stream) |
| Vercel build errors | Vercel Dashboard → Deployments → klikni deploy → Build Logs |
| Frontend console / network | Browser DevTools (F12) — operátor sdílí screenshot do Slack/email |

## 5. Common issues — troubleshooting (4 bloky)

### A. "Login odmítnut, email mám v ALLOWED_USERS"
1. Ověř `NEXTAUTH_SECRET` nastaven ve Vercel env vars (ne prázdný, min. 32 znaků — KROK 3 fail-fast hodí explicit Error pokud chybí).
2. Ověř `AUTH_PASSWORD` matchuje to, co píšeš (case-sensitive, žádný trailing whitespace v Vercel UI).
3. Ověř, že middleware HMAC verifikace neselhává — Vercel Logs filtr na `auth` errors / `verifyToken returned null`.
4. Pokud `NEXTAUTH_SECRET` ve Vercelu změněn → všechny existující session cookies invalidují → uživatel musí znovu login.

### B. "Frontend ukazuje 5 fake leadů místo reálných"
1. `isMockMode()` vrátil true — minimálně jeden z `GOOGLE_*` env vars chybí. Ve Vercelu zkontroluj všechny tři: `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `GOOGLE_SPREADSHEET_ID` (`mock-service.ts:9-31`).
2. V produkci by měl `mock-service.ts` throw, ne tichý fallback. Pokud throw nevidíš → některý var je technicky set, ale prázdný string. Set explicitně neprázdné hodnoty.
3. GCP project: APIs & Services → Library → "Google Sheets API" musí být **Enabled**.
4. Otevři Sheet `14U9CC0q...` → Share → ověř, že Service Account email má **Viewer** access (KROK 8 AKCE 0).

### C. "Save change failuje s 'Unauthorized'"
1. `APPS_SCRIPT_SECRET` ve Vercelu **musí být IDENTICKÝ** s `FRONTEND_API_SECRET` v Apps Script Script Properties (KROK 1 PILOT-ENV-VARS.md Section D match check). I jeden mismatched znak = 100% Unauthorized.
2. Apps Script Web App musí být deployed s `Who has access: Anyone` (autorizace je přes shared secret v payloadu, ne přes Google Identity).
3. Apps Script Console → Executions → najdi `doPost` failed entry → klikni → uvidíš plnou error message (typicky `Unauthorized` pokud token nesedí).
4. Po rotaci secretů: musí se přepsat v Apps Script Properties **A** Vercel env vars, jinak rozpad.

### D. "Email nedošel, není v Sent items"
1. `review_decision != APPROVE` — KROK 4 sendability gate (FF-006) odmítl. V Sheet zkontroluj sloupec `review_decision` na daném řádku; musí být přesně `APPROVE`.
2. Apps Script Executions: filtr na `assertSendability_` failures — jasná hláška kde k odmítnutí došlo.
3. Pokud `lead.assignee_email` je orphaned (typo, ne v ALLOWED_USERS) → Reply-To padá na fallback `s.fridrich@autosmartweb.cz` (`OutboundEmail.gs:resolveSenderIdentity_`). Email se odešle, ale operator může být zmaten.
4. Apps Script musí mít OAuth scope `gmail.modify` granted při deployi (Web app → Authorize Access). Pokud chybí, `GmailApp.sendEmail` throw `Authorization required`.

## 6. Frequency cheat-sheet

- Apps Script triggery běží sami: 30 min import, 60 min mailbox, 15 min preview/web-check/qualify (instalují se přes `installProjectTriggers`).
- Vercel deploy = každý push do `main`.
- Sheet `_asw_logs` se nepročišťuje automaticky — nech růst, pokud > 10k řádek, ručně archivuj (export jako sheet copy).
