# Business Process — Autosmartweby

> **Kanonicky dokument.** Popisuje aktualni obchodni proces, ne budouci vizi.
> **Posledni aktualizace:** 2026-04-05

---

## Cilova skupina

Male ceske firmy (remeslnici, sluzby), ktere nemaji web nebo maji slaby web.

## Aktualni workflow

### 1. Vstup dat
Data se dostavaji do LEADS sheetu mimo tento system. Neexistuje automaticky scraper.

### 2. Obohaceni — web check
LegacyWebCheck pres Serper API hleda chybejici weby. Rucni spusteni z menu (20/50/100 radku).

### 3. Kvalifikace
qualifyLeads() — rucni spusteni. Kriteria:
- Musi mit email NEBO telefon
- Musi mit business_name
- Enterprise/chain → REVIEW
- Bez webu / slaby web / konflikt / neznamy → QUALIFIED
- Dobry web → DISQUALIFIED

### 4. Prioritizace
- HIGH: chybi/slaby web + email draft + email
- MEDIUM: castecne splneno
- LOW: omezene kontaktni udaje

### 5. Generovani briefu a draftu
processPreviewQueue() — automaticky timer (15min) nebo rucne:
- Template typ podle segmentu
- Preview brief (JSON)
- Email draft (cesky, personalizovany)
- Pipeline se zastavi na BRIEF_READY (DRY_RUN=true)

### 6. Kontaktni sheet
refreshContactingSheet() — odvozeny list "Ke kontaktovani":
- KPI dashboard
- Tabulka leadu s prioritou
- 5 editovatelnych sloupcu s write-back do LEADS

### 7. Osloveni
Per-lead, rucne z menu v Google Sheets:
- Gmail draft nebo primo odeslani
- Predvyplneny predmet + telo z draftu
- Double-send ochrana

### 8. Sledovani odpovedi
syncMailboxMetadata() — read-only scan Gmailu:
- Klasifikace: REPLY / BOUNCE / OOO
- Metadata zapis do LEADS
- CRM labely na vlakna

### 9. CRM dashboard
Next.js frontend — sledovani pipeline, follow-upu, editace stavu.

## Chybejici kroky (budouci smer)

- Scraping kontaktu z portalu (firmy.cz apod.)
- Automaticka tvorba preview webu z briefu
- Hromadne odesilani emailu
- Automaticky trigger na novy lead

---

## Lead Lifecycle State Machine — CS1

> **Autoritativni specifikace.** Definuje jediny kanonicky lifecycle stav pro kazdy lead.
> **Task ID:** CS1
> **Vytvoreno:** 2026-04-05

---

### Lifecycle State Scope Clarification

The lifecycle state machine describes the conceptual journey of a lead across the system.

In the current implementation:

- States RAW_IMPORTED, NORMALIZED, and DEDUPED exist only within the A2 ingestion pipeline (`_raw_import` table).
- Leads become observable in the LEADS table only after A3 import, at which point they are already normalized and deduplicated.
- Therefore, the first physically observable lifecycle state in LEADS is effectively at the DEDUPED / WEB_CHECKED boundary.

These early ingest states are included in the lifecycle model for completeness and future alignment.

They will become physically observable in LEADS only after the `lifecycle_state` column is implemented.

---


### 1. Ucel a scope

**Co tato state machine resi:**
- Definuje jediny, jednoznacny lifecycle stav kazdeho leadu v kazdem okamziku.
- Pokryva cestu leadu od importu az po reakci (odpoved, bounce, unsubscribe) nebo diskvalifikaci.
- Formalizuje vrstvy zpracovani: Ingest → Enrichment → Qualification → Preview → Outreach.
- Stanovuje povolene prechody mezi stavy a zakazuje nevalidni.

**Co tato state machine NERESI:**
- Neimplementuje workflow engine ani orchestrator (to je CS2).
- Neimplementuje emailing, UI dashboard ani preview generovani.
- Nemeni existujici kod — toto je specifikace, ne implementace.
- Nedefinuje detailni logiku kvalifikace (ta zustava v evaluateQualification_).
- Nedefinuje retry/idempotency pravidla (to je CS3).

