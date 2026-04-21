# Change Log — Autosmartweby

> **Auto-generated** from task records (`docs/30-task-records/`).
> Regenerate: `node scripts/docs/build-changelog.mjs`
> Do NOT edit manually — changes will be overwritten.

---

## 2026-04-21

### [B/B5] Preview URL return + statusy (caller-side + lifecycle) — DONE
- **Scope:** Navazuje na B-01 (preview contract), B-02 (preview renderer), B-03 (template family mapping), B-04 (`POST /api/preview/render` endpoint). Uzavira CRM-side smycku: Apps Script caller splnuje B-04 contract (slug v payloadu + X-Preview-Webhook-Secret header), response se parsuje do LEADS a `preview_stage` je narovnany do operator-facing lifecycle `NOT_STARTED → BRIEF_READY → GENERATING → READY_FOR_REVIEW → APPROVED`, s `FAILED` jako retry-eligible.

B-05 NEMENI B-04 endpoint contract, NEMENI B-01 `PreviewBrief`, NEMENI B-03 mapping. Neotevira B-06 (storage/screenshot/CDN), neresi frontend UI pro `APPROVED` (ta je manualni operator akce v Google Sheets), nepridava `preview_attempts` counter.
- **Owner:** Stream B
- **Code:** apps-script/Config.gs (modified), apps-script/EnvConfig.gs (modified), apps-script/PreviewPipeline.gs (modified), apps-script/PreviewPipeline.gs (modified), scripts/test-b05-preview-webhook.mjs (new), package.json (modified)
- **Docs:** docs/20-current-state.md, docs/22-technical-architecture.md, docs/23-data-model.md, docs/24-automation-workflows.md, docs/26-offer-generation.md, docs/30-task-records/B5.md

### [C/C-04] Sendability Gate pravidla — autoritativni SPEC gate mezi preview a outreach — DONE
- **Scope:** Formalizuje rozhodovaci logiku, ktera stoji mezi fazi "preview hotove" a fazi "outreach queued". Definuje jedine autoritativni pravidlo pro kazdy lead, zda smi jit do auto-send, zda potrebuje manualni review, nebo zda je blokovan. Scope je **SPEC-only** — zadny runtime sender, queue, UI, webhook ani observability pipeline se v tomto tasku neimplementuje.

Task dodava:
- 3 **gate outcomes** (ne lifecycle states): `AUTO_SEND_ALLOWED` / `MANUAL_REVIEW_REQUIRED` / `SEND_BLOCKED`
- 19 hard conditions (H1–H19) pro pripusteni auto-sendu
- 21 blocking reasons (B1–B21) se stabilnimi reason codes, **rozclenenymi do 4 kategorii** (canonical-lifecycle / compliance / outbound-signal / data-deficit)
- 3 review reasons (R1–R3)
- 8-ORDER precedence rules (terminal > compliance > already-sent > qualifier > identity > content > review > allow)
- Deterministicky pseudocode evaluatoru (lookup-only, zadny side-effect)
- 5 sample leadu (2x AUTO_SEND + 2x BLOCK + 1x REVIEW) pro acceptance
- Observability contract (reason codes, log schema) a boundary rules proti double-send
- Handoff do C-05 (outbound queue), C-06 (ESP abstrakce), C-08/C-09 (rate limit / suppression)

**CS1 konzistence (2026-04-21 fix round):**
- `TERMINAL_STATE_*` block reasons (B2–B5) pokryvaji **pouze** CS1 canonical terminals: `DISQUALIFIED`, `REPLIED`, `BOUNCED`, `UNSUBSCRIBED`.
- `WON` a `LOST` jsou downstream sales outcomes (hodnoty auxiliary pole `outreach_stage`), **NE** canonical lifecycle states. CS1 sekce 10.4 je derivuje na `effective_lifecycle_state = REPLIED` → B3.
- `DEAD` neni canonical lifecycle state, neni to aux hodnota a neni to gate outcome. V C-04 spec se nepouziva.
- Sample leady pouzivaji pouze CS1 canonical states.

