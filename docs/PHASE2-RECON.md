# Phase 2 — Recon: Preview pipeline + CRM email

> **Účel:** mapa "co je hotové, co chybí" pro end-to-end preview pipeline a CRM email send.
> Vstup pro plánování KROK 2–10.
> **Audit baseline:** `498b613` (post-pilot v1.0).
> **Datum:** 2026-04-26.

---

## A. Generování preview (Apps Script)

### A.1 `processPreviewQueue` — hlavní generátor briefu
- **Soubor:** [apps-script/PreviewPipeline.gs:885-1087](apps-script/PreviewPipeline.gs)
- **Volá se:**
  - 15-min timer trigger (instalovaný přes `installProjectTriggers`, řádek 1389-1393)
  - manuálně z menu "Process preview queue" (Menu.gs:41)
- **Eligibility filtr** (řádek 918-933):
  - `qualified_for_preview === 'true'`
  - `preview_stage` je v `['', 'not_started', 'failed', 'review_needed', 'brief_ready']`
  - `dedupe_flag !== 'true'`
  - když `BRIEF_READY` + DRY_RUN — skip (no-op)
- **Pro každý lead** (řádek 938-1072):
  1. Vybere `template_type` přes `chooseTemplateType_(rd)` (PreviewPipeline.gs:519)
  2. Postaví brief přes `buildPreviewBrief_(rd)` (PreviewPipeline.gs:575) — vrátí 18-field PreviewBrief
  3. Postaví slug přes `buildSlug_(name, city)` (PreviewPipeline.gs:661) — `{name}-{city}`, max 60 znaků
  4. Postaví email draft přes `composeDraft_(rd)` (PreviewPipeline.gs:744) — Subject + Body
  5. Pošle webhook na `WEBHOOK_URL` s payloadem `{spreadsheet_id, row_number, template_type, preview_brief, preview_slug, contact, source, ...}` + header `X-Preview-Webhook-Secret` (řádek 1001-1011)
  6. Z response čte `preview_url`, `preview_screenshot_url`, `preview_quality_score`, `preview_needs_review`, `preview_version`

### A.2 LEADS sloupce
**Vstup (čte z LEADS, mapováno přes HeaderResolver):**
`business_name, contact_name, city, area, service_type, segment, pain_point, phone, email, has_website, website_quality, rating, reviews_count, has_cta, mobile_ok, qualified_for_preview, preview_stage, dedupe_flag, send_allowed, lead_id, lead_stage, outreach_stage`

**Výstup (zapisuje do LEADS):**
`template_type, preview_brief_json, preview_headline, preview_subheadline, preview_cta, preview_stage, preview_slug, email_subject_draft, email_body_draft, outreach_stage, webhook_payload_json, preview_url, preview_screenshot_url, preview_generated_at, preview_version, preview_quality_score, preview_needs_review, preview_error, lead_stage, last_processed_at`

### A.3 Existující triggery (po pilot KROK 4)
- `processPreviewQueue` — **15 min cron** ✅ (řádek 1388-1393)
- `autoWebCheckTrigger` — 15 min cron
- `autoQualifyTrigger` — 15 min cron
- `processRawImportBatch` — 30 min cron (KROK 4 / FF-002)
- `syncMailboxMetadata` — 1 hodina cron (KROK 4 / FF-008)
- `onOpen` — pro menu
- `onContactSheetEdit` — onEdit pro review writeback

### A.4 Webhook URL configuration
- `WEBHOOK_URL` v Config.gs (Config.gs:26) je dnes prázdný (`''`)
- Aktivuje se přes `ENABLE_WEBHOOK = false` (Config.gs:25)
- Production webhook URL bude `https://autosmartweby.vercel.app/api/preview/render`
- Auth: `X-Preview-Webhook-Secret` čteno přes `getPreviewWebhookSecret_()` (Script Properties)

---

## B. Webhook receive (Frontend)

### B.1 `/api/preview/render/route.ts`
- **Soubor:** [crm-frontend/src/app/api/preview/render/route.ts:1-117](crm-frontend/src/app/api/preview/render/route.ts)
- **Auth:** header `X-Preview-Webhook-Secret` ↔ env `PREVIEW_WEBHOOK_SECRET`, timing-safe compare
- **Validace:** `validateRenderRequest(body)` — runtime validator
- **Logika:**
  1. `resolveTemplateFamily(template_type)` (B-03) → `family`
  2. `resolveTemplateRenderHints(template_type)` → `hints`
  3. `evaluateQuality(confidence_level, template_type)` → `{preview_quality_score, preview_needs_review, unknown_template_base}`
  4. `putPreviewRecord(slug, {brief, template_type, family, hints, version})` ⚠️ **in-memory!**
  5. Vrátí `{ok: true, preview_url: "${PUBLIC_BASE_URL}/preview/${slug}", preview_version, preview_quality_score, preview_needs_review}`

