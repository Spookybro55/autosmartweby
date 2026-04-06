# Automation Workflows — Autosmartweby

> **Kanonicky dokument.** Aktualizuje se pri zmene automatizacnich procesu.
> **Posledni aktualizace:** 2026-04-05

---

## Triggery v Apps Script

| Trigger | Typ | Frekvence | Funkce | Stav |
|---------|-----|-----------|--------|------|
| processPreviewQueue | Time-based | 15 min | Zpracovani kvalifikovanych leadu | Aktivni (DRY_RUN=true) |
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

Staging-based ingest pipeline. Navrh v A-02 (RAW_IMPORT staging layer), kod jeste neni implementovan.

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

## Chybejici automatizace

- Trigger na novy radek v LEADS (neni implementovan)
- Hromadne odesilani emailu (neni implementovano)
- Automaticky scraping (neni implementovan — kontrakt pripraven, viz vyse)
- Preview web generovani (neni implementovano)
- Ingest flow runtime (navrzen v A-02/A-03, kod neni implementovan)

---

## Workflow Orchestrator — C-02

> **Autoritativni specifikace.** Definuje logickou orchestracni vrstvu nad lifecycle state machine (C-01).
> **Task ID:** C-02
> **Dependency:** C-01 (canonical lifecycle_state)
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
- Neimplementuje retry/idempotency politiky (C-03).
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
    ELSE best-effort transitional fallback mapping podle C-01 sekce 10.4
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
  retry_eligibility:  string       // Popis retry chovani (handoff na C-03)
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
retry_eligibility:  "Bezpecne opakovatelne — brief se prepise. Handoff na C-03 pro retry politiku."
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
retry_eligibility:  "Opatrne — double-send guard nutny (kontrola outreach_stage). Handoff na C-03."
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

| Oblast | Current state | Proposed target (C-02) |
|--------|--------------|----------------------|
| **Rozhodovaci logika** | Rozptylena v kazde funkci; kazda funkce si sama overuje stav a rozhoduje | Orchestrator spec definuje rozhodovaci pravidla centralne; funkce implementuji kroky |
| **State transitions** | Pres lead_stage / preview_stage / outreach_stage nezavisle | Pres canonical lifecycle_state (C-01); auxiliary fields zachovany |
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
| M2 | **Zadna automaticka kvalifikace po web checku** | Po runWebsiteCheck operator musi rucne spustit qualifyLeads | Budouci A-07 (auto qualify hook) |
| M3 | **processPreviewQueue zastava na BRIEF_READY (DRY_RUN)** | Preview/outreach pipeline za BRIEF_READY neni testovana v produkci | Pipeline od BRIEF_READY dal je specifikovana, ne overena |
| M4 | **Mailbox sync neaktualizuje lifecycle konzistentne** (M-8) | BOUNCED stav se nedostane do outreach_stage | Resi se az implementaci lifecycle_state sloupce |
| M5 | **Email send je per-lead manual bez fronty** | Hromadne odesilani neexistuje | C-05 (outbound queue) |
| M6 | **Zadny trigger na novy radek v LEADS** | Import nespousti zadny automaticky krok | Budouci A-stream task |
| M7 | **Run ID neexistuje** — log zaznamy nejsou korelovane v ramci jednoho batch behu | Audit trail je dohledatelny, ale ne snadno korelovatelny | Spec definuje run_id jako povinne pole s 4-urovnovou korelacni hierarchii; implementace je low-effort zmena |

#### 10.4 Co bude potrebovat navazny task, ale zatim se NEimplementuje

| Task | Co potrebuje od C-02 | Stav |
|------|---------------------|------|
| C-03 (Idempotency & retry) | Step kontrakt definuje retry_eligibility per step; C-03 definuje presne politiky | Handoff pripraveny |
| C-04 (Sendability gate) | Orchestrator definuje OUTREACH_READY preconditions; C-04 je formalizuje | Handoff pripraveny |
| C-05 (Outbound queue) | EMAIL_QUEUED stav specifikovan; C-05 implementuje frontu a bulk send | Handoff pripraveny |
| C-06 (Provider abstraction) | Step kontrakt odděluje akci od providera; C-06 abstrahuje GmailApp/ESP | Handoff pripraveny |
| C-08 (Follow-up engine) | REPLIED terminal v C-01; follow-up je downstream proces | Mimo scope C-02 |
| C-09 (Exception queue) | FAILED review state a resolution paths specifikovany; C-09 formalizuje queue | Handoff pripraveny |

---