**Scope boundary:**
- Canonical lifecycle CS1 konci na REPLIED / BOUNCED / UNSUBSCRIBED / DISQUALIFIED.
- Obchodni vysledky po reakci (WON, LOST v aktualnim outreach_stage) jsou **downstream sales outcome** mimo scope tohoto lifecycle. Jsou zdokumentovany v sekci 10.2 jako mapping na aktualni system, ale nejsou soucasti canonical lifecycle states.
- Stav FAILED je non-terminal review stav pro chyby v preview/outreach vrstvach — lead v nem ceka na lidsky zasah, ktery ho vrati do flow (→ BRIEF_READY nebo → EMAIL_QUEUED).

---

### 2. Canonical lifecycle principle

**Pravidlo:** Kazdy lead ma v kazdem okamziku prave 1 kanonicky lifecycle stav (`lifecycle_state`).

**Vztah k existujicim stage polim:**

V aktualnim systemu existuji 4 nezavisle stavove osy:
- `lead_stage` — kvalifikacni/pipeline osa
- `preview_stage` — technicka pripravenost preview
- `outreach_stage` — obchodni kontaktovani
- `email_sync_status` — stav emailove synchronizace

Tyto osy fungujici nezavisle zpusobuji, ze lead muze mit napr. `lead_stage=QUALIFIED`, `preview_stage=BRIEF_READY`, `outreach_stage=NOT_CONTACTED` soucasne — coz je platna kombinace, ale odpoved na otazku "v jakem stavu je tento lead?" vyzaduje kontrolu vice sloupcu.

**Rozhodnuti:**

| Pole | Role po zavedeni lifecycle_state |
|------|----------------------------------|
| `lifecycle_state` | **Primary** — jediny kanonicky stav leadu |
| `lead_stage` | **Auxiliary** — vrstvovy detail pro kvalifikacni logiku; zachovan pro zpetnou kompatibilitu |
| `preview_stage` | **Auxiliary** — vrstvovy detail pro preview pipeline; zachovan pro zpetnou kompatibilitu |
| `outreach_stage` | **Auxiliary** — vrstvovy detail pro outreach; zachovan pro zpetnou kompatibilitu |
| `email_sync_status` | **Auxiliary** — technicka metadata emailu; neni soucasti lifecycle |

**Jak se zabrani nejednoznacnosti:**

1. `lifecycle_state` je vzdy autoritativni. Pokud se auxiliary field rozchazi s lifecycle_state, lifecycle_state je pravda.
2. Kazda zmena lifecycle_state MUSI byt doprovazena konzistentni zmenou prislusnych auxiliary fields.
3. **Target-state design:** Po implementaci sloupce `lifecycle_state` bude lifecycle_state primary a zadna operace ho nesmi nechat prazdny.
4. **Transitional fallback mapping:** V prechodnem obdobi (pred implementaci sloupce) se lifecycle stav odhaduje z kombinace existujicich poli podle best-effort pravidel (sekce 10.4). Tato fallback derivace neni plne presna — u nekterych current hodnot (zejmena lead_stage=NEW) nelze spolehlive urcit presny canonical stav. Jde o konzistentni prechodnou interpretaci, ne o presnou rekonstrukci target lifecycle.

---

### 3. Kompletni seznam stavu

