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