Task NEDODAVA:
- Runtime sender, ESP provider, queue, retry stroj, outbound rate limiter
- UI pro review frontu ani Sheets sloupec `sendability_outcome` jako editable pole
- Apps Script zmeny, webhooky, cron scheduler
- Frontend zmeny (read-only preview renderer zustava)
- Zadne PROPOSED pole se **nezapisuji** do LEADS v ramci C-04 — navrh je pouze v SPEC sekci "Implementation notes" jako podklad pro C-05/C-06
- **Owner:** Claude
- **Code:** — (—)
- **Docs:** docs/24-automation-workflows.md, docs/21-business-process.md, docs/20-current-state.md

### [C/C-05] Outbound queue + send payload kontrakt — SPEC-only vrstva mezi C-04 gatem a budoucim senderem — DONE
- **Scope:** Formalizuje datovou vrstvu mezi C-04 sendability gate a budoucim senderem. Odděluje čtyři fáze: "lead je sendable" / "queue item čeká" / "sender posílá" / "provider potvrdil". Definuje `_asw_outbound_queue` sheet schema, queue status enum, povolené/zakázané přechody, send payload kontrakt v1.0, immediate vs scheduled pravidla, failure design a cross-ref na CS2/CS3/C-04.

Scope je **SPEC-only** — žádný runtime worker, sender, ESP provider, mailbox sync, cron ani frontend se neimplementuje. Žádné nové sloupce se v tomto tasku nezapisuji do `apps-script/Config.gs` ani do LEADS. Všechny nové sloupce jsou označené PROPOSED FOR C-05 a budou materializovány až implementačním taskem.

Task dodává:
- `_asw_outbound_queue` schema (32 polí — 15 povinných per zadání + 17 auditability/integrity rozšíření se zdůvodněním)
- 5 queue statusů (`QUEUED`, `SENDING`, `SENT`, `FAILED`, `CANCELLED`) s matrixem allowed/disallowed transitions a 5 invarianty
- Deterministický pseudocode pro queue create / worker claim / cancel / fail
- Send payload kontrakt v1.0 (12 top-level polí, snapshot vs runtime-derived rozlišené)
- Immediate vs scheduled pravidla (field semantics, worker eligibility, cancel, rescheduling zakázané)
- Failure design (6 povinných polí pro diagnostiku, vztah k CS3 retry + dead-letter)
- Cross-ref graph (LEADS ↔ queue ↔ `_asw_logs` ↔ `_asw_dead_letters`)
- 4 sample rows (QUEUED, SENT, FAILED, CANCELLED)
- 13 boundary rules / handoff body do C-04 / CS1 / CS2 / CS3 / C-06 / C-07 / C-08 / C-09
- VERIFIED / INFERRED / PROPOSED labely

**CS1/CS3 kompatibilita:**
- C-05 queue je **ortogonální** datová vrstva; nezavádí žádný nový canonical lifecycle state. T17 (`OUTREACH_READY → EMAIL_QUEUED`) mapuje na queue row insert; T18 (`EMAIL_QUEUED → EMAIL_SENT`) mapuje na queue.send_status=SENT.
- Queue status `SENDING`/`FAILED` **není** CS1 canonical state — žije pouze v queue.
- CS3 S12 `process_email_queue` pravidlo `max_attempts=1` + okamžitý dead-letter je respektováno: retry nad stejnou row je zakázán. Retry = nový queue row s jiným `idempotency_key` (jinak duplicate blocked producer-side).
- `idempotency_key` reuses CS3 section 4 S12 pattern `send:{lead_id}:{SHA256(email + subject + body)}`.