| # | State | Layer | Popis | Terminal | Review |
|---|-------|-------|-------|----------|--------|
| 1 | RAW_IMPORTED | Ingest | Lead importovan do LEADS sheetu, zadne zpracovani neprobehlo | Ne | Ne |
| 2 | NORMALIZED | Ingest | Zakladni data zvalidovana a ocistena (jmeno, mesto, kontakt) | Ne | Ne |
| 3 | DEDUPED | Ingest | Kontrola duplicit dokoncena (company_key, branch_key nastaveny) | Ne | Ne |
| 4 | WEB_CHECKED | Enrichment | Stav webove prezence overen (Serper API / manualni kontrola) | Ne | Ne |
| 5 | QUALIFIED | Qualification | Lead splnuje vsechna kriteria pro dalsi zpracovani | Ne | Ne |
| 6 | DISQUALIFIED | Qualification | Lead nesplnuje kriteria (dobry web, chybi kontakt, chybi jmeno) | Ano | Ne |
| 7 | REVIEW_REQUIRED | Qualification | Vyzaduje lidske rozhodnuti (enterprise/retezec, konflikt dat) | Ne | Ano |
| 8 | BRIEF_READY | Preview | Preview brief a email draft vygenerovany | Ne | Ne |
| 9 | PREVIEW_GENERATING | Preview | Preview web se generuje (webhook/externi sluzba) | Ne | Ne |
| 10 | PREVIEW_READY_FOR_REVIEW | Preview | Preview vygenerovan, ceka na lidskou kontrolu kvality | Ne | Ano |
| 11 | PREVIEW_APPROVED | Preview | Preview schvalen, pripraveny k pouziti v outreach | Ne | Ne |
| 12 | OUTREACH_READY | Outreach | Lead pripraveny ke kontaktovani, email draft k dispozici | Ne | Ne |
| 13 | EMAIL_QUEUED | Outreach | Email zarazen do fronty k odeslani | Ne | Ne |
| 14 | EMAIL_SENT | Outreach | Email uspesne odeslan | Ne | Ne |
| 15 | REPLIED | Outreach | Lead odpoveděl na email | Ano | Ne |
| 16 | BOUNCED | Outreach | Email se nedorucil (hard/soft bounce) | Ano | Ne |
| 17 | UNSUBSCRIBED | Outreach | Lead explicitne odmitnul dalsi komunikaci | Ano | Ne |
| 18 | FAILED | Preview / Outreach | Chyba pri generovani preview nebo odesilani emailu; ceka na lidsky zasah | Ne | Ano |

**Zmeny oproti doporucenemu seznamu ze zadani:**
- **Vsech 18 doporucenych stavu zachovano** beze zmeny nazvu.
- **WON a LOST vyrazeny z canonical lifecycle.** Existuji v aktualnim outreach_stage, ale jsou downstream sales outcome mimo scope CS1 ("od importu po reakci"). V sekci 10.2 jsou zdokumentovany jako mapping na aktualni system.
- **REPLIED je terminal** — scope CS1 konci na reakci leadu; dalsi obchodni zpracovani (WON/LOST) je mimo tento lifecycle.
- **FAILED je review state, ne terminal** — lead v nem ceka na lidsky zasah a navrat do flow. Terminal by znamenal "konci nadobro", ale FAILED je opravitelny stav.

---

### 4. State transition tabulka

