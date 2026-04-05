# Autosmartweby CRM -- Kompletni systemova mapa

> **Dokument:** Interni READ-ONLY mapovani CRM systemu
> **Datum:** 2026-04-04
> **Ucel:** Orientace v systemu, podklad pro dalsi rozvoj
> **Verze:** 1.0

---

## A. Executive Summary

Autosmartweby CRM je system postaveny na Google Sheets + Apps Script, ktery slouzi k systematickemu oslovovani malych firem bez webu nebo se slabym webem. System operuje nad jednim spreadsheetem (ID: `1RBcLZkn3AruiqaQdJ7PHIxvCcoO5SC9Qnlw_NiLnpYc`) se tremi sheety: **LEADS** (source of truth), **Ke kontaktovani** (derived working sheet pro obchodniky) a **_asw_logs** (systemovy log).

Architektura ma ctyri hlavni vrstvy: (1) **datova vrstva** -- puvodni business sloupce v LEADS (nazev firmy, mesto, email, telefon, web) plus 45 extension sloupcu pridanych systemem; (2) **pipeline vrstva** -- kvalifikace leadu, deduplikace, generovani preview webu, sestavovani email draftu; (3) **obchodni vrstva** -- derived sheet "Ke kontaktovani" s KPI dashboardem, editovatelnymi sloupci a write-back mechanismem; (4) **email vrstva** -- odesilani emailu pres Gmail, synchronizace vlaken, detekce odpovedi/bouncu/OOO.

Klicove sheety jsou LEADS (jediny zdroj pravdy, ~65 sloupcu), "Ke kontaktovani" (19 sloupcu, 5 editovatelnych s write-backem) a _asw_logs (append-only log s rotaci po 5000 radcich). System pouziva 9 Apps Script souboru: Config.gs, Helpers.gs, PreviewPipeline.gs, ContactSheet.gs, OutboundEmail.gs, MailboxSync.gs, GmailLabels.gs, LegacyWebCheck.gs a Menu.gs.

Nejdulezitejsi datove okruhy jsou: kvalifikace (lead_stage, qualified_for_preview, dedupe_flag), preview pipeline (preview_stage, template_type, preview_brief_json), obchodni workflow (outreach_stage, contact_ready, next_action) a email metadata (email_sync_status, email_reply_type, email_thread_id). System ma tri ortogonalni stavove osy: lead_stage (kvalifikacni), preview_stage (technicka pripravenost) a outreach_stage (obchodni progres).

Extension sloupce se NIKDY neprepisuji pres puvodni business data -- funkce `writeExtensionColumns_()` zapisuje jen extension rozsah. Jedina vyjimka je LegacyWebCheck.gs, ktery zapisuje primo do `website_url` a `has_website`. Write-back z "Ke kontaktovani" do LEADS funguje pro 5 sloupcu (outreach_stage, next_action, last_contact_at, next_followup_at, sales_note) s identity verifikaci a lock mechanismem.

Default konfigurace je `DRY_RUN=true` -- pipeline generuje briefy a drafty, ale nevola webhook. Existuje rollback copy spreadsheet (ID v Config.gs komentari, "NEDOTYKAT SE").

---

## B. Seznam vsech sheetu a jejich role

| Sheet | Role | Typ | Jak vznika | Kdo zapisuje |
|-------|------|-----|------------|--------------|
| **LEADS** | Single source of truth -- veskera CRM data | source | Rucni import + pipeline obohacovani | Rucne (business data), automaticky (extension columns), write-back z "Ke kontaktovani" (5 poli) |
| **Ke kontaktovani** | Derived working sheet pro obchodniky | derived | Kompletne generovan `refreshContactingSheet()` | Automaticky (cely sheet), rucne (5 editovatelnych sloupcu s write-backem) |
| **_asw_logs** | Operacni audit log | log | Automaticky vytvoren `ensureLogSheet_()` | Pouze automaticky -- `aswLog_()` z kazde funkce. Rotace: max 5000 radku, maze se 1000 nejstarsich |

### Vazby mezi sheety

```
LEADS (source of truth)
  |
  |-- [pipeline funkce] --> zapisuji extension sloupce zpet do LEADS
  |
  |-- [evaluateContactReadiness + refreshContactingSheet]
  |     cte LEADS --> filtruje contact-ready radky --> generuje "Ke kontaktovani"
  |
  |-- [onContactSheetEdit trigger]
  |     edity v "Ke kontaktovani" cols 7-11 --> write-back do LEADS
  |
  |-- [createCrmDraft / sendCrmEmail]
  |     cte vybrany radek z "Ke kontaktovani" --> overuje proti LEADS -->
  |     odesila email pres Gmail --> zapisuje metadata do LEADS
  |
  |-- [syncMailboxMetadata]
  |     cte LEADS emaily --> hleda v Gmail --> zapisuje metadata do LEADS
  |
  |-- [processMissingWebsites_]
  |     cte LEADS --> hleda na Serper API --> zapisuje web data do LEADS
  |
  +-- [aswLog_ ze vsech operaci] --> zapisuje do "_asw_logs"
```

### Externi zdroje (ne-sheety)

- **Gmail label:** `ASW/CRM` -- spravovan `ensureCrmLabels()`, aplikovan na vsechna CRM vlakna
- **Script Properties:** `SERPER_API_KEY` pro web-check
- **Rollback spreadsheet:** ID `14U9CC0q5gpFr2p7CD1s4rf3i0lCettIVYIqrO8lsj9c` (NEDOTYKAT SE)
- **Triggery:** 3 installable -- timer (processPreviewQueue 15 min), onOpen, onEdit

---

## C. LEADS -- Kompletni mapa sloupcu

### C.1 Legacy-Pinned Business Columns (hardcoded pozice v LEGACY_COL)

| Index | Header | Vyznam | Typ | Priklad | Kategorie | Rucni edit | Zapisuje | Cte/pouziva | Zavislosti | Poznamka |
|-------|--------|--------|-----|---------|-----------|------------|----------|-------------|------------|----------|
| 4 | `business_name` | Nazev firmy | text | "Novak Instalater s.r.o." | business | ANO | Uzivatel/import | qualifyLeads, computeCompanyKey_, buildPreviewBrief_, composeDraft_, buildContactRowV2_, OutboundEmail identity check | -- | KRITICKE: Write-back identity verifikace. Pokud se sloupec presune, system se rozbije. Runtime validace pres `validateLegacyColHeaders_` |
| 9 | `city` | Mesto | text | "Praha" | business | ANO | Uzivatel/import | qualifyLeads, computeCompanyKey_, buildPreviewBrief_, composeDraft_, formatLocationPhrase_, buildContactRowV2_ | -- | Pouziva se pro lokativ (v Praze, v Brne). Identity verifikace |
| 11 | `phone` | Telefon | text | "+420 777 123 456" | business | ANO | Uzivatel/import | evaluateQualification_, buildPreviewBrief_, buildContactRowV2_ | -- | Ovlivnuje contact_ready (staci email NEBO telefon) |
| 12 | `email` | E-mail | text | "info@novak.cz" | business | ANO | Uzivatel/import | evaluateQualification_, computeCompanyKey_, MailboxSync, OutboundEmail | -- | Hlavni cil outbound emailu. Free-domain detekce (seznam.cz apod.) |
| 13 | `website_url` | URL webu | URL | "https://novak.cz" | business | ANO | Uzivatel/import, LegacyWebCheck | resolveWebsiteState_, computeCompanyKey_, evaluateQualification_ | -- | Muze byt v KONFLIKTU s has_website |
| 20 | `has_website` | Deklarovany stav webu | text (bool) | "yes"/"no"/"ano" | business | ANO | Uzivatel/import, LegacyWebCheck | resolveWebsiteState_, evaluateQualification_ | -- | Pokud si odporuje s website_url -> stav CONFLICT |

