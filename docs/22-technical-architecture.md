# Technical Architecture — Autosmartweby (interni system)

> **Kanonicky dokument.** Aktualizuje se pri zmene technologie nebo architektury.
> **Posledni aktualizace:** 2026-04-05
>
> **Project boundary:** Tento dokument popisuje architekturu **interniho systemu** v repu `Spookybro55/autosmartweby`. Verejny marketingovy web `https://autosmartweb.cz/` je samostatny projekt v repu **`Spookybro55/ASW-MARKETING-WEB`** (external dependency) — neni soucasti zde popisovane architektury.

---

## Komponenty

| Komponenta | Technologie | Umisteni | Ucel |
|------------|-------------|----------|------|
| CRM backend | Google Apps Script (V8) | apps-script/ | Kvalifikace, pipeline, emaily, write-back |
| CRM frontend | Next.js 16 + React 19 + TS | crm-frontend/ | Interni dashboard, leads, pipeline, follow-ups. **NENI to verejny web firmy** (ten zije v `Spookybro55/ASW-MARKETING-WEB`). |
| Databaze | Google Sheets | externi (SPREADSHEET_ID) | LEADS sheet = source of truth pro runtime data |
| Email | Gmail API (pres GmailApp) | apps-script/ | Draft/send, mailbox sync, labeling |
| Web check | Serper API | apps-script/LegacyWebCheck.gs | Hledani chybejicich webu |
| Nabidky | HTML + Python + Chrome | offers/ | Staticke obchodni nabidky, HTML→PDF konverze |
| Auth | HMAC-SHA256 session + Google OAuth | crm-frontend/ | Timing-safe, dual-mode |
| Preview renderer | Next.js App Router (server components) | crm-frontend/src/app/preview/ | Interni preview vrstva pro outreach k jednotlivym leadum — MVP landing page z sample briefu, verejne dostupna bez auth na `/preview/[slug]`. **NENI to verejny marketingovy web firmy** (ten je v `Spookybro55/ASW-MARKETING-WEB` na `autosmartweb.cz`). |
| Template family mapping | Pure TS modul | crm-frontend/src/lib/domain/template-family.ts | Mapuje runtime `template_type` na 4 MVP family + render hints (B-03) |
| Preview render endpoint | Next.js App Router (POST handler) | crm-frontend/src/app/api/preview/render/route.ts | B-04: prijima Apps Script webhook, validuje MinimalRenderRequest (B-01), volá `resolveTemplateFamily` (B-03), upsertne brief do `preview-store.ts` (in-memory), vraci `MinimalRenderResponseOk` s `preview_url = ${PUBLIC_BASE_URL}/preview/${slug}`. Auth: header `X-Preview-Webhook-Secret`, timing-safe. |
| Preview runtime store | In-memory Map | crm-frontend/src/lib/preview/preview-store.ts | B-04: module-scope `Map<string, PreviewStoreRecord>`, reset pri restartu. GAS je source of truth, re-run obnovi stav. Externi persistence = future scope (dedicated task, NE B-06). |
| Preview webhook caller (GAS → B-04) | Apps Script | apps-script/PreviewPipeline.gs (`processPreviewQueue`, `runWebhookPilotTest`) | B-05: payload obsahuje `preview_slug`, headers obsahuji `X-Preview-Webhook-Secret` (ze Script Property `PREVIEW_WEBHOOK_SECRET` pres `getPreviewWebhookSecret_()`). Preview lifecycle: `BRIEF_READY → GENERATING → READY_FOR_REVIEW → APPROVED \| REJECTED \| BRIEF_READY (regenerace)` nebo `FAILED` (retry eligible). Response parsing beze zmen (pre-existing write-back do LEADS). |
| Review surface (operator) | Google Sheets "Ke kontaktovani" list + onEdit trigger | apps-script/ContactSheet.gs (`handleReviewDecisionEdit_`, `refreshContactingSheet`) | B-06: derived list nad LEADS. Visible cols 1-13 (vcetne Rozhodnuti ✎ dropdown a Duvod revize ✎), detail 14-21. Atomic write-back pod 5s lockem: `review_decision` + `reviewed_at` + `reviewed_by` + `preview_stage` na jeden dropdown edit. Guards: `preview_stage=READY_FOR_REVIEW`, lead_id, dedupe_flag, lead_stage, outreach_stage, missing-column check. `send_allowed` NEJE approval flag. |
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

## Email identity model

Hybrid model: 1 centralni inbox + 3 osobni senders.

### Mailbox role

