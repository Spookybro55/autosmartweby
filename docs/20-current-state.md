# Current State — Autosmartweby

> **Kanonicky dokument.** Aktualizuje se pri kazdem tasku, ktery meni stav systemu.
> **Posledni aktualizace:** 2026-04-05 (Souhrn přepsán po hardening auditu)

---

## Souhrn

Autosmartweby je v aktuálním stavu poloautomatizovaný CRM systém pro oslovování českých živnostníků bez webových stránek.

**Commitnutý snapshot (lokální branch master, commit 7341cc8):**
- Google Apps Script backend (~4800 LOC, 9 souborů) pokrývá kvalifikaci leadů, generování briefů a e-mailových draftů, kód pro per-lead odesílání přes GmailApp, mailbox sync a write-back z odvozeného sheetu přes lead_id lookup (Variant B).
- Next.js 16 CRM frontend je v rané fázi a obsahuje přihlašovací stránku a základní layout. V commitnuté verzi neobsahuje dashboard ani funkční autentizaci.
- Pipeline běží v režimu DRY_RUN=true a standardně se zastaví ve stavu BRIEF_READY. Webhook pipeline v kódu existuje, ale je vypnutá (ENABLE_WEBHOOK=false).
- Veškerý vstup dat je manuální. Systém nescrapuje leady, negeneruje webové stránky a nemá hosting pipeline.

**Governance vrstva je definovaná v repu a lokálně validovaná, ale na GitHubu zatím nevynucovaná:**
- obsahuje kanonické dokumenty docs/20–29, task records systém se 3 ukázkovými záznamy, 4 automatizační skripty, CI workflow a PR template,
- check-doc-sync.mjs při lokálním běhu vrací 34 pass / 0 warn / 0 fail,
- workflow docs-governance.yml je definované pro PR do main, ale bez aktivních branch protection rules nemá blokovací efekt,
- část governance souborů je v nekonzistentním stavu kvůli OneDrive file locku: CLAUDE.md a docs/13-doc-update-rules.md zůstávají v aktivní starší verzi a nové verze existují jako .new soubory; část archivních duplikátů zůstává v kořenu docs/,
- známá dokumentační nesrovnalost: docs/23-data-model.md uvádí 43 rozšiřujících sloupců, zatímco Config.gs jich definuje 45.

**Mimo commitnutý snapshot existují lokální necommitnuté změny v working tree:**
- Google Auth Phase 1: 3 API routes, session hook a úpravy login page, headeru a sidebaru; tato vrstva existuje jen lokálně, není commitnutá, nemá task record a neprošla governance workflow,
- drobné změny v ContactSheet.gs a vybraných dokumentech docs/12, docs/15-* a docs/17,
- 4 auth dokumenty docs/18-* existují mimo kanonický rozsah docs/20–29 a nejsou zahrnuté do check-doc-sync validace.

**Branch stav není plně sjednocený:**
- lokálně se pracuje na master,
- GitHub remote používá main,
- commitnutý snapshot odpovídá commitu 7341cc8, zatímco working tree obsahuje další lokální necommitnuté změny, které na remote nejsou.

*Audit byl proveden k 2026-04-04.*

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
- Login (email+heslo + Google OAuth Phase 1 — ceka na .env setup)
- Dashboard (KPI: k osloveni, high priority, follow-upy, pipeline breakdown)
- Leads tabulka s filtrovanim, razenim, detail drawer
- Pipeline kanban (6 sloupcu, read-only, bez drag-drop)
- Follow-up timeline (po terminu, dnes, zitra, tento tyden)
- Editace 5 poli per lead se zapisem zpet do Sheets
- Bezi lokalne, neni nasazen na verejne URL

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
- CI/CD pipeline
- Testy
- Frontend deployment (Vercel/Netlify)

## Co je rozpracovane

- Webhook pipeline pro preview weby — kod pripraveny, ENABLE_WEBHOOK=false, zadna cilova sluzba
- Google Auth Phase 1 — kod hotovy, ceka na .env.local
- Email sending pres ESP (Phase 2) — architektura navrzena, implementace 0%
- Apps Script Web App endpoint — frontend writer existuje, server handler (doPost) chybi
