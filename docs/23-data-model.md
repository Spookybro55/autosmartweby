# Data Model — Autosmartweby

> **Kanonicky dokument.** Aktualizuje se pri zmene sloupcu, sheetu nebo datoveho toku.
> **Posledni aktualizace:** 2026-04-05

---

## Source of truth

Google Sheets, spreadsheet ID v Config.gs (SPREADSHEET_ID).

## Sheety

| Sheet | Ucel | Typ |
|-------|------|-----|
| LEADS | Hlavni data vsech leadu | Source of truth |
| Ke kontaktovani | Odvozeny view kontakt-ready leadu | Derived (generovany) |
| _asw_logs | Interni logy Apps Scriptu | System (auto-prune 5000 radku) |
| _raw_import | Staging buffer pro scraped data pred vstupem do LEADS | System (append-only, viz A-02 kontrakt) |

## LEADS — sloupce

### Originalni sloupce (1–20)
Puvodni business data — pozice definovane v LEGACY_COL (Config.gs):
- Col 4: business_name
- Col 9: city
- Col 11: phone
- Col 12: email
- Col 13: website_url
- Col 20: has_website

Dalsi: source, ico, contact_name, segment, service_type, area, atd.

### Extension sloupce (45 sloupcu, append-only)
Definovane v EXTENSION_COLUMNS (Config.gs):
- **Deduplikace:** company_key, branch_key, dedupe_group, dedupe_flag
- **Pipeline:** lead_stage, preview_stage, outreach_stage, qualified_for_preview, qualification_reason
- **Template:** template_type, preview_slug, preview_url, preview_screenshot_url, preview_generated_at, preview_version, preview_brief_json
- **Personalizace:** preview_headline, preview_subheadline, preview_cta, preview_quality_score, preview_needs_review
- **Email draft:** email_subject_draft, email_body_draft
- **Kontakt:** contact_ready, contact_reason, contact_priority, next_action, last_contact_at, next_followup_at, sales_note
- **Identita:** lead_id (format: ASW-{ts}-{rnd4} nebo FIRMYCZ-NNNN)
- **Email sync:** email_thread_id, email_last_message_id, last_email_sent_at, last_email_received_at, email_sync_status, email_reply_type, email_mailbox_account, email_subject_last, email_last_error
- **System:** send_allowed, personalization_level, webhook_payload_json, preview_error, last_processed_at

## State machines

### lead_stage
NEW → QUALIFIED / DISQUALIFIED / REVIEW → IN_PIPELINE → PREVIEW_SENT

### preview_stage
NOT_STARTED → BRIEF_READY → QUEUED → SENT_TO_WEBHOOK → READY / REVIEW_NEEDED / FAILED

### outreach_stage
NOT_CONTACTED → DRAFT_READY → CONTACTED → RESPONDED → WON / LOST

### email_sync_status
NOT_LINKED → NOT_FOUND / REVIEW / DRAFT_CREATED → SENT → LINKED → REPLIED / ERROR

## Ke kontaktovani — sloupce

| Col | Nazev | Typ |
|-----|-------|-----|
| 1 | Priorita | Read-only (HIGH/MEDIUM/LOW) |
| 2 | Firma | Read-only |
| 3 | Duvod osloveni | Read-only |
| 4 | Preview | Read-only (stav + hyperlink) |
| 5 | Telefon | Read-only |
| 6 | E-mail | Read-only |
| 7 | Stav | Editable (write-back) |
| 8 | Dalsi krok | Editable (write-back) |
| 9 | Posledni kontakt | Editable (write-back) |
| 10 | Follow-up | Editable (write-back) |
| 11 | Poznamka | Editable (write-back) |
| 12–18 | Detail (hidden group) | Read-only |
| 19 | ID leadu | System (write-back key) |

## Preview Brief Contract (B-01)

Preview brief je JSON objekt generovany funkci `buildPreviewBrief_()` v `PreviewPipeline.gs`. Uklada se serializovany do LEADS sloupce `preview_brief_json`. Dalsi preview metadata (slug, stage, headline kopie, quality score) se ukladaji do samostatnych LEADS sloupcu — viz tabulka nize.

Brief ma presne 18 poli — vsechna vzdy pritomna (nikdy undefined/null, chybejici data = "" nebo []).

Formalni TypeScript kontrakt zije v `crm-frontend/src/lib/domain/preview-contract.ts`. Formalizuje brief shape pro pouziti ve frontendu a budoucim preview rendereru.

### Known gaps

- **preview_slug** — existuje v LEADS (generuje `buildSlug_()`), ale **CHYBI ve webhook payloadu** (`processPreviewQueue()` ho do payloadu nepridava). Fix je scope B-05.
- **preview_quality_score** — scale formalne uzamcen na **0–1** (GAS porovnava `< 0.7` pro urceni needs_review).

### Preview-related LEADS sloupce a jejich stav

| Sloupec | Kdo plni | Stav dnes |
|---------|---------|-----------|
| template_type | processPreviewQueue | Vyplneny |
| preview_slug | processPreviewQueue | Vyplneny |
| preview_brief_json | processPreviewQueue | Vyplneny |
| preview_headline | processPreviewQueue (kopie) | Vyplneny |
| preview_subheadline | processPreviewQueue (kopie) | Vyplneny |
| preview_cta | processPreviewQueue (kopie) | Vyplneny |
| preview_stage | processPreviewQueue | BRIEF_READY |
| preview_url | Webhook response | Prazdny (webhook vypnuty) |
| preview_screenshot_url | Webhook response | Prazdny |
| preview_generated_at | Webhook response handler | Prazdny |
| preview_version | Webhook response | Prazdny |
| preview_quality_score | Webhook response | Prazdny |
| preview_needs_review | Webhook response handler | Prazdny |
| preview_error | Webhook error handler | Prazdny |