### C.2 Name-Resolved Business Columns (pristup pres HeaderResolver)

| Header | Vyznam | Typ | Priklad | Kategorie | Rucni edit | Zapisuje | Cte/pouziva | Poznamka |
|--------|--------|-----|---------|-----------|------------|----------|-------------|----------|
| `ico` | ICO firmy | text/cislo | "12345678" | business | ANO | Uzivatel/import | computeCompanyKey_ | Nejvyssi priorita pro dedup klic (>=5 cislic) |
| `contact_name` | Kontaktni osoba | text | "Jan Novak" | business | ANO | Uzivatel/import | evaluateQualification_, buildPreviewBrief_, composeDraft_ | Ovlivnuje personalization_level. Prazdne = genericke osloveni |
| `segment` | Obor/segment | text | "instalater" | business | ANO | Uzivatel/import | chooseTemplateType_, buildPreviewBrief_ | Sirsi kategorie. Fallback pro service_type |
| `service_type` | Typ sluzby | text | "vodoinstalace" | business | ANO | Uzivatel/import | chooseTemplateType_, composeDraft_, buildContactRowV2_ | Konkretnejsi nez segment. Humanizace pres humanizeServiceType_() |
| `website_quality` | Kvalita webu | text | "poor"/"good" | business | ANO | Uzivatel/import | resolveWebsiteState_ | Kontrola proti WEAK_WEBSITE_KEYWORDS |
| `has_cta` | Ma web CTA? | text (bool) | "yes"/"no" | business | ANO | Uzivatel/import | resolveWebsiteState_, composeDraft_ | Relevantni jen kdyz web existuje |
| `mobile_ok` | Je web mobilni? | text (bool) | "yes"/"no" | business | ANO | Uzivatel/import | resolveWebsiteState_, composeDraft_ | Relevantni jen kdyz web existuje |
| `pain_point` | Pain point firmy | text | "Zakaznici nas nenachazi online" | business | ANO | Uzivatel/import | buildPreviewBrief_, composeDraft_, buildContactRowV2_ | Pouziva se v emailu a jako summary |
| `rating` | Hodnoceni (Google/recenze) | cislo | "4.5" | business | ANO | Uzivatel/import | evaluateQualification_, buildPreviewBrief_ | >=4.0 = zobrazi se v benefits, >=3.5 = reviews sekce |
| `reviews_count` | Pocet recenzi | cislo | "23" | business | ANO | Uzivatel/import | buildPreviewBrief_ | Jen kdyz rating existuje |
| `area` | Oblast/region | text | "Stredocesky kraj" | business | ANO | Uzivatel/import | buildPreviewBrief_ | Fallback pro lokaci kdyz chybi city |
| `source` | Zdroj dat | text | "firmy.cz" | business | ANO | Uzivatel/import | processPreviewQueue (webhook) | Informacni, predava se do webhooku |
| `created_at` | Datum vytvoreni leadu | datum | "2025-03-15" | business | ANO | Uzivatel/import | processPreviewQueue (webhook) | Informacni |

### C.3 Legacy Web-Check Helper Columns (dynamicky vytvorene)

Vytvorene `ensureLegacyHelperColumns_()` v LegacyWebCheck.gs.

| Header | Vyznam | Typ | Priklad | Kategorie | Rucni edit | Zapisuje | Poznamka |
|--------|--------|-----|---------|-----------|------------|----------|----------|
| `website_check_note` | Poznamka z web checku | text | "FOUND_BY_SEARCH \| score=7 \| http_200" | helper | NE | LegacyWebCheck | Diagnosticke |
| `website_check_confidence` | Duvera web checku | cislo | "0.95" | helper | NE | LegacyWebCheck | 0-1 skala |
| `website_checked_at` | Cas web checku | datum | "2025-03-20T10:30:00" | helper | NE | LegacyWebCheck | Timestamp |

### C.4 Extension Columns (append-only, 45 sloupcu)

Pridane `setupPreviewExtension()`, zapisovane VYLUCNE pres `writeExtensionColumns_()`.

