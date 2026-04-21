# Data Model — Autosmartweby

> **Kanonicky dokument.** Aktualizuje se pri zmene sloupcu, sheetu nebo datoveho toku.
> **Posledni aktualizace:** 2026-04-16

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
| _ingest_reports | Kvalita ingestu per source_job_id (A-09) | System (append-only, viz A-09) |

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
- **Deduplikace:** company_key, branch_key, dedupe_group, dedupe_flag (A-05: company_key uses strict 8-digit IČO, blocked domain filter, required city for T4; see `docs/contracts/dedupe-decision.md`)
- **Pipeline:** lead_stage, preview_stage, outreach_stage, qualified_for_preview, qualification_reason
- **Template:** template_type, preview_slug, preview_url, preview_screenshot_url, preview_generated_at, preview_version, preview_brief_json
- **Personalizace:** preview_headline, preview_subheadline, preview_cta, preview_quality_score, preview_needs_review
- **Email draft:** email_subject_draft, email_body_draft
- **Kontakt:** contact_ready, contact_reason, contact_priority, next_action, last_contact_at, next_followup_at, sales_note
- **Identita:** lead_id (format: ASW-{ts}-{rnd4} nebo FIRMYCZ-NNNN)
- **Email sync:** email_thread_id, email_last_message_id, last_email_sent_at, last_email_received_at, email_sync_status, email_reply_type, email_mailbox_account, email_subject_last, email_last_error
- **System:** send_allowed, personalization_level, webhook_payload_json, preview_error, last_processed_at

## State machines

> **Canonical lifecycle:** Autoritativni end-to-end lifecycle state machine je definovana v `docs/21-business-process.md`, sekce "Lead Lifecycle State Machine — CS1". Nize uvedene state machines jsou **auxiliary** vrstvove detaily; kanonicky stav leadu (`lifecycle_state`) je vzdy prave 1 a odvozuje se z kombinace techto poli.

### lead_stage
NEW → QUALIFIED / DISQUALIFIED / REVIEW → IN_PIPELINE → PREVIEW_SENT

### preview_stage (B-05)
NOT_STARTED → BRIEF_READY → GENERATING → READY_FOR_REVIEW → APPROVED
                                       → FAILED (retry eligible)

- **NOT_STARTED** — pipeline muze zacit
- **BRIEF_READY** — brief JSON hotovy, webhook jeste nevolan
- **GENERATING** — webhook request in-flight (nahrazuje legacy QUEUED + SENT_TO_WEBHOOK)
- **READY_FOR_REVIEW** — preview_url zapsana, ceka na operatora (nahrazuje legacy READY + REVIEW_NEEDED; `preview_needs_review` sloupec drzi quality signal)
- **APPROVED** — operator manualne potvrdil v Google Sheets; terminal
- **FAILED** — posledni pokus selhal; re-tryable na dalsim timer tiku (zustava v eligibleStages)

Legacy hodnoty `QUEUED, SENT_TO_WEBHOOK, READY, REVIEW_NEEDED` jsou preserved v `PREVIEW_STAGES` enumu pro backward-compat cteni pre-B-05 dat. Novy kod je nezapisuje.

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

### Preview Slug Contract (B-01)

Formalni pravidla pro preview_slug format jsou definovana v `preview-contract.ts`:
- Lowercase, hyphen-separated, URL-safe: `/^[a-z0-9](...)[a-z0-9]$/`
- Diakritika transliterovana do ASCII
- Stabilni (po vygenerovani se nesmi menit)
- Unikatni (kolize reseny numerickim suffixem)
- Delka 3–80 znaku

Implementace generatoru je v `buildSlug_()` — B-01 definuje pouze contractual rules.

### Section Mapping Contract (B-01)

Mapping brief → render sections je formalizovan v `preview-contract.ts` jako `SECTION_MAPPING_CONTRACT`. Kazda ze 6 sections (hero, services, contact, location, reviews, faq) ma specifikovane primary/fallback fields a renderability conditions (full/degraded/hidden).

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

