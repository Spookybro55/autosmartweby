# Write-Back Risk Analysis

> Verze 1.0 | 2026-04-04 | Autor: Claude + user

Detailni analyza mechanismu row-based write-back v CRM systemu Autosmartweby. Ucel: identifikovat edge cases, rizika a testovaci scenare PRED jakoukoli implementacni zmenou.

---

## 1. Jak write-back funguje dnes (end-to-end)

### 1.1 Refresh flow (LEADS -> "Ke kontaktovani")

```
refreshContactingSheet()
  1. Cte vsechny radky z LEADS (DATA_START_ROW = 2+)
  2. Pro kazdy radek: buildContactReadiness_(hr, row)
     → filtruje: qualified_for_preview, dedupe, lead_stage, kontakt, preview_stage, outreach
  3. Pro contact-ready radky: buildContactRowV2_(hr, row, sourceRowNum)
     → sourceRowNum = i + DATA_START_ROW  (absolutni cislo radku v LEADS)
     → ulozi sourceRowNum do sloupce 19 (CRM_ROW_COL_)
  4. Smaze/vycisti sheet "Ke kontaktovani"
  5. Zapise dashboard (radky 1-4), header (radek 5), data (radek 6+)
  6. Nastavi dropdown validace, formatting, ochranu
```

**Klicovy detail:** sourceRowNum je **1-based absolutni cislo radku** v LEADS sheetu. Vypocet: `i + DATA_START_ROW`, kde `i` je 0-based index v poli dat a `DATA_START_ROW = 2`.

### 1.2 Write-back flow (onContactSheetEdit trigger)

```
onContactSheetEdit(e)
  1. Guard: sheet == "Ke kontaktovani"?
  2. Guard: row >= TABLE_DATA_START_ (6)?
  3. Guard: col in WRITEBACK_MAP_ (7-11)?
  4. Lock: LockService.getScriptLock(), tryLock(2000ms)
     → Fail: warning note na bunce, log, return
  5. Cteni crmRowNum z CRM_ROW_COL_ (sloupec 19)
     → Guard: !crmRowNum || crmRowNum < DATA_START_ROW → return
  6. P0: validateLegacyColHeaders_(sourceSheet)
     → Fail: error note, log, return (BLOCKED)
  7. P0.1: Identity verification
     → Cte business_name (LEGACY_COL.BUSINESS_NAME = col 4) a city (LEGACY_COL.CITY = col 9) ze source
     → Cte firmu+mesto z contact sheetu (sloupec 2, rozdeleno '\n')
     → Porovnava normalizeBusinessName_() + removeDiacritics_(trimLower_())
     → Fail: error note, log, return (BLOCKED)
  8. reverseHumanize pokud mapping.reverseHumanize = true (col 7 = outreach_stage)
  9. HeaderResolver.colOrNull(mapping.field) → zjisti aktualni pozici sloupce
  10. sourceSheet.getRange(crmRowNum, sourceCol).setValue(newValue)
  11. Clear warning notes, log success
  FINALLY: lock.releaseLock()
```

### 1.3 Frontend write path (apps-script-writer.ts)

```
updateLeadFields(leadId, rowNumber, businessName, city, fields)
  → POST na APPS_SCRIPT_URL s:
    { action: 'updateLead', leadId, rowNumber, businessName, city, fields, token }
  → Frontend posila field names (outreach_stage, next_action, ...), ne indexy
  → outreach_stage konvertovan na cesky label pred odeslanim
```

**Pozor:** Tento endpoint v Apps Script zatim NENI implementovan — apps-script-writer.ts je pripraveny klient, ale server-side doPost() handler pro `action: 'updateLead'` neexistuje. Write-back dnes funguje POUZE pres Google Sheets onEdit trigger.

---

## 2. Soucasne bezpecnostni guardy

| Guard | Kde | Co chrani |
|-------|-----|-----------|
| Sheet name check | onContactSheetEdit L564 | Jen edity na "Ke kontaktovani" |
| Row range check | onContactSheetEdit L570 | Jen datove radky (6+), ne dashboard/header |
| Column check | onContactSheetEdit L573 | Jen sloupce 7-11 (WRITEBACK_MAP_) |
| LockService | onContactSheetEdit L577 | Soubeznne zapisy (2s timeout) |
| CRM row ref check | onContactSheetEdit L589 | Neplatna/chybejici reference |
| P0: Header validation | onContactSheetEdit L603 | Strukturalni zmena sheetu |
| P0.1: Identity check | onContactSheetEdit L619-647 | Prepsani spatneho radku |
| Note feedback | onContactSheetEdit L581, L609, L641 | User zna, ze se zmena nepropsala |

---

## 3. Edge cases a rizika

### RIZIKO R-1: Stale row reference po insertu/deletu (KRITICKE)