| # | Header | Vyznam | Typ | Priklad | Kategorie | Rucni edit | Zapisuje | Cte/pouziva | Kriticke pro | Poznamka |
|---|--------|--------|-----|---------|-----------|------------|----------|-------------|--------------|----------|
| 1 | `company_key` | Dedup klic firmy | text | "ico:12345678" / "dom:novak.cz" / "name:novak\|praha" | extension | NE | qualifyLeads | qualifyLeads (dedup), webhook | pipeline | Priorita: ico > domena > email domena > nazev+mesto |
| 2 | `branch_key` | Unikatni klic radku | text | "lid:asw-abc123" / "row:5" | extension | NE | qualifyLeads | webhook | pipeline | Fallback na cislo radku |
| 3 | `dedupe_group` | ID dedup skupiny | text | "ico:12345678" | extension | NE | qualifyLeads | qualifyLeads | pipeline | Stejna hodnota jako company_key |
| 4 | `dedupe_flag` | Je to duplicita? | bool (text) | "TRUE"/"FALSE" | extension | NE | qualifyLeads | buildContactReadiness_, processPreviewQueue, buildEmailDrafts | pipeline | TRUE = ne-prvni v grupe, preskakuje se |
| 5 | `lead_stage` | Kvalifikacni stav leadu | enum | NEW/QUALIFIED/DISQUALIFIED/REVIEW/IN_PIPELINE/PREVIEW_SENT | extension | NE | qualifyLeads, processPreviewQueue | buildContactReadiness_, qualifyLeads (guard) | pipeline | IN_PIPELINE a PREVIEW_SENT jsou chranene pred re-kvalifikaci |
| 6 | `preview_stage` | Stav generovani preview | enum | NOT_STARTED/BRIEF_READY/QUEUED/SENT_TO_WEBHOOK/READY/REVIEW_NEEDED/FAILED | extension | NE | qualifyLeads, processPreviewQueue | buildContactReadiness_, processPreviewQueue, derivePreviewDisplay_ | pipeline | Stavovy automat s definovanymi prechody |
| 7 | `outreach_stage` | Obchodni stav komunikace | enum | NOT_CONTACTED/DRAFT_READY/CONTACTED/RESPONDED/WON/LOST | extension | ANO (pres "Ke kontaktovani" col 7) | qualifyLeads, buildEmailDrafts, processPreviewQueue, OutboundEmail, write-back | buildContactReadiness_, composeDraft_, OutboundEmail guard | pipeline, email, write-back | JEDINY extension sloupec s bidirekcnim tokem. Automaticke zapisy jen "upgraduj, nikdy nedegraduj" |
| 8 | `qualified_for_preview` | Prosel kvalifikaci? | bool (text) | "TRUE"/"FALSE" | extension | NE | qualifyLeads | buildContactReadiness_, processPreviewQueue, buildEmailDrafts | pipeline | Branka pro vsechny pipeline operace |
| 9 | `qualification_reason` | Duvod kvalifikace/vyrazeni | text | "NO_WEBSITE; data=4/6; nema web" | extension | NE | qualifyLeads | -- (diagnosticke) | -- | Lidsky citelne vysvetleni |
| 10 | `template_type` | Vybrany typ sablony | text | "plumber-no-website" | extension | NE | processPreviewQueue, refreshProcessedPreviewCopy | webhook | pipeline | Format: {obor}-{stav_webu} |
| 11 | `preview_slug` | URL slug pro preview | text | "novak-instalater-praha" | extension | NE | processPreviewQueue | -- | pipeline | Max 60 znaku, bez diakritiky |
| 12 | `preview_url` | URL vygenerovaneho preview | URL | "https://preview.autosmartweby.cz/novak" | extension | NE | processPreviewQueue (z webhook response) | derivePreviewDisplay_, buildContactRowV2_ | pipeline | Z webhook odpovedi |
| 13 | `preview_screenshot_url` | Screenshot preview | URL | "https://cdn..." | extension | NE | processPreviewQueue | -- | -- | Z webhook odpovedi |
| 14 | `preview_generated_at` | Cas generovani preview | datum | "2025-03-20T14:30:00" | extension | NE | processPreviewQueue | -- | -- | |
| 15 | `preview_version` | Verze preview | text | "v2.1" | extension | NE | processPreviewQueue | -- | -- | Z webhook odpovedi |
| 16 | `preview_brief_json` | Kompletni brief jako JSON | json | `{"business_name":"Novak",...}` | extension | NE | processPreviewQueue, refreshProcessedPreviewCopy | runWebhookPilotTest | pipeline | Velky JSON blob |
| 17 | `preview_headline` | Generovany titulek | text | "Novak Instalater \| instalaterske sluzby v Praze" | extension | NE | processPreviewQueue | buildContactRowV2_ (fallback summary) | pipeline | Ceska gramatika pres buildNaturalHeadline_ |
| 18 | `preview_subheadline` | Generovany podtitulek | text | "Profesionalni sluzby v Praze a okoli" | extension | NE | processPreviewQueue | -- | pipeline | |
| 19 | `preview_cta` | Call-to-action text | text | "Zavolejte nam: +420 777 123 456" | extension | NE | processPreviewQueue | -- | pipeline | Preferuje telefon |
| 20 | `preview_quality_score` | Skore kvality z webhooku | cislo | "0.85" | extension | NE | processPreviewQueue | processPreviewQueue (threshold) | pipeline | <0.7 = REVIEW_NEEDED |
| 21 | `preview_needs_review` | Preview vyzaduje kontrolu? | bool (text) | "TRUE"/"FALSE" | extension | NE | processPreviewQueue | -- | pipeline | |
| 22 | `send_allowed` | Lze poslat email? | bool (text) | "TRUE"/"FALSE" | extension | NE | qualifyLeads | processPreviewQueue, buildEmailDrafts | pipeline, email | TRUE jen kdyz lead ma email |
| 23 | `personalization_level` | Uroven personalizace | enum | "basic"/"medium"/"high" | extension | NE | qualifyLeads | -- (informacni) | -- | 0-2=basic, 3-4=medium, 5-6=high z 6 datovych bodu |
| 24 | `webhook_payload_json` | Payload webhooku jako JSON | json | `{"spreadsheet_id":"..."}` | extension | NE | processPreviewQueue | -- (diagnosticke/replay) | -- | Velky JSON |
| 25 | `preview_error` | Chybova zprava z pipeline | text | "WEBHOOK_ERROR: HTTP 500" | extension | NE | processPreviewQueue | -- | -- | Vymazana pri uspechu |
| 26 | `last_processed_at` | Posledni zpracovani | datum | "2025-03-20T14:30:00" | extension | NE | processPreviewQueue, refreshProcessedPreviewCopy | -- | -- | |
| 27 | `email_subject_draft` | Navrh predmetu emailu | text | "Webova prezentace pro Novak Instalater" | extension | NE | buildEmailDrafts, processPreviewQueue | buildContactReadiness_, buildContactRowV2_, OutboundEmail | pipeline, email | Situacne zavisle na stavu webu |
| 28 | `email_body_draft` | Navrh tela emailu | text | "Dobry den, ..." | extension | NE | buildEmailDrafts, processPreviewQueue | buildContactRowV2_, OutboundEmail | email | Obsahuje placeholdery [Vase jmeno], [Telefon / E-mail] |
| 29 | `contact_ready` | Je lead pripraveny k osloveni? | bool (text) | "TRUE"/"FALSE" | extension | NE (COMPUTED) | evaluateContactReadiness, refreshContactingSheet | refreshContactingSheet (filtr) | pipeline | Plne prepocteny pri kazdem refreshi. NEEDITOVAT! |
| 30 | `contact_reason` | Duvod pripravenosti/nepripravenosti | text | "Nema web . draft pripraven" | extension | NE (COMPUTED) | evaluateContactReadiness, refreshContactingSheet | buildContactRowV2_ | -- | Cesky text s oddelovaci |
| 31 | `contact_priority` | Priorita osloveni | enum | HIGH/MEDIUM/LOW | extension | NE (COMPUTED) | evaluateContactReadiness, refreshContactingSheet | buildContactRowV2_, razeni | pipeline | HIGH = nema/slaby web + draft + email |
| 32 | `next_action` | Navrhovany dalsi krok | text | "Oslovit"/"Zavolat" | extension | ANO (pres "Ke kontaktovani" col 8) | deriveNextAction_ (auto), write-back | buildContactRowV2_ | write-back | Auto-odvozeny pokud prazdny, jinak uzivatelska hodnota |
| 33 | `last_contact_at` | Datum posledniho kontaktu | datum | "2025-03-20" | extension | ANO (pres "Ke kontaktovani" col 9) | write-back, OutboundEmail (pri SEND) | buildContactRowV2_ | write-back | |
| 34 | `next_followup_at` | Planovany follow-up | datum | "2025-03-27" | extension | ANO (pres "Ke kontaktovani" col 10) | write-back | buildContactRowV2_ | write-back | Nikdy nenastaveny pipeline -- ciste uzivatelske pole |
| 35 | `sales_note` | Obchodni poznamka | text | "Zavolal, ma zajem" | extension | ANO (pres "Ke kontaktovani" col 11) | write-back | buildContactRowV2_ | write-back | Nikdy nenastaveny pipeline -- ciste uzivatelske pole |
| 36 | `lead_id` | Stabilni ID leadu | id | "ASW-m1abc2de-f3g4" | extension | NE (imutabilni) | ensureLeadIds | computeBranchKey_, webhook | pipeline | Jednou nastaveny, nikdy se neprepise |
| 37 | `email_thread_id` | Gmail thread ID | id | "18e4f5a6b7c8d9e0" | extension | NE | OutboundEmail, MailboxSync | MailboxSync (resync check) | sync, email | Propojuje CRM radek s Gmail vlaknem |
| 38 | `email_last_message_id` | Gmail message ID posledni zpravy | id | "18e4f5a6b7c8d9e0" | extension | NE | OutboundEmail, MailboxSync | -- | sync | |
| 39 | `last_email_sent_at` | Cas posledniho odeslaneho emailu | datum (ISO) | "2025-03-20T14:30:00.000Z" | extension | NE | OutboundEmail, MailboxSync | OutboundEmail (double-send ochrana 5 min) | email | KRITICKE pro ochranu proti dvojitemu odeslani |
| 40 | `last_email_received_at` | Cas posledniho prijateho emailu | datum (ISO) | "2025-03-21T09:15:00.000Z" | extension | NE | MailboxSync | -- | sync | |
| 41 | `email_sync_status` | Stav sync s Gmailem | enum | NOT_LINKED/NOT_FOUND/REVIEW/DRAFT_CREATED/SENT/LINKED/REPLIED/ERROR | extension | NE | MailboxSync, OutboundEmail | MailboxSync (resync rozhodovani) | sync, email | LINKED/REPLIED/SENT spousti resync |
| 42 | `email_reply_type` | Typ odpovedi | enum | NONE/REPLY/BOUNCE/OOO/UNKNOWN | extension | NE | MailboxSync | -- | sync | Bounce/OOO detekce klicovymi slovy |
| 43 | `email_mailbox_account` | Gmail ucet pouzity pro sync | text | "sales@autosmartweby.cz" | extension | NE | MailboxSync, OutboundEmail | -- | sync | |
| 44 | `email_subject_last` | Predmet posledniho emailu ve vlakne | text | "Re: Webova prezentace pro Novak" | extension | NE | MailboxSync, OutboundEmail | -- | sync | Orezany na 200 znaku |
| 45 | `email_last_error` | Posledni chyba email operaci | text | "Gmail search failed: quota exceeded" | extension | NE | MailboxSync, OutboundEmail | -- (diagnosticke) | -- | Vymazana pri uspechu |

