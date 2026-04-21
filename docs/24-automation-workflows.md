# Automation Workflows — Autosmartweby

> **Kanonicky dokument.** Aktualizuje se pri zmene automatizacnich procesu.
> **Posledni aktualizace:** 2026-04-17

---

## Triggery v Apps Script

| Trigger | Typ | Frekvence | Funkce | Stav |
|---------|-----|-----------|--------|------|
| processPreviewQueue | Time-based | 15 min | Zpracovani kvalifikovanych leadu | Aktivni (DRY_RUN=true) |
| autoWebCheckTrigger | Time-based | 15 min | Auto web check pro nove leady bez website_url (A-06) | Aktivni (auto-install pres installProjectTriggers, pushed to TEST) |
| autoQualifyTrigger | Time-based | 15 min | Auto kvalifikace po web checku (A-07) | Aktivni (auto-install pres installProjectTriggers, pushed to TEST) |
| onOpen | Spreadsheet | Pri otevreni | Menu | Aktivni |
| onContactSheetEdit | Spreadsheet | Pri editu | Write-back | Aktivni |

## Manualni workflow (z menu)

| Akce | Funkce | Co dela |
|------|--------|---------|
| Setup preview extension | setupPreviewExtension() | Prida chybejici extension sloupce |
| Ensure lead IDs | ensureLeadIds() | Backfill prazdnych lead_id |
| Qualify leads | qualifyLeads() | Kvalifikace + deduplikace |
| Process preview queue | processPreviewQueue() | Brief + draft generovani |
| Rebuild drafts | buildEmailDrafts() | Pregenerovani email draftu |
| Refresh kontaktni sheet | refreshContactingSheet() | Obnova "Ke kontaktovani" |
| Web check 20/50/100 | runWebsiteCheck{N}() | Serper API web lookup |
| Create draft | createCrmDraft() | Gmail draft pro vybrany lead |
| Send email | sendCrmEmail() | Gmail send pro vybrany lead |
| Sync mailbox | syncMailboxMetadata() | Scan Gmailu pro odpovedi |

## Pipeline flow

```
1. qualifyLeads()     → lead_stage, qualified_for_preview, dedupe
2. processPreviewQueue() → template_type, preview_brief, email_draft
3. refreshContactingSheet() → odvozeny sheet s KPI
4. [rucni] createCrmDraft() / sendCrmEmail() → odeslani
5. syncMailboxMetadata() → detekce odpovedi
```

## Feature flags

| Flag | Default | Efekt |
|------|---------|-------|
| DRY_RUN | true | Pipeline se zastavi na BRIEF_READY, bez webhooku |
| ENABLE_WEBHOOK | false | Webhook volani deaktivovano |
| EMAIL_SYNC_ENABLED | true | Mailbox sync aktivni |

## Webhook pipeline (neaktivni)

Kod existuje v processPreviewQueue() a runWebhookPilotTest(). Payload: brief JSON + contact data. Ocekavany response: preview_url, screenshot_url, quality_score. WEBHOOK_URL je prazdny, zadna cilova sluzba.

## Pripravene kontrakty pro budouci automatizaci

| Kontrakt | Verze | Stav | Spec |
|----------|-------|------|------|
| Scraping Job Input | 1.0 | Hotovy (A1) | [contracts/scraping-job-input.md](contracts/scraping-job-input.md) |
| RAW_IMPORT Row | 1.0 | Hotovy (A2) | [contracts/raw-import-staging.md](contracts/raw-import-staging.md) |
| Normalization: raw -> LEADS | 1.0 | Hotovy (A3) | [contracts/normalization-raw-to-leads.md](contracts/normalization-raw-to-leads.md) |

Scraping Job Input kontrakt definuje vstupni payload pro jeden scraping job. RAW_IMPORT Row definuje staging layer mezi scraperem a LEADS. Normalization rules definuji transformaci raw dat na LEADS radek. Samotna implementace jeste neexistuje.

## Ingest flow (scraper -> _raw_import -> LEADS)

Staging-based ingest pipeline. Navrh v A-02 (RAW_IMPORT staging layer). Runtime implementace je kompletni pro lokalni proof:
- **Scraper (A-04)** je hotovy jako Node ESM skript v `scripts/scraper/`
- **Dedupe engine (A-05)** je hotovy v `apps-script/DedupeEngine.gs`
- **Normalizer (A-10)** je implementovany v `apps-script/Normalizer.gs` — `normalizeRawImportRow_()` per A-03 contract vcetne segment slug-to-label mapping (TEST runtime overeno)
- **Staging writer (A-10)** je implementovany v `apps-script/RawImportWriter.gs` — sheet creation, row write, status update, batch orchestrator, LEADS append pres HeaderResolver (TEST runtime overeno)
- **Lokalni proof:** `scripts/test-ingest-runtime.mjs` prochazi celou pipeline (7 rows: 1 reject, 2 hard dup, 4 imported). **TEST runtime proof:** leadsBefore=799, leadsAfter=800, leadsAppended=1.

```
1. Scraper (A-04)      -> insert do _raw_import [status: raw]
2. Normalizer (A-03)   -> parse raw_payload_json, validate, clean
                          -> status: normalized (OK) nebo error (fail)
3. Dedupe (A-05)       -> company_key match proti LEADS + intra-job
                          -> status: normalized (clean) / duplicate_candidate (soft)
                          -> error + rejected_duplicate (hard)
4. Import writer       -> generate lead_id, append LEADS row
                          -> update _raw_import: status: imported
```

**Boundary:** produkcni lead vznika v jedinem atomickem kroku — import writer appenduje do LEADS a zpetne updatuje `_raw_import` na `imported`. Pred tim data neexistuji v LEADS, nejsou viditelna v downstream pipeline.

Viz `docs/contracts/raw-import-staging.md` pro uplny kontrakt (status model, decision model, invariants matrix, sample rows).

## Scraper runtime (A-04)

Implementovano v `scripts/scraper/firmy-cz.mjs` (Node ESM CLI, bez runtime deps). Pro 1 A-01 `ScrapingJobInput` vytvori pole A-02 `RawImportRow` objektu ve stavu `raw` s `processed_by=scraper`.

**Vstup:** JSON soubor s A-01 job inputem (povinne pole viz `docs/contracts/scraping-job-input.md`).
**Vystup:** JSON `{ job, summary, rows, errors }` na stdout nebo do `--out` souboru. `rows` je pole validnich `RawImportRow` objektu (16 sloupcu, 1:1 podle A-02 kontraktu).

### CLI
```
node scripts/scraper/firmy-cz.mjs --job <path> [--mode fixture|live] [--out <path>]
```

### Parsing strategie (firmy.cz)
- **Primary:** JSON-LD schema.org (`LocalBusiness`, `Electrician`, `Plumber`, `HomeAndConstructionBusiness`, `ProfessionalService`, `Store`). Cte `name`, `telephone`, `email`, `url`, `taxID`/`identifier.value`, `address.{addressLocality,addressRegion}`, `contactPoint.name`, `employee[0].name`, `aggregateRating.{ratingValue,reviewCount|ratingCount}`.
- **Fallback 1:** Open Graph (`og:title` → business_name po odstraneni `| firmy.cz` suffixu, `og:url` → canonical).
- **Fallback 2:** regex na stable HTML patterns (`href="tel:..."`, `href="mailto:..."`, `IČO: 12345678`, `href="https://..." ... Webove stranky`).
- **Kategorie:** konkretni `@type` podtyp → `BreadcrumbList` posledni element → `job.segment` fallback.

### Error handling
- **Per-field fail:** try/catch kolem kazdeho pole — selhani jednoho pole ostatnim nezabrani.
- **Per-record fail:** exception na detail stranky NEBO prazdna extrakce (business_name + phone + email vsechny null) → `summary.failed++`, **job pokracuje**.
- **Listing fail:** `job_status=failed` s error_message; prazdne `rows`. Caller rozhodne o retry.

### Modes
- `fixture` (default): deterministicky offline mod, cte `scripts/scraper/samples/fixtures/*.html`. Slouzi pro unit test parseru a reproducibilni sample output pro audit.
- `live`: realne HTTP requesty na `https://www.firmy.cz/` s 1.5s rate limit a identifikujicim User-Agent. Vyzaduje overeni firmy.cz ToS pred pouzitim.

### Acceptance test (fixture run)
```
node scripts/scraper/firmy-cz.mjs --job scripts/scraper/samples/job.sample.json --mode fixture
-> attempted=8 extracted=7 failed=1 skipped=0
```
Vystup: `scripts/scraper/samples/output.sample.json` (7 validnich A-02 rows + 1 per-record failure kvuli nepouzitelnemu fixture souboru).

### Live smoke test (real firmy.cz)
Proveden 2026-04-11 proti `https://www.firmy.cz/` se sample job inputem (`segment=elektrikar`, `city=Praha`, `max_results=10`). Vysledek:
```
attempted=10 extracted=10 failed=0 skipped=0  job_status=completed  duration=15.4s
```
Scraper vratil 10 realnych firem z 10 ruznych mestskych casti Prahy, vsechny 10 A-02 `RawImportRow` compliant. Live output zustava pouze lokalne (`scripts/scraper/samples/output.live.json` je gitignored kvuli realnym kontaktnim udajum).

### Out of scope pro A-04
- Sheet write path (A-04 neperzistuje do `_raw_import`; je to samostatny downstream krok).
- zivefirmy.cz parser (pridava se jako sibling v `lib/` az v dalsim tasku).
- Automaticke spousteni (cron, trigger) — scraper je zatim CLI-only.

## Normalization step (A-03)

Mezi raw vstupem a LEADS zapisem bezi normalizacni vrstva. Kontrakt: `docs/contracts/normalization-raw-to-leads.md`.

**Odpovednost normalizatoru:**
1. Parse `raw_payload_json` (fail -> INVALID_PAYLOAD_JSON).
2. Validace povinnych poli — `business_name` a `city`, minimalne jeden kontakt (`phone` nebo `email`). Fail -> `_raw_import.normalized_status = error` s `rejected_error`.
3. Cleaning pres existujici helpery: `normalizePhone_`, `trimLower_`, `removeDiacritics_`, `canonicalizeUrl_`, `isRealUrl_`. Zadne paralelni funkce.
4. Dopocitat `has_website` z `website_url`.
5. Kopie source metadata z `_raw_import` do 6 novych `source_*` sloupcu v LEADS.
6. Generovat `lead_id` pres sdileny `generateLeadId_()` helper (format `ASW-{ts36}-{rnd4}`, reuse z `PreviewPipeline.gs:63-108`).
7. Predat import writeru; pri uspechu `_raw_import.normalized_status = imported`, `lead_id` vyplneno v obou mistech atomicky.

**Null vs empty policy:** `phone`, `email`, `website_url` jsou vzdy string — `""` pokud invalid, nikdy `null`. Ostatni optional pole (`ico`, `contact_name`, `district`, `rating`, `reviews_count` atd.) zustavaji `null` pri chybejicim vstupu.

**LEADS schema extension:** 6 novych sloupcu append-only na konec `EXTENSION_COLUMNS` v `Config.gs:63`. Legacy 1-20 nedotceno.

## Auto web check hook (A-06)

Automaticky web check pro LEADS radky bez `website_url`. Reusuje `findWebsiteForLead_()` z `LegacyWebCheck.gs`.

**Soubor:** `apps-script/AutoWebCheckHook.gs`

| Funkce | Ucel |
|--------|------|
| `runAutoWebCheck_(opts)` | Hlavni vstup: acquire lock, filtruj, spust web check, zapis vysledky |
| `autoWebCheckTrigger()` | Entry point pro casovy trigger (auto-install pres installProjectTriggers) |
| `runWebCheckForImportedLeads_(leadIds)` | Post-import hook volany z processRawImportBatch_() |

**Filtrovaci pravidla:** `website_url` prazdny, `website_checked_at` prazdny (double-run prevence), `business_name` neprazdny.

**Batch:** max 20 leadu per run (150ms rate limit × 20 = ~3s, bezpecne v 6min GAS limitu).

**Fail handling:** Per-row try/catch, LockService guard, header validation guard.

**Stav:** Lokalne overeno (9 testu, 31 asserti). Live Serper API a Sheets runtime NOT VERIFIED.

## Auto qualify hook (A-07)

Automaticka kvalifikace LEADS radku po web checku. Reusuje `evaluateQualification_()` z `PreviewPipeline.gs`.

**Soubor:** `apps-script/AutoQualifyHook.gs`

| Funkce | Ucel |
|--------|------|
| `runAutoQualify_(opts)` | Hlavni vstup: acquire lock, filtruj, spust kvalifikaci, zapis vysledky |
| `autoQualifyTrigger()` | Entry point pro casovy trigger (auto-install pres installProjectTriggers) |
| `runQualifyForWebCheckedLeads_(leadIds)` | Post-web-check hook volany z runAutoWebCheckInner_() |

**Filtrovaci pravidla:** `lead_stage` prazdny (double-run prevence), `business_name` neprazdny, `website_checked_at` nastaveny NEBO `has_website` ma hodnotu.

**Vysledky:** QUALIFIED / DISQUALIFIED / REVIEW — s `qualification_reason`. Qualified leady dostanou `preview_stage=NOT_STARTED` a `outreach_stage=NOT_CONTACTED`.

**Batch:** max 20 leadu per run. Zapis pres `writeExtensionColumns_()` (changed-only).

**Fail handling:** Per-row try/catch, LockService guard, extension columns guard. Lifecycle guard: radky s neprazdnym lead_stage se preskakuji (zadny overwrite).

**Stav:** TEST runtime overeno (QUALIFIED, DISQUALIFIED, REVIEW, SKIPPED guard). Lokalne: 6 scenaru, 23 asserti. Failure isolation: code structure + local harness.

## Preview queue → BRIEF_READY (A-08)

Uzavira prechod QUALIFIED → BRIEF_READY. `processPreviewQueue()` zpracuje kvalifikovane leady, zapise preview brief (B-01 kontrakt), slug a email draft, a posune `preview_stage` do `BRIEF_READY`.

**Soubory:** `apps-script/PreviewPipeline.gs` (core logic, pre-existing), `apps-script/AutoQualifyHook.gs` (post-qualify hook, A-08)

| Funkce | Ucel |
|--------|------|
| `processPreviewQueue()` | Hlavni vstup: scan LEADS, zapis brief + slug + draft, set `preview_stage=BRIEF_READY` |
| `buildPreviewBrief_(rd)` | B-01 compatible brief builder (18 poli) |
| `buildSlug_(name, city)` | URL-safe slug (max 60 chars, normalized) |
| `composeDraft_(rd)` | Situation-aware email draft (subject + body) |
| `chooseTemplateType_(rd)` | Template selector (48 variant, B-03 family input) |

**Eligibility:** `qualified_for_preview=TRUE` AND `preview_stage ∈ {'', NOT_STARTED, FAILED, REVIEW_NEEDED (legacy), BRIEF_READY}` AND `dedupe_flag !== TRUE`. B-05 `READY_FOR_REVIEW` a `APPROVED` **nejsou** eligible (operator-owned). Idempotence: pokud `preview_stage=BRIEF_READY` a DRY_RUN/no webhook, radek se preskoci (zadny rebuild).

**Zapsana pole per uspesny radek:**
- `template_type`, `preview_brief_json`, `preview_headline`, `preview_subheadline`, `preview_cta`, `preview_slug`
- `preview_stage = BRIEF_READY`, `lead_stage: QUALIFIED → IN_PIPELINE`, `last_processed_at`
- pokud `send_allowed=TRUE`: `email_subject_draft`, `email_body_draft`, `outreach_stage = DRAFT_READY`

**Batch:** `BATCH_SIZE = 100` per run.

**Fail handling:** Per-row `try/catch`. Pri failure → `preview_stage = FAILED`, `preview_error = 'PROCESSING_ERROR: ' + message`, batch pokracuje. `writeExtensionColumns_()` na konci zapise vsechny zmeny changed-only.

**Trigger cesty (dual path):**
1. **Time-based** (pre-existing): 15-min timer `processPreviewQueue` (auto-install pres `installProjectTriggers()`)
2. **Post-qualify hook** (A-08): po uspesne kvalifikaci (`stats.qualified > 0`, ne dry run) vola `runAutoQualify_()` inline `processPreviewQueue()`. Non-fatal: chyba hooku nezneplatni qualify vysledek. Stats: `previewHookInvoked: true` nebo `previewHookError: message`.

**Stav:** LOCAL VERIFIED (6 scenaru, 38 asserti — happy path, send_allowed=FALSE, skip gates, per-row fail isolation, BRIEF_READY idempotence). TEST RUNTIME not verified (vyzaduje clasp push).

## Preview URL return + statusy (B-05)

Uzavira CRM-side smycku mezi A-08 (brief builder) a B-04 endpointem. Apps Script posila webhook dle B-04 contractu (slug v payloadu + auth header), parsuje response do LEADS, a `preview_stage` prechazi do operator-facing lifecycle.

**Soubor:** `apps-script/PreviewPipeline.gs` (webhook call sites), `apps-script/EnvConfig.gs` (secret helper), `apps-script/Config.gs` (enum rozsireni)

**Payload additions (B-04 mandatory):**
- `preview_slug` — B-04 validuje proti `PREVIEW_SLUG_PATTERN`
- header `X-Preview-Webhook-Secret` — timing-safe compare proti `PREVIEW_WEBHOOK_SECRET` env na B-04 strane

**Lifecycle (operator-facing):**

```
NOT_STARTED → BRIEF_READY → GENERATING → READY_FOR_REVIEW → APPROVED (terminal +)
                                       → FAILED           (retry eligible)
```

| Stage | Semantics | Writer |
|-------|-----------|--------|
| `NOT_STARTED` | inicialni, pipeline muze zacit | GAS (qualify step) |
| `BRIEF_READY` | brief JSON hotovy, webhook jeste nevolan | GAS (A-08) |
| `GENERATING` | webhook request in-flight | GAS (B-05) |
| `READY_FOR_REVIEW` | preview_url zapsana, ceka na operatora | GAS (B-05) |
| `APPROVED` | operator manualne potvrdil | Operator (Google Sheets manual) |
| `FAILED` | posledni pokus selhal | GAS (B-05) |

**Response parsing → LEADS write-back (pre-existing, B-05 nezmenil):**
- 200 + ok:true → `preview_url`, `preview_screenshot_url`, `preview_generated_at`, `preview_version`, `preview_quality_score`, `preview_needs_review`, `preview_stage=READY_FOR_REVIEW`, `preview_error=''`
- 200 + ok:false → `preview_stage=FAILED`, `preview_error='Webhook ok=false: <body:300>'`
- HTTP 4xx/5xx | exception → `preview_stage=FAILED`, `preview_error='WEBHOOK_ERROR: <message:300>'`

**Retry rule:** `eligibleStages = ['', 'not_started', 'failed', 'review_needed', 'brief_ready']`. `FAILED` se pri dalsim timer run znovu picnes (natural loop, bez explicit retry counter). `READY_FOR_REVIEW` a `APPROVED` NEJSOU v `eligibleStages` — pipeline je netkne. `GENERATING` take ne (in-flight rowy se neopakuji dokud operator manualne nezresetuje na `NOT_STARTED`).

**Deployment gates (operator-set mimo code):**
- `PREVIEW_WEBHOOK_SECRET` Script Property (match Next.js env)
- `WEBHOOK_URL` Config const nebo Script Property
- `ENABLE_WEBHOOK=true`, `DRY_RUN=false`

**Dva call sites:** `processPreviewQueue()` (timer path) a `runWebhookPilotTest()` (menu path). Identicka logika, symetricke zmeny.

**Stav:** LOCAL VERIFIED (10 scenaru, 42 asserti — S1 success, S2 ok:false, S3-S5 HTTP 400/401/500, S6 network exception, S7 retry eligibility, S8 APPROVED preservation, S9 per-row fail isolation, S10 needs_review flag propagation). TEST RUNTIME not verified (vyzaduje clasp push + Script Properties + B-04 endpoint reachable).

## Ingest quality report (A-09)

Reportovaci vrstva nad ingest funnellem. Pro kazdy `source_job_id` produkuje jeden radek v append-only `_ingest_reports` sheet + full JSON payload do `_asw_logs`. Ne novy subsystem — cista agregace nad `_raw_import` + LEADS.

**Soubor:** `apps-script/IngestReport.gs`

| Funkce | Ucel |
|--------|------|
| `ensureIngestReportsSheet_(ss)` | idempotent sheet create (41 sloupcu) |
| `buildIngestReport_(sourceJobId, rawRows, leadsRows)` | cista funkce: pocita metriky, vraci report objekt (no side effects) |
| `writeIngestReport_(sheet, report)` | append jednoho radku |
| `generateIngestReportForJob(sourceJobId)` | public: build + write + aswLog JSON payload |
| `generateIngestReportsForAllJobs()` | scan distinct source_job_ids v _raw_import + LEADS, per-job try/catch |
| `generateIngestReportPrompt()` | menu entry: UI prompt → generateIngestReportForJob |

**Trigger cesty (dual path):**
1. **Post-batch hook** (automatic): na konci `processRawImportBatch_()` po A-06 auto web check, non-fatal wrap. Sebere distinct `source_job_id` z raw rows v batch-i a pro kazdy vygeneruje report. Vysledek v `stats.ingestReportIds` / `stats.ingestReportError`.
2. **Manual menu** ("Autosmartweby CRM" → "Ingest report → …"):
   - "Report pro source_job_id…" → prompt → jeden report
   - "Report pro vsechny joby" → scan distinct → per-each report

**Report unit:** 1 report = 1 `source_job_id`. Comparison mezi joby = read `_ingest_reports` + filter/sort podle `portal`, `segment`, `city`, `district`, `run_started_at`.

**Strict metric semantics** (viz docs/23 sekce "Ingest quality report"):
- `duplicate_count` = STRICT `import_decision='rejected_duplicate'` only (pending_review separate bucket)
- `brief_ready_count` = STRICT `preview_stage='BRIEF_READY'` only (neinferuje se z brief_json/slug)
- `qualified_or_beyond_count` = canonical funnel metric (A-08 posouva QUALIFIED→IN_PIPELINE)
- `duration_ms_approx` = DERIVED APPROXIMATION (MAX(updated_at) − MIN(scraped_at), ne exact runtime)

**Summary status:** OK / DEGRADED (bottleneck detected) / PARTIAL (A-06/A-07/A-08 nedobehl pro vsechny leads) / FAILED (raw=0 nebo error_rate>0.5).

**Snapshot stage (orthogonal to summary_status):** `RAW_ONLY` / `DOWNSTREAM_PARTIAL` / `FINAL` — identifikuje pozici v lifecycle funnelu, ne kvalitu. Auto-computed z data state; caller muze prepsat pres `opts.snapshotStage`. Post-batch hook v `processRawImportBatch_()` nechava auto-compute: pokud A-06/A-07/A-08 chain dobehl inline, report je `FINAL`; jinak `DOWNSTREAM_PARTIAL`. Filtrovani `snapshot_stage='FINAL'` v sheetu dava definitive-outcome reports; starsi PARTIAL radky zustavaji jako historical trend.

**Bottleneck stages (4):** A:normalize, B:dedupe_import, C:qualify, D:brief_ready. Threshold 0.8.

**Fail handling:** `buildIngestReport_` je pure. `loadRawRowsByJob_` **throws** pri chybejicim required headeru (`source_job_id`, `import_decision`, `normalized_status`) per A-02 contract — malformed sheet fails loudly. Per-job wrapper v `generateIngestReportsForAllJobs` zaloguje ERROR na exception a pokracuje (v bulk scanu). Post-batch hook je non-fatal — chyba reportu nezneplatni import success.

**Collision-safe IDs:** `report_id` format `rpt-{source_job_id}-{ts14}-{uuid8}` kombinuje human-readable timestamp s UUID suffix (`Utilities.getUuid()`) — bezpecne pro concurrent generaci.

**Type-preserving writer:** `reportToRow_()` pres `writeIngestReport_` zachovava numeric typy (counts, rates, durations) v Sheets misto stringifikace — umoznuje sort, aggregation formulas, sparklines.

**Stav:** LOCAL VERIFIED (12 scenaru / 136 asserti — happy, empty, high-duplicate, missing-contacts, errors-dominate, partial, OK, schema sanity, report_id uniqueness, header validation, snapshot_stage differentiation, type preservation). TEST RUNTIME not verified (vyzaduje clasp push + realny _raw_import / LEADS).

## Chybejici automatizace

- Trigger na novy radek v LEADS (neni implementovan)
- Hromadne odesilani emailu (neni implementovano)
- Automaticky scraping (neni implementovan — kontrakt pripraven, viz vyse)
- Preview web generovani (neni implementovano)
- ~~Ingest flow runtime~~ — **DONE** (A-10: normalizer + staging writer + LEADS append, TEST runtime verified)

---

## Workflow Orchestrator — CS2

> **Autoritativni specifikace.** Definuje logickou orchestracni vrstvu nad lifecycle state machine (CS1).
> **Task ID:** CS2
> **Dependency:** CS1 (canonical lifecycle_state)
> **Vytvoreno:** 2026-04-05

---

### 1. Ucel a scope orchestratoru

**Co orchestrator resi:**
- Definuje, co se ma stat po kazde zmene lifecycle_state leadu.
- Urcuje, ktera akce je automaticka, ktera manualni a ktera ceka na cloveka.
- Stanovuje formalni kontrakt pro kazdy workflow step (vstup, vystup, chyba).
- Definuje, kde se zapisuje historie behu pro audit trail.
- Zajistuje, ze zadna state transition nechybi obsluhu.

**Co orchestrator NERESI:**
- Neimplementuje plny workflow engine ani runtime (to je implementacni ukol, ne spec).
- Neimplementuje retry/idempotency politiky (CS3).
- Neimplementuje sendability gate (C-04).
- Neimplementuje outbound queue (C-05).
- Neimplementuje provider abstraction (C-06).
- Neimplementuje follow-up engine (C-08) ani exception queue detailne (C-09).
- Nepridava novou infrastrukturu (message bus, event store) — pracuje s tim, co Apps Script nabizi.

**Vztah k existujicim triggerum:**
Orchestrator je logicka vrstva NAD soucasnymi triggery. Soucasne triggery (15min timer, onOpen, onEdit) jsou MECHANISMUS spousteni; orchestrator je ROZHODOVACI LOGIKA, ktera urcuje, co se po spusteni provede. Triggery zustavaji — orchestrator je strukturuje a doplnuje o chybejici obsluhu stavu.

**Operacni pravidlo — effective_lifecycle_state:**

Orchestrator rozhoduje vzdy nad `effective_lifecycle_state`, ktery se urcuje takto:

```
effective_lifecycle_state =
  IF sloupec lifecycle_state existuje AND neni prazdny
    THEN stored lifecycle_state            (primy zdroj)
    ELSE best-effort transitional fallback mapping podle CS1 sekce 10.4
         (derivace z lead_stage, preview_stage, outreach_stage, email_reply_type)
```

Pravidla:
1. Orchestrator decisioning se **vzdy** ridi `effective_lifecycle_state`. Nikdy se neridi primo hodnotami `lead_stage`, `preview_stage` ani `outreach_stage`.
2. Legacy fields (`lead_stage`, `preview_stage`, `outreach_stage`) **nejsou decision source**. Slouzi pouze jako vstup do fallback mappingu v prechodnem obdobi.
3. Jakmile bude implementovan sloupec `lifecycle_state`, fallback mapping se prestane pouzivat a `effective_lifecycle_state = lifecycle_state` vzdy.
4. Implementace kazdeho workflow stepu MUSI volat spolecnou funkci `getEffectiveLifecycleState_(row)`, ktera tuto logiku zapouzdruje. Zadny step nesmi primo cist legacy fields pro rozhodovani o dalsi akci.

---

### 2. Orchestration model decision

**Rozhodnuti: Hybrid (poll-driven primary + manual + reactive)**

| Slozka | Typ | Priklad |
|--------|-----|---------|
| Automaticka pipeline | **Poll-driven** | 15min timer processPreviewQueue skenuje LEADS pro stavy vyzadujici akci |
| Lidska rozhodnuti | **Manual** | Menu items v Google Sheets (qualifyLeads, sendCrmEmail, preview review) |
| Write-back | **Reactive** | onContactSheetEdit reaguje na zmenu v "Ke kontaktovani" |

**Proc hybrid:**
- Apps Script nema event bus, message queue ani webhook listener (server). Cistě event-driven architektura neni realizovatelna.
- Poll-driven (casovany trigger) je jediny zpusob automatickeho zpracovani. 15min timer uz existuje a funguje.
- Manual akce jsou nutne pro lidska rozhodnuti (review, send, kvalifikace web checku).
- Reaktivni write-back (onEdit) uz existuje a je jediny zpusob, jak zachytit zmeny v "Ke kontaktovani".

**Proc NE ciste event-driven:**
- Apps Script nemuze naslouchat na eventech. Nema persistentni proces, nema message queue, nema subscription model.
- "Event" v kontextu Apps Script je jen sheet trigger nebo casovac — neni to publish/subscribe.

**Proc NE ciste poll-driven:**
- Nektere akce vyzaduji okamzitou reakci (write-back pri editu).
- Nektere akce vyzaduji lidske rozhodnuti, ktere nelze pollovat.
- 90min/den trigger budget neumoznuje agresivni polling vsech stavu.

**Role kazde slozky:**

| Slozka | Co ridi | Priklad |
|--------|---------|---------|
| Time-driven trigger (poll) | Automaticke zpracovani cekajicich leadu | processPreviewQueue kazdych 15 min |
| Manual menu action | Lidska rozhodnuti a batch operace | qualifyLeads(), sendCrmEmail(), review |
| Reactive onEdit | Okamzity write-back zmeny stavu | onContactSheetEdit → LEADS update |
| Scheduled future (target) | Budouci automaticke kroky | Ingest pipeline, auto web check (A-06, A-07) |

---

### 3. Trigger / event katalog

| # | event_name | source | trigger_type | payload_subject | when_emitted | next_action | idempotency |
|---|------------|--------|--------------|-----------------|--------------|-------------|-------------|
| E1 | raw_import_written | Externi / manual | manual | lead | Novy radek pridan do LEADS | Spustit normalizaci | Dedupe pres company_key zamezuje duplicitam |
| E2 | lead_normalized | Ingest pipeline | auto (future) | lead | Data zvalidovana a ocistena | Spustit dedupe | Opakovana normalizace bezpecna (idempotentni) |
| E3 | dedupe_completed | Ingest pipeline | auto (future) | lead | Dedupe check probehl, lead je unikatni | Spustit web check | company_key je deterministicky; opakování vraci stejny vysledek |
| E4 | web_check_completed | runWebsiteCheck*() | manual | lead | Web check pres Serper dokoncen | Spustit kvalifikaci | Serper muze vratit jiny vysledek v case; ale stav se prepise |
| E5 | qualification_completed | qualifyLeads() | manual | lead (batch) | Kvalifikace probehla → QUALIFIED / DISQUALIFIED / REVIEW_REQUIRED | Pokud QUALIFIED → cekat na processPreviewQueue; pokud REVIEW_REQUIRED → cekat na cloveka | Opakovana kvalifikace bezpecna; vysledek zavisi na aktualnim stavu dat |
| E6 | review_resolved | Operator v sheetu | manual | lead | Clovek rozhodl REVIEW_REQUIRED → QUALIFIED nebo DISQUALIFIED | Pokud QUALIFIED → cekat na processPreviewQueue | Jednorázove rozhodnuti; opakování prepise |
| E7 | brief_ready | processPreviewQueue() | scheduled (15min) | lead | Brief JSON + email draft vygenerovan | Pokud DRY_RUN=false → trigger preview_generation_requested; jinak cekat | Brief je idempotentni (prepise predchozi); template_type je deterministicky |
| E8 | preview_generation_requested | processPreviewQueue() | scheduled | lead | Webhook odeslan na externi renderer | Cekat na callback (READY / REVIEW_NEEDED / FAILED) | Webhook muze byt odeslan vicekrat; externi sluzba musi byt idempotentni |
| E9 | preview_generated | Webhook callback (future) | event (future) | lead | Externi renderer vratil vysledek | Pokud quality OK → PREVIEW_APPROVED; jinak → PREVIEW_READY_FOR_REVIEW | Callback muze prijit vicekrat; posledni zapis wins |
| E10 | preview_review_resolved | Operator | manual | lead | Clovek schvalil nebo zamitnul preview | PREVIEW_APPROVED nebo BRIEF_READY (regenerace) | Jednorázove rozhodnuti |
| E11 | outreach_ready | Orchestrator | auto (derived) | lead | Preview schvalen + contact_ready=true + draft existuje | Lead dostupny pro manualni send | Odvozeny stav; neni akce, jen signal |
| E12 | email_queued | Manual / future bulk | manual | lead | Operator pridal lead do fronty k odeslani | Zpracovat send | Double-send guard pres email_sync_status |
| E13 | email_sent | sendCrmEmail() | manual | lead | Email uspesne odeslan pres GmailApp | Cekat na mailbox sync (reply/bounce) | Double-send guard: kontrola outreach_stage pred odeslanim |
| E14 | reply_received | syncMailboxMetadata() | manual | lead | Mailbox sync detekoval REPLY | → REPLIED (terminal) | Idempotentni; sync prepisuje metadata |
| E15 | bounce_received | syncMailboxMetadata() | manual | lead | Mailbox sync detekoval BOUNCE | → BOUNCED (terminal) | Idempotentni; sync prepisuje metadata |
| E16 | unsubscribe_received | Manual / future | manual | lead | Lead pozadal o odhlaseni | → UNSUBSCRIBED (terminal) | Jednorázove; terminal state |
| E17 | processing_failed | processPreviewQueue() / sendCrmEmail() | auto | lead | Chyba v preview generovani nebo email odeslani | → FAILED (review state); cekat na operatora | FAILED je idempotentni; opakuje-li se chyba, zustava FAILED |

**Poznamka:** Eventy E1–E3 (ingest pipeline) dnes neexistuji jako samostatne kroky — qualifyLeads() provadi normalizaci + dedupe + kvalifikaci v jednom behu. Oddeleni je target-state design pro budouci ingest pipeline (A-stream tasks).

---

### 4. Orchestrator responsibilities

**Po zmene lifecycle_state:**

| Novy lifecycle_state | Orchestrator akce | Typ |
|---------------------|-------------------|-----|
| RAW_IMPORTED | Cekat na spusteni normalizace (budouci ingest pipeline) | Zadna automaticka akce dnes |
| NORMALIZED | Cekat na spusteni dedupe (budouci ingest pipeline) | Zadna automaticka akce dnes |
| DEDUPED | Cekat na web check (manual menu) | Zadna automaticka akce dnes |
| WEB_CHECKED | Cekat na kvalifikaci (manual qualifyLeads) | Zadna automaticka akce dnes |
| QUALIFIED | Zaradit do processPreviewQueue fronty | Automaticky pri dalsim 15min cyklu |
| DISQUALIFIED | Zadna akce — terminal state | — |
| REVIEW_REQUIRED | Zastavit processing; cekat na lidske rozhodnuti | Human stop |
| BRIEF_READY | Pokud DRY_RUN=false → zaradit do webhook fronty; jinak cekat na manualni akci | Automaticky (podmineny feature flag) |
| PREVIEW_GENERATING | Cekat na externi vysledek (callback) | Pasivni cekani |
| PREVIEW_READY_FOR_REVIEW | Zastavit processing; cekat na lidske rozhodnuti | Human stop |
| PREVIEW_APPROVED | Overit contact_ready; pokud OK → OUTREACH_READY | Automaticky |
| OUTREACH_READY | Lead dostupny pro manualni send; zobrazit v "Ke kontaktovani" | Zadna automaticka akce |
| EMAIL_QUEUED | Zpracovat odeslani v dalsim send cyklu | Automaticky (budouci C-05) |
| EMAIL_SENT | Cekat na mailbox sync pro detekci odpovedi | Pasivni; sync je manual |
| REPLIED | Zadna akce — terminal state | — |
| BOUNCED | Zadna akce — terminal state | — |
| UNSUBSCRIBED | Zadna akce — terminal state | — |
| FAILED | Zastavit processing; cekat na operatora k diagnostice | Human stop (review) |

**Co orchestrator NESMI delat automaticky:**
1. Menit terminal state (DISQUALIFIED, REPLIED, BOUNCED, UNSUBSCRIBED) — zadna cesta ven.
2. Resolvovat review states (REVIEW_REQUIRED, PREVIEW_READY_FOR_REVIEW, FAILED) — vyzaduje lidske rozhodnuti.
3. Odesilat email bez explicitni lidske akce (soucasny model: per-lead manual send).
4. Preskocit lifecycle vrstvu (napr. QUALIFIED → EMAIL_SENT).
5. Spoustet akci na leadu, ktery je jiz ve zpracovani (guard pres last_processed_at nebo lock).

**Pri failu (FAILED state):**
- Orchestrator zapise FAILED + source error do LEADS (preview_error nebo email_last_error).
- Zapise audit log radek.
- Zastaveni zpracovani leadu — zadny dalsi automaticky krok.
- Operator musi: diagnostikovat, opravit pricinu, manualne presunout lead zpet do BRIEF_READY (T23) nebo EMAIL_QUEUED (T24).

---

### 5. Workflow step kontrakt

**Formalni kontrakt:**

```
{
  step_name:          string       // Unikatni identifikator kroku
  trigger_in:         event_name   // Ktery event tento step spousti
  required_input: {                // Pole, ktera musi byt vyplnena
    lead_id:          string       // Vzdy povinne
    lifecycle_state:  string       // Aktualni stav pred krokem
    [dalsi pole]:     typ          // Specificke pro krok
  }
  preconditions:      string[]     // Podminky, ktere musi platit pred spustenim
  action:             string       // Popis co step dela
  success_output: {
    lifecycle_state_after: string  // Novy stav po uspechu
    side_effects:         string[] // Co jineho se stalo (zapisy, externi volani)
  }
  failure_output: {
    lifecycle_state_after: string  // Novy stav po chybe (nebo beze zmeny)
    error_field:          string   // Kam se zapise chybova informace
  }
  write_targets:      string[]     // LEADS sloupce, do kterych step zapisuje
  retry_eligibility:  string       // Popis retry chovani (handoff na CS3)
  observability: {
    log_level:        string       // INFO / WARN / ERROR
    log_fields:       string[]     // Co se loguje do _asw_logs
  }
}
```

**Priklad 1: qualify_lead**

```
step_name:          "qualify_lead"
trigger_in:         "web_check_completed" (E4)
required_input:     { lead_id, business_name, email, phone, has_website, website_url }
preconditions:      [ "lifecycle_state == WEB_CHECKED", "dedupe_flag != true" ]
action:             "evaluateQualification_() vyhodnoti kriteria a nastavi lead_stage"
success_output:     {
  lifecycle_state_after: "QUALIFIED | DISQUALIFIED | REVIEW_REQUIRED",
  side_effects: ["lead_stage zapsano", "qualification_reason zapsano",
                 "qualified_for_preview zapsano", "outreach_stage=NOT_CONTACTED (pokud QUALIFIED)"]
}
failure_output:     {
  lifecycle_state_after: "(beze zmeny — WEB_CHECKED)",
  error_field: "N/A — kvalifikace nefailuje technicky, vzdy vrati vysledek"
}
write_targets:      ["lead_stage", "qualification_reason", "qualified_for_preview",
                     "outreach_stage", "preview_stage", "personalization_level"]
retry_eligibility:  "Bezpecne opakovatelne — vysledek je deterministicky z aktualniho stavu dat"
observability:      { log_level: "INFO", log_fields: ["lead_id", "qualification_result", "reason"] }
```

**Priklad 2: generate_brief**

```
step_name:          "generate_brief"
trigger_in:         "qualification_completed" → processPreviewQueue (E7)
required_input:     { lead_id, segment, service_type, city, contact_name, email,
                      has_website, website_url }
preconditions:      [ "lifecycle_state == QUALIFIED", "qualified_for_preview == TRUE",
                      "dedupe_flag != true" ]
action:             "chooseTemplateType_(), buildPreviewBrief_(), composeDraft_() →
                     brief JSON + email draft"
success_output:     {
  lifecycle_state_after: "BRIEF_READY",
  side_effects: ["template_type zapsano", "preview_brief_json zapsano",
                 "email_subject_draft + email_body_draft zapsano",
                 "preview_stage=BRIEF_READY", "last_processed_at aktualizovano"]
}
failure_output:     {
  lifecycle_state_after: "FAILED",
  error_field: "preview_error"
}
write_targets:      ["template_type", "preview_slug", "preview_brief_json",
                     "preview_stage", "email_subject_draft", "email_body_draft",
                     "outreach_stage", "personalization_level", "last_processed_at"]
retry_eligibility:  "Bezpecne opakovatelne — brief se prepise. Handoff na CS3 pro retry politiku."
observability:      { log_level: "INFO", log_fields: ["lead_id", "template_type",
                      "personalization_level", "dry_run"] }
```

**Priklad 3: send_email**

```
step_name:          "send_email"
trigger_in:         "email_queued" (E12)
required_input:     { lead_id, email, email_subject_draft, email_body_draft,
                      preview_url (optional) }
preconditions:      [ "lifecycle_state == OUTREACH_READY | EMAIL_QUEUED",
                      "outreach_stage NOT IN (CONTACTED, WON, LOST)",
                      "send_allowed == TRUE", "email is not empty" ]
action:             "GmailApp.sendEmail() nebo createDraft() → email odeslan"
success_output:     {
  lifecycle_state_after: "EMAIL_SENT",
  side_effects: ["outreach_stage=CONTACTED", "email_sync_status=SENT",
                 "last_email_sent_at zapsano"]
}
failure_output:     {
  lifecycle_state_after: "FAILED",
  error_field: "email_last_error"
}
write_targets:      ["outreach_stage", "email_sync_status", "last_email_sent_at",
                     "email_last_error"]
retry_eligibility:  "Opatrne — double-send guard nutny (kontrola outreach_stage). Handoff na CS3."
observability:      { log_level: "INFO", log_fields: ["lead_id", "email", "method (draft/send)"] }
```

**Priklad 4: detect_reply**

```
step_name:          "detect_reply"
trigger_in:         "syncMailboxMetadata manual run" (→ E14/E15)
required_input:     { lead_id, email, email_thread_id (optional) }
preconditions:      [ "lifecycle_state == EMAIL_SENT" ]
action:             "syncMailboxMetadata_() skenuje Gmail → detekce reply/bounce/OOO"
success_output:     {
  lifecycle_state_after: "REPLIED | BOUNCED | (beze zmeny pokud NONE/OOO)",
  side_effects: ["email_reply_type zapsano", "email_last_message_id zapsano",
                 "last_email_received_at zapsano", "CRM label pridano na vlakno"]
}
failure_output:     {
  lifecycle_state_after: "(beze zmeny — EMAIL_SENT)",
  error_field: "email_last_error"
}
write_targets:      ["email_reply_type", "email_thread_id", "email_last_message_id",
                     "last_email_received_at", "email_sync_status", "email_mailbox_account"]
retry_eligibility:  "Bezpecne opakovatelne — sync prepisuje metadata"
observability:      { log_level: "INFO", log_fields: ["lead_id", "reply_type", "thread_id"] }
```

---

### 6. Run history / audit trail design

**Rozhodnuti: Append-only structured log contract v existujicim `_asw_logs` sheetu.**

Proc:
- `_asw_logs` uz existuje, je pouzivany vsemi funkcemi, ma auto-prune (5000 radku).
- Novy sheet by znamenal novou infrastrukturu a duplikovani logu.
- Formalizace payload JSON jako structured contract zajisti auditovatelnost bez zmeny sheetu.

**Source of truth:** `_asw_logs` sheet je jediny source of truth pro workflow run history.

**Granularita:** 1 log radek na 1 lead na 1 step execution. Kazdy radek je append-only — nikdy se needituje zpetne.

#### 6.1 Povinne schema run history zaznamu

Kazdy workflow log radek ma 2 urovne: **sheet sloupce** (existujici format) a **payload JSON** (rozsireni).

**Sheet sloupce (povinne v kazdem radku):**

| Sloupec | Typ | Povinny | Popis |
|---------|-----|---------|-------|
| logged_at | ISO datetime | Ano | Cas zapisu zaznamu |
| level | string | Ano | INFO / WARN / ERROR |
| source | string | Ano | Nazev funkce, ktera zaznam zapsala (= function sloupec) |
| row | number | Ne | Cislo radku v LEADS (pokud relevantni) |
| lead_id | string | Ano* | Identifikator leadu (* prazdny jen u system-level logu bez konkretniho leadu) |
| message | string | Ano | Lidsky citelny popis co se stalo |
| payload | JSON string | Ano | Structured JSON objekt — viz nize |

**Payload JSON (povinne pole):**

| Pole | Typ | Povinny | Popis | Priklad |
|------|-----|---------|-------|---------|
| run_id | string | Ano | Identifikator jednoho vyvolani top-level funkce (= 1 job). Generuje se jednou na zacatku funkce, sdili ho vsechny log zaznamy z toho vyvolani. Format: `run-{functionName}-{YYYYMMDD}-{HHmmss}` | `"run-processPreviewQueue-20260405-143000"` |
| event_id | string | Ano | Unikatni ID zaznamu; format `evt-{YYYYMMDD}-{HHmmss}-{rand4}` | `"evt-20260405-143022-7f2a"` |
| event_name | string | Ano | Nazev eventu z katalogu (sekce 3) | `"brief_ready"` |
| step_name | string | Ano | Nazev workflow stepu (sekce 5) | `"generate_brief"` |
| state_before | string | Ano | effective_lifecycle_state pred krokem | `"QUALIFIED"` |
| state_after | string | Ano | effective_lifecycle_state po kroku (nebo `null` pokud beze zmeny) | `"BRIEF_READY"` |
| outcome | string | Ano | Vysledek kroku (viz tabulka nize) | `"success"` |
| actor_type | string | Ano | Kdo akci spustil | `"system"` / `"user"` / `"trigger"` |
| subject_id | string | Ano | Identifikator subjektu kroku: `lead_id` pro per-lead step, `batch:{pocet}` pro batch-level summary | `"ASW-1712345678-a1b2"` / `"batch:47"` |
| metadata | object | Ne | Dalsi kontextova data specificka pro step | `{ "template_type": "plumber-no-website" }` |

#### 6.2 Korelacni hierarchie

4 urovne dohledavani, kazda s jednoznacnym identifikatorem:

| Uroven | Identifikator | Co reprezentuje | Jak vznikne |
|--------|---------------|-----------------|-------------|
| **Per-lead step** | `lead_id` + `run_id` + `step_name` | Jeden krok pro jeden lead v ramci jednoho jobu | Kazdy log radek ma vsechny 3 hodnoty |
| **Job instance** | `run_id` | Jedno vyvolani top-level funkce (napr. 1× processPreviewQueue) | Generuje se na zacatku funkce, sdili ho vsechny radky z toho vyvolani |
| **Lead workflow** | `lead_id` | Cely zivotni cyklus leadu napric vsemi joby | Sdruzeni vsech radku se stejnym lead_id, razene podle logged_at |
| **Batch obsah** | `run_id` + vsechny `lead_id` | Ktere leady se zpracovaly v jednom jobu | Filtr podle run_id → vsechny unikatni lead_id |

**Pravidla:**
- `run_id` je **povinny** v kazdem payload. Neni volitelny.
- `run_id` obsahuje jmeno funkce → odlisuje typ jobu (processPreviewQueue vs qualifyLeads vs syncMailboxMetadata) bez nutnosti parsovat dalsi pole.
- Batch run vs per-lead step: jeden job (run_id) generuje N per-lead radku (kazdy s vlastnim lead_id a event_id) + volitelne 1 summary radek s `subject_id: "batch:N"`.
- Per-lead manual akce (sendCrmEmail pro 1 lead): run_id se generuje stejne, batch obsahuje 1 lead.

#### 6.3 Outcome hodnoty

| Outcome | Vyznam | Priklad |
|---------|--------|---------|
| `success` | Step dokoncen, lifecycle_state zmenen | Brief uspesne vygenerovan |
| `failed` | Technicka chyba, lead presunut do FAILED | Webhook timeout |
| `skipped` | Lead nevyhovi preconditions, zadna akce | Jiz zpracovany, dedupe_flag=true |
| `blocked` | Lead v terminal nebo review stavu, nelze zpracovat | Lead je DISQUALIFIED |
| `waiting_review` | Lead ceka na lidske rozhodnuti, orchestrator zastavil | REVIEW_REQUIRED, operator musi rozhodnout |

#### 6.4 Dohledavani

| Uroven | Dotaz | Filtr | Vysledek |
|--------|-------|-------|----------|
| **Lead** | Vsechno pro 1 lead | `lead_id == "ASW-..."` (sheet sloupec) | Kompletni lifecycle trail leadu napric vsemi joby |
| **Job** | Vsechno pro 1 job instance | `payload.run_id == "run-processPreviewQueue-20260405-143000"` | Vsechny per-lead kroky + summary z jednoho vyvolani funkce |
| **Batch obsah** | Ktere leady zpracoval job | `payload.run_id == X` → distinct `lead_id` | Seznam leadu v batchi |
| **Per-lead step** | Konkretni krok pro konkretni lead | `lead_id == X AND payload.run_id == Y AND payload.step_name == Z` | 1 radek = 1 krok pro 1 lead v 1 jobu |
| **Failures** | Vsechny faily | `payload.outcome == "failed"` | Vsechny selhane kroky napric joby |
| **Review stops** | Vsechny review zastavky | `payload.outcome == "waiting_review"` | Leady cekajici na operatora |
| **Posledni akce** | Posledni akce pro lead | `lead_id == X` + sort `logged_at` desc | Prvni radek = nejnovejsi |

**Jak odlisit typy jobu:**
- `run_id` obsahuje nazev funkce → `run-processPreviewQueue-*` = batch brief generovani, `run-qualifyLeads-*` = batch kvalifikace, `run-sendCrmEmail-*` = per-lead send.
- Batch job vs per-lead job: batch job ma vice radku se stejnym `run_id` a ruznymi `lead_id`. Per-lead job ma 1 radek s 1 `lead_id`.

**Poznamka k dohledavani v JSON:** Apps Script nema nativni JSON query nad sheet daty. Dohledavani pres payload pole vyzaduje parsovani JSON v kodu nebo export do externi analytiky. Pro zakladni audit staci filtr podle `lead_id` + cteni `message` a `payload` radku.

---

### 7. Sample event payload

```json
{
  "run_id": "run-processPreviewQueue-20260405-143000",
  "event_id": "evt-20260405-143022-7f2a",
  "event_name": "brief_ready",
  "step_name": "generate_brief",
  "state_before": "QUALIFIED",
  "state_after": "BRIEF_READY",
  "outcome": "success",
  "actor_type": "trigger",
  "subject_id": "ASW-1712345678-a1b2",
  "metadata": {
    "template_type": "plumber-no-website",
    "personalization_level": "high",
    "email_draft_generated": true,
    "dry_run": true,
    "row_number": 42
  }
}
```

**Poznamka:** Tento payload se v Apps Scriptu neodesilá jako event — reprezentuje logicky zaznam o tom, co se stalo. Realne se zapise jako JSON v `payload` sloupci `_asw_logs`. V budouci event-driven evolucí (mimo Apps Script) by mohl byt skutecny event.

---

### 8. Sample orchestration run

**Scenar: 1 lead od importu po BRIEF_READY (happy path)**

Lead: "Novak Instalaterstvi", Brno, email: novak@email.cz, telefon: +420123456789, nema web.

```
KROK 1 — Import (manual)
  Stav: (zadny) → RAW_IMPORTED
  Trigger: Operator rucne prida radek do LEADS sheetu.
  Orchestrator: Zadna automaticka akce (ingest pipeline dosud neexistuje).
  Log: { level: INFO, function: "manual_import", lead_id: null,
         message: "New row added", payload: { state_after: "RAW_IMPORTED" } }
  Poznamka: Dnes lead_stage=NEW; RAW_IMPORTED je target-state.

KROK 2 — Kvalifikace (manual, batch)
  Stav: RAW_IMPORTED → ... → WEB_CHECKED → QUALIFIED
  Trigger: Operator spusti qualifyLeads() z menu.
  Preconditions: business_name existuje, email nebo telefon existuje.
  Orchestrator decision: evaluateQualification_ → nema web, ma kontakt → QUALIFIED.
  Side effects: lead_stage=QUALIFIED, qualified_for_preview=TRUE,
                qualification_reason="NO_WEBSITE", outreach_stage=NOT_CONTACTED.
  Log: { level: INFO, function: "qualifyLeads", lead_id: "ASW-...",
         message: "Qualified", payload: { event_name: "qualification_completed",
         state_before: "RAW_IMPORTED", state_after: "QUALIFIED",
         outcome: "success", reason: "NO_WEBSITE" } }
  Poznamka: Dnes qualifyLeads() provadi normalizaci + dedupe + kvalifikaci
  v jednom behu. Ingest sub-kroky (NORMALIZED, DEDUPED, WEB_CHECKED) probihnout
  implicitne — nejsou samostatne sledovany v current implementaci.

KROK 3 — Brief generovani (scheduled, 15min timer)
  Stav: QUALIFIED → BRIEF_READY
  Trigger: processPreviewQueue() se spusti casovym triggerem.
  Preconditions: qualified_for_preview=TRUE, dedupe_flag!=true,
                 preview_stage IN (empty, NOT_STARTED, FAILED).
  Orchestrator decision: Lead splnuje podminky → spustit generate_brief step.
  Action: chooseTemplateType_() → "plumber-no-website".
          buildPreviewBrief_() → brief JSON s headlines, benefits, sections.
          composeDraft_() → email predmet + telo.
  Side effects: template_type, preview_brief_json, email_subject_draft,
                email_body_draft, preview_stage=BRIEF_READY, last_processed_at.
  Success: lifecycle_state → BRIEF_READY.
  Log: { level: INFO, function: "processPreviewQueue", lead_id: "ASW-...",
         message: "Brief generated", payload: { run_id: "run-processPreviewQueue-20260405-143000",
         event_name: "brief_ready", step_name: "generate_brief",
         state_before: "QUALIFIED", state_after: "BRIEF_READY",
         outcome: "success", actor_type: "trigger",
         subject_id: "ASW-...", metadata: { template_type: "plumber-no-website" } } }

KROK 4 — DRY_RUN zastavka
  Stav: BRIEF_READY (zastaven)
  Trigger: processPreviewQueue() zkontroluje DRY_RUN flag.
  Orchestrator decision: DRY_RUN=true → NEZASILAT webhook. Lead zustava BRIEF_READY.
  Log: { level: INFO, function: "processPreviewQueue", lead_id: "ASW-...",
         message: "DRY_RUN active, stopping at BRIEF_READY",
         payload: { outcome: "blocked", reason: "DRY_RUN=true" } }

CO BY SE STALO PRI CHYBE v kroku 3:
  Pokud buildPreviewBrief_() selze (napr. chybejici segment data):
  - lifecycle_state → FAILED
  - preview_error = popis chyby
  - preview_stage = FAILED
  - Log: { level: ERROR, ... outcome: "failed", error: "Missing segment..." }
  - Orchestrator zastavi zpracovani leadu.
  - Operator musi: zkontrolovat data, opravit, manualne presunout do BRIEF_READY (T23).
```

---

### 9. Flow diagram

```
              ┌─────────────┐
              │ RAW_IMPORTED │ ← rucni import / budouci scraper
              └──────┬───────┘
                     │ [future: auto normalize]
              ┌──────▼───────┐
              │  NORMALIZED  │
              └──────┬───────┘
                     │ [future: auto dedupe]
              ┌──────▼───────┐
              │   DEDUPED    │
              └──────┬───────┘
                     │ [manual: runWebsiteCheck*()]
              ┌──────▼───────┐
              │ WEB_CHECKED  │
              └──────┬───────┘
                     │ [manual: qualifyLeads()]
          ┌──────────┼──────────────┐
          ▼          ▼              ▼
   ┌────────────┐ ┌──────────┐ ┌─────────────────┐
   │ QUALIFIED  │ │DISQUALIF.│ │ REVIEW_REQUIRED │
   └──────┬─────┘ │(terminal)│ │ (human review)  │
          │       └──────────┘ └───────┬──┬──────┘
          │                     operator│  │operator
          │                    schvalil │  │zamitnul
          │              ┌──────────────┘  └──→ DISQUALIFIED
          │              ▼
          ├──────────────┘
          │ [scheduled: processPreviewQueue, 15min]
   ┌──────▼───────┐
   │ BRIEF_READY  │◄──────────────────┐
   └──────┬───────┘                   │
          │ [auto: !DRY_RUN]          │ (operator zamitnul / retry)
   ┌──────▼──────────────┐            │
   │ PREVIEW_GENERATING  │            │
   └──┬──────┬───────┬───┘            │
      │      │       │                │
      ▼      ▼       ▼                │
  APPROVED  REVIEW  FAILED ───────────┘
      │    (human)  (human review)
      │      │       │
      │      ▼       └──→ operator → BRIEF_READY (T23)
      │   operator        nebo EMAIL_QUEUED (T24)
      │   schvalil
      │      │
      ▼      ▼
   ┌──────────────────┐
   │  PREVIEW_APPROVED │
   └──────┬────────────┘
          │ [auto: contact_ready check]
   ┌──────▼───────────┐
   │  OUTREACH_READY  │
   └──────┬───────────┘
          │ [manual: sendCrmEmail() / future bulk C-05]
   ┌──────▼───────┐
   │ EMAIL_QUEUED │
   └──────┬───────┘
          │ [auto: GmailApp.sendEmail]
   ┌──────▼───────┐
   │  EMAIL_SENT  │
   └──┬───┬───┬───┘
      │   │   │    [manual: syncMailboxMetadata()]
      ▼   ▼   ▼
  REPLIED BOUNCED UNSUBSCRIBED
  (term.) (term.)  (term.)

Legenda:
  [manual]    = operator spousti z menu
  [scheduled] = 15min timer trigger
  [auto]      = orchestrator provede automaticky po state change
  [future]    = dosud neimplementovano (A-stream / dalsi C tasky)
  (human)     = ceka na lidske rozhodnuti
  (terminal)  = konecny stav, zadny dalsi prechod
```

---

### 10. Mapping na aktualni projekt

#### 10.1 Nalezene aktualni triggery a workflow vstupy

| Trigger / vstup | Soubor | Typ | Stav |
|-----------------|--------|-----|------|
| processPreviewQueue (15min) | PreviewPipeline.gs:871 | Time-based | Aktivni (DRY_RUN=true) |
| onOpen (menu) | Menu.gs:24 | Spreadsheet | Aktivni |
| onContactSheetEdit | ContactSheet.gs:589 | Spreadsheet onEdit | Aktivni |
| qualifyLeads | PreviewPipeline.gs:245 | Manual (menu) | Aktivni |
| buildEmailDrafts | PreviewPipeline.gs:662 | Manual (menu) | Aktivni |
| refreshContactingSheet | ContactSheet.gs:306 | Manual (menu) | Aktivni |
| runWebsiteCheck* | LegacyWebCheck.gs:28-30 | Manual (menu) | Aktivni |
| createCrmDraft / sendCrmEmail | OutboundEmail.gs | Manual (menu) | Aktivni |
| syncMailboxMetadata | MailboxSync.gs:22 | Manual (menu) | Aktivni |
| installProjectTriggers | PreviewPipeline.gs:1324 | One-time setup | Aktivni |

#### 10.2 Current state vs proposed target

| Oblast | Current state | Proposed target (CS2) |
|--------|--------------|----------------------|
| **Rozhodovaci logika** | Rozptylena v kazde funkci; kazda funkce si sama overuje stav a rozhoduje | Orchestrator spec definuje rozhodovaci pravidla centralne; funkce implementuji kroky |
| **State transitions** | Pres lead_stage / preview_stage / outreach_stage nezavisle | Pres canonical lifecycle_state (CS1); auxiliary fields zachovany |
| **Event tracking** | aswLog_ do _asw_logs (timestamp, level, function, lead_id, message, payload) | Rozsireny payload v _asw_logs o run_id, event_name, state_before, state_after, outcome |
| **Ingest pipeline** | Neexistuje jako samostatny krok; qualifyLeads() dela vse | Specifikovany kroky RAW→NORMALIZED→DEDUPED→WEB_CHECKED (future A-stream) |
| **Anti-cycling** | preview_stage guard (skip if already BRIEF_READY+) + dedupe_flag guard | Formalni preconditions per step + last_processed_at + batch run_id |
| **Fail handling** | preview_stage=FAILED, ale neaktualizuje outreach_stage ani lead_stage konzistentne | FAILED je lifecycle review state s explicitnimi resolution paths (T23, T24) |
| **Webhook pipeline** | Kod existuje, ENABLE_WEBHOOK=false, zadna cilova sluzba | Specifikovan jako PREVIEW_GENERATING → callback → PREVIEW_APPROVED/REVIEW/FAILED |
| **Email send orchestration** | Per-lead manual z menu, bez fronty | Specifikovan EMAIL_QUEUED stav pro budouci bulk (C-05) |
| **Mailbox sync → state update** | Detekuje reply/bounce, ale neaktualizuje outreach_stage (M-8) | Specifikovan prechod EMAIL_SENT → REPLIED/BOUNCED via lifecycle_state |

#### 10.3 Mezery a nesoulady

| # | Mezera | Dopad | Poznamka |
|---|--------|-------|----------|
| M1 | **Ingest pipeline neexistuje** — qualifyLeads() dela normalizaci + dedupe + kvalifikaci naraz | Orchestrator nema co orchestrovat v ingest vrstve | Implementace je scope A-stream tasku (A-02, A-03, A-05) |
| M2 | ~~Zadna automaticka kvalifikace po web checku~~ | Vyreseno | A-07 (auto qualify hook) — implementovano a TEST runtime overeno |
| M3 | **processPreviewQueue zastava na BRIEF_READY (DRY_RUN)** | Preview/outreach pipeline za BRIEF_READY neni testovana v produkci | Pipeline od BRIEF_READY dal je specifikovana, ne overena |
| M4 | **Mailbox sync neaktualizuje lifecycle konzistentne** (M-8) | BOUNCED stav se nedostane do outreach_stage | Resi se az implementaci lifecycle_state sloupce |
| M5 | **Email send je per-lead manual bez fronty** | Hromadne odesilani neexistuje | C-05 (outbound queue) |
| M6 | **Zadny trigger na novy radek v LEADS** | Import nespousti zadny automaticky krok | Budouci A-stream task |
| M7 | **Run ID neexistuje** — log zaznamy nejsou korelovane v ramci jednoho batch behu | Audit trail je dohledatelny, ale ne snadno korelovatelny | Spec definuje run_id jako povinne pole s 4-urovnovou korelacni hierarchii; implementace je low-effort zmena |

#### 10.4 Co bude potrebovat navazny task, ale zatim se NEimplementuje

| Task | Co potrebuje od CS2 | Stav |
|------|---------------------|------|
| CS3 (Idempotency & retry) | Step kontrakt definuje retry_eligibility per step; CS3 definuje presne politiky | Handoff pripraveny |
| C-04 (Sendability gate) | Orchestrator definuje OUTREACH_READY preconditions; C-04 je formalizuje | Handoff pripraveny |
| C-05 (Outbound queue) | EMAIL_QUEUED stav specifikovan; C-05 implementuje frontu a bulk send | Handoff pripraveny |
| C-06 (Provider abstraction) | Step kontrakt odděluje akci od providera; C-06 abstrahuje GmailApp/ESP | Handoff pripraveny |
| C-08 (Follow-up engine) | REPLIED terminal v CS1; follow-up je downstream proces | Mimo scope CS2 |
| C-09 (Exception queue) | FAILED review state a resolution paths specifikovany; C-09 formalizuje queue | Handoff pripraveny |

---

## Reliability & Idempotency — CS3

> **Autoritativni specifikace.** Definuje idempotency keys, retry politiku, dead-letter handling a locking pro vsechny automaticke workflow kroky.
> **Task ID:** CS3
> **Dependency:** CS1 (canonical lifecycle_state), CS2 (orchestrator model, step contract, run history)
> **Vytvoreno:** 2026-04-05

---

### 1. Ucel a scope

**Co CS3 resi:**
- Idempotency key pro kazdy automaticky krok — co dela operaci unikatni a jak se detekuje duplikat.
- Retry politiku — kolikrat, s jakym backoffem, pro jake typy failu.
- Dead-letter handling — kam jdou kroky po vycerpani pokusu, jak se dohledaji.
- Locking pravidla — jak zabranit soubehu (double-run) pri concurrent triggeru.
- Formalni oddeleni run correlation, idempotency, lock a retry jako nezavislych vrstev.

**Co CS3 NERESI:**
- Neimplementuje outbound queue schema (C-05).
- Neimplementuje provider abstraction (C-06).
- Neimplementuje full exception queue UX ani resolution workflow (C-09).
- Neimplementuje follow-up engine (C-08).
- Nepridava novou infrastrukturu (message bus, distributed lock) — pracuje s Apps Script LockService + Sheets.
- Neimplementuje runtime kod — toto je specifikace.

**Vztah k CS2:**
CS2 definuje orchestrator model a step contract s polem `retry_eligibility` per step. CS3 formalizuje retry_eligibility do konkretni matice, definuje idempotency keys, ktere CS2 nezavedl, a pridava dead-letter design. CS3 je reliability vrstva NAD CS2 orchestratorem.

**Vztah k budoucim taskum:**
- C-05 (Outbound queue): prebira retry matici pro email send krok; queue schema je scope C-05, ne CS3.
- C-06 (Provider abstraction): CS3 definuje failure classes nezavisle na provideru; C-06 mapuje konkretni provider errory na tyto classes.
- C-09 (Exception queue): CS3 definuje dead-letter zaznam; C-09 formalizuje operator workflow pro resolvovani dead-letter.

---

### 2. Reliability principles

1. **run_id != idempotency key.** run_id (z CS2) je korelacni identifikator jednoho vyvolani funkce. Idempotency key identifikuje konkretni operaci a jeji side effect. Jeden run_id muze obsahovat desitky ruznych idempotency keys (jeden per lead per step).

2. **Idempotency je per step, per side effect.** Kazdy krok ma vlastni idempotency key vztazenou k jeho specificke operaci. generate_brief a send_email maji RUZNE idempotency keys i pro stejny lead.

3. **Retry je povolen jen tam, kde je bezpecny.** Krok s ireverzibilnim side effectem (email send) ma striktnejsi retry pravidla nez krok s prepsovatelnymi zapisy (brief generation).

4. **Permanent fail nesmi nekonecne retryovat.** Kazdy krok ma max_attempts. Po vycerpani → dead-letter. Zadny automaticky retry smycka.

5. **Dead-letter je konec automatickeho zpracovani, ne ztrata zaznamu.** Dead-letter zaznam obsahuje dost informaci pro manualni diagnostiku a re-drive operatorem.

6. **Lock zabranuje soubehu, ale nenahrazuje idempotency.** LockService prevent concurrent execution. Idempotency key preventi duplicate side effects i pri sequentialnim re-runu. Obe vrstvy jsou nutne, zadna nestaci sama.

7. **Manual action neni automaticky retry.** Operatorove rucni akce (menu items) NEJSOU subject retry politiky. Retry se tyka jen automatickych/trigger-driven kroku.

8. **State guard je prvni linie obrany.** Pred kontrolou idempotency key musi krok overit lifecycle preconditions (CS2 step contract). State guard je efektivnejsi nez key lookup — vetsi rychlost, nizsi komplexita.

---

### 3. Katalog automatickych kroku

Kroky relevantni pro CS3 reliability design. Vychazi z realneho kodu (apps-script/) a CS2 step contract.

| # | step_name | current_or_target | trigger_source | subject_type | side_effect_type | fully_automatic |
|---|-----------|-------------------|----------------|--------------|------------------|-----------------|
| S1 | qualify_lead | current | manual (menu qualifyLeads) | lead (batch) | sheet write: lead_stage, qualification fields | Ne (manual trigger, auto processing) |
| S2 | generate_brief | current | scheduled (15min processPreviewQueue) | lead (batch) | sheet write: brief JSON, email drafts, preview_stage | Ano |
| S3 | send_webhook | current (disabled) | scheduled (processPreviewQueue, ENABLE_WEBHOOK=false) | lead | external POST + sheet write: preview_stage | Ano |
| S4 | send_email | current | manual (menu sendCrmEmail) | lead | Gmail send (IREVERZIBILNI) + sheet write: outreach metadata | Ne (manual trigger) |
| S5 | create_draft | current | manual (menu createCrmDraft) | lead | Gmail draft + sheet write | Ne (manual trigger) |
| S6 | sync_mailbox | current | manual (menu syncMailboxMetadata) | lead (batch) | Gmail label (idempotentni) + sheet write: sync metadata | Ne (manual trigger) |
| S7 | web_check | current | manual (menu runWebsiteCheck*) | lead (batch) | external GET (Serper) + sheet write: website fields | Ne (manual trigger) |
| S8 | write_back | current | reactive (onContactSheetEdit) | lead field | sheet write: 1 pole v LEADS z derived sheetu | Ano (trigger) |
| S9 | refresh_contact_sheet | current | manual (menu) | derived sheet | sheet rebuild (idempotentni) | Ne (manual trigger) |
| S10 | normalize_lead | target | auto (future ingest) | lead | sheet write: normalizovana data | Ano (budouci) |
| S11 | dedupe_lead | target | auto (future ingest) | lead | sheet write: dedupe_flag | Ano (budouci) |
| S12 | process_email_queue | target | scheduled (future C-05) | lead (batch) | Gmail send (IREVERZIBILNI) + sheet write | Ano (budouci) |

**Poznamka:** S1, S4, S5, S6, S7, S9 jsou manual-trigger kroky. CS3 retry matice se na ne vztahuje jen v kontextu ROW-LEVEL failu UVNITR batch runu (napr. qualifyLeads zpracovava 200 leadu, 1 failne — retry se tyka toho 1 leadu, ne celeho batch runu). Rucni re-spusteni celeho menu itemu je rozhodnuti operatora, ne automaticky retry.

---

### 4. Idempotency key tabulka

Dva idempotency mody:
- **state-guard-only**: Duplicate execution se detekuje pres stav leadu/pole v LEADS sheetu. Legitimni tam, kde side effect je prepsovateny (sheet write) nebo nativne idempotentni (Gmail addLabel). Formalni content-hash key neni nutny.
- **formal_key**: Duplicate execution se detekuje pres content-hash klíc. Povinny tam, kde side effect je ireverzibilni (email send) nebo externi (webhook POST).

| # | step_name | idempotency_mode | guard / key formula | duplicate_detection_point | duplicate_outcome | uniqueness_boundary |
|---|-----------|------------------|---------------------|---------------------------|-------------------|---------------------|
| S1 | qualify_lead | state-guard-only | `lead_stage NOT IN (IN_PIPELINE, PREVIEW_SENT) AND dedupe_flag != TRUE` | PreviewPipeline.gs:307-321 — pred zapisem kvalifikacnich poli | Skip row — lead uz je v pokrocilem stavu, kvalifikace by downgradovala | Per lead. Opakování se stejnymi daty = stejny vysledek (deterministicke). Opakování se zmenenymi daty = LEGALNI (novy vysledek). |
| S2 | generate_brief | state-guard-only | `preview_stage IN ('', 'not_started', 'failed') AND qualified_for_preview == TRUE AND dedupe_flag != TRUE` | PreviewPipeline.gs:908 (eligibleStages) — pred vstupem do brief generation smycky | Skip row — lead uz ma brief nebo je v pokrocilem stavu (QUEUED, SENT_TO_WEBHOOK, READY) | Per lead. Brief se prepise (idempotentni zapis). Opakování je bezpecne — novy brief nahradi stary. |
| S3 | send_webhook | **formal_key** | `webhook:{lead_id}:{SHA256(preview_brief_json)}` | Pred webhook callem: lookup v _asw_logs pro zaznam s timto klicem a outcome=success | Skip POST — webhook uz zpracoval tento brief. Pouzit existujici vysledek z preview_stage. | Per lead, per brief version. Zmena briefu generuje novy hash → novy POST je LEGALNI. |
| S4 | send_email | **formal_key** | `send:{lead_id}:{SHA256(email + subject + body)}` | Triple check: 1) `outreach_stage NOT IN (contacted, won, lost)` 2) `last_email_sent_at` < 5min guard 3) lookup v _asw_logs pro zaznam s timto klicem a outcome=success | BLOCK — email s timto obsahem uz byl odeslan. Zadna akce. | Per lead, per email obsah. Zmena draftu generuje novy hash → novy send je LEGALNI. |
| S5 | create_draft | state-guard-only | `outreach_stage NOT IN (contacted, won, lost)` | OutboundEmail.gs:357-365 — pred zapisem outreach metadata | Duplikovany draft se vytvori v Gmailu (nedestruktivni); outreach_stage se neprepise (monotonic guard) | Per lead. Gmail draft je reverziblni — duplicita je nepohodlna, ne destruktivni. |
| S6 | sync_mailbox | state-guard-only | `email IS NOT EMPTY` (row filter) — sync prepisuje metadata, zadny guard neni potreba | MailboxSync.gs:69 — per-row try-catch; metadata se vzdy prepisuji aktualnimi hodnotami | Noop — sync prepisuje metadata aktualnim stavem. Duplicitni sync = stejny vysledek. Gmail addLabel je idempotentni. | Per lead. Sync je nativne idempotentni — kazdy beh prepisuje stejne pole aktualnimi daty. |
| S7 | web_check | state-guard-only | `business_name IS NOT EMPTY AND (has_website IS EMPTY OR has_website != 'yes')` (row filter) | LegacyWebCheck.gs:81+ — per-row; vysledek se vzdy prepise | Prepis — novy Serper vysledek nahradi stary. Zmena v case je zadouci (novy web nalezen), ne duplicita. | Per lead. Serper API je read-only (zadny side effect na externi strane). Sheet write je prepsovateny. |
| S8 | write_back | state-guard-only | `lead_id EXISTS AND lead_id.length >= 3 AND identity_match(business_name, city)` + LockService | ContactSheet.gs:621-728 — lock → lead_id validace → identity match → zapis | Lock contention → abort (cell note ⚠). Identity mismatch → abort. Zapis stejne hodnoty = noop. | Per lead, per field, per value. Zapis je idempotentni — stejna hodnota dvakrat = beze zmeny. |
| S9 | refresh_contact_sheet | state-guard-only | LockService tryLock(5000) — rebuild je plne deterministicky z aktualniho stavu LEADS | ContactSheet.gs:308-313 — lock pred rebuild | Lock contention → abort + alert user. Duplicitni rebuild = stejny vysledek (deterministicky z LEADS). | Per sheet. Vysledek zavisi POUZE na aktualnim stavu LEADS — zadna externí zavislost. |
| S10 | normalize_lead | **formal_key** (target) | `norm:{lead_id}:{SHA256(raw_input_fields)}` | Target — neimplementovano. Check: lookup pro zaznam s timto klicem. | Skip pokud uz normalizovano se stejnym inputem. Zmena raw dat → novy hash → opetovná normalizace LEGALNI. | Per lead, per input version. |
| S11 | dedupe_lead | state-guard-only (target) | `company_key je deterministicky (ICO > domena > email > norm. jmeno + mesto)` | Target — castecne v qualifyLeads (PreviewPipeline.gs:262-275). Check: company_key uz existuje v dedup skupinách. | Skip — company_key pro stejna data vraci stejny vysledek. Prvni lead v skupine = canonical, ostatni = dedupe_flag=TRUE. | Per company_key. Deterministicke — opakování vraci stejny vysledek. |
| S12 | process_email_queue | **formal_key** (target) | Stejna strategie jako S4: `send:{lead_id}:{SHA256(email + subject + body)}` | Target — neimplementovano (C-05). Stejna triple-check logika jako S4. | BLOCK — stejna ochrana jako manual send. | Per lead, per email obsah. |

**Oddelení pojmu:**

| Pojem | Co resi | Priklad |
|-------|---------|---------|
| **run_id** (CS2) | Korelace: "tento beh processPreviewQueue" | `run-processPreviewQueue-20260405-143000` — 50 leadu v jednom behu |
| **idempotency key** (CS3) | Deduplikace: "tato operace pro tento lead s timto obsahem" | `brief:ASW-001` nebo `send:ASW-001:{hash}` |
| **LockService** (CS3 sekce 7) | Soubehovost: "nikdo jiny nesmi bezet soucasne" | ScriptLock.tryLock(10000) na processPreviewQueue |

Kazda vrstva resi jiny problem. Zadna nenahrazuje ostatni.

---

### 5. Retry matrix

#### 5.1 Failure classes

| Class | Popis | Priklad | Default chovani |
|-------|-------|---------|-----------------|
| **TRANSIENT** | Docasna chyba; opakovany pokus muze uspet | API timeout, rate limit, lock contention, sheet quota | Auto retry pri dalsim scheduled runu |
| **PERMANENT** | Trvala chyba; retry nepomuze | Invalid email format, missing required data, header mismatch, recipient rejected | → dead-letter, zadny retry |
| **AMBIGUOUS** | Nejiste, zda side effect probehl | Webhook timeout (request odeslan, response nedosel), Gmail send timeout | → HOLD pro manualni overeni, pak retry nebo dead-letter |
| **HUMAN_REVIEW** | Technicky OK, ale vyzaduje lidske rozhodnuti | REVIEW_REQUIRED, PREVIEW_READY_FOR_REVIEW, quality score pod prahem | → cekani na operatora (neni fail, neni retry) |

#### 5.2 Retry matice

Pokryva VSECH 12 kroku z katalogu (sekce 3). Kroky oznacene `[manual]` nemaji automaticky retry — operator rozhoduje o re-runu. Kroky oznacene `[target]` jsou budouci design.

| # | step_name | scope | failure_class | max_attempts | backoff_rule | retry_trigger | terminal_action | notes |
|---|-----------|-------|---------------|--------------|--------------|---------------|-----------------|-------|
| S1 | qualify_lead | current [manual] | TRANSIENT | 3 | Operator re-runs z menu | Manual re-run | dead-letter po 3 failech | Sheet API error; kvalifikace je deterministicka |
| S1 | qualify_lead | current [manual] | PERMANENT | 1 | — | — | dead-letter okamzite | Chybejici povinne pole (business_name, email/phone) |
| S2 | generate_brief | current [auto] | TRANSIENT | 3 | +1 scheduled cycle (15min) | processPreviewQueue timer | dead-letter po 3 failech; preview_stage=FAILED | eligibleStages zahrnuje 'failed' → auto retry |
| S2 | generate_brief | current [auto] | PERMANENT | 1 | — | — | dead-letter okamzite; preview_stage=FAILED | Missing segment, template not found |
| S3 | send_webhook | current [auto, disabled] | TRANSIENT | 3 | +1 scheduled cycle (15min) | processPreviewQueue timer | dead-letter; preview_stage=FAILED | Webhook timeout/5xx |
| S3 | send_webhook | current [auto, disabled] | PERMANENT | 1 | — | — | dead-letter; preview_stage=FAILED | Webhook 4xx, WEBHOOK_URL empty |
| S3 | send_webhook | current [auto, disabled] | AMBIGUOUS | 1 | — | Manual overeni | HOLD — operator overi externi system | Timeout, request mohl projit |
| S4 | send_email | current [manual] | TRANSIENT | 1 | — | Manual only | dead-letter; NIKDY auto retry | IREVERZIBILNI — i transient fail = manual overeni |
| S4 | send_email | current [manual] | PERMANENT | 1 | — | — | dead-letter okamzite | Recipient rejected, invalid email |
| S4 | send_email | current [manual] | AMBIGUOUS | 1 | — | — | HOLD + manual review | Gmail timeout — zkontrolovat Sent folder |
| S5 | create_draft | current [manual] | TRANSIENT | 3 | Operator re-runs z menu | Manual re-run | dead-letter po 3 failech | Gmail API docasna chyba; draft je reverziblni |
| S5 | create_draft | current [manual] | PERMANENT | 1 | — | — | dead-letter okamzite | Chybejici email data, nevalidni recipient |
| S6 | sync_mailbox | current [manual] | TRANSIENT | 3 | +1 manual run | Manual re-run | dead-letter po 3 failech; email_sync_status=ERROR | Gmail search timeout |
| S6 | sync_mailbox | current [manual] | PERMANENT | 1 | — | — | dead-letter; email_sync_status=ERROR | Neexistujici email, permanentni API error |
| S7 | web_check | current [manual] | TRANSIENT | 3 | +1 manual run | Manual re-run | dead-letter; web check skip | Serper API timeout/rate limit |
| S7 | web_check | current [manual] | PERMANENT | 1 | — | — | dead-letter; web check skip | Serper API key invalid |
| S8 | write_back | current [auto/reactive] | TRANSIENT | 1 | — | Dalsi edit trigger | Abort; cell note ⚠ | Lock contention; dalsi edit = novy pokus |
| S8 | write_back | current [auto/reactive] | PERMANENT | 1 | — | — | Abort + cell note | lead_id neexistuje, identity mismatch |
| S9 | refresh_contact_sheet | current [manual] | TRANSIENT | 3 | Operator re-runs z menu | Manual re-run | dead-letter po 3 failech | Lock contention, sheet API error |
| S9 | refresh_contact_sheet | current [manual] | PERMANENT | 1 | — | — | dead-letter okamzite | Source sheet chybi, header mismatch |
| S10 | normalize_lead | **target** | TRANSIENT | 3 | +1 scheduled cycle | Auto (budouci ingest timer) | dead-letter | Budouci A-stream; sheet API error |
| S10 | normalize_lead | **target** | PERMANENT | 1 | — | — | dead-letter okamzite | Budouci A-stream; nevalidni data format |
| S11 | dedupe_lead | **target** | TRANSIENT | 3 | +1 scheduled cycle | Auto (budouci ingest timer) | dead-letter | Budouci A-stream; sheet API error |
| S11 | dedupe_lead | **target** | PERMANENT | 1 | — | — | dead-letter okamzite | Budouci A-stream; company_key generation fail |
| S12 | process_email_queue | **target** | TRANSIENT | 1 | — | Manual only | dead-letter; NIKDY auto retry | Budouci C-05; stejna pravidla jako S4 (IREVERZIBILNI) |
| S12 | process_email_queue | **target** | PERMANENT | 1 | — | — | dead-letter okamzite | Budouci C-05; stejna pravidla jako S4 |
| S12 | process_email_queue | **target** | AMBIGUOUS | 1 | — | — | HOLD + manual review | Budouci C-05; stejna pravidla jako S4 |

**Souhrn retry coverage:**

| Scope | Pocet kroku | Pokryti v retry matici |
|-------|-------------|----------------------|
| Current [auto] | 3 (S2, S3, S8) | Ano — vsechny 3 maji radky pro TRANSIENT + PERMANENT (+ AMBIGUOUS pro S3) |
| Current [manual] | 6 (S1, S4, S5, S6, S7, S9) | Ano — vsech 6 ma radky; retry trigger = manual re-run operatorem |
| Target | 3 (S10, S11, S12) | Ano — vsechny 3 maji radky; design pripraveny pro budouci implementaci |
| **Celkem** | **12** | **12 / 12 = 100% coverage** |

**Klicove principy retry matice:**

1. **send_email NIKDY nema automaticky retry.** I transient fail vyzaduje manualni overeni. Duvod: ireverzibilni side effect (email odeslan, nelze vzit zpet).
2. **generate_brief ma implicitni retry mechanismus**: processPreviewQueue (15min timer) znovu zpracuje leady s preview_stage=FAILED. Retry counter = pocet po sobe jdoucich fail logu pro dany lead.
3. **Backoff je realizovany pres scheduled cycle**, ne pres Utilities.sleep. Apps Script nema persistentni stav mezi behy — "backoff" = preskoceni pri tomto behu, retry pri dalsim behu.
4. **max_attempts tracking**: Retry count se sleduje pres `_asw_logs` — pocet zaznamu s outcome=failed pro dany lead_id + step_name od posledniho outcome=success. Pri implementaci se pridava `retry_count` do payload.

#### 5.3 Retry count tracking

Retry count se NEPERSISTUJE jako sloupec v LEADS. Pocita se z _asw_logs:

```
retry_count pro (lead_id, step_name) =
  pocet po sobe jdoucich radku v _asw_logs
  WHERE lead_id = X AND payload.step_name = Y AND payload.outcome = 'failed'
  od posledniho radku s outcome IN ('success', 'dead_letter') pro stejny lead_id + step_name
  (nebo od prvniho zaznamu, pokud zadny success/dead_letter neexistuje)
```

**Proc ne sloupec v LEADS:**
- Retry count je per-step, ne per-lead. Lead muze mit retry_count=0 pro brief ale retry_count=2 pro webhook.
- Pridani N retry_count sloupcu (jeden per step) by znamenalo schema bloat.
- _asw_logs uz obsahuje vsechny potrebne informace; retry_count je derivovatelny.

**Implementacni poznamka:** Pri implementaci muze byt optimalizovano cache v runtime (promenna v batch runu), ale source of truth je vzdy _asw_logs.

---

### 6. Dead-letter design

#### 6.1 Rozhodnuti

Dead-letter zaznamy se zapisuji do dedickovaneho `_asw_dead_letters` sheetu. Tento sheet je **append-only** a **nikdy se neprunuje**.

`_asw_logs` (CS2 run history) zustava source of truth pro bezne run zaznamy (outcome=success/failed/skipped/blocked/waiting_review) a zachovava si existujici pruning (1000 radku pri >5000). Dead-letter zaznamy do _asw_logs NEPATRI.

**Proc separatni sheet, ne _asw_logs:**
- _asw_logs ma log rotation (Helpers.gs:300-303): prune 1000 radku pri >5000. Otevrene dead-letter zaznamy by mohly byt smazany pred resolution — to je neprijatelne pro audit.
- Dead-letter zaznam neni log — je to formalni eskalacni zaznam s resolution lifecycle (open → resolved / wont_fix). Logy jsou fire-and-forget; dead-letters vyzaduji sledovani.
- Separatni sheet umoznuje primy filtr pres sheet sloupce bez JSON parsing (operator nemusí parsovat payload JSON).
- `_asw_dead_letters` bude maly (desitky zaznamu, ne tisice) — pruning neni potreba.

**Vztah k _asw_logs:**
- Pri dosazeni max_attempts se do _asw_logs zapise bezny zaznam s outcome=failed (posledni pokus).
- Soucasne se zapise radek do _asw_dead_letters s kompletnim kontextem.
- Cross-reference: dead-letter zaznam obsahuje `last_run_id` a `last_event_id` ukazujici na posledni _asw_logs zaznam.
- _asw_logs NEMA outcome `dead_letter` — dead-letter existuje jen v _asw_dead_letters.

#### 6.2 Dead-letter lifecycle

```
1. Step failne → _asw_logs: outcome=failed, retry_count=N
2. Dalsi beh retry → stejny step pro stejny lead (pokud retry_count < max_attempts)
3. retry_count >= max_attempts NEBO failure_class=PERMANENT →
     _asw_logs: outcome=failed (posledni pokus)
     _asw_dead_letters: novy radek s resolution_status=open
4. Operator prohlizi _asw_dead_letters (filtr: resolution_status=open)
5. Operator diagnostikuje a opravuje pricinu
6. Operator manualne re-drivuje krok → novy run v _asw_logs
7. Pokud re-drive uspeje → operator aktualizuje resolution_status na "resolved" v _asw_dead_letters
8. Pokud re-drive znovu failne → novy dead-letter radek (novy dead_letter_id)
```

#### 6.3 Schema `_asw_dead_letters` sheetu

**Sheet se vytvori automaticky pri prvnim dead-letter zapisu** (analogicky k ensureLogSheet_ v Helpers.gs).

**Sloupce (flat — ne JSON, primo filtrovatelne):**

| Sloupec | Typ | Popis |
|---------|-----|-------|
| dead_letter_id | string | Unikatni ID. Format: `dl-{YYYYMMDD}-{HHmmss}-{rand4}` |
| created_at | ISO datetime | Cas zapisu dead-letter zaznamu |
| step_name | string | Ktery krok failnul (napr. "generate_brief") |
| lead_id | string | Identifikator leadu |
| last_run_id | string | run_id posledniho pokusu (cross-ref do _asw_logs) |
| last_event_id | string | event_id posledniho pokusu (cross-ref do _asw_logs) |
| idempotency_key | string | Key z tabulky v sekci 4 (napr. "brief:ASW-123") |
| failure_class | string | TRANSIENT / PERMANENT / AMBIGUOUS |
| retry_count | number | Kolik pokusu probehlo pred dead-letter |
| terminal_reason | string | max_attempts_exceeded / permanent_failure / ambiguous_hold |
| last_error_message | string | Posledni chybova hlaska (truncated 500 chars) |
| state_before | string | effective_lifecycle_state pred krokem |
| suggested_next_action | string | Co by mel operator udelat |
| resolution_status | string | `open` / `resolved` / `wont_fix` |
| resolved_at | ISO datetime | Cas resolution (prazdne dokud open) |
| resolution_note | string | Operator poznamka pri resolution (prazdne dokud open) |

**Pravidla:**
- Sheet je **append-only** — radky se NIKDY nemazou.
- `resolution_status` je jediny sloupec, ktery se zpetne edituje (open → resolved/wont_fix).
- `resolved_at` a `resolution_note` se doplni pri resolution.
- Zadny pruning, zadna rotace, zadny auto-delete.

#### 6.4 Garantie auditovatelnosti

| Vlastnost | Jak je zajistena |
|-----------|------------------|
| **Neztratitelnost** | _asw_dead_letters nema pruning ani rotaci. Radky se nikdy nemazou. |
| **Filtrovatelnost bez JSON** | Vsechny pole jsou flat sloupce — operator filtruje primo v sheetu bez parsovani. |
| **Cross-reference** | last_run_id a last_event_id ukazuji na posledni _asw_logs zaznam pro plny kontext. |
| **Resolution tracking** | resolution_status lifecycle (open → resolved/wont_fix) s casovou znackou a poznamkou. |
| **Oddeleni od run history** | _asw_logs si zachovava pruning (5000 radku); dead-letters nejsou ohrozeny. |

#### 6.5 Dohledavani dead-letter zaznamu

| Dotaz | Filtr (primo v sheetu) |
|-------|------------------------|
| Vsechny otevrene dead-letters | `resolution_status == "open"` |
| Dead-letters pro konkretni lead | `lead_id == "ASW-..."` |
| Dead-letters z konkretniho runu | `last_run_id == "run-processPreviewQueue-..."` |
| Dead-letters podle kroku | `step_name == "generate_brief"` |
| Permanentni faily | `failure_class == "PERMANENT"` |
| Ambiguous holds | `terminal_reason == "ambiguous_hold"` |
| Vyresene dead-letters | `resolution_status == "resolved"` |

---

### 7. Locking rules

#### 7.1 Soucasny stav lockingu v projektu

Projekt dnes pouziva `LockService.getScriptLock()` na 2 mistech:

| Kde | Soubor:radek | Timeout | Co chrani |
|-----|--------------|---------|-----------|
| refreshContactingSheet | ContactSheet.gs:308 | tryLock(5000) | Rebuild derived sheetu — zabranuje concurrent rebuild |
| onContactSheetEdit | ContactSheet.gs:610 | tryLock(5000) | Write-back z derived do LEADS — zabranuje concurrent zapis |

Zadna dalsi funkce LockService nepouziva. processPreviewQueue (15min timer) NEMA lock.

#### 7.2 Lock typy a jejich scope

Apps Script nabizi 3 typy locku. Pro tento projekt:

| Typ | Scope | Pouziti v projektu |
|-----|-------|--------------------|
| ScriptLock | Vsechny vyvolani stejneho scriptu | Ano — dnes 2 mista (viz vyse) |
| DocumentLock | Vsechna vyvolani vazana na stejny dokument | Ne — neni potreba (ScriptLock postacuje) |
| UserLock | Vyvolani stejneho uzivatele | Ne — neni potreba |

**Rozhodnuti: Zustat u ScriptLock.** DocumentLock a UserLock nepridavaji hodnotu pro tento use case (3 uzivatele, 1 spreadsheet, 1 script projekt).

#### 7.3 Lock pravidla per krok

| Step | Vyzaduje lock | Lock typ | Lock scope | Timeout | On contention |
|------|---------------|----------|------------|---------|---------------|
| S2 generate_brief (processPreviewQueue) | **ANO** — chybi dnes | ScriptLock | Cely batch run | tryLock(10000) | Abort run, log WARN; dalsi timer cycle retry |
| S8 write_back (onContactSheetEdit) | Ano — existuje | ScriptLock | Per edit event | tryLock(5000) | Abort, cell note ⚠, log WARN |
| S9 refresh_contact_sheet | Ano — existuje | ScriptLock | Cely rebuild | tryLock(5000) | Abort, alert user, log WARN |
| S1 qualify_lead | Ne | — | — | — | Manual trigger — operator nesmi spustit 2x soucasne (UI to neumozni) |
| S4 send_email | Ne | — | — | — | Manual per-lead — UI dialog blokuje concurrent |
| S6 sync_mailbox | Ne | — | — | — | Manual trigger; idempotentni zapis |
| S7 web_check | Ne | — | — | — | Manual trigger; per-row throttle (150ms sleep) |

#### 7.4 Identifikovana mezera: processPreviewQueue bez locku

**Problem:** processPreviewQueue je volany 15min timerem. Pokud jeden beh trva dele nez 15 minut (blizi se 6min limitu, ale teoreticky mozne pri prekryvu manual + timer), muze bezet soucasne se:
- Dalsim timer-triggered behem
- Manualnim spustenim z menu

**Reseni:** Pridat ScriptLock na zacatek processPreviewQueue s tryLock(10000). Pokud lock neni dostupny, skip cely beh a logovat WARN.

**Proc lock sam nestaci bez idempotency:**
- Lock zabranuje SOUBEZNEMU behu. Ale dva SEQUENCNI behy mohou zpracovat stejny lead, pokud stav nebyl aktualizovan.
- Priklad: Run A zpracuje lead X, ale writeExtensionColumns_ jeste nedokoncil batch zapis. Run B zacne, precte stary stav, zpracuje lead X znovu.
- Reseni: State guard (preview_stage check) je prvni linie. Lock je druha linie. Oboje spolecne zabranuji duplicitam.

#### 7.5 Lock best practices pro Apps Script

1. **Vzdy tryLock(), nikdy waitLock().** waitLock blokuje execution time (6min limit).
2. **Vzdy releaseLock() v finally bloku.** Zabranuje orphan lockum.
3. **Lock timeout: 5-10s.** Kratsi → false contention; delsi → blokovani execution time.
4. **Log lock contention jako WARN.** Umoznuje monitoring frekvence contention.
5. **Lock granularita: script-level.** Per-lead lock neni v Apps Script mozny (LockService nema named locks).

---

### 8. Fail scenare

#### Scenar 1: Preview generation fail (generate_brief — S2)

**Co se presne pokazilo:**
processPreviewQueue (15min timer) zpracovava lead ASW-123. buildPreviewBrief_() selze na chybejicim `segment` poli — lead ma prazdny segment, template selection vrati null.

**Failure class:** PERMANENT (chybejici data, retry nepomuze dokud operator neopravi data).

**Prubeh:**
1. processPreviewQueue zacne batch, dosahne lead ASW-123.
2. chooseTemplateType_() vrati null (segment prazdny).
3. buildPreviewBrief_() hodi exception "Missing segment for template selection".
4. Catch blok: preview_stage=FAILED, preview_error="Missing segment for template selection", last_processed_at aktualizovano.
5. Log: outcome=failed, failure_class=PERMANENT, step_name=generate_brief, retry_count=1.
6. Dalsi 15min beh: processPreviewQueue znovu dosahne ASW-123 (preview_stage=FAILED je v eligibleStages).
7. Retry_count z _asw_logs = 1. max_attempts pro PERMANENT = 1. → outcome=dead_letter.
8. Dead-letter log: terminal_reason=permanent_failure, suggested_next_action="Doplnit segment pole pro lead ASW-123, pak manualne spustit processPreviewQueue".

**Jak se zabrani duplicate side effectu:**
Brief generation je prepsovatena (idempotentni). I kdyby z nejakeho duvodu probehl duplicitni zapis, vysledek je stejny. State guard (preview_stage check) v praxi zabrani duplicitnimu zpracovani.

#### Scenar 2: Email send ambiguous fail (send_email — S4)

**Co se presne pokazilo:**
Operator spusti sendCrmEmail() pro lead ASW-456. GmailApp.sendEmail() hodi timeout exception po 30s. Neni jasne, zda Gmail email odeslal nebo ne.

**Failure class:** AMBIGUOUS (side effect mohl probehnout).

**Prubeh:**
1. Operator vybere lead, potvrdí send v UI dialogu.
2. sendGmailMessage_() zavola GmailApp.sendEmail().
3. Exception: "Service invocation timed out".
4. Catch blok: email_last_error="Service invocation timed out".
5. Log: outcome=failed, failure_class=AMBIGUOUS, step_name=send_email, retry_count=1.
6. **ZADNY automaticky retry** — send_email ma max_attempts=1 pro vsechny failure classes.
7. Okamzite outcome=dead_letter: terminal_reason=ambiguous_hold, suggested_next_action="Zkontrolovat Gmail Sent folder pro email na [recipient]. Pokud odeslan → manualne nastavit outreach_stage=CONTACTED. Pokud neodeslan → manualne re-drive send."
8. outreach_stage NENI aktualizovan (nebylo potvrzeno odeslani).

**Jak se zabrani duplicate side effectu:**
- Operator MUSI pred re-drive zkontrolovat Gmail Sent folder.
- Idempotency key `send:{lead_id}:{SHA256(email+subject+body)}` — pokud _asw_logs uz obsahuje zaznam s timto klicem a outcome=success, re-send je BLOKOVAN.
- Double-send guard (last_email_sent_at < 5min) poskytuje druhou vrstvu ochrany.
- Pokud operator zjisti, ze email BYL odeslan, manualne nastavi outreach_stage=CONTACTED a zapise resolution log.

#### Scenar 3: Mailbox sync fail (sync_mailbox — S6)

**Co se presne pokazilo:**
syncMailboxMetadata() zpracovava batch 150 leadu. Pro lead ASW-789 GmailApp.search() vrati exception "Service temporarily unavailable" (Google API transient error). Zbylych 149 leadu se zpracuje uspesne.

**Failure class:** TRANSIENT (Google API docasna nedostupnost).

**Prubeh:**
1. syncMailboxMetadata() iteruje pres vsechny leady s emailem.
2. Lead ASW-789: GmailApp.search() hodi "Service temporarily unavailable".
3. Row-level catch: email_sync_status=ERROR, email_last_error="Service temporarily unavailable".
4. Log: outcome=failed, failure_class=TRANSIENT, step_name=sync_mailbox, retry_count=1.
5. Batch pokracuje — dalsi leady se zpracuji uspesne (per-row resilience).
6. Operator spusti syncMailboxMetadata() znovu (manual re-run).
7. Lead ASW-789 se znovu zpracuje. Retry_count z _asw_logs = 1. max_attempts = 3.
8a. Pokud tentokrat uspeje → outcome=success, email_sync_status=LINKED/REPLIED/atd.
8b. Pokud failne potřetí → outcome=dead_letter: terminal_reason=max_attempts_exceeded, suggested_next_action="Zkontrolovat Gmail API status. Pokud OK, zkusit manualni sync pro tento konkretni lead."

**Jak se zabrani duplicate side effectu:**
Sync je nativne idempotentni — prepisuje metadata aktualnimi hodnotami. Gmail addLabel je idempotentni (pridani stejneho labelu vicekrat = noop). Duplicitni sync je bezpecny.

---

### 9. Sample dead-letter row

**Radek v `_asw_dead_letters` sheetu:**

| dead_letter_id | created_at | step_name | lead_id | last_run_id | last_event_id | idempotency_key | failure_class | retry_count | terminal_reason | last_error_message | state_before | suggested_next_action | resolution_status | resolved_at | resolution_note |
|----------------|-----------|-----------|---------|-------------|---------------|-----------------|---------------|-------------|-----------------|-------------------|--------------|----------------------|-------------------|-------------|-----------------|
| dl-20260405-144522-d3a1 | 2026-04-05T14:45:22Z | generate_brief | ASW-1712345678-a1b2 | run-processPreviewQueue-20260405-144500 | evt-20260405-144522-d3a1 | brief:ASW-1712345678-a1b2 | TRANSIENT | 3 | max_attempts_exceeded | UrlFetchApp timeout after 30000ms during template fetch | QUALIFIED | Zkontrolovat dostupnost template service. Pokud OK, manualne presunout lead do QUALIFIED a spustit processPreviewQueue. | open | | |

**Soucasne v `_asw_logs` (posledni pokus, bezny fail log):**

| logged_at | level | source | row | lead_id | message | payload |
|-----------|-------|--------|-----|---------|---------|---------|
| 2026-04-05T14:45:20Z | ERROR | processPreviewQueue | 42 | ASW-1712345678-a1b2 | Brief generation failed (attempt 3/3) | `{"run_id":"run-processPreviewQueue-20260405-144500","event_id":"evt-20260405-144520-f1b2","step_name":"generate_brief","outcome":"failed","retry_count":3}` |

**Po resolution operatorem:**

| dead_letter_id | ... | resolution_status | resolved_at | resolution_note |
|----------------|-----|-------------------|-------------|-----------------|
| dl-20260405-144522-d3a1 | ... | resolved | 2026-04-05T16:30:00Z | Template service restartovan, lead re-driven v run-processPreviewQueue-20260405-163000 |

---

### 10. Mapping na aktualni projekt

#### 10.1 Co dnes projekt ma

| Oblast | Soucasny stav | Soubor:radek |
|--------|--------------|--------------|
| LockService | 2 mista: refreshContactingSheet, onContactSheetEdit | ContactSheet.gs:308, 610 |
| State guards | preview_stage eligibleStages, lead_stage IN_PIPELINE guard, outreach_stage monotonic guard, dedupe_flag guard | PreviewPipeline.gs:908, 307, 1037; OutboundEmail.gs:357 |
| Error logging | aswLog_ do _asw_logs, per-row try-catch v batch operacich | Helpers.gs:294; vsude |
| Double-send protection | 5min time window + UI confirmation | OutboundEmail.gs:165-192 |
| Identity verification | business_name + city match pred write-back a send | ContactSheet.gs:698-728; OutboundEmail.gs:194-206 |
| Error state tracking | preview_error, email_last_error, email_sync_status=ERROR | Config.gs:88, 108, 163 |
| Header validation | validateLegacyColHeaders_ pred kritickyma operacemi | Helpers.gs:277; ContactSheet.gs:660; LegacyWebCheck.gs:37 |
| Batch resilience | Per-row try-catch; 1 fail nezastavi batch | PreviewPipeline.gs:286, 924; MailboxSync.gs:69 |

#### 10.2 Co chybi

| Oblast | Co chybi | Dopad | Effort |
|--------|----------|-------|--------|
| Lock na processPreviewQueue | Timer-triggered batch nema lock | Mozny concurrent run (timer + manual) | Low — pridat ScriptLock.tryLock na zacatek funkce |
| Formalni idempotency key pro webhook | send_webhook nema content-hash guard | Mozny duplicate webhook POST | Medium — pridat SHA256(brief_json) pred POST |
| Formalni idempotency key pro email send | Pouze time-based guard (5min), ne content-based | Mozny duplicate email po >5min | Medium — pridat key do _asw_logs + lookup pred send |
| Retry count tracking | Zadny retry counter; FAILED leady se retryuji bez limitu | Mozna nekonecna smycka pro permanentni fail | Medium — derivovat z _asw_logs nebo pridat runtime counter |
| Dead-letter recording | Chybi `_asw_dead_letters` sheet a dead-letter zapis | FAILED leady nejsou eskalovany; zustavaji v FAILED navzdy | Low — vytvorit sheet (analogicky k ensureLogSheet_) + zapis pri max_attempts |
| max_attempts enforcement | Neexistuje; FAILED lead je retryovan pri kazdem cyklu | Zbytecne CPU; trigger budget spotrebovava | Medium — pridat retry_count check pred zpracovanim |
| outcome pole v logu | _asw_logs nema structured outcome (CS2 design, neimplementovano) | Run history dohledavani neni mozne | Medium — implementovat CS2 run history contract |

#### 10.3 Co je target-state design

| Oblast | Target stav | Zavisi na |
|--------|------------|-----------|
| normalize_lead idempotency (S10) | input hash guard | A-stream ingest pipeline implementace |
| dedupe_lead samostatny krok (S11) | company_key dedupe | A-stream ingest pipeline implementace |
| process_email_queue (S12) | Stejna ochrana jako S4 | C-05 outbound queue implementace |
| Webhook idempotency (S3) | brief_hash guard + idempotentni externi sluzba | B-stream preview service |

#### 10.4 Low-effort implementacni kroky

1. **Pridat ScriptLock na processPreviewQueue** — ~5 radku kodu, okamzity ucitek.
2. **Pridat retry_count do aswLog_ payloadu** — rozsireni opts.payload o retry_count pri FAILED outcome.
3. **Pridat dead_letter outcome** — nove outcome value v aswLog_ call pri dosazeni max_attempts.
4. **Pridat max_attempts check** — v processPreviewQueue pred zpracovanim leadu: pocitat FAILED zaznamy v _asw_logs, skip pokud >= max_attempts.

#### 10.5 Casti zavisle na dalsich taskech

| CS3 cast | Zavisi na | Task |
|-----------|-----------|------|
| Email send idempotency key lookup v _asw_logs | CS2 run history implementace (structured payload) | Implementacni task |
| process_email_queue retry (S12) | C-05 outbound queue schema | C-05 |
| Provider-specific error classification | C-06 provider abstraction | C-06 |
| Dead-letter resolution operator workflow | C-09 exception queue UX | C-09 |

---

## Sendability Gate — C-04

> **Autoritativni specifikace.** Definuje pravidla, ktera rozhodnou, zda lead smi vstoupit do outreach faze (auto-send), musi na rucni review, nebo je blokovan.
> **Task ID:** C-04
> **Dependency:** CS1 (canonical lifecycle_state), CS2 (orchestrator step kontrakt)
> **Vytvoreno:** 2026-04-21
> **Scope disclaimer:** Toto je specifikace. Zadny sender, queue, UI ani webhook se v tomto tasku neimplementuje.

---

### 1. Ucel gate

**Kde v lifecycle gate lezi:**
Gate rozhoduje mezi preview vrstvou a outreach vrstvou canonical lifecycle (CS1). Evaluuje se na leadu, ktery doslel do `PREVIEW_APPROVED` nebo `OUTREACH_READY`, a urcuje, zda muze projit do `EMAIL_QUEUED` (T17: `OUTREACH_READY → EMAIL_QUEUED`).

Pozice v CS1 transition grafu:

```
PREVIEW_APPROVED --[T16: contact readiness check]--> OUTREACH_READY
                                                            │
                                                            │  ◄── C-04 Sendability gate evaluator
                                                            ▼
                                                    { AUTO_SEND_ALLOWED → T17: EMAIL_QUEUED
                                                    { MANUAL_REVIEW_REQUIRED → hold in OUTREACH_READY
                                                    { SEND_BLOCKED → hold in OUTREACH_READY + reason
```

**Proc gate existuje:**
- Ochrana sender reputation: zamezit odeslani na invalid / bounce-history adresy a enterprise/spam targety.
- Ochrana dat: zamezit duplicitnimu osloveni (`dedupe_flag`) a osloveni leadu, ktery se odhlasil (UNSUBSCRIBED terminal).
- Obchodni kontrola: zarucit, ze kazdy odchozi mail ma kompletni personalizovany content (subject + body + preview_url + template_type).
- Governance: formalizovat podminky, ktere jsou dnes rozptyleny v evaluateQualification_, sendCrmEmail guards a buildContactReadiness_.

**Co gate rozhoduje:**
Gate nevraci boolean. Vraci prave jeden ze tri canonical outcomes (sekce 2) + (pokud SEND_BLOCKED / MANUAL_REVIEW_REQUIRED) seznam primary_reason + nullable vector dalsich reason codes. Vysledek je ciste funkce vstupnich poli — deterministicky, bez side effects.

---

### 2. Gate outcomes (authoritative set)

Gate vraci prave jednu z techto tri hodnot. **Toto jsou gate outcomes, NE lifecycle states.** Nezamenujte s canonical lifecycle states z CS1.

| # | Outcome | Vyznam | Navazujici akce v lifecycle |
|---|---------|--------|----------------------------|
| 1 | `AUTO_SEND_ALLOWED` | Lead splnuje vsechny podminky, smi jit automaticky do send fronty. | `OUTREACH_READY → EMAIL_QUEUED` (T17) bez lidske akce |
| 2 | `MANUAL_REVIEW_REQUIRED` | Lead neni bezpecny pro auto-send, ale neni hard-blocked. Ceka na operatora. | Lead zustava ve stavu `OUTREACH_READY`; vytvori se review signal (sekce 10) |
| 3 | `SEND_BLOCKED` | Lead NESMI byt odeslan. Bud je v CS1 canonical terminal stavu, nebo mu trvale chybi povinna data, nebo plati compliance suppress. | Lead zustava ve stavu `OUTREACH_READY`; zapise se `sendability_block_reason` (sekce 11) |

**Invarianty:**
1. Presne 1 outcome per evaluaci. Nikdy vice.
2. `SEND_BLOCKED` je exhaustivne pokryt hard blocking reasons (sekce 5). Kazdy block ma pojmenovany reason code.
3. `MANUAL_REVIEW_REQUIRED` je disjunktni mnozina s hard blockers — neni to "slabsi block".
4. `AUTO_SEND_ALLOWED` vyzaduje splneni VSECH hard conditions (sekce 4) a ZADNY review reason nesmi platit.

**Terminologie:**
Tyto nazvy jsou zavedene pro C-04 a nekolidovaly s zadnym existujicim enumem v repu (VERIFIED: grep `AUTO_SEND_ALLOWED|MANUAL_REVIEW_REQUIRED|SEND_BLOCKED` v apps-script/ vraci 0 zasahu k 2026-04-21).

#### 2.1 Terminologicka vrstvena mapa (3 layers)

C-04 rozlisuje tri **ortogonalni** kategorie konceptu. Zadny z nich nesmi byt zamenovan s druhym:

| Vrstva | Co to je | Hodnoty | Source of truth | Zijeste v poli |
|--------|----------|---------|------------------|----------------|
| **A. Canonical lifecycle states (CS1)** | Autoritativni stav leadu v end-to-end flow od importu po reakci. | 18 stavu (RAW_IMPORTED, VALIDATED, NORMALIZED, DEDUP_CHECKED, REVIEW_REQUIRED, QUALIFIED, DISQUALIFIED, BRIEF_READY, PREVIEW_GENERATING, PREVIEW_READY_FOR_REVIEW, PREVIEW_APPROVED, OUTREACH_READY, EMAIL_QUEUED, EMAIL_SENT, REPLIED, BOUNCED, UNSUBSCRIBED, FAILED). **4 terminal:** DISQUALIFIED, REPLIED, BOUNCED, UNSUBSCRIBED. | `docs/21-business-process.md` (CS1) | `lifecycle_state` (future); fallback derivace z CS1 sekce 10.4 |
| **B. Gate outcomes (C-04)** | Trojice rozhodnuti, kterou vraci sendability evaluator na jedne evaluaci. | `AUTO_SEND_ALLOWED`, `MANUAL_REVIEW_REQUIRED`, `SEND_BLOCKED`. | `docs/24-automation-workflows.md` sekce "Sendability Gate — C-04" | `sendability_outcome` (PROPOSED sloupec) |
| **C. Auxiliary / downstream values** | Hodnoty existujicich aux poli, vcetne obchodnich vysledku, ktere stoji **mimo canonical lifecycle**. | `outreach_stage`: NOT_CONTACTED, DRAFT_READY, CONTACTED, RESPONDED, **WON**, **LOST**. `email_sync_status`: NOT_LINKED, SENT, LINKED, …. `email_reply_type`: NONE, REPLY, BOUNCE, OOO, UNKNOWN. `lead_stage`: NEW, QUALIFIED, …. | Apps Script enumy (`Config.gs`, `ContactSheet.gs`); `docs/23-data-model.md`; CS1 sekce 10.2 mapping | Existujici EXTENSION_COLUMNS |

**Klicove pravidlo:** `WON` a `LOST` jsou hodnoty **vrstvy C** (downstream sales outcome na `outreach_stage`). **Nejsou** canonical lifecycle states (vrstva A). CS1 je explicitne vymezuje pryc: `docs/21-business-process.md` sekce 4 a 10.2 ("WON a LOST vyrazeny z canonical lifecycle … jsou downstream sales outcome mimo scope CS1 ('od importu po reakci')"). Zadne slovo "DEAD" se v CS1, C-04 ani v repu neobjevuje — neni to canonical stav, neni to aux hodnota, neni to gate outcome.

**Pri evaluaci leadu s `outreach_stage = WON | LOST`:** CS1 sekce 10.4 fallback derivace je jednoznacna — `effective_lifecycle_state = REPLIED` (lead odpovedel; WON/LOST je downstream obchodni vyhodnoceni odpovedi). Gate proto zachyti takovy lead jako `SEND_BLOCKED` s primary reason `TERMINAL_STATE_REPLIED` (B3), **ne** jako "TERMINAL_STATE_WON" (neexistujici reason code).

---

### 3. Required inputs pro evaluaci

Vsechna pole jsou cteny z aktualniho LEADS radku. Gate NESMI delat externi volani (Serper, Gmail, webhook).

| Field name | Vyznam | Expected shape | Required pro AUTO_SEND | Pri chybeni | Zdroj v systemu |
|------------|--------|----------------|------------------------|-------------|-----------------|
| `lifecycle_state` (effective) | Canonical lifecycle stav z CS1 (nebo fallback derivace) | enum z CS1 sekce 3 | ANO | BLOCK (INVALID_STATE) | Future sloupec; dnes fallback mapping z CS1 sekce 10.4 |
| `email` | Primary recipient | string; valid shape `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` | ANO | BLOCK | LEGACY_COL.EMAIL (col 12); cleaned `cleanEmail_()` v Normalizer.gs:134 |
| `dedupe_flag` | Lead je duplicitni vuci jinemu v LEADS | boolean-like: `true`/`TRUE`/`1` = dup | ANO (musi NEBYT true) | BLOCK (DUPLICATE_BLOCKED) | EXTENSION_COLUMNS.dedupe_flag; set by A-05 dedupe engine |
| `lead_stage` | Kvalifikacni osa (auxiliary) | enum: NEW, QUALIFIED, DISQUALIFIED, REVIEW, IN_PIPELINE, PREVIEW_SENT | ANO (pouze QUALIFIED/PREVIEW_SENT) | BLOCK (INVALID_STATE) | Config.gs:134 LEAD_STAGES |
| `preview_stage` | Preview pipeline osa (auxiliary) | enum: NOT_STARTED, BRIEF_READY, QUEUED, SENT_TO_WEBHOOK, READY, REVIEW_NEEDED, FAILED | ANO (pouze READY) v target stavu | BLOCK (INVALID_STATE) | Config.gs:123 PREVIEW_STAGES |
| `outreach_stage` | Outreach osa (auxiliary field — vrstva C, NE canonical lifecycle). Hodnoty `WON`/`LOST` jsou downstream sales outcomes mimo CS1 — pri evaluaci se derivuji na `effective_lifecycle_state = REPLIED` (CS1 sekce 10.4). | enum: NOT_CONTACTED, DRAFT_READY, CONTACTED, RESPONDED, WON (downstream), LOST (downstream) | ANO (pouze NOT_CONTACTED / DRAFT_READY) | BLOCK (INVALID_STATE pres B1; pripadne TERMINAL_STATE_REPLIED pres B3 pro WON/LOST) | ContactSheet.gs:183-208 |
| `preview_url` | URL na vygenerovany preview web | non-empty URL string | ANO | BLOCK (MISSING_PREVIEW_URL) | EXTENSION_COLUMNS.preview_url; webhook response |
| `email_subject_draft` | Predmet draftu | non-empty string | ANO | BLOCK (MISSING_SUBJECT) | EXTENSION_COLUMNS.email_subject_draft; composeDraft_() |
| `email_body_draft` | Telo draftu | non-empty string | ANO | BLOCK (MISSING_BODY) | EXTENSION_COLUMNS.email_body_draft; composeDraft_() |
| `template_type` | Typ sablony | non-empty enum string (viz chooseTemplateType_) | ANO | BLOCK (MISSING_TEMPLATE_TYPE) | EXTENSION_COLUMNS.template_type; set by processPreviewQueue |
| `personalization_level` | Kvalita personalizace | enum: `high` / `medium` / `basic` / `none` | ANO (musi NEBYT `none` / prazdne) | BLOCK (MISSING_PERSONALIZATION) | EXTENSION_COLUMNS.personalization_level; set by evaluateQualification_ |
| `send_allowed` | Qualifier-level hint z evaluateQualification_ | `TRUE` / `FALSE` string | ANO (musi byt `TRUE`) | BLOCK (QUALIFIER_SEND_DENIED) | EXTENSION_COLUMNS.send_allowed; Config.gs:90 |
| `contact_ready` | Derived readiness z ContactSheet | `TRUE` / `FALSE` string | ANO (musi byt `TRUE`) | REVIEW (CONTACT_READINESS_UNSET) | EXTENSION_COLUMNS.contact_ready; ContactSheet.gs:125 |
| `email_sync_status` | Email sync osa | enum: NOT_LINKED, NOT_FOUND, REVIEW, DRAFT_CREATED, SENT, LINKED, REPLIED, ERROR | ANO (musi NEBYT SENT/LINKED/REPLIED/ERROR) | BLOCK (ALREADY_SENT / EMAIL_ERROR_STATE) | EXTENSION_COLUMNS.email_sync_status |
| `email_reply_type` | Detekovany typ odpovedi | enum: NONE, REPLY, BOUNCE, OOO, UNKNOWN | ANO (musi byt NONE / prazdne / UNKNOWN) | BLOCK (REPLY_RECEIVED / BOUNCED) | EXTENSION_COLUMNS.email_reply_type |
| `last_email_sent_at` | ISO timestamp posledniho odeslani | ISO 8601 nebo prazdne | ANO (musi byt prazdne pro prvni send) | BLOCK (ALREADY_SENT_RECENTLY) pokud `<DOUBLE_SEND_WINDOW_MIN` | EXTENSION_COLUMNS.last_email_sent_at |
| `qualified_for_preview` | Kvalifikacni flag | `TRUE` / `FALSE` string | ANO | BLOCK (QUALIFIER_SEND_DENIED) | EXTENSION_COLUMNS.qualified_for_preview |
| `preview_needs_review` | Preview vyzaduje review | `TRUE` / `FALSE` string | ANO (musi NEBYT `TRUE`) | REVIEW (PREVIEW_NEEDS_REVIEW) | EXTENSION_COLUMNS.preview_needs_review |
| `business_name` | Firma (identity guard) | non-empty string | ANO | BLOCK (MISSING_IDENTITY) | LEGACY_COL.BUSINESS_NAME (col 4) |
| `unsubscribed` | PROPOSED — unsubscribe flag | boolean-like | ANO (musi NEBYT true) | BLOCK (UNSUBSCRIBED) | **PROPOSED FOR C-04** — neexistuje v EXTENSION_COLUMNS (VERIFIED IN REPO: grep `unsubscribed` v Config.gs = 0 zasahu). Viz CS1 N4. Proposed fallback: prazdne = false. Viz sekce 12. |
| `suppressed` | PROPOSED — compliance/manual suppress flag | boolean-like | ANO (musi NEBYT true) | BLOCK (COMPLIANCE_SUPPRESSED) | **PROPOSED FOR C-04** — neexistuje v repu. Slouzi k zachyceni rucniho zakazu (hlavicka GDPR DSR, DPO request). |

**Poznamka k aux vs primary fields:**
Gate nerozhoduje primo nad `lead_stage / preview_stage / outreach_stage`. Vsechny rozhoduji pouze pres `effective_lifecycle_state` (CS2 operacni pravidlo). V prechodnem obdobi se `effective_lifecycle_state` odvozuje z aux fields (CS1 sekce 10.4). Gate implementace MUSI volat `getEffectiveLifecycleState_(row)` — ne primo aux fields.

Aux fields v tabulce vyse jsou uvedeny proto, ze _transitivne_ vstupuji do fallback derivace v prechodnem obdobi. Po implementaci `lifecycle_state` sloupce se gate na ne prestane divat.

---

### 4. Minimal required conditions for AUTO_SEND_ALLOWED

Lead dostane `AUTO_SEND_ALLOWED` **pouze a jen** pokud platí **VSECHNY** nize uvedene podminky soucasne. Neuplnost kterekoli z nich prejde do SEND_BLOCKED (sekce 5) nebo MANUAL_REVIEW_REQUIRED (sekce 6).

| # | Podminka | Formalni check | Proc |
|---|----------|----------------|------|
| H1 | Lifecycle state v outreach-ready mnozine | `effective_lifecycle_state IN { PREVIEW_APPROVED, OUTREACH_READY }` | CS1: jen tyto 2 stavy jsou entry pointy do outreach vrstvy |
| H2 | Lead neni v terminal stavu | `effective_lifecycle_state NOT IN { DISQUALIFIED, REPLIED, BOUNCED, UNSUBSCRIBED }` | CS1 sekce 5: terminal = zadna cesta zpet |
| H3 | Lead neni v review stavu | `effective_lifecycle_state NOT IN { REVIEW_REQUIRED, PREVIEW_READY_FOR_REVIEW, FAILED }` | CS1 sekce 6: review = lidske rozhodnuti, ne auto-send |
| H4 | Email existuje a je validni | `email != "" AND email matches /^[^\s@]+@[^\s@]+\.[^\s@]+$/` | Normalizer.gs:137 cleanEmail_ kontrakt |
| H5 | Lead neni duplicitni | `dedupe_flag != true` (pouze `"TRUE"`/`"true"`/`"1"` = dup; prazdne = not dup) | A-05 dedupe engine |
| H6 | Lead se neodhlasil | `unsubscribed != true` (PROPOSED field; fallback: prazdne = false) | GDPR / compliance |
| H7 | Lead neni compliance-suppressed | `suppressed != true` (PROPOSED) | DPO / DSR zadost |
| H8 | Preview URL existuje | `preview_url != ""` AND looks like URL (`startsWith "http"`) | Content-level requirement |
| H9 | Email subject draft existuje | `email_subject_draft.trim() != ""` | Content-level requirement |
| H10 | Email body draft existuje | `email_body_draft.trim() != ""` | Content-level requirement |
| H11 | Template type vyplnen | `template_type.trim() != ""` | Auditability; segmentace mailingu |
| H12 | Personalization level mimo `none` | `personalization_level IN { "high", "medium", "basic" }` (NE `"none"`, NE `""`) | Business rule — neposilat neznackovane maily |
| H13 | Qualifier explicitne povolil send | `send_allowed == "TRUE"` | evaluateQualification_ gate; Config.gs:90 |
| H14 | Qualified for preview | `qualified_for_preview == "TRUE"` | Navazuje na evaluateQualification |
| H15 | Contact readiness vypoctena a true | `contact_ready == "TRUE"` | buildContactReadiness_ vysledek |
| H16 | Preview nevyzaduje review | `preview_needs_review != "TRUE"` | B-stream webhook quality check |
| H17 | Email jeste nebyl odeslan | `email_sync_status NOT IN { "SENT", "LINKED", "REPLIED", "ERROR" }` AND `last_email_sent_at == ""` | Double-send ochrana; OutboundEmail.gs:165 |
| H18 | Zadna detekovana reply/bounce | `email_reply_type NOT IN { "REPLY", "BOUNCE" }` (NONE / UNKNOWN / OOO / prazdne OK) | Mailbox sync signal; M-8 fix-forward |
| H19 | Identity (business_name) vyplnen | `business_name.trim() != ""` | Identity guard pred send; OutboundEmail.gs:194 |

**Evaluacni pravidlo:** Vsechny H1–H19 musi platit. Pokud jedna neplati, outcome je SEND_BLOCKED s prislusnym reason code (sekce 5) nebo MANUAL_REVIEW_REQUIRED s review reason (sekce 6). Precedence je definovana v sekci 7.

---

### 5. Blocking reasons (SEND_BLOCKED)

Kazdy reason je strojove vyhodnotitelny, ma stable reason code a presnou trigger condition. Block = hard stop, operator musi bud doplnit data, nebo zmenit lifecycle, nebo ponechat v block (neni akce).

**Blocker kategorie** (orthogonal ke vrstvam 2.1):
- **canonical-lifecycle blocker** — lead je v CS1 canonical terminal nebo mimo outreach-ready mnozinu CS1. Trigger se cte z `effective_lifecycle_state`.
- **compliance blocker** — regulacni / legal zakaz (GDPR, DSR, unsubscribe). Trigger se cte z PROPOSED poli `unsubscribed` / `suppressed`.
- **outbound-signal blocker** — signal z uz probehnuveho emailu (sent, reply, bounce, sync error). Trigger se cte z `email_sync_status` / `email_reply_type` / `last_email_sent_at`.
- **data-deficit blocker** — lead nema povinny obsah nebo identity pro odeslani. Trigger se cte z content poli a qualifieru.

| # | Reason code | Kategorie | Lidsky popis | Trigger condition (presne) | Doporuceny next action |
|---|-------------|-----------|--------------|----------------------------|------------------------|
| B1 | `INVALID_STATE` | canonical-lifecycle | Lead neni ve stavu pripravenem k odeslani | `effective_lifecycle_state NOT IN { PREVIEW_APPROVED, OUTREACH_READY }` | Zkontrolovat, proc lead neni v outreach-ready stavu (preview pipeline, qualification); pripadne vratit do flow (T23/T24) |
| B2 | `TERMINAL_STATE_DISQUALIFIED` | canonical-lifecycle | Lead je diskvalifikovan | `effective_lifecycle_state == DISQUALIFIED` (CS1 terminal) | Zadna akce — terminal. Pokud se data zmenila, novy import. |
| B3 | `TERMINAL_STATE_REPLIED` | canonical-lifecycle | Lead jiz odpovedel | `effective_lifecycle_state == REPLIED` (CS1 terminal; zahrnuje downstream `outreach_stage=WON/LOST` pres CS1 sekce 10.4 fallback) | Zadna akce — terminal. Downstream sales handoff. |
| B4 | `TERMINAL_STATE_BOUNCED` | canonical-lifecycle | Email se odrazil | `effective_lifecycle_state == BOUNCED` (CS1 terminal) | Zadna akce — terminal. Kontakt invalid. |
| B5 | `TERMINAL_STATE_UNSUBSCRIBED` | canonical-lifecycle / compliance | Lead se odhlasil | `effective_lifecycle_state == UNSUBSCRIBED` (CS1 terminal) OR `unsubscribed == true` (PROPOSED field) | Zadna akce — terminal. GDPR. |
| B6 | `MISSING_EMAIL` | data-deficit | Email chybi | `email == ""` OR `email == null` | Enrichment (doplnit email), pak re-evaluate gate |
| B7 | `INVALID_EMAIL` | data-deficit | Email ma invalidni tvar | `email != ""` AND `email NOT matches /^[^\s@]+@[^\s@]+\.[^\s@]+$/` | Opravit email manualne, pak re-evaluate |
| B8 | `DUPLICATE_BLOCKED` | data-deficit | Lead je hard duplicate | `dedupe_flag IN { "TRUE", "true", "1", true }` | Zadna akce — duplicate resolution je scope A-05; operator muze mergovat rucne |
| B9 | `MISSING_PREVIEW_URL` | data-deficit | Preview web URL chybi | `preview_url == ""` OR `preview_url NOT startsWith "http"` | Spustit webhook / manual preview generation; re-evaluate po `PREVIEW_APPROVED` |
| B10 | `MISSING_SUBJECT` | data-deficit | Email subject draft chybi | `email_subject_draft.trim() == ""` | Spustit `buildEmailDrafts()` / `processPreviewQueue()`; re-evaluate |
| B11 | `MISSING_BODY` | data-deficit | Email body draft chybi | `email_body_draft.trim() == ""` | Spustit `buildEmailDrafts()` / `processPreviewQueue()`; re-evaluate |
| B12 | `MISSING_TEMPLATE_TYPE` | data-deficit | Template type chybi | `template_type.trim() == ""` | Re-run processPreviewQueue (chooseTemplateType_) |
| B13 | `MISSING_PERSONALIZATION` | data-deficit | Personalization level neni `high/medium/basic` | `personalization_level NOT IN { "high", "medium", "basic" }` (tj. `"none"`, `""`, `null`) | Re-run qualifier; pokud zustane `none`, doplnit data (segment, service_type, city) a re-qualify |
| B14 | `MISSING_IDENTITY` | data-deficit | Chybi business_name | `business_name.trim() == ""` | Opravit data; re-evaluate |
| B15 | `QUALIFIER_SEND_DENIED` | data-deficit | Qualifier explicitne zakazal send | `send_allowed != "TRUE"` OR `qualified_for_preview != "TRUE"` | Zkontrolovat qualification_reason; opravit data, re-run qualifier |
| B16 | `ALREADY_SENT` | outbound-signal | Email byl jiz odeslan | `email_sync_status IN { "SENT", "LINKED" }` OR `last_email_sent_at != ""` | Zadna akce — odeslano. Pokud je potreba re-send, je to follow-up (C-08), ne C-04 retry. |
| B17 | `ALREADY_SENT_RECENTLY` | outbound-signal | Posledni send mimo double-send okno | `last_email_sent_at != ""` AND `(now - last_email_sent_at) < DOUBLE_SEND_WINDOW_MIN` (default 5min; OutboundEmail.gs OUTBOUND_DOUBLE_SEND_MINUTES) | Pockat; pripadne po intervalu manual override (mimo C-04) |
| B18 | `EMAIL_SYNC_ERROR_STATE` | outbound-signal | Email sync je v ERROR | `email_sync_status == "ERROR"` | Diagnostikovat email_last_error, vyresit, re-evaluate |
| B19 | `REPLY_RECEIVED` | outbound-signal | Reply jiz detekovana | `email_reply_type == "REPLY"` | Lead je de facto REPLIED. Lifecycle bude presunut na REPLIED (CS1 terminal). |
| B20 | `BOUNCE_DETECTED` | outbound-signal | Bounce detekovana | `email_reply_type == "BOUNCE"` | Lead je de facto BOUNCED. Lifecycle bude presunut na BOUNCED (CS1 terminal). |
| B21 | `COMPLIANCE_SUPPRESSED` | compliance | Compliance / manual suppress | `suppressed == true` (PROPOSED field) | Zadna akce — vyresit s DPO / compliance ownerem |

**Invarianty:**
1. Vsech 21 reason code je strojove vyhodnotitelnych (zadne "insufficient data" vagni formulace).
2. Reason codes B1–B21 tvori disjunktni mnozinu se review reasons R1–R3 (sekce 6).
3. Pri sem block reasons platnych soucasne se vybere **jediny** primary reason podle precedence (sekce 7). Ostatni mohou byt ulozeny do `sendability_block_reasons[]` jako info.
4. Vsechny `TERMINAL_STATE_*` kody (B2–B5) odkazuji **vyhradne** na CS1 canonical terminal states. Neexistuje `TERMINAL_STATE_WON`, `TERMINAL_STATE_LOST` ani `TERMINAL_STATE_DEAD` — `WON`/`LOST` v `outreach_stage` jsou downstream auxiliary hodnoty (vrstva C) a CS1 fallback je mapuje na `REPLIED` (→ B3).

---

### 6. Review gate rules (MANUAL_REVIEW_REQUIRED)

Review je pro situace, kdy lead NENI bezpecny pro auto-send, ale NENI ani hard-blocked. Operator posoudi a rucne rozhodne (promo do send, nebo override do blocku). Review neposouva lifecycle — lead zustava v `OUTREACH_READY`.

| # | Reason code | Trigger condition | Proc NENI auto-send | Proc NENI hard block | Reviewer action |
|---|-------------|-------------------|---------------------|----------------------|-----------------|
| R1 | `PREVIEW_NEEDS_REVIEW` | `preview_needs_review == "TRUE"` | Preview quality score pod threshold; auto-send by mohl poskodit brand | Preview existuje a ma URL; po ruchem schvaleni je bezpecne odeslat | Otevrit preview URL, schvalit obsah. Pokud OK → nastavit `preview_needs_review=FALSE` + re-evaluate gate. Pokud NOT OK → vratit do BRIEF_READY (T15). |
| R2 | `CONTACT_READINESS_UNSET` | `contact_ready == ""` OR `contact_ready == null` (vyslovne nevyhodnoceno; FALSE je hard block pres B15) | Readiness check nebyl spusten; nelze zarucit uplnost dat | Readiness muze byt TRUE po spusteni `refreshContactingSheet()`; neni to trvaly deficit | Spustit `refreshContactingSheet()`; re-evaluate gate |
| R3 | `PERSONALIZATION_LOW_BUT_COMPLETE` | `personalization_level == "basic"` AND vsechny hard conditions H1–H19 jinak splnene | Basic personalizace ma nizsi reply rate; operator muze chtit rucni kontrolu | Data jsou kompletni, template existuje, email je validni — auto-send by fungoval, jen s nizsi kvalitou | Zkontrolovat email draft; bud schvalit rucni send, nebo doplnit data (segment, service_type) a re-qualify pro `medium`/`high` |

**Invarianty:**
1. Vsechny 3 review reasons jsou disjunktni s hard blockers (B1–B21). Pokud plati zaroven jakykoli hard block, outcome je `SEND_BLOCKED` — ne review.
2. Review reasons jsou **opravitelne** bez zmeny lifecycle. Operator bud uda `preview_needs_review=FALSE`, nebo spusti refresh, nebo doplni data a re-qualify.
3. Review NENI polostav mezi allow a block. Je to explicitni "ceka na cloveka" signal.

**Poznamka k "review kontra block":**
Rozdeleni je podle _opravitelnosti a bezpecnosti_:
- **Block** = bud terminal stav (nevratne), nebo deficit, ktery vyzaduje opravu dat / pipeline kroku. Auto-send by byl nevalidni (missing email, ALREADY_SENT atd.).
- **Review** = data jsou _uplne_, ale je pritomen kvalitativni signal, ktery si vyzada lidsky sanity check (low personalization, preview quality pod thresholdem). Operator ma vsechny inputs; jen to neni automaticky bezpecne.

---

### 7. Decision order / precedence

Pri soubehu vice podminek gate vyhodnocuje v tomto deterministic order. Vrati prvni match → outcome + primary reason code.

```
ORDER 1. Hard state blockers (terminal + invalid state)
        B2  TERMINAL_STATE_DISQUALIFIED
        B3  TERMINAL_STATE_REPLIED
        B4  TERMINAL_STATE_BOUNCED
        B5  TERMINAL_STATE_UNSUBSCRIBED
        B1  INVALID_STATE              (lifecycle_state mimo outreach-ready mnozinu)

ORDER 2. Compliance / legal
        B21 COMPLIANCE_SUPPRESSED
        B5  TERMINAL_STATE_UNSUBSCRIBED (pres unsubscribed flag — redundantni s ORDER 1, zaruka)

ORDER 3. Already-sent a reply/bounce signals
        B16 ALREADY_SENT
        B19 REPLY_RECEIVED
        B20 BOUNCE_DETECTED
        B18 EMAIL_SYNC_ERROR_STATE
        B17 ALREADY_SENT_RECENTLY

ORDER 4. Kvalifikacni deficity
        B15 QUALIFIER_SEND_DENIED    (send_allowed != TRUE OR qualified_for_preview != TRUE)
        B8  DUPLICATE_BLOCKED

ORDER 5. Identity / contact deficity
        B14 MISSING_IDENTITY         (business_name prazdne)
        B6  MISSING_EMAIL
        B7  INVALID_EMAIL

ORDER 6. Content deficity
        B9  MISSING_PREVIEW_URL
        B12 MISSING_TEMPLATE_TYPE
        B10 MISSING_SUBJECT
        B11 MISSING_BODY
        B13 MISSING_PERSONALIZATION

ORDER 7. Review cases (pouze pokud ZADNY hard block vyse nesplnen)
        R1  PREVIEW_NEEDS_REVIEW
        R2  CONTACT_READINESS_UNSET
        R3  PERSONALIZATION_LOW_BUT_COMPLETE

ORDER 8. Allow
        AUTO_SEND_ALLOWED             (vsechny H1–H19 splnene; zadny B*, zadny R*)
```

**Pravidla precedence:**
1. Terminal / legal / compliance ma nejvyssi prioritu — nikdy se na terminal lead nepokousime overit content.
2. Already-sent checks jsou pred kvalifikacnimi — pokud byl email odeslan, jsou ostatni kontroly irelevantni.
3. Hard blockers (B1–B21) maji vzdy prednost pred review (R1–R3). Lead nemuze byt _zaroven_ block i review.
4. V ramci stejne ORDER urovne je poradi dane cislovanim v tabulce vyse.
5. Pri absenci jakychkoli B* i R* → `AUTO_SEND_ALLOWED`.

---

### 8. Deterministic decision tree (pseudocode evaluator)

Formalni specifikace evaluatoru. Implementacni funkce ma mit presne tuto strukturu — zadne vnoreni, zadny early return mimo vyslednou strukturu, zadne side effects.

```
function evaluateSendabilityGate(row):
    # Vstup: LEADS row (vsechna pole z sekce 3)
    # Vystup: { outcome, primary_reason, reasons[] }

    # -- Normalize inputs (ciste funkce, bez side effects) --
    state        = getEffectiveLifecycleState(row)   # CS2 helper
    email        = trim(row.email).toLowerCase()
    emailValid   = email != "" AND email matches /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    dedupe       = parseBool(row.dedupe_flag)
    unsub        = parseBool(row.unsubscribed)        # PROPOSED; default false
    suppress     = parseBool(row.suppressed)          # PROPOSED; default false
    sendAllowed  = row.send_allowed == "TRUE"
    qualForPrev  = row.qualified_for_preview == "TRUE"
    contactReady = row.contact_ready                   # "TRUE"/"FALSE"/""
    preview_url  = trim(row.preview_url)
    subject      = trim(row.email_subject_draft)
    body         = trim(row.email_body_draft)
    template     = trim(row.template_type)
    pLevel       = trim(row.personalization_level).toLowerCase()
    pNeedsReview = row.preview_needs_review == "TRUE"
    syncStatus   = trim(row.email_sync_status).toUpperCase()
    replyType    = trim(row.email_reply_type).toUpperCase()
    lastSentAt   = trim(row.last_email_sent_at)
    businessName = trim(row.business_name)
    recentSend   = lastSentAt != "" AND minutesSince(lastSentAt) < DOUBLE_SEND_WINDOW_MIN

    reasons = []

    # ========== ORDER 1: Hard state blockers ==========
    if state == DISQUALIFIED:      return block("TERMINAL_STATE_DISQUALIFIED")
    if state == REPLIED:           return block("TERMINAL_STATE_REPLIED")
    if state == BOUNCED:           return block("TERMINAL_STATE_BOUNCED")
    if state == UNSUBSCRIBED:      return block("TERMINAL_STATE_UNSUBSCRIBED")
    if state NOT IN { PREVIEW_APPROVED, OUTREACH_READY }:
                                   return block("INVALID_STATE")

    # ========== ORDER 2: Compliance / legal ==========
    if suppress:                   return block("COMPLIANCE_SUPPRESSED")
    if unsub:                      return block("TERMINAL_STATE_UNSUBSCRIBED")

    # ========== ORDER 3: Already-sent / reply-bounce ==========
    if syncStatus IN { SENT, LINKED } OR lastSentAt != "":
                                   return block("ALREADY_SENT")
    if replyType == REPLY:         return block("REPLY_RECEIVED")
    if replyType == BOUNCE:        return block("BOUNCE_DETECTED")
    if syncStatus == ERROR:        return block("EMAIL_SYNC_ERROR_STATE")
    if recentSend:                 return block("ALREADY_SENT_RECENTLY")

    # ========== ORDER 4: Kvalifikacni deficity ==========
    if NOT sendAllowed OR NOT qualForPrev:
                                   return block("QUALIFIER_SEND_DENIED")
    if dedupe:                     return block("DUPLICATE_BLOCKED")

    # ========== ORDER 5: Identity / contact ==========
    if businessName == "":         return block("MISSING_IDENTITY")
    if email == "":                return block("MISSING_EMAIL")
    if NOT emailValid:             return block("INVALID_EMAIL")

    # ========== ORDER 6: Content deficity ==========
    if preview_url == "" OR NOT preview_url.startsWith("http"):
                                   return block("MISSING_PREVIEW_URL")
    if template == "":             return block("MISSING_TEMPLATE_TYPE")
    if subject == "":              return block("MISSING_SUBJECT")
    if body == "":                 return block("MISSING_BODY")
    if pLevel NOT IN { "high", "medium", "basic" }:
                                   return block("MISSING_PERSONALIZATION")

    # ========== ORDER 7: Review cases ==========
    if pNeedsReview:               return review("PREVIEW_NEEDS_REVIEW")
    if contactReady NOT IN { "TRUE" }:
        if contactReady == "":     return review("CONTACT_READINESS_UNSET")
        else:                      return block("QUALIFIER_SEND_DENIED")   # contact_ready == "FALSE" = hard deficit
    if pLevel == "basic":          return review("PERSONALIZATION_LOW_BUT_COMPLETE")

    # ========== ORDER 8: Allow ==========
    return allow()


function block(code):
    return { outcome: "SEND_BLOCKED",            primary_reason: code, reasons: [code] }

function review(code):
    return { outcome: "MANUAL_REVIEW_REQUIRED",  primary_reason: code, reasons: [code] }

function allow():
    return { outcome: "AUTO_SEND_ALLOWED",       primary_reason: null, reasons: [] }
```

**Determinizmus garancie:**
- Zadne I/O (sheet.getRange, UrlFetch, Session) — vsechny vstupy jsou v `row`.
- Zadny state mimo argument — funkce je ciste mapping row → outcome.
- Poradi if-veti je fixovane precedence (sekce 7). Pri stejnem row vrati vzdy stejny outcome.
- Zadne random / time-based rozhodovani mimo `recentSend` (kontrolovane `DOUBLE_SEND_WINDOW_MIN` konstantou).

---

### 9. Sample lead cases

Pet realistickych scenaru, 2 AUTO_SEND + 2 BLOCK + 1 REVIEW. Vsechny inputs jsou formalne validni subsety relevantnich poli.

#### Sample 1 — AUTO_SEND_ALLOWED (happy path)

```yaml
lead_id:               ASW-1712345678-a1b2
business_name:         "Novák Instalatérství"
email:                 novak@instalater-novak.cz
dedupe_flag:           ""
lead_stage:            QUALIFIED
preview_stage:         READY
outreach_stage:        NOT_CONTACTED
qualified_for_preview: "TRUE"
send_allowed:          "TRUE"
contact_ready:         "TRUE"
preview_url:           https://preview.asw.cz/novak-instalaterstvi
email_subject_draft:   "Nový web pro vaše instalatérství v Brně"
email_body_draft:      "Dobrý den pane Nováku, ...(300 slov)..."
template_type:         "plumber-no-website"
personalization_level: "high"
preview_needs_review:  "FALSE"
email_sync_status:     ""
email_reply_type:      ""
last_email_sent_at:    ""
unsubscribed:          ""
suppressed:            ""
```

- **effective_lifecycle_state:** `OUTREACH_READY` (preview_stage=READY + outreach_stage=NOT_CONTACTED per CS1 sekce 10.4 pravidlo 4)
- **Expected outcome:** `AUTO_SEND_ALLOWED`
- **Primary reason:** `null`
- **Zduvodneni:** H1 (state OUTREACH_READY), H4 (email valid), H5–H7 (no dedupe/unsub/suppress), H8–H12 (vsechen content komplet), H13–H15 (send_allowed, qualified, contact_ready = TRUE), H16 (preview OK), H17 (nikdy neodeslan), H18 (zadna reply/bounce), H19 (identity OK). Vsech 19 hard conditions splneno. Zadny review reason neplati (personalization=high, preview_needs_review=FALSE, contact_ready=TRUE). → ORDER 8 → allow.

#### Sample 2 — AUTO_SEND_ALLOWED (PREVIEW_APPROVED vstup)

```yaml
lead_id:               ASW-1712355999-c3d4
business_name:         "Elektrikář Svoboda s.r.o."
email:                 info@elektrikar-svoboda.cz
dedupe_flag:           ""
lead_stage:            PREVIEW_SENT
preview_stage:         READY
outreach_stage:        DRAFT_READY
qualified_for_preview: "TRUE"
send_allowed:          "TRUE"
contact_ready:         "TRUE"
preview_url:           https://preview.asw.cz/elektrikar-svoboda
email_subject_draft:   "Ostrava — nová prezentace vaší firmy"
email_body_draft:      "Dobrý den, ...(250 slov)..."
template_type:         "electrician-weak-website"
personalization_level: "medium"
preview_needs_review:  "FALSE"
email_sync_status:     "NOT_LINKED"
email_reply_type:      "NONE"
last_email_sent_at:    ""
unsubscribed:          ""
suppressed:            ""
```

- **effective_lifecycle_state:** `PREVIEW_APPROVED` (lead_stage=PREVIEW_SENT per CS1 sekce 10.2 mapping)
- **Expected outcome:** `AUTO_SEND_ALLOWED`
- **Primary reason:** `null`
- **Zduvodneni:** H1 (state PREVIEW_APPROVED — v outreach-ready mnozine), H4 (email valid), vsechen content komplet, personalization=medium (NOT `basic` → neni R3), preview_needs_review=FALSE, contact_ready=TRUE, zadny reply/bounce signal. → ORDER 8 → allow.

#### Sample 3 — SEND_BLOCKED (missing preview_url)

```yaml
lead_id:               ASW-1712366111-e5f6
business_name:         "Truhlářství Dvořák"
email:                 dvorak@truhlar.cz
dedupe_flag:           ""
lead_stage:            QUALIFIED
preview_stage:         BRIEF_READY
outreach_stage:        NOT_CONTACTED
qualified_for_preview: "TRUE"
send_allowed:          "TRUE"
contact_ready:         "TRUE"
preview_url:           ""
email_subject_draft:   "Nový web pro vaše truhlářství"
email_body_draft:      "Dobrý den pane Dvořáku, ...(280 slov)..."
template_type:         "carpenter-no-website"
personalization_level: "high"
preview_needs_review:  "FALSE"
email_sync_status:     ""
email_reply_type:      ""
last_email_sent_at:    ""
unsubscribed:          ""
suppressed:            ""
```

- **effective_lifecycle_state:** `BRIEF_READY` (preview_stage=BRIEF_READY per CS1 sekce 10.4 pravidlo 7)
- **Expected outcome:** `SEND_BLOCKED`
- **Primary reason:** `INVALID_STATE`
- **Zduvodneni:** State je `BRIEF_READY` — NOT IN `{ PREVIEW_APPROVED, OUTREACH_READY }`. ORDER 1 B1 zachyti pred tim, nez se vubec dostaneme k preview_url checku. Fakt, ze chybi aj preview_url, je _secondary_ — primary reason je invalid state. Po vygenerovani preview (PREVIEW_GENERATING → PREVIEW_APPROVED) by se gate re-evaluate a pokracovalo dal.

#### Sample 4 — SEND_BLOCKED (CS1 canonical terminal `BOUNCED`)

```yaml
lead_id:               ASW-1712377222-g7h8
business_name:         "Malíř Horák"
email:                 horak@malir-horak.cz
dedupe_flag:           ""
lead_stage:            PREVIEW_SENT
preview_stage:         READY
outreach_stage:        CONTACTED
qualified_for_preview: "TRUE"
send_allowed:          "TRUE"
contact_ready:         "TRUE"
preview_url:           https://preview.asw.cz/malir-horak
email_subject_draft:   "Ostrava — ..."
email_body_draft:      "..."
template_type:         "painter-no-website"
personalization_level: "medium"
preview_needs_review:  "FALSE"
email_sync_status:     "SENT"
email_reply_type:      "BOUNCE"
last_email_sent_at:    "2026-04-18T09:15:00Z"
unsubscribed:          ""
suppressed:            ""
```

- **effective_lifecycle_state:** `BOUNCED` (CS1 canonical terminal; derivace: `email_reply_type=BOUNCE` per CS1 sekce 10.4 pravidlo 1 — BOUNCE ma nejvyssi prioritu ve fallback mapping)
- **Expected outcome:** `SEND_BLOCKED`
- **Primary reason:** `TERMINAL_STATE_BOUNCED` (B4, kategorie: canonical-lifecycle)
- **Zduvodneni:** State je CS1 canonical terminal `BOUNCED`. ORDER 1 → B4 zachyti. Sender reputation guard. Lead se do outreach NIKDY znovu nepusti (novy import = novy lead_id, mimo C-04 scope).
- **Co sample NENI:** tento sample nepracuje s zadnym neexistujicim konceptem typu "DEAD" ani s downstream sales outcome `WON`/`LOST`. `BOUNCED` je **CS1 canonical terminal state** (docs/21-business-process.md sekce 3 a 5).

#### Sample 5 — MANUAL_REVIEW_REQUIRED (preview needs review)

```yaml
lead_id:               ASW-1712388333-i9j0
business_name:         "Zámečnictví Procházka"
email:                 prochazka@zameky-cz.cz
dedupe_flag:           ""
lead_stage:            PREVIEW_SENT
preview_stage:         READY
outreach_stage:        NOT_CONTACTED
qualified_for_preview: "TRUE"
send_allowed:          "TRUE"
contact_ready:         "TRUE"
preview_url:           https://preview.asw.cz/zameky-prochazka
email_subject_draft:   "Praha — prezentace vaší firmy"
email_body_draft:      "Dobrý den, ...(220 slov)..."
template_type:         "locksmith-no-website"
personalization_level: "medium"
preview_needs_review:  "TRUE"
email_sync_status:     "NOT_LINKED"
email_reply_type:      "NONE"
last_email_sent_at:    ""
unsubscribed:          ""
suppressed:            ""
```

- **effective_lifecycle_state:** `PREVIEW_APPROVED` (lead_stage=PREVIEW_SENT) — gate vstup povolen
- **Expected outcome:** `MANUAL_REVIEW_REQUIRED`
- **Primary reason:** `PREVIEW_NEEDS_REVIEW`
- **Zduvodneni:** Vsechny hard conditions H1–H19 splneny (state OK, email valid, content komplet, personalization=medium, send_allowed=TRUE, zadna already-sent / reply / bounce). ORDER 1–6 nevratil zadny block. ORDER 7: `preview_needs_review == "TRUE"` → R1 review. Operator otevre preview URL, posoudi obsah. Pokud OK → nastavi `preview_needs_review=FALSE` → gate re-evaluate vrati AUTO_SEND_ALLOWED.

**Sample coverage:** 2 AUTO_SEND (Sample 1, 2) + 2 BLOCK (Sample 3, 4) + 1 REVIEW (Sample 5) = 3 outcomes pokryty. Zadny sample neni hranicni — vsechny jsou jednoznacne.

**CS1 konformita samplu:** Vsechny sample leady pouzivaji **pouze** canonical lifecycle states z CS1 (`PREVIEW_APPROVED`, `OUTREACH_READY`, `BRIEF_READY`, `BOUNCED`). Zadny sample nepouziva `WON`, `LOST`, `DEAD` ani jiny non-canonical stav jako lifecycle state. Hodnoty `WON`/`LOST` ani hypoteticky koncept "DEAD" nejsou v CS1 lifecycle — `WON`/`LOST` existuji pouze jako auxiliary hodnoty na `outreach_stage` (vrstva C, sekce 2.1) a CS1 je derivuje na terminal `REPLIED` pres fallback mapping.

---

### 10. Observability & signal kontrakt

Gate evaluace je ciste funkce — zapis do LEADS **neni** soucasti C-04. Implementace (future task) bude zapisovat:

| Pole | Kdo zapisuje | Hodnota |
|------|--------------|---------|
| `sendability_outcome` (PROPOSED sloupec) | Gate evaluator | `AUTO_SEND_ALLOWED` / `MANUAL_REVIEW_REQUIRED` / `SEND_BLOCKED` |
| `sendability_primary_reason` (PROPOSED sloupec) | Gate evaluator | reason code nebo `""` |
| `sendability_evaluated_at` (PROPOSED sloupec) | Gate evaluator | ISO 8601 UTC |
| `_asw_logs` zaznam | Gate evaluator | CS2 structured payload: `event_name: "sendability_evaluated"`, `step_name: "evaluate_sendability"`, `outcome: <mapping>`, `metadata: { primary_reason, reasons[] }` |

**Log outcome mapping na CS2 sekce 6.3:**

| Gate outcome | CS2 log outcome |
|--------------|-----------------|
| `AUTO_SEND_ALLOWED` | `success` |
| `MANUAL_REVIEW_REQUIRED` | `waiting_review` |
| `SEND_BLOCKED` (terminal state) | `blocked` |
| `SEND_BLOCKED` (content/data deficit) | `skipped` |

**Poznamka:** Formalizace a implementace tohoto zapisu **neni scope C-04**. Sloupce jsou PROPOSED a budou specifikovany v implementacnim tasku (data model update do docs/23).

---

### 11. Boundary rules / non-goals

C-04 **NERESI** a **NEIMPLEMENTUJE**:

- Samotne queue odeslani — scope C-05 (outbound queue schema + bulk send).
- Email sending engine (GmailApp wrapping, ESP provider volba) — scope C-06 (provider abstraction).
- Mailbox sync — existuje jako `syncMailboxMetadata()` (MailboxSync.gs), mimo scope.
- Reply handling — parsovani/klasifikace odpovedi je scope mailbox sync; C-08 (follow-up engine) prebira REPLIED lead pro downstream.
- Deliverability scoring — spamhaus / SPF / DKIM checks jsou externi; C-04 je _aplikacni_ gate, ne _mailove_.
- UI dashboard pro review queue — scope C-09 (exception / review queue UX).
- Runtime implementace evaluatoru — scope nasledujiciho implementacniho tasku.
- Persistence `sendability_*` sloupcu do LEADS schema — scope implementacniho tasku + docs/23 update.
- Retry politika gate re-evaluation — scope CS3; re-evaluate je safe (idempotentni ciste funkce).
- Double-send detekce nad delsim oknem nez `DOUBLE_SEND_WINDOW_MIN` — C-04 vyuziva existujici `OUTBOUND_DOUBLE_SEND_MINUTES` konstantu (OutboundEmail.gs) jako konfiguracni vstup.
- Nove lifecycle stavy — C-04 nezavadi zadny novy canonical stav. Vsechny inputs jsou exitujici v CS1.

---

### 12. Implementation notes for future task

Tato sekce je navigacni. Implementace samotneho evaluatoru je **mimo scope C-04**.

**Predpokladana implementacni struktura:**

1. **Novy soubor** `apps-script/SendabilityGate.gs`
   - `evaluateSendabilityGate_(hr, row)` — vraci `{ outcome, primary_reason, reasons }`
   - `getEffectiveLifecycleState_(hr, row)` — CS2 helper; ma smysl zijicit ve sdilenem helperu (napr. `LifecycleHelpers.gs`)
   - Zadne Sheet / UrlFetch / Gmail volani.

2. **Enumy (novy file nebo Config.gs extension):**

```javascript
var SENDABILITY_OUTCOME = {
  AUTO_SEND_ALLOWED:      'AUTO_SEND_ALLOWED',
  MANUAL_REVIEW_REQUIRED: 'MANUAL_REVIEW_REQUIRED',
  SEND_BLOCKED:           'SEND_BLOCKED'
};

var SENDABILITY_BLOCK_REASON = {
  INVALID_STATE:                 'INVALID_STATE',
  TERMINAL_STATE_DISQUALIFIED:   'TERMINAL_STATE_DISQUALIFIED',
  TERMINAL_STATE_REPLIED:        'TERMINAL_STATE_REPLIED',
  TERMINAL_STATE_BOUNCED:        'TERMINAL_STATE_BOUNCED',
  TERMINAL_STATE_UNSUBSCRIBED:   'TERMINAL_STATE_UNSUBSCRIBED',
  MISSING_EMAIL:                 'MISSING_EMAIL',
  INVALID_EMAIL:                 'INVALID_EMAIL',
  DUPLICATE_BLOCKED:             'DUPLICATE_BLOCKED',
  MISSING_PREVIEW_URL:           'MISSING_PREVIEW_URL',
  MISSING_SUBJECT:               'MISSING_SUBJECT',
  MISSING_BODY:                  'MISSING_BODY',
  MISSING_TEMPLATE_TYPE:         'MISSING_TEMPLATE_TYPE',
  MISSING_PERSONALIZATION:       'MISSING_PERSONALIZATION',
  MISSING_IDENTITY:              'MISSING_IDENTITY',
  QUALIFIER_SEND_DENIED:         'QUALIFIER_SEND_DENIED',
  ALREADY_SENT:                  'ALREADY_SENT',
  ALREADY_SENT_RECENTLY:         'ALREADY_SENT_RECENTLY',
  EMAIL_SYNC_ERROR_STATE:        'EMAIL_SYNC_ERROR_STATE',
  REPLY_RECEIVED:                'REPLY_RECEIVED',
  BOUNCE_DETECTED:               'BOUNCE_DETECTED',
  COMPLIANCE_SUPPRESSED:         'COMPLIANCE_SUPPRESSED'
};

var SENDABILITY_REVIEW_REASON = {
  PREVIEW_NEEDS_REVIEW:              'PREVIEW_NEEDS_REVIEW',
  CONTACT_READINESS_UNSET:           'CONTACT_READINESS_UNSET',
  PERSONALIZATION_LOW_BUT_COMPLETE:  'PERSONALIZATION_LOW_BUT_COMPLETE'
};
```

3. **Helpers, ktere bude evaluator pravdepodobne potrebovat:**
   - `parseBool_(val)` — normalizace `"TRUE" | "true" | true | "1"` → boolean; ostatni → false.
   - `isValidEmailShape_(email)` — regex match (existujici logika v `cleanEmail_()` Normalizer.gs:137).
   - `getEffectiveLifecycleState_(hr, row)` — CS2 decision pravidlo.
   - `minutesSince_(isoStr)` — time delta helper (existuje jako inline v OutboundEmail.gs:178).

4. **PROPOSED data model zmeny** (NEIMPLEMENTOVAT v C-04, jen zaznamenat v implementacnim tasku):
   - EXTENSION_COLUMNS: `unsubscribed`, `suppressed`, `sendability_outcome`, `sendability_primary_reason`, `sendability_evaluated_at`.
   - Docs/23 update po pridani sloupcu.

5. **Testy, ktere by mel implementacni task dodat:**
   - Unit test kazdeho reason code (21 block + 3 review + 1 allow = 25 scenaru minimum).
   - 5 samples ze sekce 9 jako reference tests.
   - Precedence test: lead s vice simultannimi blockers — overit, ze primary_reason je podle ORDER.

---

### 13. VERIFIED / INFERRED / PROPOSED labels

Pro kazde kriticke tvrzeni v C-04:

| Claim | Label | Evidence |
|-------|-------|----------|
| 18 canonical lifecycle stavu CS1 | VERIFIED IN REPO | docs/21-business-process.md sekce 3 |
| `effective_lifecycle_state` pravidlo | VERIFIED IN REPO | docs/24-automation-workflows.md sekce 234–250 (CS2) |
| `EXTENSION_COLUMNS` obsah | VERIFIED IN REPO | apps-script/Config.gs:68-120 |
| `send_allowed` existuje a je nastaveno evaluateQualification_ | VERIFIED IN REPO | apps-script/Config.gs:90; apps-script/PreviewPipeline.gs:319, 509 |
| `contact_ready` existuje a je nastaveno buildContactReadiness_ | VERIFIED IN REPO | apps-script/Config.gs:97; apps-script/ContactSheet.gs:125 |
| `dedupe_flag` existuje | VERIFIED IN REPO | apps-script/Config.gs:72 |
| `preview_needs_review` existuje | VERIFIED IN REPO | apps-script/Config.gs:89 |
| Email shape regex `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` | VERIFIED IN REPO | apps-script/Normalizer.gs:137 |
| `DOUBLE_SEND_WINDOW_MIN` = `OUTBOUND_DOUBLE_SEND_MINUTES` | VERIFIED IN REPO | apps-script/OutboundEmail.gs:179 |
| LEAD_STAGES / PREVIEW_STAGES enumy | VERIFIED IN REPO | apps-script/Config.gs:123-141 |
| OUTREACH_STAGES hodnoty (NOT_CONTACTED, DRAFT_READY, CONTACTED, WON, LOST) | VERIFIED IN REPO | apps-script/ContactSheet.gs:183-208; docs/23-data-model.md |
| EMAIL_SYNC_STATUS enum | VERIFIED IN REPO | apps-script/Config.gs:155-164 (referenced v docs/23) |
| EMAIL_REPLY_TYPE enum | VERIFIED IN REPO | apps-script/Config.gs:166-172 |
| `PREVIEW_APPROVED` a `OUTREACH_READY` jako gate vstupni body | INFERRED FROM EXISTING SYSTEM | CS1 transition T16/T17 definuji tyto stavy jako prededolneho sending; PREVIEW_APPROVED / OUTREACH_READY nejsou fyzicky v EXTENSION_COLUMNS (pouze auxiliary fields), ale jsou target canonical stavy pres fallback mapping |
| `unsubscribed` sloupec | PROPOSED FOR C-04 | Neexistuje v EXTENSION_COLUMNS (VERIFIED: grep). CS1 N4 dokumentuje gap. |
| `suppressed` sloupec | PROPOSED FOR C-04 | Neexistuje v repu. C-04 zavadi pro compliance path. |
| `sendability_outcome`, `sendability_primary_reason`, `sendability_evaluated_at` | PROPOSED FOR C-04 | Observability target-state. Implementace mimo scope. |
| `SENDABILITY_OUTCOME`, `SENDABILITY_BLOCK_REASON`, `SENDABILITY_REVIEW_REASON` enumy | PROPOSED FOR C-04 | Navrh enumu pro implementacni task. |

---

### 14. Acceptance checklist

- [x] Kazdy block reason ma stable reason code (21/21 pokryto sekci 5).
- [x] Kazdy review reason ma stable reason code (3/3 pokryto sekci 6).
- [x] Precedence order je jednoznacny (sekce 7: 8 ORDER urovni).
- [x] Decision tree je deterministicky evaluator bez side effects (sekce 8).
- [x] 5 sample leadu pokryva vsechny 3 outcomes (2 AUTO_SEND, 2 BLOCK, 1 REVIEW).
- [x] Zadny lead neprojde bez splneni vsech 19 hard conditions (H1–H19, sekce 4).
- [x] Review pripady jsou disjunktni s hard blocks (sekce 6 invariant 1).
- [x] PROPOSED extensions jsou explicitne oznacene (sekce 13).
- [x] Non-goals jsou explicitne (sekce 11).
- [x] Handoff na C-05 / C-06 / C-08 / C-09 je definovany (sekce 11).

---

### 15. Handoff na navazujici tasky

| Task | Prebira od C-04 | Stav |
|------|-----------------|------|
| **Implementacni task** (budouci) | Pseudocode evaluator → Apps Script funkce; PROPOSED sloupce do LEADS; reason code enumy | Handoff pripraveny |
| **C-05 (Outbound queue)** | Queue prijima lead pouze s `sendability_outcome == AUTO_SEND_ALLOWED`. Gate je queue preconditions. | Handoff pripraveny |
| **C-06 (Provider abstraction)** | Gate je nezavisly na provideru; C-06 pracuje az po gate-allow. | Handoff pripraveny |
| **C-08 (Follow-up engine)** | Follow-up ma vlastni gate (mimo scope C-04); C-04 je pouze first-touch. | Mimo scope C-04 |
| **C-09 (Exception queue)** | Lead s outcome `MANUAL_REVIEW_REQUIRED` + reason R1–R3 je kandidat do review queue. C-04 neimplementuje queue persistence. | Handoff pripraveny |

---

## Outbound Queue — C-05

> **Autoritativni specifikace.** Definuje datovou vrstvu mezi C-04 sendability gate a budoucim senderem.
> **Task ID:** C-05
> **Scope:** SPEC-only. Neimplementuje runtime worker, ESP provider, mailbox sync, ani frontend.
> **Zavislosti:** C-04 (gate outcome je queue precondition), CS1 (EMAIL_QUEUED lifecycle state), CS2 (S12 `process_email_queue` step), CS3 (idempotency + retry + dead-letter).

### 1. Ucel queue vrstvy

Queue rozděluje jedinou událost "lead je schopen přijmout email" na čtyři nezávisle pozorovatelné fáze:

1. **Lead je sendable** — C-04 evaluator vrátí `AUTO_SEND_ALLOWED`. Pouhé rozhodnutí. Zatím nic nebylo zapsáno do fronty.
2. **Queue item čeká na odeslání** — v `_asw_outbound_queue` vznikne řádek se statusem `QUEUED`. Sender se ho ještě nedotkl.
3. **Sender se pokouší odeslat** — worker řádek claimne, přechází do `SENDING`. Provider request je in-flight.
4. **Provider potvrdil výsledek** — `SENT` (úspěch), `FAILED` (dead-letter trigger), `CANCELLED` (před odesláním zrušeno).

Tato separace existuje, protože:
- Send je **ireverzibilní** (S4/S12 v CS3 section 5.2: transient fail → max_attempts=1 → dead-letter, nikdy auto-retry).
- Operator a audit vrstva potřebují dohledat každý pokus o odeslání, ne jen jeho finální výsledek.
- Gate (C-04) je čistá funkce bez side-effectu; queue je trvalý zápis. Mezi nimi není žádné skryté rozhodnutí.
- CS1 canonical lifecycle state `EMAIL_QUEUED` popisuje **lead**, ne queue řádek. Queue status (`QUEUED`/`SENDING`/`SENT`/…) je ortogonální dimenze nad queue řádkem.

### 2. Queue boundary / non-goals

**Co C-05 řeší:**
- Persistentní frontu outbound emailů v systémovém sheetu `_asw_outbound_queue`.
- Kontrakt na payload, který sender dostane od queue.
- Queue status enum + povolené/zakázané přechody.
- Immediate vs scheduled send pravidla na úrovni polí (kdy smí být řádek ke zpracování připuštěn).
- Auditovatelnost: dohledatelnost každého vytvoření, každého pokusu, každého výsledku.
- Vazba queue řádku na C-04 gate outcome (snapshot v čase queue), na `_asw_logs` (CS2 run history), na `_asw_dead_letters` (CS3), a na `lead_id` (LEADS).

**Co C-05 NEŘEŠÍ:**
- Samotný sender / worker loop — budoucí implementační task.
- Gmail/ESP provider integrace (C-06 Provider abstraction).
- Mailbox sync / reply detekci (stávající `SyncMailbox.gs` flow).
- Follow-up engine (C-07 Follow-up cadence).
- Rate limiting & quiet hours (C-08; queue zachycuje pouze `scheduled_at`, nikoli tempo odesílání).
- Suppression list management (C-09; queue spotřebovává pouze vstup z C-04 gate, který již `suppressed`/`unsubscribed` zachytí).
- Frontend queue UI / exception review UI.
- Běhové změny v `apps-script/Config.gs` a `EXTENSION_COLUMNS` — všechny nové sloupce jsou **PROPOSED FOR C-05** a budou zapsány implementačním taskem (ne C-05 sám).
- Přepsání CS1 lifecycle — C-05 **nezavádí žádný nový canonical state**. `EMAIL_QUEUED` existuje v CS1 a zůstává beze změny.

### 3. `_asw_outbound_queue` schema

Sheet name: `_asw_outbound_queue` (leading underscore per konvenci `_asw_logs`, `_asw_dead_letters`, `_raw_import`, `_ingest_reports`).
Storage: append-only pro INSERT; in-place update pro status transitions (ne nový řádek per attempt — stejný řádek, aktualizované sloupce, timestamp audit trail v log vrstvě).

| # | Field | Typ | Required | Nullable | Povinné pri create | Povinné pri update (status change) | Popis / source | Label |
|---|-------|-----|----------|----------|--------------------|-------------------------------------|---------------|-------|
| 1 | `outreach_queue_id` | string | ANO | NE | ANO | NE (immutable) | UUID nebo `QUE-{yyyyMMdd}-{nanoid}`. Generován při insertu. Primary key fronty. | PROPOSED FOR C-05 |
| 2 | `lead_id` | string | ANO | NE | ANO | NE (immutable) | FK na LEADS. VERIFIED IN REPO: `lead_id` existuje v `EXTENSION_COLUMNS` (Config.gs). | VERIFIED (reuse) |
| 3 | `source_job_id` | string | ANO | ANO | ANO (z LEADS snapshot) | NE (immutable) | Pro dohledání, z jakého ingest jobu lead pochází. VERIFIED IN REPO (Config.gs). | VERIFIED (reuse) |
| 4 | `recipient_email` | string | ANO | NE | ANO | NE (immutable) | Snapshot `email` z LEADS v čase queue. C-04 H1–H4 již garantovalo validitu. | PROPOSED FOR C-05 |
| 5 | `send_channel` | enum | ANO | NE | ANO | NE (immutable) | Zatím jediná hodnota `EMAIL`. Rezerva pro pozdější `SMS` / `LINKEDIN` (mimo scope). | PROPOSED FOR C-05 |
| 6 | `email_subject` | string | ANO | NE | ANO | NE (immutable) | Snapshot `email_subject_draft`. Immutable — změna draftu po queue vytváří nový queue řádek. | PROPOSED FOR C-05 |
| 7 | `email_body` | string | ANO | NE | ANO | NE (immutable) | Snapshot `email_body_draft`. Immutable — viz subject. | PROPOSED FOR C-05 |
| 8 | `preview_url` | string | NE | ANO | ANO pokud `send_allowed=TRUE` a `preview_url` není prázdné | NE (immutable) | Snapshot `preview_url` v čase queue. Pokud bude v body použit, musí být freeznutý. | VERIFIED (reuse) |
| 9 | `personalization_json` | string (JSON) | NE | ANO | NE | NE (immutable) | Serializovaný merge snapshot (placeholders použité v subject/body). Pro audit rekonstrukce, proč email vypadal takto. | PROPOSED FOR C-05 |
| 10 | `send_status` | enum | ANO | NE | ANO (vždy `QUEUED`) | ANO (při každé transition) | `QUEUED` / `SENDING` / `SENT` / `FAILED` / `CANCELLED`. Viz sekce 4. | PROPOSED FOR C-05 |
| 11 | `send_mode` | enum | ANO | NE | ANO | NE (immutable) | `IMMEDIATE` / `SCHEDULED`. Viz sekce 8. | PROPOSED FOR C-05 |
| 12 | `scheduled_at` | timestamp (ISO 8601) | NE | ANO | ANO pokud `send_mode=SCHEDULED` | NE (immutable) | Nejbližší okamžik, kdy smí worker row claimnout. Null pro `IMMEDIATE`. | PROPOSED FOR C-05 |
| 13 | `queued_at` | timestamp | ANO | NE | ANO (čas insertu) | NE (immutable) | Kdy byl řádek vložen do fronty. | PROPOSED FOR C-05 |
| 14 | `sent_at` | timestamp | NE | ANO | NE | ANO při přechodu na `SENT` | Čas potvrzení od providera. Null do té doby. | PROPOSED FOR C-05 |
| 15 | `send_attempts` | integer | ANO | NE | ANO (init `0`) | ANO (+1 při `QUEUED→SENDING`) | Kolik claim-attemptů proběhlo. Per CS3 S12 rule: max 1 attempt u ireverzibilního send. | PROPOSED FOR C-05 |
| 16 | `last_attempt_at` | timestamp | NE | ANO | NE | ANO při `QUEUED→SENDING` | Čas posledního claimu. | PROPOSED FOR C-05 |
| 17 | `provider_message_id` | string | NE | ANO | NE | ANO při přechodu na `SENT` | Gmail message ID / ESP message ID (provider-dependent). | PROPOSED FOR C-05 |
| 18 | `failure_reason` | string | NE | ANO | NE | ANO při přechodu na `FAILED` | Human-readable zpráva pro operator. | PROPOSED FOR C-05 |
| 19 | `failure_class` | enum | NE | ANO | NE | ANO při přechodu na `FAILED` | `TRANSIENT` / `PERMANENT` / `AMBIGUOUS` — per CS3 section 5.1. | PROPOSED FOR C-05 |
| 20 | `cancelled_at` | timestamp | NE | ANO | NE | ANO při přechodu na `CANCELLED` | Čas cancellation. | PROPOSED FOR C-05 |
| 21 | `cancel_reason` | string | NE | ANO | NE | ANO při přechodu na `CANCELLED` | Strukturovaný důvod (např. `RE_EVAL_SENDABILITY_BLOCKED`, `OPERATOR_CANCEL`, `LEAD_REPLIED_FIRST`). | PROPOSED FOR C-05 |
| 22 | `priority` | integer | ANO | NE | ANO (default `100`) | NE (immutable) | 0–999, nižší číslo = vyšší priorita. Default 100. Pro budoucí C-08 ordering. Queue sám nepoužívá — pouze uchovává. | PROPOSED FOR C-05 |
| 23 | `idempotency_key` | string | ANO | NE | ANO | NE (immutable) | `send:{lead_id}:{SHA256(recipient_email + email_subject + email_body)}`. Per CS3 section 4 S12 (reuses S4 formal_key pattern). Unique constraint pro prevenci duplicitního queueingu totožného obsahu. | INFERRED (reuse S4 formal_key pattern) |
| 24 | `payload_version` | string | ANO | NE | ANO (fixed `1.0`) | NE (immutable) | Verze payload kontraktu (sekce 6). Pro forward-compatibility. | PROPOSED FOR C-05 |
| 25 | `created_from_sendability_outcome` | enum | ANO | NE | ANO (`AUTO_SEND_ALLOWED`) | NE (immutable) | Snapshot C-04 outcome v čase queue. Queue audit invariant: pouze `AUTO_SEND_ALLOWED` smí vygenerovat queue řádek. | PROPOSED FOR C-05 |
| 26 | `sendability_primary_reason_snapshot` | string | NE | ANO | ANO (obvykle prázdné pro AUTO_SEND_ALLOWED) | NE (immutable) | Snapshot C-04 `sendability_primary_reason` (pro AUTO_SEND_ALLOWED obvykle null/empty; drží se pro audit konzistence). | PROPOSED FOR C-05 |
| 27 | `sendability_evaluated_at_snapshot` | timestamp | ANO | NE | ANO | NE (immutable) | Snapshot C-04 `sendability_evaluated_at`. Kolik je gate outcome starý v době queue. | PROPOSED FOR C-05 |
| 28 | `created_at` | timestamp | ANO | NE | ANO | NE (immutable) | Row creation time. Zpravidla = `queued_at`. | PROPOSED FOR C-05 |
| 29 | `updated_at` | timestamp | ANO | NE | ANO | ANO (při každé transition) | Row last-modified time. | PROPOSED FOR C-05 |
| 30 | `run_id_last` | string | NE | ANO | NE | ANO při každé worker akci | Cross-ref do `_asw_logs` (CS2 run history) posledního claimu. | INFERRED (reuse CS2 run_id) |
| 31 | `event_id_last` | string | NE | ANO | NE | ANO při každé worker akci | Cross-ref do `_asw_logs` posledního eventu. | INFERRED (reuse CS2 event_id) |
| 32 | `dead_letter_id` | string | NE | ANO | NE | ANO při přechodu na `FAILED` pokud row byl promoted | Cross-ref do `_asw_dead_letters` řádku (CS3 section 6.3). | INFERRED (reuse CS3) |

**Sumární počet polí:** 32. Z toho 15 minimum povinných per zadání + 17 auditability/integrity rozšíření s vazbou na CS2/CS3/C-04.

**Zdůvodnění doplněných polí** (nad 15 z původního zadání):

| Pole | Proč nutné |
|------|-----------|
| `send_mode` | Bez něj nelze odlišit immediate od scheduled na schema úrovni. Worker query jinak nemá bezpečný filtr. |
| `queued_at`, `last_attempt_at`, `cancelled_at`, `created_at`, `updated_at` | Auditovatelnost každé fáze. Bez nich není dohledatelné, kdy se co stalo. |
| `failure_class` | CS3 section 5.1 rozlišuje TRANSIENT/PERMANENT/AMBIGUOUS. Bez failure_class nelze queue failure napojit na CS3 retry matici. |
| `cancel_reason` | Bez důvodu cancellace je nemožné diagnostikovat, zda byl cancel legitimní. |
| `priority` | Pro C-08 ordering. Queue ho pouze drží (nepoužívá). |
| `idempotency_key` | CS3 section 4 S12 vyžaduje `send:{lead_id}:{SHA256(email + subject + body)}`. Bez něj duplicate queueing. |
| `payload_version` | Forward compatibility; nutné pokud se payload kontrakt v budoucnu evolvuje. |
| `created_from_sendability_outcome`, `sendability_primary_reason_snapshot`, `sendability_evaluated_at_snapshot` | Bez nich queue řádek neví, **jaký** gate outcome ho povolil. Audit invariant: kdyby se gate semantika změnila, musíme vědět, která verze řádek propustila. |
| `run_id_last`, `event_id_last` | Cross-ref do `_asw_logs` — bez nich není queue propojená s CS2 run history. |
| `dead_letter_id` | Cross-ref do `_asw_dead_letters` — bez něj nelze z queue řádku skočit do dead-letter detailu. |

### 4. Queue status enum + transition rules

| Status | Definice | Kdo zapisuje | Povolené transitions | Zakázané transitions | Terminal? | Retry-eligible? |
|--------|----------|--------------|----------------------|----------------------|-----------|-----------------|
| `QUEUED` | Řádek čeká na worker claim. Nic se zatím neodeslalo. | Queue producer (volaný po C-04 gate AUTO_SEND_ALLOWED). | → `SENDING` (worker claim), → `CANCELLED` (operator/re-eval) | → `SENT` (porušuje separaci), → `FAILED` (porušuje separaci: fail musí být attributable k attemptu) | NE | — (ještě se nepokoušelo) |
| `SENDING` | Worker řádek claimnul, provider request je in-flight. | Worker (při claimu). `send_attempts += 1`, `last_attempt_at = now`. | → `SENT` (provider success), → `FAILED` (provider fail) | → `QUEUED` (send je IREVERZIBILNÍ, rollback je nebezpečný), → `CANCELLED` (nelze cancel už in-flight request; racing condition) | NE | NE (CS3 S12 max_attempts=1) |
| `SENT` | Provider potvrdil přijetí. `provider_message_id` přítomné. | Worker (on success). `sent_at = now`, `provider_message_id = X`. | — | všechny | ANO | NE |
| `FAILED` | Provider selhal nebo byl ambiguous. `failure_reason` + `failure_class` přítomné. Řádek zpravidla promoted do `_asw_dead_letters`. | Worker (on fail). | — | → `QUEUED` (CS3: ne auto-retry; manual re-drive znamená **nový** queue řádek, ne přepis stávajícího) | ANO | NE (manual-only; vytvoří nový queue řádek) |
| `CANCELLED` | Řádek byl zrušen před SENDING. | Operator (manual), nebo queue cancel job (např. re-evaluate sendability vrátí BLOCKED, nebo lead `REPLIED` před odeslání). | — | → `SENDING`, → `SENT`, → `FAILED` | ANO | NE |

**Invarianty přechodů:**
1. `QUEUED` je jediný neterminálni status, který přijímá claim.
2. `SENDING` je jednosměrný — jakmile řádek projde přes `SENDING`, už nemůže do `QUEUED`. To je esenciální guard proti duplicitnímu odeslání.
3. `SENT` a `FAILED` jsou per CS3 terminální — retry matrice nezakládá **auto** retry na stejné row; manuální re-drive kreuje nový queue řádek se stejným `lead_id`, novým `outreach_queue_id`, novým `idempotency_key` (pokud se změnil subject/body) nebo BLOCKEM (pokud se nezměnil — duplicate key).
4. `CANCELLED` je povoleno pouze z `QUEUED`. Z `SENDING` není cancel možný, protože provider request už běží a jeho výsledek může být `SENT` nezávisle na tom, co queue chtěla.
5. Žádná transition nemění `outreach_queue_id`, `lead_id`, `source_job_id`, `recipient_email`, `email_subject`, `email_body`, `preview_url`, `personalization_json`, `send_mode`, `scheduled_at`, `idempotency_key`, `payload_version`, `created_from_sendability_outcome`, `created_at`, `queued_at`, `send_channel`, `priority` (= immutable snapshot set).

### 5. Queue lifecycle / decision flow

```
C-04 gate evaluator:
  IF outcome == AUTO_SEND_ALLOWED:
    # Pre-insert duplicate guard (CS3 idempotency)
    idempotency_key = "send:" + lead_id + ":" + sha256(recipient_email + email_subject + email_body)
    IF queue sheet contains row with same idempotency_key AND send_status IN { QUEUED, SENDING, SENT }:
      LOG "duplicate queue insert blocked" + existing outreach_queue_id
      RETURN existing row reference
      # Do not insert a duplicate. Do not update. Idempotency at the producer boundary.
    # Build queue row
    row = {
      outreach_queue_id:                generate_uuid(),
      lead_id:                          lead.lead_id,
      source_job_id:                    lead.source_job_id,
      recipient_email:                  lead.email,
      send_channel:                     "EMAIL",
      email_subject:                    lead.email_subject_draft,
      email_body:                       lead.email_body_draft,
      preview_url:                      lead.preview_url,
      personalization_json:             serialize(personalization_snapshot),
      send_status:                      "QUEUED",
      send_mode:                        caller_supplied | default "IMMEDIATE",
      scheduled_at:                     caller_supplied | null,
      queued_at:                        now(),
      created_at:                       now(),
      updated_at:                       now(),
      send_attempts:                    0,
      priority:                         caller_supplied | 100,
      idempotency_key:                  idempotency_key,
      payload_version:                  "1.0",
      created_from_sendability_outcome: "AUTO_SEND_ALLOWED",
      sendability_primary_reason_snapshot: lead.sendability_primary_reason,
      sendability_evaluated_at_snapshot:   lead.sendability_evaluated_at,
      // sent_at, last_attempt_at, provider_message_id, failure_*, cancelled_at, cancel_reason, run_id_last, event_id_last, dead_letter_id — null initially
    }
    append row to _asw_outbound_queue
    LOG "queue_row_created" with outreach_queue_id, lead_id, idempotency_key
    RETURN row
  IF outcome != AUTO_SEND_ALLOWED:
    # Queue is never created. C-04 MANUAL_REVIEW_REQUIRED routes to C-09 review queue (separate). SEND_BLOCKED terminates.
    RETURN null
```

**Worker claim (out of C-05 scope — specified only for contract clarity):**

```
worker_claim(row):
  PRE:  row.send_status == "QUEUED"
  PRE:  row.send_mode == "IMMEDIATE" OR (row.send_mode == "SCHEDULED" AND now() >= row.scheduled_at)
  PRE:  C-04 re-evaluation for lead_id still returns AUTO_SEND_ALLOWED
        (staleness guard — gate může být invalidated např. UNSUBSCRIBED)
  atomic:
    row.send_status   = "SENDING"
    row.send_attempts = row.send_attempts + 1
    row.last_attempt_at = now()
    row.updated_at    = now()
    row.run_id_last   = current_run_id
    row.event_id_last = current_event_id
```

**Cancel:**

```
cancel_row(row, reason):
  PRE: row.send_status == "QUEUED"
  IF row.send_status != "QUEUED":
    REJECT "not cancellable" (SENDING/SENT/FAILED/CANCELLED)
  row.send_status   = "CANCELLED"
  row.cancelled_at  = now()
  row.cancel_reason = reason
  row.updated_at    = now()
```

**Fail:**

```
mark_failed(row, reason, failure_class):
  PRE: row.send_status == "SENDING"
  row.send_status     = "FAILED"
  row.failure_reason  = reason
  row.failure_class   = failure_class  # TRANSIENT | PERMANENT | AMBIGUOUS
  row.updated_at      = now()
  # CS3 S12: ireverzibilni; dead-letter okamzite (max_attempts=1 fresh attempt)
  dl_id = promote_to_dead_letter(row)
  row.dead_letter_id  = dl_id
```

### 6. Send payload contract (queue → sender)

**Payload kontrakt** (verze `1.0`) — ten, který sender od queue dostane. Sender nevolá LEADS znovu; všechny hodnoty jsou snapshoty v čase queue insertu.

| Field | Typ | Required | Význam | Source | Immutable snapshot / runtime-derived |
|-------|-----|----------|-------|--------|---------------------------------------|
| `outreach_queue_id` | string | ANO | Queue row PK. Předá se do `provider_message_id` correlation hlaviček (např. `X-Correlation-Id`). | queue row | immutable snapshot |
| `lead_id` | string | ANO | Cross-ref do LEADS. | queue row | immutable snapshot |
| `idempotency_key` | string | ANO | Pro provider-level dedup. | queue row | immutable snapshot |
| `recipient` | object `{ email: string }` | ANO | Pouze email pro v1.0. Rezerva pro `{ email, name, display }` v pozdější verzi. | queue row `recipient_email` | immutable snapshot |
| `channel` | enum `"EMAIL"` | ANO | Pro v1.0 pouze email. | queue row `send_channel` | immutable snapshot |
| `subject` | string | ANO | Email subject. | queue row `email_subject` | immutable snapshot |
| `body` | string | ANO | Email body (HTML nebo plain — decision v C-06). | queue row `email_body` | immutable snapshot |
| `preview_url` | string/null | NE | Pokud je v body zmíněná, musí být freeznuta. | queue row `preview_url` | immutable snapshot |
| `personalization` | object (JSON) | NE | Placeholders použité při renderu subject/body. Pro audit. | queue row `personalization_json` | immutable snapshot |
| `scheduling` | object `{ mode: "IMMEDIATE"\|"SCHEDULED", scheduled_at: ISO8601\|null, queued_at: ISO8601 }` | ANO | Metadata. Sender v1.0 nepoužívá, ale dostává pro konzistenci. | queue row | immutable snapshot |
| `correlation` | object `{ run_id: string\|null, event_id: string\|null, source_job_id: string\|null, sendability_outcome: "AUTO_SEND_ALLOWED", sendability_evaluated_at: ISO8601 }` | ANO | CS2/C-04 cross-ref. | queue row | runtime-derived (`run_id`, `event_id` set at claim; zbytek snapshot) |
| `payload_version` | string `"1.0"` | ANO | Protokol verze. | queue row | immutable snapshot |

**Payload invarianty:**
- Všechny textové obsahy (subject, body, preview_url, personalization) jsou **immutable snapshots** — sender nikdy nečte aktuální stav LEADS; čte queue. Zaručuje, že co bylo schváleno gatem, to je i odesláno.
- `correlation.run_id` a `correlation.event_id` jsou **runtime-derived** — nastavují se v momentu claimu, ne při queue insertu.
- `payload_version` je **povinné** a **pevné pro v1.0**. Změna struktury payloadu = nové payload_version + sender musí umět rozlišit.

### 7. Ready vs queued vs sent separation

| Situace | Kde je to vyjádřeno |
|---------|---------------------|
| **Lead má `AUTO_SEND_ALLOWED`** | LEADS řádek, `sendability_outcome = AUTO_SEND_ALLOWED` (PROPOSED FOR C-04). Queue řádek **ještě neexistuje**. Nikdo nebyl obeslán. |
| **Queue řádek existuje a je `QUEUED`** | `_asw_outbound_queue` řádek s `send_status = QUEUED`. Worker ho zatím nepřevzal. Lead CS1 state = `EMAIL_QUEUED` (T17). |
| **Sender právě posílá (`SENDING`)** | Stejný queue řádek, `send_status = SENDING`, `send_attempts = 1`, `last_attempt_at` nastavený. Provider request je in-flight. Lead CS1 state = `EMAIL_QUEUED` (nemění se; transition na `EMAIL_SENT` proběhne až při terminální `SENT`). |
| **Provider potvrdil odeslání (`SENT`)** | Queue řádek `send_status = SENT`, `sent_at` + `provider_message_id` nastavené. Lead CS1 state přejde z `EMAIL_QUEUED` na `EMAIL_SENT` (T18). |

**Ostré hranice (proto existuje queue):**
- "Gate řekl ANO" neznamená, že kdokoliv byl obeslán. `AUTO_SEND_ALLOWED` bez queue řádku = lead je teoreticky způsobilý, prakticky nic neproběhlo.
- Queue řádek `QUEUED` neznamená, že email odešel. Znamená, že vznikl záměr ho odeslat.
- Queue řádek `SENDING` neznamená, že email odešel. Znamená, že se o to právě pokoušíme a ještě neznáme výsledek.
- `SENT` znamená, že provider potvrdil přijetí do své sítě. Nezaručuje delivery do inboxu (to je doména C-06/provider).
- `FAILED` znamená, že provider request selhal. Neznamená nutně, že email neodešel (u TRANSIENT nebo AMBIGUOUS tříd může být provider stav nejistý — proto CS3 max_attempts=1 a okamžitý dead-letter).

### 8. Immediate vs scheduled send rules

| Rozhodnutí | `IMMEDIATE` | `SCHEDULED` |
|------------|-------------|-------------|
| Create-time `send_mode` | `IMMEDIATE` | `SCHEDULED` |
| Create-time `scheduled_at` | MUSÍ být `null` | MUSÍ být nenull ISO 8601 timestamp v budoucnu (>= now při insertu) |
| Rozhoduje o `scheduled_at` | — | Caller při queue insertu (operator / budoucí C-08 rate limiter / budoucí batch orchestrator) |
| Worker může claim | Ihned po insertu (worker polling / trigger) | Pouze pokud `now() >= scheduled_at` |
| Cancel před `scheduled_at` | OK (status je `QUEUED` → `CANCELLED`) | OK (status je `QUEUED` → `CANCELLED`). `scheduled_at` se nemaže, audit drží záznam. |
| Rescheduling | NENÍ povoleno. Cancel + new queue row. | NENÍ povoleno. Cancel + new queue row. `scheduled_at` je **immutable**. |
| Chování po `scheduled_at` bez claimu | Žádné — řádek zůstává `QUEUED`. Worker polling ho chytne při dalším průchodu. | Žádné — řádek zůstává `QUEUED`, dokud ho worker nechytne. `scheduled_at` v minulosti je validní (worker claim je eligible). |

**Zdůvodnění immutability `scheduled_at`:**
- Rescheduling by vyžadoval rollback-style update, který porušuje separaci snapshot-vs-runtime. Cleaner: cancel + new queue row.
- Rescheduling bez auditu (přepsání `scheduled_at` in-place) by znemožnil zpětně rekonstruovat, kdy jsme plánovali odeslat email.

### 9. Failure design

**Každý failed queue řádek MUSÍ obsahovat:**

| Pole | Proč |
|------|------|
| `send_status = FAILED` | Status terminál. |
| `failure_reason` | Human-readable zpráva (např. "Gmail API returned 401 Unauthorized"). |
| `failure_class ∈ { TRANSIENT, PERMANENT, AMBIGUOUS }` | Pro mapping na CS3 retry matici (section 5.1). |
| `send_attempts >= 1` | Invariant: FAILED může nastat pouze z SENDING, SENDING inkrementoval `send_attempts`. |
| `last_attempt_at` | Čas pokusu. |
| `updated_at` | Čas zápisu failure. |
| `run_id_last`, `event_id_last` | Cross-ref do `_asw_logs` posledního pokusu. |
| `dead_letter_id` | Cross-ref do `_asw_dead_letters` — promocí per CS3 S12 (max_attempts=1 → dead-letter okamžitě). |

**Dohledatelnost každého pokusu:**
- Queue row sám je **per-lead-per-content scope**: jeden queue řádek = jedno `lead_id` + jeden obsah (subject+body+recipient). Z queue řádku získáme nanejvýš 1 pokus (CS3 S12 rule).
- Pokus jako událost je dohledatelný v `_asw_logs` přes `run_id_last` + `event_id_last`. `_asw_logs` je CS2 source of truth pro run history.
- Retry jako event není na stejné row — retry = **nový** queue row s novým `outreach_queue_id`. Pokud se subject/body nezměnil, `idempotency_key` je stejný a producer-side duplicate guard (sekce 5) **zablokuje** nový insert. Retry po FAILED tedy vyžaduje **operator intent**: buď vynucená změna obsahu (nový idempotency_key), nebo explicitní operator re-drive z dead-letter resolution (viz CS3 section 6.2).
- Dead-letter row v `_asw_dead_letters` obsahuje `last_run_id`, `last_event_id` a referenci na queue row (přes correlation metadata, schema CS3 section 6.3). Cross-ref je bi-directional: queue.`dead_letter_id` ↔ dead_letter.`step_key` / `lead_id`.

**Vztah k CS3 retry a dead-letter:**
- CS3 section 5.2: S12 `process_email_queue` má `max_attempts = 1` pro všechny třídy (TRANSIENT/PERMANENT/AMBIGUOUS). Důvod: send je ireverzibilní; retry nad ambiguous stavem může vést k duplicitnímu emailu.
- CS3 section 6: dead-letter je povinný outcome po vyčerpání pokusů. C-05 respektuje: každý FAILED queue row je promoted do `_asw_dead_letters` (nebo reference dříve promotovaného, viz CS3 6.2).
- C-05 NEDEFINUJE tělo `_asw_dead_letters` schema — to je CS3 section 6.3. C-05 pouze drží `dead_letter_id` cross-ref.

### 10. Auditability / observability

**Vytvoření queue row je dohledatelné:**
- `outreach_queue_id` (PK)
- `lead_id` (FK do LEADS)
- `idempotency_key` (unique lookup)
- `created_at`, `queued_at` (identické v zdravém stavu)
- Log event `queue_row_created` do `_asw_logs` s payloadem `{ outreach_queue_id, lead_id, idempotency_key, sendability_evaluated_at_snapshot }`

**Každý pokus o odeslání je dohledatelný:**
- Queue row in-place update: `send_status = SENDING`, `send_attempts += 1`, `last_attempt_at`, `run_id_last`, `event_id_last`.
- Log event `queue_row_sending` do `_asw_logs` s payloadem `{ outreach_queue_id, lead_id, send_attempts, run_id }`.
- Cross-ref: `_asw_logs` row má `lead_id` + `run_id` + `event_id` + `outreach_queue_id` v payloadu.

**Vazby (cross-ref graph):**

```
LEADS row (lead_id)
   ↓ 1:N
_asw_outbound_queue (outreach_queue_id)
   ↓ 1:1 per attempt
_asw_logs (run_id, event_id)   ← CS2 run history
   ↓ 1:0..1 (pouze pro FAILED)
_asw_dead_letters              ← CS3 dead-letter
```

- LEADS.`lead_id` ↔ queue.`lead_id`: FK. Jeden lead může mít N queue řádků (sekvence obsahů / first touch + follow-up / retry po dead-letter resolution).
- queue.`outreach_queue_id` ↔ `_asw_logs`.payload.outreach_queue_id: N queue events per queue row (create, claim, sent/fail/cancel).
- queue.`dead_letter_id` ↔ `_asw_dead_letters`.{PK}: 1:1. Pouze pro FAILED queue rows.
- Queue.`source_job_id` ↔ `_raw_import`/`_ingest_reports`.source_job_id: queue → ingest origin traceback.
- Queue.`created_from_sendability_outcome` + `sendability_evaluated_at_snapshot`: capture C-04 gate verdict v čase. I když C-04 spec změní pravidla později, queue řádek ví, **která verze** evaluace ho propustila.

### 11. Sample rows

Sheet headery (zkrácený subset pro readability — plné 32 polí viz sekce 3):

```
outreach_queue_id | lead_id | recipient_email | email_subject | send_status | send_mode | scheduled_at | queued_at | sent_at | send_attempts | last_attempt_at | provider_message_id | failure_reason | failure_class | cancelled_at | cancel_reason | idempotency_key | created_from_sendability_outcome | dead_letter_id
```

**Sample 1 — queue row after creation (QUEUED, IMMEDIATE):**

| Pole | Hodnota |
|------|---------|
| `outreach_queue_id` | `QUE-20260421-a7k3p8n2` |
| `lead_id` | `ASW-00412` |
| `source_job_id` | `firmy-cz:praha:instalater:20260416` |
| `recipient_email` | `info@novak-instalater.cz` |
| `send_channel` | `EMAIL` |
| `email_subject` | `Dobry den pane Novak, vase firma potrebuje web` |
| `email_body` | (snapshot draftu) |
| `preview_url` | `https://preview.autosmartweb.cz/novak-instalater-abc123` |
| `send_status` | `QUEUED` |
| `send_mode` | `IMMEDIATE` |
| `scheduled_at` | `null` |
| `queued_at` | `2026-04-21T09:12:03+02:00` |
| `sent_at` | `null` |
| `send_attempts` | `0` |
| `last_attempt_at` | `null` |
| `provider_message_id` | `null` |
| `failure_reason` | `null` |
| `failure_class` | `null` |
| `cancelled_at` | `null` |
| `cancel_reason` | `null` |
| `idempotency_key` | `send:ASW-00412:9f3b1e...c8a2` |
| `payload_version` | `1.0` |
| `created_from_sendability_outcome` | `AUTO_SEND_ALLOWED` |
| `sendability_evaluated_at_snapshot` | `2026-04-21T09:11:58+02:00` |
| `dead_letter_id` | `null` |

**Semantics:** Právě vznikl queue item. C-04 gate vrátil `AUTO_SEND_ALLOWED` 5 sekund před insertem. Worker ho může claim okamžitě.

**Sample 2 — queue row after successful send (SENT):**

Stejný řádek po úspěšném claimu + provider success:

| Pole | Hodnota |
|------|---------|
| `send_status` | `SENT` |
| `send_attempts` | `1` |
| `queued_at` | `2026-04-21T09:12:03+02:00` (nezměněno) |
| `last_attempt_at` | `2026-04-21T09:14:27+02:00` |
| `sent_at` | `2026-04-21T09:14:29+02:00` |
| `provider_message_id` | `<CAH5XYZ@mail.gmail.com>` |
| `run_id_last` | `run-20260421-send-0914` |
| `event_id_last` | `evt-send-ASW-00412-0001` |
| `updated_at` | `2026-04-21T09:14:29+02:00` |

**Semantics:** Worker claimnul řádek v 09:14:27 (`last_attempt_at`), Gmail vrátil message ID v 09:14:29 (`sent_at`). Lead CS1 state byl T18 transitioned z `EMAIL_QUEUED` na `EMAIL_SENT`.

**Sample 3 — queue row after failed send (FAILED):**

Queue řádek pro jiný lead, který selhal na Gmail 401:

| Pole | Hodnota |
|------|---------|
| `outreach_queue_id` | `QUE-20260421-b8m4q9p3` |
| `lead_id` | `ASW-00517` |
| `recipient_email` | `kontakt@elektrikar-brno.cz` |
| `send_status` | `FAILED` |
| `send_mode` | `IMMEDIATE` |
| `queued_at` | `2026-04-21T09:20:00+02:00` |
| `sent_at` | `null` |
| `send_attempts` | `1` |
| `last_attempt_at` | `2026-04-21T09:22:11+02:00` |
| `provider_message_id` | `null` |
| `failure_reason` | `Gmail API returned 401 Unauthorized — token expired` |
| `failure_class` | `TRANSIENT` |
| `run_id_last` | `run-20260421-send-0922` |
| `event_id_last` | `evt-send-ASW-00517-0001` |
| `dead_letter_id` | `DL-20260421-send-ASW00517` |
| `updated_at` | `2026-04-21T09:22:11+02:00` |

**Semantics:** Provider failed s TRANSIENT třídou, ale CS3 S12 pravidlo: max_attempts=1 i pro TRANSIENT (send je ireverzibilní). Řádek je terminální FAILED, okamžitě promoted do `_asw_dead_letters`. Operator musí manuálně rozhodnout o re-drive (nový queue řádek). Lead CS1 state zůstává `EMAIL_QUEUED` (FAILED queue neuzavírá CS1 — transition na `EMAIL_SENT` nenastal; operator může T25 DROP na `FAILED` CS1 state přes menu akci).

**Sample 4 — queue row cancelled before sending (CANCELLED):**

Queue řádek, který byl zrušen protože lead mezitím odpověděl sám (pre-emptive reply):

| Pole | Hodnota |
|------|---------|
| `outreach_queue_id` | `QUE-20260421-c9n5r0q4` |
| `lead_id` | `ASW-00389` |
| `send_status` | `CANCELLED` |
| `send_mode` | `SCHEDULED` |
| `scheduled_at` | `2026-04-21T14:00:00+02:00` |
| `queued_at` | `2026-04-21T09:30:00+02:00` |
| `sent_at` | `null` |
| `send_attempts` | `0` |
| `last_attempt_at` | `null` |
| `provider_message_id` | `null` |
| `cancelled_at` | `2026-04-21T11:17:02+02:00` |
| `cancel_reason` | `LEAD_REPLIED_FIRST` |
| `updated_at` | `2026-04-21T11:17:02+02:00` |

**Semantics:** Queue row byl naplánován na 14:00, ale v 11:17 mailbox sync detekoval inbound reply od tohoto leadu. Cancel job přepsal status na `CANCELLED` před tím, než worker stihl claim. Worker už tento řádek neclaimne (precondition `send_status == QUEUED`). Lead CS1 state přejde T19 na `REPLIED` (terminal). `cancel_reason` zachová důvod pro audit.

### 12. Boundary rules / handoff

| Task | Vztah k C-05 | Stav |
|------|--------------|------|
| **C-04 Sendability Gate** | Producer C-05 queue rows. Pouze `AUTO_SEND_ALLOWED` outcome smí vytvořit queue řádek. Gate nesmí zapsat do queue jiný outcome — invariant na queue schema (`created_from_sendability_outcome`). | Handoff připravený; C-04 spec stable. |
| **CS1 Lifecycle (EMAIL_QUEUED, EMAIL_SENT)** | C-05 queue je ortogonální datová vrstva, která implementuje T17 (`OUTREACH_READY → EMAIL_QUEUED`, nastává při queue row insertu) a T18 (`EMAIL_QUEUED → EMAIL_SENT`, nastává při queue.send_status=SENT). CS1 canonical states se neměnily. | Handoff připravený; CS1 stable. |
| **CS2 Orchestrator (S12 process_email_queue)** | Worker loop, který queue řádky claimne a volá sender, je S12 v CS3 katalogu. C-05 pouze definuje schema a pre/post conditions; worker body je implementační task. | Handoff připravený; S12 je „scheduled (future C-05)" v CS2 sekci 3. |
| **CS3 Reliability (idempotency, retry, dead-letter)** | C-05 reuses `send:{lead_id}:{SHA256(email + subject + body)}` idempotency key pattern (CS3 section 4 S12). C-05 respektuje max_attempts=1 + okamžitý dead-letter (CS3 section 5.2 S12). C-05 cross-refuje `_asw_dead_letters` přes `dead_letter_id`. | Handoff připravený; CS3 stable. |
| **C-06 Provider abstraction (ESP)** | C-06 konzumuje payload kontrakt (sekce 6) a emituje `provider_message_id` + failure classification. C-05 je provider-agnostický; payload field `channel=EMAIL` je zatím jediný podporovaný. | Handoff připravený pro C-06. |
| **C-07 Follow-up cadence** | Follow-up je **další** queue row na stejný lead_id se **změněným** subject/body (tedy nový `idempotency_key`) a vlastním C-04 gate pass. C-05 queue schema je kompatibilní s N-queue-rows-per-lead. | Compatible. C-07 specifikace mimo scope C-05. |
| **C-08 Rate limiting & quiet hours** | C-08 ovlivní `scheduled_at` populaci (a `priority`), ne queue schema. C-05 drží `scheduled_at` + `priority` jako PROPOSED pole, aby C-08 implementace nevyžadovala schema migration. | Compatible. C-08 specifikace mimo scope C-05. |
| **C-09 Suppression list / Exception queue** | Suppression (compliance block) je řešený v C-04 gate (reason B7/B8 atd.) — queue řádek tedy pro suppressed leada vůbec nevznikne. Exception queue pro MANUAL_REVIEW_REQUIRED je **jiná** datová struktura, ne queue. | Compatible. Out of C-05 scope. |
| **Budoucí implementační task** | Převede SPEC na: `apps-script/OutboundQueue.gs` s writer helpery, `_asw_outbound_queue` sheet vytvoření, `EXTENSION_COLUMNS` update (PROPOSED fields z sekce 3 promotnout na VERIFIED), enumy `QUEUE_SEND_STATUS_*`, `QUEUE_SEND_MODE_*`, `QUEUE_FAILURE_CLASS_*`. | C-05 je handoff ready. |

### 13. Non-goals (explicitní)

- Neimplementuje worker / polling loop / trigger / cron.
- Neimplementuje ESP / Gmail / SMTP call.
- Neimplementuje mailbox sync (reply/bounce detekci).
- Neimplementuje follow-up cadence (druhý, třetí email v thread).
- Neimplementuje rate limiting, quiet hours, daily caps.
- Neimplementuje frontend queue UI / exception review UI.
- Neimplementuje `_asw_outbound_queue` sheet creation v runtime kódu.
- Neimplementuje write `send_status` do LEADS — `send_status` žije pouze v queue, **ne** v LEADS. LEADS má CS1 `lifecycle_state` (budoucí) / existující `email_sync_status` / `outreach_stage`. Queue je orthogonální.
- Nezavádí nové canonical lifecycle states (CS1 18 stavů zůstává beze změny).
- Nezavádí nové gate outcomes (C-04 3 outcomes zůstávají beze změny).
- Neprovádí runtime Config.gs changes — všechny nové sloupce jsou PROPOSED FOR C-05.

### 14. Acceptance checklist

- [x] Queue schema má všech 15 povinných polí + 17 auditability rozšíření (32 celkem).
- [x] Send statusy mají jednoznačné allowed / disallowed transitions + invarianty.
- [x] Ready (sendability) vs QUEUED vs SENDING vs SENT je separované na schema + semantics úrovni (sekce 7).
- [x] Failed row má `failure_reason`, `failure_class`, `send_attempts`, `last_attempt_at`, `run_id_last`, `event_id_last`, `dead_letter_id` — dost pro diagnostiku.
- [x] Každý pokus je dohledatelný přes queue row + `_asw_logs` run history.
- [x] Send payload kontrakt je definován v sekci 6 (payload_version=1.0).
- [x] Immediate vs scheduled send je jednoznačně oddělený v sekci 8 (fields, worker eligibility, cancel rules).
- [x] CS3 alignment: idempotency key pattern, max_attempts=1, dead-letter promote, cross-ref.
- [x] CS1 alignment: žádný nový canonical state; T17/T18 transitions naznačeny.
- [x] C-04 alignment: pouze `AUTO_SEND_ALLOWED` → queue row; snapshot `created_from_sendability_outcome`.
- [x] Všechna nová pole / enumy / sheety jsou označeny PROPOSED FOR C-05 / INFERRED / VERIFIED.

### 15. PROPOSED vs INFERRED vs VERIFIED label summary

**VERIFIED IN REPO (reuse existing):**
- `lead_id`, `source_job_id`, `email`, `preview_url`, `last_email_sent_at`, `email_sync_status`, `outreach_stage`, `email_subject_draft`, `email_body_draft` — existují v `EXTENSION_COLUMNS` (`apps-script/Config.gs:68–119`).

**INFERRED FROM EXISTING SYSTEM:**
- `idempotency_key` = CS3 section 4 S12 pattern `send:{lead_id}:{SHA256(email + subject + body)}` — reuses S4 formal_key strategy.
- `run_id_last`, `event_id_last` — cross-ref do CS2 run history (`_asw_logs` payload schema).
- `dead_letter_id` — cross-ref do CS3 `_asw_dead_letters` schema (CS3 section 6.3).

**PROPOSED FOR C-05 (new, implementation task will materialize):**
- Sheet `_asw_outbound_queue` (32 sloupců).
- Queue row fields 1, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 24, 25, 26, 27, 28, 29 (viz tabulka v sekci 3).
- Enumy: `QUEUE_SEND_STATUS` (`QUEUED`/`SENDING`/`SENT`/`FAILED`/`CANCELLED`), `QUEUE_SEND_MODE` (`IMMEDIATE`/`SCHEDULED`), `QUEUE_FAILURE_CLASS` (`TRANSIENT`/`PERMANENT`/`AMBIGUOUS` — reuses CS3).
- Cancel reasons enum set: `RE_EVAL_SENDABILITY_BLOCKED`, `OPERATOR_CANCEL`, `LEAD_REPLIED_FIRST`, `LEAD_UNSUBSCRIBED`, `LEAD_BOUNCED`. Rozšiřitelný; implementační task formalizuje.
- Payload contract (payload_version 1.0, sekce 6).

---

## Provider Abstraction — C-06

> **Autoritativni specifikace.** Definuje sender interface a provider abstraction vrstvu mezi C-05 queue workerem a konkrétním email providerem (Gmail / SendGrid / Mailgun / …).
> **Task ID:** C-06
> **Scope:** SPEC-only. Neimplementuje runtime sender, žádný provider adapter, queue worker, mailbox sync, ani frontend.
> **Zavislosti:** C-05 (queue payload v1.0 + queue row outcome), CS3 (failure classes + dead-letter), CS1 (EMAIL_SENT transition), CS2 (S12 + run history / `_asw_logs`).

### 1. Účel vrstvy

Provider abstraction vrstva sedí **mezi** C-05 queue workerem a **pod** ním, tedy nad konkrétním provider SDK / API:

```
        C-04 gate  ─── AUTO_SEND_ALLOWED ──┐
                                           ▼
                          ┌─────────────────────────────────┐
                          │    C-05 outbound queue          │
                          │    (_asw_outbound_queue row)    │
                          └───────┬─────────────────────────┘
                                  │
                                  ▼  claim (SENDING)
                          ┌─────────────────────────────────┐
                          │    Queue worker (business)      │
                          │    (future implementation)      │
                          └───────┬─────────────────────────┘
                                  │
                                  ▼  sender.send(SendRequest)
                          ┌─────────────────────────────────┐
                          │    C-06 Sender Interface        │  ◄── provider-agnostic
                          │    (EmailSender)                │
                          └───────┬─────────────────────────┘
                                  │
           ┌──────────────────────┼──────────────────────┐
           ▼                      ▼                      ▼
   ┌──────────────┐       ┌──────────────┐       ┌──────────────┐
   │ GmailAdapter │       │SendGridAdapt.│       │MailgunAdapt. │   ◄── provider-specific
   │ (GmailApp)   │       │ (HTTP + API) │       │ (HTTP + API) │       (implementace mimo C-06)
   └──────┬───────┘       └──────┬───────┘       └──────┬───────┘
          │                      │                      │
          └──────────────────────┼──────────────────────┘
                                 ▼
                        ┌─────────────────────────────────┐
                        │  NormalizedSendResponse (v1.0)  │  ◄── sjednocený výstup
                        └───────┬─────────────────────────┘
                                │
                                ▼
                          queue worker zapíše:
                          send_status ∈ { SENT, FAILED }
                          provider_message_id, sent_at,
                          failure_reason, failure_class,
                          dead_letter_id (přes CS3)
```

**Proč vrstva existuje:**
- Změna providera (např. Gmail → SendGrid při přechodu z per-lead manual na bulk API) nesmí vyžadovat přepis business logiky (queue worker, C-05 payload, C-04 gate, CS3 retry matice).
- Provider-specific request formatting, response parsing, rate-limiting semantika a error mapping jsou **uvnitř** adapteru; ven jde pouze normalizovaný kontrakt.
- Queue worker a CS3 retry matice pracují výhradně s `NormalizedSendResponse` + `failure_class`; nikdy nevidí HTTP status, Gmail exception type ani ESP body payload.
- Jeden oprávněný provider per runtime je config-level decision (fallback / multi-provider routing je explicitně mimo C-06 — viz sekce 11).

### 2. Boundary / non-goals

**Co C-06 řeší:**
- Definici provider-agnostického `EmailSender` interface (signatura, vstupy, výstup).
- `NormalizedSendResponse` v1.0 — jednotný response kontrakt.
- `NormalizedSendErrorClass` — společnou klasifikaci errorů (mapuje se na CS3 `failure_class`).
- `NormalizedProviderStatus` — jednotnou enum nad provider-specific raw status.
- Rate limiting jako **kontrakt** (adapter hlásí `RATE_LIMITED` + `rate_limit_reset_at`); **ne** scheduler / throttler.
- 3 fail scénáře (timeout, rate limit, invalid recipient) s mapováním do normalized response + CS3 failure_class.
- Provider mapping sample (Gmail + generic ESP) — ukázka překladu provider raw výstupu do normalized.
- Sender selection pravidla (config-level, fallback je out-of-scope).
- Cross-ref graph: C-05 queue row ↔ C-06 normalized response ↔ `_asw_logs` run history.

**Co C-06 NEŘEŠÍ:**
- Runtime implementaci sender / adapter v `apps-script/` (Gmail, SendGrid, Mailgun, SMTP call).
- Queue worker loop / polling / trigger / cron (to je implementační task nad C-05 + C-06).
- Mailbox sync (reply / bounce detekce) — downstream; C-06 končí v momentu provider-level response.
- Follow-up cadence (C-07).
- Rate limiting / quiet hours scheduling (C-08) — C-06 pouze definuje, jak se throttle hlásí v response. C-08 řeší, kdy se z queue bere.
- Suppression list (C-09) — suppression je řešen v C-04 gate, ne v sender vrstvě.
- Frontend provider config UI / adapter onboarding UI.
- ESP webhook ingestu (inbound deliverability signals) — to je budoucí rozšíření mailbox sync, nikoli C-06.
- Multi-provider fallback (primary + secondary + tiebreak). Out-of-scope — explicitně označeno.
- Runtime změny `apps-script/Config.gs` / `EXTENSION_COLUMNS`. Všechny nové enumy a pole jsou PROPOSED FOR C-06.

### 3. Sender interface spec

**Název interface:** `EmailSender`
**Metoda:** `send(request: SendRequest) → NormalizedSendResponse` (synchronní z pohledu queue workeru; adapter implementace může async-wrap provider SDK, ale **interface je synchronní** — vrací response teprve když má finální odpověď od providera nebo hit-timeout).

**Vztah k C-05 payload kontraktu:** `SendRequest` je **derivát** C-05 payload v1.0 (sekce 6 C-05), nikoli jeho přímý předán. Queue worker `SendRequest` vytváří **zúženým mapováním** z C-05 payloadu + runtime correlation metadat. Důvod: C-05 payload je orientován na "co ukládat v queue"; `SendRequest` je orientován na "co provider potřebuje". Většina polí je identická (subject, body, recipient, preview_url, personalization), některá jsou zkratky (např. top-level `correlation_id = outreach_queue_id`).

#### 3.1 SendRequest (input)

| # | Field | Typ | Required | Nullable | Význam | Source | Snapshot / runtime |
|---|-------|-----|----------|----------|-------|--------|---------------------|
| 1 | `correlation_id` | string | ANO | NE | Queue row PK (`outreach_queue_id`). Adapter ho propne do provider correlation hlaviček (`X-Correlation-Id` nebo ekvivalent). | C-05 payload `outreach_queue_id` | immutable snapshot |
| 2 | `idempotency_key` | string | ANO | NE | `send:{lead_id}:{SHA256(email + subject + body)}`. Adapter ho propne do provider-level idempotency hlaviček, pokud provider idempotency podporuje (SendGrid `X-Message-Id` / Mailgun `message-id`). Gmail adapter ignoruje — Gmail idempotency nemá. | C-05 payload `idempotency_key` | immutable snapshot |
| 3 | `channel` | enum `"EMAIL"` | ANO | NE | V1.0 pouze email. Rezerva pro `SMS`/`LINKEDIN` — jiný adapter interface. | C-05 payload `channel` | immutable snapshot |
| 4 | `recipient` | object `{ email: string, name?: string }` | ANO | NE | Příjemce. `name` je optional; pokud není, adapter použije samotný email. | C-05 payload `recipient.email` + (future) name | immutable snapshot |
| 5 | `sender_identity` | object `{ email: string, name?: string, reply_to?: string }` | ANO | NE | Kdo odesílá. Dnes naplněn z `EnvConfig.gs` / Script Properties / provider config. | provider/runtime config | runtime-derived |
| 6 | `subject` | string | ANO | NE | Email subject (plain text, UTF-8). | C-05 payload `subject` | immutable snapshot |
| 7 | `body` | object `{ plain?: string, html?: string }` | ANO (alespoň jedno z polí) | NE | Adapter rozhoduje, které pole použít. V1.0 queue worker předává `plain` (reused `email_body` z C-05); HTML větev je rezerva pro budoucí rich template rendering. | C-05 payload `body` (plain) | immutable snapshot |
| 8 | `preview_url` | string | NE | ANO | Optional. Adapter ho nepoužívá přímo — subject/body už mají URL embeded. Předáváno pro audit. | C-05 payload `preview_url` | immutable snapshot |
| 9 | `personalization` | object (JSON) | NE | ANO | Placeholder snapshot. Adapter ho nepoužívá; je tu pouze pro audit trail (co provider v momentu sendu věděl). | C-05 payload `personalization` | immutable snapshot |
| 10 | `headers` | object `{ [name: string]: string }` | NE | ANO | Volitelné custom HTTP/SMTP headers (`X-Correlation-Id`, `X-Idempotency-Key`, `Reply-To`, …). Queue worker je pre-populuje correlation daty; adapter může přidat provider-specific hlavičky. | queue worker + adapter | runtime-derived |
| 11 | `attachments` | array | NE | ANO | V1.0 vždy prázdné/null. Rezerva. | — | — |
| 12 | `thread_hint` | object `{ thread_id?: string, in_reply_to_message_id?: string }` | NE | ANO | Threading hint pro follow-up (C-07 forward-compat). V1.0 vždy null. Pokud předán, Gmail adapter ho použije přes `GmailApp.getThreadById` + `reply`; generic ESP ho mapuje na `In-Reply-To` + `References` headers. | C-07 future | runtime-derived |
| 13 | `scheduling` | object `{ mode: "IMMEDIATE"\|"SCHEDULED", scheduled_at?: ISO8601, queued_at: ISO8601 }` | ANO | NE | Pro audit. Adapter nepoužívá k scheduling rozhodnutí (to dělá queue worker dle `scheduled_at` eligibility); pouze propaguje do correlation headers. | C-05 payload `scheduling` | immutable snapshot |
| 14 | `timeout_ms` | integer | ANO | NE | Max doba, jak dlouho smí adapter čekat na provider odpověď. Default 30000. Queue worker nastavuje. | queue worker config | runtime-derived |
| 15 | `sender_run_id` | string | ANO | NE | CS2 run history cross-ref (`run_id` queue workera). Adapter ho loguje do `_asw_logs` s každou adapter událostí. | CS2 runtime | runtime-derived |
| 16 | `sender_event_id` | string | ANO | NE | CS2 event cross-ref (`event_id` queue claim eventu). | CS2 runtime | runtime-derived |
| 17 | `payload_version` | string `"1.0"` | ANO | NE | Protokol verze. Adapter odmítne vyšší verzi, kterou nerozumí. | queue worker konstanta | immutable snapshot |

**Počet polí:** 17. Z toho 13 immutable snapshot z C-05 payload, 4 runtime-derived (sender_identity, headers, sender_run_id, sender_event_id, timeout_ms).

**Validace vstupu:**
- Adapter **musí** odmítnout request, který má chybějící required pole; vrátí `NormalizedSendResponse` se `success=false`, `error_class=INVALID_REQUEST`, `retryable=false`.
- Adapter **nesmí** mlčky doplňovat chybějící defaults (subject, body, recipient). Toto je business-layer chyba, ne provider chyba.

#### 3.2 NormalizedSendResponse (output)

| # | Field | Typ | Required | Nullable | Význam | Success | Fail |
|---|-------|-----|----------|----------|-------|---------|------|
| 1 | `success` | boolean | ANO | NE | Výsledek. `true` iff provider **potvrdil** přijetí do své sítě. | `true` | `false` |
| 2 | `provider_message_id` | string | ANO pri success | ANO pri fail | Message ID vrácený providerem (Gmail `Message-Id` header, SendGrid `X-Message-Id`, Mailgun `id`). | MUSÍ být non-null | může být null (např. při timeout/rate-limit před odesláním) |
| 3 | `provider_thread_id` | string | NE | ANO | Thread ID (Gmail `ThreadId`). Generic ESP obvykle nevrací — null. | null nebo string | null |
| 4 | `sent_at` | ISO 8601 | ANO | NE | Čas, kdy provider potvrdil přijetí (pro fail = čas dokončení attemptu). | `now()` při acceptu | `now()` při failu |
| 5 | `provider_status` | enum `NormalizedProviderStatus` | ANO | NE | Viz 3.3. Sjednocená enum nad provider raw status. | `ACCEPTED` nebo `QUEUED_BY_PROVIDER` | `REJECTED`, `THROTTLED`, `TIMEOUT`, `AUTH_FAILED`, `UNKNOWN` |
| 6 | `error_code` | string | NE | ANO | Stabilní kód z adapteru (např. `GMAIL_AUTH_EXPIRED`, `ESP_429_RATE_LIMIT`). Pro success null. | null | MUSÍ být non-null |
| 7 | `error_message` | string | NE | ANO | Human-readable zpráva pro operatora. Pro success null. | null | MUSÍ být non-null |
| 8 | `error_class` | enum `NormalizedSendErrorClass` | NE | ANO | Viz 3.4. Mapuje na CS3 `failure_class`. Pro success null. | null | MUSÍ být non-null |
| 9 | `retryable` | boolean | NE | ANO | Hint pro queue worker. `true` = CS3 by považoval retry za bezpečný; queue worker **přesto dodržuje CS3 max_attempts=1** (pozn. sekce 8). Pro success null. | null | `true` / `false` |
| 10 | `rate_limit_reset_at` | ISO 8601 | NE | ANO | Pouze pro `error_class=RATE_LIMIT`. Kdy provider říká, že smíme zkusit znovu (např. Gmail quota reset, SendGrid `X-RateLimit-Reset`). Null jinak. | null | non-null **pouze** pro RATE_LIMIT |
| 11 | `provider_name` | enum | ANO | NE | `GMAIL` / `SENDGRID` / `MAILGUN` / … Identifikuje, který adapter response vyprodukoval. Pro audit. | `GMAIL` | `GMAIL` |
| 12 | `provider_http_status` | integer | NE | ANO | HTTP status code, pokud provider HTTP API (SendGrid, Mailgun). Null pro Gmail (nepoužívá HTTP z pohledu Apps Script). | 200 (ESP) / null (Gmail) | 429/500/… (ESP) / null (Gmail) |
| 13 | `provider_raw_status` | string | NE | ANO | Surový status string od providera (např. Gmail "SENT", SendGrid "accepted"). Pro audit; queue worker ho nepoužívá k logice. | non-null | non-null |
| 14 | `provider_response_excerpt` | string | NE | ANO | Trimmed excerpt z provider response body (max 500 chars). Pro audit debug. **Nesmí obsahovat PII** — viz 3.5. | non-null | non-null |
| 15 | `correlation_id` | string | ANO | NE | Echo z `SendRequest.correlation_id` = `outreach_queue_id`. Cross-ref zpět do queue. | echo | echo |
| 16 | `attempt_duration_ms` | integer | ANO | NE | Jak dlouho adapter request trval (wall-clock). Pro observability. | >= 0 | >= 0 |
| 17 | `payload_version` | string `"1.0"` | ANO | NE | Response schema verze. | `"1.0"` | `"1.0"` |

**Počet polí:** 17 (7 požadovaných minimem + 10 auditability/diagnostický rozšíření se zdůvodněním).

**Zdůvodnění doplněných polí** (nad 7 minimem):

| Pole | Proč |
|------|------|
| `error_class` | Bez něj queue worker nemá deterministický vstup do CS3 retry matice. `error_code`/`error_message` jsou diagnostické, ne classification. |
| `retryable` | Hint pro queue worker / budoucí re-queue logiku. Odděluje "v principu retryable" od "CS3 maximum dosaženo". |
| `rate_limit_reset_at` | Bez něj nelze scheduled re-queue (C-08 budoucí) udělat respectovaně vůči providerovi. |
| `provider_name` | Audit — vědět, který adapter response vyprodukoval, když v budoucnu bude víc adapterů. |
| `provider_http_status`, `provider_raw_status`, `provider_response_excerpt` | Nemají vliv na logiku (adapter už abstrahoval); jsou pro post-mortem debug a support ticket content. |
| `correlation_id` | Echo — bez echa je velmi snadné zaměnit response s jiným request, zvlášť v batch processing. |
| `attempt_duration_ms` | Observability. Provider latency monitoring bez něj nelze. |
| `payload_version` | Forward compatibility. |

#### 3.3 `NormalizedProviderStatus` enum (PROPOSED FOR C-06)

| Hodnota | Význam | Success nebo Fail? |
|---------|--------|-------------------|
| `ACCEPTED` | Provider odpověděl synchronně úspěchem (Gmail sendEmail OK, SendGrid 202 accepted). | Success |
| `QUEUED_BY_PROVIDER` | Provider přijal request do vlastní fronty; finální delivery status bude later (SendGrid async queue, Mailgun delayed). Z pohledu C-06 se počítá jako success — provider převzal odpovědnost. | Success |
| `REJECTED` | Provider synchronně odmítl request (invalid recipient syntax, blocked domain). | Fail |
| `THROTTLED` | Provider throttluje volajícího (429 / Gmail quota / SendGrid rate limit). | Fail |
| `TIMEOUT` | Adapter nedostal odpověď v `timeout_ms`. Finální provider-side stav **není znám** (provider mohl email odeslat, ale odpověď se neprošla). | Fail |
| `AUTH_FAILED` | Authentication/authorization problém (expired token, revoked API key, invalid OAuth scope). | Fail |
| `UNKNOWN` | Adapter dostal response, který neumí klasifikovat (unexpected HTTP status / exception type). Fallback — vyžaduje manuální diagnózu. | Fail |

**Invariant:** každý `NormalizedSendResponse.provider_status` musí spadat do této enum. `UNKNOWN` je explicitní eskape hatch a musí být v adapterech minimalizovaný (každý UNKNOWN je bug proti kompletnosti mappingu).

#### 3.4 `NormalizedSendErrorClass` enum (PROPOSED FOR C-06)

Mapuje na CS3 `failure_class` (TRANSIENT / PERMANENT / AMBIGUOUS), ale je **jemnější** — explicitní kategorie, které queue worker může mapovat 1:1 na CS3.

| Error class | Popis | CS3 failure_class mapping | retryable hint |
|-------------|-------|--------------------------|----------------|
| `TIMEOUT` | Timeout během provider requestu. Provider-side stav neznámý. | `AMBIGUOUS` | `false` (CS3 AMBIGUOUS = HOLD + manual review per section 5.2) |
| `RATE_LIMIT` | Provider throttling. Request nebyl zpracován. | `TRANSIENT` | `true` (ale CS3 max_attempts=1 stále platí) |
| `INVALID_RECIPIENT` | Provider rejected kvůli syntax / domain / suppression. | `PERMANENT` | `false` |
| `AUTH_FAILED` | Token / API key problém. Neovlivňuje email, ale operator intervence nutná. | `TRANSIENT` (operator musí reset) nebo `PERMANENT` (revoked). Default `TRANSIENT`; adapter může override. | `false` pro automatic; `true` po operator fix |
| `PROVIDER_UNAVAILABLE` | 5xx / network error / DNS fail. Provider side issue. | `TRANSIENT` | `true` (ale CS3 max_attempts=1) |
| `PROVIDER_REJECTED` | 4xx kromě rate-limit/auth (např. 400 bad request, 422 unprocessable). | `PERMANENT` | `false` |
| `INVALID_REQUEST` | C-06 adapter odmítl request před provider voláním (missing required field). Business-layer bug. | `PERMANENT` | `false` |
| `UNKNOWN` | Nezkategorizovaný error. | `AMBIGUOUS` | `false` |

**Invariant:** adapter **nesmí** vrátit `success=false` bez `error_class`. `UNKNOWN` je povolen pouze jako poslední fallback.

#### 3.5 PII safety invariant

`provider_response_excerpt` a `error_message` **nesmí** obsahovat:
- Plain text subject / body / recipient / personalization values.
- API keys / tokeny.
- Cookies / session identifiers.

Adapter je odpovědný za sanitizaci. Pokud není jisté, adapter **musí** excerpt zkrátit na status + error code (např. `"HTTP 429: rate_limit_exceeded"`).

### 4. Provider adapter model

**Shared logic (queue worker / business layer):**
- Pre-send validace proti C-05 queue row invariantům (status == SENDING, idempotency_key duplicate guard).
- Construction `SendRequest` z C-05 payload + runtime correlation metadat.
- `EmailSender.send()` call.
- Response parsing — čte **pouze** `NormalizedSendResponse`. Nikdy HTTP status, provider exception type, provider body.
- Queue row update (`send_status = SENT` nebo `FAILED`, `provider_message_id`, `sent_at`, `failure_reason`, `failure_class`, `dead_letter_id`).
- CS3 dead-letter promote při fail.
- `_asw_logs` zápis s payload `{ outreach_queue_id, provider_name, normalized_status, error_class, duration_ms }`.

**Provider-specific logic (uvnitř adapteru):**
- Konstrukce provider request (Gmail `GmailApp.sendEmail` / SendGrid `fetch` + Authorization header + JSON body / Mailgun form-encoded body).
- Provider-specific retry **uvnitř jednoho attempt** (např. DNS retry, TLS handshake retry). **NE** business-level retry — ten je CS3.
- Mapping provider response → `NormalizedSendResponse`.
- Mapping provider error → `NormalizedSendErrorClass`.
- Sanitizace error_message a provider_response_excerpt (PII-safe).
- Timeout enforcement (adapter musí `SendRequest.timeout_ms` respektovat).

**Jak zabránit, aby se business logika větvila podle providera:**

| Pravidlo | Důsledek |
|----------|----------|
| Queue worker **smí** přistupovat pouze k `NormalizedSendResponse`, nikdy k raw provider objects | Invariant testovatelný přes type system / interface visibility. |
| Adapter **nesmí** emitovat eventy do `_asw_logs` sám — to dělá queue worker s normalizovaným payloadem | Jednotný formát `_asw_logs` záznamu. |
| Provider-specific pole (např. Gmail `threadId`) se do `NormalizedSendResponse` dostávají **pouze** jako `provider_thread_id` (obecné jméno), ne jako `gmail_thread_id` | Změna providera nevyžaduje změnu queue schema nebo `_asw_logs` payload schema. |
| `NormalizedSendErrorClass` je uzavřená enum; queue worker mapuje na CS3 failure_class přes fixní lookup | Žádná `if provider == 'gmail'` větev v business logice. |

**Config-level provider selection (sekce 10):** queue worker čte 1 Script Property `EMAIL_PROVIDER` (PROPOSED), jinak fallback na defaultní provider (viz sekce 10). Rozhodnutí o providerovi se děje **jednou** při startu queue workera, ne per-request.

### 5. Sample provider mapping

#### 5.1 Gmail (reference — existing `GmailApp` usage v `apps-script/OutboundEmail.gs`)

**Success response:**

```
GmailApp.sendEmail(recipient, subject, bodyPlain, options)
  → nevrací nic (void), ale zápis do mailboxu proběhl
  → GmailApp.search() ihned po send vrátí novou thread s ThreadId a lastMessageId
```

Gmail adapter musí po `sendEmail()` zavolat `GmailApp.search()` pro retrieval `messageId` + `threadId`. Timing: Gmail typicky indexuje do < 2s.

Mapping:

| NormalizedSendResponse field | Gmail source |
|------------------------------|--------------|
| `success` | `true` pokud `sendEmail()` neházel; `false` jinak |
| `provider_message_id` | `GmailMessage.getId()` z nejnovější message v sent threadu |
| `provider_thread_id` | `GmailThread.getId()` |
| `sent_at` | `GmailMessage.getDate()` (ISO) nebo `now()` fallback |
| `provider_status` | `ACCEPTED` (Gmail nemá async queued stav — sendEmail je synchronní) |
| `provider_raw_status` | `"SENT"` (Gmail canonical) |
| `provider_http_status` | `null` (Gmail Apps Script API není HTTP z tohoto pohledu) |
| `provider_response_excerpt` | `"GmailApp.sendEmail OK, threadId=${threadId}"` |
| `provider_name` | `"GMAIL"` |

**Fail response (Gmail exception):**

```
try {
  GmailApp.sendEmail(...)
} catch (e) {
  // e.message může být:
  //   "Service invoked too many times for one day: email"  → quota
  //   "Authorization is required to perform that action."   → auth
  //   "Invalid argument"                                    → invalid recipient
}
```

Mapping tabulka viz sekce 6 (fail scénáře). Každá Gmail exception message se mapuje na konkrétní `error_class` přes regex/substring match uvnitř adapteru.

#### 5.2 Generic ESP (reference — budoucí SendGrid/Mailgun adapter)

**Success response (SendGrid 202 Accepted):**

```
POST https://api.sendgrid.com/v3/mail/send
Authorization: Bearer ${API_KEY}
Content-Type: application/json
X-Message-Id: ${SendRequest.idempotency_key}   ← C-06 adapter zapíše

Response:
202 Accepted
X-Message-Id: abc123xyz
(empty body)
```

Mapping:

| NormalizedSendResponse field | Generic ESP source |
|------------------------------|-------------------|
| `success` | `true` pokud status ∈ {200, 201, 202} |
| `provider_message_id` | `X-Message-Id` response header |
| `provider_thread_id` | `null` (většina ESP nemá thread concept — threading až přes mailbox sync / `In-Reply-To` header) |
| `sent_at` | `now()` při receive response |
| `provider_status` | `ACCEPTED` (202) nebo `QUEUED_BY_PROVIDER` (pokud ESP rozlišuje — např. Mailgun) |
| `provider_raw_status` | `"accepted"` nebo `"queued"` z provider response (pokud je v body) |
| `provider_http_status` | 202 |
| `provider_response_excerpt` | `"HTTP 202, X-Message-Id=abc123xyz"` |
| `provider_name` | `"SENDGRID"` nebo `"MAILGUN"` |

**Fail response (SendGrid 429):**

```
POST https://api.sendgrid.com/v3/mail/send
...

Response:
429 Too Many Requests
X-RateLimit-Reset: 1714041600
Content-Type: application/json
{"errors":[{"message":"rate limit exceeded"}]}
```

Mapping:

| NormalizedSendResponse field | Hodnota |
|------------------------------|---------|
| `success` | `false` |
| `provider_message_id` | `null` |
| `provider_status` | `THROTTLED` |
| `error_code` | `"ESP_429_RATE_LIMIT"` |
| `error_message` | `"Provider throttled; retry after reset"` (sanitized) |
| `error_class` | `RATE_LIMIT` |
| `retryable` | `true` |
| `rate_limit_reset_at` | `2026-04-25T12:00:00Z` (converted from `X-RateLimit-Reset` unix timestamp) |
| `provider_http_status` | 429 |
| `provider_raw_status` | `"rate_limit_exceeded"` (from body) |

**Odlišnosti Gmail vs generic ESP:**

| Aspekt | Gmail | Generic ESP |
|--------|-------|-------------|
| Transport | Apps Script `GmailApp` (native) | HTTP REST API |
| `provider_http_status` | vždy null | 200/202/429/500 |
| `provider_thread_id` | přítomné (Gmail thread je native) | null (threading není native ESP koncept) |
| Idempotency | Provider nepodporuje (C-06 `idempotency_key` → ignored adapterem) | Provider podporuje přes `X-Message-Id` / custom header |
| Rate limit signal | Exception `"Service invoked too many times"` | HTTP 429 + `X-RateLimit-Reset` header |
| Auth failure signal | Exception `"Authorization is required"` | HTTP 401/403 |
| Invalid recipient | Exception `"Invalid argument"` nebo accepted then bounce asynchronně | HTTP 400/422 synchronně, nebo accepted + async webhook bounce |

**Adapter je povinný oba typy sjednotit** do `NormalizedSendResponse` beze stopy po tom, který provider je uvnitř.

### 6. Rate limiting pravidla per provider

C-06 rate limiting je **kontrakt**, ne scheduler.

| Vrstva | Co řeší | Kdo to dělá |
|--------|---------|-------------|
| Provider-level rate limit | Provider sám vynucuje quota (Gmail 500/day free, 2000/day Workspace; SendGrid podle plánu; Mailgun podle plánu). | Provider. |
| C-06 adapter | Detekuje provider throttle signal a převede do `error_class=RATE_LIMIT` + `rate_limit_reset_at`. **Nečeká, neretryuje.** Okamžitě vrací response. | Adapter. |
| C-05 queue worker | Při fail s `error_class=RATE_LIMIT` → CS3 TRANSIENT → dead-letter (max_attempts=1). | Queue worker. |
| C-08 (budoucí) | Preventivní scheduling: před claimem queue row kontroluje daily/hourly quota counter, pokud přeshnuto, posouvá `scheduled_at`. | C-08. |
| Operator | Po dead-letter: manuální re-queue po resetu providera (`rate_limit_reset_at`). | Operator. |

**Proč nesmí rozbít batch:**
- Queue worker zpracovává queue row per-row (ne per-batch atomic). Rate limit u jednoho řádku je failure jen tohoto řádku; zbytek batch pokračuje.
- CS3 S12 max_attempts=1 → dead-letter okamžitý → žádný retry loop, který by blokoval batch progress.
- Queue worker nesmí na odpověď `THROTTLED` čekat (sleep/backoff). Pokud je to potřeba, C-08 to řeší přes `scheduled_at`.

**Gmail rate limiting specifics:**
- Gmail Apps Script má daily email quota (500 / 2000 podle plánu). Quota reset je o půlnoci Pacific Time.
- Gmail adapter **nevidí** přesnou quotu zbývající. Jediný signál je exception. Proto `rate_limit_reset_at` pro Gmail je adapterem **odhadnutý** na next midnight PT (konzervativně). Operator má právo overridnout.

**Generic ESP rate limiting specifics:**
- ESP obvykle vrací `X-RateLimit-Remaining` + `X-RateLimit-Reset` headery i při úspěchu. C-06 tyto **nezachytává** v success response (v1.0); rezerva pro budoucí `provider_rate_limit_state` field.

### 7. Fail scénáře (povinné 3)

#### 7.1 Timeout

**Co provider typicky vrací:**
- Gmail: Apps Script exception po 30s+ bez návratu z `GmailApp.sendEmail()`.
- Generic ESP: socket timeout / connection timeout na HTTP request; nebo HTTP 504 Gateway Timeout (pokud zasáhne proxy).

**Mapping do `NormalizedSendResponse`:**

| Field | Hodnota |
|-------|---------|
| `success` | `false` |
| `provider_message_id` | `null` |
| `sent_at` | `now()` při vzniku timeoutu |
| `provider_status` | `TIMEOUT` |
| `error_code` | `"GMAIL_TIMEOUT"` / `"ESP_TIMEOUT"` |
| `error_message` | `"Provider request exceeded timeout_ms"` |
| `error_class` | `TIMEOUT` |
| `retryable` | `false` (AMBIGUOUS = HOLD) |
| `rate_limit_reset_at` | null |
| `attempt_duration_ms` | >= `SendRequest.timeout_ms` |

**CS3 handoff:** `TIMEOUT` → `AMBIGUOUS` → CS3 section 5.2 S12 pravidlo: `max_attempts=1`, **HOLD + manual review** (ne auto-retry). Queue row `send_status=FAILED`, `failure_class=AMBIGUOUS`, promoted do `_asw_dead_letters` s hint pro operatora: "Unknown provider-side state — manually verify before re-drive."

**Proč nevyžaduje změnu business logiky:** timeout je vždy stejně mapovaný bez ohledu na providera. Queue worker vidí `error_class=TIMEOUT`, mapuje na CS3 AMBIGUOUS bez větvení podle `provider_name`.

#### 7.2 Rate limit

**Co provider typicky vrací:**
- Gmail: exception `"Service invoked too many times for one day: email"`.
- Generic ESP: HTTP 429 + `X-RateLimit-Reset` response header.

**Mapping:**

| Field | Hodnota |
|-------|---------|
| `success` | `false` |
| `provider_message_id` | `null` |
| `sent_at` | `now()` |
| `provider_status` | `THROTTLED` |
| `error_code` | `"GMAIL_QUOTA_EXCEEDED"` / `"ESP_429_RATE_LIMIT"` |
| `error_message` | `"Provider throttled; see rate_limit_reset_at"` |
| `error_class` | `RATE_LIMIT` |
| `retryable` | `true` (v principu; CS3 stále max_attempts=1) |
| `rate_limit_reset_at` | Gmail: adapterem odhadnuté midnight PT. ESP: parsed z `X-RateLimit-Reset`. |

**CS3 handoff:** `RATE_LIMIT` → `TRANSIENT` → CS3 section 5.2 S12: `max_attempts=1`, **dead-letter**, manual only. C-08 (budoucí) může pre-emptive posunout `scheduled_at` dle `rate_limit_reset_at` a nový queue row vytvořit, ale to je mimo C-06.

**Proč nevyžaduje změnu business logiky:** jednotný `error_class=RATE_LIMIT` + `rate_limit_reset_at` stačí queue workerovi. Gmail vs ESP rozdíly jsou uvnitř adapteru.

#### 7.3 Invalid recipient

**Co provider typicky vrací:**
- Gmail: exception `"Invalid argument: to"` **synchronně**, nebo accept + async bounce (bounce pak řeší mailbox sync, mimo C-06).
- Generic ESP: HTTP 400 / 422 s body `{"errors":[{"field":"to","message":"invalid email"}]}`.

**Mapping (synchronní rejection):**

| Field | Hodnota |
|-------|---------|
| `success` | `false` |
| `provider_message_id` | `null` |
| `sent_at` | `now()` |
| `provider_status` | `REJECTED` |
| `error_code` | `"GMAIL_INVALID_RECIPIENT"` / `"ESP_INVALID_RECIPIENT"` |
| `error_message` | `"Recipient email rejected by provider"` (sanitized — nesmí obsahovat raw recipient pro PII) |
| `error_class` | `INVALID_RECIPIENT` |
| `retryable` | `false` |
| `rate_limit_reset_at` | null |

**CS3 handoff:** `INVALID_RECIPIENT` → `PERMANENT` → CS3 section 5.2 S12: `max_attempts=1`, **dead-letter okamžitě**. Lead potenciálně kandidát na `email_valid=FALSE` write-back (mimo C-06; budoucí mailbox sync / C-04 gate tuning).

**Proč nevyžaduje změnu business logiky:** C-04 gate má H1–H4 validaci emailu, ale provider může mít přísnější pravidla (blocked TLDs, suppression list, provider reputation). `INVALID_RECIPIENT` je permanent; queue worker dead-letter bez debate.

**Async bounce pozn.:** Pokud provider synchronně přijme (202) ale poté pošle asynchronní bounce, C-06 response je `success=true` se `provider_status=ACCEPTED`. Bounce zachytí mailbox sync downstream (mimo C-06). CS1 transition na `BOUNCED` je triggered mailbox sync eventem E15, ne C-06.

### 8. Provider status normalization (oddělení vrstev)

**Čtyři dimenze — nesmí se plést:**

| Vrstva | Příklady hodnot | Kde žije | Kdo zapisuje |
|--------|----------------|----------|--------------|
| **A. Provider raw status** | Gmail: `"SENT"`, `"QUEUED"`. SendGrid: `"accepted"`, `"rejected"`. Mailgun: `"queued"`, `"failed"`. | Uvnitř adapteru; do normalized response jde pouze jako `provider_raw_status` (pro audit). | Provider. |
| **B. C-06 `NormalizedProviderStatus`** | `ACCEPTED`, `QUEUED_BY_PROVIDER`, `REJECTED`, `THROTTLED`, `TIMEOUT`, `AUTH_FAILED`, `UNKNOWN` (7 hodnot). | `NormalizedSendResponse.provider_status` — provider-agnostic. | C-06 adapter. |
| **C. C-05 `QUEUE_SEND_STATUS`** | `QUEUED`, `SENDING`, `SENT`, `FAILED`, `CANCELLED` (5 hodnot). | `_asw_outbound_queue.send_status`. | Queue worker (na základě `NormalizedSendResponse.success`). |
| **D. CS1 lifecycle state** | `EMAIL_QUEUED`, `EMAIL_SENT`, `REPLIED`, `BOUNCED`, `UNSUBSCRIBED` (subset CS1 18 stavů). | `lead.lifecycle_state` (future; aktuálně derivovatelné z CS1 sekce 10.4). | Queue worker (T17/T18 při queue insert / SENT), mailbox sync (T19/T20 bounce/reply). |

**Mapping pravidlo (deterministické):**

```
NormalizedSendResponse.success
  == true  → provider_status ∈ { ACCEPTED, QUEUED_BY_PROVIDER }
              → queue.send_status = SENT
              → lead.lifecycle_state = EMAIL_SENT (T18)

  == false → provider_status ∈ { REJECTED, THROTTLED, TIMEOUT, AUTH_FAILED, UNKNOWN }
              → queue.send_status = FAILED
              → queue.failure_class = map(error_class) per CS3 lookup
              → queue.dead_letter_id set per CS3 S12
              → lead.lifecycle_state stays at EMAIL_QUEUED
                (C-06 NETRIGGERUJE CS1 transition na FAILED — to je operator / menu akce T25)
```

**Invariant:** žádná jiná kombinace není povolena. `success=true` se `provider_status=TIMEOUT` je bug (adapter musí buď vědět, že email prošel → ACCEPTED, nebo ne → TIMEOUT/false).

**Proč mailbox-downstream (reply, bounce, OOO) není C-06:**
- C-06 končí v momentu provider response. Accept ≠ delivered ≠ read ≠ replied.
- Reply / bounce / OOO detekce je mailbox sync (`apps-script/SyncMailbox.gs` dnes; budoucí webhook ingest) — downstream CS1 transition T19/T20.

### 9. Auditability / observability

**Propojení `NormalizedSendResponse` s queue row:**
- `NormalizedSendResponse.correlation_id` == `queue.outreach_queue_id`. Při success: queue.provider_message_id = response.provider_message_id, queue.sent_at = response.sent_at, queue.send_status = SENT.
- Při fail: queue.failure_reason = response.error_message, queue.failure_class = lookup(response.error_class), queue.send_status = FAILED, queue.dead_letter_id = DL row promoted by CS3.

**Propojení s `_asw_logs`:**
Queue worker po přijetí response zapíše do `_asw_logs` jeden řádek per response:

```
level:       INFO (success) | ERROR (fail)
function:    "QueueWorker.send"
lead_id:     row.lead_id
run_id:      SendRequest.sender_run_id  (echoed)
event_id:    SendRequest.sender_event_id (echoed)
payload: {
  outreach_queue_id:    response.correlation_id,
  provider_name:        response.provider_name,
  provider_status:      response.provider_status,
  provider_message_id:  response.provider_message_id,
  provider_http_status: response.provider_http_status,
  error_class:          response.error_class (null at success),
  error_code:           response.error_code (null at success),
  attempt_duration_ms:  response.attempt_duration_ms,
  payload_version:      response.payload_version
}
```

**Propagate `provider_message_id` + `thread_id`:**
- `queue.provider_message_id` = primary cross-ref k provider.
- `queue.provider_thread_id` (PROPOSED C-06 field v queue, navazuje na C-05 schema) = cross-ref k Gmail thread. Generic ESP: null.
- Mailbox sync downstream matchuje inbound replies přes `provider_thread_id` (Gmail) nebo přes `In-Reply-To` / `References` header chain (ESP).

**Zachování provider-specific error bez rozbití normalized kontraktu:**
- `provider_response_excerpt` (max 500 chars, PII-safe) drží raw error string pro operator post-mortem.
- `provider_http_status` + `provider_raw_status` drží provider-specific hodnoty.
- Normalized `error_class` + `error_code` drží provider-agnostic classification pro queue worker / CS3.

**Dohledatelnost po success:**
- `queue.provider_message_id` → provider sent folder (Gmail Sent / ESP activity log)
- `queue.provider_thread_id` → Gmail thread (pokud Gmail adapter)
- `_asw_logs` řádek s `event_id` → run history kontext
- `queue.run_id_last` / `queue.event_id_last` → CS2 run correlation

**Dohledatelnost po fail:**
- `queue.failure_reason` + `queue.failure_class` → CS3 dead-letter
- `queue.dead_letter_id` → `_asw_dead_letters` row → operator workflow
- `_asw_logs` řádek (level=ERROR) s plným normalized payloadem → post-mortem
- `response.provider_response_excerpt` + `response.provider_http_status` → provider support ticket content

### 10. Sender selection rules

**Config-level decision (zapisováno jednou, vyhodnocováno při startu queue workera):**

| Mechanismus | Hodnota | Kde |
|-------------|---------|-----|
| Script Property `EMAIL_PROVIDER` | `"GMAIL"` (default) / `"SENDGRID"` / `"MAILGUN"` | PROPOSED FOR C-06 — nepřidává se v tomto tasku |
| Fallback pokud property není set | `"GMAIL"` (matches current state — `OutboundEmail.gs` používá `GmailApp`) | Adapter factory |
| Per-request override | **ZAKÁZÁNO** v1.0 | Business logika se nesmí větvit podle providera |

**Runtime decision:** žádné. Provider je fixní per runtime — queue worker ho čte jednou, adapter instance cachuje.

**Jak zajistit, že změna providera nevyžaduje změnu business logiky:**
1. Queue worker importuje pouze `EmailSender` interface (type), ne konkrétní adapter.
2. `getEmailSender()` factory čte `EMAIL_PROVIDER` property a vrací `EmailSender`-compatible instance.
3. Adapter instance je jediný entry point; queue worker nevolá `GmailApp` ani `fetch()` přímo.
4. Změna providera = změna 1 Script Property hodnoty + nasazení příslušného adapteru. Queue worker kód beze změny.

**Multi-provider fallback (out of scope):**
Pokud primary provider fail RATE_LIMIT → secondary provider retry. **Není C-06 v1.0.** Důvody:
- Zvýšená složitost sender selection, conflicting provider configs, consistency problém (`provider_message_id` mezi dvěma providery nelze korelovat).
- CS3 S12 max_attempts=1 pravidlo odpor. Multi-provider fallback by vyžadoval nové CS3 pravidlo.
- Business priorita zatím nežádá (1 primary provider = Gmail, přechod na ESP je migrace, ne A/B).

Budoucí C-06 v2 může zavést. Proto `NormalizedSendResponse.provider_name` existuje (audit, který provider response vyprodukoval) — forward-compat.

### 11. Sample pseudocode flow

```
// Queue worker loop (illustrative; neimplementuje C-06; scope je jen rozhraní)
function processOutboundQueueBatch() {
  sender      = getEmailSender()         // config-level: GmailAdapter | SendGridAdapter | …
  rows        = claimReadyQueueRows(max=25)  // atomic: QUEUED→SENDING per row

  foreach row in rows:
    request = buildSendRequest(row)      // C-05 payload → SendRequest
    try:
      response = sender.send(request)    // EmailSender.send — provider-agnostic
    catch unexpected_exception e:        // adapter má vrátit normalized, ne házet
      response = normalizedUnknownFailure(request, e)

    if response.success:
      row.send_status         = "SENT"
      row.sent_at             = response.sent_at
      row.provider_message_id = response.provider_message_id
      row.provider_thread_id  = response.provider_thread_id
      row.updated_at          = now()
      persistLifecycleTransition(row.lead_id, "EMAIL_SENT")  // T18
      logToAswLogs(INFO,  "QueueWorker.send", row, response)
    else:
      row.send_status    = "FAILED"
      row.failure_reason = response.error_message
      row.failure_class  = mapToFailureClass(response.error_class)  // CS3 TRANSIENT/PERMANENT/AMBIGUOUS
      row.updated_at     = now()
      row.dead_letter_id = promoteToDeadLetter(row, response)       // CS3 S12 — immediate
      logToAswLogs(ERROR, "QueueWorker.send", row, response)
      // NEPROVÁDĚT CS1 transition na FAILED — to je operator menu akce T25

    persistQueueRow(row)
}
```

**Klíčové:**
- `sender.send(request)` je jediný volání provideru; adapter vše schová.
- `mapToFailureClass()` je fixní lookup table, ne větev podle `provider_name`.
- `persistLifecycleTransition()` se volá **pouze při success** — C-06 netriggeruje CS1 FAILED; to je operator workflow.
- Exception handler (`catch`) je safety net; správně napsaný adapter nikdy nevyhazuje, vždy vrací normalized.

### 12. Boundary rules / handoff

| Task / vrstva | Vztah k C-06 | Stav |
|---------------|--------------|------|
| **C-05 Outbound queue** | C-06 konzumuje queue payload (přes `SendRequest` derivát). C-06 emituje výstup, který queue worker mapuje na `send_status` + failure fields. | Handoff připravený; C-05 merged. |
| **CS1 Lifecycle (EMAIL_SENT)** | C-06 success → queue worker T18 (`EMAIL_QUEUED → EMAIL_SENT`). C-06 fail → CS1 zůstává `EMAIL_QUEUED` (C-06 netriggeruje FAILED CS1 state). | Compatible; žádná nová CS1 state. |
| **CS3 Reliability (failure_class, retry, dead-letter)** | `NormalizedSendErrorClass` je jemnější než CS3 `failure_class`; queue worker mapuje 1:N na fixním lookup table. CS3 S12 max_attempts=1 je respektovaný — C-06 nikdy neretryuje. | Compatible; reuses CS3. |
| **CS2 Orchestrator (S12 + `_asw_logs`)** | C-06 neemituje `_asw_logs` sám; queue worker to dělá s normalized payloadem. `sender_run_id` + `sender_event_id` jsou echoed zpět v response pro audit. | Compatible; reuses CS2. |
| **C-04 Sendability Gate** | C-04 žije před queue; C-06 žije za queue. Žádná přímá interakce — oddělené C-05 queue vrstvou. | Compatible. |
| **C-07 Follow-up cadence** | Follow-up je další queue row s `thread_hint` (v C-06 `SendRequest` schema) nastaveným na předchozí `provider_thread_id`. Gmail adapter ho propne do reply-in-thread. ESP adapter do `In-Reply-To` headeru. | Forward-compat; C-06 připravený. |
| **C-08 Rate limiting / quiet hours** | C-06 hlásí `rate_limit_reset_at`; C-08 ho použije pro scheduled re-queue. C-06 sám nerozhoduje o timingu. | Forward-compat; C-08 specifikace mimo C-06. |
| **C-09 Suppression list** | Suppression je v C-04 gate (reason B7/B8). C-06 nevidí suppressed leady (nedoputují do queue). Nicméně provider-level suppression (bounce history) může vrátit `INVALID_RECIPIENT` — to je separate. | Compatible; disjoint. |
| **Mailbox sync (reply/bounce)** | C-06 končí u provider response. Reply/bounce je downstream. Cross-ref přes `provider_message_id` / `provider_thread_id`. | Downstream; mimo C-06. |
| **Budoucí implementační task — adaptery** | Materializuje `GmailAdapter` (reusuje existing `OutboundEmail.gs` + `GmailApp`), volitelně `SendGridAdapter` / `MailgunAdapter`. Implementuje `EmailSender` interface podle C-06 sekce 3. Zavede `getEmailSender()` factory + `EMAIL_PROVIDER` Script Property. | C-06 handoff ready. |
| **Budoucí provider onboarding task** | Pro přidání nového providera: vytvořit adapter (≤1 soubor), implementovat 7-hodnotový `provider_status` mapping, implementovat 8-třídový `error_class` mapping, zajistit PII safety. Queue worker kód beze změny. | C-06 handoff ready. |

### 13. Non-goals (explicitní)

- Neimplementuje `GmailAdapter`, `SendGridAdapter`, `MailgunAdapter` v `apps-script/`.
- Neimplementuje `getEmailSender()` factory / `EMAIL_PROVIDER` Script Property.
- Neimplementuje queue worker loop.
- Neimplementuje mailbox sync.
- Neimplementuje frontend provider config UI.
- Neimplementuje multi-provider fallback / primary+secondary routing.
- Neimplementuje provider webhook ingest (bounce, complaint, open, click).
- Neimplementuje attachment support (v1.0 `SendRequest.attachments` je rezerva, vždy prázdné).
- Neimplementuje HTML body rendering (v1.0 `SendRequest.body.html` je rezerva; queue worker předává `plain`).
- Neimplementuje thread reply (v1.0 `SendRequest.thread_hint` je rezerva pro C-07).
- Neprovádí runtime Config.gs changes — všechny nové enumy (`NormalizedProviderStatus`, `NormalizedSendErrorClass`) + Script Property (`EMAIL_PROVIDER`) jsou PROPOSED FOR C-06.
- Nezavádí nové canonical lifecycle states (CS1 18 stavů beze změny).
- Nezavádí nové queue statusy (C-05 5 statusů beze změny).

### 14. Acceptance checklist

- [x] Sender interface je provider-agnostický (sekce 3.1 `SendRequest`, žádná pole specifická pro konkrétního providera).
- [x] Response kontrakt pokrývá success i fail (sekce 3.2 `NormalizedSendResponse` — required tabulka rozlišuje success vs fail).
- [x] Provider-specific detaily oddělené od business logiky (sekce 4 pravidla, sekce 11 pseudocode — queue worker nevidí provider SDK).
- [x] Rate limiting popsaný jako kontrakt + failure class; nerozbije batch (sekce 6 vrstvy).
- [x] 3 fail scénáře mají jasné mapování (sekce 7: TIMEOUT, RATE_LIMIT, INVALID_RECIPIENT — každý s tabulkou NormalizedSendResponse fields + CS3 handoff + zdůvodnění proč nevyžaduje změnu business logiky).
- [x] Gmail vs generic ESP mapping jednoznačný (sekce 5.1 Gmail + 5.2 generic ESP + tabulka odlišností).
- [x] Provider status normalization: 4-vrstvová separace (A raw, B `NormalizedProviderStatus`, C `QUEUE_SEND_STATUS`, D CS1) s deterministickým mapping pravidlem (sekce 8).
- [x] Auditability + cross-ref do `_asw_logs` a queue (sekce 9).
- [x] Sender selection je config-level, not runtime (sekce 10); multi-provider fallback explicitně out-of-scope.
- [x] Pseudocode flow propojuje vše (sekce 11).
- [x] Všechny nové enumy / pole / Script Property označené jako PROPOSED FOR C-06 / INFERRED / VERIFIED (sekce 15).

### 15. PROPOSED vs INFERRED vs VERIFIED label summary

**VERIFIED IN REPO (reuse existing):**
- `GmailApp.sendEmail()`, `GmailApp.search()`, `GmailThread.getId()`, `GmailMessage.getId()` — existují v `apps-script/OutboundEmail.gs` (řádky 233, 281, 296) a `apps-script/SyncMailbox.gs`.
- `_asw_logs` sheet + `aswLog_()` helper — existuje (`apps-script/Helpers.gs`).
- `_asw_outbound_queue` queue row fields `outreach_queue_id`, `lead_id`, `recipient_email`, `email_subject`, `email_body`, `idempotency_key`, `send_status`, `provider_message_id`, `sent_at`, `failure_reason`, `failure_class`, `dead_letter_id`, `run_id_last`, `event_id_last` — z C-05 spec (merged PR #28).

**INFERRED FROM EXISTING SYSTEM:**
- `sender_run_id` / `sender_event_id` — reuses CS2 run history identifiers (`_asw_logs` payload schema, CS2 sekce 6.1).
- CS3 `failure_class` mapping — reuses CS3 sekce 5.1 (TRANSIENT / PERMANENT / AMBIGUOUS).
- Gmail idempotency absence — deduce z `OutboundEmail.gs` current pattern (5min double-send window + outreach_stage monotonic guard stojí místo provider idempotency).

**PROPOSED FOR C-06 (new, implementation task will materialize):**
- `EmailSender` interface (1 metoda `send()` s 17-field `SendRequest` input a 17-field `NormalizedSendResponse` output).
- `NormalizedProviderStatus` enum (7 hodnot: ACCEPTED, QUEUED_BY_PROVIDER, REJECTED, THROTTLED, TIMEOUT, AUTH_FAILED, UNKNOWN).
- `NormalizedSendErrorClass` enum (8 hodnot: TIMEOUT, RATE_LIMIT, INVALID_RECIPIENT, AUTH_FAILED, PROVIDER_UNAVAILABLE, PROVIDER_REJECTED, INVALID_REQUEST, UNKNOWN) + fixní mapping na CS3 `failure_class`.
- `provider_thread_id` field v queue schema (rozšíření C-05 sekce 3 — PROPOSED dodatek; implementační task formalizuje).
- Script Property `EMAIL_PROVIDER` (hodnoty: `GMAIL` default / `SENDGRID` / `MAILGUN`).
- `getEmailSender()` factory pattern.
- Payload/response `payload_version = "1.0"` konstanta.
- PII safety invariant pro `provider_response_excerpt` + `error_message` sanitizaci.

---

## Inbound event ingest — C-07 (reply / bounce / unsubscribe)

> **SPEC-only.** Tato sekce definuje kontrakt event ingest vrstvy po úspěšném sendu. Neimplementuje mailbox polling worker, ESP webhook handler, frontend UI, follow-up engine ani provider adaptér.

> **Nomenklatura C-07:** V sekci C-06 handoff tabulce (řádek "C-07 Follow-up cadence") byl C-07 orientačně zmíněn jako "follow-up cadence engine". Vlna 7 zadání reassignovala C-07 na **reply / bounce / unsubscribe ingest**. Follow-up cadence engine je mimo C-07 scope a bude samostatný downstream task. C-07 ingest je **prerekvizita** pro jakýkoli follow-up engine (engine potřebuje vědět, kdy NEposílat další email).

### 1. Účel ingest vrstvy po sendu

```
         ┌──────────────────┐
send ──► │  C-06 sender     │ ──► NormalizedSendResponse ──► queue SENT
         └──────────────────┘                                     │
                                                                  │
                                     ↓ (čas plyne, vzdálený strana reaguje)
                                                                  │
              ┌───────────────────────────────────────────────────┴────┐
              │                                                        │
   mailbox sync (Gmail)                                  provider webhook (ESP)
              │                                                        │
              └────────────────────┬───────────────────────────────────┘
                                   │
                                   ▼
                        ┌──────────────────────┐
                        │  C-07 ingest         │
                        │  normalize event     │
                        │  ─────────────       │
                        │  REPLY / BOUNCE /    │
                        │  UNSUBSCRIBE /       │
                        │  UNKNOWN / COMPLAINT │
                        └──────────┬───────────┘
                                   │
                     ┌─────────────┼─────────────┐
                     ▼             ▼             ▼
            CS1 lifecycle    stop rules    review flag
            transition       (queue cancel,  (needs_manual_reply
            (REPLIED /       stop follow-up) classifier)
             BOUNCED /
             UNSUBSCRIBED)
```

C-07 odděluje **co přijde po sendu** od:
- provider **send response** (to je C-06 — synchronní výstup z `sender.send`)
- queue **SEND_STATUS** (to je C-05 — stav odesílání, ne příjmu)
- lead **lifecycle state** (to je CS1 — kanonická dimenze leadu)
- follow-up **cadence** (to je budoucí task — logika "kdy poslat další mail")

C-07 je **ingest kontrakt**: definuje event schemata, lifecycle mapping, stop rules a idempotency invariants. Runtime ingest (mailbox polling, webhook endpoint) je **implementační task**.

### 2. Boundary / non-goals

**C-07 řeší:**
- Event schema pro 3 primární event families: REPLY, BOUNCE, UNSUBSCRIBE.
- Event schema pro 2 doplňkové rezervy: UNKNOWN_INBOUND, COMPLAINT (obě PROPOSED).
- Normalizaci raw mailbox / webhook signálů na standardized `InboundEvent` tvar.
- Deterministický mapping event → CS1 lifecycle transition.
- Stop rules, které event musí vyvolat (queue cancel, follow-up block, suppression).
- Idempotency / duplicate-ingest invariants.
- Cross-ref graf (event ↔ queue row ↔ lead ↔ `_asw_logs`).
- Source variants (mailbox polling / webhook / manual).
- Visibility: které LEADS sloupce se aktualizují, kde žije operator review signal.

**C-07 NEŘEŠÍ (out-of-scope):**
- Mailbox polling worker / Gmail polling runtime.
- ESP webhook endpoint / HTTP handler.
- Provider adaptér pro inbound (to je obdoba C-06 na inbound straně — budoucí task).
- Follow-up cadence engine (kdy poslat další mail v threadu).
- Reply classification ML / NLP model (v1.0 používá jen rule-based classifier).
- Operator reply-handling UI (manuál reply screen, suppression management UI).
- Automatickou reply generaci (CRM neodpovídá za tým).
- Mutaci C-06 `EmailSender` nebo C-05 queue schema (C-07 jen **čte** `provider_message_id` / `provider_thread_id` / `lead_id` z queue; nezapisuje do queue status poli).
- Přidávání nových canonical CS1 states.

**Vztah k B6:**
- B6 (operator reply-handling UI) **není blocker** pro C-07 SPEC. C-07 definuje event store a review flag kontrakt nezávisle na UI. B6 později implementuje, jak operator tyto flagy čte/řeší.

### 3. Event family overview

| Event family | Trigger | CS1 mapping | Stop rule tier | Label |
|--------------|---------|-------------|----------------|-------|
| **REPLY** | Lead (nebo někdo z jeho doménu) odpověděl na náš email. | `EMAIL_SENT → REPLIED` (T20). Terminal. | Tier 1: stopuje follow-up automation. Queue row již SENT, není co cancelovat. | VERIFIED (existing `email_reply_type=REPLY` detekce v `apps-script/MailboxSync.gs`). |
| **BOUNCE** | Provider vrátí nedoručeno (mailer-daemon, MAILER-DAEMON@, delivery status, ESP webhook `bounce` event). | `EMAIL_SENT → BOUNCED` (T21). Terminal. | Tier 2: stopuje další send na tuto adresu **napříč všemi thready i budoucími queue rows**. | VERIFIED (existing `isBounceMessage_` v `apps-script/MailboxSync.gs:321`). |
| **UNSUBSCRIBE** | Lead explicitně požádal o odhlášení (`List-Unsubscribe` click, reply body obsahující unsubscribe intent, ESP webhook `unsubscribe`). | `* → UNSUBSCRIBED` (T22; může přijít z kteréhokoli outreach stavu, typicky `EMAIL_SENT`). Terminal. | Tier 3: stopuje **veškerou** outreach na lead (nejen email, i budoucí kanály). Nejsilnější stop. | PROPOSED FOR C-07 (žádná runtime detekce dnes neexistuje; existing `Config.gs` enumy ji nepokrývají). |
| **UNKNOWN_INBOUND** | Něco přišlo do threadu, ale classifier není schopen určit, zda je to reply, bounce, OOO nebo šum. | `EMAIL_SENT → REPLIED` (konzervativně — jakákoli inbound aktivita znamená, že lead (nebo jeho systém) reaguje; nechceme posílat další mail v blind). `reply_needs_manual=TRUE` review flag. | Tier 1 (stejný jako REPLY). | PROPOSED FOR C-07. VERIFIED částečně (existing `EMAIL_REPLY_TYPE.UNKNOWN` + `OOO` — ty tvoří subset tohoto bucketu). |
| **COMPLAINT** | ESP hlásí spam complaint (feedback loop). Rezerva pro ESP bez explicit unsubscribe events. | Mapping: stejný jako UNSUBSCRIBE (reputation damage + legal implications). | Tier 3. | PROPOSED FOR C-07. Žádná Gmail detekce dnes (Gmail to hlásí jen hromadně přes Postmaster Tools, ne per-thread). |

**Anti-pattern:**
- `OOO` (out-of-office) **není** samostatná event family pro lifecycle. Per existing `classifyReplyType_()` je to auxiliary `email_reply_type` hodnota a per docs/21 M-8 note "není lifecycle změna". C-07 respektuje: OOO se zachycuje jako metadata (`reply_class=OOO`), ale `reply_event` stále vzniká a lifecycle mapping se **přeskakuje** (lead zůstává `EMAIL_SENT`, follow-up se ale pozastaví na X dní pro "lead je na dovolené"). Detailní OOO hold pravidla jsou mimo C-07 scope (follow-up engine task).

### 4. Reply event schema (`reply_event`)

Jeden reply event odpovídá **jednomu** inbound zprávě od leadu na jeden existující queue row. Pokud lead pošle dva reply rychle po sobě, vznikne N reply events (s různými `event_id`, stejným `outreach_queue_id`).

| # | Pole | Typ | Required | Nullable | Význam | Source | Label |
|---|------|-----|----------|----------|--------|--------|-------|
| 1 | `event_id` | string | ✓ | ✗ | UUID v4 per ingest, primární klíč v `_asw_inbound_events`. | Generated by ingest code. | PROPOSED FOR C-07. |
| 2 | `ingest_event_id` | string | ✓ | ✗ | Idempotency key (viz sekce 14). Deduplikace vs re-poll / webhook retry. | Generated deterministicky (viz sekce 14 §A). | PROPOSED FOR C-07. |
| 3 | `lead_id` | string | ✓ | ✗ | Cross-ref na LEADS `lead_id`. | LEADS `lead_id` (VERIFIED v `Config.gs` EXTENSION_COLUMNS). | VERIFIED. |
| 4 | `outreach_queue_id` | string | ✓ | ✓ | Cross-ref na `_asw_outbound_queue` (C-05 sekce 3). Nullable pouze pokud mailbox sync našel thread bez odpovídající queue row (legacy pre-queue send). | C-05 queue (VERIFIED C-05 spec). | PROPOSED FOR C-07 (cross-ref). |
| 5 | `provider_message_id` | string | ✓ | ✗ | Provider ID originální **odeslané** message (ne inbound). Umožňuje thread pairing. | C-06 `NormalizedSendResponse.provider_message_id`. | VERIFIED (C-06 sekce 3.2). |
| 6 | `provider_thread_id` | string | ✓ | ✓ | Thread ID (Gmail) nebo `In-Reply-To` chain root (ESP). Nullable pro providery bez thread konceptu. | C-06 `NormalizedSendResponse.provider_thread_id`. | VERIFIED (C-06). |
| 7 | `inbound_message_id` | string | ✓ | ✗ | Provider ID **inbound** zprávy samotné. Odlišné od `provider_message_id` (outbound). | Gmail message ID / ESP inbound event ID. | PROPOSED FOR C-07. |
| 8 | `event_type` | enum | ✓ | ✗ | Fixní `"REPLY"`. | Constant. | PROPOSED FOR C-07. |
| 9 | `event_occurred_at` | ISO-8601 | ✓ | ✗ | Kdy zpráva **vznikla u odesílatele** (message Date header). | Gmail `GmailMessage.getDate()` / ESP `timestamp`. | VERIFIED (existing `MailboxSync.gs` reads it). |
| 10 | `detected_at` | ISO-8601 | ✓ | ✗ | Kdy CRM event **detekoval** (polling tick / webhook receipt). | Generated by ingest code. | PROPOSED FOR C-07. |
| 11 | `reply_class` | enum | ✓ | ✗ | Normalized classification: `POSITIVE`, `NEGATIVE`, `QUESTION`, `OOO`, `UNCLASSIFIED`. | Rule-based classifier (v1.0); ML/NLP v2. | PROPOSED FOR C-07. |
| 12 | `reply_needs_manual` | boolean | ✓ | ✗ | `TRUE` pokud `reply_class=UNCLASSIFIED` nebo classifier confidence pod threshold. Review signal, ne lifecycle state. | Derived z `reply_class` + confidence. | PROPOSED FOR C-07. |
| 13 | `raw_source` | enum | ✓ | ✗ | Protocol origin: `GMAIL_THREAD`, `ESP_WEBHOOK`, `MANUAL_OPERATOR_INPUT`. | Ingest code. | PROPOSED FOR C-07. |
| 14 | `ingest_source` | string | ✓ | ✗ | Konkrétní ingest job identifier (např. `mailbox_sync_run_2026-04-21T15:30:00Z` nebo `webhook_sendgrid_inbound_parse`). | Generated by ingest code. | PROPOSED FOR C-07. |
| 15 | `message_excerpt` | string | ✓ | ✗ | První 256 znaků plain body. PII-safe sanitized (žádné linkování CC/BCC, žádné attachments). | `GmailMessage.getPlainBody().substring(0,256)` / ESP payload. | PROPOSED FOR C-07. |
| 16 | `classifier_version` | string | ✓ | ✗ | Verze classifier logiky (`"rule-based-v1"`). Audit přes změny classifier pravidel. | Constant per deployment. | PROPOSED FOR C-07. |
| 17 | `lifecycle_transition_applied` | enum | ✓ | ✗ | `APPLIED`, `SKIPPED_IDEMPOTENT`, `SKIPPED_OOO_HOLD`. Explicit log, jestli event lifecycle změnu způsobil. | Ingest code. | PROPOSED FOR C-07. |
| 18 | `payload_version` | string | ✓ | ✗ | `"1.0"`. Forward-compat pro schema evoluci. | Constant. | PROPOSED FOR C-07. |

**Celkem: 18 polí.**

### 5. Bounce event schema (`bounce_event`)

| # | Pole | Typ | Required | Nullable | Význam | Source | Label |
|---|------|-----|----------|----------|--------|--------|-------|
| 1 | `event_id` | string | ✓ | ✗ | UUID v4. | Generated. | PROPOSED FOR C-07. |
| 2 | `ingest_event_id` | string | ✓ | ✗ | Idempotency key (sekce 14). | Generated. | PROPOSED FOR C-07. |
| 3 | `lead_id` | string | ✓ | ✗ | Cross-ref LEADS. | LEADS. | VERIFIED. |
| 4 | `outreach_queue_id` | string | ✓ | ✓ | Cross-ref queue. Nullable pro legacy pre-queue. | C-05 queue. | PROPOSED. |
| 5 | `provider_message_id` | string | ✓ | ✗ | Outbound message provider ID. | C-06 response. | VERIFIED. |
| 6 | `provider_thread_id` | string | ✓ | ✓ | Thread ID pokud existuje. | C-06 response. | VERIFIED. |
| 7 | `event_type` | enum | ✓ | ✗ | Fixní `"BOUNCE"`. | Constant. | PROPOSED. |
| 8 | `bounce_class` | enum | ✓ | ✗ | `HARD`, `SOFT`, `AUTORESPONSE_MISCLASSIFIED`, `UNCLASSIFIED`. `HARD` = permanent (adresa neexistuje, doména neexistuje). `SOFT` = transient (mailbox full, server temp error). | Rule-based classifier (SMTP reason code / DSN status / from pattern). | PROPOSED FOR C-07. |
| 9 | `bounce_reason` | string | ✓ | ✓ | Human-readable excerpt (DSN status code + diagnostic, 256 char max). Nullable pokud provider neposkytuje. | DSN status (RFC 3463) / ESP webhook reason. | PROPOSED FOR C-07. |
| 10 | `smtp_status_code` | string | ✓ | ✓ | RFC 3463 enhanced status (např. `5.1.1` = bad mailbox). Nullable pro non-SMTP sources. | DSN header / ESP payload. | PROPOSED FOR C-07. |
| 11 | `event_occurred_at` | ISO-8601 | ✓ | ✗ | Kdy bounce nastal u provideru. | Provider timestamp. | PROPOSED. |
| 12 | `detected_at` | ISO-8601 | ✓ | ✗ | Kdy CRM event detekoval. | Generated. | PROPOSED. |
| 13 | `raw_source` | enum | ✓ | ✗ | `GMAIL_DSN_THREAD` (Gmail thread s mailer-daemon), `ESP_WEBHOOK`, `MANUAL_OPERATOR_INPUT`. | Ingest code. | PROPOSED. |
| 14 | `ingest_source` | string | ✓ | ✗ | Ingest job identifier. | Generated. | PROPOSED. |
| 15 | `payload_version` | string | ✓ | ✗ | `"1.0"`. | Constant. | PROPOSED. |

**Celkem: 15 polí.**

**Vztah k C-06 `INVALID_RECIPIENT` error class:**
- C-06 `NormalizedSendErrorClass.INVALID_RECIPIENT` je **synchronní** bounce — provider hlásí v real-time response při `sender.send` (např. SMTP 550 immediate reject). Žije v C-06 response + queue `FAILED` + CS3 PERMANENT dead-letter.
- C-07 `bounce_event` je **asynchronní** bounce — provider akceptuje sendem, ale později vrátí DSN / webhook. Žije v `_asw_inbound_events` + CS1 T21 `EMAIL_SENT → BOUNCED`.
- Stejný lead může mít oboje (pokud retry = nový queue row; ale per C-05 pravidlo retry=nový row a `idempotency_key` by měl blokovat duplicate). V praxi: jeden z cest (SYNC nebo ASYNC) se aktivuje per provider.

### 6. Unsubscribe event schema (`unsubscribe_event`)

| # | Pole | Typ | Required | Nullable | Význam | Source | Label |
|---|------|-----|----------|----------|--------|--------|-------|
| 1 | `event_id` | string | ✓ | ✗ | UUID v4. | Generated. | PROPOSED. |
| 2 | `ingest_event_id` | string | ✓ | ✗ | Idempotency key. | Generated. | PROPOSED. |
| 3 | `lead_id` | string | ✓ | ✗ | Cross-ref LEADS. | LEADS. | VERIFIED. |
| 4 | `outreach_queue_id` | string | ✓ | ✓ | Cross-ref queue (nullable — unsub může přijít i mimo thread, např. přímá mailto: link). | C-05 queue. | PROPOSED. |
| 5 | `provider_message_id` | string | ✓ | ✓ | Outbound message ID pokud unsub souvisí s konkrétním emailem. Nullable. | C-06. | VERIFIED. |
| 6 | `provider_thread_id` | string | ✓ | ✓ | Thread ID pokud existuje. | C-06. | VERIFIED. |
| 7 | `event_type` | enum | ✓ | ✗ | Fixní `"UNSUBSCRIBE"`. | Constant. | PROPOSED. |
| 8 | `unsubscribe_source` | enum | ✓ | ✗ | `LIST_UNSUBSCRIBE_HEADER` (RFC 8058 one-click), `LIST_UNSUBSCRIBE_MAILTO` (mailto: link click), `REPLY_BODY_INTENT` (classifier detekoval "nechci další maily" v reply), `ESP_WEBHOOK_UNSUB`, `MANUAL_OPERATOR_INPUT` (GDPR request email handled out-of-band). | Ingest code. | PROPOSED FOR C-07. |
| 9 | `unsubscribe_reason` | string | ✓ | ✓ | Human-readable excerpt (pokud `unsubscribe_source=REPLY_BODY_INTENT` → message excerpt; jinak nullable). | Message body / webhook payload. | PROPOSED. |
| 10 | `event_occurred_at` | ISO-8601 | ✓ | ✗ | Kdy unsub nastal. | Provider / message timestamp. | PROPOSED. |
| 11 | `detected_at` | ISO-8601 | ✓ | ✗ | Kdy CRM event detekoval. | Generated. | PROPOSED. |
| 12 | `raw_source` | enum | ✓ | ✗ | `GMAIL_THREAD`, `ESP_WEBHOOK`, `MANUAL_OPERATOR_INPUT`. | Ingest code. | PROPOSED. |
| 13 | `ingest_source` | string | ✓ | ✗ | Ingest job identifier. | Generated. | PROPOSED. |
| 14 | `payload_version` | string | ✓ | ✗ | `"1.0"`. | Constant. | PROPOSED. |

**Celkem: 14 polí.**

### 7. Event normalization model (4-layer separation)

C-07 striktně odděluje čtyři vrstvy identity:

| Layer | Co to je | Kdo ji zná | Příklad pro reply | Příklad pro bounce |
|-------|----------|------------|-------------------|---------------------|
| **A. Raw provider/mailbox signal** | Per-provider tvar (Gmail `GmailMessage`, SendGrid inbound parse JSON, Mailgun webhook). | Adaptér (budoucí task); C-07 ho **nedefinuje**. | `{ from: "lead@example.cz", subject: "Re: Nabídka", body: "Díky, ozvu se příští týden." }` | `{ from: "MAILER-DAEMON@example.com", subject: "Delivery Status Notification", body: "... 5.1.1 ..." }` |
| **B. Normalized `InboundEvent`** | C-07 kanonický tvar (reply_event / bounce_event / unsubscribe_event / unknown_inbound / complaint). | Ingest kód + downstream (CS1 transition logic, stop-rule enforcer, operator review flag setter). | `reply_event { event_type: "REPLY", reply_class: "POSITIVE", ... }` | `bounce_event { event_type: "BOUNCE", bounce_class: "HARD", smtp_status_code: "5.1.1", ... }` |
| **C. Lead lifecycle transition** | CS1 18-state; event → transition (T20/T21/T22). | CS1 layer (`docs/21-business-process.md`). | `EMAIL_SENT → REPLIED` (T20) | `EMAIL_SENT → BOUNCED` (T21) |
| **D. Operator review signal** | Review flag / manual action queue. **Není** lifecycle state. | Operator UI (B6, out-of-scope pro C-07). | `reply_needs_manual=TRUE` pokud `reply_class=UNCLASSIFIED` | N/A (bounce je automaticky terminal, žádný manual review flag) |

**Deterministický flow Raw → Normalized → Lifecycle + Stop rules + Review:**

```
Raw event (Layer A)
    │
    ▼
classify_inbound(raw) → normalized_event (Layer B)
    │
    ├──► apply_lifecycle_transition(normalized_event)  (Layer C)
    ├──► apply_stop_rules(normalized_event)            (queue cancel + follow-up block + suppression)
    ├──► set_review_flag_if_needed(normalized_event)   (Layer D, review signal)
    └──► append_to_logs(_asw_logs, normalized_event)   (CS2 run history)
```

Každý ze čtyř kroků je **idempotentní** (viz sekce 14). Flow je **read-raw → write-normalized → fan-out → persist**.

### 8. Mapping do lead lifecycle

| Event | CS1 transition | Terminal? | Stop rule tier | Review flag | Notes |
|-------|----------------|-----------|-----------------|-------------|-------|
| `reply_event` (reply_class ≠ UNCLASSIFIED) | T20: `EMAIL_SENT → REPLIED` | ✓ | Tier 1 (stop follow-up) | ✗ | REPLIED je terminal per CS1. WON/LOST je downstream auxiliary (docs/21). |
| `reply_event` (reply_class = UNCLASSIFIED) | T20: `EMAIL_SENT → REPLIED` | ✓ | Tier 1 (stop follow-up) | ✓ `reply_needs_manual=TRUE` | **Lifecycle stále jde na REPLIED** — fakt, že lead něco odpověděl, je terminal signal. Operator musí manuálně interpretovat obsah (WON/LOST/QUESTION/NEGATIVE), ale CS1 lifecycle nezůstává v mezistavu. |
| `reply_event` (reply_class = OOO) | žádná | — | Tier 1 (stop follow-up **dočasně** — cadence pause) | ✗ | Auxiliary `email_reply_type=OOO` per docs/21 M-8. Lead zůstává `EMAIL_SENT`. Follow-up engine pozastaví cadence na X dní. OOO hold logic je mimo C-07. |
| `bounce_event` (bounce_class = HARD) | T21: `EMAIL_SENT → BOUNCED` | ✓ | Tier 2 (stop send + propagace suppression) | ✗ | Hard bounce znamená nevalidní adresa. C-09 suppression list (budoucí) dostane `recipient_email`. |
| `bounce_event` (bounce_class = SOFT) | **žádná** v v1.0 | — | Tier 2 částečně (pauza send na X hodin, ne permanent block) | ✓ `soft_bounce_review=TRUE` pokud X+ po sobě | Soft bounce = transient (mailbox full, server temp). Opakované soft bounce = eskalace na HARD. Eskalační logika je PROPOSED FOR C-07 (sekce 12 §B). |
| `unsubscribe_event` | T22: `* → UNSUBSCRIBED` (typicky z `EMAIL_SENT`, ale spec umožňuje i z mezistavů pokud operator manuálně odhlásí) | ✓ | Tier 3 (stop all outreach + suppression + legal audit trail) | ✗ | Nejsilnější stop. C-09 suppression + GDPR log. |
| `unknown_inbound` | T20: `EMAIL_SENT → REPLIED` (konzervativně) | ✓ | Tier 1 (stop follow-up) | ✓ `reply_needs_manual=TRUE` | Viz sekce 12. |
| `complaint_event` | T22: `* → UNSUBSCRIBED` | ✓ | Tier 3 | ✗ | PROPOSED. Per ESP feedback loop (Mailgun/SendGrid). |

**Důležité invarianty:**

1. **C-07 nikdy nezavádí nový canonical CS1 state.** Všechny existing states (REPLIED #15, BOUNCED #16, UNSUBSCRIBED #17) už CS1 má.
2. **`NEEDS_MANUAL_REPLY` NENÍ CS1 state.** Je to **review flag** na LEADS/event úrovni (`reply_needs_manual` boolean). Lifecycle lead zůstává `REPLIED`; flag signalizuje operator, že konkrétní reply potřebuje manuální interpretaci.
3. **Terminal states jsou finální** pro C-07. Lead ve stavu `REPLIED` nelze dalším inbound eventem posunout do `UNSUBSCRIBED` automaticky — musí být manuální operator akce (T-edge z CS1 docs/21 explicitně nezakazuje, ale C-07 defaultně nezapisuje). Protection: pokud lead je `REPLIED` a pak přijde `unsubscribe_event`, C-07 **přepíše** CS1 na `UNSUBSCRIBED` (UNSUBSCRIBED > REPLIED v compliance priority) + zapíše oba events do `_asw_inbound_events` (audit trail).
4. **Multi-event ordering:** Pokud přijdou dva eventy ve stejný tick, precedence: `UNSUBSCRIBE > COMPLAINT > BOUNCE > REPLY > UNKNOWN_INBOUND`. Compliance (unsub) má nejvyšší prioritu.

### 9. Stop rules (3-tier model)

C-07 definuje tři vrstvy stop rules. Každý event triggeruje **alespoň** jednu vrstvu. Vrstvy jsou kumulativní (vyšší tier zahrnuje všechny nižší).

| Tier | Co stopuje | Triggery | Skope | Implementace (handoff) |
|------|------------|----------|-------|------------------------|
| **Tier 1 — follow-up stop** | Další email ve **stejném threadu**. Lead dostal signal, že reaguje; další send by byl spam vůči aktivní komunikaci. | `reply_event`, `unknown_inbound`, `reply_class=OOO` (dočasně). | Per-thread (`provider_thread_id`). | Follow-up cadence engine (budoucí task) před `sender.send` kontroluje inbound events pro thread; pokud existují → skip. |
| **Tier 2 — address stop** | Další send na **stejnou recipient_email adresu**, napříč všemi thready. | `bounce_event` (HARD → permanent; SOFT → temporary hold X hodin/dní). | Per-email-address. | C-04 sendability gate (existuje) rozšíří block reasons o `ADDRESS_BOUNCED` (PROPOSED FOR C-07 extension). C-09 suppression list dostane `recipient_email`. |
| **Tier 3 — lead stop (full suppression)** | Veškerou outreach na **lead_id**, napříč všemi kanály a emaily. | `unsubscribe_event`, `complaint_event`. | Per-lead. | C-04 gate (existing B7/B8 block reasons `UNSUBSCRIBED` / `SUPPRESSED`) už toto pokrývá. C-09 suppression list + GDPR audit log. |

**Stop-rule propagation:**

- C-07 **sám o sobě** queue row cancel **neprovádí**. Queue row v C-05 se po `SEND` dostane na `SENT` (terminal); tam nelze cancel. Stop rules se aplikují na **budoucí** queue rows (blokuje producer-side v C-04 gate).
- Pokud existuje queue row ve stavu `QUEUED` (čekající na send, ještě neodeslán), a přijde `unsubscribe_event` nebo `bounce_event` → queue worker při `claim` kontroluje suppression list + inbound events a pokud najde Tier 2/3 → queue row se přesune na `CANCELLED` (C-05 explicit transition `QUEUED → CANCELLED` s `cancel_reason=SUPPRESSED` nebo `BOUNCED_ADDRESS`). **Tohle je budoucí implementační task** (queue worker + C-09 suppression gate — ne C-07 SPEC).
- Race: `SENDING` (in-flight) row nelze cancel (C-05 invariant). Pokud `unsubscribe` přijde během `SENDING`, reality je: email letí, po doručení lead dostane unsub option; followup cadence se nespouští.

**Akceptační test mapping:**
- ✓ **Bounce zastaví další send** → Tier 2 (address stop) + Tier 1 (follow-up stop).
- ✓ **Unsubscribe zastaví další outreach** → Tier 3 (lead stop, all-channel).
- ✓ **Reply zastaví follow-up automation** → Tier 1 (follow-up stop per thread).
- ✓ **Unknown/unclassified reply jde na manual handling** → Tier 1 + `reply_needs_manual=TRUE` review flag.

### 10. Visibility v systému

Kde operator vidí, co se stalo:

| Signal | Location | Update mechanism |
|--------|----------|-----------------|
| **Lead dostal reply** | LEADS.`email_sync_status = REPLIED` (existing VERIFIED), LEADS.`email_reply_type = REPLY` (existing), LEADS.`last_email_received_at` (existing), LEADS.`email_reply_classifier` = `reply_class` (PROPOSED FOR C-07), LEADS.`reply_needs_manual` (PROPOSED FOR C-07). CS1 future: `lifecycle_state=REPLIED`. | C-07 ingest zapisuje do LEADS po T20 transition. |
| **Lead má bounce** | LEADS.`email_sync_status = BOUNCE` / `BOUNCED` (existing enum rozšíření PROPOSED), LEADS.`email_reply_type = BOUNCE` (existing), LEADS.`bounce_class` (PROPOSED FOR C-07). CS1 future: `lifecycle_state=BOUNCED`. | Po T21. |
| **Lead se odhlásil** | LEADS.`unsubscribed=TRUE` (PROPOSED, existing C-04 handoff), LEADS.`unsubscribed_at` (PROPOSED), LEADS.`unsubscribe_source` (PROPOSED). CS1 future: `lifecycle_state=UNSUBSCRIBED`. | Po T22. |
| **Reply potřebuje manuální interpretaci** | LEADS.`reply_needs_manual=TRUE` (PROPOSED). Operator UI (B6, out-of-scope) filtruje leady s tímto flagem. | Po `reply_class=UNCLASSIFIED` detekci. |
| **Plný event log** | `_asw_inbound_events` sheet (PROPOSED FOR C-07 — append-only event store, separátní od `_asw_outbound_queue`). | Každý ingest tick appenduje N událostí. |
| **Run-level audit** | `_asw_logs` (existing, CS2 run history). | Každý ingest run appenduje summary row (events_processed, events_skipped_idempotent, errors). |
| **Queue cross-ref** | `_asw_outbound_queue.last_inbound_event_id` (PROPOSED dodatek k C-05 queue schema — zapisuje ingest kód pro rychlé lookup "poslední reakce na tento queue row"). | Po každém úspěšném ingest eventu s ne-null `outreach_queue_id`. |

**Event store (`_asw_inbound_events`):**

Append-only sheet. Schema = union všech tří event schemat (18 + 15 + 14 polí, sparse — většina polí null pro non-applicable event_type) + technical metadata. Celkový column count ≈ 30 unique columns (deduplikace stejných polí napříč schemata).

### 11. Tři sample lifecycle scénáře po sendu

#### Scénář 1 — Lead odpoví (positive reply)

| Krok | Stav | Event | CS1 | Stop rule | Operator visibility |
|------|------|-------|-----|-----------|---------------------|
| 1 | Výchozí | queue row `SENT`, CS1 `EMAIL_SENT`, `last_email_sent_at=2026-04-22T10:00:00Z`. | `EMAIL_SENT` | — | Lead na "Ke kontaktování" boardu v kategorii "Odeslané". |
| 2 | +2h | Lead odpoví: `"Díky za nabídku, ozvu se ve středu."` Gmail inbox obsahuje inbound message. | `EMAIL_SENT` | — | — |
| 3 | +2h 5min | Mailbox sync polling tick. `extractThreadMetadata_()` najde inbound message, `classifyReplyType_()` vrátí `REPLY`. C-07 classifier interpretuje `reply_class=POSITIVE` (klíčová slova: "díky", "ozvu se"). | — | — | — |
| 4 | Ingest | C-07 vytvoří `reply_event { event_type: REPLY, reply_class: POSITIVE, reply_needs_manual: FALSE, provider_message_id: <original queue row>, event_occurred_at: 2026-04-22T12:03:00Z }`. Append do `_asw_inbound_events`. | — | — | — |
| 5 | Normalize → Lifecycle | Apply T20: `EMAIL_SENT → REPLIED`. `lifecycle_transition_applied=APPLIED`. | `REPLIED` (terminal) | Tier 1 (follow-up stop) | LEADS `email_sync_status=REPLIED`, `last_email_received_at=2026-04-22T12:03:00Z`, `email_reply_classifier=POSITIVE`, `reply_needs_manual=FALSE`. |
| 6 | Stop rule | Follow-up cadence engine (budoucí): při příštím tick per-thread check → skip. | — | — | Lead zmizí z "cadence queue" (pokud existuje). |
| 7 | `_asw_logs` | Run summary: `{ run_id: ..., events_processed: 1, events_skipped: 0, errors: 0 }`. | — | — | Audit trail dostupný. |

**Operator akce:** Volitelně otevře lead detail, čte `message_excerpt` v event store, odpoví ručně nebo přepne stage manuálně na WON/LOST/atd. (downstream sales, mimo C-07).

#### Scénář 2 — Bounce (hard)

| Krok | Stav | Event | CS1 | Stop rule | Operator visibility |
|------|------|-------|-----|-----------|---------------------|
| 1 | Výchozí | queue row `SENT` (provider akceptoval), CS1 `EMAIL_SENT`. | `EMAIL_SENT` | — | — |
| 2 | +15min | SMTP server odešle DSN `550 5.1.1 User unknown`. Gmail inbox zachytí message od `MAILER-DAEMON@googlemail.com`. | `EMAIL_SENT` | — | — |
| 3 | Polling tick | `isBounceMessage_()` detekuje (from=mailer-daemon, subject=Delivery Status Notification). Parse body → `smtp_status_code=5.1.1`. C-07 classifier: `bounce_class=HARD` (5.x.x = permanent per RFC 3463). | — | — | — |
| 4 | Ingest | `bounce_event { event_type: BOUNCE, bounce_class: HARD, bounce_reason: "User unknown", smtp_status_code: "5.1.1", ... }`. Append do `_asw_inbound_events`. | — | — | — |
| 5 | Normalize → Lifecycle | Apply T21: `EMAIL_SENT → BOUNCED`. | `BOUNCED` (terminal) | Tier 2 (address stop) | LEADS `email_sync_status=BOUNCED`, `email_reply_type=BOUNCE`, `bounce_class=HARD`. |
| 6 | Suppression propagation | C-07 vyzve C-09 (handoff): přidej `recipient_email` na suppression list s důvodem `HARD_BOUNCE`. (C-09 implementace budoucí.) | — | — | — |
| 7 | Budoucí sends | C-04 gate pro budoucí queue row na stejný email → block reason `ADDRESS_BOUNCED` (PROPOSED C-04 extension). | — | — | Gate dashboardu: "Blokováno: Address bounced". |

**Operator akce:** Žádná povinná. Lead je terminal. Volitelně ověří, zda má jiný kontakt.

#### Scénář 3 — Unsubscribe

| Krok | Stav | Event | CS1 | Stop rule | Operator visibility |
|------|------|-------|-----|-----------|---------------------|
| 1 | Výchozí | queue row `SENT`, CS1 `EMAIL_SENT`. | `EMAIL_SENT` | — | — |
| 2 | +1 den | Lead klikne `List-Unsubscribe` link v emailu (one-click RFC 8058). Mailto: request přijde na `unsubscribe@autosmartweb.cz`. (NEBO: Lead pošle reply s obsahem `"Nezajímá mě, odhlaste mě."`) | `EMAIL_SENT` | — | — |
| 3 | Ingest | **Varianta A (one-click):** polling tick na `unsubscribe@` inbox detekuje mailto. **Varianta B (reply body):** C-07 classifier `detectUnsubscribeIntent()` scan reply body — klíčová slova `"odhlaste"`, `"nezajímá"`, `"stop"`, `"unsubscribe"`. | — | — | — |
| 4 | Normalize | `unsubscribe_event { event_type: UNSUBSCRIBE, unsubscribe_source: LIST_UNSUBSCRIBE_MAILTO (A) nebo REPLY_BODY_INTENT (B), ... }`. Append. | — | — | — |
| 5 | Normalize → Lifecycle | Apply T22: `EMAIL_SENT → UNSUBSCRIBED`. | `UNSUBSCRIBED` (terminal) | Tier 3 (lead stop, all-channel) | LEADS `unsubscribed=TRUE`, `unsubscribed_at=...`, `unsubscribe_source=LIST_UNSUBSCRIBE_MAILTO`. |
| 6 | Suppression + GDPR | C-09 handoff: `recipient_email` + `lead_id` na suppression. GDPR audit log entry (legal requirement). | — | — | Lead nelze re-aktivovat bez nového opt-in. |
| 7 | Budoucí sends | C-04 gate block B7 `UNSUBSCRIBED` → `SEND_BLOCKED`. | — | — | Gate dashboard + GDPR compliance report. |

**Operator akce:** Žádná. Automatický terminal. Jakýkoli pokus o manuální re-enable vyžaduje nový opt-in (C-09 SPEC).

### 12. Unknown / manual handling

#### §A. Kdy jde event na `reply_needs_manual=TRUE`

- `reply_class=UNCLASSIFIED` — classifier (rule-based v1) nenašel dostatek signálů pro POSITIVE / NEGATIVE / QUESTION / OOO.
- Classifier confidence pod threshold (v2 ML model; v1 nevyužito).
- Reply obsahuje attachments nebo forwardovaný content, který classifier nedokáže bezpečně parsovat.
- Reply je napsaná jiným jazykem než CZ/SK/EN (v1 classifier podporuje jen tyto; ostatní → UNCLASSIFIED).

#### §B. Co to je (nikoli co to není)

- **Je to review flag** (`reply_needs_manual` boolean na LEADS + na `reply_event` row).
- **Je to operator queue filter** — operator UI (B6) bude filtrovat leady s tímto flagem do "Manual reply review" view.
- **NENÍ to canonical CS1 state.** Lead je `REPLIED` (terminal), flag je dimenze ORTOGONÁLNÍ k lifecycle.
- **NENÍ to exception queue jako u C-04 `MANUAL_REVIEW_REQUIRED`.** Rozdíl: C-04 MANUAL_REVIEW = "neposílej zatím, potřebuji rozhodnout ZDA poslat". C-07 reply_needs_manual = "lead ODPOVĚDĚL, potřebuji rozhodnout CO S TOU ODPOVĚDÍ". Jiná fáze flow.

#### §C. Jak to stopne follow-up automation

- CS1 lifecycle jde na `REPLIED` (terminal) → Tier 1 stop rule → follow-up engine skip.
- Flag `reply_needs_manual` je **dodatečný** signal pro operator, ne gate.
- Follow-up se nespustí bez ohledu na flag (lifecycle terminal je dostatečné).

#### §D. Soft bounce eskalace (explicit manual handling edge case)

- První soft bounce: `bounce_event { bounce_class: SOFT }`. Žádná CS1 transition. Tier 2 partial (temp hold X hodin). `soft_bounce_count` counter na LEADS++.
- N-tý soft bounce (N ≥ 3, threshold PROPOSED FOR C-07): eskalace na `bounce_class=HARD` → Tier 2 full + T21.
- Edge case (misclassified as soft): operator může manuálně override v UI (B6 out-of-scope).

### 13. Auditability / observability

**Cross-ref graf:**

```
LEADS (lead_id) ◄──────────────────┐
    ▲                              │
    │                              │
    │ cross-ref on write           │
    │                              │
┌───┴───────────────────────────┐  │
│  _asw_inbound_events          │  │
│  (append-only event store)    │  │
│  ─────────────────────────    │  │
│  event_id (PK)                │  │
│  ingest_event_id (uniq idx)   │  │
│  lead_id           ───────────┘  │
│  outreach_queue_id ──────────────┼─► _asw_outbound_queue (C-05)
│  provider_message_id ────────────┼─► queue.provider_message_id
│  provider_thread_id  ────────────┼─► queue.provider_thread_id
│  event_type                   │  │
│  ...                          │  │
│  ingest_source                │  │
└────────────┬──────────────────┘  │
             │                     │
             │ run summary         │
             ▼                     │
    ┌─────────────────────┐        │
    │  _asw_logs          │        │
    │  (CS2 run history)  │        │
    │  run_id             │        │
    │  events_processed   │        │
    │  events_skipped     │        │
    │  errors             │        │
    └─────────────────────┘        │
                                   │
    ┌──────────────────────────────┴─────┐
    │  _asw_dead_letters (CS3)           │
    │  ingest error → dead_letter row    │
    │  (např. malformed webhook payload) │
    └────────────────────────────────────┘
```

**Dohledatelnost:**

- Každý event má `event_id` (primary, UUID v4) a `ingest_event_id` (idempotency key, deterministic).
- Každý event je spojený s leadem přes `lead_id`, volitelně s queue row přes `outreach_queue_id`, volitelně s původním sendem přes `provider_message_id` / `provider_thread_id`.
- `_asw_logs` drží run-level summary (CS2 pattern): kolik events se zpracovalo, kolik skipped (idempotent), kolik errors.
- Errors (malformed webhook payload, expired Gmail thread, atd.) jdou do `_asw_dead_letters` (CS3 pattern) s `ingest_source` + `raw_payload_excerpt`.

### 14. Idempotency a duplicate ingest rules

#### §A. Event-level idempotency key (`ingest_event_id`)

**Pattern per raw_source:**

| raw_source | `ingest_event_id` pattern |
|------------|---------------------------|
| `GMAIL_THREAD` | `gmail:{gmail_message_id}` (Gmail message ID je globálně unique). |
| `GMAIL_DSN_THREAD` (bounce) | `gmail:{gmail_message_id}` (stejný pattern; DSN je normální Gmail message s mailer-daemon from). |
| `ESP_WEBHOOK` | `esp:{provider_name}:{webhook_event_id}` (ESP webhook payloads obsahují unique event ID). |
| `MANUAL_OPERATOR_INPUT` | `manual:{operator_email}:{lead_id}:{event_type}:{SHA256(excerpt)}` (deterministic od obsahu). |

**Invariants:**

1. Před append do `_asw_inbound_events` ingest kód lookup na `ingest_event_id` v posledních N dnech (N=30 default, PROPOSED).
2. Pokud existuje → `lifecycle_transition_applied=SKIPPED_IDEMPOTENT`, event se **neappenduje** do event store a CS1 transition se **nespustí** znovu. Run summary zaznamená skip.
3. Pokud neexistuje → append + lifecycle transition + stop rules + review flag set.

#### §B. Lifecycle-level idempotency

Oddělená od event-level. Chrání před double-transition pokud ingest kód volá T20/T21/T22 víckrát v race.

| Guard | Kde žije |
|-------|----------|
| `REPLIED → REPLIED` is no-op | CS1 transition logic (T20 check). |
| `BOUNCED → BOUNCED` is no-op | T21 check. |
| `UNSUBSCRIBED → UNSUBSCRIBED` is no-op | T22 check. |
| `REPLIED → UNSUBSCRIBED` allowed (compliance priority; viz sekce 8 invariant 3). | T22 check s explicit allow-from `REPLIED`. |
| `BOUNCED → UNSUBSCRIBED` allowed (compliance priority). | T22. |
| `UNSUBSCRIBED → REPLIED` blocked. UNSUBSCRIBED je silnější terminal. | T20 guard. |
| `UNSUBSCRIBED → BOUNCED` blocked. | T21 guard. |
| `BOUNCED → REPLIED` blocked (bounce znamená adresa nevalidní; "reply" v tomto kontextu musí být autoresponse-misclassified; classifier to má chytnout, ale guard je safety net). | T20 guard. |

#### §C. CS3 alignment

- C-07 ingest respektuje CS3 `max_attempts` per ingest job. Default: max_attempts=3 pro transient (network fail při Gmail polling). Permanent fail (malformed payload) → okamžitý dead-letter.
- `ingest_event_id` idempotency umožňuje bezpečný retry.
- Ingest job lock (CS3 locking pattern): 1 ingest run za čas per `ingest_source` (např. `mailbox_sync_job` nemá běžet 2x paralelně). LockService pattern identický s CS3 S1-S12.

### 15. Source variants (contract-level)

| Source | Trigger | Latency | Reliability | Notes |
|--------|---------|---------|-------------|-------|
| **Gmail mailbox polling** | Periodic trigger (15-min timer per CS2 default). | 0-15 min. | Závislá na Gmail availability. Gmail je high-reliability; poll fail = retry next tick. | Existing `apps-script/MailboxSync.gs` částečně pokrývá (reply + bounce). Unsubscribe ingest z Gmail = PROPOSED (detekce `List-Unsubscribe-Post` header nebo reply body intent). |
| **ESP provider webhook** | Push z ESP při provider-side event. | 0-few seconds. | Závislá na ESP delivery. Retry policy per ESP (SendGrid 10x, Mailgun 8x). | PROPOSED FOR C-07. Vyžaduje webhook HTTP endpoint (implementační task, mimo SPEC). Auth: ESP signing header (SendGrid `X-Twilio-Email-Event-Webhook-Signature`). |
| **Manual operator input** | Operator přes UI (B6, out-of-scope) nebo Apps Script menu. | Immediate. | Immediate (no async). | Edge case: operator obdrží bounce NDR v osobním inboxu a manuálně nahlásí → `raw_source=MANUAL_OPERATOR_INPUT`. |
| **Forward-compat: SMS/LinkedIn inbound** | Future channel. | — | — | C-07 schema má `raw_source` enum jako open set. Přidání nového source = enum extension, ne schema break. |

**Deduplication napříč sources:**

- Pokud stejný event přijde dvěma cestami (např. Gmail polling + SendGrid webhook pro stejný bounce) → `ingest_event_id` je **per raw_source** (viz sekce 14 §A), takže deduplikace nefunguje napříč sources automaticky.
- Ochrana: **lifecycle-level idempotency** (sekce 14 §B) — druhý event najde lead už ve `BOUNCED` a T21 je no-op.
- `_asw_inbound_events` obsahuje oba záznamy (audit trail "dostali jsme tuto informaci dvěma cestami"), ale CS1 se mění jen jednou.

### 16. Boundary rules / handoff

| Task / vrstva | Vztah k C-07 | Stav |
|---------------|--------------|------|
| **C-06 sender abstraction** | C-07 čte `provider_message_id` + `provider_thread_id` z `NormalizedSendResponse` (perzistovaný queue workerem do queue row při T18 success). | Compatible; C-06 merged. |
| **C-05 outbound queue** | C-07 křížově referencuje queue row přes `outreach_queue_id`. Nezapisuje do queue SEND_STATUS. Volitelné (implementační task) rozšíření queue o `last_inbound_event_id` je PROPOSED dodatek. | Compatible. |
| **CS1 lifecycle (T20/T21/T22)** | C-07 triggeruje existing transitions. Žádný nový canonical state. Rozšíření guard rules (sekce 14 §B) je spec-level clarification, ne nový state. | Compatible; clarification only. |
| **CS3 idempotency / retry / dead-letter** | C-07 reuses `ingest_event_id` idempotency pattern, max_attempts pro transient fails, dead-letter pro malformed payloads. | Compatible. |
| **CS2 orchestrator (runs, events)** | C-07 appenduje run summary do `_asw_logs`. Každý ingest tick = 1 run. Per-event detail žije v `_asw_inbound_events`, ne v `_asw_logs`. | Compatible. |
| **C-04 sendability gate** | Rozšíření C-04 block reasons o `ADDRESS_BOUNCED` (PROPOSED FOR C-07 extension). Už existující `UNSUBSCRIBED` / `SUPPRESSED` block reasons pokrývají Tier 3 stop. | Forward-compat; C-04 extension je sub-task. |
| **C-09 suppression list** | C-07 propaguje Tier 2/3 eventy na C-09 suppression list (`recipient_email` pro bounce, `lead_id` pro unsub). | Forward-compat; C-09 SPEC je downstream task. |
| **Follow-up cadence engine (formerly "C-07 v předchozím scoping")** | Budoucí task. Engine čte `_asw_inbound_events` + `provider_thread_id` pro per-thread follow-up decision. C-07 je jeho prerekvizita. | Downstream; renamed scope. |
| **Budoucí mailbox sync implementační task** | Materializuje Gmail polling worker. Reuses existing `apps-script/MailboxSync.gs` scaffold (`classifyReplyType_`, `isBounceMessage_`). Rozšíří o unsubscribe detekci a `_asw_inbound_events` append. | C-07 handoff ready. |
| **Budoucí ESP webhook implementační task** | Apps Script Web App doPost handler pro provider webhooks (SendGrid inbound parse, Mailgun bounce webhook). Signing auth. Normalization na C-07 event schema. | C-07 handoff ready. |
| **B6 operator reply-handling UI** | Čte `reply_needs_manual=TRUE` leady, umožní operatorovi vytvořit manual reply, případně přepsat `reply_class`. | Downstream; NOT blocker pro C-07 SPEC. |
| **Mailbox sync current code** | `apps-script/MailboxSync.gs` dnes zapisuje `email_sync_status` / `email_reply_type` na LEADS. C-07 SPEC definuje cílový stav; current code zůstává in-place do implementačního tasku. | Legacy; C-07 nemění. |

### 17. Non-goals (explicitní)

- Neimplementuje mailbox polling worker (`apps-script/MailboxSync.gs` **extension** pro unsubscribe).
- Neimplementuje ESP webhook HTTP handler (Apps Script Web App doPost).
- Neimplementuje Gmail `List-Unsubscribe` header detekci v runtime.
- Neimplementuje `_asw_inbound_events` sheet creation.
- Neimplementuje reply classifier (`rule-based-v1`).
- Neimplementuje soft-bounce escalation counter logiku.
- Neimplementuje follow-up cadence engine.
- Neimplementuje operator reply-handling UI.
- Neimplementuje suppression list propagaci (C-09 handoff).
- Neimplementuje GDPR audit log (compliance task).
- Nemění stávající `Config.gs` enumy (`EMAIL_SYNC_STATUS`, `EMAIL_REPLY_TYPE`). Extension PROPOSED hodnotami (`BOUNCED` v sync status, `UNSUBSCRIBE` v reply type) budou zapsány implementačním taskem.
- Nezavádí nový canonical CS1 state.
- Nemění C-05 queue schema (extension `last_inbound_event_id` je PROPOSED dodatek, materializuje implementační task).
- Nemění C-06 sender interface ani response schema.

### 18. Acceptance checklist

- [x] Reply event schema je kompletní (sekce 4, 18 polí s VERIFIED/INFERRED/PROPOSED labely).
- [x] Bounce event schema je kompletní (sekce 5, 15 polí).
- [x] Unsubscribe event schema je kompletní (sekce 6, 14 polí).
- [x] Lifecycle mapping je jednoznačný (sekce 8 tabulka — každý event má explicit CS1 transition nebo "žádná" s důvodem).
- [x] Stop rules jsou jednoznačné (sekce 9, 3-tier model + akceptační test mapping).
- [x] Bounce zastaví další send (sekce 9 Tier 2).
- [x] Unsubscribe zastaví další outreach (sekce 9 Tier 3).
- [x] Reply je viditelná v systému (sekce 10 — LEADS columns + event store).
- [x] Neklasifikovaná reply jde na jasně definovaný manual/review signal (sekce 8 + 12 — `reply_needs_manual=TRUE` review flag, ne lifecycle state).
- [x] `NEEDS_MANUAL_REPLY` je správně zařazené: **review flag**, ne CS1 state (sekce 8 invariant 2, sekce 12 §B).
- [x] 3 sample lifecycle scénáře po sendu (sekce 11: reply, bounce, unsubscribe).
- [x] Idempotency je definována event-level + lifecycle-level (sekce 14).
- [x] Cross-ref graf pokrývá LEADS ↔ event store ↔ queue ↔ `_asw_logs` ↔ `_asw_dead_letters` (sekce 13).
- [x] Source variants odděleny bez implementace (sekce 15).
- [x] Handoff do C-05/C-06/CS1/CS3/C-04/C-09/follow-up engine/mailbox sync/webhook/B6 (sekce 16).
- [x] SPEC-only; žádné runtime změny; žádné Config.gs zápisy.

### 19. PROPOSED vs INFERRED vs VERIFIED label summary

**VERIFIED IN REPO (reuse existing):**
- CS1 canonical states `EMAIL_SENT`, `REPLIED`, `BOUNCED`, `UNSUBSCRIBED` + transitions T20/T21/T22 (`docs/21-business-process.md`).
- `apps-script/MailboxSync.gs` — `extractThreadMetadata_()`, `classifyReplyType_()`, `isBounceMessage_()`, `isOooMessage_()`. Reply + bounce detekce částečně existuje.
- `Config.gs` auxiliary enumy: `EMAIL_SYNC_STATUS` (NOT_LINKED, NOT_FOUND, REVIEW, DRAFT_CREATED, SENT, LINKED, REPLIED, ERROR), `EMAIL_REPLY_TYPE` (NONE, REPLY, BOUNCE, OOO, UNKNOWN).
- LEADS sloupce (z `EXTENSION_COLUMNS` v `Config.gs:68-119`): `email_sync_status`, `email_reply_type`, `email_thread_id`, `email_last_message_id`, `last_email_sent_at`, `last_email_received_at`, `email_subject_last`, `email_last_error`.
- Queue row cross-ref fields: `lead_id`, `outreach_queue_id`, `provider_message_id`, `provider_thread_id` (C-05 + C-06).
- `_asw_logs` (CS2 run history), `_asw_dead_letters` (CS3).
- C-04 block reasons `UNSUBSCRIBED` (B7), `SUPPRESSED` (B8) — pokrývají Tier 3.

**INFERRED FROM EXISTING SYSTEM:**
- `email_reply_type=OOO` je auxiliary metadata, ne lifecycle change — odvozeno z `docs/21-business-process.md` M-8 note.
- CS3 idempotency/retry pattern pro ingest jobs — odvozeno z CS3 S1-S12 locking pattern.
- CS2 run summary pattern pro `_asw_logs` — odvozeno z existing run history design.
- `email_sync_status=BOUNCE` není v existing enum (enum má `REPLIED`, `LINKED`, `ERROR`; `BOUNCE` je jen v `email_reply_type`). **Rozpor s docs/21 N3 "BOUNCED neaktualizuje outreach_stage (issue M-8)".** C-07 tím nic neimplementuje, ale spec clarifikuje, že `email_sync_status` by měl dostat `BOUNCED` hodnotu v implementačním tasku (PROPOSED dodatek k enum).

**PROPOSED FOR C-07 (new, implementation task will materialize):**
- `_asw_inbound_events` sheet (append-only event store, ~30 sparse columns union of 3 event schemas + technical metadata).
- `reply_event` schema (18 polí).
- `bounce_event` schema (15 polí).
- `unsubscribe_event` schema (14 polí).
- `unknown_inbound` event (rezerva; používá reply_event schema s `reply_class=UNCLASSIFIED`).
- `complaint_event` (rezerva; PROPOSED bez schema — budoucí task materializuje pokud ESP feedback loop bude aktivován).
- `reply_class` enum (5: POSITIVE, NEGATIVE, QUESTION, OOO, UNCLASSIFIED).
- `bounce_class` enum (4: HARD, SOFT, AUTORESPONSE_MISCLASSIFIED, UNCLASSIFIED).
- `unsubscribe_source` enum (5: LIST_UNSUBSCRIBE_HEADER, LIST_UNSUBSCRIBE_MAILTO, REPLY_BODY_INTENT, ESP_WEBHOOK_UNSUB, MANUAL_OPERATOR_INPUT).
- `raw_source` enum (4: GMAIL_THREAD, GMAIL_DSN_THREAD, ESP_WEBHOOK, MANUAL_OPERATOR_INPUT; open set, forward-compat).
- `lifecycle_transition_applied` enum (3: APPLIED, SKIPPED_IDEMPOTENT, SKIPPED_OOO_HOLD).
- `event_type` enum (5: REPLY, BOUNCE, UNSUBSCRIBE, UNKNOWN_INBOUND, COMPLAINT).
- LEADS extension: `reply_needs_manual` (boolean), `email_reply_classifier` (enum value), `bounce_class` (enum value), `unsubscribed` (boolean), `unsubscribed_at` (ISO-8601), `unsubscribe_source` (enum value), `soft_bounce_count` (int, PROPOSED).
- `email_sync_status` enum extension: add `BOUNCED`, `UNSUBSCRIBED` (PROPOSED).
- `email_reply_type` enum extension: add `UNSUBSCRIBE`, `COMPLAINT` (PROPOSED).
- C-05 queue extension: `last_inbound_event_id` (PROPOSED dodatek).
- C-04 block reason extension: `ADDRESS_BOUNCED` (PROPOSED, pro Tier 2 post-bounce block).
- `ingest_event_id` deterministic pattern per raw_source (sekce 14 §A).
- Lifecycle transition guards `REPLIED→UNSUBSCRIBED` allow, `UNSUBSCRIBED→REPLIED` block, etc. (sekce 14 §B).
- Rule-based reply classifier spec (`rule-based-v1`).
- Ingest job lock pattern (reuse CS3).
- 3-tier stop rule model.
- Soft-bounce escalation counter (threshold N=3, PROPOSED).
- Payload version `"1.0"` pro `_asw_inbound_events` rows.

## Follow-up engine — C-08 (sekvence, časování, stop podmínky)

> **SPEC-only.** Tato sekce definuje kontrakt follow-up engine. Neimplementuje scheduler, queue worker, mailbox sync, webhook ingest, frontend UI, text-generation engine ani zápisy do `apps-script/Config.gs`.

> **C-07 je prerekvizita.** C-08 konzumuje C-07 stop tiers, `reply_needs_manual` review flag a inbound event taxonomii. Bez C-07 by follow-up engine nevěděl, kdy NEposílat další email.

### 1. Účel follow-up engine

```
  ┌────────────────┐  ┌──────────────────────┐  ┌────────────────────┐
  │  C-04 gate     │──│  C-05 queue          │──│  C-06 sender       │
  │  (first-touch) │  │  (outbound_queue)    │  │  (provider)        │
  └────────────────┘  └──────────────────────┘  └─────────┬──────────┘
                                                          │ SENT
                                                          ▼
                                     ┌────────────────────────────────┐
                                     │  C-07 inbound event ingest     │
                                     │  (reply / bounce / unsubscribe)│
                                     └────────────┬───────────────────┘
                                                  │
                                                  ▼
                                     ┌────────────────────────────────┐
                                     │  C-08 follow-up engine         │
                                     │  (WHAT / WHEN / IF next send)  │
                                     │  ─────────────                 │
                                     │  → new queue row (stage=Fn)    │
                                     │  → OR skip + record stop       │
                                     │  → OR route to review gate     │
                                     └────────────────────────────────┘
```

**Co C-08 řeší navíc oproti initial sendu:**
- Initial send je **first touch** (C-04 → C-05 → C-06). Follow-up engine odpovídá na otázku: **"Poslat další email ve stejném threadu — a pokud ano, kdy a s jakým obsahem?"**
- Oddělená odpovědnost: C-05 queue neumí rozhodnout o další fázi (jen drží queue rows); C-07 jen hlásí, co přišlo; C-08 je **rozhodovač sekvence**.
- Follow-up engine čte inbound události z C-07 a lifecycle state z CS1, porovná je s definicí sekvence (initial → follow_up_1 → follow_up_2), a buď vytvoří nový queue row (C-05), nebo sekvenci ukončí, nebo ji pošle na review.

**Co C-08 NEŘEŠÍ:**
- Scheduler / cron / runtime triggers (mimo scope — implementační task).
- Queue worker / claim / dispatch loop (C-05 + implementační task).
- Mailbox sync runtime / Gmail polling (C-07 + implementační task).
- ESP webhook HTTP handler (C-07 + implementační task).
- Frontend UI (B6 + budoucí task).
- Text-generation engine pro follow-up copy (budoucí task — C-08 definuje, **co se pregeneruje vs regeneruje**, ne **jak se text tvoří**).
- Modifikaci C-05 queue schema nebo C-06 sender interface (C-08 jen **čte** C-07 events a **zapisuje nové queue rows** přes C-05 existing contract).
- Přidávání nových canonical CS1 states.
- Zápis PROPOSED enumů do `apps-script/Config.gs`.

**C-08 je SPEC**: definuje sekvenční kontrakt, časovací pravidla, stop podmínky, pregenerate/regenerate rules, auto-vs-review guardy, duplicate prevention invariants a sample timelines. Runtime engine (scheduler + worker) je **implementační task**.

**Vztah k B6:**
- B6 (operator reply-handling / review UI) **NENÍ blocker** pro C-08 SPEC. C-08 definuje, kdy se follow-up dostane na review (interní signál); B6 později implementuje, jak operator review UI konzumuje. Do té doby operator čte review signál přímo z LEADS / queue metadata v Google Sheets.

### 2. Boundary / non-goals

**C-08 řeší:**
- Definici follow-up **sequence stage** (initial → follow_up_1 → follow_up_2) s explicitním max count.
- Timing rules mezi stages (rozestupy, od čeho se počítá, quiet-hours handoff).
- Stop conditions (reply, bounce, unsubscribe, manual block, review flag).
- Pregenerate vs regenerate rules pro subject / body / preview_url / personalization / thread_hint / CTA.
- Automatic vs review decision (kdy follow-up jde autem, kdy na review).
- Tvrdou separaci 5 vrstev: follow-up stage / lifecycle state / queue status / inbound event / review flag.
- Sample queue row design pro follow_up_1 + follow_up_2 (co se dědí z initial, co se mění).
- 5 sample lead timelines (happy path + 4 stop větve).
- Auditability + observability (jak každý follow-up attempt dohledat).
- Idempotency / duplicate prevention (invariants nad stage × lead × queue).
- Manual block model (flag, scope, reversibilita).
- Handoff body na C-05 / C-06 / C-07 / CS1 / CS3 / scheduler / B6.

**C-08 NEŘEŠÍ:**
- Scheduler / cron job runtime.
- Queue worker claim / dispatch loop.
- Mailbox sync runtime.
- ESP webhook HTTP handler.
- Frontend UI (B6).
- Text-generation engine (jak vypadá konkrétní copy follow_up_1 — jen **co se v payload mění vs dědí**).
- Rate limiting / quiet hours scheduling detaily (C-08 definuje **contract boundary** — quiet hours posouvají `scheduled_at`, konkrétní pravidla jsou implementační / ops config).
- Holiday calendar logic.
- Multi-channel follow-up (SMS, phone, LinkedIn) — C-08 v1.0 je **email-only**.
- A/B testing a experimenty.
- Suppression list runtime (C-09 downstream).
- Mutaci C-05 queue schema (C-08 používá existing `outreach_queue_id`, `scheduled_at`, `priority`, `thread_hint`; PROPOSED dodatky jsou explicitně označené).
- Mutaci C-06 sender interface.
- Mutaci C-07 inbound event schema.

### 3. Follow-up sequence definition

C-08 v1.0 definuje **3-stage sekvenci** s maximem **2 follow-upy po initial**:

| Stage | Účel | Kdy vzniká | Vstup | Výstup | Nový queue row? | Thread / reply hint? |
|-------|------|------------|-------|--------|-----------------|----------------------|
| **`initial`** | First touch — první outreach email na lead, zakládá thread. | Vytvořen C-04/C-05 při `AUTO_SEND_ALLOWED` (viz sekce 6 docs/24 C-05). | Lead + preview_url + generated subject/body. | Queue row → send → thread založen. | ✓ (C-05 insert) | ✗ Initial nemá thread hint (žádný thread ještě neexistuje). |
| **`follow_up_1`** | První připomenutí — "viděli jste naši nabídku?" | Engine hodnotí po `T+3 dny` od `sent_at` initial, pokud sequence není stopnutá. | initial queue row (SENT) + inbound event store (prázdno / OOO hold) + lead CS1 state + LEADS follow-up counter. | **Nový** C-05 queue row se stage=`follow_up_1`, `thread_hint` = `{thread_id: initial.provider_thread_id, in_reply_to_message_id: initial.provider_message_id}`. | ✓ (nový C-05 insert) | ✓ Reply-in-thread k initial. |
| **`follow_up_2`** | Druhé a poslední připomenutí — "poslední šance / posíláme pro jistotu ještě jednou". | Engine hodnotí po `T+7 dní` od `sent_at` follow_up_1 (celkem ~T+10 dní od initial), pokud sequence není stopnutá. | follow_up_1 queue row (SENT) + inbound event store + lead CS1 state + LEADS follow-up counter. | **Nový** C-05 queue row se stage=`follow_up_2`, `thread_hint` = `{thread_id: initial.provider_thread_id, in_reply_to_message_id: follow_up_1.provider_message_id}`. | ✓ (nový C-05 insert) | ✓ Reply-in-thread k follow_up_1 (poslední message v threadu). |

**Invariant:** Po `follow_up_2` sekvence **automaticky končí** (viz sekce 5 max count). Žádný `follow_up_3` v C-08 v1.0 neexistuje. Budoucí vlna může rozšířit na 3+ follow-upy — v tom případě je to **amendment C-08** nebo nové C-XX (explicit breaking change).

**Stage-naming invariant:**
- `initial` = first touch (vrstva: stage)
- `follow_up_1`, `follow_up_2` = sekvenční follow-upy (vrstva: stage)
- **Pozor:** Stage **není** lifecycle state, **není** queue status, **není** inbound event, **není** review flag. Viz sekce 9 pro tvrdou separaci 5 vrstev.

**Reused fields from C-05:**
- `outreach_queue_id`: každá stage má svůj vlastní UUID.
- `lead_id`: sdílený napříč sekvencí.
- `scheduled_at`: populace engine, respektuje timing rules (sekce 4).
- `priority`: engine může zvýšit prioritu follow-upů (PROPOSED default 100 → 90 pro follow_up_1, 80 pro follow_up_2; konkrétní hodnoty doladí implementační task).
- `thread_hint` (C-06 `SendRequest` field) = null pro initial; populace pro follow_up_1/2.
- `send_channel = "email"` (v1.0 pouze email).
- `send_mode = "SCHEDULED"` (follow-upy jsou vždy plánované, ne IMMEDIATE).
- `idempotency_key`: re-použije C-05 pattern s rozšířením o stage (viz sekce 13).

**PROPOSED dodatky k C-05 queue schema pro C-08:**
- `sequence_stage` (string enum: `initial` / `follow_up_1` / `follow_up_2`) — na queue row. **PROPOSED FOR C-08.**
- `parent_queue_id` (string, nullable) — předchozí queue row v sekvenci (follow_up_1.parent_queue_id = initial.outreach_queue_id; follow_up_2.parent_queue_id = follow_up_1.outreach_queue_id). Initial má `null`. **PROPOSED FOR C-08.**
- `sequence_root_queue_id` (string) — root queue row sekvence (initial.outreach_queue_id). Sdílený napříč sekvencí pro rychlý lookup "všech rows této sekvence". **PROPOSED FOR C-08.**
- `sequence_position` (integer 1-indexed: initial=1, follow_up_1=2, follow_up_2=3) — redundantní s `sequence_stage` ale užitečný pro ordering query. **PROPOSED FOR C-08.**

**Důležité:** Tyto 4 PROPOSED fields jsou dodatky ke C-05 schema. Materializace (zápis do `_asw_outbound_queue` column layout + implementace) je **implementační task**. Do té doby C-05 queue drží `initial` + `follow_up_1` + `follow_up_2` jako 3 samostatné rows s vlastním `idempotency_key`, bez explicitního stage metadata (implementace je forward-compat, ale ztrácí stage auditability).

### 4. Timing rules

**Rozestupy:**

| Stage | Časový offset | Od čeho se počítá | Důvod |
|-------|---------------|-------------------|-------|
| `initial` | T+0 (immediate nebo scheduled dle operator choice) | - | First touch. |
| `follow_up_1` | **T+3 business days** od `initial.sent_at` | `initial.sent_at` (actual success timestamp z C-06 `NormalizedSendResponse.sent_at`, ne `scheduled_at`, ne `queued_at`) | 3 dny = typický response window pro B2B outreach. Kratší = spam impression; delší = zapomenou. |
| `follow_up_2` | **T+7 business days** od `follow_up_1.sent_at` | `follow_up_1.sent_at` (actual success timestamp) | Celková sekvence ~10 business days. Second reminder před ukončením. |

**Invariant — od čeho se počítá:**
- Vždy od **actual `sent_at`** předchozí stage (C-06 `NormalizedSendResponse.sent_at`, propsaný do queue row `sent_at` při `SENT` transition per C-05).
- **NE** od `scheduled_at` (plánovaný čas ≠ skutečný čas odeslání — mezi nimi může být retry / queue lag).
- **NE** od `queued_at` (insert do queue ≠ odeslání).
- **NE** od `created_at` (creation ≠ send).
- Pokud předchozí stage je v jiném queue statusu než `SENT` (např. `QUEUED` čekající nebo `FAILED`), **follow-up se neplánuje** — engine čeká na `SENT` nebo finálně fail-terminuje sekvenci (viz sekce 6 stop conditions).

**Business days vs calendar days:**
- **Business days** (Po-Pá, bez státních svátků). Ignorují se víkendy (Sobota + Neděle).
- Státní svátky: C-08 **v1.0 ignoruje** (drží jen Po-Pá filter). Holiday calendar je **PROPOSED FOR C-08 implementační task** (mimo SPEC scope — ops config).
- Time-of-day: Follow-up nesmí být naplánovaný mimo **09:00–17:00 Europe/Prague** (quiet hours). Pokud `scheduled_at` vypočtený z T+N days by padl mimo, posune se na nejbližší 09:00 příštího business day.
- Quiet hours / holiday posun je **deterministic** — stejný vstup dá stejný `scheduled_at`. Random jitter není.

**Handoff na scheduler:**
- C-08 definuje `scheduled_at` pomocí výše uvedených pravidel a zapíše ho do nového queue row.
- Queue worker (C-05 contract) claimne row pouze pokud `now() >= scheduled_at`. Tj. **scheduling je rozhodnutí engine při queue insertu**, ne per-tick scheduler.
- Pokud scheduler / cron zavolá engine (typicky daily batch), engine projde všechny aktivní sekvence, vyhodnotí, které mají být plánované na další stage, a vytvoří queue rows. Cron detail = implementační task.

**Examples (all sent_at in business hours, Europe/Prague):**
- initial.sent_at = `2026-04-21 10:00 Po` → follow_up_1.scheduled_at = `2026-04-24 10:00 Pá` (T+3 business days).
- follow_up_1.sent_at = `2026-04-24 10:00 Pá` → follow_up_2.scheduled_at = `2026-05-05 10:00 Út` (T+7 business days; počítá přes víkend Sa-Ne a Po-Pá 27-30, skip víkend 1-3).
- initial.sent_at = `2026-04-17 16:00 Pá` → follow_up_1.scheduled_at = `2026-04-22 09:00 St` (T+3 business days: So/Ne skip, Po-St = 3 business days; ale ~16:00 je v quiet-hours window [09-17], takže `scheduled_at` je 16:00 St; v tomto příkladu 09:00 je konzervativní — pro SPEC drzime "+3 business days preserving time-of-day pokud v quiet-hours, jinak posun na 09:00 nejbližšího business day").

**PROPOSED runtime config (implementační task):**
- `FOLLOWUP_OFFSET_1_BUSINESS_DAYS` = 3
- `FOLLOWUP_OFFSET_2_BUSINESS_DAYS` = 7
- `FOLLOWUP_QUIET_HOURS_START` = "09:00"
- `FOLLOWUP_QUIET_HOURS_END` = "17:00"
- `FOLLOWUP_TIMEZONE` = "Europe/Prague"

Konkrétní hodnoty doladí operator; C-08 SPEC definuje pouze mechanismus + defaults.

### 5. Max follow-up count

**Autoritativní invariant:**

- **Max follow-upy = 2** (follow_up_1 + follow_up_2).
- **Initial se NEPOČÍTÁ** do max follow-up count (initial je first touch, ne follow-up).
- **Celkem max 3 queue rows na sekvenci** (initial + follow_up_1 + follow_up_2).
- Po `follow_up_2` (ať již SENT / FAILED / CANCELLED) engine **nikdy** nevytvoří `follow_up_3`.

**Jak se zabrání překročení:**

1. **Sequence counter check před insert:**
   Engine před každým queue insertu ověří `count(queue rows where lead_id=X AND sequence_root_queue_id=initial.id AND sequence_stage IN ("follow_up_1", "follow_up_2")) < 2`. Pokud `>= 2` → skip, record log "MAX_FOLLOWUPS_REACHED".

2. **Idempotency key stage-aware:**
   `idempotency_key` = `followup:{lead_id}:{sequence_root_queue_id}:{sequence_stage}` (sekce 13). Duplicitní insert pro stejnou stage → queue-level reject (C-05 idempotency invariant).

3. **Stage progression deterministic:**
   Next stage po SENT `initial` → `follow_up_1`. Next stage po SENT `follow_up_1` → `follow_up_2`. Next stage po SENT `follow_up_2` → **SEQUENCE_COMPLETE** (terminal internal engine state, ne CS1, ne queue status).

4. **Lookup na poslední SENT row v sekvenci:**
   Engine čte z queue `max(sequence_position) where lead_id=X AND sequence_root_queue_id=Y AND send_status="SENT"`. Pokud `sequence_position >= 3` (= follow_up_2 odeslán) → sekvence terminální, skip.

**Může engine vytvořit víc queue rows než max?**
- **Ne** — invariant sekvence. Při race / retry / rollback guaranted by idempotency key + sequence_stage check.
- **Ano v legitimním case**: když operator manuálně vytvoří **novou samostatnou sekvenci** pro stejný lead s jiným CTA / kampaní. To je **nová sequence** (nový `initial`, nový `sequence_root_queue_id`), ne další follow-up existující sekvence. Limit max=2 platí per-sekvence, ne per-lead.

### 6. Stop conditions

Follow-up engine **před každým insertem** nového queue rowu pro `follow_up_N` vyhodnotí stop conditions. Pokud jakákoliv triggeruje → sekvence ukončena (ne nový row).

**Pět povinných stop condition kategorií:**

| # | Stop condition | Co ji aktivuje (source-of-truth) | Scope | Zastaví jen automatiku nebo i ruční outreach? | Z jakého tasku pochází |
|---|----------------|----------------------------------|-------|------------------------------------------------|------------------------|
| 1 | **REPLY** | C-07 `reply_event` se `reply_class ∈ {POSITIVE, NEGATIVE, QUESTION}` → CS1 lead state = `REPLIED` (#15). | Thread / sekvence (Tier 1 per C-07). | Pouze automatiku. Manuální outreach operator může pokračovat přes thread reply (mimo engine). | C-07 Tier 1 + CS1 T20. |
| 2 | **UNSUBSCRIBE** | C-07 `unsubscribe_event` → CS1 lead state = `UNSUBSCRIBED` (#17). LEADS `unsubscribed=true`. | **Celý lead** (Tier 3 per C-07). | I ruční outreach — compliance + legal. Operator musí respektovat unsubscribe. | C-07 Tier 3 + CS1 T22. |
| 3 | **BOUNCE** | C-07 `bounce_event` (`bounce_class=HARD` nebo `SOFT` nad threshold N=3) → CS1 lead state = `BOUNCED` (#16). | **Per email adresa** (Tier 2 per C-07). Pokud má lead jen 1 adresu = celý lead. | Pouze automatiku na tu adresu. Pokud má lead jinou adresu (rare), manuál může zkusit. C-04 block B8 / PROPOSED `ADDRESS_BOUNCED`. | C-07 Tier 2 + CS1 T21. |
| 4 | **MANUAL_BLOCK** | Operator nastaví LEADS flag `followup_manual_block=TRUE` (PROPOSED FOR C-08 field) nebo LEADS `suppressed=TRUE` (C-04 B8). | Celý lead (per-lead flag). | Pouze automatiku (manuál může pokračovat, pokud operator sám flag nastavil). | C-08 (nový flag) + C-04 B8 (existing). |
| 5 | **REVIEW_FLAG** / UNKNOWN_INBOUND | C-07 `unknown_inbound` event → `reply_needs_manual=TRUE` review flag na LEADS. Automaticky se **následně** sekvence pauzuje, dokud operator flag neresolve. | Sekvence (pauze, ne terminal stop). | Pouze automatiku (operator může manuálně poslat follow-up po resolutionu flagu). | C-07 review signal + C-08 pause logic. |

**Kompozitní stop invariants:**

1. **Jakákoliv CS1 terminal (REPLIED, BOUNCED, UNSUBSCRIBED, DISQUALIFIED)** → sekvence stop. Deterministic lookup: `lifecycle_state IN terminal_states` (viz CS1 sekce 4).
2. **C-04 gate re-check před insertem:** Engine před follow_up_N insert **re-volá** C-04 sendability gate na lead (jako by to byl nový send). Pokud gate vrátí `SEND_BLOCKED` → sekvence stop. Gate zohlední:
   - B3 `TERMINAL_STATE_REPLIED`
   - B4 `TERMINAL_STATE_BOUNCED`
   - B5 `TERMINAL_STATE_UNSUBSCRIBED`
   - B7 `UNSUBSCRIBED`
   - B8 `SUPPRESSED`
   - B16 `ALREADY_SENT` (explicit — initial byl odeslán; ale follow-up má jiný `idempotency_key`, takže B16 se pro follow-up _neaplikuje_ — engine předá C-04 context `is_followup=true` pro bypass B16).
   - PROPOSED `ADDRESS_BOUNCED` (pro Tier 2 bounce stop).
3. **C-07 inbound event store check:** Engine se dívá do `_asw_inbound_events` pro `lead_id` + `sequence_root_queue_id`. Pokud existuje event `event_type ∈ {REPLY, BOUNCE, UNSUBSCRIBE, UNKNOWN_INBOUND (s reply_needs_manual=TRUE), COMPLAINT}` → sekvence stop / pauze.
4. **Manual block flag:** LEADS `followup_manual_block=TRUE` → sekvence stop immediately.
5. **Review flag OOO hold:** `reply_event` s `reply_class=OOO` → **dočasná pauze** (ne stop). Engine odloží next stage o **PROPOSED 14 kalendářních dní** (operator může upravit). Po 14 dnech engine re-vyhodnotí; pokud lead stále `EMAIL_SENT` + žádný nový inbound event, follow-up pokračuje dle original schedule (posunutý). Toto je jediný case, kdy se sekvence **neukončuje**, jen odkládá.

**Stop condition auditability:**

Když engine skipne follow-up insert kvůli stop condition, **vždy zapíše** do `_asw_logs` run summary:
- `event = "followup_skip"`
- `lead_id`
- `sequence_root_queue_id`
- `intended_stage` (`follow_up_1` / `follow_up_2`)
- `stop_reason` (explicit enum: `REPLY` / `UNSUBSCRIBE` / `BOUNCE_HARD` / `BOUNCE_SOFT_ESCALATED` / `MANUAL_BLOCK` / `REVIEW_FLAG_PENDING` / `OOO_PAUSE` / `C04_GATE_BLOCK:{reason}` / `MAX_FOLLOWUPS_REACHED` / `PARENT_NOT_SENT`)
- `detected_from_event_id` (pokud stop byl triggered C-07 eventem)
- `cs2_run_id`
- Timestamp.

**Invariant: lead s reply už nikdy nedostane follow-up** (zadání acceptance criteria #4):
- Deterministic: `reply_event` (reply_class ≠ OOO) → CS1 `REPLIED` → engine skip check hits REPLY condition → no insert. Garantováno přes (a) CS1 state check, (b) C-04 gate re-check B3, (c) inbound event store check. Triple-redundant guard.

### 7. Pregenerate vs regenerate rules

Tvrdé oddělení **co se dědí immutable** / **co se re-generuje** / **co se jen template-řízeně mění**.

| Pole | Initial | follow_up_1 | follow_up_2 | Pravidlo |
|------|---------|-------------|-------------|----------|
| `recipient_email` | Z LEADS. | **Inherited** z initial (přesně ten samý recipient). | **Inherited** z initial. | **Immutable sekvenčně.** Jiný recipient = jiná sekvence (= nový initial). |
| `sender_identity` | Z operator config (který odesílatel). | **Inherited** z initial (aby thread reply chain držel identity). | **Inherited** z initial. | **Immutable sekvenčně.** Změna sender mid-sequence rozbije reply chain. |
| `subject` | Generated (C-04 gate + copy task). | **Re-generated** s `Re:` prefix (Gmail standard) **nebo** nový subject pokud template říká "new thread subject". V1.0 default: **`"Re: " + initial.subject`** (Gmail klient to stejně zobrazí jako reply). | **Re-generated** s `Re:` prefix. | **Template-driven regenerate.** V1.0 = `"Re: " + initial.subject`. Copy variant v2.0 = budoucí task. |
| `body` | Generated (C-04 + copy task). | **Re-generated** — follow-up má vlastní copy ("Dobrý den, jen připomínám…"). | **Re-generated** — poslední reminder copy. | **Template-driven regenerate.** Každá stage má vlastní copy template. Copy text samotný (markdown / HTML) = mimo C-08 scope (copy-generation task). |
| `body.plain` / `body.html` | Generated. | **Re-generated** per stage template. | **Re-generated** per stage template. | **Regenerate.** V1.0 follow-upy mají **kratší body** než initial (reminder, ne pitch). |
| `preview_url` | Generated (B-4 `POST /api/preview/render` → persistent URL). | **Inherited** z initial. Stejný preview = stejný obsah — lead vidí konzistentně. | **Inherited** z initial. | **Immutable sekvenčně.** Nový preview_url = nová sekvence / nová kampaň. |
| `personalization_json` | Generated z LEADS snapshot (immutable per send). | **Inherited** z initial (snapshot v čase initial sendu). | **Inherited** z initial. | **Immutable sekvenčně.** Follow-up nepoužívá aktuální LEADS data — držíme původní personalization pro audit + konzistenci copy. |
| `thread_hint` | `null`. | `{thread_id: initial.provider_thread_id, in_reply_to_message_id: initial.provider_message_id}`. | `{thread_id: initial.provider_thread_id, in_reply_to_message_id: follow_up_1.provider_message_id}`. | **Stage-specific derivation.** Gmail adapter použije `GmailApp.getThreadById(thread_id).reply(body)`. ESP adapter převede na `In-Reply-To` + `References` headers. |
| `send_channel` | `"email"`. | **Inherited**. | **Inherited**. | **Immutable sekvenčně.** V1.0 pouze email. Multi-channel = budoucí task. |
| `send_mode` | `IMMEDIATE` nebo `SCHEDULED` (dle operator). | **`SCHEDULED`** vždy (engine populuje `scheduled_at`). | **`SCHEDULED`** vždy. | **Stage-specific override.** Follow-upy nejsou nikdy IMMEDIATE. |
| `scheduled_at` | Null nebo operator-set. | Engine computed per timing rules (sekce 4). | Engine computed per timing rules. | **Stage-specific derivation.** |
| `priority` | Default 100 (z C-05). | **PROPOSED 90** (o trochu vyšší priorita než initial pro oldest-first processing). | **PROPOSED 80** (ještě vyšší — je to poslední šance). | **Stage-specific derivation.** Konkrétní hodnoty doladí implementační task. |
| `idempotency_key` | `send:{lead_id}:{SHA256(recipient + subject + body)}` (C-05 pattern). | **`followup:{lead_id}:{sequence_root_queue_id}:{stage}`** (sekce 13). | Same pattern. | **Stage-specific pattern.** Liší se od initial — initial sdílí content hash, follow-up sdílí sequence+stage. |
| `preview_url_version` | From B-4 render. | **Inherited**. | **Inherited**. | Immutable. |
| Call-to-action (CTA) text | Generated v body. | **Re-generated** (follow-up CTA může být jiný — "potvrďte zájem / dáme vědět" místo "podíváte se na preview"). | **Re-generated** (last-chance CTA). | **Template-driven regenerate.** |

**Klíčový invariant:**
- **Preview_url + personalization + recipient + sender_identity = IMMUTABLE sekvenčně.** Lead vidí stejný preview a stejnou personalizaci napříč celou sekvencí — to je core value of sequence.
- **Subject + body + CTA = REGENERATED per stage** — každý follow-up má vlastní reminder copy, ale všechno ostatní (identita, cíl, preview) se nemění.
- **Thread_hint + scheduled_at + idempotency_key + sequence_stage + priority = STAGE-DERIVED** — engine computuje per stage pravidla.

### 8. Automatic vs review decision

C-08 má **3 decision outcomes** před vytvořením queue row pro `follow_up_N`:

| Outcome | Kdy nastává | Akce |
|---------|-------------|------|
| **AUTO_INSERT** | (a) CS1 lead state = `EMAIL_SENT` (ne terminal); (b) C-04 gate re-check = `AUTO_SEND_ALLOWED` s `is_followup=true` context; (c) žádný blocking inbound event v `_asw_inbound_events`; (d) `reply_needs_manual != TRUE`; (e) `followup_manual_block != TRUE`; (f) parent row status = `SENT`; (g) max count not reached. | Engine vytvoří queue row s `send_mode=SCHEDULED` + computed `scheduled_at` + stage metadata. Worker ho claimne a C-06 odešle. |
| **REVIEW_REQUIRED** | Alespoň jedna z: (a) `reply_needs_manual=TRUE` na LEADS; (b) C-04 gate re-check = `MANUAL_REVIEW_REQUIRED`; (c) PROPOSED `followup_review_required=TRUE` (explicit operator flag). | Engine **nevytvoří** queue row. Zapíše `_asw_logs` event `followup_review_required` s `lead_id` + `intended_stage` + `review_reason`. Sekvence pauzuje; operator musí resolve review flag. Po resolve engine re-vyhodnotí při další run. |
| **STOP** | CS1 terminal / C-04 `SEND_BLOCKED` / manual block / bounce/unsubscribe event / max count reached / parent `FAILED`/`CANCELLED`. | Engine **nevytvoří** queue row. Sekvence terminuje. Zapíše `_asw_logs` event `followup_skip` s `stop_reason` (viz sekce 6). |

**Role `reply_needs_manual`:**
- `reply_needs_manual=TRUE` (C-07 review flag) → engine route to REVIEW_REQUIRED.
- Operator musí manuálně vyřešit (např. v B6 UI nebo přímo v Google Sheets: interpretovat unknown_inbound, klasifikovat reply, rozhodnout continue / stop).
- Po resolve (operator nastaví `reply_needs_manual=FALSE` + explicit operator action = `continue_followup` / `stop_followup`):
  - `continue_followup` → engine odblokuje sekvenci, re-compute `scheduled_at` od **operator resolve timestamp** (ne od original parent `sent_at`, protože lead seděl v review delší čas).
  - `stop_followup` → sekvence terminuje, `_asw_logs` event `followup_manual_stop`.
- B6 UI **NENÍ blocker** pro C-08 SPEC. Operator může flag resolve přímo v Google Sheets buňce.

**Role `unknown_inbound`:**
- `unknown_inbound` event → engine route to REVIEW_REQUIRED (via `reply_needs_manual=TRUE`). Nikdy AUTO_INSERT.
- Dokud review flag není resolve, engine sekvenci pauzuje. Dlouhodobá pauze (> 30 dní) → PROPOSED auto-terminate + `_asw_logs` event `followup_stale_review_abandoned`.

**Další review guardy (PROPOSED FOR C-08):**
- `followup_review_required` boolean na LEADS — explicit operator-set "tenhle lead send na review před každým follow-upem".
- Custom reason: `lead_special_handling=TRUE` — engine nikdy auto-insert, vždy REVIEW_REQUIRED.
- Z C-04 gate: `MANUAL_REVIEW_REQUIRED` outcome (existing) — engine respektuje.

### 9. Follow-up stage vs lifecycle vs queue status — tvrdá separace 5 vrstev

Absolutně nezbytné rozlišení pro audit + zamezení kolapsu identity:

| Vrstva | Co to je | Kde žije | Hodnoty | Kdo mění |
|--------|----------|----------|---------|----------|
| **1. Follow-up stage** | Pozice v sekvenci: first touch nebo N-tý follow-up. | `_asw_outbound_queue.sequence_stage` (PROPOSED FOR C-08) | `initial` / `follow_up_1` / `follow_up_2` | C-08 engine při queue insertu. Immutable po insertu. |
| **2. Lifecycle state** | Canonical CS1 state leadu. | `LEADS.lifecycle_state` (PROPOSED for CS1 implementation) | 18 states (CS1 sekce 4); pro outreach relevantní: `PREVIEW_READY`, `EMAIL_QUEUED`, `EMAIL_SENT`, `REPLIED`, `BOUNCED`, `UNSUBSCRIBED`, `DISQUALIFIED`. | C-05 queue worker (T17, T18), C-07 ingest (T20, T21, T22), manuální operator transitions per CS1 sekce 7. |
| **3. Queue status** | Stav konkrétního queue rowu (nezávisle na stage / lifecycle / lead). | `_asw_outbound_queue.send_status` (C-05 sekce 3) | `QUEUED` / `SENDING` / `SENT` / `FAILED` / `CANCELLED` (5 values, ortogonální k CS1) | C-05 queue worker. |
| **4. Inbound event** | Fakt, že něco přišlo do threadu po sendu. | `_asw_inbound_events.event_type` (C-07 sekce 3) | `REPLY` / `BOUNCE` / `UNSUBSCRIBE` / `UNKNOWN_INBOUND` / `COMPLAINT` | C-07 ingest. Append-only. |
| **5. Review / manual signal** | Flag, že operator musí zasáhnout. | `LEADS.reply_needs_manual` (C-07) + PROPOSED `LEADS.followup_manual_block` + PROPOSED `LEADS.followup_review_required` | Boolean flagy | C-07 ingest (auto-set pro UNCLASSIFIED reply), manuální operator (set / clear). |

**Zakázané kolapse (invariants):**
- **Stage ≠ lifecycle.** Lead v `follow_up_1` sekvenci může mít lifecycle `EMAIL_SENT` (follow_up_1 ještě nebyl poslán, čeká na scheduled_at) nebo `REPLIED` (přišla odpověď, engine teď stop-skipne follow_up_1). Stage neříká nic o tom, co lead aktuálně dělá.
- **Stage ≠ queue status.** follow_up_1 může být v queue statusu `QUEUED` (čeká), `SENDING` (právě odesíláme), `SENT` (hotovo), `FAILED`, `CANCELLED`. Stage je pozice; status je mechanika.
- **Queue status ≠ lifecycle.** Queue row status `SENT` triggeruje CS1 transition T18 (`EMAIL_QUEUED → EMAIL_SENT`), ale následně se lifecycle vyvíjí samostatně (T20/T21/T22) přes C-07 events.
- **Inbound event ≠ lifecycle.** Event je **fakt** ("něco přišlo"); lifecycle je **výsledný stav** po zpracování eventu. Jeden event může (ale nemusí) trigger CS1 transition.
- **Review flag ≠ lifecycle.** `reply_needs_manual=TRUE` je pokyn pro operátora; lifecycle lead pořád odpovídá CS1 canonical stavu (typicky `REPLIED`).

**C-08 engine konzumuje všech 5 vrstev:**
- Čte: (2) lifecycle state, (3) queue status parent rowu, (4) inbound events za posledních N dní, (5) review flagy.
- Zapisuje: (1) stage metadata na nový queue row, (3) queue status (přes C-05 insert pro nový row).
- **NIKDY nezapisuje:** (2) lifecycle (to dělá C-05/C-07/operator), (4) inbound events (append-only, jen C-07), (5) review flagy (to dělá C-07 auto nebo operator manual).

### 10. Scheduled row design — sample queue rows

**Initial (reference):**

```
outreach_queue_id:                Q-2026-04-17-00001
lead_id:                          L-00042
sequence_stage:                   "initial"              [PROPOSED FOR C-08]
parent_queue_id:                  null                   [PROPOSED FOR C-08]
sequence_root_queue_id:           Q-2026-04-17-00001     [PROPOSED FOR C-08; = self for initial]
sequence_position:                1                      [PROPOSED FOR C-08]
recipient_email:                  lead@example.com
email_subject:                    "Nabídka nového webu pro {{company_name}}"
email_body:                       "Dobrý den, …" (full initial copy)
preview_url:                      https://autosmartweb.cz/p/abc123
personalization_json:             {"company_name": "Acme s.r.o.", "lead_name": "Jan Novák", …}
send_mode:                        "IMMEDIATE"
scheduled_at:                     null
queued_at:                        2026-04-17T10:00:00+02:00
send_status:                      "SENT"
sent_at:                          2026-04-17T10:00:15+02:00
provider_message_id:              gmail:abc456
provider_thread_id:               gmail-thread:xyz789
send_channel:                     "email"
priority:                         100
idempotency_key:                  "send:L-00042:SHA256(lead@example.com+Nabídka+Dobrý den…)"
payload_version:                  "1.0"
created_from_sendability_outcome: "AUTO_SEND_ALLOWED"
```

**follow_up_1 (created by C-08 engine after initial.sent_at + 3 business days):**

```
outreach_queue_id:                Q-2026-04-20-00123
lead_id:                          L-00042
sequence_stage:                   "follow_up_1"          [PROPOSED — stage-derived]
parent_queue_id:                  Q-2026-04-17-00001     [= initial row id]
sequence_root_queue_id:           Q-2026-04-17-00001     [= initial row id; sdíleno sekvenčně]
sequence_position:                2
recipient_email:                  lead@example.com       [INHERITED from initial]
email_subject:                    "Re: Nabídka nového webu pro Acme s.r.o."  [REGENERATED: "Re: " + initial.subject rendered]
email_body:                       "Dobrý den, jen pro připomenutí…" (follow_up_1 template copy)  [REGENERATED]
preview_url:                      https://autosmartweb.cz/p/abc123  [INHERITED]
personalization_json:             {…same snapshot as initial…}  [INHERITED]
send_mode:                        "SCHEDULED"             [STAGE-OVERRIDE: follow-upy vždy scheduled]
scheduled_at:                     2026-04-22T10:00:00+02:00  [ENGINE-COMPUTED: initial.sent_at + 3 business days]
queued_at:                        2026-04-20T23:00:00+02:00  [batch engine run time]
send_status:                      "QUEUED"
sent_at:                          null
provider_message_id:              null
provider_thread_id:               null
send_channel:                     "email"                 [INHERITED]
priority:                         90                      [STAGE-OVERRIDE: PROPOSED 90 for follow_up_1]
thread_hint:                      {thread_id: "gmail-thread:xyz789", in_reply_to_message_id: "gmail:abc456"}  [STAGE-DERIVED]
idempotency_key:                  "followup:L-00042:Q-2026-04-17-00001:follow_up_1"  [STAGE PATTERN]
payload_version:                  "1.0"
created_from_sendability_outcome: "AUTO_SEND_ALLOWED"      [re-check passed]
created_from_followup_engine_run: "FU-RUN-2026-04-20-001"  [PROPOSED audit field]
```

**follow_up_2 (created by C-08 engine after follow_up_1.sent_at + 7 business days):**

```
outreach_queue_id:                Q-2026-05-05-00456
lead_id:                          L-00042
sequence_stage:                   "follow_up_2"
parent_queue_id:                  Q-2026-04-20-00123      [= follow_up_1 row id]
sequence_root_queue_id:           Q-2026-04-17-00001      [= initial; same root]
sequence_position:                3
recipient_email:                  lead@example.com        [INHERITED]
email_subject:                    "Re: Nabídka nového webu pro Acme s.r.o."  [REGENERATED from initial subject stem]
email_body:                       "Dobrý den, posíláme pro jistotu ještě jednou…" [REGENERATED — follow_up_2 template]
preview_url:                      https://autosmartweb.cz/p/abc123  [INHERITED]
personalization_json:             {…same snapshot…}
send_mode:                        "SCHEDULED"
scheduled_at:                     2026-05-05T10:00:00+02:00  [follow_up_1.sent_at + 7 business days]
queued_at:                        2026-05-03T23:00:00+02:00
send_status:                      "QUEUED"
priority:                         80                       [STAGE-OVERRIDE: PROPOSED 80 for follow_up_2]
thread_hint:                      {thread_id: "gmail-thread:xyz789", in_reply_to_message_id: "gmail:def012"}  [follow_up_1.provider_message_id]
idempotency_key:                  "followup:L-00042:Q-2026-04-17-00001:follow_up_2"
payload_version:                  "1.0"
created_from_followup_engine_run: "FU-RUN-2026-05-03-001"
```

**Klíčové observations:**
- `sequence_root_queue_id` sdílený napříč sekvencí = fast lookup všech rows (`SELECT * FROM _asw_outbound_queue WHERE sequence_root_queue_id = 'Q-2026-04-17-00001'`).
- `parent_queue_id` tvoří linked-list (initial → follow_up_1 → follow_up_2).
- `thread_hint` se mění per stage, ale `provider_thread_id` v hintu je konstantní = stejný Gmail thread.
- `recipient_email`, `preview_url`, `personalization_json` jsou **byte-identical** s initial (inherited snapshot).
- `subject`, `body`, `priority` jsou stage-derived.
- `idempotency_key` pattern je **jiný** pro follow-upy (nesdílí C-05 content hash; sdílí sekvence+stage) — to zajistí, že dva follow-up runs pro stejnou stage nevytvoří dva queue rows.

### 11. 5 sample lead timelines

**Scenario 1: initial → follow_up_1 → follow_up_2 bez reakce (happy / silent path)**

| Čas | Událost | Lifecycle | Queue rows | Inbound events | Operator view |
|-----|---------|-----------|------------|----------------|---------------|
| `2026-04-17 10:00` | Initial odeslán | `EMAIL_SENT` | Q-001 (initial, SENT) | - | Lead v stage "initial sent". |
| `2026-04-20 23:00` | Batch engine run → insert follow_up_1 | `EMAIL_SENT` | Q-001 (SENT), Q-002 (follow_up_1, QUEUED, scheduled_at 04-22 10:00) | - | Lead má follow_up_1 pending. |
| `2026-04-22 10:00` | follow_up_1 odeslán | `EMAIL_SENT` (ne change) | Q-001 (SENT), Q-002 (follow_up_1, SENT) | - | - |
| `2026-05-03 23:00` | Batch engine run → insert follow_up_2 | `EMAIL_SENT` | Q-001 (SENT), Q-002 (SENT), Q-003 (follow_up_2, QUEUED, scheduled_at 05-05 10:00) | - | - |
| `2026-05-05 10:00` | follow_up_2 odeslán | `EMAIL_SENT` | Q-001 (SENT), Q-002 (SENT), Q-003 (SENT) | - | Sekvence kompletní, čeká na reply. |
| `2026-05-12 23:00+` | Batch engine run → **SEQUENCE_COMPLETE**, no insert | `EMAIL_SENT` | Stejné | - | `_asw_logs` event `followup_skip` s `stop_reason=MAX_FOLLOWUPS_REACHED`. Lead v "cold / no-response" (budoucí task rozhodne o archivaci). |

Audit trail: 3 queue rows v sekvenci, všechny SENT, `_asw_logs` zaznamenal 3 engine runs (insert + insert + skip).

**Scenario 2: initial → reply → stop**

| Čas | Událost | Lifecycle | Queue rows | Inbound events | Operator view |
|-----|---------|-----------|------------|----------------|---------------|
| `2026-04-17 10:00` | Initial odeslán | `EMAIL_SENT` | Q-001 (initial, SENT) | - | - |
| `2026-04-18 14:30` | Lead odpoví "Díky, podíváme se!" | `REPLIED` (T20) | Q-001 (SENT) | `reply_event` (reply_class=POSITIVE, reply_needs_manual=FALSE) | Lead `email_reply_type=REPLY`, `reply_class=POSITIVE`. Operator vidí reply v LEADS / email threadu. |
| `2026-04-20 23:00` | Batch engine run → stop check | `REPLIED` | Q-001 (SENT) (žádný nový) | Stejné | `_asw_logs` event `followup_skip` s `stop_reason=REPLY`, `detected_from_event_id=reply_event:...`. |

Audit trail: 1 queue row, `_asw_inbound_events` 1 event (reply), `_asw_logs` 1 skip run. Sekvence ukončena deterministic po 1. CS1 lookup (REPLIED terminal), 2. C-04 re-check (B3 `TERMINAL_STATE_REPLIED`), 3. inbound event store check (reply_event present). Triple-redundant guard.

**Scenario 3: initial → bounce → stop**

| Čas | Událost | Lifecycle | Queue rows | Inbound events | Operator view |
|-----|---------|-----------|------------|----------------|---------------|
| `2026-04-17 10:00` | Initial odeslán | `EMAIL_SENT` | Q-001 (initial, SENT) | - | - |
| `2026-04-17 10:02` | Mailer-daemon bounce (DSN 5.1.1 invalid recipient) | `BOUNCED` (T21) | Q-001 (SENT) | `bounce_event` (bounce_class=HARD, dsn_code=5.1.1) | Lead `email_sync_status=BOUNCED` (PROPOSED), `email_reply_type=BOUNCE`. |
| `2026-04-20 23:00` | Batch engine run → stop check | `BOUNCED` | Q-001 (SENT) (žádný nový) | Stejné | `_asw_logs` event `followup_skip` s `stop_reason=BOUNCE_HARD`, `detected_from_event_id=bounce_event:...`. Lead flagged pro `ADDRESS_BOUNCED` (PROPOSED C-04 block). |

Audit trail: 1 queue row, 1 bounce event. Sekvence ukončena. Navíc: adresa `lead@example.com` by se měla přidat do LEADS `bounced_addresses` flag (PROPOSED storage), aby budoucí sekvence na stejný email (např. když operator retry na jinou variantu adresy na témže leadu) byla zablokována C-04 B-PROPOSED `ADDRESS_BOUNCED`.

**Scenario 4: initial → unsubscribe → stop**

| Čas | Událost | Lifecycle | Queue rows | Inbound events | Operator view |
|-----|---------|-----------|------------|----------------|---------------|
| `2026-04-17 10:00` | Initial odeslán | `EMAIL_SENT` | Q-001 (initial, SENT) | - | - |
| `2026-04-18 09:15` | Lead odpoví "unsubscribe" nebo klikne na List-Unsubscribe link | `UNSUBSCRIBED` (T22) | Q-001 (SENT) | `unsubscribe_event` (unsubscribe_source=LIST_UNSUBSCRIBE_HEADER nebo REPLY_BODY_INTENT) | Lead `unsubscribed=true`, `unsubscribed_at=2026-04-18T09:15+02:00`. |
| `2026-04-20 23:00` | Batch engine run → stop check | `UNSUBSCRIBED` | Q-001 (SENT) (žádný nový) | Stejné | `_asw_logs` event `followup_skip` s `stop_reason=UNSUBSCRIBE`, `detected_from_event_id=unsubscribe_event:...`. Lead flagged globally (Tier 3) — budoucí ANY outreach blocked C-04 B7 `UNSUBSCRIBED`. |

Audit trail: 1 queue row, 1 unsubscribe event. Sekvence ukončena + **Tier 3 global stop** (žádný další email / SMS / kanál nikdy). Compliance + legal preserved.

**Scenario 5: initial → unknown reply / manual review → review gate → resolution**

| Čas | Událost | Lifecycle | Queue rows | Inbound events | Operator view |
|-----|---------|-----------|------------|----------------|---------------|
| `2026-04-17 10:00` | Initial odeslán | `EMAIL_SENT` | Q-001 (initial, SENT) | - | - |
| `2026-04-19 11:00` | Přišla reply, ale classifier confidence < threshold | `REPLIED` (T20 konzervativně) | Q-001 (SENT) | `reply_event` (reply_class=UNCLASSIFIED, reply_needs_manual=TRUE) | Lead `email_reply_type=REPLY`, `reply_needs_manual=TRUE`. Operator vidí review signal. |
| `2026-04-20 23:00` | Batch engine run → decision = REVIEW_REQUIRED | `REPLIED` | Q-001 (SENT) (žádný nový) | Stejné | `_asw_logs` event `followup_review_required` s `lead_id`, `intended_stage=follow_up_1`, `review_reason=reply_needs_manual`. Engine **nevytvoří** follow_up_1 row. Sekvence pauzuje. |
| `2026-04-21 14:00` | Operator resolve review: "to byl forward kolegovi, nic nedělej, stopni" | `REPLIED` | Q-001 (SENT) | Stejné + operator action note | Operator nastaví `reply_needs_manual=FALSE` + `followup_manual_block=TRUE`. |
| `2026-04-22 23:00` | Batch engine run → stop check | `REPLIED` | Q-001 (SENT) | Stejné | `_asw_logs` event `followup_skip` s `stop_reason=MANUAL_BLOCK`, `resolved_by=operator@company.cz`. Sekvence terminálně ukončena. |

**Alternativní resolution scenario 5b:** Operator by resolve "to byla legitimní otázka, pokračuj" → `reply_needs_manual=FALSE` + `continue_followup` action. Engine by re-vyhodnotil, ale v tomto případě lifecycle je `REPLIED` (CS1 terminal), takže stop_reason=REPLY stejně platí (triple-guard). Scenario 5b by tedy vyžadoval operator manuálně **vrátit** CS1 z `REPLIED` na `EMAIL_SENT` (což CS1 umožňuje jako reverse transition, ale je to manuál akce mimo C-08). V praxi: většina UNKNOWN_INBOUND resolutions bude buď MANUAL_BLOCK (stop) nebo lifecycle se fixed.

Audit trail: 1 queue row, 1 reply event s review flag, `_asw_logs` 2 events (review_required + skip). Operator action logged separátně (`LEADS.last_operator_action` + timestamp — PROPOSED).

### 12. Auditability / observability

**Každý follow-up attempt (insert / skip / pause) musí být dohledatelný:**

| Otázka operátora | Zdroj odpovědi |
|------------------|----------------|
| "Byl pro tento lead follow-up vytvořen?" | Query `_asw_outbound_queue WHERE lead_id=X AND sequence_stage IN ("follow_up_1", "follow_up_2")`. Pokud 0 rows + existuje initial SENT → engine skipl. |
| "Proč nebyl follow-up vytvořen?" | `_asw_logs WHERE lead_id=X AND event="followup_skip"` → čte `stop_reason`. |
| "Kdy engine lead naposledy vyhodnotil?" | `_asw_logs WHERE lead_id=X AND event IN ("followup_insert", "followup_skip", "followup_review_required") ORDER BY timestamp DESC LIMIT 1`. |
| "Který inbound event zastavil sekvenci?" | `_asw_logs.detected_from_event_id` → join na `_asw_inbound_events.event_id`. |
| "Jaká je plná sekvence pro tento lead?" | Query `_asw_outbound_queue WHERE sequence_root_queue_id=R ORDER BY sequence_position`. Vrátí initial + follow_up_1 + follow_up_2 (nebo subset). |
| "Jaký byl computed scheduled_at a od čeho?" | `_asw_logs WHERE lead_id=X AND event="followup_insert"` → zapíše `computed_from_sent_at`, `offset_business_days`, `quiet_hours_adjustment`. |
| "Je sekvence v review gate? Kdo to resolve?" | LEADS `reply_needs_manual`, `followup_manual_block`, `followup_review_required`. `_asw_logs` zaznamenává operator resolutions. |

**`_asw_logs` events pro C-08 (PROPOSED enum extension):**

| Event | Trigger | Key fields |
|-------|---------|------------|
| `followup_insert` | Engine created new queue row. | `lead_id`, `sequence_root_queue_id`, `new_queue_id`, `sequence_stage`, `scheduled_at`, `computed_from_sent_at`, `offset_business_days`. |
| `followup_skip` | Engine decided STOP. | `lead_id`, `sequence_root_queue_id`, `intended_stage`, `stop_reason`, `detected_from_event_id` (nullable). |
| `followup_review_required` | Engine decided REVIEW. | `lead_id`, `sequence_root_queue_id`, `intended_stage`, `review_reason`, `review_flag_source`. |
| `followup_pause_ooo` | `reply_class=OOO` → sekvence odložena. | `lead_id`, `pause_until`, `ooo_event_id`. |
| `followup_manual_stop` | Operator nastavil `followup_manual_block=TRUE`. | `lead_id`, `operator_id`, `reason_text` (volitelně). |
| `followup_stale_review_abandoned` | Review pending > 30 dní → auto-terminate (PROPOSED). | `lead_id`, `pending_since`. |
| `followup_engine_run_summary` | Konec batch engine run. | `run_id`, `leads_evaluated`, `inserts`, `skips`, `reviews`, `pauses`, `duration_ms`. |

**Cross-ref graph:**

```
LEADS.lead_id ──┬──► _asw_outbound_queue.lead_id (3 rows initial+follow_up_1+follow_up_2)
                │       └─► sequence_root_queue_id (= initial.outreach_queue_id, sdílený)
                ├──► _asw_inbound_events.lead_id (0..N events)
                │       └─► outreach_queue_id (→ konkrétní queue row, který event zastavil)
                ├──► _asw_logs.lead_id (followup_insert / skip / review / pause events)
                │       └─► detected_from_event_id (→ _asw_inbound_events)
                └──► _asw_dead_letters (pokud engine run failed — CS3)
```

**Observability pro operator (bez B6 UI):**
- Queue sheet (`_asw_outbound_queue`): filter by `sequence_root_queue_id` → vidí 1-3 rows sekvence.
- LEADS sheet: sloupce `lifecycle_state` (PROPOSED CS1), `last_email_sent_at`, `reply_needs_manual`, `followup_manual_block`, `unsubscribed`, `email_reply_type`.
- Logs sheet (`_asw_logs`): filter by `lead_id` nebo `event LIKE 'followup_%'`.
- **B6 UI** (budoucí task) agreguje výše uvedené do per-lead view.

### 13. Idempotency / duplicate prevention

**C-08 idempotency pattern:**

```
idempotency_key = "followup:{lead_id}:{sequence_root_queue_id}:{sequence_stage}"
```

**Example:**
- `followup:L-00042:Q-2026-04-17-00001:follow_up_1`
- `followup:L-00042:Q-2026-04-17-00001:follow_up_2`

**Invariants:**

1. **Unique per stage × sekvence × lead.** Duplicitní insert se stejným klíčem je C-05 queue-level reject (existing C-05 idempotency invariant).
2. **Engine je safe-to-run-twice.** Pokud batch engine zavolán N× za den, vytvoří queue row jen jednou per stage.
3. **Race-safe.** Dva paralelní engine runs (unlikely, ale possible) skončí s jediným queue insertem díky C-05 idempotency.
4. **Ne-rollback-safe.** Pokud queue row byl insertován → CANCELLED (před SENT), engine **nesmí** znovu vytvořit ten samý row se stejným klíčem. CANCELLED stage se počítá jako "pokus byl učiněn" (viz sekce 5 max count). Pro retry stage musí být **nová sekvence** (= nový `sequence_root_queue_id`).

**Stop-detection idempotency:**

- Engine čte `_asw_inbound_events` s deterministic filter (latest N events per lead). Pokud event existuje ≥ 1× → stop trigger. Jeden event může triggerovat jen jednou (engine si v `_asw_logs` zaznamená `detected_from_event_id` → zabrání re-triggeru při second run, ale stop_reason stále platí).

**Navazování na C-05 / CS3 idempotency principy:**

- C-05 idempotency key pattern pro initial: `send:{lead_id}:{SHA256(recipient + subject + body)}` — obsahový hash.
- C-08 idempotency key pattern pro follow-upy: `followup:{lead_id}:{sequence_root_queue_id}:{sequence_stage}` — **sekvenční** (ne obsahový, protože follow-up body se mění per run pokud copy template evolve).
- Proč ne obsahový hash pro follow-upy? Kdyby copy template follow_up_1 byl mírně updatován mezi dvěma engine runs (op ladí text), hash by byl různý → dva queue rows by se vytvořily. Sekvenční klíč to elegantně řeší.
- CS3 alignment: engine ingest job respektuje CS3 `LockService.getScriptLock()` pattern (stejně jako C-07 ingest + C-05 worker).

### 14. Manual block model

**Co je manual block:**
- Operator-initiated stop na follow-up automation pro konkrétní lead. Engine **nevytvoří** žádný další follow-up queue row.

**Kde žije:**
- `LEADS.followup_manual_block` — boolean flag (PROPOSED FOR C-08). Default `FALSE`.
- Alternativně (fallback bez nového sloupce): operator může nastavit C-04 B8 `suppressed=TRUE`, což engine respektuje přes C-04 re-check. Explicit `followup_manual_block` je PROPOSED pro jemnější granularitu (stop jen follow-upy, ne first-touch sekvence pro nové kampaně).

**Kdo ho nastavuje:**
- Operator manuálně v Google Sheets (interim bez B6 UI).
- B6 UI (budoucí): explicit "Zastavit follow-upy" tlačítko na lead detail page.
- Engine auto-set v edge casech (PROPOSED): např. 3× consecutive SOFT bounce → engine preventivně nastaví `followup_manual_block=TRUE` + zapíše `_asw_logs` event `followup_auto_block_soft_bounce`.

**Co přesně zastaví:**
- Engine skipne všechny budoucí follow-up insertion attempts pro daný lead.
- Nezastaví existing queue rows v `QUEUED` statusu — pokud manual block přijde mezi insert a worker claim, queue row se **stále pošle** (race). Aby byl preventivní, operator musí také C-05 `CANCELLED` existing queued row. Explicit-two-step je OK per C-05 invariant (queue nemá transaction safety across lead-level flags).
- Nezastaví manuální outreach (operator může odpovědět v threadu ručně).

**Reversibilita:**
- Manual block je **reversible**. Operator může nastavit zpět `FALSE` a sekvence pokračuje od další stage eligibility (engine computed scheduled_at od **last SENT parent_queue_id.sent_at**).
- Pokud lead byl v CS1 `REPLIED` / `BOUNCED` / `UNSUBSCRIBED` když block byl nastaven, po `FALSE` set engine stále skipne (triple-guard přes CS1 terminal / C-04 gate / inbound events).

**Jak se projeví v follow-up engine:**
- Engine read order: (1) `LEADS.followup_manual_block` → pokud `TRUE` → skip + log `stop_reason=MANUAL_BLOCK`. (2) Ostatní stop conditions.
- Manual block má **highest priority** po CS1 terminal stop. Důvod: explicit operator intent > automated inference.

**Differentiation od UNSUBSCRIBE:**

| Dimenze | MANUAL_BLOCK | UNSUBSCRIBE |
|---------|--------------|-------------|
| Zdroj | Operator explicit action. | Lead action (reply body / List-Unsubscribe / ESP webhook). |
| Scope | Follow-up automation only (operator může stále manuálně odpovídat). | Entire outreach, all channels (Tier 3 per C-07). Legal/compliance binding. |
| CS1 state change | Žádný (lead zůstává v existing state). | `* → UNSUBSCRIBED` (T22). |
| Reversible | Ano (operator může unset). | Operator může unset manuálně s explicit re-consent, ale default treat as binding. |
| Storage | LEADS `followup_manual_block` (boolean). | LEADS `unsubscribed` (boolean) + `unsubscribed_at` (timestamp) + `unsubscribe_source`. |
| Compliance | Internal policy. | Legal requirement (GDPR, CAN-SPAM). |

### 15. Boundary rules / handoff na další tasky

| Task | Jak C-08 konzumuje | Jak C-08 přispívá |
|------|-------------------|-------------------|
| **C-04 Sendability gate** | Engine re-voláá gate před každým follow_up insert s `is_followup=true` context (bypass B16 `ALREADY_SENT`). Gate vrací `AUTO_SEND_ALLOWED` / `MANUAL_REVIEW_REQUIRED` / `SEND_BLOCKED`. | PROPOSED gate extension: `is_followup` context parameter. PROPOSED block reason `ADDRESS_BOUNCED` (z C-07). |
| **C-05 Outbound queue** | Engine vytváří nové queue rows přes C-05 insert contract (sekce 5 docs/24). PROPOSED C-05 schema extension: `sequence_stage`, `parent_queue_id`, `sequence_root_queue_id`, `sequence_position`, `created_from_followup_engine_run`. | Engine je C-05 producer (stejně jako C-04 pro initial). |
| **C-06 Provider abstraction** | Engine populuje `SendRequest.thread_hint` (follow_up_1 / follow_up_2). | Žádná mutace C-06 interface. |
| **C-07 Inbound event ingest** | Engine čte `_asw_inbound_events` pro stop detection. Konzumuje stop tiers (1/2/3). | Žádná mutace C-07 schema. |
| **CS1 Lead lifecycle** | Engine čte `lifecycle_state` pro terminal check. | Žádný nový canonical state. |
| **CS2 Orchestrator** | Engine je CS2 step — batch job spuštěný cron / trigger. | PROPOSED nový CS2 step: `followup_engine_run` (daily batch, evaluates all active sequences). |
| **CS3 Reliability** | Ingest job lock pattern, failure_class, dead-letter. | PROPOSED failure_class mapping: `ENGINE_TIMEOUT`→TRANSIENT, `C04_GATE_FAIL`→PERMANENT (lead), `PARENT_NOT_SENT`→TRANSIENT (wait), `MAX_RETRIES_EXCEEDED`→PERMANENT. |
| **Scheduler runtime task** (budoucí) | Engine je volán scheduler (daily cron nebo Apps Script trigger). Konkrétní trigger = implementační task. | Definuje engine interface + contract. |
| **B6 Operator review UI** (budoucí) | Žádná konzumace ze strany SPEC. | PROPOSED operator actions: `resolve_review → continue_followup`, `resolve_review → stop_followup`, `set_manual_block`, `clear_manual_block`. |
| **Future copy-generation task** | Engine volá copy-gen pro `subject` + `body` per stage. | Definuje contract: copy-gen dostává stage name + lead snapshot, vrací rendered subject+body. V1.0 inline template (no AI), v2.0 AI-enhanced. |
| **C-09 Suppression list** (budoucí) | Engine respektuje suppression list přes C-04 B8. | Žádná přímá interakce. |
| **Implementační task C-08 runtime** | Materializuje engine (Apps Script function `runFollowupEngine()`), adds PROPOSED queue fields, adds PROPOSED LEADS flags, adds stage-specific copy templates. | Tato SPEC je autoritativní vstup. |

### 16. Non-goals (explicit reminders)

- Neimplementuje scheduler / cron / trigger runtime (mimo scope).
- Neimplementuje queue worker claim loop (to je C-05 implementační task).
- Neimplementuje mailbox sync runtime (to je C-07 implementační task).
- Neimplementuje ESP webhook HTTP handler (to je C-07 implementační task).
- Neimplementuje frontend UI (B6).
- Neimplementuje text-generation engine (budoucí copy task).
- Nepřidává nové canonical CS1 states.
- Nemodifikuje C-05 queue schema ani C-06 sender interface (PROPOSED dodatky pouze).
- Nemodifikuje C-07 inbound event schema.
- Nezapisuje PROPOSED enumy / flagy do `apps-script/Config.gs` (implementační task).
- Neřeší multi-channel follow-up (SMS, phone, LinkedIn).
- Neřeší A/B testing / experimenty.
- Neřeší holiday calendar detail (ops config).
- Neřeší timezone-per-lead personalizaci (v1.0 single timezone `Europe/Prague`).

### 17. Acceptance checklist

- [x] Sekvence má definovaný max počet (sekce 5: max 2 follow-upy, total 3 rows včetně initial).
- [x] Časové rozestupy jsou explicitní (sekce 4: T+3 business days, T+7 business days).
- [x] Stop conditions jsou kompletní (sekce 6: reply, unsubscribe, bounce, manual block, review flag + CS1 terminal check + C-04 gate re-check + inbound event store check).
- [x] Lead s reply už nedostane follow-up (sekce 6 invariant "triple-redundant guard" přes CS1 REPLIED / C-04 B3 / inbound event).
- [x] Je jasné, co se pregeneruje a co zůstává (sekce 7: immutable = recipient, sender_identity, preview_url, personalization, channel; regenerated = subject, body, CTA; stage-derived = thread_hint, scheduled_at, priority, idempotency_key).
- [x] Je jasné, kdy jde follow-up automaticky vs na review (sekce 8: 3 outcomes AUTO_INSERT / REVIEW_REQUIRED / STOP s explicit podmínkami).
- [x] 5 sample lead timelines pokrývá hlavní větve (sekce 11: silent / reply / bounce / unsubscribe / unknown-review).
- [x] Sample scheduled rows jsou jednoznačné (sekce 10: initial + follow_up_1 + follow_up_2 s polím-level rozlišením immutable / regenerated / stage-derived).
- [x] Celý průběh je auditovatelný (sekce 12: `_asw_logs` events + LEADS flags + queue metadata + cross-ref graph).
- [x] Dokument jde přímo použít jako source-of-truth pro budoucí implementaci.
- [x] 5 vrstev identity (stage / lifecycle / queue status / inbound event / review flag) je tvrdě oddělených (sekce 9).
- [x] Idempotency pattern je definován (sekce 13: `followup:{lead_id}:{root}:{stage}`).
- [x] Manual block model je definován (sekce 14).
- [x] Handoff tabulka pokrývá C-04 / C-05 / C-06 / C-07 / CS1 / CS2 / CS3 / scheduler / B6 / copy-gen / C-09 / implementační task (sekce 15).
- [x] SPEC-only — žádné runtime změny, žádné Config.gs zápisy.
- [x] B6 není blocker (sekce 1 + 8 + 14 explicit).

### 18. PROPOSED vs INFERRED vs VERIFIED label summary

**VERIFIED IN REPO (reuse existing):**
- `_asw_outbound_queue` schema (C-05 merged PR #28): `outreach_queue_id`, `lead_id`, `recipient_email`, `email_subject`, `email_body`, `preview_url`, `personalization_json`, `send_mode`, `scheduled_at`, `queued_at`, `send_status`, `sent_at`, `provider_message_id`, `provider_thread_id`, `send_channel`, `priority`, `idempotency_key`, `payload_version`, `created_from_sendability_outcome`.
- `SendRequest.thread_hint` (C-06 merged PR #29): forward-compat pole pro follow-up reply-in-thread.
- `_asw_inbound_events` (C-07 merged PR #30): event_id, lead_id, outreach_queue_id, provider_message_id, provider_thread_id, event_type, reply_class, bounce_class, unsubscribe_source, reply_needs_manual.
- CS1 canonical states `EMAIL_SENT`, `REPLIED`, `BOUNCED`, `UNSUBSCRIBED` + T20/T21/T22 (docs/21).
- C-04 block reasons B3 (`TERMINAL_STATE_REPLIED`), B4 (`TERMINAL_STATE_BOUNCED`), B5 (`TERMINAL_STATE_UNSUBSCRIBED`), B7 (`UNSUBSCRIBED`), B8 (`SUPPRESSED`), B16 (`ALREADY_SENT`).
- CS2 `_asw_logs` run history contract.
- CS3 `_asw_dead_letters` + `LockService` pattern.
- PROPOSED C-07 extension `ADDRESS_BOUNCED` block reason.

**INFERRED FROM EXISTING SYSTEM:**
- T+3 / T+7 business days = typical B2B outreach cadence (industry standard for cold outreach sequences). Konfigurovatelné.
- `Re: {initial.subject}` = Gmail-standard reply subject. Používá standard RFC 5322 convention.
- Quiet hours `09:00–17:00 Europe/Prague` = standard business hours. Konfigurovatelné.
- Holiday calendar = mimo v1.0 scope. Ops config.
- Copy templates per stage = výstup budoucího copy-gen tasku.

**PROPOSED FOR C-08 (new, implementation task will materialize):**
- C-05 queue schema extension: `sequence_stage` (enum initial/follow_up_1/follow_up_2), `parent_queue_id` (string, nullable), `sequence_root_queue_id` (string), `sequence_position` (integer 1-indexed), `created_from_followup_engine_run` (string audit ref).
- LEADS schema extension: `followup_manual_block` (boolean), `followup_review_required` (boolean, optional), `last_operator_action` (string + timestamp, for audit).
- C-04 gate extension: `is_followup` context parameter (boolean) for bypass B16.
- `_asw_logs` event types: `followup_insert`, `followup_skip`, `followup_review_required`, `followup_pause_ooo`, `followup_manual_stop`, `followup_stale_review_abandoned`, `followup_engine_run_summary`, `followup_auto_block_soft_bounce`.
- Stop reason enum: `REPLY`, `UNSUBSCRIBE`, `BOUNCE_HARD`, `BOUNCE_SOFT_ESCALATED`, `MANUAL_BLOCK`, `REVIEW_FLAG_PENDING`, `OOO_PAUSE`, `C04_GATE_BLOCK:{reason}`, `MAX_FOLLOWUPS_REACHED`, `PARENT_NOT_SENT`.
- Idempotency key pattern `followup:{lead_id}:{sequence_root_queue_id}:{sequence_stage}`.
- Decision outcome enum: `AUTO_INSERT`, `REVIEW_REQUIRED`, `STOP`.
- Engine batch run artifact: `FU-RUN-{YYYY-MM-DD}-{NNN}` identifier, summary row v `_asw_logs`.
- Priority derivation per stage: 100 / 90 / 80 (PROPOSED defaults).
- CS3 failure_class mapping for engine errors: `ENGINE_TIMEOUT`→TRANSIENT, `C04_GATE_FAIL`→PERMANENT (lead-level), `PARENT_NOT_SENT`→TRANSIENT, `MAX_RETRIES_EXCEEDED`→PERMANENT.
- Auto-terminate thresholds: OOO pause = 14 calendar days (PROPOSED), review stale abandonment = 30 days (PROPOSED), soft-bounce consecutive block = 3 bounces (PROPOSED, aligned with C-07).
- Holiday calendar config (Script Property or external source) — optional, mimo v1.0 SPEC.
- Script Properties: `FOLLOWUP_OFFSET_1_BUSINESS_DAYS=3`, `FOLLOWUP_OFFSET_2_BUSINESS_DAYS=7`, `FOLLOWUP_QUIET_HOURS_START=09:00`, `FOLLOWUP_QUIET_HOURS_END=17:00`, `FOLLOWUP_TIMEZONE=Europe/Prague`, `FOLLOWUP_MAX_PER_SEQUENCE=2`, `FOLLOWUP_OOO_PAUSE_DAYS=14`, `FOLLOWUP_REVIEW_STALE_ABANDON_DAYS=30`.
- Payload version `"1.0"` pro follow-up queue rows (same as C-05 initial contract, compatible).

---

## Exception queue & human-in-the-loop — C-09 (review queue + operator resolution)

> **Autoritativni specifikace.** Definuje centralizovanou exception queue a operator resolution kontrakt pro pripady, ktere automat neumi rozhodnout sam.
>
> **Dependency narrowing:** Puvodni task brief uvadel dependency `C-03`. V repo source-of-truth **NEEXISTUJE** zadny `C-03.md` task record. `C3.md` je governance hardening (CLAUDE.md + branch protection, done 2026-04-05, semantic completely unrelated). Single task, ktery dava smysl jako reliability prerekvizita exception queue, je **`CS3`** (Reliability & Idempotency — dead-letter, retry matice, LockService, failure_class). Dependency je **narovnana na `CS3`** a explicitne dokumentovana v task recordu `docs/30-task-records/C-09.md`.

### 1. Účel exception queue

Exception queue je **centralizovana perzistentni vrstva** pro problematicke leady, ktere automatika nesmi / neumi rozhodnout sama. Misto "tichych" skipu, sheet error sloupcu roztrousenych po LEADS (`preview_error`, `email_reply_type=UNCLASSIFIED`, `bounce_class=SOFT`) nebo `_asw_dead_letters` (CS3 technicky retry exhaustion) definuje C-09 **jeden human-facing sheet** (`_asw_exceptions`) s jasnym resolution kontraktem.

Architekturni pozice (ASCII mapa):

```
    ┌─────────────────────────────────────────────────────────────────────┐
    │                    AUTOMATIC WORKFLOW CHAIN                          │
    │                                                                      │
    │   A-02 import → A-03/A-05 normalize+dedupe → A-06 web check         │
    │   → A-07 qualify → A-08 preview → B-04/B-05 render                  │
    │   → C-04 sendability gate → C-05 queue → C-06 sender                │
    │   → SENT → C-07 inbound ingest → C-08 follow-up engine              │
    │                                                                      │
    │                        fail / review signal                          │
    └────────────────────────────────────────┬────────────────────────────┘
                                             │
                                             ▼
                    ┌────────────────────────────────────────┐
                    │   C-09 Exception queue (_asw_exceptions)│
                    │                                          │
                    │   detected_at / exception_type / priority│
                    │   diagnostic_payload_json / summary      │
                    │   exception_status = OPEN                │
                    └────────────────────────────────────────┬┘
                                                             │
                                                             ▼
                             ┌───────────────────────────────────────┐
                             │     OPERATOR MANUAL REVIEW            │
                             │  (Google Sheets row or future B6 UI)  │
                             │                                        │
                             │   operator_decision ∈                  │
                             │     {approve, reject, retry,           │
                             │      edit_and_continue}                │
                             └───────────────────┬───────────────────┘
                                                 │
                           ┌─────────────────────┼─────────────────────┐
                           ▼                     ▼                     ▼
                      approve / retry /      reject / stop         edit_and_continue
                      edit_and_continue      terminal              → engine re-runs
                      → back into flow       → sequence_stop       with edited fields
```

**Core purpose:**
1. **Zabranit "zmizeli" leadu** — kazdy problematicky lead ma viditelny, trackable row.
2. **Oddelit technicky dead-letter (CS3) od business exception (C-09)** — CS3 loguje "retry exhausted" technical fail; C-09 je operator-facing review queue nad tim.
3. **Deterministicky resolution contract** — operator ma 4 discrete outcomes (approve / reject / retry / edit_and_continue), kazdy s definovanym flow re-entry.
4. **Auditability** — kdo rozhodl, kdy, proc, co se stalo dal.
5. **Priority-ordered queue** — operator vi, co resit prvni (compliance > delivery > content > data-quality).

**Co C-09 zachytava (6 kanonickych exception families + rozsirene):**
- **preview fail** — preview render selhal / webhook error / preview_needs_review=TRUE
- **missing email** — lead ma ICO + segment, ale chybi validni email, cannot send
- **ambiguous duplicate** — dedupe pravidla (A-05) vratila confidence-tie, manual merge decision
- **broken personalization** — personalization_json missing required keys / template render fail
- **provider fail po max retries** — CS3 dead-letter pro send job, review pred dalsim pokusem
- **unclear reply** — C-07 `reply_class=UNCLASSIFIED` + `reply_needs_manual=TRUE`

### 2. Boundary / non-goals

**C-09 resi:**
- Centralizovanou exception queue datovou vrstvu (schema, statusy, transitions, idempotency).
- Operator resolution contract (4 outcomes + flow re-entry rules).
- Taxonomy exception typu + priority model.
- Auditability (kdo / kdy / proc / co dal).
- Minimal sheet-row-based review interface (pro operator without frontend UI).

**C-09 NEresi:**
- **Runtime review worker** (cron / trigger / scheduler) — implementacni task.
- **Frontend UI** (B6 exception dashboard) — budouci task, NENI blocker.
- **Scheduler** (kdy engine vybira exception rows) — implementacni task.
- **Mailbox sync runtime** — C-07 implementacni task.
- **Provider webhook runtime** — C-07 implementacni task.
- **Queue worker runtime** — C-05 implementacni task.
- **Zapisy do `Config.gs`** — implementacni task (PROPOSED FOR C-09 enumy materializuje implementacni task).
- **Novy canonical CS1 state** — reuse existing `REVIEW_REQUIRED` (CS1 #18 non-terminal review), `DISQUALIFIED` (CS1 #14 terminal), `FAILED` lifecycle sub-states.
- **Suppression list management** — to je separate task (vztah k C-04 B7/B8 existing).
- **AI-based auto-triage exceptions** — v1.0 pure operator decision; v2.0 mozna add priority re-sort algoritmy.

**C-09 vztah k B6 (Operator UI):**
- B6 budouci task **NENI blocker** pro C-09 SPEC.
- Operator muze v interim resolvovat exceptions **primo v Google Sheets** bunce (`_asw_exceptions` row edit).
- C-09 SPEC definuje minimal sheet-row-based interface (sekce 7) → postacuje bez UI.

### 3. Exception taxonomy

**10 exception typu (6 kanonickych z user briefu + 4 rozsireni z repo analyzy):**

| # | `exception_type` | Popis | Odkud vzniká | Severity / priority tier | Blocking vs review | Retry-eligible? | Typicky resi |
|---|------------------|-------|--------------|--------------------------|--------------------|-----------------| -------------|
| 1 | `preview_render_fail` | Preview generation selhal (webhook HTTP error, template missing, runtime exception). | B-04 render endpoint (HTTP 4xx/5xx), A-08 processPreviewQueue (PROCESSING_ERROR), existing `preview_stage=FAILED` + `preview_error`. | **Priority 3 (content)** | Review (ne auto-blocking — operator rozhodne). | Ano (retry → re-run render po fix). | Content operator. |
| 2 | `missing_email` | Lead prosel qualification (business_name + ICO) ale chybi validni email (neexistuje / `email='' `/ `@` missing). | A-07 AutoQualifyHook (ma business data ale no email), A-06 web check (no contact page), C-04 gate B2 `NO_RECIPIENT_EMAIL`. | **Priority 4 (data-quality)** | Review. | Ano (retry → po operator dodani emailu). | Data operator. |
| 3 | `ambiguous_duplicate` | Dedupe (A-05) najde 2+ leady s high similarity ale zadny deterministicky tie-breaker (ICO identical, company_name fuzzy match > 0.8, ale mesto se lisi). | A-05 dedupeByCompanyKey, A-03 normalize. | **Priority 4 (data-quality)** | Review (blocking pro ingest toho leadu). | Ne (resolution = manual merge, ne retry). | Data operator. |
| 4 | `broken_personalization` | Template render / copy-gen fail kvuli missing personalization keys (`{{company_name}}` expanded z null, required field empty). | A-08 processPreviewQueue build, C-08 follow-up copy-gen, B-04 render. | **Priority 3 (content)** | Review. | Ano (retry po data fix / template fix). | Content operator / data operator. |
| 5 | `provider_fail_after_max_retries` | CS3 dead-letter pro send job — C-06 sender vratil `failure_class=PERMANENT` nebo TRANSIENT exhausted po max_attempts=1 (S12). | CS3 dead-letter, C-06 `NormalizedSendResponse` fail, C-05 `send_status=FAILED`. | **Priority 2 (delivery)** | Review (operator rozhodne retry with new queue row nebo permanent reject). | Ano (retry = novy queue row per C-05; ne overwrite existing). | Delivery operator. |
| 6 | `unclear_reply` | C-07 inbound `reply_event` s `reply_class=UNCLASSIFIED` + `reply_needs_manual=TRUE`. Operator musi rozhodnout intent (positive / negative / question / OOO / unsubscribe intent). | C-07 ingest, `_asw_inbound_events` event_type=REPLY/UNKNOWN_INBOUND. | **Priority 2 (delivery)** | Review (pauses C-08 follow-up sequence). | Ne (resolution = classification, ne retry). | Delivery / content operator. |
| 7 | `sendability_manual_review` | C-04 gate outcome `MANUAL_REVIEW_REQUIRED` (reasons R1–R3: `PREVIEW_NEEDS_REVIEW`, `QUALITY_SCORE_BELOW_THRESHOLD`, `SEND_ALLOWED_UNSET`). | C-04 evaluator, LEADS `sendability_outcome=MANUAL_REVIEW_REQUIRED`. | **Priority 3 (content)** | Review. | Ano (retry po review = re-eval gate). | Content operator. |
| 8 | `compliance_hard_stop` | C-04 `SEND_BLOCKED` ze supression / unsubscribe / GDPR domeny. Exception se **zaklada jako audit trail**, ale operator **nemuze approve send** (compliance hard-stop). | C-04 gate reasons B7, B8, PROPOSED `ADDRESS_BOUNCED`. | **Priority 1 (compliance)** | **Terminal reject-only** (operator muze pouze `reject` s note). | Ne. | Legal / compliance operator. |
| 9 | `normalization_error` | A-03 normalize shodil row (required field missing, header mismatch, invalid format). | A-03 / A-02 `normalized_status=ERROR`, `_raw_import` fail. | **Priority 4 (data-quality)** | Review. | Ano (retry po data fix). | Data operator. |
| 10 | `followup_stale_review` | C-08 review flag nezresolvovan > 30 dni (`followup_stale_review_abandoned` threshold). Engine auto-zaklada exception pro operator cleanup. | C-08 engine auto-detection, `_asw_logs` `followup_stale_review_abandoned`. | **Priority 4 (data-quality)** | Review (typicky reject = sequence stop). | Ne. | Content / data operator. |

**Priority tiers (zvyseny semantic):**
- **Tier 1 — compliance** (`compliance_hard_stop`) — legal / GDPR / explicit suppression. Vyzaduje immediate attention (blocks automated outreach integrity).
- **Tier 2 — delivery** (`provider_fail_after_max_retries`, `unclear_reply`) — inbox deliverability + thread continuity. Kazde zdrzeni ohrozuje reply rate.
- **Tier 3 — content** (`preview_render_fail`, `broken_personalization`, `sendability_manual_review`) — customer-facing output quality. Muze pockat dny.
- **Tier 4 — data-quality** (`missing_email`, `ambiguous_duplicate`, `normalization_error`, `followup_stale_review`) — long-tail cleanup. Batch-resolvable.

### 4. Priority model

**Exception priority (1–4, nizsi cislo = vyssi priorita):**

| Priority | Tier | Co spada | Urgence | SLA target (PROPOSED) |
|----------|------|----------|---------|-----------------------|
| **P1** | Compliance | Legal hard-stop, unsubscribe breach, GDPR anomaly. | Okamzite — nereseni = compliance violation. | Resolve < 24h |
| **P2** | Delivery | Provider fail, unclear reply (pauzuje C-08 follow-up). | Vysoka — nereseni = promeskane follow-up okno (T+3/T+7 clock bezi). | Resolve < 2 dny business |
| **P3** | Content | Preview/copy fail, MANUAL_REVIEW_REQUIRED. | Stredni — nereseni = lead sedi, ale nic se nepromarni. | Resolve < 5 dni business |
| **P4** | Data-quality | Missing email, ambiguous duplicate, normalization error, stale review. | Nizka — batch-resolvable jednou tydne. | Resolve < 10 dni business |

**Trideni v queue (sort order):**
1. `exception_priority` ASC (P1 → P4)
2. `detected_at` ASC (nejstarsi first v ramci priority)
3. `exception_type` alfabeticky (tiebreaker — deterministic)

**Auto-priority-bump pravidla (PROPOSED FOR C-09 implementacni task):**
- Exception pending > 2 SLA targetu → promote o 1 tier (P3 → P2).
- P4 pending > 14 dni → auto-downgrade na `CLOSED_STALE` (ne reject — audit-preserving).
- C-08 sekvence v OOO hold s exception > 7 dni → promote na P2 (delivery-critical).

**Kompliance precedence:**
- P1 exceptions **nesmi byt merged / approved / retried**. Jedina validni resolution je `reject` + audit note. To je tvrdy invariant v resolution contracte (sekce 8).

### 5. Co jde do manual review

**4-cestny routing po detection:**

| Detection situace | Route to | Duvod |
|-------------------|----------|-------|
| Preview render HTTP 5xx (transient) + pokud je to prvni pokus | **Retry (auto)** — ne exception queue | CS3 `TRANSIENT` + retry budget. Exception queue se **nezaklada**, pokud CS3 retry loop stale bezi. |
| Preview render HTTP 5xx po vycerpani max_attempts | **Exception queue + manual review** | CS3 dead-letter trigger → C-09 prevzame jako `preview_render_fail`. |
| Preview render HTTP 4xx (permanent) | **Exception queue + manual review** | Hned prvni pokus — permanent fail vyzaduje clovecku intervention. |
| LEADS `business_name + ICO OK, email missing` | **Exception queue + manual review (`missing_email`)** | Lead ma hodnotu, jen schazi kontakt — zachranuj. |
| LEADS normalization_status=ERROR, no business data | **Reject (auto — reject v ramci ingest)** — exception queue se nezaklada | Ingest failed bez hodnotneho signalu. Muze se logovat do `_asw_logs`, ale C-09 row se nezaklada. |
| Dedupe confidence tie (fuzzy match 2+ rows, ICO identical ale mesta lisi) | **Exception queue + manual review (`ambiguous_duplicate`)** | Dedupe algorithm unable to rozhodnout. |
| Dedupe unique match | **Auto-merge (ne exception)** | Deterministic. |
| C-04 gate `AUTO_SEND_ALLOWED` | **Proceed to queue** (ne exception) | Gate passed. |
| C-04 gate `MANUAL_REVIEW_REQUIRED` reason R1-R3 | **Exception queue + manual review (`sendability_manual_review`)** | Gate decided manual. |
| C-04 gate `SEND_BLOCKED` reason B7/B8/`ADDRESS_BOUNCED` | **Exception queue + reject-only (`compliance_hard_stop`)** | Audit trail, ale operator muze pouze reject + note. |
| C-04 gate `SEND_BLOCKED` reason B1-B6, B9-B15 (data deficit, terminal state, sent_allowed=false, already sent) | **Silent skip (ne exception)** — logovano do `_asw_logs` | Deterministicky duvod, operator nemusi resit individualne. |
| C-06 sender `failure_class=TRANSIENT` behem max_attempts=1 scope | **CS3 dead-letter (ne retry — S12 has no retry)** → **Exception queue (`provider_fail_after_max_retries`)** | Single attempt, fail = immediate exception. |
| C-06 sender `failure_class=PERMANENT` | **CS3 dead-letter** → **Exception queue (`provider_fail_after_max_retries`)** | Permanent fail. |
| C-07 reply `reply_class ∈ {POSITIVE, NEGATIVE, QUESTION}` | **Proceed CS1 T20 (REPLIED)** — ne exception | Classified. |
| C-07 reply `reply_class=OOO` | **C-08 pause 14 dni** (ne exception) | Deterministic. |
| C-07 reply `reply_class=UNCLASSIFIED` + `reply_needs_manual=TRUE` | **Exception queue + manual review (`unclear_reply`)** | Classifier ambiguous. |
| C-07 `unknown_inbound` event (not reply/bounce/unsubscribe) | **Exception queue (`unclear_reply`)** | Suspicious inbound. |
| C-08 review flag > 30 dni bez resolve | **Auto-reject v C-08** + **Exception queue (`followup_stale_review`) audit trail** | Stale cleanup. |

**Invariant: kazdy lead s nevyreseny automaticky problem MA exception row.** Pokud problem je silent (auto-skip bez exception), lead nesmi byt "lost" — musi byt reachable pres LEADS status field (`lifecycle_state`, `sendability_outcome`, `preview_stage`, `bounce_class`, atd.).

### 6. Exception queue schema

**PROPOSED FOR C-09 sheet: `_asw_exceptions` (append-only-with-resolution-update).**

| # | Pole | Typ | Required | Nullable | Vyznam | Source | Label |
|---|------|-----|----------|----------|--------|--------|-------|
| 1 | `exception_id` | string | ANO | NE | Unikátní ID exception row. Format: `EX-{YYYY-MM-DD}-{NNNNN}`. | Engine při insertu. | PROPOSED FOR C-09 |
| 2 | `lead_id` | string | ANO | NE | FK na LEADS. Kazda exception ma asociovany lead (ambigous_duplicate ma **primary** lead + pointer na candidate secondary v diagnostic_payload). | Source step. | VERIFIED (LEADS.lead_id existing) |
| 3 | `outreach_queue_id` | string | NE | ANO | FK na `_asw_outbound_queue` row, pokud exception vznikla v outbound kontextu (C-04/C-05/C-06/C-08). Null pro pre-outbound (preview/qualify/dedupe/normalize). | Source step. | VERIFIED (C-05 schema) |
| 4 | `source_job_id` | string | NE | ANO | FK na `_raw_import.source_job_id` nebo `FU-RUN-*` nebo `PREVIEW-RUN-*`. Pro dohledatelnost batch kontextu. | Source step. | VERIFIED (A-09 ingest report uses) |
| 5 | `inbound_event_id` | string | NE | ANO | FK na `_asw_inbound_events.event_id`, pokud exception vznikla z C-07 eventu (`unclear_reply`). | C-07 ingest. | VERIFIED (C-07 schema) |
| 6 | `exception_type` | enum | ANO | NE | Jeden z 10 typu (sekce 3). | Source step detection. | PROPOSED FOR C-09 |
| 7 | `exception_priority` | integer | ANO | NE | 1-4 (sekce 4). Default derivovano z `exception_type`, operator muze override. | Engine při insertu (derived) + operator (editable). | PROPOSED FOR C-09 |
| 8 | `exception_status` | enum | ANO | NE | Status lifecycle (sekce 10). Initial `OPEN`. | Engine insert + operator + resolution step. | PROPOSED FOR C-09 |
| 9 | `detected_at` | timestamp | ANO | NE | Kdy exception vznikla. Immutable po insertu. | Engine při insertu. | PROPOSED FOR C-09 |
| 10 | `detected_by_step` | string | ANO | NE | Jaky automaticky step detekoval (napr. `A-08:processPreviewQueue`, `C-04:evaluateSendability`, `C-06:EmailSender`, `C-07:ingestReply`, `C-08:runFollowupEngine`). | Source step. | PROPOSED FOR C-09 |
| 11 | `summary` | string | ANO | NE | Jedno-vetny human-readable popis problemu. Max 500 chars. Generated by source step. | Source step. | PROPOSED FOR C-09 |
| 12 | `diagnostic_payload_json` | JSON string | ANO | NE | Structured context pro operator diagnostiku. Schema per `exception_type` (napr. preview_render_fail obsahuje `error_message`, `http_status`, `template_id`, `retry_count`). PII-masked. Max 4KB. | Source step. | PROPOSED FOR C-09 |
| 13 | `operator_decision` | enum | NE | ANO | Jeden z 4 outcomes: `approve`, `reject`, `retry`, `edit_and_continue`. Null dokud IN_REVIEW → RESOLVED transition. | Operator. | PROPOSED FOR C-09 |
| 14 | `operator_note` | string | NE | ANO | Free-text zduvodneni rozhodnuti. Max 1000 chars. Povinny pro `reject` a `compliance_hard_stop` types. | Operator. | PROPOSED FOR C-09 |
| 15 | `operator_edited_fields_json` | JSON string | NE | ANO | Structured diff edited fields pro `edit_and_continue` outcome (napr. `{"email": "new@example.com", "business_name": "Corrected Name"}`). Null pro ostatni outcomes. | Operator. | PROPOSED FOR C-09 |
| 16 | `resolved_at` | timestamp | NE | ANO | Kdy operator rozhodnul (transition OPEN/IN_REVIEW → RESOLVED). | Resolution step. | PROPOSED FOR C-09 |
| 17 | `resolved_by` | string | NE | ANO | Operator identifier (email, operator_id). Fallback: `"operator"` interim. | Resolution step. | PROPOSED FOR C-09 |
| 18 | `resolution_outcome` | enum | NE | ANO | Final outcome po flow re-entry (uspel, selhal, pending). Values: `APPLIED`, `APPLIED_WITH_EDITS`, `REJECTED`, `RETRY_QUEUED`, `RETRY_FAILED_AGAIN`, `PENDING_DOWNSTREAM`. Jedno-smerny — po set nemen. | Engine po resolution flow re-entry. | PROPOSED FOR C-09 |
| 19 | `retry_reference_queue_id` | string | NE | ANO | Pokud outcome=`retry` + vytvori se novy `_asw_outbound_queue` row, FK na ten row. | Engine resolution step. | PROPOSED FOR C-09 |
| 20 | `retry_reference_exception_id` | string | NE | ANO | Pokud retry znovu fail → vznikne nova exception → FK na ni pro lookup chainu. | Engine (pri second fail). | PROPOSED FOR C-09 |
| 21 | `next_action` | enum | NE | ANO | Deterministic popis, co flow dela po resolution: `RETURN_TO_C04_GATE`, `CREATE_NEW_QUEUE_ROW`, `RESUME_C08_SEQUENCE`, `UPDATE_CS1_LIFECYCLE`, `TERMINAL_STOP`, `LEAD_RE_INGEST`. | Derivovano engine z `operator_decision` + `exception_type`. | PROPOSED FOR C-09 |
| 22 | `cs2_run_id` | string | ANO | NE | Batch run id, ktery exception detekoval. Cross-ref na `_asw_logs`. | Source step. | VERIFIED (CS2 run history) |
| 23 | `related_dead_letter_id` | string | NE | ANO | FK na `_asw_dead_letters.dead_letter_id`, pokud exception vznikla z CS3 dead-letter. | CS3 integration. | VERIFIED (CS3 existing) + PROPOSED (FK pole) |
| 24 | `sla_target_at` | timestamp | ANO | NE | Derivovano z `detected_at` + SLA per priority (P1=24h, P2=2d, P3=5d, P4=10d business days). Pro auto-priority-bump. | Engine při insertu. | PROPOSED FOR C-09 |

**Total: 24 poli (PROPOSED, align s C-05 32 poli / C-07 18 poli stylem — rich audit trail without excessive minimalism).**

**Rationale pro pole:**
- `exception_id` + `exception_type` + `exception_priority` + `exception_status` = core identity.
- `lead_id` + `outreach_queue_id` + `source_job_id` + `inbound_event_id` + `cs2_run_id` + `related_dead_letter_id` = cross-ref grafu.
- `detected_at` + `detected_by_step` + `summary` + `diagnostic_payload_json` = detection audit.
- `operator_decision` + `operator_note` + `operator_edited_fields_json` + `resolved_at` + `resolved_by` = resolution audit.
- `resolution_outcome` + `retry_reference_queue_id` + `retry_reference_exception_id` + `next_action` = flow re-entry audit.
- `sla_target_at` = priority management.

### 7. Minimal review interface

**Sheet-row-based operator interface (pro B6-less interim):**

Operator otevre `_asw_exceptions` sheet. Vidí/edituje:

**READ-ONLY (system-set, operator nesmi zmenit):**
- `exception_id`, `lead_id`, `outreach_queue_id`, `source_job_id`, `inbound_event_id`
- `exception_type`, `detected_at`, `detected_by_step`, `cs2_run_id`, `related_dead_letter_id`
- `summary`, `diagnostic_payload_json`
- `sla_target_at`
- `retry_reference_queue_id`, `retry_reference_exception_id`
- `resolution_outcome` (one-way after set)

**EDITABLE (operator):**
- `exception_priority` — operator muze bumpnout priority (napr. P3 → P2 pokud vidi delivery urgence).
- `exception_status` — ceka transition z `OPEN` → `IN_REVIEW` (operator claims exception).
- `operator_decision` — povinny pro resolution (enum dropdown: `approve` / `reject` / `retry` / `edit_and_continue`).
- `operator_note` — free text.
- `operator_edited_fields_json` — JSON edits (pouze pro `edit_and_continue`).

**DERIVED (system-written po resolution trigger):**
- `resolved_at` — auto-set kdyz `exception_status` → `RESOLVED`.
- `resolved_by` — z session kontextu / email.
- `next_action` — derivovano z `operator_decision` + `exception_type`.

**Minimum operator musi videt:**
1. **Exception identity** (exception_id + lead_id + exception_type + priority).
2. **Context** (summary + diagnostic_payload_json jako human-readable pretty-print).
3. **Cross-ref links** (click na lead_id → LEADS row, click na outreach_queue_id → queue row, click na inbound_event_id → inbound events row).
4. **Action widget** (operator_decision dropdown + note textarea + edits JSON field + submit button).
5. **Status history** (detected_at → IN_REVIEW timestamp → resolved_at + resolution_outcome).

**Minimum stací bez UI:**
- Sheet row s validations:
  - `operator_decision` = dropdown z 4 values.
  - `exception_status` = dropdown z allowed transitions (sekce 10).
  - `operator_note` required pro `reject` + `compliance_hard_stop`.
- On-edit trigger (Apps Script `onEdit`) picks up `exception_status=RESOLVED` + populates derived fields + calls resolution flow (sekce 9).

**B6 UI (budouci task) pridava:**
- Filtered priority-sorted view.
- Per-lead aggregate context (all exceptions for lead_id).
- Quick-action buttons (approve / reject / retry / edit forms).
- SLA countdown badges.
- Bulk resolution (P4 batch cleanup).

### 8. Resolution outcomes

**4 discrete outcomes (user brief spec, immutable enum):**

#### 8.1 `approve`

**Definice:** Operator potvrzuje, ze current state je spravny / akceptovatelny, a flow pokracuje bez change.

**Kdy se pouziva:**
- `sendability_manual_review` — operator potvrzuje kvalitu content/preview → allow send.
- `unclear_reply` — operator rozhodne, ze reply je ok (napr. klasifikuje UNCLASSIFIED → POSITIVE).
- `broken_personalization` — operator potvrzuje, ze i s missing keys muze flow pokracovat (fallback text OK).

**Kdo muze pouzit:** Kazdy operator s write access na LEADS (v1.0 = jedno role).

**Co se stane:**
- `exception_status` → `RESOLVED`.
- `resolution_outcome` → `APPLIED`.
- `next_action` derivovano (napr. `sendability_manual_review` + `approve` → `RETURN_TO_C04_GATE` s override `MANUAL_REVIEW_OVERRIDE=true`).
- Exception row je zaznamena v auditu, ale flow pokracuje po **next_action** trase.

**Invariant:** `approve` **nelze** pouzit pro `compliance_hard_stop` exception type. Attempt = validation error, resolution blocked.

**Vytvori novy queue row?** NE — reuse existing outreach_queue_id nebo restart C-04 gate s override flag. Novy row vznikne az kdyz operator `retry` (separatni outcome).

#### 8.2 `reject`

**Definice:** Operator rozhoduje, ze lead/email/reply **nemá pokracovat** v danem contextu. Terminal stop pro tento exception.

**Kdy se pouziva:**
- `compliance_hard_stop` — legal / suppression / GDPR → reject (jedina validni volba).
- `missing_email` — operator potvrzuje "lead neni dohledatelny" → sequence stop.
- `ambiguous_duplicate` — operator rozhodne jeden lead merge + druhy reject (reject = discard candidate lead).
- `unclear_reply` → operator klasifikuje jako "spam / noise" → ignore.
- `provider_fail_after_max_retries` → operator rozhodne, ze adresa je dead → permanent suppression.
- `followup_stale_review` → default cleanup.

**Kdo muze pouzit:** Kazdy operator. Pro P1 `compliance_hard_stop` existing legal approval workflow (mimo SPEC scope).

**Co se stane:**
- `exception_status` → `RESOLVED`.
- `resolution_outcome` → `REJECTED`.
- `operator_note` required.
- `next_action` per type:
  - `compliance_hard_stop` → `UPDATE_CS1_LIFECYCLE` (set LEADS `unsubscribed=TRUE` nebo `suppressed=TRUE`) + `TERMINAL_STOP`.
  - `missing_email` → `UPDATE_CS1_LIFECYCLE` (set `lifecycle_state=DISQUALIFIED` s reason) + `TERMINAL_STOP`.
  - `ambiguous_duplicate` (reject candidate) → `LEAD_RE_INGEST` pro primary + discard flag pro candidate + `TERMINAL_STOP` pro exception.
  - `unclear_reply` → `RESUME_C08_SEQUENCE` jakoze reply = noise (ne stop sequence).
  - `provider_fail_after_max_retries` → `UPDATE_CS1_LIFECYCLE` (set `bounced` flag) + `TERMINAL_STOP` sequence.
  - `followup_stale_review` → `TERMINAL_STOP` sequence.

**Invariant:** `reject` **vzdy zpusobi**, ze konkretni exception row dosahne `RESOLVED` a `TERMINAL_STOP` pro _tento_ problem. Lead **neni** auto-terminated — pouze tento exception je resolved. Lead muze mit dalsi budouci exceptions (napr. novy outreach v dalsi kampani).

**Vytvori novy queue row?** NE.

#### 8.3 `retry`

**Definice:** Operator rozhoduje, ze problem byl transient / vyreseny externe (napr. template opraveny, email pridany), a flow ma zkusit **stejny krok znovu**.

**Kdy se pouziva:**
- `preview_render_fail` → operator opravil template → retry render.
- `broken_personalization` → data doplnena → retry render.
- `provider_fail_after_max_retries` → operator potvrzuje, ze provider byl down, nyni OK → retry send (novy queue row).
- `normalization_error` → data fixed → retry import.

**Kdo muze pouzit:** Kazdy operator.

**Co se stane:**
- `exception_status` → `RESOLVED`.
- `resolution_outcome` → `RETRY_QUEUED` (pokud engine uspesne vytvori novy retry artifact).
- `next_action` per type:
  - `preview_render_fail` → `CREATE_NEW_QUEUE_ROW` (virtualni preview queue row s `retry_of=exception_id`) + `RESUME_C08_SEQUENCE`.
  - `broken_personalization` → `CREATE_NEW_QUEUE_ROW` (nove preview queue insert).
  - `provider_fail_after_max_retries` → `CREATE_NEW_QUEUE_ROW` na C-05 queue (novy `outreach_queue_id`, nove send attempt, respects C-05 idempotency pattern — idempotency_key includes retry_of suffix PROPOSED).
  - `normalization_error` → `LEAD_RE_INGEST` (retry A-02/A-03 normalize pre tento raw row).
- `retry_reference_queue_id` (nebo `retry_reference_exception_id` pokud second fail) populated.

**Invariant:** Retry **NIKDY neprepise** original queue row / dead-letter row (imutable audit per C-05 + CS3). Retry = **novy artifact** s `retry_of` reference. Original exception row stava `RESOLVED`, nova exception row muze vzniknout pokud retry zase fail.

**Invariant 2:** Retry **nelze** pouzit pro `compliance_hard_stop`, `ambiguous_duplicate`, `unclear_reply`, `followup_stale_review` — tyto neni technicky fail, nejde o ne retryovat. Validation enforced.

**Vytvori novy queue row?** ANO v pripadech kde type = `preview_render_fail` / `broken_personalization` / `provider_fail_after_max_retries` (queue row podle odpovidajici queue); `normalization_error` re-triggeruje A-02 pipeline pre danou raw row bez klasickeho "queue row" konceptu.

#### 8.4 `edit_and_continue`

**Definice:** Operator upravuje data a flow pokracuje s **edited state**.

**Kdy se pouziva:**
- `missing_email` → operator vepise email manualne → flow pokracuje (C-04 re-eval → queue → send).
- `broken_personalization` → operator upravi LEADS personalization fields → retry render.
- `ambiguous_duplicate` → operator rozhodne merge (primary + `company_key` update) → retry dedupe krok.
- `sendability_manual_review` (s edity) → operator upravi `email_subject_draft` / `email_body_draft` → proceed to queue.

**Kdo muze pouzit:** Kazdy operator.

**Co se stane:**
- `exception_status` → `RESOLVED`.
- `resolution_outcome` → `APPLIED_WITH_EDITS`.
- `operator_edited_fields_json` required s valid JSON diffem.
- Engine aplikuje edits na LEADS row (nebo konkretni target field per type).
- `next_action` per type:
  - `missing_email` → LEADS.email updated → `RETURN_TO_C04_GATE` (new eval cycle).
  - `broken_personalization` → LEADS personalization updated → `CREATE_NEW_QUEUE_ROW` (retry preview render).
  - `ambiguous_duplicate` → merge operation → LEADS updated → `LEAD_RE_INGEST`.
  - `sendability_manual_review` → LEADS email_subject_draft/body_draft updated → `CREATE_NEW_QUEUE_ROW` (insert to C-05 queue).
- Original data **preservovana** v `operator_edited_fields_json` + `_asw_logs` audit.

**Invariant:** `edit_and_continue` **nelze** pouzit pro `compliance_hard_stop`, `unclear_reply`, `provider_fail_after_max_retries`, `followup_stale_review`, `preview_render_fail` — tyto nemaji editable lead-fields jako root cause. Validation enforced.

**Vytvori novy queue row?** ANO pro `broken_personalization`, `sendability_manual_review`. NE pro `missing_email` (jen LEADS update + gate re-eval).

**Resolution outcome compatibility matrix (exception type × outcome):**

| `exception_type` | `approve` | `reject` | `retry` | `edit_and_continue` |
|------------------|-----------|----------|---------|---------------------|
| `preview_render_fail` | — | ✓ | ✓ | — |
| `missing_email` | — | ✓ | — | ✓ |
| `ambiguous_duplicate` | — | ✓ | — | ✓ |
| `broken_personalization` | ✓ | ✓ | ✓ | ✓ |
| `provider_fail_after_max_retries` | — | ✓ | ✓ | — |
| `unclear_reply` | ✓ | ✓ | — | — |
| `sendability_manual_review` | ✓ | ✓ | — | ✓ |
| `compliance_hard_stop` | — | ✓ | — | — |
| `normalization_error` | — | ✓ | ✓ | ✓ |
| `followup_stale_review` | — | ✓ | — | — |

Legenda: ✓ = valid outcome; — = invalid, validation error.

### 9. Resolution flow

**Textovy flow + pseudocode:**

```
┌─────────────────────────────────────────────────────────────────────┐
│ 1. DETECTION PHASE                                                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   Source step (A-08 / C-04 / C-06 / C-07 / C-08 / CS3 dead-letter)  │
│       │                                                              │
│       ▼                                                              │
│   detect_exception(lead_id, type, diagnostic) {                      │
│       // Idempotency check (sekce 15)                               │
│       existing = find_open_exception(lead_id, type, context_hash)   │
│       if (existing) {                                                │
│           // Re-open or append to diagnostic (ne duplicitni row)    │
│           update_diagnostic(existing, new_diagnostic)               │
│           return existing                                            │
│       }                                                              │
│       row = create_exception_row({                                   │
│           exception_id: generate_id(),                               │
│           lead_id, exception_type: type,                             │
│           exception_priority: derive_priority(type),                 │
│           exception_status: "OPEN",                                  │
│           detected_at: now(),                                        │
│           detected_by_step: current_step(),                          │
│           summary: build_summary(type, diagnostic),                  │
│           diagnostic_payload_json: diagnostic,                       │
│           sla_target_at: now() + sla_for(priority)                   │
│       })                                                             │
│       log(_asw_logs, "exception_created", row.exception_id)          │
│       return row                                                     │
│   }                                                                  │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ 2. OPERATOR REVIEW PHASE                                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   Operator opens sheet row                                           │
│       │                                                              │
│       ▼                                                              │
│   operator_claim(exception_id) {                                     │
│       if (row.exception_status !== "OPEN") reject("Already claimed") │
│       row.exception_status = "IN_REVIEW"                             │
│       log(_asw_logs, "exception_claimed", exception_id)              │
│   }                                                                  │
│                                                                      │
│   Operator reviews diagnostic + context                              │
│   Operator sets:                                                     │
│       - operator_decision (enum)                                     │
│       - operator_note (string)                                       │
│       - operator_edited_fields_json (if edit_and_continue)           │
│       - exception_status = "RESOLVED" (on-edit trigger)              │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ 3. RESOLUTION FLOW DISPATCH                                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   on_exception_resolved(row) {                                       │
│       // Validation                                                  │
│       if (!compatibility_matrix[row.exception_type][row.decision]) { │
│           reject("Invalid outcome for this exception type")          │
│           revert row.exception_status to IN_REVIEW                   │
│           return                                                     │
│       }                                                              │
│       if (row.decision === "reject" && !row.operator_note) {         │
│           reject("Note required for reject")                         │
│           return                                                     │
│       }                                                              │
│                                                                      │
│       row.resolved_at = now()                                        │
│       row.resolved_by = current_operator()                           │
│       row.next_action = derive_next_action(                          │
│           row.exception_type, row.decision)                          │
│                                                                      │
│       switch (row.decision) {                                        │
│           case "approve":                                            │
│               handle_approve(row)                                    │
│               break                                                  │
│           case "reject":                                             │
│               handle_reject(row)                                     │
│               break                                                  │
│           case "retry":                                              │
│               handle_retry(row)                                      │
│               break                                                  │
│           case "edit_and_continue":                                  │
│               handle_edit_and_continue(row)                          │
│               break                                                  │
│       }                                                              │
│                                                                      │
│       log(_asw_logs, "exception_resolved", {                         │
│           exception_id, decision, resolution_outcome,                │
│           next_action, resolved_by, resolved_at                      │
│       })                                                             │
│   }                                                                  │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ 4. BRANCH HANDLERS                                                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   handle_approve(row):                                               │
│       // Flow resumes with override flag                             │
│       switch row.exception_type:                                     │
│           sendability_manual_review → set LEADS                      │
│                 manual_review_override=TRUE, trigger C-04 re-eval   │
│           unclear_reply → classify reply per operator_note,         │
│                 C-08 resumes sequence per reclassification          │
│           broken_personalization → mark fallback_acceptable,        │
│                 trigger re-render with fallback copy                │
│       row.resolution_outcome = "APPLIED"                            │
│                                                                      │
│   handle_reject(row):                                                │
│       switch row.exception_type:                                     │
│           compliance_hard_stop → LEADS.unsubscribed/suppressed=TRUE, │
│                 CS1 T22 if unsubscribe, T21 if bounced              │
│           missing_email → LEADS.lifecycle_state=DISQUALIFIED        │
│           ambiguous_duplicate → flag candidate as discarded,        │
│                 primary lead pokracuje                              │
│           unclear_reply (reject) → klasifikace NOISE, C-08 resume   │
│           provider_fail (reject) → LEADS.bounced=TRUE, seq stop     │
│           followup_stale_review → C-08 seq TERMINAL_STOP            │
│       row.resolution_outcome = "REJECTED"                            │
│                                                                      │
│   handle_retry(row):                                                 │
│       switch row.exception_type:                                     │
│           preview_render_fail → re-trigger A-08 preview pipeline    │
│                 for lead_id, preview_stage=QUEUED                   │
│           broken_personalization → re-trigger preview with LEADS    │
│                 current personalization snapshot                    │
│           provider_fail_after_max_retries → create new C-05 row,    │
│                 idempotency_key includes retry_of=exception_id      │
│           normalization_error → re-trigger A-02/A-03 for raw row    │
│       retry_reference_queue_id = new_row.id                         │
│       row.resolution_outcome = "RETRY_QUEUED"                       │
│                                                                      │
│   handle_edit_and_continue(row):                                    │
│       edits = parse_json(row.operator_edited_fields_json)            │
│       for each (field, value) in edits:                              │
│           LEADS[row.lead_id][field] = value                          │
│           log _asw_logs LEADS_EDIT (audit)                          │
│       switch row.exception_type:                                     │
│           missing_email → trigger C-04 gate re-eval                  │
│           broken_personalization → trigger A-08 re-render            │
│           ambiguous_duplicate → trigger merge op + A-05 re-dedupe   │
│           sendability_manual_review → insert C-05 queue row         │
│           normalization_error → re-trigger A-02 import              │
│       row.resolution_outcome = "APPLIED_WITH_EDITS"                  │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ 5. POST-RESOLUTION FOLLOW-UP                                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   Downstream step running (e.g., re-eval gate, new queue row send):  │
│       if downstream succeeds:                                        │
│           no new exception                                           │
│       if downstream fails:                                           │
│           new exception created with                                 │
│               exception.retry_of_exception_id = original.id          │
│           original.resolution_outcome =                              │
│               "RETRY_FAILED_AGAIN" (updated)                         │
│           new exception.exception_priority might be                  │
│               auto-bumped (consecutive-fail)                         │
└─────────────────────────────────────────────────────────────────────┘
```

### 10. Exception status model

**5 statusu:**

| Status | Popis | Allowed transitions | Disallowed | Kdo meni |
|--------|-------|---------------------|------------|----------|
| `OPEN` | Exception vznikla, ceka na operator claim. | → `IN_REVIEW`, → `CANCELLED` (auto, pokud source step uspeje na retry — rare, jen ve windows behem CS3 retry loop) | → `RESOLVED` (nesmi preskocit review), → `CLOSED` (nesmi preskocit resolution) | Detection step (insert) + operator claim + auto-cancel (CS3 retry win) |
| `IN_REVIEW` | Operator claimnul, pracuje na decision. | → `RESOLVED`, → `OPEN` (release claim), → `CANCELLED` (operator zjisti, ze problem zmizel / bylo auto-vyreseno) | → `CLOSED` (nesmi preskocit RESOLVED) | Operator claim / release / resolve |
| `RESOLVED` | Operator rozhodl, flow re-entry triggered, cekame na `resolution_outcome` determination. | → `CLOSED` (outcome determined) | → `OPEN`, → `IN_REVIEW` (audit-immutable po resolve) | Operator resolution + engine downstream |
| `CLOSED` | `resolution_outcome` set (APPLIED / REJECTED / RETRY_QUEUED / APPLIED_WITH_EDITS / RETRY_FAILED_AGAIN / PENDING_DOWNSTREAM). Terminal. | žádné — terminal | — | Engine po downstream |
| `CANCELLED` | Exception byla auto-canceled (problem vyresen jinak, source step retry uspel behem open windows). Terminal, bez operator resolution. | žádné — terminal | — | Engine auto / operator manual |

**State diagram:**

```
                 detection
                    │
                    ▼
              ┌──────────┐
              │  OPEN    │──────► CANCELLED (auto)
              └────┬─────┘
      operator     │
      claim        ▼
              ┌──────────┐
              │IN_REVIEW │──────► OPEN (release)
              │          │──────► CANCELLED (auto)
              └────┬─────┘
      operator     │
      resolve      ▼
              ┌──────────┐
              │ RESOLVED │
              └────┬─────┘
   engine          │
   downstream      ▼
              ┌──────────┐
              │  CLOSED  │ (terminal)
              └──────────┘
```

**Invariants:**
- `CLOSED` + `CANCELLED` = terminal, zadny reopen. Pro "reopen scenario" se **zaklada nova exception row** s `retry_reference_exception_id` pointerem na closed/cancelled puvodni.
- `OPEN` → `RESOLVED` NELZE (musi projit IN_REVIEW).
- `IN_REVIEW` → `CLOSED` NELZE (musi projit RESOLVED).
- `RESOLVED` je mezistav — engine muze trvat minuty/hodiny pred CLOSED (napr. retry queue row musi skutecne dokoncit send pro RETRY_QUEUED → APPLIED confirmation).

### 11. Sample 5 exception rows

**Sample 1: preview_render_fail**

```
exception_id:              EX-2026-04-21-00001
lead_id:                   L-00042
outreach_queue_id:         null
source_job_id:             PREVIEW-RUN-2026-04-21-014
inbound_event_id:          null
exception_type:            "preview_render_fail"
exception_priority:        3
exception_status:          "OPEN"
detected_at:               2026-04-21T14:32:00+02:00
detected_by_step:          "A-08:processPreviewQueue"
summary:                   "Preview render webhook returned HTTP 500 after 3 retries"
diagnostic_payload_json:   {
    "preview_slug": "acme-sro-abc123",
    "webhook_url": "https://render.internal/preview",
    "http_status": 500,
    "error_message": "Internal template render error: missing required key 'segment_display_name'",
    "retry_count": 3,
    "last_attempt_at": "2026-04-21T14:31:45+02:00",
    "template_type": "community-expert",
    "template_family": "community-expert"
}
cs2_run_id:                "RUN-2026-04-21-0832"
sla_target_at:             2026-04-28T14:32:00+02:00  # P3 = 5 business days
```

**Sample 2: missing_email**

```
exception_id:              EX-2026-04-21-00002
lead_id:                   L-00078
outreach_queue_id:         null
source_job_id:             INGEST-JOB-2026-04-19-003
inbound_event_id:          null
exception_type:            "missing_email"
exception_priority:        4
exception_status:          "OPEN"
detected_at:               2026-04-21T10:15:00+02:00
detected_by_step:          "A-07:AutoQualifyHook"
summary:                   "Lead qualified (ICO + segment OK) but no valid email found"
diagnostic_payload_json:   {
    "business_name": "Autoservis Novák s.r.o.",
    "ico": "12345678",
    "segment": "services-auto-repair",
    "lifecycle_state": "QUALIFIED",
    "website_url": "https://novak-autoservis.cz",
    "contact_page_checked": true,
    "email_search_attempts": [
        {"source": "website_scrape", "result": "no_email_found"},
        {"source": "orsr_registry", "result": "not_in_registry"}
    ],
    "phone": "+420 123 456 789"
}
cs2_run_id:                "RUN-2026-04-21-0615"
sla_target_at:             2026-05-05T10:15:00+02:00  # P4 = 10 business days
```

**Sample 3: ambiguous_duplicate**

```
exception_id:              EX-2026-04-21-00003
lead_id:                   L-00091  # primary candidate
outreach_queue_id:         null
source_job_id:             INGEST-JOB-2026-04-19-003
inbound_event_id:          null
exception_type:            "ambiguous_duplicate"
exception_priority:        4
exception_status:          "OPEN"
detected_at:               2026-04-21T10:20:00+02:00
detected_by_step:          "A-05:dedupeByCompanyKey"
summary:                   "Two leads match ICO 12345678 but have different cities — operator must decide merge"
diagnostic_payload_json:   {
    "primary_lead_id": "L-00091",
    "primary_data": {
        "business_name": "Autoservis Novák s.r.o.",
        "ico": "12345678",
        "city": "Praha",
        "email": "novak@autoservis.cz"
    },
    "candidate_lead_id": "L-00092",
    "candidate_data": {
        "business_name": "Autoservis Novák",
        "ico": "12345678",
        "city": "Brno",
        "email": "novak.brno@autoservis.cz"
    },
    "dedupe_confidence": 0.87,
    "dedupe_strategy_matched": ["ICO", "name_fuzzy"],
    "dedupe_strategy_failed": ["city"],
    "possible_interpretations": [
        "pobocky",
        "rozdilne firmy se shodnym ICO (data error)",
        "premenovany subjekt"
    ]
}
cs2_run_id:                "RUN-2026-04-21-0615"
sla_target_at:             2026-05-05T10:20:00+02:00
```

**Sample 4: provider_fail_after_max_retries**

```
exception_id:              EX-2026-04-21-00004
lead_id:                   L-00042
outreach_queue_id:         Q-2026-04-21-00057
source_job_id:             null
inbound_event_id:          null
exception_type:            "provider_fail_after_max_retries"
exception_priority:        2
exception_status:          "OPEN"
detected_at:               2026-04-21T12:00:05+02:00
detected_by_step:          "CS3:dead_letter_from_C-06"
summary:                   "Send FAILED — Gmail API auth error, dead-lettered after max_attempts=1"
diagnostic_payload_json:   {
    "queue_id": "Q-2026-04-21-00057",
    "recipient_email": "novak@autoservis.cz",
    "provider": "gmail",
    "send_attempt_at": "2026-04-21T12:00:03+02:00",
    "normalized_error_class": "AUTH_FAILED",
    "failure_class": "PERMANENT",
    "provider_raw_error": "401 Unauthorized: Invalid OAuth token",
    "retryable_hint": false,
    "attempts_exhausted": true,
    "attempts_count": 1,
    "related_dead_letter_id": "DL-2026-04-21-00003"
}
related_dead_letter_id:    "DL-2026-04-21-00003"
cs2_run_id:                "RUN-2026-04-21-1200"
sla_target_at:             2026-04-23T12:00:05+02:00  # P2 = 2 business days
```

**Sample 5: unclear_reply**

```
exception_id:              EX-2026-04-21-00005
lead_id:                   L-00113
outreach_queue_id:         Q-2026-04-18-00033
source_job_id:             null
inbound_event_id:          IE-2026-04-21-00007
exception_type:            "unclear_reply"
exception_priority:        2
exception_status:          "OPEN"
detected_at:               2026-04-21T08:45:00+02:00
detected_by_step:          "C-07:ingestReply"
summary:                   "Reply classified as UNCLASSIFIED by rule-based-v1 — operator must decide"
diagnostic_payload_json:   {
    "event_id": "IE-2026-04-21-00007",
    "from_email": "info@kovaciny-horacek.cz",
    "subject": "Re: Nabídka nového webu pro Kovácí Horáček s.r.o.",
    "received_at": "2026-04-21T08:42:11+02:00",
    "reply_class": "UNCLASSIFIED",
    "reply_classifier_version": "rule-based-v1",
    "excerpt_plain": "Zdravim, muzete mi poslat nejake ukazky, jak jste resili neco podobneho pro male kovarstvi?",
    "rule_match_trace": [
        {"rule": "negative_keyword", "match": false},
        {"rule": "positive_keyword", "match": false},
        {"rule": "ooo_pattern", "match": false},
        {"rule": "unsubscribe_intent", "match": false}
    ],
    "reply_needs_manual": true
}
cs2_run_id:                "RUN-2026-04-21-0845"
sla_target_at:             2026-04-23T08:45:00+02:00  # P2 = 2 business days
```

### 12. Sample resolutions

**Sample 1 resolution (preview_render_fail):**
- Operator inspektuje `diagnostic_payload_json` → vidi "missing required key 'segment_display_name'".
- Operator opravi template file + commituje / deploynutie.
- Operator decision: `retry`, note: "Template fixed — segment_display_name pridan do community-expert template".
- Engine: `next_action=CREATE_NEW_QUEUE_ROW` (preview queue), `retry_reference_queue_id=PRV-2026-04-21-00032`.
- Engine downstream: preview render uspesny → `resolution_outcome=APPLIED` (transition RESOLVED→CLOSED). Lead pokracuje do C-04 gate.

**Sample 2 resolution (missing_email):**
- Operator dohleda email rucne (web scrape, telefon) → ma novy email `jan.novak@novak-autoservis.cz`.
- Operator decision: `edit_and_continue`, edits: `{"email": "jan.novak@novak-autoservis.cz", "email_source": "manual_phone_lookup"}`, note: "Zjisteno telefonicky".
- Engine: aplikuje edits na LEADS, `next_action=RETURN_TO_C04_GATE`, `resolution_outcome=APPLIED_WITH_EDITS`.
- Engine downstream: C-04 gate re-eval → AUTO_SEND_ALLOWED → lead vklada do C-05 queue.

**Sample 3 resolution (ambiguous_duplicate):**
- Operator overi s klientem → Brno je pobocka, jedna firma, 2 emaily.
- Operator decision: `edit_and_continue`, edits: `{"merge": true, "primary": "L-00091", "candidate": "L-00092", "secondary_email": "novak.brno@autoservis.cz", "cities": ["Praha", "Brno"]}`, note: "Pobocky — merge do L-00091, Brno jako secondary adresa".
- Engine: aplikuje merge (L-00092 marked `merged_into=L-00091`), `next_action=LEAD_RE_INGEST`, `resolution_outcome=APPLIED_WITH_EDITS`.
- Engine downstream: A-05 re-dedupe → single lead L-00091. Lead pokracuje.

**Sample 4 resolution (provider_fail_after_max_retries):**
- Operator overi Gmail OAuth token → expired. Obnovi pres admin console.
- Operator decision: `retry`, note: "Gmail OAuth token obnoven, reautentifikace provedena".
- Engine: `next_action=CREATE_NEW_QUEUE_ROW` na C-05 s novym `outreach_queue_id=Q-2026-04-21-00099`, `idempotency_key` bunduje `retry_of=EX-2026-04-21-00004`, `retry_reference_queue_id=Q-2026-04-21-00099`, `resolution_outcome=RETRY_QUEUED`.
- Engine downstream: novy send uspesny → CS1 T18 `EMAIL_QUEUED → EMAIL_SENT`, exception status `CLOSED` + `resolution_outcome=APPLIED` (bumped z RETRY_QUEUED po success).

**Sample 5 resolution (unclear_reply):**
- Operator cte excerpt → "Zdravim, muzete mi poslat nejake ukazky, jak jste resili neco podobneho pro male kovarstvi?" — to je **positive zajemec s otazkou**.
- Operator decision: `approve` s classification guidance v note, note: "Classify as POSITIVE+QUESTION. Chce ukazky. Vyrizu rucne mimo automatizaci — odpovedel jsem s case studies".
- Engine: `next_action=RESUME_C08_SEQUENCE` (classification = POSITIVE → C-08 stops follow-up via Tier 1), `resolution_outcome=APPLIED`.
- Side effect: operator rucne odpovidat v Gmail threadu (mimo engine — manual thread continuation je OK per C-08 sekce 6).
- CS1 T20 `EMAIL_SENT → REPLIED` triggered. Sekvence stop.

### 13. Flow re-entry / continuation rules

**Komprehensive `next_action` table:**

| `next_action` | Kde flow pokracuje | Kdo to zpracuje | Kdy |
|---------------|--------------------|------------------|-----|
| `RETURN_TO_C04_GATE` | C-04 evaluator | C-04 gate step (next CS2 run) | `missing_email` edit_and_continue; `sendability_manual_review` approve. |
| `CREATE_NEW_QUEUE_ROW` | C-05 `_asw_outbound_queue` insert | C-05 producer / retry engine | `preview_render_fail` retry; `broken_personalization` retry / edit_and_continue; `provider_fail_after_max_retries` retry; `sendability_manual_review` edit_and_continue. |
| `RESUME_C08_SEQUENCE` | C-08 follow-up engine re-evaluation | C-08 engine next run | `unclear_reply` approve (classification done); `unclear_reply` reject (noise); occasional `broken_personalization` approve (fallback OK). |
| `UPDATE_CS1_LIFECYCLE` | CS1 lifecycle state transition | LEADS direct write | `compliance_hard_stop` reject (set unsubscribed/suppressed); `missing_email` reject (set DISQUALIFIED); `provider_fail_after_max_retries` reject (set bounced). |
| `LEAD_RE_INGEST` | A-02/A-03/A-05 pipeline | Ingest engine next run | `ambiguous_duplicate` edit_and_continue (merge); `normalization_error` edit_and_continue/retry. |
| `TERMINAL_STOP` | Nikam — terminal | — | Kazdy `reject` outcome + `followup_stale_review` reject + `ambiguous_duplicate` reject (candidate lead). |

**Re-entry rules per exception type:**

| `exception_type` | `approve` next_action | `reject` next_action | `retry` next_action | `edit_and_continue` next_action |
|------------------|------------------------|------------------------|---------------------|---------------------------------|
| `preview_render_fail` | — | `TERMINAL_STOP` | `CREATE_NEW_QUEUE_ROW` (preview) | — |
| `missing_email` | — | `UPDATE_CS1_LIFECYCLE` + `TERMINAL_STOP` | — | `RETURN_TO_C04_GATE` |
| `ambiguous_duplicate` | — | `TERMINAL_STOP` (candidate lead) | — | `LEAD_RE_INGEST` |
| `broken_personalization` | `RESUME_C08_SEQUENCE` (fallback OK) | `TERMINAL_STOP` | `CREATE_NEW_QUEUE_ROW` (preview) | `CREATE_NEW_QUEUE_ROW` (preview) |
| `provider_fail_after_max_retries` | — | `UPDATE_CS1_LIFECYCLE` + `TERMINAL_STOP` | `CREATE_NEW_QUEUE_ROW` (C-05) | — |
| `unclear_reply` | `RESUME_C08_SEQUENCE` (classify) | `RESUME_C08_SEQUENCE` (noise) | — | — |
| `sendability_manual_review` | `RETURN_TO_C04_GATE` (override) | `UPDATE_CS1_LIFECYCLE` + `TERMINAL_STOP` | — | `CREATE_NEW_QUEUE_ROW` (C-05) |
| `compliance_hard_stop` | — | `UPDATE_CS1_LIFECYCLE` + `TERMINAL_STOP` | — | — |
| `normalization_error` | — | `TERMINAL_STOP` | `LEAD_RE_INGEST` | `LEAD_RE_INGEST` |
| `followup_stale_review` | — | `TERMINAL_STOP` (sequence) | — | — |

**Flow re-entry invariants:**

1. **Immutable audit trail:** `CLOSED` exception NIKDY nepreklopi se do `OPEN`. Pro "re-open" se zaklada nova exception s `retry_reference_exception_id` na puvodni.
2. **Chain-of-responsibility:** Pokud `CREATE_NEW_QUEUE_ROW` / `LEAD_RE_INGEST` / `RETURN_TO_C04_GATE` downstream fail, vznikne **nova** exception (ne update original). Original zustava `resolution_outcome=RETRY_FAILED_AGAIN` (updated po downstream fail signal).
3. **Terminal consistency:** `TERMINAL_STOP` musi byt zpravnym propsanim do CS1 / C-08 terminal states (ne orphan). `compliance_hard_stop reject` vzdy vyzaduje `UPDATE_CS1_LIFECYCLE` co-action.
4. **Override transparency:** `sendability_manual_review approve` triggering `RETURN_TO_C04_GATE` **musí** pridavat override flag (`MANUAL_REVIEW_OVERRIDE=TRUE`) do gate context, aby gate nevratil zase `MANUAL_REVIEW_REQUIRED` v infinite loop.
5. **Retry idempotency:** `retry` outcome vytvari novy queue row s idempotency_key rozsirenym o `retry_of=exception_id`. C-05 invariant unique idempotency_key prevence dvojite retry.

### 14. Auditability / observability

**Dohledatelne signaly:**

| Otazka operatora | Zdroj odpovedi |
|------------------|----------------|
| "Existuje exception pro tento lead?" | `_asw_exceptions WHERE lead_id=X`. Vrati 0..N rows (chronologicky). |
| "Jaky je aktualni status exceptionu X?" | `_asw_exceptions WHERE exception_id=X` → `exception_status`. |
| "Kdo exception X rozhodl?" | `_asw_exceptions.resolved_by` + `_asw_logs WHERE event="exception_resolved" AND exception_id=X`. |
| "Proc tak rozhodl?" | `_asw_exceptions.operator_note` + `operator_edited_fields_json`. |
| "Co se stalo dal po resolve?" | `_asw_exceptions.next_action` + `resolution_outcome` + `retry_reference_queue_id` / `retry_reference_exception_id`. |
| "Je to retry chain? Jak daleko?" | Traversal `retry_reference_exception_id` chain → ukaze, kolikrat se stejny problem opakoval. |
| "Vysi co-exceptions pro lead?" | `_asw_exceptions WHERE lead_id=X AND exception_status IN ('OPEN', 'IN_REVIEW')`. |
| "Kolik P1 exceptions cekaji?" | `_asw_exceptions WHERE exception_priority=1 AND exception_status IN ('OPEN', 'IN_REVIEW')`. |
| "Ktere exceptions prosly SLA?" | `_asw_exceptions WHERE sla_target_at < now() AND exception_status IN ('OPEN', 'IN_REVIEW')`. |
| "Detection lineage: jaky run to vytvoril?" | `_asw_exceptions.cs2_run_id` + `detected_by_step` + `source_job_id`. |

**`_asw_logs` events pro C-09 (PROPOSED event types):**

| Event | Trigger | Key fields |
|-------|---------|------------|
| `exception_created` | Detection step insertuje novou row. | `exception_id`, `lead_id`, `exception_type`, `exception_priority`, `detected_by_step`, `cs2_run_id`. |
| `exception_claimed` | Operator OPEN → IN_REVIEW. | `exception_id`, `operator_id`, `claimed_at`. |
| `exception_released` | Operator IN_REVIEW → OPEN (zruseni claim). | `exception_id`, `operator_id`, `released_at`, `reason_text` (volitelne). |
| `exception_resolved` | Operator IN_REVIEW → RESOLVED. | `exception_id`, `operator_id`, `decision`, `operator_note_excerpt`, `resolved_at`, `next_action`. |
| `exception_flow_reentry` | Engine spousti next_action handler. | `exception_id`, `next_action`, `handler_step`, `started_at`. |
| `exception_closed` | Downstream determined → CLOSED. | `exception_id`, `resolution_outcome`, `closed_at`, `retry_reference_queue_id` (nullable). |
| `exception_cancelled` | Auto / manual cancel. | `exception_id`, `reason`, `cancelled_by` (engine_auto / operator_id). |
| `exception_priority_bumped` | Auto SLA-bump. | `exception_id`, `old_priority`, `new_priority`, `reason`. |
| `exception_retry_chain_broken` | Retry chain reached max_retry_depth (PROPOSED 3). | `original_exception_id`, `chain_length`, `terminal_reason`. |

**Cross-ref graph:**

```
LEADS.lead_id ─┬──► _asw_exceptions.lead_id (0..N exceptions, current + historical)
               │         ├──► outreach_queue_id → _asw_outbound_queue (source context)
               │         ├──► inbound_event_id → _asw_inbound_events (C-07 source)
               │         ├──► source_job_id → _raw_import / FU-RUN / PREVIEW-RUN
               │         ├──► cs2_run_id → _asw_logs (detection run)
               │         ├──► related_dead_letter_id → _asw_dead_letters (CS3 source)
               │         ├──► retry_reference_queue_id → _asw_outbound_queue (post-retry)
               │         └──► retry_reference_exception_id → _asw_exceptions (chain)
               ├──► _asw_outbound_queue.lead_id
               ├──► _asw_inbound_events.lead_id
               ├──► _asw_logs.lead_id (all event types)
               └──► _asw_dead_letters.lead_id
```

**Observability bez B6 UI:**
- `_asw_exceptions` sheet s filter by priority / status / type.
- LEADS sheet ma **PROPOSED** backref sloupec `open_exceptions_count` (count exceptions IN {OPEN, IN_REVIEW}). Operator vidi per-lead exception density.
- `_asw_logs` filter by `event LIKE 'exception_%'`.
- B6 UI (budouci) agreguje vse do priority dashboardu + per-lead timeline.

**Anti-loss invariants (problematicke leady NESMI zmizet):**
1. Kazdy auto-skip / auto-fail MA exception row **nebo** jasne diagnosticke pole na LEADS (jako `preview_error`). Nikdy oba null pro not-success lead.
2. `CLOSED_STALE` auto-downgrade pro P4 po 14 dnech zachovava row (ne mazani). Pouze exception_status se meni.
3. Exception sheet je **append-only na insert + update-only na resolve-fields**. Row se nemaze, neoverovani.
4. Orphan prevention: pokud lead je smazan z LEADS (vzacne, compliance scenar), associated exceptions se **NEMAZOU** — zustavaji jako audit trail. FK constraint je soft (lead_id muze odkazovat neexistujici lead → historical audit).

### 15. Idempotency / dedupe rules

**Prevence duplicitnich exception rows:**

**Idempotency key pattern (PROPOSED FOR C-09):**

```
exception_dedup_key = SHA256(lead_id + exception_type + context_hash)
```

kde `context_hash` je deterministicky hash z `diagnostic_payload_json` core fields per type:
- `preview_render_fail`: `SHA256(preview_slug + template_type)`
- `missing_email`: `SHA256(lead_id + "missing_email")` (jen lead identity)
- `ambiguous_duplicate`: `SHA256(primary_lead_id + candidate_lead_id)` (alphabeticky sort)
- `broken_personalization`: `SHA256(lead_id + template_type + missing_keys_joined)`
- `provider_fail_after_max_retries`: `SHA256(outreach_queue_id + failure_class)`
- `unclear_reply`: `SHA256(inbound_event_id)` (jen event identity)
- `sendability_manual_review`: `SHA256(lead_id + reason_codes_joined)`
- `compliance_hard_stop`: `SHA256(lead_id + compliance_code)`
- `normalization_error`: `SHA256(raw_row_id)` (jen raw identity)
- `followup_stale_review`: `SHA256(lead_id + sequence_root_queue_id)`

**Dedupe logic (pri detection insert):**

```
fn detect_exception(lead_id, type, diagnostic):
    key = compute_dedup_key(lead_id, type, diagnostic)
    existing = find_by_dedup_key_and_open_status(key)

    if existing:
        # Same problem, same context — do NOT create duplicate
        # Update diagnostic_payload_json s append event (audit)
        existing.diagnostic_payload_json.append_occurrence(now(), new_diagnostic)
        log(_asw_logs, "exception_re_detected", existing.exception_id)
        return existing

    if find_by_dedup_key_and_closed_status(key) AND (now - closed.resolved_at) < 7_days:
        # Recently closed same problem — create NEW exception s retry_reference_exception_id pointer
        new_row = create_row(...)
        new_row.retry_reference_exception_id = recent_closed.exception_id
        log(_asw_logs, "exception_re_created_after_closed")
        return new_row

    # Truly new
    return create_row(...)
```

**Reopen rules:**

- **Reopen existing OPEN/IN_REVIEW:** Same key + still open → append diagnostic, ne nova row.
- **Create new after CLOSED recently (< 7 dni):** Same key + closed recently → nova row s `retry_reference_exception_id` (chain).
- **Create new after CLOSED old (> 7 dni):** Same key + closed dlouho → nova row bez chain reference (treat as fresh problem).
- **Create new after CANCELLED:** Same key + cancelled → nova row (cancelled = problem did not really occur, treat as fresh).

**Retry chain depth limit (PROPOSED):**
- Max retry chain depth = 3. Po 3. exception s `retry_reference_exception_id` chain → promote na P1 manual review + log `exception_retry_chain_broken`. Prevence nekonecne retry loop pro systemove chyby.

**CS3 alignment:**
- Exception dedup key je **pre-hash** (core identity fields) per CS3 S1-S12 "deterministic-first-then-hash" pattern (stejne jako C-05 idempotency + C-07 ingest_event_id + C-08 followup key).
- Exception engine run respektuje CS3 `LockService.getScriptLock()` pattern (stejne jako ingest worker + queue worker + followup engine).
- Failure_class pro exception engine errors: `EXCEPTION_INSERT_FAIL`→TRANSIENT (retry), `DEDUP_KEY_CONFLICT`→TRANSIENT (race, re-read), `LEAD_NOT_FOUND`→PERMANENT (orphan exception).

### 16. Human-in-the-loop boundaries

**Co smi rozhodnout clovek:**

| Rozhodnuti | Clovek smi | Duvod |
|------------|-----------|-------|
| `approve` send po review | ANO | Content quality judgment je operational. |
| `reject` missing email lead | ANO | Data-quality judgment. |
| `reject` ambiguous duplicate candidate | ANO | Dedupe rozhodnutí, business judgment. |
| `approve` unclear reply jako positive | ANO | Reply intent reading je operational. |
| `edit_and_continue` s data fix | ANO | Data curation je operator core task. |
| `retry` preview fail | ANO | Operator vidi, jestli problem je vyresany. |
| `retry` provider fail | ANO | Operator vidi, ze provider je nyni up. |
| Priority bump (P3 → P2) | ANO | Operator vidi urgence. |
| Reclassify reply (unclassified → positive/negative/question) | ANO | Subject matter expertise. |
| Merge duplicate leady | ANO (s data) | Business merge decision. |

**Co clovek NESMI prepsat:**

| Rozhodnuti | Clovek nesmi | Duvod |
|------------|--------------|-------|
| `approve` na `compliance_hard_stop` | NE | Compliance hard-stop je legal binding. Operator muze pouze `reject`. Validace. |
| Overturn `unsubscribed=TRUE` flag bez explicit re-consent event | NE | GDPR / CAN-SPAM binding. Separate re-consent workflow, ne exception queue. |
| Manual bypass C-04 gate s `SEND_BLOCKED` (B7/B8) | NE | Hard-stop kategorie — exception queue to zaznamena jako `compliance_hard_stop`, ale operator nemuze unblock. |
| Edit LEADS terminal states (DISQUALIFIED, UNSUBSCRIBED, BOUNCED) primo v LEADS mimo exception queue | Mimo SPEC scope, ale strongly discouraged | Audit trail porusen. Exception queue je sanctioned channel pro state changes. |
| Edit `_asw_inbound_events` (append-only) | NE | Kompromituje audit. Inbound event je fact. Reclassification je edit na LEADS / exception, ne na event. |
| `retry` provider send po 3x consecutive fail (chain depth limit) | NE automatic | Dalsi retry vyzaduje P1 review + explicit chain break. Ochrana proti loop. |
| Edit `resolved_at` / `resolved_by` / `resolution_outcome` po CLOSED | NE | Immutable audit. |
| Delete exception row | NE | Append-only invariant. |

**Compliance-hard-stop vs operational-judgment kategorie:**

| Kategorie | Exception types | Operator autority |
|-----------|-----------------|-------------------|
| **Compliance-hard-stop** (operator = bezmocny reject-only) | `compliance_hard_stop`, C-04 B7/B8 | Pouze `reject` + note. Zadny approve/retry/edit. Validace enforced v resolution flow. |
| **Technical-judgment** (operator = expert fix) | `preview_render_fail`, `provider_fail_after_max_retries`, `normalization_error` | `reject` / `retry` (technical fix prokazanely). |
| **Content-judgment** (operator = reviewer) | `sendability_manual_review`, `broken_personalization` | `approve` / `reject` / `retry` / `edit_and_continue` (full range). |
| **Data-judgment** (operator = curator) | `missing_email`, `ambiguous_duplicate`, `normalization_error` | `reject` / `edit_and_continue` (data fix). |
| **Intent-judgment** (operator = classifier) | `unclear_reply` | `approve` (classify) / `reject` (noise). |
| **Cleanup** (operator = maintenance) | `followup_stale_review` | Typicky `reject` (terminal cleanup). |

### 17. Boundary rules / handoff na dalsi tasky

| Task | Jak C-09 konzumuje | Jak C-09 prispiva |
|------|---------------------|-------------------|
| **C-04 Sendability gate** | `MANUAL_REVIEW_REQUIRED` outcome → C-09 exception creation (`sendability_manual_review`). `SEND_BLOCKED` B7/B8 → `compliance_hard_stop`. | PROPOSED C-04 `MANUAL_REVIEW_OVERRIDE` context parameter (approve override). |
| **C-05 Outbound queue** | `FAILED` status + fail fields → CS3 dead-letter → C-09 exception (`provider_fail_after_max_retries`). | Retry outcome → insert novy queue row (C-09 je producer), idempotency_key rozsiren o `retry_of=exception_id`. |
| **C-06 Provider abstraction** | `NormalizedSendErrorClass` + `failure_class=PERMANENT/TRANSIENT` exhausted → CS3 dead-letter → C-09. | Zadna mutace C-06 interface. |
| **C-07 Inbound event ingest** | `reply_class=UNCLASSIFIED` + `reply_needs_manual=TRUE` → C-09 exception (`unclear_reply`). `unknown_inbound` event → exception. | Zadna mutace C-07 schema. Operator reclassification z exception resolve aktualizuje LEADS reply classification. |
| **C-08 Follow-up engine** | `REVIEW_REQUIRED` decision outcome → C-09 exception (`sendability_manual_review` nebo `unclear_reply` dle duvodu). `followup_stale_review_abandoned` → C-09 exception (`followup_stale_review`). | Resolution `approve` / `edit_and_continue` → C-08 engine resumes sequence (next_action=`RESUME_C08_SEQUENCE`). |
| **CS3 Reliability (narrowing z C-03)** | CS3 `_asw_dead_letters` je **upstream** pro `provider_fail_after_max_retries`. C-09 rozsiruje CS3 audit trail human-facing vrstvou (operator resolution nad dead-letter rows). | `related_dead_letter_id` FK zachovava cross-ref. Zadna mutace CS3 schema. |
| **CS1 Lead lifecycle** | Exception resolution muze triggerovat CS1 transition (T14 DISQUALIFIED, T21 BOUNCED, T22 UNSUBSCRIBED) pres `UPDATE_CS1_LIFECYCLE` next_action. | Zadny novy canonical CS1 state. |
| **CS2 Orchestrator** | C-09 detection engine je **novy CS2 step** (reactive, triggered z existujicich steps pri fail). Resolution flow re-entry je orchestrator-driven (next CS2 run pro downstream step). | PROPOSED novy CS2 step: `exception_detector` (hook do existing steps) + `exception_resolution_dispatcher`. |
| **A-02/A-03/A-05 Ingest pipeline** | Normalization error / dedupe ambiguity → C-09 exception. | Resolution retry / edit_and_continue → LEAD_RE_INGEST triggers A-02 downstream. |
| **A-07/A-08 Qualify + Preview** | Missing email / preview render fail → C-09 exception. | Resolution retry / edit_and_continue → CREATE_NEW_QUEUE_ROW for preview re-render. |
| **B6 Operator review UI** (budouci) | Zadna konzumace z SPEC strany. | Definuje read/write contract: `_asw_exceptions` sheet schema + resolution flow state machine. |
| **Implementacni task C-09 runtime** | Tato SPEC je autoritativni vstup. | Materializuje `_asw_exceptions` sheet creation + `detectException()` helper + `resolveException()` dispatcher + 9 `_asw_logs` event types + PROPOSED enumy do `Config.gs` + SLA auto-bump cron. |
| **Future C-10 (suppression list aggregation)** | C-09 audit trail pro `compliance_hard_stop` poskytuje source data pro centralizovany suppression list. | Cross-ref: exception closure s `compliance_hard_stop` reject + `unsubscribed=TRUE` triggers suppression list insert. |

### 18. Non-goals (explicit)

- Neimplementuje runtime review worker / cron / scheduler.
- Neimplementuje frontend UI (B6).
- Neimplementuje mailbox sync runtime (C-07 runtime task).
- Neimplementuje provider webhook runtime (C-07 runtime task).
- Neimplementuje queue runtime (C-05 runtime task).
- Neimplementuje AI-based auto-triage / priority prediction (v2.0).
- Nezapisuje PROPOSED enumy / fields do `Config.gs` (implementacni task).
- Nepridava nove canonical CS1 states.
- Neresi suppression list centralization (C-10 future task).
- Neresi per-operator SLA / workload balancing (operations concern).
- Neresi multi-tenant exception routing (single-tenant v1.0).
- Neresi notification system (email alerts, Slack integration) — budouci task.
- Neresi exception archive / retention policy detail — dokumentovano jen principle (append-only, no delete).
- Neimplementuje C-09 runtime ani `detectException()` hooks v A-*, B-*, C-04/C-05/C-06/C-07/C-08 steps.

### 19. Acceptance checklist

- [x] Exception typy pokryvaji vsechny known fail scenare (sekce 3: 10 typu vc. 6 kanonickych z user briefu + 4 rozsireni grounded v repu).
- [x] Priorita urcuje poradi reseni (sekce 4: 4 tiers P1-P4 + sort order + SLA targets + auto-bump rules).
- [x] Je jasne, co jde do manual review (sekce 5: 4-cestny routing table s transient/permanent/classifier-status rozliseni + invariant).
- [x] Minimalni review rozhrani je jednoznacne (sekce 7: sheet-row-based read-only/editable/derived fields + on-edit trigger).
- [x] Resolution outcomes jsou jednoznacne (sekce 8: 4 outcomes s kompletnim kontraktem + compatibility matrix).
- [x] Po rozhodnuti flow pokracuje nebo konci deterministicky (sekce 9 resolution flow pseudocode + sekce 13 flow re-entry table + 5 invariants).
- [x] Sample rows pokryvaji hlavni exception typy (sekce 11: 5 samplu s realistickym diagnostic_payload).
- [x] Sample resolutions (sekce 12) ukazuji full operator workflow.
- [x] Problematicke leady nejsou ztracene (sekce 14 anti-loss invariants + cross-ref graph + observability bez B6).
- [x] Clovek vi, co ma udelat (sekce 7 minimal interface + sekce 16 human-in-the-loop boundaries + sekce 12 sample resolutions).
- [x] Dokument jde primo pouzit jako source-of-truth pro budouci implementaci.
- [x] Exception vs lifecycle state vs queue status vs review row vs operator decision jsou tvrde oddelene (sekce 3 taxonomy + sekce 10 status model + sekce 13 re-entry rules + sekce 6 schema clearly separates `exception_type` / `exception_status` / `operator_decision` / `resolution_outcome`).
- [x] Idempotency + dedupe (sekce 15 dedup key pattern + reopen rules + CS3 alignment).
- [x] Auditabilita (sekce 14 9 `_asw_logs` event types + cross-ref graph).
- [x] Compliance hard-stop vs operational judgment oddelene (sekce 16).
- [x] Handoff table pokryva C-04/C-05/C-06/C-07/C-08/CS1/CS2/CS3/A-02-A-08/B6/implementacni task/future C-10 (sekce 17, 12 radku).
- [x] SPEC-only — zadne runtime zmeny, zadne Config.gs zapisy (sekce 18 explicit).
- [x] B6 NENI blocker (sekce 2 + 7 explicit).
- [x] Dependency narrowing C-03 → CS3 explicitne dokumentovan (uvod sekce + task record).

### 20. PROPOSED vs INFERRED vs VERIFIED label summary

**VERIFIED IN REPO (reuse existing):**
- `_asw_dead_letters` CS3 sheet (lineage source pro `provider_fail_after_max_retries`).
- `_asw_inbound_events` C-07 merged PR #30 (source pro `unclear_reply`).
- `_asw_outbound_queue` C-05 merged PR #28 (FK cross-ref).
- `_asw_logs` CS2 run history (event log substrate).
- CS1 canonical terminals DISQUALIFIED (#14), REPLIED (#15), BOUNCED (#16), UNSUBSCRIBED (#17) + T20/T21/T22 (docs/21).
- CS1 `REVIEW_REQUIRED` non-terminal state (#18) — reuse pro exception-induced review.
- C-04 gate outcomes `AUTO_SEND_ALLOWED` / `MANUAL_REVIEW_REQUIRED` / `SEND_BLOCKED` + reason codes B1-B21.
- C-06 `NormalizedSendErrorClass` + `failure_class` mapping (source pro `provider_fail_after_max_retries`).
- C-07 `reply_class=UNCLASSIFIED` + `reply_needs_manual=TRUE` (source pro `unclear_reply`).
- C-08 `followup_review_required` + `followup_stale_review_abandoned` (source pro `followup_stale_review`).
- CS3 `failure_class` enum + `HUMAN_REVIEW` class + dead-letter pattern.
- Existing runtime review signals: `preview_needs_review`, `preview_error` (A-08 PreviewPipeline.gs), `email_reply_type=UNCLASSIFIED` (MailboxSync.gs).

**INFERRED FROM EXISTING SYSTEM:**
- 10-type taxonomy rozsirena z 6 user-brief typu + 4 odvozenych (sendability_manual_review z C-04 spec; compliance_hard_stop z C-04 B7/B8; normalization_error z A-02/A-03 spec; followup_stale_review z C-08 spec).
- SLA targets P1=24h, P2=2d, P3=5d, P4=10d (business days) — inferred z B2B outreach standards.
- Priority tiers (compliance > delivery > content > data-quality) — inferred z risk management.
- Resolution outcome compatibility matrix — inferred z exception type semantics.

**PROPOSED FOR C-09 (new, implementation task will materialize):**
- `_asw_exceptions` sheet (24 fields — sekce 6).
- Exception type enum (10 values).
- `exception_priority` enum (1-4).
- `exception_status` enum (5 values: OPEN / IN_REVIEW / RESOLVED / CLOSED / CANCELLED).
- `operator_decision` enum (4 values: approve / reject / retry / edit_and_continue).
- `resolution_outcome` enum (6 values: APPLIED / APPLIED_WITH_EDITS / REJECTED / RETRY_QUEUED / RETRY_FAILED_AGAIN / PENDING_DOWNSTREAM).
- `next_action` enum (6 values: RETURN_TO_C04_GATE / CREATE_NEW_QUEUE_ROW / RESUME_C08_SEQUENCE / UPDATE_CS1_LIFECYCLE / LEAD_RE_INGEST / TERMINAL_STOP).
- Idempotency `exception_dedup_key` pattern per type (sekce 15).
- `_asw_logs` event types (9): `exception_created`, `exception_claimed`, `exception_released`, `exception_resolved`, `exception_flow_reentry`, `exception_closed`, `exception_cancelled`, `exception_priority_bumped`, `exception_retry_chain_broken`.
- C-04 `MANUAL_REVIEW_OVERRIDE` context parameter (approve override).
- C-05 idempotency_key extension s `retry_of=exception_id` suffix (pro retry insert).
- LEADS backref column `open_exceptions_count` (PROPOSED observability).
- SLA auto-bump rules + retry chain depth limit=3.
- Stale abandonment threshold P4 = 14 dni → `CLOSED_STALE` transition.
- Compatibility matrix validation logic (enforced at resolution time).
- CS2 new steps: `exception_detector` (hook) + `exception_resolution_dispatcher`.
- CS3 `failure_class` mapping for engine errors: `EXCEPTION_INSERT_FAIL`→TRANSIENT, `DEDUP_KEY_CONFLICT`→TRANSIENT, `LEAD_NOT_FOUND`→PERMANENT.
- Script Properties: `EXCEPTION_SLA_P1_HOURS=24`, `EXCEPTION_SLA_P2_BUSINESS_DAYS=2`, `EXCEPTION_SLA_P3_BUSINESS_DAYS=5`, `EXCEPTION_SLA_P4_BUSINESS_DAYS=10`, `EXCEPTION_STALE_ABANDON_DAYS=14`, `EXCEPTION_MAX_RETRY_CHAIN_DEPTH=3`, `EXCEPTION_RECENT_CLOSED_WINDOW_DAYS=7`.
