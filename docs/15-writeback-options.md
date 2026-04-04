# Write-Back Repair Options

> Verze 1.0 | 2026-04-04 | Autor: Claude + user
> Zavislost: docs/15-writeback-risk-analysis.md

Tri varianty opravy write-back mechanismu, serazene od nejmensiho zasahu po idealni reseni.

---

## Varianta A: Minimalni oprava (zpevneni stavajiciho)

### Rozsah zmeny
- ContactSheet.gs: ~30 radku zmen
- Config.gs: 0 zmen
- Frontend: 0 zmen

### Co resi
| Riziko | Resi? | Jak |
|--------|-------|-----|
| R-1 (stale row) | CASTECNE | Zprisneni identity checku |
| R-2 (race) | ANO | Prodlouzeni lock timeout |
| R-3 (refresh+edit) | ANO | Lock v refreshContactingSheet |
| R-4–R-6 | UZ FUNGUJE | Beze zmen |
| R-7 (frontend) | NE | Mimo scope |

### Konkretni zmeny

**1. Zprisneni identity check (R-1):**
```
- Odmitni write-back pokud business_name JE prazdny (obe strany)
- Vynutit shodu mesta (odstranit || !sourceCity podmínku)
- Pridat lead_id check jako treti identifikator (pokud existuje v datech)
```

**2. LockService v refresh (R-3):**
```
refreshContactingSheet():
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) { safeAlert_('Probiha jiny zapis...'); return; }
  try { ... existujici kod ... }
  finally { lock.releaseLock(); }
```

**3. Prodlouzeni lock timeout (R-2):**
```
onContactSheetEdit: tryLock(2000) → tryLock(5000)
```

### Vyhody
- Minimalni zasah, male riziko regrese
- Resi R-3 (nejzavaznejsi neosetrenou slabinu)
- Zachovava stavajici architekturu

### Nevyhody
- Row-based referencing zustava — zakladni slabina neodstranena
- Identity check stale neni 100% (duplicitni firmy)
- Zadna zmena pro frontend write path

### Casovy odhad implementace
~1 hodina

---

## Varianta B: Doporucena (lead_id-based lookup)

### Rozsah zmeny
- ContactSheet.gs: ~80 radku zmen
- Config.gs: 0 zmen
- Helpers.gs: ~20 radku (nova utility)
- Frontend: 0 zmen (apps-script-writer.ts uz posila leadId)

### Co resi
| Riziko | Resi? | Jak |
|--------|-------|-----|
| R-1 (stale row) | ANO | lead_id lookup misto row number |
| R-2 (race) | ANO | Prodlouzeni lock timeout |
| R-3 (refresh+edit) | ANO | Lock v refresh |
| R-7 (frontend) | CASTECNE | Zaklad pro budouci doPost handler |

### Koncept

Misto ulozeni absolutniho cisla radku do CRM_ROW_COL_ ulozit **lead_id** (unikatni identifikator leadu). Pred write-back najit aktualni radek podle lead_id.

### Predpoklad: existuje lead_id?

ANO. V EXTENSION_COLUMNS (Config.gs) existuje `company_key` a v sheetu je sloupec `lead_id`. Frontend uz REQUIRED_HEADERS obsahuje `lead_id`. HeaderResolver ho dokaze najit.

### Konkretni zmeny

**1. buildContactRowV2_ → uklada lead_id misto rowNum:**
```javascript
// PRED:
built[CRM_ROW_COL_ - 1] = sourceRowNum;

// PO:
var leadId = hr.get(row, 'lead_id');
built[CRM_ROW_COL_ - 1] = leadId;   // sloupec 19 nyni drzi lead_id
```

**2. Nova utility: findRowByLeadId_(sheet, leadIdCol, leadId):**
```javascript
function findRowByLeadId_(sheet, leadIdCol, leadId) {
  var data = sheet.getRange(DATA_START_ROW, leadIdCol,
    sheet.getLastRow() - DATA_START_ROW + 1, 1).getValues();
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(leadId).trim()) {
      return i + DATA_START_ROW;
    }
  }
  return null;
}
```