| # | From | To | Condition / Trigger | Poznamka |
|---|------|----|---------------------|----------|
| T1 | RAW_IMPORTED | NORMALIZED | Data validation + cleaning probehla | Automaticky pri ingest pipeline |
| T2 | NORMALIZED | DEDUPED | Kontrola duplicit dokoncena (company_key vyhodnocen) | Automaticky |
| T3 | DEDUPED | WEB_CHECKED | Web check (Serper/manualni) dokoncen | Automaticky nebo rucni |
| T4 | WEB_CHECKED | QUALIFIED | evaluateQualification_ → splnuje kriteria | Automaticky |
| T5 | WEB_CHECKED | DISQUALIFIED | evaluateQualification_ → nesplnuje kriteria | Automaticky |
| T6 | WEB_CHECKED | REVIEW_REQUIRED | evaluateQualification_ → vyzaduje lidsky review | Enterprise/chain detect |
| T7 | REVIEW_REQUIRED | QUALIFIED | Operator schvalil lead po manualnim preskumani | Manualni akce |
| T8 | REVIEW_REQUIRED | DISQUALIFIED | Operator zamitnul lead po manualnim preskumani | Manualni akce |
| T9 | QUALIFIED | BRIEF_READY | processPreviewQueue_ vytvoril brief + email draft | Automaticky (15min timer / rucni) |
| T10 | BRIEF_READY | PREVIEW_GENERATING | Brief odeslan na generator (webhook/externi sluzba) | Automaticky; dnes zastaven DRY_RUN=true |
| T11 | PREVIEW_GENERATING | PREVIEW_READY_FOR_REVIEW | Preview vygenerovan, quality check vyzaduje review | Automaticky |
| T12 | PREVIEW_GENERATING | PREVIEW_APPROVED | Preview vygenerovan, automaticky schvalen | Automaticky (pokud quality OK) |
| T13 | PREVIEW_GENERATING | FAILED | Chyba pri generovani preview | Error handling; preview_error zaznamenan |
| T14 | PREVIEW_READY_FOR_REVIEW | PREVIEW_APPROVED | Operator schvalil preview | Manualni akce |
| T15 | PREVIEW_READY_FOR_REVIEW | BRIEF_READY | Operator zamitnul preview, vyzaduje regeneraci | Manualni akce; navrat do BRIEF_READY |
| T16 | PREVIEW_APPROVED | OUTREACH_READY | Email draft pripraven, kontaktni udaje overeny | Automaticky |
| T17 | OUTREACH_READY | EMAIL_QUEUED | Lead zarazen do fronty k odeslani | Automaticky nebo rucni |
| T18 | EMAIL_QUEUED | EMAIL_SENT | Email uspesne odeslan pres GmailApp/ESP | Automaticky |
| T19 | EMAIL_QUEUED | FAILED | Chyba pri odesilani emailu | Error handling; email_last_error zaznamenan |
| T20 | EMAIL_SENT | REPLIED | Detekce odpovedi v mailbox sync (email_reply_type=REPLY) | Automaticky (syncMailboxMetadata) |
| T21 | EMAIL_SENT | BOUNCED | Detekce bounce v mailbox sync (email_reply_type=BOUNCE) | Automaticky |
| T22 | EMAIL_SENT | UNSUBSCRIBED | Lead explicitne pozadal o odhlaseni | Manualni nebo automaticky |
| T23 | FAILED | BRIEF_READY | Operator opravil pricinu chyby v preview generovani | Manualni akce po diagnostice |
| T24 | FAILED | EMAIL_QUEUED | Operator opravil pricinu chyby v email odeslani | Manualni akce po diagnostice |

---

### 5. Terminal states

Terminal stav = lead v nem konci nadobro. Z terminal stavu nevede ZADNY dalsi povoleny lifecycle prechod. Pokud by bylo nutne lead "obzivit", je to operace mimo tento lifecycle (manualni zasah do dat, novy import).

| State | Proc je terminal |
|-------|------------------|
| **DISQUALIFIED** | Lead nesplnuje kriteria pro osloveni (ma dobry web, chybi kontakt, chybi jmeno). Z tohoto stavu nevede zadna cesta zpet. Pokud se data leadu zmeni (napr. web prestane fungovat), je to novy podnet mimo tento lifecycle — ne pokracovani stavajiciho. |
| **REPLIED** | Lead odpoveděl na email. Scope CS1 konci na reakci. Dalsi obchodni zpracovani (vyhodnoceni odpovedi jako WON/LOST) je downstream sales outcome mimo canonical lifecycle CS1. |
| **BOUNCED** | Email je nedorucitelny. Kontaktni udaje jsou neplatne. Dalsi odesilani by poskodilo sender reputation. |
| **UNSUBSCRIBED** | Lead explicitne odmitnul komunikaci. Dalsi kontaktovani je pravni poruseni (GDPR, zakon o elektronickych komunikacich). |

---

### 6. Review states

Review stav = lead ceka na lidske rozhodnuti. Kazdy review stav ma definovaneho resitele a presne povolene vystupy.

