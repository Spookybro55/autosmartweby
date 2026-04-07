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
| M2 | **Zadna automaticka kvalifikace po web checku** | Po runWebsiteCheck operator musi rucne spustit qualifyLeads | Budouci A-07 (auto qualify hook) |
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