---

## D. "Ke kontaktovani" -- Kompletni mapa sloupcu

**Layout:** Radky 1-4 = KPI dashboard, Radek 5 = hlavicka (frozen), Radek 6+ = data. Sloupce 12-19 = skryty detail group.

| Col | Header | Vyznam | Typ | Priklad | Viditelnost | Rucni edit | Zapisuje | Cte/pouziva | Write-back | Cilovy sloupec v LEADS | Poznamka |
|-----|--------|--------|-----|---------|-------------|------------|----------|-------------|------------|----------------------|----------|
| 1 | `Priorita` | Priorita osloveni | enum | "HIGH" | visible | NE | refreshContactingSheet | razeni | NE | -- | Razeno HIGH > MEDIUM > LOW |
| 2 | `Firma` | Nazev firmy + mesto | text (2 radky) | "Novak Instalater\nPraha" | visible | NE | refreshContactingSheet | OutboundEmail identity check, write-back identity | NE | -- | Parsovano splitovanim na newline |
| 3 | `Duvod osloveni` | Duvod proc oslovit | text | "Nema web . draft pripraven" | visible | NE | refreshContactingSheet | uzivatel | NE | -- | |
| 4 | `Preview` | Stav/odkaz na preview | text/hyperlink | "* Otevrit preview" | visible | NE | refreshContactingSheet | uzivatel | NE | -- | HYPERLINK formula kdyz URL existuje |
| 5 | `Telefon` | Telefon | text | "+420 777 123 456" / "---" | visible | NE | refreshContactingSheet | uzivatel | NE | -- | Em-dash kdyz chybi |
| 6 | `E-mail` | Email | text | "info@novak.cz" / "---" | visible | NE | refreshContactingSheet | OutboundEmail (rowData[5]) | NE | -- | OutboundEmail cte fixni pozici! |
| **7** | **`Stav`** (ikona tuzky) | Obchodni stav (cesky) | enum (dropdown) | "Neosloveno"/"Pripraveno"/"Osloveno"/"Reagoval"/"Zajem"/"Nezajem" | **visible, EDITABLE** | **ANO** | refreshContactingSheet, onContactSheetEdit | OutboundEmail guard | **ANO** | `outreach_stage` | Dropdown validace. Reverse-humanizace pri write-back |
| **8** | **`Dalsi krok`** (ikona tuzky) | Dalsi akce | enum (dropdown) | "Oslovit"/"Zavolat"/"Poslat e-mail"/"Cekat na odpoved" | **visible, EDITABLE** | **ANO** | refreshContactingSheet, onContactSheetEdit | uzivatel | **ANO** | `next_action` | Auto-odvozeny pokud prazdny. AllowInvalid=true |
| **9** | **`Posledni kontakt`** (ikona tuzky) | Datum posledniho kontaktu | datum | "20.3.2025" | **visible, EDITABLE** | **ANO** | refreshContactingSheet, onContactSheetEdit | uzivatel | **ANO** | `last_contact_at` | Date validace |
| **10** | **`Follow-up`** (ikona tuzky) | Datum follow-up | datum | "27.3.2025" | **visible, EDITABLE** | **ANO** | refreshContactingSheet, onContactSheetEdit | uzivatel | **ANO** | `next_followup_at` | Date validace |
| **11** | **`Poznamka`** (ikona tuzky) | Volny text | text | "Ma zajem, zavolat v pondeli" | **visible, EDITABLE** | **ANO** | refreshContactingSheet, onContactSheetEdit | uzivatel | **ANO** | `sales_note` | Bez omezeni delky |
| 12 | `Kontaktni osoba` | Kontaktni osoba | text | "Jan Novak" / "---" | detail (collapsed) | NE | refreshContactingSheet | uzivatel | NE | -- | |
| 13 | `Typ sluzby` | Humanizovany typ sluzby | text | "instalaterske sluzby" | detail (collapsed) | NE | refreshContactingSheet | uzivatel | NE | -- | service_type || segment, humanizovane |
| 14 | `Kanal` | Preferovany kanal | enum | "E-mail"/"Telefon"/"---" | detail (collapsed) | NE | refreshContactingSheet | uzivatel | NE | -- | Odvozeno z pritomnosti email/phone |
| 15 | `Shrnuti` | Kratke shrnuti | text | "Zakaznici nas nenachazi online" | detail (collapsed) | NE | refreshContactingSheet | uzivatel | NE | -- | pain_point, fallback: preview_headline |
| 16 | `Predmet e-mailu` | Navrh predmetu | text | "Webova prezentace pro Novak" | detail (collapsed) | NE | refreshContactingSheet | OutboundEmail (rowData[15]) | NE | -- | OutboundEmail cte fixni pozici! |
| 17 | `Navrh zpravy` | Navrh tela emailu | text | "Dobry den, ..." | detail (collapsed) | NE | refreshContactingSheet | OutboundEmail (rowData[16]) | NE | -- | OutboundEmail cte fixni pozici! |
| 18 | `Pipeline stav` | Raw outreach_stage | enum | "NOT_CONTACTED"/"CONTACTED" | detail (collapsed) | NE | refreshContactingSheet | OutboundEmail (rowData[17]) guard | NE | -- | POZOR: Stejne pole jako col 7, ale raw (ne humanizovane). WON/LOST blokuje odeslani |
| 19 | `CRM radek` | Cislo zdrojoveho radku v LEADS | cislo | 42 | detail (collapsed) | NE | refreshContactingSheet | onContactSheetEdit, OutboundEmail | NE | -- | KRITICKE: Pokud se radky v LEADS presunuly, reference zastarala! |

### Write-back mapovani (WRITEBACK_MAP_)

| "Ke kontaktovani" col | Header | LEADS sloupec | Transformace |
|------------------------|--------|---------------|--------------|
| 7 | Stav | outreach_stage | reverseHumanizeOutreachStage_(): Neosloveno->NOT_CONTACTED, Pripraveno->DRAFT_READY, Osloveno->CONTACTED, Reagoval->RESPONDED, Zajem->WON, Nezajem->LOST |
| 8 | Dalsi krok | next_action | primo (bez transformace) |
| 9 | Posledni kontakt | last_contact_at | primo |
| 10 | Follow-up | next_followup_at | primo |
| 11 | Poznamka | sales_note | primo |

