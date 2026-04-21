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
| Template family mapping | Pure TS modul | crm-frontend/src/lib/domain/template-family.ts | Mapuje runtime `template_type` na 4 MVP family + render hints (B-03) |
| Preview render endpoint | Next.js App Router (POST handler) | crm-frontend/src/app/api/preview/render/route.ts | B-04: prijima Apps Script webhook, validuje MinimalRenderRequest (B-01), volá `resolveTemplateFamily` (B-03), upsertne brief do `preview-store.ts` (in-memory), vraci `MinimalRenderResponseOk` s `preview_url = ${PUBLIC_BASE_URL}/preview/${slug}`. Auth: header `X-Preview-Webhook-Secret`, timing-safe. |
| Preview runtime store | In-memory Map | crm-frontend/src/lib/preview/preview-store.ts | B-04: module-scope `Map<string, PreviewStoreRecord>`, reset pri restartu. GAS je source of truth, re-run obnovi stav. Externi persistence = B-06 scope. |
| Preview webhook caller (GAS → B-04) | Apps Script | apps-script/PreviewPipeline.gs (`processPreviewQueue`, `runWebhookPilotTest`) | B-05: payload obsahuje `preview_slug`, headers obsahuji `X-Preview-Webhook-Secret` (ze Script Property `PREVIEW_WEBHOOK_SECRET` pres `getPreviewWebhookSecret_()`). Preview lifecycle: `BRIEF_READY → GENERATING → READY_FOR_REVIEW → APPROVED` nebo `FAILED` (retry eligible). Response parsing beze zmen (pre-existing write-back do LEADS). |
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