**C-04 kompatibilita:**
- Queue row smí vzniknout **pouze** pokud C-04 vrátí `AUTO_SEND_ALLOWED`. Snapshot outcome se freezne v `created_from_sendability_outcome` — audit invariant proti pozdější změně gate semantiky.
- `MANUAL_REVIEW_REQUIRED` jde do C-09 exception queue (jiná struktura, ne `_asw_outbound_queue`).
- `SEND_BLOCKED` queue row nevytváří.

Task NEDODÁVÁ:
- Runtime worker / cron / trigger / polling loop
- Sender / Gmail call / ESP integraci
- Mailbox sync změny
- Follow-up engine (C-07)
- Rate limiting, quiet hours, daily caps (C-08)
- Suppression list management (C-09)
- Frontend queue UI / exception review UI
- `_asw_outbound_queue` sheet creation v `apps-script/` runtime kódu
- Změny v `apps-script/Config.gs` `EXTENSION_COLUMNS`
- Změny v `docs/23-data-model.md` (queue sheet je PROPOSED; materializace až v implementačním tasku)
- Nové canonical lifecycle states
- Nové gate outcomes
- **Owner:** Claude
- **Code:** — (—)
- **Docs:** docs/24-automation-workflows.md, docs/20-current-state.md

### [C/C-06] Provider abstraction + sender interface — SPEC-only vrstva mezi outbound queue a konkretnim ESP — DONE
- **Scope:** Formalizuje provider-agnostickou vrstvu mezi `_asw_outbound_queue` a konkretnim ESP (Gmail / SendGrid / Mailgun / …). Oddeluje ctyri vrstvy identity statusu: provider raw response / normalized provider status / queue send status / CS1 lifecycle state. Definuje `EmailSender` interface (1 metoda), `SendRequest` (17 poli), `NormalizedSendResponse` (17 poli), `NormalizedProviderStatus` (7 hodnot), `NormalizedSendErrorClass` (8 hodnot) s fixnim mappingem na CS3 `failure_class`, rate limiting jako kontrakt, 3 fail scenare, Gmail vs generic ESP sample mapping a sender selection via config (ne runtime).

Scope je **SPEC-only** — zadny runtime sender, Gmail adapter, SendGrid adapter, Mailgun adapter, queue worker, factory, mailbox sync, frontend UI ani provider webhook ingest se neimplementuje. Zadne nove enumy ani Script Property se v tomto tasku nezapisuji do `apps-script/Config.gs`. Vsechny nove artefakty jsou oznacene PROPOSED FOR C-06 a budou materializovany implementacnim taskem.

