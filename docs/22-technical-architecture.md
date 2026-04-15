# Technical Architecture — Autosmartweby

> **Kanonicky dokument.** Aktualizuje se pri zmene technologie nebo architektury.
> **Posledni aktualizace:** 2026-04-05

---

## Komponenty

| Komponenta | Technologie | Umisteni | Ucel |
|------------|-------------|----------|------|
| CRM backend | Google Apps Script (V8) | apps-script/ | Kvalifikace, pipeline, emaily, write-back |
| CRM frontend | Next.js 16 + React 19 + TS | crm-frontend/ | Dashboard, leads, pipeline, follow-ups |
| Databaze | Google Sheets | externi (SPREADSHEET_ID) | LEADS sheet = source of truth pro runtime data |
| Email | Gmail API (pres GmailApp) | apps-script/ | Draft/send, mailbox sync, labeling |
| Web check | Serper API | apps-script/LegacyWebCheck.gs | Hledani chybejicich webu |
| Nabidky | HTML + Python + Chrome | offers/ | Staticke obchodni nabidky, HTML→PDF konverze |
| Auth | HMAC-SHA256 session + Google OAuth | crm-frontend/ | Timing-safe, dual-mode |
| Preview renderer | Next.js App Router (server components) | crm-frontend/src/app/preview/ | MVP landing page z sample briefu, verejny bez auth |
| Deployment AS | clasp | apps-script/.clasp.json | TEST env default, PROD manualne |

## Integrace

```
Google Sheets (LEADS) ←→ Apps Script (backend)
                             ↓
                         Gmail API (outbound + sync)
                             ↓
                    Google Sheets (write-back)

Google Sheets (read-only) ← Sheets API v4 ← Next.js frontend
Next.js frontend → Apps Script Web App → Sheets (write)
```

## Limity

- Apps Script execution time: 6 min/run
- Apps Script trigger limit: 90 min/den
- Gmail sending: 100/den (consumer), 1500/den (Workspace)
- Google Sheets: ~50 000 radku pro rozumny vykon
- Zadny CI/CD, zadne testy
- Frontend bezi lokalne

## Deployment

- Apps Script: clasp push (test default, prod manualne po merge)
- Frontend: zatim jen npm run dev (lokalne)
- Zadny hosting nakonfigurovan

## Klicove konfiguracni soubory

- apps-script/Config.gs — vsechny konstanty, column mappings, feature flags
- crm-frontend/src/lib/config.ts — frontend konfigurace
- crm-frontend/src/middleware.ts — auth middleware
- apps-script/.clasp.json — deployment target
