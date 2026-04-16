# Change Log — Autosmartweby

> **Auto-generated** from task records (`docs/30-task-records/`).
> Regenerate: `node scripts/docs/build-changelog.mjs`
> Do NOT edit manually — changes will be overwritten.

---

## 2026-04-17

### [A/A6] Auto web check hook — DONE
- **Scope:** Automatic web check hook that runs Serper-based website discovery on new LEADS rows without manual menu interaction. Reuses existing `findWebsiteForLead_()` from LegacyWebCheck.gs.

What this task delivers:
- `AutoWebCheckHook.gs` — GAS module with `runAutoWebCheck_(opts)`, `autoWebCheckTrigger()`, `runWebCheckForImportedLeads_(leadIds)`
- **Automatic trigger installation** via `installProjectTriggers()` in PreviewPipeline.gs — trigger is auto-installed alongside processPreviewQueue, onOpen, onContactSheetEdit (no manual ScriptApp.newTrigger needed)
- **Ingest pipeline wiring** — `processRawImportBatch_()` in RawImportWriter.gs calls `runWebCheckForImportedLeads_()` after importing leads (A-06 ← A-10 integration)
- Filtering logic: skip leads with existing website_url, skip already-checked leads (website_checked_at), skip empty business_name
- Batch size guard (default 20, configurable)
- Per-row error isolation (one Serper failure does not abort batch)
- LockService guard (prevents concurrent runs)
- Double-run prevention via website_checked_at column
- lead_id targeting mode for post-import hook integration
- DRY_RUN support
- Local proof harness with 9 evidence scenarios, 31 assertions, all passing

What this task does NOT deliver:
- Live Serper API verification (requires API key in Script Properties — not available locally)
- Google Sheets runtime verification (requires clasp push after merge)
- LEADS append in processRawImportBatch_ is still TODO (A-10 gap) — the web check hook IS wired, but the import step that feeds it lead_ids does not yet write to LEADS

