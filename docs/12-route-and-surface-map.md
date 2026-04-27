# Mapa vstupnich bodu a povrchu -- Autosmartweby

> Kompletni prehled vsech rout, API endpointu, Apps Script entrypointu, triggeru a integracnich bodu projektu.

---

## CRM Frontend (`crm-frontend/`, Next.js 16)

### Stranky (vyzaduji auth pres HMAC session cookie)

| Route | Soubor | Typ | Pristup | Ucel |
|-------|--------|-----|---------|------|
| `/` | `src/app/page.tsx` | Page | Auth vyzadovan | Root redirect / landing |
| `/dashboard` | `src/app/dashboard/page.tsx` | Page | Auth vyzadovan | CRM dashboard se statistikami |
| `/leads` | `src/app/leads/page.tsx` | Page | Auth vyzadovan | Seznam leadu |
| `/pipeline` | `src/app/pipeline/page.tsx` | Page | Auth vyzadovan | Pipeline pohled |
| `/follow-ups` | `src/app/follow-ups/page.tsx` | Page | Auth vyzadovan | Sledovani follow-upu |
| `/login` | `src/app/login/page.tsx` | Page | Verejne | Prihlasovaci formular |

### API Routes

| Route | Metoda | Soubor | Pristup | Ucel |
|-------|--------|--------|---------|------|
| `/api/auth/login` | POST | `src/app/api/auth/login/route.ts` | Verejne | Auth -- email + sdilene heslo -> HMAC session cookie |
| `/api/leads` | GET | `src/app/api/leads/route.ts` | Auth vyzadovan | Nacteni vsech leadu z Google Sheets |
| `/api/leads/[id]` | GET | `src/app/api/leads/[id]/route.ts` | Auth vyzadovan | Nacteni jednoho leadu podle ID |
| `/api/leads/[id]/update` | POST | `src/app/api/leads/[id]/update/route.ts` | Auth vyzadovan | Aktualizace editovatelnych poli leadu pres Apps Script |
| `/api/preview/render` | POST | `src/app/api/preview/render/route.ts` | Header `X-Preview-Webhook-Secret` (B-04) | Apps Script → Next.js: prijme MinimalRenderRequest, upsertne brief do in-memory preview store, vrati MinimalRenderResponseOk s `preview_url` |
| `/api/stats` | GET | `src/app/api/stats/route.ts` | Auth vyzadovan | Statistiky pro dashboard |

### Mechanismus autentizace

- **Middleware:** `src/middleware.ts`
- **Session:** HMAC-podepsana cookie `crm-session` (expirace 7 dni)
- **Overeni:** `crypto.subtle.verify` (timing-safe)
- **Allowlist uzivatelu:** env promenna `ALLOWED_EMAILS`
- **Heslo:** sdilene env `AUTH_PASSWORD`

---

## Apps Script (`apps-script/`, vazany na Google Sheets)

### Menu entrypointy (Google Sheets menu "Autosmartweby CRM")

| Funkce | Soubor | Ucel |
|--------|--------|------|
| `setupPreviewExtension()` | `Menu.gs` | Pridani 45 sloupcu rozsireni |
| `qualifyAllLeads()` | `PreviewPipeline.gs` | Spusteni kvalifikace leadu |
| `processPreviewQueue()` | `PreviewPipeline.gs` | Generovani briefu, sablon, draftu |
| `rebuildEmailDrafts()` | `PreviewPipeline.gs` | Regenerace emailovych draftu |
| `dryRunAudit()` | `PreviewPipeline.gs` | Kompletni dry run se statistikami |
| `refreshContactingSheet()` | `ContactSheet.gs` | Prestavba listu "Ke kontaktovani" |
| `installProjectTriggers()` | `Menu.gs` | Nastaveni casovych triggeru |
| `auditSheetStructure()` | `Menu.gs` | Overeni hlavicek a sloupcu |
| `runWebsiteCheck20/50/100()` | `LegacyWebCheck.gs` | Kontrola webu pres Serper API |
| `setSerperApiKey()` | `LegacyWebCheck.gs` | Ulozeni API klice |
| `ensureLeadIds()` | `PreviewPipeline.gs` | Backfill chybejicich lead_id |
| `auditLeadIds()` | `PreviewPipeline.gs` | Read-only audit pokryti a kvality lead_id |

### Triggery (automaticke)

| Typ | Funkce | Frekvence |
|-----|--------|-----------|
| onEdit | `onContactSheetEdit()` | Kazda editace v "Ke kontaktovani" — Varianta B: lead_id lookup |
| Casovy | `processPreviewQueue()` | Kazdych 15 minut |

### Integracni body

| Integrace | Smer | Mechanismus |
|-----------|------|-------------|
| Google Sheets API | CRM Frontend -> Sheets | `googleapis` npm, service account, read-only |
| Apps Script Web App | CRM Frontend -> Apps Script | POST na `APPS_SCRIPT_WEB_APP_URL` |
| Serper API | Apps Script -> externi | REST API pro vyhledavani webu |
| Gmail API | Apps Script -> Gmail | `GmailApp` pro odeslani/draft/sync |
| Resend API | web-starter -> Resend | Email z kontaktniho formulare (oddeleny projekt) |

---

## Klicove konfiguracni soubory

| Soubor | Role |
|--------|------|
| `apps-script/Config.gs` | Vsechny konstanty, mapovani sloupcu, enumy, feature flagy |
| `crm-frontend/src/lib/config.ts` | Frontend konfigurace, `DYNAMIC_HEADERS`, `REQUIRED_HEADERS`, stage enumy |
| `crm-frontend/src/middleware.ts` | Overeni autentizace |
| `crm-frontend/src/lib/google/sheets-reader.ts` | Cteci cesta (Google Sheets API) |
| `crm-frontend/src/lib/google/apps-script-writer.ts` | Zapisova cesta (Apps Script Web App) |
| `crm-frontend/src/lib/mappers/sheet-to-domain.ts` | Resoluce hlavicek, mapovani radku na lead |
| `apps-script/.clasp.json` | Clasp deployment target (TEST spreadsheet) |

---

## ASW-MARKETING-WEB — verejny web (external dependency)

> **Tento repo NEobsahuje verejny web.** Verejny marketingovy web `https://autosmartweb.cz/` je samostatny projekt v repu **`Spookybro55/ASW-MARKETING-WEB`** (https://github.com/Spookybro55/ASW-MARKETING-WEB).
>
> Routes uvedene nize jsou **external referenc** pro orientaci pri planovani outreach linku z interniho systemu — autoritativni source of truth pro tyto routes je v `ASW-MARKETING-WEB` repu, ne zde. Pri auditu verejneho webu pracuj proti tomu repu nebo proti live URL.

### Stranky (external — pro orientaci)

| Route | Ucel |
|-------|------|
| `/` | Homepage landing |
| `/web-pro-instalatera` | Landing page pro instalaterske firmy |
| `/zasady-ochrany-osobnich-udaju` | Zasady ochrany osobnich udaju (GDPR) |
| `/api/contact` | POST -- kontaktni formular (Resend email) |