Task dodava:
- `EmailSender` interface (1 metoda `send(request: SendRequest) → NormalizedSendResponse`)
- `SendRequest` kontrakt (17 poli — 13 immutable snapshot z C-05 payload v1.0 + 4 runtime-derived, PII-safe)
- `NormalizedSendResponse` kontrakt (17 poli — 7 povinnych per zadani + 10 auditability rozsireni se zduvodnenim)
- `NormalizedProviderStatus` enum (7 hodnot: ACCEPTED, QUEUED_BY_PROVIDER, REJECTED, THROTTLED, TIMEOUT, AUTH_FAILED, UNKNOWN)
- `NormalizedSendErrorClass` enum (8 hodnot: TIMEOUT, RATE_LIMIT, INVALID_RECIPIENT, AUTH_FAILED, PROVIDER_UNAVAILABLE, PROVIDER_REJECTED, INVALID_REQUEST, UNKNOWN) s deterministickym mappingem na CS3 `failure_class`
- 4-vrstva separace statusu (A: provider raw / B: `NormalizedProviderStatus` / C: `QUEUE_SEND_STATUS` / D: CS1 lifecycle state) s fixnim deterministickym lookup table
- Provider adapter model (shared logic / provider-specific logic / anti-branching rules — queue worker nevi, jaky provider je aktivni)
- Rate limiting jako kontrakt: adapter report `rate_limit_reset_at` + `THROTTLED` status; scheduling rozhoduje C-08 (mimo C-06)
- 3 fail scenare s plnymi `NormalizedSendResponse` tabulkami a CS3 handoffem (TIMEOUT → AMBIGUOUS HOLD, RATE_LIMIT → TRANSIENT, INVALID_RECIPIENT → PERMANENT)
- Gmail sample mapping (`GmailApp.sendEmail` + `GmailApp.search` pro message_id retrieval, constraints: no native message_id, no API idempotency)
- Generic ESP sample mapping (SendGrid 202 + 429 examples; HTTP+JSON payload + X-Message-Id header)
- Gmail vs generic ESP tabulka odlisnosti (idempotency / rate limit signal / authentication / bounce signal / attachments)
- Auditability + cross-ref do `_asw_logs` + queue (correlation_id, sender_run_id, sender_event_id, provider_response_excerpt)
- Sender selection via Script Property `EMAIL_PROVIDER` (GMAIL default / SENDGRID / MAILGUN), multi-provider fallback explicitly out-of-scope
- Sample pseudocode flow (queue worker volajici sender.send)
- PII safety invariant pro `provider_response_excerpt` a `error_message` (sanitizace pre-log)
- 13 boundary rules / handoff body do C-05 / CS1 / CS2 / CS3 / C-04 / C-07 / C-08 / C-09 / mailbox sync / 2x budoucich implementacnich tasku
- VERIFIED / INFERRED / PROPOSED labely

**CS3 kompatibilita:**
- `NormalizedSendErrorClass` (8 hodnot) je jemnejsi nez CS3 `failure_class` (TRANSIENT / PERMANENT / AMBIGUOUS). C-06 definuje **deterministicky 1:N lookup table** (TIMEOUT→AMBIGUOUS, RATE_LIMIT→TRANSIENT, INVALID_RECIPIENT→PERMANENT, AUTH_FAILED→PERMANENT, PROVIDER_UNAVAILABLE→TRANSIENT, PROVIDER_REJECTED→PERMANENT, INVALID_REQUEST→PERMANENT, UNKNOWN→AMBIGUOUS). Queue worker mapuje 1:N.
- CS3 S12 `process_email_queue` invariant `max_attempts=1` je respektovany — `EmailSender.send` nikdy nerestrykuje interne. Retry = novy queue row (C-05 pravidlo). C-06 pouze emituje `retryable: boolean` hint pro diagnostiku.
- C-06 neemituje `_asw_logs` sam; queue worker to dela s normalized payloadem. `sender_run_id` + `sender_event_id` jsou echoed zpet v response.

**C-05 kompatibilita:**
- `SendRequest` je stavebni derivat C-05 payload kontraktu v1.0 (sekce 6 docs/24). 13 poli je immutable snapshot z queue row; 4 pole (`sender_run_id`, `sender_event_id`, `timeout_ms`, `payload_version`) jsou runtime-derived.
- `NormalizedSendResponse.provider_message_id` + `sent_at` jsou pole, ktera queue worker zapise do queue row pri `QUEUED → SENT` transition.
- Queue statusy (`QUEUED`, `SENDING`, `SENT`, `FAILED`, `CANCELLED`) nejsou touto SPEC dotcene — ortogonalne existuji vuci `NormalizedProviderStatus`.
- C-05 `idempotency_key` je predavan do `SendRequest.idempotency_key`; adapter rozhoduje, zda ho propne do provider API (SendGrid `X-Message-Id` header) nebo drzi pouze lokalne (Gmail nema native idempotency).

**CS1 kompatibilita:**
- C-06 nezavadi zadny novy canonical lifecycle state. T18 (`EMAIL_QUEUED → EMAIL_SENT`) je triggered queue workerem po `success: true`. C-06 samotny nezapisuje do LEADS.
- C-06 fail → CS1 zustava `EMAIL_QUEUED`. Transition na potencialny `EMAIL_FAILED` je manualni operator akce (T25), ne C-06 responsibility.

