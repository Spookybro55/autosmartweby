# Current State — Autosmartweby

> **Kanonicky dokument.** Aktualizuje se pri kazdem tasku, ktery meni stav systemu.
> **Posledni aktualizace:** 2026-04-05

---

## Souhrn

Autosmartweby je CRM system pro oslovovani malych ceskych firem (primarne remeslniku), ktere nemaji web nebo maji slaby web, s nabidkou tvorby personalizovaneho webu.

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