### Write-back bezpecnostni mechanismy
1. Sheet name guard (musi byt "Ke kontaktovani")
2. Row guard (radek >= 6)
3. Column guard (sloupec musi byt v WRITEBACK_MAP_, tj. 7-11)
4. LockService (tryLock 2s timeout)
5. CRM row validace (col 19 musi byt platne cislo)
6. Legacy col header validace (validateLegacyColHeaders_)
7. Identity verifikace (business_name + city musi sedeti mezi sheety)

---

## E. Data Lineage Mapa

### E.1 Qualification / Preview

```
                evaluateQualification_()
                        |
    +-------------------+-------------------+
    |                   |                   |
lead_stage         qualified_for_preview  send_allowed
(NEW/QUALIFIED/    (TRUE/FALSE)           (TRUE pokud ma email)
 DISQUALIFIED/                              |
 REVIEW)                                    v
    |                                  buildEmailDrafts()
    v                                  processPreviewQueue()
processPreviewQueue()                       |
(QUALIFIED -> IN_PIPELINE)                  v
                                    email_subject_draft
                                    email_body_draft
```

| Pole | Kde vznika | Kdo prepisuje | Kdo cte | Co z nej vznika |
|------|-----------|---------------|---------|-----------------|
| `lead_stage` | qualifyLeads() -> evaluateQualification_() | processPreviewQueue() (QUALIFIED->IN_PIPELINE) | buildContactReadiness_() (DISQUALIFIED/REVIEW blokuji) | Gatekeeping pipeline |
| `qualified_for_preview` | qualifyLeads() | -- (chraneno pro advanced stages) | processPreviewQueue, buildEmailDrafts, buildContactReadiness_ | Branka pro pipeline |
| `qualification_reason` | qualifyLeads() | -- | -- (diagnosticke) | -- |
| `dedupe_group` | qualifyLeads() -> computeCompanyKey_() | -- | -- (in-memory pouziti) | dedupe_flag |
| `dedupe_flag` | qualifyLeads() | -- | processPreviewQueue, buildEmailDrafts, buildContactReadiness_ | Preskoceni duplicit |
| `preview_stage` | qualifyLeads (NOT_STARTED) | processPreviewQueue (BRIEF_READY->QUEUED->SENT_TO_WEBHOOK->READY/REVIEW_NEEDED/FAILED) | buildContactReadiness_, processPreviewQueue, derivePreviewDisplay_ | Inkluze do contact sheetu |
| `template_type` | processPreviewQueue -> chooseTemplateType_() | refreshProcessedPreviewCopy | webhook payload | Vizualni sablona |
| `preview_slug` | processPreviewQueue -> buildSlug_() | refreshProcessedPreviewCopy | -- | URL generovani |
| `preview_brief_json` | processPreviewQueue -> buildPreviewBrief_() | refreshProcessedPreviewCopy | runWebhookPilotTest | Webhook payload |
| `email_subject_draft` | processPreviewQueue/buildEmailDrafts -> composeDraft_() | refreshProcessedPreviewCopy | buildContactReadiness_, OutboundEmail | Email odeslani |
| `email_body_draft` | processPreviewQueue/buildEmailDrafts -> composeDraft_() | refreshProcessedPreviewCopy | OutboundEmail | Email odeslani |
| `send_allowed` | qualifyLeads() | -- | processPreviewQueue, buildEmailDrafts | Branka pro email draft |
| `personalization_level` | qualifyLeads() | -- | -- (informacni) | -- |

### E.2 Sales Workflow

| Pole | Kde vznika | Kdo prepisuje | Kdo cte | Co z nej vznika |
|------|-----------|---------------|---------|-----------------|
| `outreach_stage` | qualifyLeads (NOT_CONTACTED) | processPreviewQueue/buildEmailDrafts (->DRAFT_READY), OutboundEmail (->CONTACTED), write-back (cokoliv) | buildContactReadiness_, OutboundEmail guard, deriveNextAction_ | Humanizovany "Stav" v contact sheetu |
| `contact_ready` | evaluateContactReadiness/refreshContactingSheet -> buildContactReadiness_() | Prepocteny pri kazdem refreshi | refreshContactingSheet (filtr) | Inkluze do contact sheetu |
| `contact_reason` | buildContactReadiness_() | Prepocteny pri kazdem refreshi | buildContactRowV2_ | "Duvod osloveni" |
| `contact_priority` | buildContactReadiness_() | Prepocteny pri kazdem refreshi | buildContactRowV2_, razeni | "Priorita" |
| `next_action` | deriveNextAction_() (pokud prazdny) | write-back (uzivatel) | buildContactRowV2_ | "Dalsi krok" |
| `last_contact_at` | OutboundEmail (pri SEND) | write-back (uzivatel) | buildContactRowV2_ | "Posledni kontakt" |
| `next_followup_at` | -- (nikdy pipeline) | write-back (uzivatel) | buildContactRowV2_ | "Follow-up" |
| `sales_note` | -- (nikdy pipeline) | write-back (uzivatel) | buildContactRowV2_ | "Poznamka" |

### E.3 Email / Gmail

| Pole | Kde vznika | Kdo prepisuje | Kdo cte | Co z nej vznika |
|------|-----------|---------------|---------|-----------------|
| `lead_id` | ensureLeadIds() | -- (imutabilni) | computeBranchKey_, webhook | branch_key |
| `email_thread_id` | OutboundEmail (po draft/send) | MailboxSync (pri sync) | MailboxSync (resync rozhodovani) | Resync existujiciho vlakna |
| `email_last_message_id` | OutboundEmail | MailboxSync | -- | -- |
| `last_email_sent_at` | OutboundEmail (pri SEND) | MailboxSync | OutboundEmail (double-send ochrana 5 min) | Double-send guard |
| `last_email_received_at` | MailboxSync | -- | -- | -- |
| `email_sync_status` | OutboundEmail (DRAFT_CREATED/SENT) | MailboxSync (LINKED/REPLIED/NOT_FOUND/REVIEW/ERROR) | MailboxSync (resync eligibilita) | Resync chovani |
| `email_reply_type` | MailboxSync -> classifyReplyType_() | -- | -- (informacni) | -- |
| `email_mailbox_account` | OutboundEmail, MailboxSync | -- | -- | -- |
| `email_subject_last` | OutboundEmail, MailboxSync | -- | -- | -- |
| `email_last_error` | MailboxSync, OutboundEmail (pri chybe) | Vymazana pri uspechu | -- (diagnosticke) | -- |

### E.4 Write-back tok dat

```
LEADS                          "Ke kontaktovani"
outreach_stage  <--- humanize ---> Stav (col 7)
next_action     <--- primo ------> Dalsi krok (col 8)
last_contact_at <--- primo ------> Posledni kontakt (col 9)
next_followup_at<--- primo ------> Follow-up (col 10)
sales_note      <--- primo ------> Poznamka (col 11)

Smer: LEADS -> "Ke kontaktovani" pri refreshContactingSheet()
Smer: "Ke kontaktovani" -> LEADS pri onContactSheetEdit()
```

**Co je jen display (read-only):** sloupce 1-6, 12-19 v "Ke kontaktovani"
**Co je source for edit:** sloupce 7-11 v "Ke kontaktovani" (write-back do LEADS)

---

## F. Menu / Triggery / Entrypoints

### F.1 Menu "Autosmartweby CRM"