**C-04 kompatibilita:**
- C-04 zije **pred** queue; C-06 zije **za** queue. Zadna prima interakce. Oddelene C-05 queue vrstvou.

Task NEDODAVA:
- Runtime `EmailSender` implementaci / `GmailAdapter` / `SendGridAdapter` / `MailgunAdapter`
- `getEmailSender()` factory / sender registry
- Queue worker loop (worker, ktery volа adapter, je budouci implementacni task)
- Zapis `EMAIL_PROVIDER` Script Property (vcetne default GMAIL)
- Zapis `NormalizedProviderStatus` / `NormalizedSendErrorClass` do `apps-script/Config.gs`
- Mailbox sync zmeny / bounce/reply ingest
- Provider webhook ingest (bounce, complaint, open, click)
- Rate limiting / quiet hours / daily caps scheduling (handoff → C-08)
- Follow-up engine / thread reply (handoff → C-07)
- Suppression list management (handoff → C-09)
- Multi-provider fallback / primary+secondary routing
- Attachment support (v1.0 `SendRequest.attachments` je rezerva, vzdy prazdne)
- HTML body rendering (v1.0 `SendRequest.body.html` je rezerva; queue worker predava `plain`)
- Frontend provider config UI
- **Owner:** Claude
- **Code:** — (—)
- **Docs:** docs/24-automation-workflows.md, docs/20-current-state.md

## 2026-04-20

### [A/A8] Preview queue → BRIEF_READY — DONE
- **Scope:** Uzavira prechod kvalifikovaneho leadu (QUALIFIED, preview_stage=NOT_STARTED) do stavu BRIEF_READY bez cekani na 15-min casovy trigger. Symetrie vuci A-06 -> A-07 post-web-check hooku.

What this task delivers:
- **Post-qualify hook** v `AutoQualifyHook.gs` — po uspesne kvalifikaci (`stats.qualified > 0`) a pri `dryRun === false` primo vola `processPreviewQueue()`. Non-fatal wrap — chyba preview hooku nezneplatni vysledek A-07.
- **Local evidence harness** `scripts/test-a08-preview-queue.mjs` — 6 scenaru, 38 assertions, portuje kriticke GAS helpery (`resolveWebsiteState_`, `chooseTemplateType_`, `buildPreviewBrief_`, `buildSlug_`, `composeDraft_`) a replikuje per-row logiku `processPreviewQueue`.
- **Task record** + sync do `docs/20-current-state.md` a `docs/24-automation-workflows.md`.

What this task does NOT deliver:
- Zmeny `processPreviewQueue()`, `buildPreviewBrief_()`, `buildSlug_()`, `composeDraft_()` (reused as-is z PreviewPipeline.gs)
- Pridani `preview_slug` do webhook payloadu (znamy gap z B-01 — out of scope, blokovano B-05)
- B-04 preview endpoint, B-05 slug write-back
- Lock sjednoceni mezi `runAutoQualify_` a `processPreviewQueue()` (neni nutne — processPreviewQueue neakviruje lock a je volany uvnitr A-07 lock scope)
- Zivy TEST runtime clasp deployment (vyzaduje push na TEST skript)

**Status rationale:** done — code complete, lokalne verifikovano (38 assertions), existujici 15-min timer + post-hook pokryvaji obe cesty. Fail izolace prokazana per-row try/catch scenariem (row 1 of 3 throws, rows 0 a 2 dosahnou BRIEF_READY).
- **Owner:** Stream A
- **Code:** apps-script/AutoQualifyHook.gs (modified), scripts/test-a08-preview-queue.mjs (new), docs/30-task-records/A8.md (new), docs/20-current-state.md (modified), docs/24-automation-workflows.md (modified)
- **Docs:** docs/20-current-state.md, docs/24-automation-workflows.md

