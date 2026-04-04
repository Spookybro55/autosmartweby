# Analýza column mappings — Apps Script vs CRM Frontend

> **Datum:** 2026-04-04
> **Účel:** Najít všechna místa kde se definují/používají mapování sloupců, porovnat je, identifikovat rizika
> **Pravidlo:** Žádné změny kódu — pouze analýza

---

## 1. Kde žijí column mappings

### A) Apps Script — `Config.gs`

| Definice | Typ | Řádky | Popis |
|----------|-----|-------|-------|
| `LEGACY_COL` | hardcoded 1-based | 44–51 | 6 sloupců: BUSINESS_NAME:4, CITY:9, PHONE:11, EMAIL:12, WEBSITE:13, HAS_WEBSITE:20 |
| `LEGACY_COL_HEADERS` | pozice→jméno | 54–60 | Validační mapa: 4→business_name, 9→city, 11→phone, 12→email, 13→website_url, 20→has_website |
| `EXTENSION_COLUMNS` | string[] | 63–109 | 45 jmen sloupců v pořadí appendu (company_key … email_last_error) |

### B) Apps Script — `Helpers.gs`

| Definice | Typ | Řádky | Popis |
|----------|-----|-------|-------|
| `HeaderResolver` | dynamický | — | Třída: načte header row, mapuje jméno→pozice za běhu |
| `validateLegacyColHeaders_()` | runtime guard | 245+ | Porovná LEGACY_COL_HEADERS vs skutečné hlavičky v sheetu |

### C) Apps Script — `LegacyWebCheck.gs`

| Použití | Typ | Popis |
|---------|-----|-------|
| `LEGACY_COL.WEBSITE`, `.HAS_WEBSITE`, `.BUSINESS_NAME`, `.CITY`, `.PHONE`, `.EMAIL` | hardcoded | Čte/zapisuje 6 legacy sloupců přes 1-based indexy |

### D) Apps Script — `ContactSheet.gs`

| Použití | Typ | Popis |
|---------|-----|-------|
| `LEGACY_COL.BUSINESS_NAME`, `.CITY` | hardcoded | Identity verification při write-back (ř. 620–623) |
| `WRITEBACK_MAP_` | hardcoded | 5 polí: col 7→outreach_stage, 8→next_action, 9→last_contact_at, 10→next_followup_at, 11→sales_note |
| `validateLegacyColHeaders_()` | runtime guard | P0 check před každým write-back (ř. 602–616) |
| `HeaderResolver` (sourceHr) | dynamický | Pro zápis do extension sloupců (ř. 657) |

### E) CRM Frontend — `config.ts`

| Definice | Typ | Řádky | Popis |
|----------|-----|-------|-------|
| `LEADS_COLUMNS` | hardcoded 0-based | 11–22 | 6 sloupců: business_name:3, city:8, phone:10, email:11, website_url:12, has_website:19 |
| `DYNAMIC_HEADERS` | string[] | 25–38 | 36 jmen hlaviček pro runtime resolution |
| `OUTREACH_STAGES` | enum | 41–48 | 6 stavů: NOT_CONTACTED→Neosloveno, … LOST→Nezájem |
| `OUTREACH_STAGE_REVERSE` | reverse map | 54–56 | Czech label → English key |

### F) CRM Frontend — `mappers/sheet-to-domain.ts`

| Použití | Typ | Popis |
|---------|-----|-------|
| `buildHeaderMap(headerRow)` | dynamický | Staví Map<string, number> z header row |
| `mapRowToLead(row, headers, rowNumber)` | dynamický | VŠECHNA pole čte přes `col(row, headers, 'header_name')` |

### G) CRM Frontend — `google/sheets-reader.ts`

| Použití | Typ | Popis |
|---------|-----|-------|
| `getHeaderMap()` | dynamický | Načte header row z Google Sheets API, 5min cache TTL |
| `buildHeaderMap()` | dynamický | Deleguje na mapper |

### H) CRM Frontend — `google/apps-script-writer.ts`

| Použití | Typ | Popis |
|---------|-----|-------|
| 5 field names v payload | string-based | outreach_stage, next_action, last_contact_at, next_followup_at, sales_note |
| `humanizeOutreachStage()` | enum-based | Konvertuje EN key → CZ label přes OUTREACH_STAGES |

---

## 2. Porovnání: Co je kde a jak

### 2.1 Hardcoded indexy — LEGACY_COL vs LEADS_COLUMNS

| Sloupec | Apps Script (1-based) | Frontend (0-based) | Ekvivalent? |
|---------|----------------------|-------------------|-------------|
| business_name | 4 | 3 | **ANO** (4-1=3) |
| city | 9 | 8 | **ANO** (9-1=8) |
| phone | 11 | 10 | **ANO** (11-1=10) |
| email | 12 | 11 | **ANO** (12-1=11) |
| website_url | 13 | 12 | **ANO** (13-1=12) |
| has_website | 20 | 19 | **ANO** (20-1=19) |