| # | Polozka | Funkce | Co meni | Ovlivnene sheety/sloupce |
|---|---------|--------|---------|--------------------------|
| 1 | Setup preview extension | `setupPreviewExtension` | Prida extension sloupce | LEADS (hlavickovy radek), _asw_logs (vytvori) |
| 2 | Ensure lead IDs | `ensureLeadIds` | Doplni lead_id | LEADS: lead_id |
| 3 | Qualify leads | `qualifyLeads` | Kvalifikace + dedup | LEADS: company_key, branch_key, dedupe_*, lead_stage, qualified_for_preview, qualification_reason, send_allowed, personalization_level, preview_stage, outreach_stage |
| 4 | Process preview queue | `processPreviewQueue` | Pipeline zpracovani | LEADS: template_type, preview_brief_json, preview_headline/subheadline/cta, preview_slug, preview_stage, email_subject/body_draft, outreach_stage, webhook_*, preview_*, lead_stage, last_processed_at |
| 5 | Rebuild drafts | `buildEmailDrafts` | Prebuilduje email drafty | LEADS: email_subject_draft, email_body_draft, outreach_stage |
| 6 | Simulace + zapis (dry run) | `simulateAndWrite` | Kvalifikace + pipeline (DRY_RUN) | LEADS: vse z qualify + process (bez webhooku) |
| 7 | Audit sheet structure (read-only) | `auditCurrentSheetStructure` | NIC (read-only) | -- |
| 8 | Webhook pilot test (5-10 rows) | `runWebhookPilotTest` | Testuje webhook | LEADS: webhook_payload_json, preview_stage, preview_url, preview_screenshot_url, preview_generated_at, preview_version, preview_quality_score, preview_needs_review, preview_error, last_processed_at |

### F.1b Submenu "Ke kontaktovani"

| # | Polozka | Funkce | Co meni |
|---|---------|--------|---------|
| 9 | Evaluate contact readiness | `evaluateContactReadiness` | LEADS: contact_ready, contact_reason, contact_priority |
| 10 | Refresh "Ke kontaktovani" | `refreshContactingSheet` | LEADS: contact_* poli + cely sheet "Ke kontaktovani" (kompletni rebuild) |

### F.1c Submenu "E-mail"

| # | Polozka | Funkce | Co meni |
|---|---------|--------|---------|
| 11 | Create draft pro vybrany lead | `createCrmDraft` | LEADS: email_thread_id, email_last_message_id, email_subject_last, email_mailbox_account, email_last_error, email_sync_status=DRAFT_CREATED. Gmail: vytvori draft, oznaci ASW/CRM |
| 12 | Odeslat e-mail pro vybrany lead | `sendCrmEmail` | LEADS: vse z create + last_email_sent_at, outreach_stage=CONTACTED, last_contact_at. Gmail: odesle email, oznaci ASW/CRM |
| 13 | Sync mailbox metadata | `syncMailboxMetadata` | LEADS: email_thread_id, email_last_message_id, email_subject_last, email_mailbox_account, email_reply_type, email_last_error, email_sync_status, last_email_sent_at, last_email_received_at. Gmail: oznaci vlakna ASW/CRM |
| 14 | Ensure CRM labels (ASW/CRM) | `ensureCrmLabels` | Gmail: vytvori label ASW/CRM |
| 15 | Install ALL triggers | `installProjectTriggers` | Script triggers (3x) |

### F.2 Menu "Web check"

| # | Polozka | Funkce | Co meni |
|---|---------|--------|---------|
| 1 | Ulozit Serper API key | `setSerperApiKey` | ScriptProperties: SERPER_API_KEY |
| 2 | Zkontrolovat 20 radku | `runWebsiteCheck20` | LEADS: website_url, has_website, website_check_note/confidence/checked_at |
| 3 | Zkontrolovat 50 radku | `runWebsiteCheck50` | (totez, limit 50) |
| 4 | Zkontrolovat 100 radku | `runWebsiteCheck100` | (totez, limit 100) |

### F.3 Triggery

| Typ | Funkce | Definovan v | Co meni | Installer |
|-----|--------|------------|---------|-----------|
| Simple onOpen | `onOpen` | Menu.gs | Nic (build menu) | automaticky |
| Installable onOpen | `onOpen` | Menu.gs | Nic (build menu) | installMenuTrigger(), installProjectTriggers() |
| Installable onEdit | `onContactSheetEdit` | ContactSheet.gs | LEADS: write-back cols 7-11 | installContactEditTrigger(), installProjectTriggers() |
| Time-driven (15 min) | `processPreviewQueue` | PreviewPipeline.gs | LEADS: pipeline extension sloupce | installProjectTriggers() |

### F.4 Skryta funkce (neni v menu)

- `refreshProcessedPreviewCopy()` (PreviewPipeline.gs) -- prebuilduje briefy/drafty pro jiz zpracovane radky. Spustitelna jen z editoru.

---

## G. Lidske vysvetleni systemu

### G.1 Jak s tim pracuje obchodnik

1. **Otevrte spreadsheet** -- menu se nacte automaticky
2. **Kliknete "Ke kontaktovani" -> "Refresh Ke kontaktovani"** -- system vygeneruje cerstvy pracovni list
3. **Prepnete na list "Ke kontaktovani"** -- vidite dashboard s pocty a tabulku serazenou podle priority
4. **Pracujete se sloupci s ikonou tuzky:** Stav, Dalsi krok, Posledni kontakt, Follow-up, Poznamka
5. **Kdyz chcete poslat email:** vyberete radek, menu "E-mail" -> "Create draft" (vytvori koncept v Gmailu) nebo "Odeslat e-mail" (posle rovnou)
6. **Zmeny se automaticky propisuji** zpet do hlavniho listu LEADS
7. **"Zajem"** = klient ma zajem (WON), **"Nezajem"** = klient nema zajem (LOST) -- oba zmizi z listu

### G.2 Jak s tim pracuje admin/developer

1. **Config.gs** -- vsechny konstanty, feature flagy (DRY_RUN, ENABLE_WEBHOOK), enums
2. **Helpers.gs** -- HeaderResolver, logging, normalizace, resolveWebsiteState_()
3. **PreviewPipeline.gs** -- jadro: qualify, process, briefs, drafts, webhook
4. **ContactSheet.gs** -- derived sheet, write-back, contact readiness
5. **OutboundEmail.gs** -- Gmail draft/send, identity verifikace, double-send ochrana
6. **MailboxSync.gs** -- Gmail read-only sync, reply/bounce/OOO detekce
7. **GmailLabels.gs** -- Gmail label management
8. **LegacyWebCheck.gs** -- Serper API web lookup
9. **Menu.gs** -- custom menu

### G.3 Co se NIKDY nesmi rucne menit

- Extension sloupce v LEADS (company_key az email_last_error) -- krome 5 write-back poli
- Read-only sloupce v "Ke kontaktovani" (1-6, 12-19)
- List _asw_logs
- lead_id (jednou prideleny)
- contact_ready, contact_reason, contact_priority (computed pri kazdem refreshi)
- Hardcoded pozice sloupcu v LEADS (nepridavejte sloupce pred pozici 20!)

### G.4 Co je bezpecne rucne menit

- **V "Ke kontaktovani":** sloupce 7-11 (Stav, Dalsi krok, Posledni kontakt, Follow-up, Poznamka)
- **V LEADS:** business data (nazev firmy, mesto, email, telefon, web, ICO, kontakt, segment...)
- **V Config.gs:** DRY_RUN, ENABLE_WEBHOOK, WEBHOOK_URL, BATCH_SIZE, EMAIL_MAILBOX_ACCOUNT

### G.5 Bezny workflow od leadu po e-mail