### B.2 `preview-store.ts` — current implementation
- **Soubor:** [crm-frontend/src/lib/preview/preview-store.ts:28](crm-frontend/src/lib/preview/preview-store.ts)
- **Storage:** module-scope `Map<string, PreviewStoreRecord>` (in-memory)
- **API:**
  - `getPreviewRecord(slug)` — read
  - `hasPreviewRecord(slug)`
  - `putPreviewRecord(slug, record)` — write
  - `__resetPreviewStoreForTests()` — testing helper
- **Známý problém (FF-004 / IN-014):**
  - Vercel restart / cold-start = `Map` je prázdný
  - LEADS má `preview_url`, ale `/preview/<slug>` vrátí `notFound()`
  - **Toto je KROK 2 cíl: nahradit Sheets-backed `_previews` listem**

---

## C. Render preview page (Frontend)

### C.1 `/preview/[slug]/page.tsx`
- **Soubor:** [crm-frontend/src/app/preview/[slug]/page.tsx:1-42](crm-frontend/src/app/preview/[slug]/page.tsx)
- Async server component, `params: Promise<{slug}>` (Next.js 15+)
- Volá `getPreviewBriefBySlug(slug)` → pokud `null` → `notFound()`
- Mapuje `brief.suggested_sections` na `SECTION_COMPONENTS`

### C.2 `getPreviewBriefBySlug` resolver
- **Soubor:** [crm-frontend/src/lib/mock/sample-brief-loader.ts:45-51](crm-frontend/src/lib/mock/sample-brief-loader.ts)
- Priorita lookup:
  1. `getPreviewRecord(slug)` (in-memory store) ← runtime briefs z webhooku
  2. `SAMPLE_BRIEFS[slug]?.brief` ← 5 hardcoded fixtures (`remesla-dvorak`, `sluzby-priklad`, `havarie-brno-instalater`, `malir-novak-praha`, `elektro-projekt-plzen`)
  3. `null` → `notFound()`

### C.3 SECTION_COMPONENTS (6 sekcí)
- `hero` → `HeroSection`
- `services` → `ServicesSection`
- `contact` → `ContactSection`
- `reviews` → `ReviewsSection`
- `location` → `LocationSection`
- `faq` → `FaqSection`

Komponenty: `crm-frontend/src/components/preview/{section}-section.tsx`. Layout: `app/preview/layout.tsx` (max-w-4xl wrapper).

### C.4 `/preview/[slug]/not-found.tsx`
- Plain "Preview nenalezen" fallback page

---

## D. Email odesílání (Apps Script)

### D.1 `executeCrmOutbound_(mode)` core
- **Soubor:** [apps-script/OutboundEmail.gs:47-116](apps-script/OutboundEmail.gs)
- **Vstup:** active row z listu "Ke kontaktování"
- **Volá se z:** menu "Create draft pro vybraný lead" / "Odeslat e-mail pro vybraný lead" (Menu.gs:66-67)
- **Sekvence:**
  1. `resolveSelectedLeadPayload_(ui)` — čte recipient/subject/body z contact sheet, lookup LEADS row přes `lead_id`, identity check
  2. `assertSendability_(reviewDecision, ...)` — **KROK 4 sendability gate** (FF-006): musí být `review_decision === APPROVE` (REVIEW_DECISIONS.APPROVE)
  3. `resolveSenderIdentity_(assigneeEmail)` — **KROK 4 Reply-To**: ASSIGNEE_NAMES lookup nebo DEFAULT_REPLY_TO_EMAIL
  4. Czech UI confirm dialog "ODESLAT e-mail?"
  5. `createGmailDraft_(payload)` nebo `sendGmailMessage_(payload)` — Gmail API s `replyTo` headerem
  6. `persistOutboundMetadata_(payload, result, mode)` — zapíše `email_thread_id, email_last_message_id, email_subject_last, email_mailbox_account, last_email_sent_at, email_sync_status, last_contact_at, outreach_stage→CONTACTED` do LEADS