### Producer (A-04)

Nove radky do `_raw_import` produkuje **scraper runtime** (`scripts/scraper/firmy-cz.mjs`, viz task A-04). Pro 1 A-01 `ScrapingJobInput` vraci pole validnich `RawImportRow` objektu s `normalized_status="raw"`, `processed_by="scraper"` a `raw_payload_json` ve tvaru klicu odpovidajicich A-03 mappingu.

### Runtime writer (A-10)

Zapis do Sheets zajistuje `apps-script/RawImportWriter.gs`:
- `ensureRawImportSheet_(ss)` — vytvori `_raw_import` sheet s 16-sloupcovymi hlavickami, pokud neexistuje
- `writeRawImportRows_(sheet, rows)` — append-only batch zapis raw radku
- `updateRawImportRow_(sheet, id, updates)` — in-place update mutabilnich poli
- `processRawImportBatch_(opts)` — orchestrator: raw → normalize (A-03) → dedupe (A-05) → import/reject

Normalizaci provadi `apps-script/Normalizer.gs`:
- `normalizeRawImportRow_(rawRow)` — A-03 field cleaning, reject policy, vraci LEADS-ready objekt nebo error s reason codem

**Stav:** Logika localne overena (`scripts/test-ingest-runtime.mjs`). Sheets runtime ceka na clasp push po merge do main.

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

## Ingest quality report: _ingest_reports (A-09)

Novy system sheet (append-only, leading-underscore konvence jako `_asw_logs` a `_raw_import`). Role: reportovaci vrstva nad ingest funnellem. Jeden radek = jeden report za jeden `source_job_id`. Agregace nad `_raw_import` + LEADS; NE novy datovy zdroj.

- **Report unit:** 1 report = 1 `source_job_id` (= 1 scraping job = 1 query na 1 portalu v 1 city/segment).
- **Storage:** append-only sheet `_ingest_reports` (41 sloupcu) + full JSON payload v `_asw_logs` (via `aswLog_`).
- **Regenerace:** novy radek (starsi zustavaji pro historical trend + PARTIAL → OK progression).

### Schema (41 sloupcu)

| Sekce | Sloupce |
|-------|---------|
| Identity | report_id, source_job_id, portal, segment, city, district |
| Timing | run_started_at, run_ended_at, duration_ms_approx |
| Raw stage counts | raw_count, imported_count, error_count, duplicate_count, pending_review_count, unprocessed_count |
| LEADS stage counts | leads_count, web_checked_count, web_found_count, qualified_or_beyond_count, qualified_current_count, disqualified_count, review_count, lead_stage_empty_count, brief_ready_count, preview_failed_count, draft_ready_count, missing_email_count, missing_phone_count, missing_both_count |
| Derived rates | normalization_success_rate, import_rate, duplicate_rate, qualification_rate, brief_ready_rate, contact_completeness_rate |
| Bottleneck | bottleneck_stage, summary_status |
| Snapshot | snapshot_stage |
| Breakdown | fail_reason_breakdown_json |
| Audit | generated_at, generated_by |

### Strict semantics (truthfulness rules)