**Stav: Synchronizované.** Všech 6 pozic sedí (offset -1 mezi 1-based a 0-based).

### 2.2 Extension columns — EXTENSION_COLUMNS vs DYNAMIC_HEADERS

| V Apps Script EXTENSION_COLUMNS (45) | V Frontend DYNAMIC_HEADERS (36) | Chybí ve frontendu |
|--------------------------------------|--------------------------------|-------------------|
| company_key | — | chybí |
| branch_key | — | chybí |
| dedupe_group | — | chybí |
| dedupe_flag | — | chybí |
| qualification_reason | — | chybí |
| preview_slug | — | chybí |
| preview_generated_at | — | chybí |
| preview_version | — | chybí |
| preview_brief_json | — | chybí |
| preview_subheadline | — | chybí |
| preview_cta | — | chybí |
| preview_quality_score | — | chybí |
| preview_needs_review | — | chybí |
| send_allowed | — | chybí |
| webhook_payload_json | — | chybí |
| preview_error | — | chybí |
| last_processed_at | — | chybí |
| email_thread_id | — | chybí |
| email_last_message_id | — | chybí |
| email_mailbox_account | — | chybí |
| email_subject_last | — | chybí |
| email_last_error | — | chybí |

**22 sloupců** z Apps Script nemá protějšek v DYNAMIC_HEADERS. To je **záměrné** — frontend nepotřebuje interní processing sloupce (company_key, dedupe_group, webhook_payload_json, atd.).

Žádný sloupec v DYNAMIC_HEADERS nechybí v EXTENSION_COLUMNS (nebo v původních sheetu sloupcích).

### 2.3 Outreach stage enum

| Stav | Apps Script (humanize) | Frontend (OUTREACH_STAGES) | Shodné? |
|------|----------------------|---------------------------|---------|
| NOT_CONTACTED | Neosloveno | Neosloveno | **ANO** |
| DRAFT_READY | Připraveno | Připraveno | **ANO** |
| CONTACTED | Osloveno | Osloveno | **ANO** |
| RESPONDED | Reagoval | Reagoval | **ANO** |
| WON | Zájem | Zájem | **ANO** |
| LOST | Nezájem | Nezájem | **ANO** |

**Stav: Synchronizované.** Apps Script navíc handluje varianty bez diakritiky (pripraveno, zajem, nezajem).

### 2.4 Write-back fields

| Pole | Frontend → Apps Script | Apps Script WRITEBACK_MAP_ | Shodné? |
|------|----------------------|---------------------------|---------|
| outreach_stage | payload.outreach_stage (CZ label) | col 7 → outreach_stage (reverseHumanize) | **ANO** |
| next_action | payload.next_action | col 8 → next_action | **ANO** |
| last_contact_at | payload.last_contact_at | col 9 → last_contact_at | **ANO** |
| next_followup_at | payload.next_followup_at | col 10 → next_followup_at | **ANO** |
| sales_note | payload.sales_note | col 11 → sales_note | **ANO** |

**Stav: Synchronizované.** Frontend posílá field names (ne indexy), Apps Script je rozpoznává.

---

## 3. Klíčový nález: LEADS_COLUMNS je MRTVÝ KÓD

### Důkaz

1. `LEADS_COLUMNS` je **definován** v `config.ts:11–22`
2. `LEADS_COLUMNS` **není importován** nikde v celém `crm-frontend/src/` — grep vrací 0 import hitů
3. `mapRowToLead()` čte **všechna** pole přes dynamický `col(row, headers, 'header_name')` — nepoužívá žádné hardcoded indexy
4. `buildHeaderMap()` staví mapování z header row — nepotřebuje LEADS_COLUMNS
5. `sheets-reader.ts` importuje pouze `SHEET_CONFIG` z config.ts — ne LEADS_COLUMNS

**Závěr: LEADS_COLUMNS v config.ts je dead code.** Byl pravděpodobně vytvořen na začátku vývoje, ale nikdy nebyl skutečně integrován do čtecí cesty. Celý frontend READ path je plně dynamický.

### Praktický dopad

- Pokud se v Google Sheetu přidá/odebere/přesune sloupec:
  - **READ path**: Funguje automaticky (dynamické mapování z header row)
  - **WRITE path**: Funguje automaticky (posílá field names, ne indexy)
  - **LEADS_COLUMNS**: Nic se nestane (nikdo ho nečte)

---

## 4. Kde jsou skutečná rizika

### R-1: LEGACY_COL hardcoded indexy v Apps Script (STŘEDNÍ)

**Co:** LegacyWebCheck.gs a ContactSheet.gs používají 1-based indexy.

**Kdy se rozbije:** Pokud se v sheetu přidá/odebere/přesune sloupec v pozicích 1–20.

**Ochrana existuje:** `validateLegacyColHeaders_()` v Helpers.gs — běží před každým write-back a blokuje operaci pokud pozice nesedí.

**Ochrana neexistuje pro:** LegacyWebCheck.gs — volá LEGACY_COL přímo bez validace.