### [A/A9] Ingest quality report per source_job_id — DONE
- **Scope:** Reportovaci vrstva nad existujicim ingest funnellem. Pro kazdy `source_job_id` produkuje jeden radek v append-only `_ingest_reports` sheetu + full JSON payload do `_asw_logs`. Ne novy subsystem — cista agregace nad `_raw_import` + LEADS.

What this task delivers:
- `apps-script/IngestReport.gs` — `ensureIngestReportsSheet_()`, `buildIngestReport_()` (pure), `writeIngestReport_()` + `reportToRow_()` (type-preserving), `loadRawRowsByJob_()` (header-validated), `loadLeadsRowsByJob_()`, `generateIngestReportForJob()`, `generateIngestReportsForAllJobs()`, `generateIngestReportPrompt()` (menu)
- Report unit: **1 report = 1 `source_job_id`** (= 1 scraping job = 1 query na 1 portalu v 1 city/segment)
- 41-sloupcove schema: identity, timing, raw-stage counts, LEADS-stage counts, derived rates, bottleneck, summary_status, **snapshot_stage** (RAW_ONLY / DOWNSTREAM_PARTIAL / FINAL — orthogonal to summary_status), fail_reason_breakdown_json, audit
- `report_id` format `rpt-{source_job_id}-{ts14}-{uuid8}` — timestamp for human readability + UUID suffix for collision resistance (via `Utilities.getUuid()`)
- `loadRawRowsByJob_` **validates required headers** (`source_job_id`, `import_decision`, `normalized_status`) per A-02 contract; throws loudly on malformed sheet instead of silent empty result
- `reportToRow_()` **preserves numeric types** when writing to Sheets (counts, rates, durations stay numbers — not stringified)
- Post-batch hook v `processRawImportBatch_()` — po uspesnem batch-i vygeneruje report per distinct source_job_id, non-fatal wrap. `snapshot_stage` auto-computed z data state → pokud A-06/A-07/A-08 chain dobehl inline, report je `FINAL`; jinak `DOWNSTREAM_PARTIAL`
- Menu submenu "Ingest report → ..." s dvema manualnimi akcemi
- Local evidence harness `scripts/test-a09-ingest-report.mjs` — 12 scenaru, 136 assertions, all pass

What this task does NOT deliver:
- Frontend dashboard (mimo scope)
- Refactor ingest funnelu
- `run_id` runtime field (CS2 M7 gap zustava)
- Historicke backfill stare joby (manualni `generateIngestReportsForAllJobs()` to umoznuje, ale neni povinny deliverable)
- Zivy TEST runtime clasp push proof

**Status rationale:** done v implementation / repo scope. Lokalne overeno (136 assertions). TEST runtime end-to-end NOT VERIFIED (vyzaduje clasp push + realny `_raw_import` + LEADS v TEST projektu).
- **Owner:** Stream A
- **Code:** apps-script/IngestReport.gs (new), apps-script/RawImportWriter.gs (modified), apps-script/Menu.gs (modified), scripts/test-a09-ingest-report.mjs (new), docs/30-task-records/A9.md (new), docs/20-current-state.md (modified), docs/23-data-model.md (modified), docs/24-automation-workflows.md (modified)
- **Docs:** docs/20-current-state.md, docs/23-data-model.md, docs/24-automation-workflows.md

### [B/B4] Preview render endpoint — POST /api/preview/render — DONE
- **Scope:** Navazuje na B-01 (preview contract), B-02 (preview renderer) a B-03 (template family mapping). Zavadi Next.js API endpoint, ktery prijima webhook payload z Apps Scriptu, validuje ho proti B-01 `MinimalRenderRequest`, upsertne brief do in-memory preview store, zvoli render family pres B-03 resolvery a vrati B-01 `MinimalRenderResponseOk` s `preview_url = ${PUBLIC_BASE_URL}/preview/${preview_slug}`.