| State | Kdo resi | Proc ceka na cloveka | Allowed outcomes |
|-------|----------|----------------------|------------------|
| **REVIEW_REQUIRED** | Operator (clen tymu) | Kvalifikacni logika detekovala nejednoznacny pripad (enterprise/chain firma, konflikt dat). Automaticka kvalifikace neni dostatecne spolehliva. | → **QUALIFIED** (operator schvalil lead) nebo → **DISQUALIFIED** (operator zamitnul lead). Zadny jiny prechod neni povolen. |
| **PREVIEW_READY_FOR_REVIEW** | Operator (clen tymu) | Vygenerovany preview web nebo email draft nesplnuje automaticke quality thresholdy (preview_needs_review=true, preview_quality_score pod limitem). Obsah musi byt zkontrolovan pred oslovenim. | → **PREVIEW_APPROVED** (operator schvalil preview) nebo → **BRIEF_READY** (operator zamitnul, vyzaduje regeneraci). Zadny jiny prechod neni povolen. |
| **FAILED** | Operator (clen tymu) | Doslo k technicke chybe v preview pipeline (T13: generovani selhalo) nebo v outreach pipeline (T19: odeslani emailu selhalo). Lead nemuze pokracovat automaticky. | → **BRIEF_READY** (chyba v preview generovani; operator opravil pricinu, lead se vraci k regeneraci briefu) nebo → **EMAIL_QUEUED** (chyba v email odeslani; operator opravil pricinu, lead se vraci do fronty). Vstup do FAILED je mozny jen z PREVIEW_GENERATING (T13) nebo EMAIL_QUEUED (T19). |

---

### 7. Validni pruchody

**7.1 Happy path (uspesna reakce)**

```
RAW_IMPORTED → NORMALIZED → DEDUPED → WEB_CHECKED → QUALIFIED
→ BRIEF_READY → PREVIEW_GENERATING → PREVIEW_APPROVED
→ OUTREACH_READY → EMAIL_QUEUED → EMAIL_SENT → REPLIED
```

Firma bez webu je importovana, projde validaci, neni duplikat, web check potvrdil absenci webu. Kvalifikace projde. Brief a email draft se vygeneruji, preview web se vytvori a automaticky schvali. Lead je pripraven k osloveni, email se odesle, firma odpovi. Lifecycle CS1 konci na REPLIED — dalsi obchodni zpracovani (WON/LOST) je downstream.

**7.2 Disqualified path (diskvalifikace)**

```
RAW_IMPORTED → NORMALIZED → DEDUPED → WEB_CHECKED → DISQUALIFIED
```

Firma je importovana, projde validaci a dedupe. Web check zjisti, ze firma ma kvalitni web. Kvalifikace ji oznaci jako DISQUALIFIED s duvodem HAS_GOOD_WEBSITE. Lead konci — nema smysl nabizet web firme, ktera ho uz ma.

**7.3 Bounced path (nedorucitelny email)**

```
RAW_IMPORTED → NORMALIZED → DEDUPED → WEB_CHECKED → QUALIFIED
→ BRIEF_READY → PREVIEW_GENERATING → PREVIEW_APPROVED
→ OUTREACH_READY → EMAIL_QUEUED → EMAIL_SENT → BOUNCED
```

Lead projde celym pipeline az k odeslani emailu. Mailbox sync detekuje bounce (email_reply_type=BOUNCE). Lead je oznacen jako BOUNCED — dalsi odesilani na tuto adresu je zbytecne a skodlive pro sender reputation.

---

### 8. Nevalidni prechody

**8.1 RAW_IMPORTED → EMAIL_SENT (zakazano)**

Proc je zakazany: Lead, ktery nebyl zvalidovan, zkontrolovan na duplicity, overen na webovou prezenci, kvalifikovan a neprosel preview pipeline, NESMI byt kontaktovan emailem.

Riziko: Odeslani emailu nekvalifikovanemu leadu (napr. firme s dobrym webem, duplicitnimu zaznamu, nebo firme bez kontaktniho emailu) by zpusobilo:
- Poskozeni sender reputation (spam flagy)
- Ztrata duveryhodnosti znacky
- Pravni riziko (osloveni nevalidniho kontaktu)
- Plytváni zdroji (generovani preview pro nevhodneho leada)

**8.2 DISQUALIFIED → OUTREACH_READY (zakazano)**

