# Column mappings — varianty řešení

> **Datum:** 2026-04-04
> **Navazuje na:** docs/06-column-mappings-analysis.md
> **Pravidlo:** Žádné změny kódu — pouze návrh variant k odsouhlasení

---

## Kontext z analýzy

Situace je **lepší než očekáváno**:

- Frontend READ i WRITE path jsou dynamické — nepoužívají hardcoded indexy
- `LEADS_COLUMNS` v config.ts je dead code (nikde se neimportuje)
- Hardcoded indexy existují jen v Apps Script (`LEGACY_COL`) a jsou částečně chráněny runtime validací
- Outreach stage enums jsou synchronizované

**Hlavní problém k řešení:** Není systémový mechanismus, který by odhalil drift mezi Apps Script a frontend definicemi (header names, enum values). Současná ochrana je *pasivní* (tiché selhání) místo *aktivní* (explicitní error).

---

## Varianta A: Minimální — smazat dead code + dokumentovat

### Co udělat

1. Smazat `LEADS_COLUMNS` z `config.ts` (dead code, matoucí)
2. Přidat komentář do `config.ts` vysvětlující že READ path je dynamický
3. Přidat komentář do `Config.gs` s odkazem na frontend DYNAMIC_HEADERS
4. Aktualizovat `docs/01-audit-consolidation.md` — D-2 jako vyřešený

### Přínosy

- Odstraní matoucí dead code
- Dokumentuje propojení mezi systémy
- Žádné riziko (jen mazání nepoužívaného kódu + komentáře)

### Nevýhody

- Žádný automatický guard proti budoucímu driftu
- Tiché selhání při header mismatch zůstává

### Složitost

~15 minut, 2 soubory

---

## Varianta B: Doporučená — A + runtime header validation

### Co udělat

1. Vše z Varianty A
2. Přidat validation helper do `sheet-to-domain.ts`:
   ```ts
   function validateHeaders(headers: Map<string, number>, required: readonly string[]): string[] {
     return required.filter(h => !headers.has(h));
   }
   ```
3. Volat při `buildHeaderMap()` — pokud chybí required headers → logovat warning (ne crash)
4. V `DYNAMIC_HEADERS` rozlišit `REQUIRED` vs `OPTIONAL`:
   - REQUIRED: klíčové pro fungování (lead_id, outreach_stage, email, business_name, ...)
   - OPTIONAL: nice-to-have (preview_screenshot_url, personalization_level, ...)
5. Přidat `validateLegacyColHeaders_()` volání i do `LegacyWebCheck.gs` (chybí tam)

### Přínosy

- Aktivní detekce chybějících headers místo tichého selhání
- LegacyWebCheck.gs získá stejnou ochranu jako ContactSheet.gs
- Degradace je explicitní — log říká co chybí
- Neblokující — warning, ne error

### Nevýhody

- Mírně více kódu (~20 řádků frontend + ~5 řádků Apps Script)
- Warning logy potřebují místo kam jít (console.warn v Next.js, aswLog_ v Apps Script)

### Složitost

~45 minut, 4 soubory

---

## Varianta C: Ideální — B + shared schema + CI check

### Co udělat

1. Vše z Varianty B
2. Vytvořit `docs/column-schema.json` — single source of truth:
   ```json
   {
     "legacy_columns": {
       "business_name": { "position_1based": 4 },
       "city": { "position_1based": 9 },
       ...
     },
     "extension_columns": ["company_key", "branch_key", ...],
     "outreach_stages": {
       "NOT_CONTACTED": "Neosloveno",
       ...
     },
     "frontend_required_headers": ["lead_id", "outreach_stage", ...],
     "frontend_optional_headers": ["preview_screenshot_url", ...]
   }
   ```
3. Přidat script `scripts/validate-column-sync.ts`:
   - Parsuje `Config.gs` (regex na LEGACY_COL, EXTENSION_COLUMNS)
   - Parsuje `config.ts` (regex na DYNAMIC_HEADERS, OUTREACH_STAGES)
   - Porovná proti `column-schema.json`
   - Reportuje rozdíly