B-04 NEMENI B-01 contract, NEMENI B-03 mapping, NEMENI Apps Script. Zive GAS propojeni vyzaduje B-05 (GAS payload zatim neobsahuje `preview_slug`).
- **Owner:** Stream B
- **Code:** crm-frontend/src/app/api/preview/render/route.ts (new), crm-frontend/src/lib/preview/preview-store.ts (new), crm-frontend/src/lib/preview/validate-render-request.ts (new), crm-frontend/src/lib/preview/quality-score.ts (new), crm-frontend/src/lib/mock/sample-brief-loader.ts (modified), crm-frontend/tsconfig.json (modified), scripts/tests/preview-render-endpoint.test.ts (new), package.json (modified)
- **Docs:** docs/12-route-and-surface-map.md, docs/20-current-state.md, docs/22-technical-architecture.md, docs/26-offer-generation.md, docs/30-task-records/B4.md

## 2026-04-17

### [A/A10] Ingest runtime bridge — LEADS append + segment taxonomy fix — DONE
- **Scope:** Complete the ingest runtime bridge by implementing the missing LEADS append step and fixing the segment taxonomy mismatch that caused a data validation crash.

What this task delivers:
- `appendLeadRow_()` in RawImportWriter.gs — appends a normalized lead to LEADS using HeaderResolver for dynamic column mapping
- Replacement of the TODO placeholder at processRawImportBatch_ step 3 with actual `appendLeadRow_()` call
- `SEGMENT_SLUG_TO_LABEL_` mapping in Normalizer.gs — converts internal slugs (e.g. `instalaterstvi`) to Czech display labels (e.g. `instalater`) compatible with SETTINGS!A2:A11 validation
- `resolveSegmentLabel_()` function applied during normalization
- Full end-to-end ingest pipeline: raw → normalize → dedupe → LEADS append

What this task does NOT deliver:
- Changes to dedupe logic (A-05, reused as-is)
- Changes to scraper output (A-04, reused as-is)
- Sheet cleanup of diagnostic test data (done during verification, not part of deliverable)

**Status rationale:** done — TEST runtime verified (leadsBefore=799, leadsAfter=800, leadsAppended=1). Segment taxonomy mismatch root-caused and fixed. All diagnostic functions removed in closeout.
- **Owner:** Stream A
- **Code:** apps-script/RawImportWriter.gs (edit), apps-script/Normalizer.gs (edit)
- **Docs:** docs/20-current-state.md, docs/24-automation-workflows.md, docs/30-task-records/A10.md

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

### [A/A7] Auto qualify hook — DONE
- **Scope:** Automatic qualification hook that runs `evaluateQualification_()` on LEADS rows after web check completes. Eliminates the need for manual "Qualify leads" menu action for newly web-checked leads.

What this task delivers:
- `AutoQualifyHook.gs` — GAS module with `runAutoQualify_(opts)`, `autoQualifyTrigger()`, `runQualifyForWebCheckedLeads_(leadIds)`
- **Automatic trigger installation** via `installProjectTriggers()` in PreviewPipeline.gs (15-min timer alongside A-06)
- **Post-web-check hook** — `runAutoWebCheckInner_` calls `runQualifyForWebCheckedLeads_()` after web check writes complete
- Eligible row criteria: `lead_stage` empty + `business_name` present + (`website_checked_at` set OR `has_website` has value)
- Per-row error isolation (one qualification failure does not abort batch)
- LockService guard (prevents concurrent runs)
- Double-run prevention via `lead_stage` field (if already set, skip)
- DRY_RUN support
- Local proof harness with 23 assertions, all passing

What this task does NOT deliver:
- Changes to `evaluateQualification_()` logic itself (reused as-is from PreviewPipeline.gs)
- Within-LEADS batch dedupe recalculation (handled separately by existing `qualifyLeads()`)
- Live TEST runtime verification (requires clasp push + SERPER_API_KEY in TEST project)

