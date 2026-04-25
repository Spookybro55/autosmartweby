# Fáze 2 — Data Model Audit

> **Cíl:** Zjistit, jestli datový model LEADS ↔ Ke kontaktování je konzistentní, správně dokumentovaný a neztrácí data.
> **Agent pattern:** 🤖🤖 — 2 paralelní agenty (Schema archeolog + Contract reviewer), merge na konci.
> **Scope:** read-only (žádné live Sheets).
> **Baseline:** `origin/main` @ `1dfc7e8` (post merge B-06 PR #36).

---

## 1. Schema dle kódu (Agent A — Schema archeolog)

Agent A analyzoval pouze `apps-script/*.gs` + `crm-frontend/src/lib/**` + `scripts/test-*.mjs`, bez přístupu do `docs/` a bez čtení JSDoc komentářů.

### Tabulka sloupec × čtecí funkce × zapisovací funkce (vybraná jádra)

| Sloupec | Typ | Čtecí sites | Zapisovací sites |
|---------|-----|-------------|------------------|
| `business_name` | string | `Config.gs:50` (LEGACY_COL[4]), widespread `hr.get(row,'business_name')` | `RawImportWriter.gs`, `PreviewPipeline.gs`, Normalizer |
| `ico` / `ičo` | string | `PreviewPipeline.gs:366` (`hr.get(row,'ičo')` s diakritikou) | `Normalizer.gs:58`, RawImportWriter |
| `email` | string | widespread | `Normalizer.gs:48` (regex valid), RawImportWriter |
| `phone` | string | widespread | `Normalizer.gs:47` (normalize to +420), RawImportWriter |
| `website_url` | string | `DedupeEngine.gs:48`, Normalizer | `Normalizer.gs:54`, RawImportWriter |
| `has_website` | enum (`yes`/`no`) | `ContactSheet.gs:107` via `resolveWebsiteState_` | `Normalizer.gs:55` (derived) |
| `city` | string | widespread | `Normalizer.gs:40` (preserve diacritics), RawImportWriter |
| `lead_id` | string (`ASW-{ts36}-{rnd4}`) | `ContactSheet.gs:353`, `findRowByLeadId_` | `PreviewPipeline.gs:89` (`generateLeadId_`), RawImportWriter |
| `lead_stage` | enum | `ContactSheet.gs:83` | `PreviewPipeline.gs` (`evaluateQualification_`) |
| `outreach_stage` | enum | `ContactSheet.gs:303` | `ContactSheet.gs:809` (reverseHumanize), `WebAppEndpoint.gs:100` |
| `preview_stage` | enum | `ContactSheet.gs:96,278` | `PreviewPipeline.gs`, `ContactSheet.gs:865+` (review handler) |
| `preview_url`, `preview_headline`, `preview_subheadline`, `preview_cta` | string | `ContactSheet.gs:277-288` | `PreviewPipeline.gs` (webhook response) — snapshot copies |
| `email_subject_draft`, `email_body_draft` | string | `ContactSheet.gs:115,312` | `OutboundEmail.gs` |
| `contact_ready` | bool | filter v `buildContactReadiness_` | `ContactSheet.gs:394` |
| `contact_reason`, `contact_priority` | string | `ContactSheet.gs:331-332` | `ContactSheet.gs:395-396` |
| `review_decision` | enum | `ContactSheet.gs:324,340` | `ContactSheet.gs:953` (`handleReviewDecisionEdit_`, atomic) |
| `reviewed_at`, `reviewed_by` | ISO / email | — | `ContactSheet.gs:954-955` (atomic with review_decision) |
| `review_note` | string | `ContactSheet.gs:341` | `onContactSheetEdit` plain write-back (col 13) |

### Centralizovaná definice schémat

| Konstanta | Kde | Počet hodnot |
|-----------|-----|--------------|
| `EXTENSION_COLUMNS` | `Config.gs:68-125` | **55** (verified via grep) |
| `LEGACY_COL` | `Config.gs:50-55` | 6 hardcoded position references |
| `LEGACY_COL_HEADERS` | `Config.gs:58-65` | 6 expected header strings |
| `PREVIEW_STAGES` | `Config.gs:127-154` | 11 (7 canonical + 4 legacy) |
| `LEAD_STAGES` | `Config.gs:169-177` | 6 |
| `REVIEW_DECISIONS` | `Config.gs:156-167` | 3 |
| `DEDUPE_BUCKET` | `Config.gs:180-185` | 4 |
| `DEDUPE_REASON` | `Config.gs:187-197` | 9 |
| `EMAIL_SYNC_STATUS` | `Config.gs:222-231` | 8 |
| `EMAIL_REPLY_TYPE` | `Config.gs:233-239` | 5 |

### Primary key & write-back lookup

- **Primary key:** `lead_id` (string, format `ASW-{ts_base36}-{rand4}`)
- **Generator:** `PreviewPipeline.gs:105-108` (`generateLeadId_`)
- **Legacy variant:** `FIRMYCZ-NNNN` accepted by audit pattern (`PreviewPipeline.gs:152`)
- **Write-back lookup:** `findRowByLeadId_` in `Helpers.gs:241-252` (Variant B, row-shift immune)
- **Fallback pro rows bez lead_id:** write-back **BLOCKED** (`ContactSheet.gs:691-701`), warning shown in refresh

### Ke kontaktování layout (post B-06, 21 cols)

- Rows 1-4: KPI dashboard
- Row 5: header (frozen)
- Row 6+: data, sorted by priority (HIGH / MEDIUM / LOW)
- Cols 1-6 RO: Priorita, Firma (business_name + "\n" + city), Důvod, Preview (hyperlink), Telefon, E-mail
- Cols 7-11 EDIT (outreach): Stav, Další krok, Poslední kontakt, Follow-up, Poznámka
- Cols 12-13 EDIT (review, B-06): Rozhodnutí ✎, Důvod revize ✎
- Cols 14-20 DETAIL (hidden group): Kontaktní osoba, Typ služby, Kanál, Shrnutí, Předmět e-mailu, Návrh zprávy, Pipeline stav
- Col 21 SYSTEM: Lead ID (write-back lookup key)

### Dedupe algoritmus (T1-T4)

From `DedupeEngine.gs`:

| Tier | Prefix | Logic | Result bucket |
|------|--------|-------|----------------|
| T1 | `ico:` | 8-digit IČO match | HARD_DUPLICATE (HARD_DUP_ICO) |
| T2 | `dom:` | Domain match (not blocked) | HARD_DUPLICATE (HARD_DUP_DOMAIN); REVIEW if IČO conflict |
| T3 | `edom:` | Email domain (business only, not freemail) | SOFT_DUPLICATE (SOFT_DUP_EMAIL_DOMAIN) |
| T4 | `name:` | Normalized name + city | SOFT_DUPLICATE (SOFT_DUP_NAME_CITY) |

Normalization: `normalizeBusinessName_` strips accents + suffixes (s.r.o., a.s.), `normalizeCityForDedupe_` merges "Praha 1-10" → "praha".

### Code-only anomalies flagged by Agent A

- **Intra-batch T3/T4 collision bucket = REVIEW** (`REVIEW_INTRA_BATCH_T3/T4`) but **nenastavuje `duplicate_of_lead_id`** — na rozdíl od T1/T2 hard-dup flow.
- **`company_key` + `branch_key`** se zapisují do LEADS extension columns, ale `branch_key` není nigde čteno (dead field, pouze write).
- **LEGACY_COL header validation** (`validateLegacyColHeaders_`) proběhne při každém write-back volání (`ContactSheet.gs:728-742`). Pokud se sheet header posune, write-back blokuje s "LEGACY_COL MISMATCH".
- **Preview stage legacy values** (`QUEUED`, `SENT_TO_WEBHOOK`, `READY`, `REVIEW_NEEDED`) — kód READS accepts (backward compat), ale Config.gs je označuje "legacy, do not write". Nová infrastruktura je nezapisuje.

---

## 2. Schema dle dokumentace (Agent B — Contract reviewer)

Agent B analyzoval pouze `docs/`, `README.md`, a JSDoc/inline komentáře (bez čtení executable code).

### LEADS sloupce dle `docs/23-data-model.md`

#### Legacy 1-20

Per `docs/23:24-33`:
- Col 4: `business_name`, Col 9: `city`, Col 11: `phone`, Col 12: `email`, Col 13: `website_url`, Col 20: `has_website`
- Další bez pozic: `source`, `ico`, `contact_name`, `segment`, `service_type`, `area`

#### Extension sloupce dle `docs/23:35-46`

**Docs tvrdí: 45 sloupců** (hlavička `### Extension sloupce (45 sloupcu, append-only)`).

Groupy: Deduplikace / Pipeline / Template / Personalizace / Email draft / Kontakt / Identita / Email sync (9 polí) / System / Review (B-06: 4 pole) / Source metadata (A-03: 6 polí).

### State machines dle docs

- **`lead_stage`** (`docs/23:52-53`): `NEW → QUALIFIED / DISQUALIFIED / REVIEW → IN_PIPELINE → PREVIEW_SENT`
- **`preview_stage`** (`docs/23:55-69`, B-05+B-06):
  ```
  NOT_STARTED → BRIEF_READY → GENERATING → READY_FOR_REVIEW → APPROVED (B-06 APPROVE)
                                                           → REJECTED (B-06 REJECT)
                                                           → BRIEF_READY (B-06 CHANGES_REQUESTED, requeue)
                                         → FAILED (retry eligible)
  ```
- **`outreach_stage`** (`docs/23:80-81`): `NOT_CONTACTED → DRAFT_READY → CONTACTED → RESPONDED → WON / LOST`
- **`email_sync_status`** (`docs/23:83-84`): `NOT_LINKED → NOT_FOUND / REVIEW / DRAFT_CREATED → SENT → LINKED → REPLIED / ERROR`
- **`review_decision`** (`docs/23:71-78`, B-06): 3 hodnoty + stage transitions

### Write-back (Variant B) dle docs

`docs/23:155-157`:
- Col 21 drží `lead_id`
- `onContactSheetEdit` volá `findRowByLeadId_` pro aktuální řádek v LEADS
- Secondary guard: `business_name + city` match

### B-06 atomic multi-cell write dle docs

`docs/23:101` + B6.md:
- 4 cílové sloupce pre-resolvovány PŘED prvním `setValue`
- Atomic write pod 5s LockService
- Guards: preview_stage / dedupe_flag / lead_stage / outreach_stage / missing columns

### Source of truth claims dle docs

| Doména | Source of truth |
|--------|------------------|
| LEADS sheet | Google Sheets (SPREADSHEET_ID) |
| Business data | LEADS |
| Ingest lifecycle | `_raw_import` |
| Review decision | LEADS `review_decision` (NE `send_allowed`) |

### CS1 canonical lifecycle (`docs/21:70-174`)

Docs dokumentují **18 canonical states** napříč 5 layers (Ingest, Enrichment, Qualification, Preview, Outreach). `lead_stage=NEW` overloaded napříč sub-states RAW_IMPORTED → WEB_CHECKED.

### Dedupe contract (`docs/contracts/dedupe-decision.md`)

T1-T4 algoritmus matching Agent A. Docs explicitly: **HARD_DUPLICATE auto-reject, SOFT/REVIEW NIKDY auto-merge** (`dedupe-decision.md:116`). Idempotence: deterministický `company_key`.

### Normalization (`docs/contracts/normalization-raw-to-leads.md`)

Reject reasons: `INVALID_PAYLOAD_JSON`, `MISSING_BUSINESS_NAME`, `MISSING_CITY`, `NO_CONTACT_CHANNELS`, `NORMALIZATION_FAILED`, `LEADS_WRITE_FAILED`. Email/phone/website vždy stringy (`""` at invalid).

---

## 3. Rozpory (Merge A vs B)

| # | Aspekt | Kód říká | Docs říká | Severity |
|---|--------|----------|-----------|----------|
| **R1** | EXTENSION_COLUMNS count | **55 sloupců** (grep ověřeno) | **45 sloupců** (`docs/23:35` heading) | **P2 drift** |
| R2 | Intra-batch T3/T4 dedupe | Pouze flag `REVIEW_INTRA_BATCH_T3/T4`, **žádný `duplicate_of_lead_id`** | Docs nezmiňují chování | **P2 gap** |
| R3 | `branch_key` storage | Zapisováno (`PreviewPipeline.gs:292`), **nigde runtime nečteno** (grep = 0 reads) | Docs jen říká "branch identifier" bez popisu užití | **P3 gap** |
| R4 | LEGACY_COL validation per write-back | Run on every `onContactSheetEdit` (`ContactSheet.gs:728-742`) — blokuje write při position shift | Docs nevarují uživatele před změnou column order v LEADS | **P2 gap** |
| R5 | Preview snapshot fields | Kopie z `preview_brief_json` při `processPreviewQueue`. Změna brief_json NEsynchronizuje snapshot copies. | Docs zmiňují jako "kopie" bez explicitního drift risk warningu | P3 informational |
| R6 | `lead_stage='NEW'` | Single literal | `CS1` říká NEW pokrývá RAW_IMPORTED → WEB_CHECKED (4 sub-states) | P3 documented debt |

**Nejsou rozpory v:**
- Primary key mechanism (`lead_id` + Variant B + business_name+city secondary guard)
- Dedup algoritmus T1-T4 (shodné včetně buckets, reasons, idempotence)
- Review decision flow (APPROVE/REJECT/CHANGES_REQUESTED → stage transitions)
- Write-back pod 5s LockService
- Preview stage enum (B-05 extended) + legacy backward-compat reads
- `send_allowed` ne-role jako approval flag
- Email/phone always string (`""` at invalid, nikdy `null`)
- Normalization reject reasons (6 kategorie)
- A-09 `_ingest_reports` schema (41 sloupců, aligned)
- B-06 atomic 4-cell write (aligned)

---

## 4. Bílá místa v kódu (docs slibují, kód nedělá)

**Žádné materiální bílé místo.** Všechny state machines, dedup buckets, write-back flow, B-06 atomic handler, A-09 ingest report metrics jsou v kódu implementované. Nuance:
- `_ingest_reports` docs popisuje 41 sloupců, `IngestReport.gs` confirm. ✅
- B-06 atomic write guards (preview_stage, dedupe_flag, lead_stage, outreach_stage, missing columns) implementované v `handleReviewDecisionEdit_`. ✅
- Variant B lookup (`findRowByLeadId_` + secondary guard) implementováno. ✅
- Dedup T1-T4 + intra-batch detection v `DedupeEngine.gs`. ✅

---

## 5. Bílá místa v dokumentaci (kód dělá, docs nezmiňuje)

- **R2:** Intra-batch T3/T4 collision ponechává `duplicate_of_lead_id` empty. Docs by měly vysvětlit, proč (pravděpodobně SOFT dup intentionally not pre-tagged; ale inconsistence s T1/T2 nedokumentovaná).
- **R3:** `branch_key` computation v kódu, writes OK, absent read path. Docs nevysvětlují účel.
- **R4:** LEGACY_COL validation brittleness — docs nevarují operatora před column insert/reorder.
- **R5:** Preview snapshot drift risk — docs nezmíní že editace `preview_brief_json` nepřepíše snapshot copies.

---

## 6. Odpovědi na 32 checklist bodů

### A. LEADS struktura

1. **Každá read funkce:** ✅ zmapováno (widespread `hr.get(row, ...)` napříč `ContactSheet.gs`, `PreviewPipeline.gs`, `MailboxSync.gs`, `Normalizer.gs`).
2. **Každá write funkce:** ✅ `RawImportWriter.gs` (append), `PreviewPipeline.gs` (qualify + brief), `ContactSheet.gs` (review, write-back), `WebAppEndpoint.gs` (BX1 doPost), `MailboxSync.gs` (email metadata).
3. **Centralizovaná definice schémat:** ✅ `Config.gs` (EXTENSION_COLUMNS, LEGACY_COL, 8 enumů). Drift: count 55 vs docs "45" (**R1**).
4. **Mapa sloupec → sémantika:** ✅ v `docs/23` (mostly aligned, R1-R5 výjimky).
5. **Naming konzistence:** ⚠️ `ičo` (s diakritikou) v kódu vs `ico` v docs — HeaderResolver case-insensitive, tak funguje, ale inconsistent.
6. **Primary key:** ✅ `lead_id` (format `ASW-{ts36}-{rnd4}` + legacy `FIRMYCZ-*`).
7. **Rows bez primary key:** ⚠️ write-back blocked, operator musí spustit "Ensure lead IDs" manually.

### B. Ke kontaktování struktura

8. **Kopie sloupců z LEADS:** ✅ Priorita, Firma combined, Preview, Telefon, E-mail, Lead ID.
9. **Přidané/derived sloupce:** ✅ Priorita (z `contact_priority`), Firma (name+city), Preview (badge + link), Lead ID.
10. **Tvorba (filter + četnost):** ✅ `refreshContactingSheet` (manual menu trigger), filter přes `buildContactReadiness_`.
11. **Primary key sdílený s LEADS:** ✅ via col 21.

### C. Write-back

12. **Funkce co zapisuje zpět:** ✅ `onContactSheetEdit` (plain) + `handleReviewDecisionEdit_` (atomic B-06).
13. **Pole zapisovaná zpět:** ✅ `WRITEBACK_MAP_` [7]-[13].
14. **Lookup mechanism:** ✅ Variant B + business_name+city secondary guard.
15. **Race condition:** ✅ LockService 5s tryLock both v refresh a onEdit. Aligned code+docs.
16. **Smazaný řádek v LEADS:** ⚠️ — `findRowByLeadId_` returns null → write blocked, operator note.

### D. Deduplikace

17. **Algoritmus:** ✅ T1-T4 deterministický.
18. **Co s duplikátem:** ✅ HARD auto-reject; SOFT/REVIEW čekají na manual (nikdy auto-merge).
19. **Zachování poznámek:** ❓ duplicates se nepropagují do LEADS.
20. **Idempotence:** ✅ deterministický company_key.

### E. Validace & edge cases

21. **Email validace:** ✅ `Normalizer.gs:137` regex.
22. **URL validace:** ✅ `canonicalizeUrl_` + `isRealUrl_` + `BLOCKED_HOST_FRAGMENTS`.
23. **Lead bez emailu:** ✅ povolen pokud má phone; reject pouze pokud oba empty.
24. **Unicode:** ✅ NFD normalize pro dedupe keys; city preservuje diakritiku.
25. **Fixture / test data:** ✅ `scripts/test-a05-batch.mjs` (50 records, 8 dedup kategorie); scraper samples.

### F. Dokumentační pohled

26. **Kde je schema:** ✅ `docs/23`, `docs/contracts/*` (4 md + 3 JSON), task records A/B/BX.
27. **Dedup pravidla:** ✅ `docs/contracts/dedupe-decision.md` — explicit T1-T4 + buckets + idempotence.
28. **Write-back pravidla:** ✅ `docs/23:155-157` + `BX1.md` + `B6.md`.
29. **Source of truth claims:** ✅ `docs/23:8-10` + per-section.

### G. Merge

30. **Rozpory kód ↔ docs:** 6 (R1-R6), severity P2-P3 (viz Sekce 3).
31. **Chybějící dokumentace pro chování v kódu:** 3 gaps — R2 (intra-batch dedup pattern), R3 (branch_key purpose), R4 (LEGACY_COL brittleness warning).
32. **Chybějící kód pro chování v docs:** **0 materiálních**.

---

## Findings

Viz [../FINDINGS.md](../FINDINGS.md). V této fázi přidáno **6 findings DM-001 až DM-006** (3× P2, 3× P3).