4. Přidat do `package.json`: `"validate:columns": "npx tsx scripts/validate-column-sync.ts"`

### Přínosy

- Jedna zdrojová pravda pro column mapping
- Automatická detekce driftu (spustitelný skript)
- Lze přidat do CI/CD pipeline (až bude)
- Dokumentace i validace v jednom

### Nevýhody

- Regex parsování .gs souborů je křehké
- Další soubor k údržbě (column-schema.json)
- Apps Script nemůže číst lokální JSON — synchronizace je jednosměrná
- Overkill pro projekt s jedním vývojářem

### Složitost

~2 hodiny, 4+ souborů + nový script

---

## Srovnání variant

| Kritérium | A: Minimální | B: Doporučená | C: Ideální |
|-----------|:---:|:---:|:---:|
| Odstraní dead code | **ANO** | **ANO** | **ANO** |
| Runtime ochrana | — | **ANO** | **ANO** |
| Automatická detekce driftu | — | částečně | **ANO** |
| Single source of truth | — | — | **ANO** |
| Riziko zavedení | nulové | nízké | střední |
| Složitost | 15 min | 45 min | 2h |
| Vhodné pro tento projekt | přijatelné | **optimální** | overkill |

---

## Doporučení: Varianta B

**Proč:**

1. Projekt má jednoho vývojáře — CI-based schema validation (Varianta C) je zbytečná režie
2. Runtime header validation zachytí problém **když nastane**, ne před tím (ale to stačí)
3. Dead code removal je hygienická nutnost
4. LegacyWebCheck.gs bez validace je skutečná díra — easy fix

**Co Varianta B nezahrnuje (a proč to je OK):**

- Shared JSON schema — Apps Script ho nemůže použít, takže by to byl jen dokumentační artefakt
- Automatický CI check — není CI pipeline, projekt nemá GitHub remote
- Typ-safe sdílení — dva různé runtime (V8 Apps Script vs Node.js), nelze sdílet typy

---

## Guard mechanismy — co už existuje a co přidat

### Existující guardy

| Guard | Kde | Co chrání |
|-------|-----|-----------|
| `validateLegacyColHeaders_()` | Helpers.gs → ContactSheet.gs | LEGACY_COL pozice při write-back |
| Identity verification | ContactSheet.gs:618–647 | Row-number mismatch při write-back |
| `HeaderResolver` | Helpers.gs → všude v Apps Script | Dynamické mapování (extension sloupce) |
| `buildHeaderMap()` | sheet-to-domain.ts → sheets-reader.ts | Dynamické mapování ve frontendu |
| Header cache TTL (5 min) | sheets-reader.ts | Refresh mappingu při změně headers |

### Navrhované guardy (Varianta B)

| Guard | Kde | Co chrání | Priorita |
|-------|-----|-----------|----------|
| Header validation ve frontendu | sheet-to-domain.ts | Chybějící required headers → warning log | P1 |
| `validateLegacyColHeaders_()` v LegacyWebCheck | LegacyWebCheck.gs | LEGACY_COL pozice při web check | P1 |
| LEADS_COLUMNS removal | config.ts | Eliminuje matoucí dead code | P2 |

---

## Otevřené body pro rozhodnutí vlastníka

| # | Otázka | Kontext |
|---|--------|---------|
| 1 | **Kterou variantu?** | A (minimální), B (doporučená), C (ideální) |
| 2 | **Smazat LEADS_COLUMNS?** | Je dead code, ale smazání je nevratné (snadno obnovitelné z gitu) |
| 3 | **Warning vs error při chybějícím headeru?** | Warning = UI běží dál bez dat; Error = stránka spadne ale problém je viditelný |
| 4 | **Kam logovat warnings?** | console.warn (viditelné jen v server logu) vs uložit do speciální buňky/sheetu |