Proc je zakazany: DISQUALIFIED je terminal stav (sekce 5) — z nej nevede zadny povoleny lifecycle prechod. Primo ani neprimo se z DISQUALIFIED nelze dostat do OUTREACH_READY ani do zadneho jineho stavu. Pokud se okolnosti zmeni (napr. web firmy prestane fungovat), je to novy podnet mimo tento lifecycle, ne pokracovani stavajiciho.

Riziko: Obejiti kvalifikace by zpusobilo:
- Osloveni firem, ktere nespadaji do cilove skupiny (maji web, nejsou zivnostnici)
- Poruseni obchodni logiky (pravidla kvalifikace existuji z duvodu)
- Nemoznost auditovat, proc byl lead kontaktovan — chybi kvalifikacni zaznam

---

### 9. Rationale k rozdeleni po vrstvach

**Proc 5 vrstev?**

| Vrstva | Ucel | Proc je oddelena |
|--------|------|------------------|
| **Ingest** | Import, validace, deduplikace | Oddeluje "surova data" od "cista data". Umoznuje sledovat kvalitu vstupu nezavisle na dalsim zpracovani. Ruzni dodavatele dat (portaly, manualni vstup) konci ve stejnem normalizo-vanem stavu. |
| **Enrichment** | Overeni webove prezence | Enrichment je externi zavislost (Serper API). Muze selhat, ma rate limity, muze byt docasne nedostupny. Oddeleni umoznuje retry enrichmentu bez opakovani ingestu. |
| **Qualification** | Rozhodnuti o vhodnosti leadu | Kvalifikacni pravidla se meni v case (CS1 zadani). Oddeleni umoznuje menit pravidla bez dopadu na ingest nebo preview pipeline. Review stavy existuji jen v teto vrstve. |
| **Preview** | Generovani a schvalovani materialu | Preview pipeline ma vlastni zivotni cyklus (brief → generovani → review → schvaleni). Muze selhat, vyzadovat regeneraci nebo lidsky zasah. Oddeleni zabranuje tomu, aby chyba v generovani preview ovlivnila kvalifikacni stav leadu. |
| **Outreach** | Kontaktovani a sledovani reakce | Outreach vrstva ma externi zavislosti (Gmail, ESP) a pravni omezeni (GDPR, unsubscribe). Oddeleni umoznuje sledovat outreach performance nezavisle na kvalite preview. Obchodni vyhodnoceni reakce (WON/LOST) je mimo scope CS1. |

**Proc to pomaha:**
1. **Rizeni procesu:** Kazda vrstva ma jasneho ownera a jasne gatekeeping podminky. Lead nemuze preskocit vrstvu.
2. **Auditovatelnost:** V kazdem okamziku je zrejme, ve ktere vrstve a stavu se lead nachazi. Audit trail je jednoznacny.
3. **Budouci orchestrace:** Vrstvy umoznuji nezavisle skalovani (napr. paralelni enrichment, batch preview generovani, queue-based outreach). Orchestrator (CS2) muze ridit kazdou vrstvu jako nezavisly krok.

---

### 10. Mapping na aktualni projekt

#### 10.1 Nalezene aktualni stavy v repu

**lead_stage (Config.gs:122–130):**
NEW, QUALIFIED, DISQUALIFIED, REVIEW, IN_PIPELINE, PREVIEW_SENT

**preview_stage (Config.gs:112–120):**
NOT_STARTED, BRIEF_READY, QUEUED, SENT_TO_WEBHOOK, READY, REVIEW_NEEDED, FAILED

**outreach_stage (ContactSheet.gs:183–208):**
NOT_CONTACTED, DRAFT_READY, CONTACTED, RESPONDED, WON, LOST

**email_sync_status (Config.gs:155–164):**
NOT_LINKED, NOT_FOUND, REVIEW, DRAFT_CREATED, SENT, LINKED, REPLIED, ERROR

**email_reply_type (Config.gs:166–172):**
NONE, REPLY, BOUNCE, OOO, UNKNOWN

#### 10.2 Mapping: current state → proposed target state