**3. onContactSheetEdit → lookup misto prime reference:**
```javascript
// PRED:
var crmRowNum = sheet.getRange(row, CRM_ROW_COL_).getValue();

// PO:
var leadId = sheet.getRange(row, CRM_ROW_COL_).getValue();
if (!leadId) { aswLog_('WARN', ...); return; }
var sourceHr = getHeaderResolver_(sourceSheet);
var leadIdCol = sourceHr.col('lead_id');
var crmRowNum = findRowByLeadId_(sourceSheet, leadIdCol, leadId);
if (!crmRowNum) {
  aswLog_('ERROR', 'onContactSheetEdit', 'lead_id "' + leadId + '" not found');
  e.range.setNote('⚠ Lead nenalezen v CRM. Spusťte Refresh.');
  return;
}
```

**4. Identity check zachovan jako sekundarni guard** (defense in depth)

**5. Lock v refresh + prodlouzeny timeout** (stejne jako Varianta A)

### Rizika implementace

| Riziko | Pravdepodobnost | Mitigace |
|--------|----------------|----------|
| lead_id chybi u nekterych leadu | STREDNI | Guard: if (!leadId) → skip + log. Nutne spustit ensureLeadIds() pred implementaci |
| Duplicitni lead_id | VELMI NIZKA | ASW-{ts}-{rnd} format — kolize extremne nepravdepodobna. Audit overí |
| Performance findRowByLeadId_ | NIZKA | Linearni scan ~3000 radku < 200ms |
| lead_id se zmeni | VELMI NIZKA | De facto immutable — zadny kod ho neprepisuje (potvrzeno grep analyza) |
| ensureLeadIds neni automaticky | VYSOKA | Pridat do refreshContactingSheet() jako guard |

### Feasibility analyza lead_id

- `lead_id` je v REQUIRED_HEADERS (frontend config.ts) → frontend ho uz ocekava
- `lead_id` je v EXTENSION_COLUMNS (Config.gs:99) → Apps Script ho uz generuje
- HeaderResolver dokaze `lead_id` najit dynamicky
- Frontend apps-script-writer.ts uz posila `leadId` parameter → plne kompatibilni
- Format `ASW-{timestamp_base36}-{random4}` — unikatni, immutable (zadny kod ho nemeni po vygenerovani)
- `ensureLeadIds()` existuje jako menu funkce pro backfill
- **DULEZITE:** `ensureLeadIds()` NENI automaticky volano zadnym pipeline krokem — nutne pridat guard

**Detailni analyza:** viz `docs/16-lead-id-audit.md`

**Zaver:** lead_id-based lookup JE realizovatelny bez strukturalnich zmen. Pred implementaci nutne spustit audit dat (viz docs/16-lead-id-audit.md sekce 5).

### Vyhody
- Eliminuje zakladni slabinu (row drift)
- Zpatecne kompatibilni (sloupec 19 stale existuje, meni se jen obsah)
- Identity check zachovan jako defense-in-depth
- Frontend uz je pripraven (posila leadId)

### Nevyhody
- O neco slozitejsi nez Varianta A
- findRowByLeadId_ je O(n) — pro 3000+ radku akceptovatelne, pro 50000+ by potrebovalo cache/index
- Vyzaduje ze KAZDY lead ma vyplneny lead_id

### Casovy odhad implementace
~2-3 hodiny

---

## Varianta C: Idealni (lead_id + doPost handler + audit trail)

### Rozsah zmeny
- ContactSheet.gs: ~120 radku zmen
- Config.gs: ~5 radku (secret pro doPost auth)
- Helpers.gs: ~40 radku (findRowByLeadId_, audit log)
- Frontend: ~20 radku (error handling v apps-script-writer.ts)
- Novy soubor: apps-script/WebAppHandler.gs (~80 radku)

### Co resi
| Riziko | Resi? | Jak |
|--------|-------|-----|
| R-1 (stale row) | ANO | lead_id lookup |
| R-2 (race) | ANO | Lock + request queue |
| R-3 (refresh+edit) | ANO | Lock v refresh |
| R-7 (frontend) | ANO | doPost handler |
| NAVIC | — | Audit trail vsech write-back operaci |

### Konkretni zmeny navic oproti Variante B

**1. doPost handler pro frontend write-back:**
```javascript
function doPost(e) {
  var payload = JSON.parse(e.postData.contents);
  if (payload.token !== APPS_SCRIPT_SECRET) {
    return ContentService.createTextOutput(JSON.stringify({success:false, error:'Unauthorized'}));
  }
  if (payload.action === 'updateLead') {
    return handleUpdateLead_(payload);
  }
  return ContentService.createTextOutput(JSON.stringify({success:false, error:'Unknown action'}));
}
```