**Status rationale:** done — code complete, locally verified (23 assertions), TEST runtime verified (QUALIFIED, DISQUALIFIED, REVIEW, SKIPPED guard). Failure isolation proven by code structure + local harness (not by live forced exception). Bug fix: `extractDomainFromUrl_` now requires dot in domain (prevents `dom:nenalezeno`).
- **Owner:** Stream A
- **Code:** apps-script/AutoQualifyHook.gs (new), apps-script/AutoWebCheckHook.gs (edit), apps-script/PreviewPipeline.gs (edit), scripts/test-a07-qualify-hook.mjs (new), docs/30-task-records/A7.md (new), apps-script/Helpers.gs (edit), docs/20-current-state.md (edit), docs/24-automation-workflows.md (edit)
- **Docs:** docs/20-current-state.md, docs/24-automation-workflows.md

### [B/B3] Template family mapping vrstva mezi template_type a renderer — DONE
- **Scope:** Navazuje na B-01 (preview brief contract) a B-02 (preview renderer). Zavadi MVP mapping vrstvu mezi runtime `template_type` (emitovanym GAS `chooseTemplateType_`) a 4 renderovaci family: `emergency`, `community-expert`, `technical-authority`, `generic-local`.

B-03 NEMENI B-01 contract, NEMENI B-02 renderer strukturu, nepridava `template_type` do `PreviewBrief`, nepridava B-04 endpoint vrstvu ani webhook aktivaci. Renderer zustava template-agnostic; family vrstva je pripravena a testovatelna pro nasledne family-specificke layouty.
- **Owner:** —
- **Code:** crm-frontend/src/lib/domain/preview-contract.ts (modified), crm-frontend/src/lib/domain/template-family.ts (new), crm-frontend/src/lib/mock/sample-brief-loader.ts (modified), crm-frontend/src/lib/mock/preview-brief.emergency.json (new), crm-frontend/src/lib/mock/preview-brief.community.json (new), crm-frontend/src/lib/mock/preview-brief.technical.json (new), scripts/tests/template-family.test.ts (new), package.json (monorepo root) (modified)
- **Docs:** docs/20-current-state.md, docs/22-technical-architecture.md, docs/26-offer-generation.md, docs/30-task-records/B3.md

### [B/BX1] CRM write path — doPost handler for frontend writes — DONE
- **Scope:** Implement the missing `doPost()` handler in Apps Script to enable CRM frontend write-back via HTTP POST. The frontend writer (`apps-script-writer.ts`) was already implemented but had no server-side endpoint.

What this task delivers:
- `WebAppEndpoint.gs` — `doPost()`, `handleUpdateLead_()`, `jsonResponse_()`
- Token verification via Script Properties `FRONTEND_API_SECRET`
- Lead lookup via `findRowByLeadId_()` (Variant B, row-shift immune)
- Identity verification (business_name + city)
- LockService guard (shared with onContactSheetEdit)
- 5 allowed fields: outreach_stage, next_action, last_contact_at, next_followup_at, sales_note
- outreach_stage reverse-humanization (Czech label → English key)
- `appsscript.json` webapp config for Web App deployment

What this task does NOT deliver:
- Web App UI deployment (manual step via Apps Script editor)
- Frontend `.env.local` configuration
- Frontend → Web App e2e verification
- New frontend code (existing `apps-script-writer.ts` already matches)

**Status rationale:** done — inner doPost logic TEST runtime verified (writeVerified=true, restored=true). External Web App HTTP path and frontend e2e not yet verified (requires manual Web App deployment).
- **Owner:** Stream B
- **Code:** apps-script/WebAppEndpoint.gs (new), apps-script/appsscript.json (edit)
- **Docs:** docs/20-current-state.md, docs/30-task-records/BX1.md

## 2026-04-16

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