### D.2 Email draft generation
- **Soubor:** [apps-script/PreviewPipeline.gs:744-878](apps-script/PreviewPipeline.gs) (`composeDraft_`)
- Volá se z `processPreviewQueue` (řádek 958-967) když `send_allowed === 'true'`
- Output → `email_subject_draft, email_body_draft` columns v LEADS
- Subject template: situation-based (`NO_WEBSITE` / `WEAK_WEBSITE` / `HAS_WEBSITE` / `CONFLICT` / `UNKNOWN`)
- Body template: greeting + opening line (situation-dependent) + pain point line + standard CTA closing + signature placeholder `[Vaše jméno]\n[Telefon / E-mail]`
- **Pozn.:** signature placeholder bude operator řešit v KROK 6/7 (v editoru) nebo v polish KROK 7

### D.3 Trigger
- **Žádný cron pro send/draft.** Jen menu (manual click v Apps Script editoru / spreadsheet menu).
- **Frontend:** dnes nemá tlačítko pro send. KROK 6 to přidá.

---

## E. CO CHYBÍ pro end-to-end flow

| # | Co chybí | Krok plánu | Závislosti |
|---|----------|------------|------------|
| 1 | **Persistent preview storage** (Sheets-backed `_previews`) | KROK 2 | FF-004 fix; nutné pro produkční Vercel deploy |
| 2 | **Frontend preview page čte z Apps Scriptu** (přes `getPreview` doPost akci) místo in-memory mapy | KROK 2 | Závisí na bodě 1 |
| 3 | **Polished renderer** — typografie, mobile, default fotky, footer s autosmartweb brandingem | KROK 3 | Nezávislé |
| 4 | **Manual "Generate preview" button v CRM lead detail** + `/api/leads/[id]/generate-preview/route.ts` + Apps Script `generatePreview` doPost akce | KROK 4 | Závisí na bodě 1 (`upsertPreviewRecord_`) |
| 5 | **Auto preview pro qualified leady** — verify že 15-min `processPreviewQueue` skutečně auto-genertuje + logging | KROK 5 | Existuje trigger ale potřeba ověřit smoke test + idempotence |
| 6 | **CRM email editor** — subject + body editovatelné v lead detail + `Save Draft` + `Send Email` tlačítka | KROK 6 | Závisí na bodě 4 (preview existuje) + Apps Script `updateEmailDraft` + `sendEmail` doPost akce |
| 7 | **LLM-quality email draft polish** — vylepšit `composeDraft_` template pro nové templates | KROK 7 | Nezávislé, ale uživitelnější po KROK 6 |
| 8 | **End-to-end smoke test** — reálný Sheets → AS → frontend → email | KROK 8/9 | Závisí na 1–7 |

---

## F. Risks (z auditu Phase 12)

### Aktivní rizika dotýkající se Phase 2

| ID | Severity | Co | Status v Phase 2 |
|----|----------|-----|------------------|
| **FF-004** | P1 | In-memory preview store loss po Vercel restartu — `preview_url` v LEADS ukazuje na 404 | **Řeší KROK 2** (Sheets-backed) |
| **FF-006** | P1 | OutboundEmail nečetl `review_decision` — operator mohl odeslat REJECT-nuté leady | **Vyřešeno pilot KROK 4** (`assertSendability_`); Phase 2 KROK 6 frontend respektuje gate |
| **FF-009** | P1 | C-04 sendability gate SPEC-only | **Pilot KROK 4** implementoval gate v `executeCrmOutbound_` (KROK 6 frontend gating na to navazuje) |
| **FF-003** | P1 | `processPreviewQueue` bez LockService → race s operator edits | **Risk acknowledged**, řešení Wave 3+ (mimo Phase 2 scope, ale KROK 5 bude monitorovat logging) |
| **FF-019** | P1 | Cron může přepsat operator `review_decision` | Stejné jako FF-003 |
| **FF-005** | P2 | `CHANGES_REQUESTED` infinite loop — deterministic brief + re-enter eligible set | Mimo Phase 2 scope (UX issue, doc fix) |
| **FF-007** | P2 | Double-send guard pouze prompt, ne hard block | KROK 6 zopakuje YES_NO confirm; hard block ne |
| **SEC-009** | P1 | Public preview slug vystavuje PII bez consent (GDPR) | **Mimo Phase 2 scope** — Wave 1 |
| **SEC-014** | P1 | Žádný GDPR/PII inventory | **Mimo Phase 2 scope** — Wave 1 |
| **CC-QA-004** | P1 | Žádný "Vercel restart preview integrity" regression test | KROK 2 manual smoke test (deploy + nový build), full automated test mimo scope |