```
1. Import leadu do LEADS (rucne/CSV)
     |
2. Menu: Web check (volitelne) -- doplni website_url
     |
3. Menu: Qualify leads -- kvalifikace, dedup, lead_stage
     |
4. Menu: Process preview queue -- briefy, drafty, preview
     |
5. Menu: Ke kontaktovani -> Refresh -- vygeneruje pracovni list
     |
6. Obchodnik: vybere radek v "Ke kontaktovani"
     |
7. Menu: E-mail -> Create draft / Odeslat e-mail
     |
8. Menu: Sync mailbox metadata -- zkontroluje odpovedi
     |
9. Obchodnik: aktualizuje Stav (Reagoval/Zajem/Nezajem)
```

---

## H. Nezmatouci slovnicek

| Pole / Stav | Co to je | Mozne hodnoty | Poznamka |
|-------------|----------|---------------|----------|
| **lead_stage** | Kde je lead v KVALIFIKACNIM procesu | NEW, QUALIFIED, DISQUALIFIED, REVIEW, IN_PIPELINE, PREVIEW_SENT | Osa 1/3. Nastavuje qualify + process pipeline |
| **preview_stage** | Kde je lead v TECHNICKE priprave preview | NOT_STARTED, BRIEF_READY, QUEUED, SENT_TO_WEBHOOK, READY, REVIEW_NEEDED, FAILED | Osa 2/3. Nastavuje process pipeline |
| **outreach_stage** | Kde je lead v OBCHODNIM procesu | NOT_CONTACTED, DRAFT_READY, CONTACTED, RESPONDED, WON, LOST | Osa 3/3. Automaticky i rucne (write-back) |
| **email_sync_status** | Stav propojeni s Gmail vlaknem | NOT_LINKED, NOT_FOUND, REVIEW, DRAFT_CREATED, SENT, LINKED, REPLIED, ERROR | Technicke, nastavuje OutboundEmail + MailboxSync. NENI obchodni stav! |
| **email_reply_type** | Co klient odpovedel | NONE, REPLY, BOUNCE, OOO, UNKNOWN | Klasifikace odpovedi z Gmail syncu |
| **contact_ready** | Splnuje lead vsechny podminky pro "Ke kontaktovani"? | TRUE, FALSE | Computed. NEEDITOVAT |
| **contact_reason** | Proc je/neni ready | "Nema web", "Slaby web", "DUPLICITA", "DISQUALIFIED"... | Cesky text pro obchodnika |
| **contact_priority** | Priorita osloveni | HIGH, MEDIUM, LOW | Computed. HIGH = nema/slaby web + draft + email |
| **send_allowed** | Ma lead email? | TRUE, FALSE | TRUE = ma email. Kvalifikace + email = muze dostat draft |
| **personalization_level** | Kolik dat o leadu mame | basic (0-2), medium (3-4), high (5-6) | Z 6 bodu: jmeno, segment, sluzba, mesto, pain, rating |
| **dedupe_flag** | Je to duplicitni zaznam? | TRUE, FALSE | TRUE = ne-prvni v grupe, preskakuje se vsude |
| **qualified_for_preview** | Prosel kvalifikaci? | TRUE, FALSE | Branka pro pipeline. Neznamena "ready k osloveni" |
| **template_type** | Typ vizualni sablony | "plumber-no-website", "beauty-basic"... | Format: {obor}-{stav_webu} |
| **website state** (interni) | Skutecny stav webu leadu | NO_WEBSITE, WEAK_WEBSITE, HAS_WEBSITE, CONFLICT, UNKNOWN | Odvozeny resolveWebsiteState_(). Nepersistuje se jako sloupec! |

### Mapovani outreach_stage (cesky <-> anglicky)

| Cesky ("Ke kontaktovani") | Anglicky (LEADS) | Vyznam |
|---------------------------|------------------|--------|
| Neosloveno | NOT_CONTACTED | Zatim bez kontaktu |
| Pripraveno | DRAFT_READY | Draft email hotovy |
| Osloveno | CONTACTED | Email odeslan |
| Reagoval | RESPONDED | Klient reagoval |
| Zajem | WON | Klient projevil zajem (pozitivni vysledek) |
| Nezajem | LOST | Klient nema zajem (negativni vysledek) |

### Rozliseni REVIEW

| Kde se objevi | Co znamena | Co udelat |
|---------------|-----------|-----------|
| `lead_stage = REVIEW` | Podezrely lead (retezec/enterprise) | Rucne overit, zda je vhodny kandidat |
| `preview_stage = REVIEW_NEEDED` | Preview ma nizke skore kvality (<0.7) | Zkontrolovat vygenerovany preview |
| `email_sync_status = REVIEW` | Nejednoznacny Gmail match (vice vlaken) | Rucne priradit spravne vlakno |

---

## I. Top 15 nejmatoucnejsich mist

### 1. Tri stage sloupce, ktere vypadaji jako jedna osa
- **Co mate:** lead_stage, preview_stage, outreach_stage
- **Proc je to matouci:** Clovek predpoklada jednu progresivni skalu NEW -> ... -> WON
- **Spravne chapani:** Tri NEZAVISLE osy. lead_stage = kvalifikace, preview_stage = technicka priprava, outreach_stage = obchod. Postupuji nezavisle ruzymi funkcemi.

### 2. email_sync_status vs outreach_stage -- oba o emailech, ale ruzne systemy
- **Co mate:** email_sync_status (DRAFT_CREATED/SENT/LINKED/REPLIED) a outreach_stage (DRAFT_READY/CONTACTED/RESPONDED)
- **Proc je to matouci:** REPLIED (sync) vs RESPONDED (outreach) zni stejne. DRAFT_CREATED vs DRAFT_READY jsou skoro totozne nazvy.
- **Spravne chapani:** email_sync_status = technicke (co se deje v Gmailu). outreach_stage = obchodni (kde je deal). REPLIED v syncu NEPROPISUJE outreach_stage -- obchodnik musi rucne aktualizovat.

### 3. Slovo "REVIEW" ve trech ruznych enumech
- **Co mate:** lead_stage=REVIEW, preview_stage=REVIEW_NEEDED, email_sync_status=REVIEW
- **Proc je to matouci:** Hledani "REVIEW" v sheetu vraci 3 zcela ruzne situace
- **Spravne chapani:** Vzdy zkontrolujte, ve KTEREM sloupci je "REVIEW". Kazdy vyzaduje jinou akci.

### 4. Humanizovane vs raw hodnoty outreach_stage
- **Co mate:** "Pripraveno" v "Ke kontaktovani" vs "DRAFT_READY" v LEADS
- **Proc je to matouci:** "Zajem" = "WON" (cesky "zajem" != anglicky "won" semanticky)
- **Spravne chapani:** LEADS vzdy ma anglicke enums. "Ke kontaktovani" ma ceske preklady. Mapovani je obousmerne.

### 5. has_website vs resolveWebsiteState_() -- kdo je autorita?
- **Co mate:** Sloupec has_website ("yes"/"no") a sloupec website_url
- **Proc je to matouci:** Mohou si odporovat -> stav CONFLICT
- **Spravne chapani:** Autorita je ODVOZENA funkce resolveWebsiteState_(), ktera krizove kontroluje obe pole + website_quality + has_cta + mobile_ok. Ani jedno pole samo o sobe neni autoritativni.

### 6. Business sloupce vs extension sloupce -- zadny vizualni oddelovac
- **Co mate:** ~20 business sloupcu, pak 45+ extension sloupcu, vsechny vedle sebe
- **Proc je to matouci:** Extension sloupce vypadaji editovatelne, ale rucni zmena muze byt prepsana
- **Spravne chapani:** Extension sloupce editujte JEN pres "Ke kontaktovani" (5 write-back poli). Vsechno ostatni je script-managed.