| Current field.value | Proposed lifecycle_state | Poznamka |
|---------------------|--------------------------|----------|
| lead_stage=NEW *(pred zpracovanim)* | RAW_IMPORTED | NEW pokryva cely ingest; lifecycle rozlisuje RAW_IMPORTED/NORMALIZED/DEDUPED/WEB_CHECKED |
| lead_stage=NEW *(po dedupe, pred web check)* | DEDUPED | Dnes nerozliseno — NEW je pretizeny stav |
| lead_stage=QUALIFIED | QUALIFIED | Primy mapping |
| lead_stage=DISQUALIFIED | DISQUALIFIED | Primy mapping |
| lead_stage=REVIEW | REVIEW_REQUIRED | Prejmenovan: REVIEW → REVIEW_REQUIRED (jasnejsi semantika, REVIEW je prilis genericke) |
| lead_stage=IN_PIPELINE | PREVIEW_GENERATING | IN_PIPELINE → lead je aktivne v preview pipeline |
| lead_stage=PREVIEW_SENT | PREVIEW_APPROVED | PREVIEW_SENT → preview je hotovy a schvaleny |
| preview_stage=NOT_STARTED | *(neni lifecycle stav)* | Lead je v QUALIFIED; NOT_STARTED je default |
| preview_stage=BRIEF_READY | BRIEF_READY | Primy mapping |
| preview_stage=QUEUED | PREVIEW_GENERATING | QUEUED a SENT_TO_WEBHOOK jsou sub-stavy generovani |
| preview_stage=SENT_TO_WEBHOOK | PREVIEW_GENERATING | Viz vyse |
| preview_stage=READY | PREVIEW_APPROVED | READY → preview schvalen |
| preview_stage=REVIEW_NEEDED | PREVIEW_READY_FOR_REVIEW | Prejmenovan pro konzistenci |
| preview_stage=FAILED | FAILED | Primy mapping |
| outreach_stage=NOT_CONTACTED | OUTREACH_READY | NOT_CONTACTED + preview OK = pripraveny k osloveni |
| outreach_stage=DRAFT_READY | OUTREACH_READY | DRAFT_READY je detail (draft existuje), ne lifecycle zmena |
| outreach_stage=CONTACTED | EMAIL_SENT | Prejmenovan: CONTACTED → EMAIL_SENT (presnejsi) |
| outreach_stage=RESPONDED | REPLIED | Prejmenovan: RESPONDED → REPLIED (emailova terminologie) |
| email_reply_type=BOUNCE | BOUNCED | Dnes bounce neaktualizuje outreach_stage (issue M-8) |
| email_reply_type=OOO | *(neni lifecycle stav)* | OOO je metadata, ne lifecycle zmena |

**Downstream sales outcomes (mimo scope CS1):**

| Current field.value | Pozice v lifecycle | Poznamka |
|---------------------|-------------------|----------|
| outreach_stage=WON | Downstream po REPLIED | Obchodni vysledek — lead projevil zajem. Neni soucasti canonical lifecycle CS1; zustava jako auxiliary hodnota v outreach_stage. |
| outreach_stage=LOST | Downstream po REPLIED | Obchodni vysledek — lead odmitnul. Neni soucasti canonical lifecycle CS1; zustava jako auxiliary hodnota v outreach_stage. |

#### 10.3 Nesoulady a naming konflikty