| Adresa | Role | Klientsky viditelne |
|--------|------|---------------------|
| `info@autosmartweb.cz` | Centralni obchodni inbox + Reply-To pro vsechny outbound + prijemce kontaktniho formulare z `autosmartweb.cz/api/contact` + zdroj pro mailbox sync | ANO |
| `s.fridrich@autosmartweb.cz` | Osobni obchodni sender (Sebastián Fridrich) | ANO |
| `t.maixner@autosmartweb.cz` | Osobni obchodni sender (Tomáš Maixner) | ANO |
| `j.bezemek@autosmartweb.cz` | Osobni obchodni sender / owner (Honza / Jan Bezemek) — **primarni outbound adresa Honzy** | ANO |

### From / Reply-To nastaveni pro outbound pilot

| Variant | From | Reply-To |
|---------|------|----------|
| Sebastián | `Sebastián z Autosmartweby <s.fridrich@autosmartweb.cz>` | `info@autosmartweb.cz` |
| Tomáš | `Tomáš z Autosmartweby <t.maixner@autosmartweb.cz>` | `info@autosmartweb.cz` |
| Honza | `Honza z Autosmartweby <j.bezemek@autosmartweb.cz>` | `info@autosmartweb.cz` |

### Zakazane

- `unipong.cz` **NESMI** byt klientsky viditelna outbound identita (From, Reply-To, Schema.org email, footer, impressum, kontaktni formular)
- Osobni Gmail adresy (`*@gmail.com`) **NESMI** byt klientsky viditelne v outbound
- Apps Script runtime account != outbound sender identity — vyzaduje Gmail "Send mail as" alias setup (viz "Apps Script outbound prerequisite" nize)

## Auth vs outbound identity

Tvrde oddeleni dvou ortogonalnich vrstev:

| Vrstva | Promenna | Co obsahuje | Klientsky viditelne |
|--------|----------|-------------|---------------------|
| Interni login do CRM | `ALLOWED_EMAILS` (Vercel env) | Sirsi allowlist — muze obsahovat `info@autosmartweb.cz`, `s.fridrich@autosmartweb.cz`, `t.maixner@autosmartweb.cz`, `j.bezemek@autosmartweb.cz` + osobni Gmail accounts pro Apps Script editor pristup (napr. `jan.bezemek8@gmail.com`) | NE |
| Outbound sender identity | `OUTBOUND_FROM_EMAIL`, `OUTBOUND_FROM_NAME`, `OUTBOUND_REPLY_TO`, `SENDER_MAP_JSON` (Apps Script Script Properties) | Striktne firemni `autosmartweb.cz` adresy | ANO |
| Kontaktni formular (web) | `CONTACT_TO_EMAIL`, `CONTACT_FROM_EMAIL`, `CONTACT_REPLY_TO_MODE` (Vercel env v `ASW-MARKETING-WEB`) | `info@autosmartweb.cz` jako To, `web@send.autosmartweb.cz` (Resend) nebo `info@` jako From, customer email jako Reply-To | ANO |

Invariant: `ALLOWED_EMAILS` muze obsahovat `*@gmail.com`, ale `OUTBOUND_FROM_EMAIL` / `CONTACT_FROM_EMAIL` / `CONTACT_TO_EMAIL` / `OUTBOUND_REPLY_TO` **nikdy** ne `*@gmail.com` ani `*@unipong.cz`.

## Apps Script outbound prerequisite

`apps-script/OutboundEmail.gs` pouziva `GmailApp.sendEmail()` a `GmailApp.createDraft()`. Bez explicit `from` parametru a bez nastaveneho Gmail aliasu odesila pod uctem, ktery vlastni Apps Script projekt.

### Manualni prerequisite pred zapnutim realneho outbound

1. **Apps Script projekt vlastni firemni Workspace ucet** (`info@autosmartweb.cz`) NEBO osobni Gmail s nastavenymi "Send mail as" aliasy.
2. Pro kazdy planovany sender (`s.fridrich@`, `t.maixner@`, `j.bezemek@autosmartweb.cz`) v Gmail Settings → Accounts → "Send mail as" → Add another email address → SMTP setup (Wedos: `smtp.wedos.com:465 SSL`, login `s.fridrich` / `t.maixner` / `j.bezemek`).
3. Po confirmation lze v `GmailApp.sendEmail()` pouzit `from: 's.fridrich@autosmartweb.cz'` parametr.
4. Bez tohoto setupu vola `from: 's.fridrich@autosmartweb.cz'` exception nebo Gmail zustane u puvodniho From = ucet vlastnika skriptu.

### Pravidlo pro pilot

- **`DRY_RUN=true` v `apps-script/Config.gs:24` zustava aktivni**, dokud:
  - SMTP alias setup je overeny (sender muze poslat z `s.fridrich@autosmartweb.cz` From)
  - Mail-tester baseline je 9/10 nebo lepsi
  - DKIM / SPF / DMARC alignment je overeny test mailem
- Pred prvnim realnym SEND musi byt v `OutboundEmail.gs` pridan DRY_RUN guard (Phase 3 audit AS-003 P1) — currently chybi.

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