### Phase 2 ne-řeší (záměrně)

- **SEC-001/2 hardcoded IDs** — Wave 0 mimo scope
- **SEC-003** Apps Script ANYONE_ANONYMOUS — Wave 1
- **SEC-007** rate limiting — Wave 1
- **SEC-016** NEXTAUTH_SECRET fail-fast — Wave 0
- **CI gate** (DP-005) — Wave 2
- **C-07 Inbound runtime** (FF-012) — Wave 3

---

## G. Doporučený order kroků

Zadání KROK 1–10 funguje, ale doporučuji jeden přesun:

### Doporučený order

| Krok | Téma | Dependency |
|------|------|------------|
| **KROK 1** | Recon (this doc) | — |
| **KROK 2** | Sheets-backed preview storage + frontend přepis preview-store.ts | — |
| **KROK 3** | Renderer polish (typografie, mobile, fotky, footer) | KROK 2 (musí render reálný brief, ne mock) |
| **KROK 4** | Manual "Generate preview" button v CRM | KROK 2 |
| **KROK 5** | Auto preview pro qualified leady (verify trigger + logging) | KROK 4 funkce `processPreviewForLead_` znovu použitelná z queue |
| **KROK 6** | CRM email editor + send button | KROK 4 (preview existuje) + pilot KROK 4 (sendability gate) |
| **KROK 7** | Email draft polish | Nezávislé na 2-6, ale UX-lepší po 6 |
| **KROK 8** | End-to-end smoke test (Sheets → AS → frontend → email) | KROK 1-7 |
| **KROK 9** | Production deploy (Apps Script clasp push + Vercel) | KROK 8 PASS |
| **KROK 10** | Documentation update (docs/20-29) + task records | KROK 9 done |

### Drobná úprava: KROK 5 a KROK 4 mohou být v jednom PR

Pilot už má 15-min trigger pro `processPreviewQueue` a logování v `_asw_logs`. Po KROK 4 (extract `processPreviewForLead_`) je KROK 5 jen "verify trigger volá tu funkci a loguje". Tj. KROK 5 je spíš **verifikace + smoke test**, ne nová feature. Mohlo by být součástí KROK 4 PR. Ale držím separátní PR per zadání.

### Riziko: KROK 3 (renderer polish) blokuje smoke test

KROK 3 polishuje 6 sekcí + přidává Unsplash fotky, ale je to "kosmetika". Pokud se zdrží, můžeme provedeme KROK 4-8 a polish posunout. Zadání ale chce před KROK 4 → držím pořadí.

---

## H. Open questions (potřebuji rozhodnutí před KROK 2)

### Q1: Jak zachovat backward compatibility s in-memory store?

KROK 2 přepisuje `preview-store.ts` na Apps Script call. Tři možnosti:
- **(a) Hard switch** — `getPreviewRecord` volá AS, in-memory mapa se zruší
- **(b) Read-through cache** — in-memory cache (TTL 5 min), miss → AS
- **(c) Dual-write** — `putPreviewRecord` zapíše in-memory I do Apps Scriptu (postupně migrace)

Zadání naznačuje **(b)** — "frontend cache může být in-memory fallback s TTL 5 min". Plánuji **(b)**.

### Q2: Render route při AS down

Co když `getPreview` doPost timeout? Tři možnosti:
- **(a)** notFound() — operator čeká, klient vidí 404
- **(b)** Fallback na 5 mock fixtures pokud existují
- **(c)** Error page "Preview se připravuje" + retry button

Zadání: "Fallback na 5 mock fixtures (preview-brief.*.json) zachovat pro dev/test". Plánuji **(b)** — tj. mock fixtures jsou last-resort + dev only přes env flag.

### Q3: Kde uložit assignee_email pro reply-to při preview generation?

Při `processPreviewQueue` (cron) lead nemá assignee přidělený. Kdo dostane reply? Dnes default je `sebastian@autosmartweb.cz`. To je OK pro pilot. Phase 2 nezavádí auto-assignment per round-robin (mimo scope).

### Q4: Co dělat, když lead.qualified_for_preview je 'false', ale operator chce preview?