**Scenar:** Uzivatel (nebo jiny script) vlozi/smaze radek v LEADS sheetu MEZI dvema refreshi "Ke kontaktovani".

**Mechanismus:**
- Refresh zapise `sourceRowNum = i + DATA_START_ROW` (napr. radek 150)
- Nekdo vlozi radek 100 do LEADS
- Puvodni radek 150 je nyni radek 151
- Contact sheet stale drzi referenci 150
- Write-back zapise na radek 150 = SPATNY radek

**Soucasna ochrana:** P0.1 identity check (business_name + city). Pokud se nazev firmy na radku 150 LISI od firmy v contact sheetu, zapis je ZABLOKOVANY.

**Zbytkove riziko:**
- Dve firmy se stejnym nazvem a mestem na po sobe jdoucich radcich (nizka pravdepodobnost, ale nenulova)
- Firma bez nazvu (prazdne business_name) — normalizeBusinessName_('') === normalizeBusinessName_('') = true
- Mesto je volitelne v porovnani: `!contactCity || !sourceCity` → pokud jedno chybi, city check je preskocen

**Zavaznost:** VYSOKA — silent data corruption pri insert/delete + shodnem nazvu

### RIZIKO R-2: Race condition pri soubeznnem editovani

**Scenar:** Dva uzivatele edituji ruzne bunky ve "Ke kontaktovani" soucasne.

**Mechanismus:**
- User A edituje radek 10, col 7 → trigger fired
- User B edituje radek 15, col 8 → trigger fired
- LockService.tryLock(2000ms) — JEDEN uspeje, druhy ceka max 2s

**Soucasna ochrana:** LockService s 2s timeout. Pri timeout: warning note + log.

**Zbytkove riziko:**
- 2s timeout je kratky — pri pomale siti/velkych datech muze byt nedostatecny
- Uzivatel nemuze videt, ze se zmena nepropsala, pokud nepresune kurzor na bunku s note
- Note muze byt prehlednuta

**Zavaznost:** STREDNI — data ztrata jedne editace, uzivatel ma feedback (note), ale snadno prehlédne

### RIZIKO R-3: Refresh behem editovani

**Scenar:** Uzivatel edituje bunku ve "Ke kontaktovani", mezitim nekdo spusti refreshContactingSheet().

**Mechanismus:**
- Refresh smaze cely "Ke kontaktovani" sheet (cs.clear() na L388)
- Probiha rebuild od nuly
- Pokud editacni trigger jeste nebezí, edit se ztrati
- Pokud trigger bezi soucasne s refreshem, cte z mazaneho/prebuildeneho sheetu

**Soucasna ochrana:** ZADNA. Refresh nepouziva LockService. Neni koordinace s onEdit triggerem.

**Zbytkove riziko:**
- Kompletni ztrata nepropsanych editu
- Corrupted read behem rebuildu

**Zavaznost:** VYSOKA — ztrata dat bez variovani

### RIZIKO R-4: Prazdny/neplatny crmRowNum

**Scenar:** CRM_ROW_COL_ (sloupec 19) je prazdny, nula, nebo obsahuje neciselnou hodnotu.

**Soucasna ochrana:** Check na L589: `if (!crmRowNum || crmRowNum < DATA_START_ROW)` — return s logem.

**Zbytkove riziko:** Minimalni — dobre oshetreno. Jedina slabina: neloguje PROC chybi (deleted row? corrupted data?).

**Zavaznost:** NIZKA

### RIZIKO R-5: reverseHumanizeOutreachStage_ failure

**Scenar:** Uzivatel zada hodnotu ktera neni v HUMAN_STAV_VALUES_ (napr. preklepu dropdown nebo prilepi text).

**Soucasna ochrana:** Dropdown validace `setAllowInvalid(false)` na sloupci 7 (L438-442). reverseHumanizeOutreachStage_ vraci original string pokud nezna mapovani.

**Zbytkove riziko:**
- Pokud dropdown constraint selze (copy-paste, API), do LEADS se zapise cesky label misto anglickeho klice
- Nasledne cteni frontendem selze pri mapovani

**Zavaznost:** NIZKA-STREDNI — frontend buildHeaderMap by nasel neplatnou hodnotu, ale nezobrazil by spravny stav

### RIZIKO R-6: HeaderResolver nenajde cílový sloupec

**Scenar:** Sloupec v LEADS (napr. `outreach_stage`) byl prejmenovan nebo smazan.

**Soucasna ochrana:** `sourceHr.colOrNull(mapping.field)` → null → log error, return (L658-662).

**Zbytkove riziko:** Minimalni — dobre osetreno, ale uzivatel nedostane feedback (zadna note na bunce pri tomto selhani).

**Zavaznost:** NIZKA

### RIZIKO R-7: Frontend apps-script-writer.ts nema server-side handler