**Status rationale:** done — code merged to main (PR #16), deployed to TEST GAS project, verified via controlled TEST runtime delta proof on 3 LEADS rows (2026-04-17). Diagnostic function `diagA06LiveDelta` exercised `runAutoWebCheckInner_` with `dryRun: false`, producing row-level BEFORE/AFTER evidence: 1 FOUND (URL + confidence + note + timestamp written), 2 NOT_FOUND (note + timestamp written). Post-import hook path wired and code-complete (end-to-end blocked on A-10 LEADS append TODO — separate task).
- **Owner:** Stream A
- **Code:** apps-script/AutoWebCheckHook.gs (new), apps-script/PreviewPipeline.gs (edit), apps-script/RawImportWriter.gs (edit), scripts/test-a06-webcheck-hook.mjs (new), docs/30-task-records/A6.md (new), docs/20-current-state.md (edit), docs/24-automation-workflows.md (edit)

## 2026-04-16

### [A/A10] Ingest runtime bridge — staging writer + normalizer + dedupe handoff — PARTIAL
- **Scope:** A-02/A-03/A-05 runtime bridge: implements the GAS functions for _raw_import staging, normalization, and dedupe handoff. Locally verified; not yet deployed to Google Sheets.

What this task delivers:
- `_raw_import` staging sheet creation and row writing functions (A-02 runtime)
- `normalizeRawImportRow_()` per A-03 contract (field cleaning, reject policy)
- Pipeline orchestrator: raw → normalize → dedupe → import/reject
- 6 new `source_*` columns added to EXTENSION_COLUMNS per A-03 contract
- Local proof harness demonstrating complete ingest lifecycle

What this task does NOT deliver:
- Live Google Sheets deployment (requires clasp push from main — blocked until merge)
- LEADS row append (marked TODO in processRawImportBatch_ — the import_writer step updates _raw_import status but does not yet write to LEADS sheet)
- Google Sheets runtime verification (ensureRawImportSheet_, writeRawImportRows_, updateRawImportRow_ are untested against real Sheets API)
- Review UI for pending_review rows
- Fuzzy matching

**Status rationale:** partial because the GAS code is written and logic is locally proven, but Sheets runtime (create sheet, write rows, update status in real spreadsheet) and LEADS append are not verified. This is a runtime bridge, not a complete ingest pipeline.
- **Owner:** Stream A
- **Code:** apps-script/Normalizer.gs (new), apps-script/RawImportWriter.gs (new), apps-script/Config.gs (edit), scripts/test-ingest-runtime.mjs (new), scripts/test-wave4-pipeline.mjs (new), docs/30-task-records/A10.md (new)

### [A/A5] Dedupe & company_key matching — DONE
- **Scope:** Formalizace a rozšíření existující dedupe logiky v Apps Script. Cílem je:
- deterministický company_key algoritmus se strict IČO validací (8 číslic)
- rozlišení HARD_DUPLICATE / SOFT_DUPLICATE / REVIEW / NEW_LEAD
- decision_reason audit trail pro každé rozhodnutí
- blocked domain check v company_key computation
- povinné city pro T4 (name+city) — eliminace name-only false positives
- izolovaný dedupe engine připravený na _raw_import integraci
- synthetic batch test (50 záznamů) s vyhodnocením

Scope explicitně NEOBSAHUJE:
- runtime _raw_import sheet (ten dosud neexistuje v runtime kódu)
- review UI
- fuzzy matching
- IČO checksum mod 11 (připraveno jako poznámka, ne blocker)
- **Owner:** Stream A
- **Code:** apps-script/DedupeEngine.gs (new), apps-script/Helpers.gs (edit), apps-script/PreviewPipeline.gs (edit), apps-script/Config.gs (edit), docs/contracts/dedupe-decision.md (new), docs/23-data-model.md (edit), docs/24-automation-workflows.md (edit), docs/30-task-records/A5.md (new)

## 2026-04-11

### [A/A4] firmy.cz scraper — 1 portal runtime — DONE
- **Scope:** Implementace scraper runtime pro **jeden portál (firmy.cz)**. Pro 1 `ScrapingJobInput` (A-01)
vrací pole `RawImportRow` objektů (A-02) s `raw_payload_json` ve tvaru očekávaném A-03
normalizačním kontraktem. Per-record try/catch zajišťuje, že chyba 1 záznamu neshodí
celý job. Pilot pokrývá listing fetch → detail fetch → structured-data extraction →
raw row assembly → summary metrics. Zápis do Google Sheets `_raw_import` je explicitně
mimo scope (downstream krok).
- **Owner:** Stream A
- **Code:** scripts/scraper/firmy-cz.mjs (new), scripts/scraper/lib/job-id.mjs (new), scripts/scraper/lib/raw-row.mjs (new), scripts/scraper/lib/html-extract.mjs (new), scripts/scraper/lib/firmy-cz-parser.mjs (new), scripts/scraper/lib/fetch-polite.mjs (new), scripts/scraper/README.md (new), scripts/scraper/samples/job.sample.json (new), scripts/scraper/samples/fixtures/firmy-cz-listing.html (new), scripts/scraper/samples/fixtures/firmy-cz-detail-01-novak.html (new), scripts/scraper/samples/fixtures/firmy-cz-detail-02-svoboda.html (new), scripts/scraper/samples/fixtures/firmy-cz-detail-03-dvorak.html (new), scripts/scraper/samples/fixtures/firmy-cz-detail-04-horak.html (new), scripts/scraper/samples/fixtures/firmy-cz-detail-05-prochazka.html (new), scripts/scraper/samples/fixtures/firmy-cz-detail-06-kamarad.html (new), scripts/scraper/samples/fixtures/firmy-cz-detail-07-zeleny.html (new), scripts/scraper/samples/fixtures/firmy-cz-detail-08-broken.html (new), scripts/scraper/samples/output.sample.json (new)
- **Docs:** docs/20-current-state.md, docs/23-data-model.md, docs/24-automation-workflows.md, docs/30-task-records/A4.md

## 2026-04-08

### [B/B2] Preview renderer na sample briefu — DONE
- **Scope:** MVP preview renderer nad B-01 contractem. Vykresli route `/preview/[slug]`, ktera nacte hardcoded sample brief a vyrenderuje landing page pro remeslnika. Pouziva `PreviewBrief` a `SectionId` z B-01 bez redefinice.

### Route intent vs MVP implementace

- **Cilovy intent:** `/[slug]`
- **B-02 MVP implementace:** `/preview/[slug]`
- **Duvod:** Docasna implementacni ochrana. Root `[slug]` by kolidoval s existujicimi CRM routes (`/dashboard`, `/leads`, atd.) v soucasne single-app architekture. Prefix `/preview/` umoznuje bezpecny middleware bypass, AppShell bypass a izolaci preview layoutu. Toto neni finalni produktove rozhodnuti.
- **Owner:** —
- **Code:** crm-frontend/src/middleware.ts (modified), crm-frontend/src/components/layout/app-shell.tsx (modified), crm-frontend/src/app/preview/layout.tsx (new), crm-frontend/src/app/preview/[slug]/page.tsx (new), crm-frontend/src/app/preview/[slug]/not-found.tsx (new), crm-frontend/src/lib/mock/sample-brief-loader.ts (new), crm-frontend/src/components/preview/hero-section.tsx (new), crm-frontend/src/components/preview/services-section.tsx (new), crm-frontend/src/components/preview/contact-section.tsx (new), crm-frontend/src/components/preview/reviews-section.tsx (new), crm-frontend/src/components/preview/location-section.tsx (new), crm-frontend/src/components/preview/faq-section.tsx (new)
- **Docs:** docs/20-current-state.md, docs/22-technical-architecture.md, docs/26-offer-generation.md, docs/30-task-records/B2.md

## 2026-04-06

### [A/A1] Scraping Job Input Contract — DONE
- **Scope:** Definice kanonickeho datoveho kontraktu pro jeden scraping job. 1 job = 1 query na 1 portalu v 1 meste/segmentu. Kontrakt obsahuje 12 poli, vsechna required (key musi byt explicitne pritomen; nullable pole maji hodnotu null). Lifecycle envelope (created/running/completed/failed) a deterministicky `source_job_id` odvozeny z (portal, segment, city, district, max_results, creation second) pres SHA-256 hash10. `error_message` zachycuje chybovy detail pri stavu failed. Zadne nested objekty. Zaklad pro A-02 staging layer a A-04 scraper runtime.
- **Owner:** Stream A
- **Code:** docs/contracts/scraping-job-input.schema.json (new), docs/contracts/scraping-job-input.md (new), crm-frontend/src/lib/contracts/scraping-job-input.ts (new)
- **Docs:** docs/23-data-model.md, docs/20-current-state.md, docs/24-automation-workflows.md, docs/30-task-records/A1.md

### [A/A2] RAW_IMPORT Staging Layer — DONE
- **Scope:** Navrzeni staging vrstvy `_raw_import` jako noveho system sheetu ve stejnem SPREADSHEET_ID jako LEADS. Cilem je oddelit surovy scraper output od produkcniho LEADS sheetu a zavest explicitni ingest lifecycle (raw -> normalized -> dedupe -> imported / error). LEADS zustava source of truth pro ciste leady; `_raw_import` je source of truth pro surova vstupni data a jejich lifecycle. Kontrakt definuje 16 sloupcu, 5-stavovy status model, 4-hodnotovy decision model, invariants matici a hranici mezi stagingem a produkcnim leadem.
- **Owner:** Stream A
- **Code:** docs/contracts/raw-import-row.schema.json (new), docs/contracts/raw-import-staging.md (new), crm-frontend/src/lib/contracts/raw-import-row.ts (new)
- **Docs:** docs/20-current-state.md, docs/23-data-model.md, docs/24-automation-workflows.md, docs/30-task-records/A2.md

### [A/A3] Normalization Raw to LEADS Rules — DONE
- **Scope:** Definice kanonickych pravidel pro transformaci surovych dat z `_raw_import.raw_payload_json` na validni LEADS radek. Kontrakt pokryva: field mapping (23 sloupcu), cleaning rules per pole, reject/null/empty policy, `lead_id` generation (reuse existujiciho formatu), a 6 novych `source_*` metadata sloupcu appendovanych do LEADS. Zadne paralelni helpery — vsechny cleaning operace pres existujici `Helpers.gs` funkce.
- **Owner:** Stream A
- **Code:** docs/contracts/normalization-raw-to-leads.md (new), docs/contracts/raw-to-leads-mapping.json (new)
- **Docs:** docs/20-current-state.md, docs/23-data-model.md, docs/24-automation-workflows.md, docs/30-task-records/A3.md

## 2026-04-05

### [B/B1] Preview brief data contract — formalizace datoveho kontraktu — DONE
- **Scope:** Formalizace datoveho kontraktu mezi Apps Script CRM backendem a preview renderer. Pouze specifikace a typy — zadna implementace endpointu, routu, nebo webhooku.
- **Owner:** —
- **Code:** crm-frontend/src/lib/domain/preview-contract.ts (new), crm-frontend/src/lib/mock/preview-brief.minimal.json (new), crm-frontend/src/lib/mock/preview-brief.rich.json (new)
- **Docs:** docs/23-data-model.md, docs/26-offer-generation.md, docs/30-task-records/B1.md

### [C/C2] Hardening audit — přepis sekce Souhrn v docs/20 — DONE
- **Scope:** Nahrazení sekce „Souhrn" v docs/20-current-state.md schváleným textem z hardening auditu. Text explicitně rozlišuje commitnutý kód, governance vrstvu (definovaná/validovaná/nevynucovaná) a uncommitted změny v working tree.
- **Owner:** claude
- **Code:** — (—)
- **Docs:** docs/20-current-state.md

### [C/C3] Repo governance hardening — CLAUDE.md, branch protection, cleanup — DONE
- **Scope:** Kompletni hardening repa pro 3-osobni tym: nahrazeni CLAUDE.md (z generickeho RuFlo V3 na project-specific governance), nahrazeni docs/13 (.new → aktivni), nastaveni branch protection na GitHubu, pridani collaboratora, odstraneni duplicit a smeti, aktualizace docs/github-collaboration-setup.md.
- **Owner:** claude
- **Code:** CLAUDE.md (modified), scripts/check-doc-sync.mjs (deleted)
- **Docs:** CLAUDE.md, docs/13-doc-update-rules.md, docs/github-collaboration-setup.md, docs/00-folder-inventory.md, docs/00-project-map.md, docs/CRM-SYSTEM-MAP.md

### [C/C4] Post-audit docs corrections — docs/20, docs/23, governance wording — DONE
- **Scope:** Oprava fakticke nepravdy v docs/20-current-state.md (Souhrn tvrdil "frontend neobsahuje dashboard" — commitnuty kod ho obsahuje). Oprava poctu extension sloupcu v docs/23 (43 → 45). Zpreseni governance wordingu v CLAUDE.md a docs/13 — CI vynucuje aktuálnost generated files, ale nevynucuje existenci task recordu.
- **Owner:** claude
- **Code:** — (—)
- **Docs:** docs/20-current-state.md, docs/23-data-model.md, CLAUDE.md, docs/13-doc-update-rules.md

### [C/CS1] Definovat end-to-end lifecycle leadu jako state machine — DONE
- **Scope:** Definice jedineho kanonicky lifecycle stavu (`lifecycle_state`) pro kazdy lead v systemu. Pokryva cestu od importu az po reakci leadu (REPLIED/BOUNCED/UNSUBSCRIBED) nebo diskvalifikaci. WON/LOST jsou downstream sales outcome mimo scope CS1. Specifikace — ne implementace.

**Explicitni scope disclaimer:**
- Tento PR nezavadi runtime enforcement lifecycle_state.
- Tento PR nevytvari fyzickou migraci na sloupec lifecycle_state.
- Tento PR nemeni aktualni chovani systemu.
- Tento PR je ciste autoritativni specifikace — zadny kod, zadna migrace, zadna zmena runtime.
- **Owner:** Claude
- **Code:** *(zadne code changes)* (—)
- **Docs:** docs/21-business-process.md, docs/23-data-model.md, docs/20-current-state.md, docs/11-change-log.md, docs/29-task-registry.md

### [C/CS2] Navrhnout workflow orchestrator — co spousti co po zmene stavu leadu — DONE
- **Scope:** Logicka orchestracni vrstva nad CS1 lifecycle. Definuje co se stane po kazde zmene lifecycle_state, formalni workflow step kontrakt, event katalog, run history design a orchestration model (hybrid: poll + manual + reactive). Specifikace — ne implementace.
- **Owner:** Claude
- **Code:** *(zadne code changes)* (—)
- **Docs:** docs/24-automation-workflows.md, docs/20-current-state.md

### [C/CS3] Definovat idempotency keys, retry politiku a dead-letter handling — DONE
- **Scope:** Reliability vrstva nad CS2 orchestratorem. Definuje idempotency key pro kazdy automaticky krok, retry matici (transient/permanent/ambiguous failures, max_attempts, backoff), dead-letter handling v dedickovany `_asw_dead_letters` sheet (append-only, separatni od `_asw_logs` run history), locking pravidla pro LockService. Specifikace — ne implementace.
- **Owner:** Claude
- **Code:** *(zadne code changes)* (—)
- **Docs:** docs/24-automation-workflows.md, docs/20-current-state.md