## Write-back mechanismus

Varianta B: lead_id-based lookup. Sloupec 19 drzi lead_id. onContactSheetEdit pouziva findRowByLeadId_ pro nalezeni aktualniho radku v LEADS. Secondary guard: business_name + city match.

## Staging layer: _raw_import

Novy system sheet ve stejnem SPREADSHEET_ID jako LEADS. Konvence leading underscore je stejna jako u `_asw_logs` (Config.gs:14). Role: staging buffer mezi scraperem a produkcnim LEADS sheetem. Raw data se nejdrive zapisi do `_raw_import`, projdou normalizaci a dedupe, a teprve pak (v jedinem okamziku pres import writer) vznikne novy LEADS radek s vygenerovanym `lead_id`.

**LEADS zustava produkcni source of truth pro ciste leady.** `_raw_import` je source of truth pro surova vstupni data a jejich ingest lifecycle, nikdy ne pro business stav leadu.

- **Row shape:** 16 sloupcu, 7 immutable po insertu, 9 update-in-place. Viz `docs/contracts/raw-import-staging.md` a `docs/contracts/raw-import-row.schema.json`.
- **Status model:** `raw` / `normalized` / `duplicate_candidate` / `error` / `imported`. Status `error` a `imported` jsou terminalni.
- **Decision model:** `import_decision` (nullable enum) je oddeleny od `normalized_status`. Hodnoty: `imported`, `rejected_error`, `rejected_duplicate`, `pending_review`.
- **Hard duplicate** (ICO / domain / business email domain match) jde rovnou do `error` s `rejected_duplicate`. Status `duplicate_candidate` je vyhrazen vyhradne pro soft dup cekajici na manualni review.
- **Retry:** `error` je terminalni. Opakovani = novy radek s novym `raw_import_id`; puvodni error radek zustava trvale jako audit.

## Normalization: raw -> LEADS (A-03)

Pravidla pro transformaci `_raw_import.raw_payload_json` na validni LEADS radek. Cely kontrakt v `docs/contracts/normalization-raw-to-leads.md`, strojove citelny mapping v `docs/contracts/raw-to-leads-mapping.json`.

**Principy:**
- Reuse existujicich helperu v `Helpers.gs:320-395` (`normalizePhone_`, `trimLower_`, `removeDiacritics_`, `canonicalizeUrl_`, `isRealUrl_`). Zadne paralelni cleaning funkce.
- `lead_id` format `ASW-{ts36}-{rnd4}` zustava beze zmeny; generator se extrahuje z `PreviewPipeline.gs:63-108` do sdileneho `generateLeadId_()` v `Helpers.gs`.
- Append-only rozsireni LEADS: 6 novych `source_*` sloupcu na konci `EXTENSION_COLUMNS`. Legacy pozice 1-20 (`LEGACY_COL`) nedotceno.
- `phone`, `email`, `website_url` jsou vzdy string — `""` pokud invalid, nikdy `null`. Konzistentni s `isBlank_()` guardem a Sheets round-trip.
- `has_website` se vzdy dopocitava z `website_url` jako `"yes"`/`"no"`.

**Reject pravidla:** chybejici `business_name`, `city`, nebo oba `phone`+`email` prazdne -> raw radek skonci v `_raw_import` jako `error` s `rejected_error`. Retry = novy radek.

### Nove source metadata sloupce v LEADS (append-only)

| # | Sloupec | Typ | Zdroj |
|---|---------|-----|-------|
| 1 | source_job_id | string | _raw_import.source_job_id (FK na A-01 job) |
| 2 | source_portal | enum | _raw_import.source_portal (firmy.cz / zivefirmy.cz) |
| 3 | source_url | string (URL) | _raw_import.source_url |
| 4 | source_raw_import_id | string | _raw_import.raw_import_id (FK zpet na raw radek) |
| 5 | source_scraped_at | ISO 8601 UTC | _raw_import.scraped_at |
| 6 | source_imported_at | ISO 8601 UTC | generovano pri LEADS insert |

## Contracts

Kanonicke datove kontrakty zive v `docs/contracts/`. TypeScript typy jsou v `crm-frontend/src/lib/contracts/`.

| Contract | Verze | Schema | Spec |
|----------|-------|--------|------|
| Scraping Job Input | 1.0 | [contracts/scraping-job-input.schema.json](contracts/scraping-job-input.schema.json) | [contracts/scraping-job-input.md](contracts/scraping-job-input.md) |
| RAW_IMPORT Row | 1.0 | [contracts/raw-import-row.schema.json](contracts/raw-import-row.schema.json) | [contracts/raw-import-staging.md](contracts/raw-import-staging.md) |
| Normalization: raw -> LEADS | 1.0 | — | [contracts/normalization-raw-to-leads.md](contracts/normalization-raw-to-leads.md) + [contracts/raw-to-leads-mapping.json](contracts/raw-to-leads-mapping.json) |

Scraping Job Input definuje vstupni payload pro jeden scraping job (1 job = 1 query na 1 portalu v 1 meste/segmentu). 12 poli, vsechna required (nullable pole pouzivaji explicitni null, ne chybejici klic). `source_job_id` je deterministicky odvozen z (portal, segment, city, district, max_results, creation second) pres SHA-256, coz zajistuje idempotenci re-runu stejneho scope.