**Scenar:** Frontend zavola `updateLeadFields()` ale Apps Script nema doPost handler pro `action: 'updateLead'`.

**Soucasna ochrana:** ZADNA v Apps Script. Frontend obdrzi HTTP error nebo neocekavanou odpoved.

**Zbytkove riziko:** Frontend by zobrazil chybovou hlasku, ale uzivatel muze byt zmaten proc to nefunguje.

**Zavaznost:** STREDNI — feature neni funkci, ale neni to data corruption

---

## 4. Testovaci scenare

### Scenar T-1: Happy path
- Editovat bunku v col 7 (Stav) na "Ke kontaktovani"
- Overit ze se hodnota propsala na spravny radek v LEADS
- Overit log zaznam

### Scenar T-2: Insert row v LEADS, pak edit v contact sheet
- Refresh contact sheet
- Vlozit radek do LEADS pred existujicim leadem
- Editovat bunku v contact sheet
- Ocekavany vysledek: P0.1 BLOCK (row mismatch), warning note

### Scenar T-3: Delete row v LEADS, pak edit v contact sheet
- Refresh contact sheet
- Smazat radek v LEADS
- Editovat bunku v contact sheet odkazujici na smazany radek
- Ocekavany vysledek: bud P0.1 BLOCK (jiny nazev) nebo zapis na spatny radek (pokud nahodna shoda)

### Scenar T-4: Soubeznny edit dvou bunek
- Dva uzivatele soucasne editují ruzne radky
- Ocekavany vysledek: jeden uspesny, druhy bud OK nebo timeout note

### Scenar T-5: Refresh behem editovani
- Zacit editovat bunku
- Zaroven spustit refresh z menu
- Ocekavany vysledek: NEPREDVIDATELNE — ztrata dat mozna

### Scenar T-6: Prazdne business_name
- Lead bez vyplneneho business_name
- Overit zda identity check funguje (obe strany prazdne → match → PROBLEM)

### Scenar T-7: Duplicitni firma+mesto
- Dva leady se stejnym nazvem a mestem
- Insert/delete radek → test zda identity check projde na spatny radek

### Scenar T-8: Neplatna hodnota v dropdown
- Copy-paste text do sloupce 7 (Stav) ktery neni v dropdownu
- Overit zda dropdown validace blokuje

### Scenar T-9: Prejmenovani sloupce v LEADS
- Prejmenovar sloupec (napr. outreach_stage → os)
- Editovat bunku v contact sheet
- Ocekavany vysledek: "Source column not found" error v logu

### Scenar T-10: Frontend updateLeadFields() volani
- Zavolat apps-script-writer.ts endpoint
- Ocekavany vysledek: HTTP error (handler neexistuje)

---

## 5. Shrnnuti rizik

| # | Riziko | Zavaznost | Soucasny guard | Dostatecny? |
|---|--------|-----------|----------------|-------------|
| R-1 | Stale row po insert/delete | VYSOKA | P0.1 identity check | CASTECNE — selhava pri shodnych nazvech, prazdnych hodnotach |
| R-2 | Race condition | STREDNI | LockService 2s | ANO pro bezny provoz, krehke pri zatezi |
| R-3 | Refresh behem edit | VYSOKA | ZADNY | NE |
| R-4 | Prazdny crmRowNum | NIZKA | Null check | ANO |
| R-5 | Neplatny outreach_stage | NIZKA-STREDNI | Dropdown validation | VETSINOVE ANO |
| R-6 | Chybejici sloupec v LEADS | NIZKA | colOrNull guard | ANO |
| R-7 | Chybejici server-side handler | STREDNI | Zadny | NE (neni implementovano) |

---

## 6. Lead ID feasibility (odkaz)

Detailni analyza lead_id jako stabilniho identifikatoru viz **docs/16-lead-id-audit.md**.

Klicove zaveory:
- lead_id existuje, format `ASW-{timestamp_base36}-{random4}`, de facto immutable
- Generovani je POUZE manualni (menu "Ensure lead IDs") — neni automaticke
- Pokryti dat: NEZNAMO — nutne spustit auditni skript (viz docs/16-lead-id-audit.md sekce 5)
- Frontend uz lead_id pouziva s fallbackem na `row-{N}`

---

## 7. Tri nejvetsi edge cases

1. **Row drift po insert/delete v LEADS** (R-1) — identita check pomaha, ale neni 100% spolehlivy pri duplicitnich firmach nebo prazdnych hodnotach. Tohle je zakladni architekturalni slabina row-based pristupu.

2. **Refresh behem editovani** (R-3) — nulova ochrana, sheet se kompletne premaze behem rebuildu. Akekoli rozepsane edity se ztrati bez varovani.

3. **Prazdne/duplicitni business_name+city** (podmnozina R-1) — identity check projde i kdyz nema projit. `normalizeBusinessName_('') === normalizeBusinessName_('')` je true.
