# Lead ID Audit — Pripravenost pro Variantu B

> Verze 1.0 | 2026-04-04 | Autor: Claude + user
> Zavislost: docs/15-writeback-risk-analysis.md, docs/15-writeback-options.md

---

## 1. Kde presne lead_id vznika

### Generovani

**Soubor:** `apps-script/PreviewPipeline.gs`, radky 64-109

```javascript
function generateLeadId_() {
  var ts = new Date().getTime().toString(36);     // timestamp v base36
  var rnd = Math.random().toString(36).substring(2, 6);  // 4 nahodne znaky
  return 'ASW-' + ts + '-' + rnd;
}
```

**Format:** `ASW-{timestamp_base36}-{random4}`
- Priklad: `ASW-m1abc2d3-f7k9`
- Prefix `ASW-` = Autosmartweby
- Timestamp zajistuje chronologicke razeni
- Random suffix zajistuje unikatnost i pri generovani ve stejne milisekunde

### Backfill mechanismus

**Funkce:** `ensureLeadIds()` (PreviewPipeline.gs:64-103)
1. Otevre LEADS sheet
2. Najde sloupec `lead_id` pres HeaderResolver
3. Precte vsechny hodnoty ve sloupci
4. Pro kazdy prazdny radek generuje novy `ASW-...` identifikator
5. Batch zapise vsechny doplnene ID najednou

### Spousteni

- **Menu:** `Autosmartweby CRM → Ensure lead IDs` (Menu.gs:35)
- **Automaticky:** NENI volano zadnym pipeline krokem
- **Neni soucasti:** `qualifyLeads()`, `processPreviewQueue()`, `refreshContactingSheet()`, ani zadne jine funkce

**DULEZITY NÁLEZ:** `ensureLeadIds()` je POUZE manualni operace. Pokud uzivatel prida nove radky do LEADS a nespusti "Ensure lead IDs" z menu, tyto radky NEBUDOU mit lead_id.

---

## 2. Je lead_id povinny?

**NE.** Lead_id neni povinny v zadnem kroku pipeline:
- `qualifyLeads()` — nepozaduje lead_id
- `processPreviewQueue()` — cte `rd.lead_id || ''` (L797) — toleruje prazdny
- `buildContactReadiness_()` — neoveruje lead_id
- `buildContactRowV2_()` — neuklada lead_id do contact sheetu (uklada `sourceRowNum`)
- `refreshContactingSheet()` — nevolá `ensureLeadIds()`
- `onContactSheetEdit()` — nepouziva lead_id (pouziva row number)

### Kde se lead_id pouziva (read-only)

| Misto | Soubor | Jak |
|-------|--------|-----|
| `computeBranchKey_()` | PreviewPipeline.gs:251-255 | Fallback na `row:N` pokud chybi |
| Webhook payload | PreviewPipeline.gs:844, 1400 | `rd.lead_id \|\| ''` |
| Log entries | Helpers.gs:235 | Volitelne pole |
| Frontend mapRow | sheet-to-domain.ts:59 | `lead_id \|\| 'row-{N}'` fallback |

### Frontend fallback

```typescript
// crm-frontend/src/lib/mappers/sheet-to-domain.ts:59
id: col(row, headers, 'lead_id') || `row-${rowNumber}`,
```

Frontend uz ma fallback na `row-{N}` pokud lead_id chybi. Toto je PRESNE ten pattern ktery Varianta B musi nahradit — `row-{N}` je nestabilni reference.

---

## 3. Muze se lead_id zmenit?

### Analyza immutability

| Otazka | Odpoved | Dukaz |
|--------|---------|-------|
| Existuje `hr.set(row, 'lead_id', ...)` v kodu? | **NE** | Grep: zadny vysledek |
| Muze uzivatel prepsat v sheetu? | **ANO** | Sloupec neni chraneny, zadna validace |
| Prepise ho `ensureLeadIds()` pri opakovanem spusteni? | **NE** | Overuje `!String(ids[i][0]).trim()` — preskoci neprazdne |
| Prepise ho jiny pipeline krok? | **NE** | Zadna funkce nezapisuje do lead_id |
| Muze se zmenit pri refreshContactingSheet? | **NE** | Refresh se tyka contact sheetu, ne LEADS |

**Zaver:** lead_id je **de facto immutable** — po vygenerovani ho zadny kod nemeni. Jedine riziko je manualni prepis uzivatelem v Google Sheets.

---

## 4. Existuje fallback kdyz chybi?

| Kontext | Fallback | Bezpecny? |
|---------|----------|-----------|
| `computeBranchKey_()` | `'row:' + (rowIndex + DATA_START_ROW)` | NE pro write-back (nestabilni) |
| Frontend `mapRowToLead()` | `'row-' + rowNumber` | NE pro write-back (nestabilni) |
| Webhook payload | `''` (prazdny string) | Neutralni (jen metadata) |
| Log entries | Prazdny field | Neutralni |

**Zaver:** Vsechny existujici fallbacky pouzivaji row number — presne to co chceme nahradit. Pro Variantu B je nutne, aby lead_id existoval u VSECH leadu kteri se dostanou do "Ke kontaktovani".

