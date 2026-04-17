# Current State — Autosmartweby

> **Kanonicky dokument.** Aktualizuje se pri kazdem tasku, ktery meni stav systemu.
> **Posledni aktualizace:** 2026-04-17

---

## Souhrn

Autosmartweby je poloautomatizovany CRM system pro oslovovani ceskych zivnostniku bez webovych stranek.

**Apps Script backend** (~6700 LOC, 16 souboru): kvalifikace leadu, generovani briefu a emailovych draftu, per-lead odesilani pres GmailApp, mailbox sync, write-back z odvozeneho sheetu pres lead_id lookup (Variant B). Pipeline bezi v rezimu DRY_RUN=true a standardne se zastavi ve stavu BRIEF_READY. Webhook pipeline existuje v kodu, je vypnuta (ENABLE_WEBHOOK=false).

**CRM frontend** (Next.js 16, React 19, TypeScript): prihlasen stránka (email+heslo), dashboard s KPI widgety, leads tabulka s filtrovanim a detail drawerem, pipeline kanban (read-only, 6 sloupcu), follow-up timeline, editace 5 poli per lead se zapisem zpet do Sheets. Frontend bezi lokalne, neni nasazen na verejne URL. Data cte z Google Sheets pres service account, zapis pres Apps Script Web App endpoint (doPost handler implementovan v BX1, TEST runtime verified; Web App UI deployment pending).

**Vstup dat** je rucni. System nescrapuje leady, negeneruje webove stranky a nema hosting pipeline.

**Governance vrstva** je definovana v repu a vynucovana na GitHubu:
- branch protection na main je aktivni (require PR, 1 review, status check docs-governance, dismiss stale, strict),
- CI workflow docs-governance.yml kontroluje aktuálnost generovanych souboru a dokumentacni sync,
- check-doc-sync.mjs vraci 43 pass / 0 warn / 0 fail,
- task records system s 5 zaznamy, 4 automatizacni skripty, PR template,
- enforce_admins je false — owner muze obejit branch protection.

CI validuje aktuálnost generated files a existenci governance souboru. Nevaliduje povinnost task recordu pro kodove zmeny — to je konvence, ne enforcement.

## Co dnes existuje

### Apps Script backend (12 souboru, ~6600 radku)
- Kvalifikace leadu (evaluateQualification_) — rucni spusteni z menu
- Deduplikace pres company_key (ICO > domena > email > normalizovane jmeno + mesto)
- Template selection (12+ variant podle segmentu)
- Preview brief generovani (JSON: headline, subheadline, CTA, benefits, sections) — cesky s lokativy
- Email draft generovani (personalizovany predmet + telo, situacne zavisly uvod)
- Web check pres Serper API (hledani chybejicich webu) — manualni z menu
- **Auto web check hook A-06** (`apps-script/AutoWebCheckHook.gs`) — automaticky web check pro nove LEADS radky bez website_url. Reusuje `findWebsiteForLead_()`, batch size 20, LockService guard, double-run prevence pres `website_checked_at`, per-row error isolation. Dva trigger mody: casovy (15min, auto-install pres installProjectTriggers) a post-import (lead_id cileny z processRawImportBatch_). **Stav: TEST runtime overeno** (2026-04-17, kontrolovany delta test na 3 radcich: 1 FOUND + 2 NOT_FOUND, live Serper API + Sheets zapis potvrzeny).
- Odvozeny list "Ke kontaktovani" s KPI dashboardem, prioritou, editovatelnymi sloupci
- Write-back Varianta B (lead_id lookup, imunni vuci posunu radku)
- Per-lead Gmail draft/send z "Ke kontaktovani" sheetu
- Mailbox sync (read-only: thread_id, reply_type, timestamps, CRM labely)
- **Auto qualify hook A-07** (`apps-script/AutoQualifyHook.gs`) — automaticka kvalifikace po web checku. Reusuje `evaluateQualification_()`, batch size 20, LockService guard, double-run prevence pres `lead_stage`. Dva trigger mody: casovy (15min, auto-install pres installProjectTriggers) a post-web-check (volany z A-06 runAutoWebCheckInner_). **Stav: TEST runtime overeno** (2026-04-17, QUALIFIED + DISQUALIFIED + REVIEW + SKIPPED guard provereny diagnostickymi funkcemi, 23 lokalnich asserti). Bug fix: `extractDomainFromUrl_` vyzaduje tecku v domene (prevence `dom:nenalezeno`).
- Triggery: 15min timer (processPreviewQueue, autoWebCheckTrigger, autoQualifyTrigger), onOpen (menu), onEdit (write-back)
- DRY_RUN defaultne zapnuty