KROK 4 button by měl být **disabled** pro non-qualified. Operator musí nejdřív v Sheet nastavit `qualified_for_preview=true`. Zadání to vyžaduje, držím to.

---

## I. Existing components (hotovo z pilotu)

| Komponenta | Soubor | Stav |
|------------|--------|------|
| `processPreviewQueue` | apps-script/PreviewPipeline.gs:885 | ✅ pilot v1.0 |
| `buildPreviewBrief_` | apps-script/PreviewPipeline.gs:575 | ✅ produces 18-field brief |
| `composeDraft_` (email subject + body) | apps-script/PreviewPipeline.gs:744 | ✅ situation-aware Czech text |
| `executeCrmOutbound_` (DRAFT/SEND) | apps-script/OutboundEmail.gs:47 | ✅ pilot KROK 4 (sendability gate + Reply-To) |
| `assertSendability_` (FF-006) | apps-script/OutboundEmail.gs:278 | ✅ pilot KROK 4 |
| `resolveSenderIdentity_` (Reply-To) | apps-script/OutboundEmail.gs:295 | ✅ pilot KROK 4 |
| `installProjectTriggers` (15-min preview cron) | apps-script/PreviewPipeline.gs:1345 | ✅ pilot KROK 4 |
| `WebAppEndpoint.doPost` (`updateLead`, `assignLead`) | apps-script/WebAppEndpoint.gs:10 | ✅ pilot KROK 4/5 |
| `/api/preview/render/route.ts` (B-04 webhook receive) | crm-frontend/src/app/api/preview/render/route.ts | ✅ B-04 contract validated |
| `/preview/[slug]/page.tsx` (B-02 renderer) | crm-frontend/src/app/preview/[slug]/page.tsx | ✅ 6 sections, mock fixtures fallback |
| `preview-store.ts` (in-memory) | crm-frontend/src/lib/preview/preview-store.ts | ⚠️ **FF-004 — KROK 2 přepíše** |
| `lead-detail-drawer.tsx` (preview link, email draft readonly) | crm-frontend/src/components/leads/lead-detail-drawer.tsx | ⚠️ Read-only — KROK 4/6 přidá actions |

---

## J. Missing components (per Phase 2 scope)

| Komponenta | Krok | Type |
|------------|------|------|
| Apps Script `_previews` sheet schema (`ensurePreviewSheet_`, `upsertPreviewRecord_`, `getPreviewRecord_`, `listPreviewRecords_`) | 2 | AS |
| Apps Script `doPost` akce `getPreview` | 2 | AS |
| Apps Script `doPost` akce `generatePreview` (manual) | 4 | AS |
| Apps Script `processPreviewForLead_(leadId)` (extract z queue) | 4 | AS |
| Apps Script `doPost` akce `updateEmailDraft` | 6 | AS |
| Apps Script `doPost` akce `sendEmail` | 6 | AS |
| Frontend `preview-store.ts` přepsaný na AS call | 2 | FE |
| Frontend `getPreviewBriefBySlug` přepsaný (AS first, mock fallback dev-only) | 2 | FE |
| Frontend renderer polish (Tailwind tokens, 6 sekcí, Unsplash, footer) | 3 | FE |
| Frontend `/api/leads/[id]/generate-preview/route.ts` | 4 | FE |
| Frontend `/api/leads/[id]/email/route.ts` (PATCH + POST) | 6 | FE |
| Frontend lead detail "Preview" sekce s buttonem | 4 | FE |
| Frontend lead detail "Email" sekce s editorem + send | 6 | FE |
| Apps Script email draft polish | 7 | AS |

---

## K. Decision log refs

Phase 2 navazuje na pilot decisions D-21 až D-30 (mimo tento doc — viz pilot retro). Phase 2 brainstorm decisions:
- **D-31:** Generic single-layout (B-02 polish), NE family-specific layouts
- **D-32:** Preview storage = Sheets-backed `_previews` (NE Vercel KV, NE in-memory)
- **D-33:** Email draft = LLM-generated pre-stored v LEADS (`email_subject_draft`, `email_body_draft`), editovatelný před send
- **D-34:** Preview trigger = manual button + auto pro qualified leady (oba)
- **D-35:** Sendability gate FF-006 platí i pro frontend send (KROK 6)

(Decisions zatím nejsou v `docs/01-decision-list.md` — KROK 10 do něj přidá.)