---

## 5. Auditni skript

Funkce `auditLeadIds()` je implementovana primo v kodu.

### Umisteni

**Soubor:** `apps-script/PreviewPipeline.gs` (za `generateLeadId_()`, pred `qualifyLeads()`)
**Menu:** `Autosmartweby CRM → Audit lead IDs (read-only)` (Menu.gs)

**Jak spustit:**
1. Otevrit Google Sheet CRM
2. Menu → `Autosmartweby CRM` → `Audit lead IDs (read-only)`
3. Alternativne: Apps Script editor → Run → `auditLeadIds`
4. Vysledky: alert dialog + Logger (View → Logs)

**Co z nej odecist:**
- `total`: celkovy pocet datovych radku
- `empty`: pocet radku BEZ lead_id → MUSI byt 0 pro Variantu B
- `duplicates`: pocet duplicitnich lead_id → MUSI byt 0 pro Variantu B
- `formatOk` / `formatBad`: konzistence formatu `ASW-{base36}-{random4}`
- `contactReady`: pocet radku ktere projdou do contact sheetu → pokryti lead_id u techto je KRITICKE

### Zdrojovy kod

Implementace: `apps-script/PreviewPipeline.gs`, funkce `auditLeadIds()` (za `generateLeadId_()`)

Funkce je ciste read-only — pouziva pouze `readAllData_()`, `buildContactReadiness_()`, `Logger.log()` a `safeAlert_()`. Nezapisuje do zadnych bunek.

---

## 6. Vyhodnoceni pripravenosti Varianty B

### Pozitivni signaly

| Signal | Dukaz |
|--------|-------|
| lead_id existuje jako sloupec | EXTENSION_COLUMNS[35] = 'lead_id' (Config.gs:99) |
| Format je kvalitni | `ASW-{timestamp_base36}-{random4}` — unikatni, citelny |
| Generovani je bezpecne | Timestamp + random = kolize extremne nepravdepodobna |
| Je de facto immutable | Zadny kod ho neprepisuje po vygenerovani |
| Frontend uz ho pouziva | REQUIRED_HEADERS, mapRowToLead, apps-script-writer.ts |
| Backfill mechanismus existuje | ensureLeadIds() v menu |
| HeaderResolver ho najde | Dynamicky lookup, ne hardcoded pozice |

### Rizikove faktory

| Faktor | Zavaznost | Reseni |
|--------|-----------|--------|
| ensureLeadIds() neni automaticky | VYSOKA | Pridat do refreshContactingSheet() jako P-1 guard |
| Nevime kolik radku ma lead_id | NEZNAMO | Spustit auditLeadIds() |
| Contact-ready bez lead_id | NEZNAMO | Audit zjisti |
| Duplicity | NEZNAMO | Audit zjisti (teoreticky nemozne pri ASW-* formatu, ale overit) |
| Manualni prepis uzivatelem | NIZKA | Validace v onContactSheetEdit → format check |

### Rozhodovaci strom

```
Spustit auditLeadIds()
  │
  ├── READY (0 empty, 0 dupes)
  │     → Implementovat Variantu B rovnou
  │
  ├── CONDITIONAL (empty > 0, ale contactReadyMissing == 0, dupes == 0)
  │     → Spustit "Ensure lead IDs" z menu
  │     → Znovu spustit audit → READY
  │     → Implementovat Variantu B
  │
  └── NOT READY (contactReadyMissing > 0 NEBO dupes > 0)
        ├── contactReadyMissing > 0
        │     → Spustit "Ensure lead IDs" z menu → opravit
        │     → Znovu audit
        └── dupes > 0
              → Manualni investigace (nemělo by nastat)
              → Opravit duplicity
              → Znovu audit
```

---

## 7. Doporuceni pro implementaci Varianty B

### Pred implementaci (NUTNE)

1. **Spustit `auditLeadIds()`** — zjistit aktualni stav
2. **Spustit `ensureLeadIds()` z menu** — doplnit chybejici ID
3. **Znovu spustit audit** — overit 100% pokryti

### Soucasti implementace (mimo scope tohoto dokumentu)

1. `refreshContactingSheet()` — pridat P-1 guard: overit lead_id u vsech contact-ready radku pred buildem
2. `buildContactRowV2_()` — zmenit sloupec 19 z `sourceRowNum` na `lead_id`
3. `onContactSheetEdit()` — zmenit lookup z prime row reference na `findRowByLeadId_()`
4. Header sloupce 19 — prejmenovar z "CRM řádek" na "Lead ID" (volitelne)
5. Identity check zachovat jako secondary guard

### Bezpecnostni pojistka

Do `onContactSheetEdit()` pridat format validaci:
```javascript
var leadId = sheet.getRange(row, CRM_ROW_COL_).getValue();
if (!leadId || !String(leadId).match(/^ASW-/)) {
  aswLog_('WARN', 'onContactSheetEdit', 'Invalid lead_id format at row ' + row);
  return;
}
```