### CRM frontend (Next.js 16 + React 19)
- Login (email+heslo, auth pres HMAC-SHA256 session cookie)
- Dashboard (KPI: k osloveni, high priority, follow-upy, pipeline breakdown)
- Leads tabulka s filtrovanim, razenim, detail drawer
- Pipeline kanban (6 sloupcu, read-only, bez drag-drop)
- Follow-up timeline (po terminu, dnes, zitra, tento tyden)
- Editace 5 poli per lead se zapisem zpet do Sheets
- Data: Google Sheets pres service account (read), Apps Script Web App (write — doPost implementovan BX1, Web App deployment pending)
- Mock service pro lokalni vyvoj bez Sheets pripojeni
- Preview renderer (B-02): route `/preview/[slug]`, renderuje MVP landing page z hardcoded sample briefu. 6 sekci (hero, services, contact, reviews, location, faq) rizenych polem `suggested_sections` z B-01 contractu. Verejne pristupny bez auth.
- Bezi lokalne, neni nasazen na verejne URL

### Datove kontrakty a staging
- Scraping Job Input v1.0 (`docs/contracts/scraping-job-input.schema.json`) — kanonicky kontrakt pro jeden scraping job (1 job = 1 query na 1 portalu v 1 meste/segmentu). Definuje 12 poli, deterministicky `source_job_id` a lifecycle stavy.
- RAW_IMPORT staging layer v1.0 (`docs/contracts/raw-import-staging.md`) — kontrakt pro `_raw_import` system sheet, staging buffer mezi scraperem a LEADS. 16 sloupcu, 5-stavovy status model, 4-hodnotovy decision model.
- Normalization raw -> LEADS rules v1.0 (`docs/contracts/normalization-raw-to-leads.md`) — kontrakt pro transformaci surovych dat z `_raw_import` na LEADS radek. 23-field mapping, cleaning rules, reject policy, lead_id generation, 6 novych source_* metadata sloupcu.
- **Scraper runtime A-04 (firmy.cz)** (`scripts/scraper/firmy-cz.mjs`) — Node ESM CLI, cte A-01 job input a produkuje pole A-02 RAW_IMPORT rows. Parsing strategy: JSON-LD schema.org primary + Open Graph a regex fallbacks. Per-record try/catch, rate-limited live mode, fixture mode pro deterministicky offline test. Zapis do `_raw_import` sheetu je mimo scope A-04.
- **Ingest runtime bridge A-10** (`apps-script/Normalizer.gs`, `apps-script/RawImportWriter.gs`) — runtime vrstva pro `_raw_import`: normalizer implementuje A-03 cleaning rules vcetne CZ phone prefix normalizace, reject policy a segment slug-to-label mapping (SETTINGS!A2:A11 kompatibilni); staging writer zajistuje sheet creation, append-only zapis, in-place status update, batch orchestrator (raw → normalize → dedupe → import/reject) a LEADS append pres HeaderResolver. **Stav: TEST runtime overeno** (2026-04-17, leadsBefore=799, leadsAfter=800, leadsAppended=1; lokalni proof: 7 rows, 1 reject, 2 hard dup, 4 imported).
- Zbyvajici automatizace (zivefirmy.cz scraper, review UI) nejsou jeste implementovane.

### Dokumentace
- Governance s validacnim scriptem
- 8 decisions (D-1 az D-8), 6 hotovych

## Co neexistuje

- Automaticky scraping kontaktu z portalu
- Formular pro vyhledavani na portalech
- Generovani a deploy skutecnych preview webu
- Hromadne odesilani emailu
- Automaticky trigger na novy radek v LEADS
- End-to-end automatizace bez lidskeho zasahu
- CI/CD pipeline pro kod (existuje jen docs-governance check)
- Testy (zadne unit, integration ani e2e testy)
- Frontend deployment (Vercel/Netlify)
- ~~Apps Script Web App doPost handler~~ — **BX1 DONE** (doPost + handleUpdateLead_, inner logic TEST runtime verified; Web App UI deployment + frontend e2e pending)

## Specifikace

- **Lead Lifecycle State Machine (CS1):** Autoritativni specifikace end-to-end lifecycle stavu leadu — viz `docs/21-business-process.md`. Definuje 18 canonical stavu (4 terminal, 3 review), 24 povolenych prechodu, derivacni pravidla z existujicich stage poli. Scope: od importu po reakci; WON/LOST jsou downstream mimo lifecycle. Implementace sloupce `lifecycle_state` neni soucasti CS1.
- **Workflow Orchestrator (CS2):** Logicka orchestracni vrstva nad lifecycle — viz `docs/24-automation-workflows.md`. Hybrid model (poll + manual + reactive), 17 eventu, formalni step kontrakt, run history design. Kompatibilni s existujicimi Apps Script triggery.
- **Reliability & Idempotency (CS3):** Idempotency keys, retry politika, dead-letter handling a locking pro vsechny automaticke workflow kroky — viz `docs/24-automation-workflows.md`. Definuje 12 kroku s idempotency strategii, retry matici (transient/permanent/ambiguous), dead-letter design v dedickovany `_asw_dead_letters` sheet (append-only, separatni od `_asw_logs` run history), lock pravidla pro Apps Script LockService.

## Co je rozpracovane

- Webhook pipeline pro preview weby — kod pripraveny, ENABLE_WEBHOOK=false, zadna cilova sluzba
- Google Auth Phase 1 — kod na feature branch task/B3-auth-phase1, ceka na .env.local a merge
- Email sending pres ESP (Phase 2) — architektura navrzena, implementace 0%