### R-2: Row-number-based write-back (VYSOKÉ)

**Co:** Frontend posílá `rowNumber` jako identifikátor řádku. ContactSheet.gs ho používá pro zápis.

**Kdy se rozbije:** Pokud se v sheetu řádky seřadí, smažou, nebo vloží. Row number se změní, ale frontend má starý cached údaj.

**Ochrana existuje:** Identity verification v ContactSheet.gs (ř. 618–647) — porovná business_name + city před zápisem. Pokud nesedí → write-back BLOCKED.

**Residuální riziko:** Dva leadi se stejným business_name + city → false positive na identity match.

### R-3: WRITEBACK_MAP_ hardcoded pozice v "Ke kontaktování" sheetu (NÍZKÉ)

**Co:** WRITEBACK_MAP_ mapuje sloupce 7–11 v contact sheetu na field names.

**Kdy se rozbije:** Pokud se změní layout "Ke kontaktování" sheetu.

**Ochrana:** Contact sheet je generován kódem (`refreshContactSheet_`), takže layout je deterministický.

### R-4: Header name typo/mismatch (NÍZKÉ)

**Co:** Frontend DYNAMIC_HEADERS musí přesně odpovídat header names v sheetu.

**Kdy se rozbije:** Pokud se v sheetu přejmenuje hlavička.

**Ochrana:** `col()` helper vrací undefined/empty pro neznámé hlavičky — tiché selhání (ne crash).

**Problém:** Tiché selhání = data chybí v UI ale žádná chybová hláška.

### R-5: Outreach stage enum drift (NÍZKÉ)

**Co:** Pokud se přidá nový stav na jedné straně ale ne na druhé.

**Ochrana:** Apps Script `reverseHumanizeOutreachStage_()` vrací vstup nezměněný pokud ho nerozpozná. Frontend `parseOutreachStage()` defaultuje na 'NOT_CONTACTED'.

**Problém:** Degradace místo crashe — nový stav se zobrazí jako fallback.

---

## 5. Mapa datového toku

```
Google Sheet (LEADS)
  │
  ├── READ PATH (frontend)
  │   ├── sheets-reader.ts → Google Sheets API v4
  │   ├── getHeaderMap() → buildHeaderMap(headerRow) → Map<string, number>
  │   ├── mapRowToLead(row, headers, rowNum) → col(row, headers, 'name')
  │   └── 100% DYNAMICKÉ — žádné hardcoded indexy
  │
  ├── READ PATH (Apps Script — legacy web check)
  │   ├── LegacyWebCheck.gs → LEGACY_COL (1-based indexy)
  │   └── HARDCODED — žádná runtime validace
  │
  ├── WRITE PATH (frontend → Apps Script)
  │   ├── apps-script-writer.ts → POST { action, leadId, rowNumber, fields }
  │   ├── fields = { outreach_stage, next_action, ... } (string names)
  │   ├── outreach_stage posílán jako CZ label (humanized)
  │   └── FIELD-NAME BASED — žádné hardcoded indexy
  │
  └── WRITE PATH (Apps Script — contact sheet edit)
      ├── ContactSheet.gs:onContactSheetEdit()
      ├── WRITEBACK_MAP_[col] → field name → HeaderResolver.col(field)
      ├── P0 guard: validateLegacyColHeaders_() — blokovací check
      ├── P0.1 guard: identity verification (business_name + city)
      └── HYBRID — hardcoded guard + dynamický zápis přes HeaderResolver
```

---

## 6. Shrnutí rizikových oblastí

| ID | Riziko | Závažnost | Ochrana | Stav |
|----|--------|-----------|---------|------|
| R-1 | LEGACY_COL hardcoded indexy | STŘEDNÍ | validateLegacyColHeaders_() — ale jen pro write-back, ne LegacyWebCheck | ČÁSTEČNĚ CHRÁNĚNO |
| R-2 | Row-number write-back | VYSOKÉ | Identity verification (business_name + city) | CHRÁNĚNO (s edge case) |
| R-3 | WRITEBACK_MAP_ pozice | NÍZKÉ | Contact sheet je generován kódem | CHRÁNĚNO |
| R-4 | Header name mismatch | NÍZKÉ | Tiché selhání (žádný crash, ale chybí data) | NECHRÁNĚNO |
| R-5 | Outreach stage drift | NÍZKÉ | Fallback na default | DEGRADACE |
| D-1 | LEADS_COLUMNS dead code | INFO | — | NEPOUŽÍVÁNO |

---

## 7. Co je v pořádku (a proč)

1. **Frontend READ path je plně dynamický** — nejlepší možný stav, žádná synchronizace potřeba
2. **Frontend WRITE path posílá field names** — nezávislý na pozicích sloupců
3. **Outreach stage enums jsou synchronizované** — obě strany mají shodných 6 stavů
4. **LEGACY_COL validace existuje** — runtime guard před kritickými operacemi
5. **Contact sheet je generovaný** — deterministický layout