| # | Nesoulad | Dopad | Doporuceni |
|---|----------|-------|------------|
| N1 | **lead_stage=NEW je pretizeny** — pokryva RAW_IMPORTED az WEB_CHECKED | V lifecycle maji tyto faze ruzny vyznam; NEW je nerozlisuje | Canonical lifecycle je presnejsi; NEW zustava jako auxiliary dokud neni implementovan lifecycle_state sloupec |
| N2 | **lead_stage a preview_stage se prekryvaji** — IN_PIPELINE a QUEUED/SENT_TO_WEBHOOK znaci totez | Redundance; lead_stage meni stav az po zmene preview_stage | lifecycle_state eliminuje redundanci; IN_PIPELINE a PREVIEW_SENT zaniknou jako auxiliary hodnoty |
| N3 | **BOUNCED neaktualizuje outreach_stage** (issue M-8) | Lead ma email_reply_type=BOUNCE, ale outreach_stage zustava CONTACTED | lifecycle_state musi reagovat na email_reply_type; derivace musi mit BOUNCE prioritu nad outreach_stage |
| N4 | **UNSUBSCRIBED neexistuje v zadnem aktualnim stage** | System nema jak oznacit lead, ktery se odhlasil | Novy stav; bude implementovan s lifecycle_state |
| N5 | **EMAIL_QUEUED neexistuje** — emaily se odesilaji primo | V aktualnim systemu email jde z DRAFT_READY primo na CONTACTED | Stav pripraven pro budouci queue-based odeslani; dnes se prejde automaticky |
| N6 | **outreach_stage rozlisuje NOT_CONTACTED a DRAFT_READY** — oba jsou "nekontaktovano" | lifecycle_state je konsoliduje jako OUTREACH_READY | DRAFT_READY zustava v auxiliary outreach_stage pro detail |
| N7 | **REVIEW v lead_stage vs REVIEW v email_sync_status** — stejny nazev, jiny vyznam | Naming kolize | lifecycle_state pouziva REVIEW_REQUIRED pro kvalifikaci; email_sync_status REVIEW zustava v auxiliary |

#### 10.4 Transitional fallback mapping (prechodne obdobi)

Dokud neni implementovan sloupec `lifecycle_state`, lifecycle stav se **odhaduje** z kombinace existujicich poli. Toto je best-effort fallback mapping, ne presna rekonstrukce target lifecycle. Pravidla (priorita shora dolu):

```
1. email_reply_type = BOUNCE                       → BOUNCED
2. outreach_stage = RESPONDED                      → REPLIED
3. outreach_stage = CONTACTED                      → EMAIL_SENT
4. outreach_stage IN (NOT_CONTACTED, DRAFT_READY)
   AND preview_stage = READY                       → OUTREACH_READY
5. preview_stage = REVIEW_NEEDED                   → PREVIEW_READY_FOR_REVIEW
6. preview_stage IN (QUEUED, SENT_TO_WEBHOOK)      → PREVIEW_GENERATING
7. preview_stage = BRIEF_READY                     → BRIEF_READY
8. preview_stage = FAILED                          → FAILED
9. lead_stage = QUALIFIED
   AND preview_stage = NOT_STARTED                 → QUALIFIED
10. lead_stage = DISQUALIFIED                      → DISQUALIFIED
11. lead_stage = REVIEW                            → REVIEW_REQUIRED
12. lead_stage = IN_PIPELINE                       → PREVIEW_GENERATING
13. lead_stage = PREVIEW_SENT                      → PREVIEW_APPROVED
14. lead_stage = NEW                               → RAW_IMPORTED *
```

**Poznamka k outreach_stage WON/LOST:** Tyto hodnoty existuji v aktualnim systemu, ale nejsou soucasti canonical lifecycle CS1. Pokud outreach_stage=WON nebo LOST, derivace vraci REPLIED (lead odpoveděl; WON/LOST je downstream obchodni vyhodnoceni).

**Omezeni fallback mappingu:**

\* **Ztrata presnosti v ingest vrstve:** RAW_IMPORTED, NORMALIZED, DEDUPED a WEB_CHECKED nelze v aktualnim systemu rozlisit — vsechny jsou lead_stage=NEW. Fallback mapuje NEW → RAW_IMPORTED, ale lead muze byt kdekoliv v ingest vrstve. Tyto sub-stavy jsou **target-state granularita** — v aktualnim systemu je nelze spolehlive rekonstruovat.

**Stavy bez current ekvivalentu:** UNSUBSCRIBED a EMAIL_QUEUED nemaji ekvivalent v aktualnim systemu — fallback je nemuze vratit. Budou rozpoznatelne az po implementaci lifecycle_state sloupce.

**Dulezite:** Fallback mapping je konzistentni prechodna interpretace pro provozni ucely. Neni to plne presna rekonstrukce target lifecycle. Presna derivace bude mozna az po implementaci sloupce `lifecycle_state`.