- **`duplicate_count`** = COUNT(`import_decision='rejected_duplicate'`) **ONLY**. Pending/review je separate `pending_review_count`. `duplicate_or_review_count` existuje pouze jako derived helper v `fail_reason_breakdown_json`.
- **`brief_ready_count`** = COUNT(`preview_stage='BRIEF_READY'`) **STRICT CANONICAL**. Nikdy se neinferuje z `preview_brief_json` / `preview_slug` presence.
- **`qualified_or_beyond_count`** = COUNT(`lead_stage IN ('QUALIFIED','IN_PIPELINE','PREVIEW_SENT')`) — canonical funnel metric. A-08 post-qualify hook posouva QUALIFIED→IN_PIPELINE, takze strict `qualified_current_count` by funnel undercountoval. `qualified_current_count` je soucasne strict-snapshot side-metric pro transparency, ale NE pouzit v rate calculations.
- **`duration_ms_approx`** = `MAX(updated_at) − MIN(scraped_at)` — **DERIVED APPROXIMATION**, zahrnuje idle time mezi scrape a batch processing. Ne exact runtime single processu.
- **`snapshot_stage`** (`RAW_ONLY` / `DOWNSTREAM_PARTIAL` / `FINAL`) — **orthogonal to `summary_status`**. Identifikuje pozici v lifecycle funnelu, ne kvalitu vysledku:
  - `RAW_ONLY` — raw rows existuji ale LEADS jeste nic pro tento job neodrazi (import probehl, ale downstream propsani ceka)
  - `DOWNSTREAM_PARTIAL` — LEADS existuji, ale A-06/A-07/A-08 chain je nedokonceny (lead_stage empty, web_checked < imported, nebo qualified>0 && brief_ready=0)
  - `FINAL` — raw_count=0 (nic k zpracovani), vsechny raw rejected (zadny downstream mozny), nebo full chain dobehl pro vsechny leady
  - Auto-computed z data state v `buildIngestReport_`. Caller muze prepsat pres `opts.snapshotStage`.
  - Pouziti: filtruj report sheet podle `snapshot_stage='FINAL'` pro definitive-outcome reports; starsi PARTIAL radky zustavaji v sheetu jako historical trend.

### Summary status semantika

- `FAILED` — raw_count=0 nebo error_count/raw_count > 0.5
- `PARTIAL` — imported>0 a (lead_stage_empty>0 nebo web_checked<imported) (A-06/A-07 nedobehl), nebo qualified_or_beyond>0 a brief_ready=0 (A-08 nedobehl/dormant)
- `DEGRADED` — bottleneck_stage != 'none' (nejnizsi funnel stage rate < 0.8)
- `OK` — jinak

### Bottleneck stages (4)

1. `A:normalize` = (raw_count − error_count) / raw_count
2. `B:dedupe_import` = imported_count / (raw_count − error_count)
3. `C:qualify` = qualified_or_beyond_count / leads_count
4. `D:brief_ready` = brief_ready_count / qualified_or_beyond_count

Plus `'none'` pokud lowest >= 0.8.

### Producers

- **Post-batch hook v `processRawImportBatch_()`** — non-fatal, per distinct source_job_id v batch-i.
- **Manual menu "Ingest report → …"** — per job prompt nebo all jobs scan.
- Implementace: `apps-script/IngestReport.gs`.

## Contracts

Kanonicke datove kontrakty zive v `docs/contracts/`. TypeScript typy jsou v `crm-frontend/src/lib/contracts/`.

| Contract | Verze | Schema | Spec |
|----------|-------|--------|------|
| Scraping Job Input | 1.0 | [contracts/scraping-job-input.schema.json](contracts/scraping-job-input.schema.json) | [contracts/scraping-job-input.md](contracts/scraping-job-input.md) |
| RAW_IMPORT Row | 1.0 | [contracts/raw-import-row.schema.json](contracts/raw-import-row.schema.json) | [contracts/raw-import-staging.md](contracts/raw-import-staging.md) |
| Normalization: raw -> LEADS | 1.0 | — | [contracts/normalization-raw-to-leads.md](contracts/normalization-raw-to-leads.md) + [contracts/raw-to-leads-mapping.json](contracts/raw-to-leads-mapping.json) |

Scraping Job Input definuje vstupni payload pro jeden scraping job (1 job = 1 query na 1 portalu v 1 meste/segmentu). 12 poli, vsechna required (nullable pole pouzivaji explicitni null, ne chybejici klic). `source_job_id` je deterministicky odvozen z (portal, segment, city, district, max_results, creation second) pres SHA-256, coz zajistuje idempotenci re-runu stejneho scope.