**2. handleUpdateLead_ s kompletni validaci:**
```javascript
function handleUpdateLead_(payload) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) { return error_('Lock timeout'); }
  try {
    var ss = openCrmSpreadsheet_();
    var sheet = ss.getSheetByName(MAIN_SHEET_NAME);
    var hr = getHeaderResolver_(sheet);
    var leadIdCol = hr.col('lead_id');
    var rowNum = findRowByLeadId_(sheet, leadIdCol, payload.leadId);
    if (!rowNum) return error_('Lead not found');
    // Identity check
    // ... business_name + city validation ...
    // Write fields
    for (var field in payload.fields) {
      var col = hr.colOrNull(field);
      if (col) sheet.getRange(rowNum, col).setValue(payload.fields[field]);
    }
    auditLog_('WRITE', payload.leadId, payload.fields);
    return ok_();
  } finally { lock.releaseLock(); }
}
```

**3. Audit trail:**
- Kazdy write-back (onEdit i doPost) zapise zaznam do _asw_logs
- Format: timestamp, source (edit/api), lead_id, field, old_value, new_value, user

### Vyhody
- Kompletni reseni vsech identifikovanych rizik
- Frontend ma funkci write path
- Audit trail pro debugging a compliance
- Konzistentni chovani (edit trigger i API pouzivaji stejny backend)

### Nevyhody
- Vetsi rozsah zmeny → vetsi riziko regrese
- doPost vyzaduje clasp deploy + nastaveni Web App permissions
- Apps Script Web App ma omezeni (throttling, cold start)

### Casovy odhad implementace
~5-6 hodin

---

## Srovnani variant

| Kritérium | A: Minimal | B: Doporucena | C: Idealni |
|-----------|-----------|--------------|------------|
| Resi R-1 (row drift) | Castecne | **ANO** | **ANO** |
| Resi R-3 (refresh race) | **ANO** | **ANO** | **ANO** |
| Resi R-7 (frontend) | Ne | Castecne | **ANO** |
| Audit trail | Ne | Ne | **ANO** |
| Riziko regrese | Nizke | Stredni | Vyssi |
| Rozsah zmeny | ~30 LOC | ~100 LOC | ~270 LOC |
| Cas | ~1h | ~2-3h | ~5-6h |

---

## Doporuceni

### Doporucena varianta: **B (lead_id-based lookup)**

Duvody:
1. **Resi zakladni architekturalni problém** (row-based → lead_id-based) — tohle je jadro rizika
2. **Rozumny rozsah** — ani prilis maly (Varianta A neresi root cause), ani prilis velky (Varianta C zahrnuje frontend integraci ktera neni urgentni)
3. **Frontend uz je pripraven** — apps-script-writer.ts posila leadId, takze prechod je konzistentni
4. **Zpetne kompatibilni** — meni jen obsah sloupce 19, ne strukturu sheetu
5. **Otevira cestu k Variante C** — doPost handler muze byt pridan pozdeji bez dalsich zmen v ContactSheet.gs

### Doporuceny dalsi implementacni krok

1. **Overit pokryti lead_id** — kolik radku v LEADS ma vyplneny lead_id? (`=COUNTBLANK(lead_id_column)`)
2. Pokud >95% vyplneno → implementovat Variantu B
3. Pokud <95% → nejdrive doplnit lead_id generovani, pak Varianta B
4. Po uspesne implementaci B → Varianta C (doPost + audit) jako samostatny ukol

### Nejbezpecnejsi dalsi implementacni krok

**Overeni dat:** Spustit v Apps Script jednoduchy scan ktery zjisti:
```javascript
function auditLeadIds() {
  var ss = openCrmSpreadsheet_();
  var sheet = ss.getSheetByName(MAIN_SHEET_NAME);
  var hr = getHeaderResolver_(sheet);
  var leadIdCol = hr.colOrNull('lead_id');
  if (!leadIdCol) { Logger.log('CHYBA: sloupec lead_id neexistuje'); return; }
  var data = readAllData_(sheet);
  var empty = 0, dupes = {};
  for (var i = 0; i < data.data.length; i++) {
    var id = String(data.data[i][leadIdCol - 1] || '').trim();
    if (!id) { empty++; continue; }
    dupes[id] = (dupes[id] || 0) + 1;
  }
  var dupCount = 0;
  for (var k in dupes) if (dupes[k] > 1) dupCount++;
  Logger.log('Total: ' + data.data.length + ', Empty lead_id: ' + empty + ', Duplicate lead_id: ' + dupCount);
}
```

Teprve po tomto auditu rozhodnout o implementaci.