### 7. DRAFT_CREATED vs DRAFT_READY -- skoro stejny nazev, uplne jiny vyznam
- **Co mate:** email_sync_status=DRAFT_CREATED a outreach_stage=DRAFT_READY
- **Proc je to matouci:** Oba obsahuji "draft"
- **Spravne chapani:** DRAFT_READY = text draftu existuje v spreadsheetu. DRAFT_CREATED = existuje skutecny Gmail draft v mailboxu. Progrese: DRAFT_READY -> (user klikne Create draft) -> DRAFT_CREATED -> (user odesle) -> SENT.

### 8. "Pipeline stav" (col 18) vs "Stav" (col 7) ve stejnem sheetu
- **Co mate:** Oba zobrazuji outreach_stage, ale col 7 je cesky a col 18 anglicky
- **Proc je to matouci:** Dva sloupce se "stavem" ve stejne tabulce
- **Spravne chapani:** Col 7 je editovatelny, col 18 je read-only raw kopie pro OutboundEmail. Editujte JEN col 7.

### 9. contact_ready / contact_reason / contact_priority vypadaji editovatelne
- **Co mate:** Tri sloupce v LEADS, ktere vypadaji jako nastavitelne flagy
- **Proc je to matouci:** Clovek muze chtit rucne nastavit contact_ready=TRUE
- **Spravne chapani:** Jsou PLNE PREPOCTENY pri kazdem refreshi funkci buildContactReadiness_(). Rucni zmena bude prepsana.

### 10. qualified_for_preview vs send_allowed vs contact_ready
- **Co mate:** Tri boolean flagy s podobnym vyznamem
- **Proc je to matouci:** "Kvalifikovany" zni jako "pripraveny k osloveni", ale neni
- **Spravne chapani:** qualified_for_preview = prosel kvalifikaci (ma kontakt, neni retezec). send_allowed = ma email konkretne. contact_ready = splnuje VSE (kvalifikace + neni duplicita + ma draft + neni WON/LOST). contact_ready je nejstriknejsi.

### 11. next_action -- nekdy auto, nekdy rucni, nepoznate ktery
- **Co mate:** Sloupec ktery muze byt automaticky odvozeny NEBO rucne nastaveny
- **Proc je to matouci:** Po zmene outreach_stage se next_action NEAKTUALIZUJE automaticky pokud uz byl rucne nastaven
- **Spravne chapani:** next_action je "user wins" pole. Auto-derivace jen pro prazdne hodnoty. Rucni hodnota prezije zmeny outreach_stage.

### 12. LEGACY_COL (hardcoded pozice) vs HeaderResolver (dynamicky)
- **Co mate:** 6 sloupcu s hardcoded pozicemi, zbytek dynamicky
- **Proc je to matouci:** Nekdo vlozi sloupec -> LEGACY_COL se rozbije, HeaderResolver ne
- **Spravne chapani:** Nevkladejte sloupce do business-data zony (pred pozici 20)! Runtime validace existuje (validateLegacyColHeaders_), ale jen ve write-back ceste.

### 13. preview_stage=BRIEF_READY -- konecny stav v DRY_RUN, prechodny v produkcnim rezimu
- **Co mate:** BRIEF_READY muze byt "hotovo" i "v procesu" podle DRY_RUN flagu
- **Proc je to matouci:** V aktualni konfiguraci (DRY_RUN=true) je BRIEF_READY konecny stav. Kdyz se DRY_RUN prepne na false, tyto radky budou znovu zpracovany.
- **Spravne chapani:** V DRY_RUN rezimu je BRIEF_READY = "vse pripraveno, ceka na ostrý beh".

### 14. segment vs service_type -- oba o oboru, zadna jasna definice
- **Co mate:** Dva sloupce popisujici co firma dela
- **Proc je to matouci:** Nekdy je vyplneny jen jeden, fallback chain neni jasna
- **Spravne chapani:** segment = sirsi kategorie (odvětví), service_type = konkretni remeslo. System pouziva service_type prednostne, segment jako fallback.

### 15. Write-back selze ticha pokud se posunuly radky v LEADS
- **Co mate:** Col 19 (CRM radek) v "Ke kontaktovani" uklada cislo radku v LEADS
- **Proc je to matouci:** Uzivatel edituje dropdown, ten se zmeni vizualne, ale write-back muze selhat s varovnou poznamkou (maly trojuhelnik), ktera se snadno prehlédne
- **Spravne chapani:** Po JAKKOLIV zmene radku v LEADS (vlozeni, smazani, razeni) IHNED spustte Refresh "Ke kontaktovani".

---

## J. One-Page Cheat Sheet

### Datove vrstvy

| Vrstva | Co to je | Kde |
|--------|----------|-----|
| **Source of Truth** | LEADS sheet -- veskera CRM data | business sloupce + extension sloupce |
| **Working Layer** | "Ke kontaktovani" -- derived pro obchodniky | 19 sloupcu, regenerovany z LEADS |
| **Write-back** | 5 editovatelnych sloupcu v "Ke kontaktovani" -> LEADS | Stav, Dalsi krok, Posledni kontakt, Follow-up, Poznamka |
| **Email Metadata** | Gmail sync vrstva v LEADS | email_thread_id, email_sync_status, email_reply_type, last_email_sent/received_at |
| **Audit Log** | _asw_logs | Append-only, rotace po 5000 radcich |

### Top 5 sloupcu pro obchod

1. **outreach_stage** (Stav) -- kde jsme v komunikaci s klientem
2. **contact_priority** (Priorita) -- koho oslovit prvniho
3. **email_body_draft** (Navrh zpravy) -- pripraveny email na miru
4. **next_action** (Dalsi krok) -- co udelat dal
5. **sales_note** (Poznamka) -- rucni poznamky obchodnika

### Top 5 sloupcu pro techniku

1. **lead_stage** -- kde je lead v kvalifikacnim pipeline
2. **preview_stage** -- stav generovani preview webu
3. **email_sync_status** -- propojeni s Gmail vlaknem
4. **qualified_for_preview** -- branka pro pipeline
5. **dedupe_flag** -- ochrana proti duplicitnim operacim

### Tri osy systemu

```
lead_stage:     NEW -> QUALIFIED -> IN_PIPELINE -> PREVIEW_SENT
                        \-> DISQUALIFIED / REVIEW

preview_stage:  NOT_STARTED -> BRIEF_READY -> QUEUED -> SENT_TO_WEBHOOK -> READY
                                                                    \-> REVIEW_NEEDED / FAILED

outreach_stage: NOT_CONTACTED -> DRAFT_READY -> CONTACTED -> RESPONDED -> WON / LOST
```

### Kdo co zapisuje

| Oblast | Automaticky | Rucne (pres "Ke kontaktovani") | Rucne (primo v LEADS) |
|--------|------------|-------------------------------|----------------------|
| Kvalifikace | qualifyLeads | -- | -- |
| Pipeline | processPreviewQueue | -- | -- |
| Obchodni stav | OutboundEmail (CONTACTED) | Stav dropdown | business data (nazev, email...) |
| Email metadata | MailboxSync, OutboundEmail | -- | -- |
| Poznamky/follow-up | -- | Poznamka, Dalsi krok, Follow-up | -- |
| Web check | LegacyWebCheck | -- | website_url, has_website |

### Zlate pravidlo

> **LEADS = source of truth. "Ke kontaktovani" = pracovni pohled. Obchodnik edituje JEN "Ke kontaktovani" sloupce 7-11. Vsechno ostatni ridi system.**
