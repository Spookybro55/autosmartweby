# Current State — Autosmartweby

> **Kanonicky dokument.** Aktualizuje se pri kazdem tasku, ktery meni stav systemu.
> **Posledni aktualizace:** 2026-04-05

---

## Souhrn

Autosmartweby je poloautomatizovany CRM system pro oslovovani ceskych zivnostniku bez webovych stranek.

**Apps Script backend** (~4800 LOC, 9 souboru): kvalifikace leadu, generovani briefu a emailovych draftu, per-lead odesilani pres GmailApp, mailbox sync, write-back z odvozeneho sheetu pres lead_id lookup (Variant B). Pipeline bezi v rezimu DRY_RUN=true a standardne se zastavi ve stavu BRIEF_READY. Webhook pipeline existuje v kodu, je vypnuta (ENABLE_WEBHOOK=false).

**CRM frontend** (Next.js 16, React 19, TypeScript): prihlasen stránka (email+heslo), dashboard s KPI widgety, leads tabulka s filtrovanim a detail drawerem, pipeline kanban (read-only, 6 sloupcu), follow-up timeline, editace 5 poli per lead se zapisem zpet do Sheets. Frontend bezi lokalne, neni nasazen na verejne URL. Data cte z Google Sheets pres service account, zapis pres Apps Script Web App endpoint (frontend writer existuje, server handler doPost chybi).

**Vstup dat** je rucni. System nescrapuje leady, negeneruje webove stranky a nema hosting pipeline.

**Governance vrstva** je definovana v repu a vynucovana na GitHubu:
- branch protection na main je aktivni (require PR, 1 review, status check docs-governance, dismiss stale, strict),
- CI workflow docs-governance.yml kontroluje aktuálnost generovanych souboru a dokumentacni sync,
- check-doc-sync.mjs vraci 43 pass / 0 warn / 0 fail,
- task records system s 5 zaznamy, 4 automatizacni skripty, PR template,
- enforce_admins je false — owner muze obejit branch protection.

CI validuje aktuálnost generated files a existenci governance souboru. Nevaliduje povinnost task recordu pro kodove zmeny — to je konvence, ne enforcement.

## Co dnes existuje

### Apps Script backend (9 souboru, ~4800 radku)
- Kvalifikace leadu (evaluateQualification_) — rucni spusteni z menu
- Deduplikace pres company_key (ICO > domena > email > normalizovane jmeno + mesto)
- Template selection (12+ variant podle segmentu)
- Preview brief generovani (JSON: headline, subheadline, CTA, benefits, sections) — cesky s lokativy
- Email draft generovani (personalizovany predmet + telo, situacne zavisly uvod)
- Web check pres Serper API (hledani chybejicich webu)
- Odvozeny list "Ke kontaktovani" s KPI dashboardem, prioritou, editovatelnymi sloupci
- Write-back Varianta B (lead_id lookup, imunni vuci posunu radku)
- Per-lead Gmail draft/send z "Ke kontaktovani" sheetu
- Mailbox sync (read-only: thread_id, reply_type, timestamps, CRM labely)
- Triggery: 15min timer (processPreviewQueue), onOpen (menu), onEdit (write-back)
- DRY_RUN defaultne zapnuty

### CRM frontend (Next.js 16 + React 19)
- Login (email+heslo, auth pres HMAC-SHA256 session cookie)
- Dashboard (KPI: k osloveni, high priority, follow-upy, pipeline breakdown)
- Leads tabulka s filtrovanim, razenim, detail drawer
- Pipeline kanban (6 sloupcu, read-only, bez drag-drop)
- Follow-up timeline (po terminu, dnes, zitra, tento tyden)
- Editace 5 poli per lead se zapisem zpet do Sheets
- Data: Google Sheets pres service account (read), Apps Script Web App (write — doPost chybi)
- Mock service pro lokalni vyvoj bez Sheets pripojeni
- Preview renderer (B-02): route `/preview/[slug]`, renderuje MVP landing page z hardcoded sample briefu. 6 sekci (hero, services, contact, reviews, location, faq) rizenych polem `suggested_sections` z B-01 contractu. Verejne pristupny bez auth.
- Bezi lokalne, neni nasazen na verejne URL

### Datove kontrakty a staging
- Scraping Job Input v1.0 (`docs/contracts/scraping-job-input.schema.json`) — kanonicky kontrakt pro jeden scraping job (1 job = 1 query na 1 portalu v 1 meste/segmentu). Definuje 12 poli, deterministicky `source_job_id` a lifecycle stavy.
- RAW_IMPORT staging layer v1.0 (`docs/contracts/raw-import-staging.md`) — kontrakt pro `_raw_import` system sheet, staging buffer mezi scraperem a LEADS. 16 sloupcu, 5-stavovy status model, 4-hodnotovy decision model.
- Normalization raw -> LEADS rules v1.0 (`docs/contracts/normalization-raw-to-leads.md`) — kontrakt pro transformaci surovych dat z `_raw_import` na LEADS radek. 23-field mapping, cleaning rules, reject policy, lead_id generation, 6 novych source_* metadata sloupcu.
- Kod jeste neni implementovan — pouze kontrakty a dokumentace.

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
- Apps Script Web App doPost handler (frontend writer existuje, server handler ne)

## Specifikace

- **Lead Lifecycle State Machine (CS1):** Autoritativni specifikace end-to-end lifecycle stavu leadu — viz `docs/21-business-process.md`. Definuje 18 canonical stavu (4 terminal, 3 review), 24 povolenych prechodu, derivacni pravidla z existujicich stage poli. Scope: od importu po reakci; WON/LOST jsou downstream mimo lifecycle. Implementace sloupce `lifecycle_state` neni soucasti CS1.
- **Workflow Orchestrator (CS2):** Logicka orchestracni vrstva nad lifecycle — viz `docs/24-automation-workflows.md`. Hybrid model (poll + manual + reactive), 17 eventu, formalni step kontrakt, run history design. Kompatibilni s existujicimi Apps Script triggery.
- **Reliability & Idempotency (CS3):** Idempotency keys, retry politika, dead-letter handling a locking pro vsechny automaticke workflow kroky — viz `docs/24-automation-workflows.md`. Definuje 12 kroku s idempotency strategii, retry matici (transient/permanent/ambiguous), dead-letter design v _asw_logs, lock pravidla pro Apps Script LockService.

## Co je rozpracovane

- Webhook pipeline pro preview weby — kod pripraveny, ENABLE_WEBHOOK=false, zadna cilova sluzba
- Google Auth Phase 1 — kod na feature branch task/B3-auth-phase1, ceka na .env.local a merge
- Email sending pres ESP (Phase 2) — architektura navrzena, implementace 0%
