# Rollout Checklist — Varianta B (lead_id-based write-back)

> Verze 1.0 | 2026-04-04 | Autor: Claude + user
> Stav: CEKA NA PROVOZNI OVERENI
> Po PASS vsech kroku: oznacit C-3 jako CLOSED v docs/09-project-control-tower.md

---

## Predpoklady

- Varianta B je implementovana v kodu (commit `4536839`)
- Kod je v lokalnich souborech `apps-script/*.gs`
- Kod MUSI byt nasazen do Apps Script projektu pres `clasp push` pred testovanim
- DRY_RUN = true v Config.gs (bezpecne)

---

## Krok 0: Deploy kodu

**Pred vsim ostatnim** je nutne nasadit aktualni kod do Apps Script:

```
cd apps-script
clasp push
```

> Pozor: `clasp push` jde do TEST prostredi (viz `.clasp.json` parentId).
> Pro produkci: manualni copy-paste do produkce — viz `apps-script/README.md`.

---

## Krok 1: Ensure lead IDs

**Ucel:** Doplnit lead_id u vsech radku v LEADS, ktere ho jeste nemaji.

**Kde:** Google Sheets CRM → menu `Autosmartweby CRM` → `Ensure lead IDs`

**Co se stane:**
- Projde vsechny datove radky v LEADS
- Radkum bez lead_id vygeneruje novy ID ve formatu `ASW-{timestamp}-{random}`
- Zapise doplnene ID do sheetu
- Zobrazi alert: "Doplneno X chybejicich lead_id." nebo "Vsechny radky uz maji lead_id."

**Ocekavany vysledek:** Alert s poctem doplnenych ID (muze byt 0 pokud vsechny uz existuji).

**Fail condition:**
- Alert "Sloupec lead_id nenalezen" → nutne nejdriv spustit "Setup preview extension"
- Zadny alert / chyba → zkontrolovat Execution log v Apps Script editoru

---

## Krok 2: Audit lead IDs

**Ucel:** Overit ze vsechny leady (zejmena contact-ready) maji unikatni lead_id ve spravnem formatu.

**Kde:** Google Sheets CRM → menu `Autosmartweby CRM` → `Audit lead IDs (read-only)`

**Co se stane:**
- Precte vsechna data (ZADNY zapis do bunek)
- Analyzuje pokryti, unikatnost, format a contact-ready stav
- Zobrazi alert s reportem
- Detailni log v Logger (Apps Script editor → View → Logs)

### Jak interpretovat vystup

```
=== LEAD ID AUDIT ===
--- COVERAGE ---
Total rows:           1234
WITH lead_id:         1234
WITHOUT lead_id:      0
Coverage:             100%

--- CONTACT-READY ---
Contact-ready:        89
CR missing lead_id:   0

--- UNIQUENESS ---
Unique IDs:           1234
Duplicate IDs:        0

--- FORMAT ---
ASW-* correct:        1234
Non-standard:         0

=== VERDICT: READY ===
```

### PASS kriteria (VSECHNA musi platit)

| # | Kriterium | Hodnota pro PASS |
|---|-----------|------------------|
| A1 | Coverage | > 95% |
| A2 | CR missing lead_id | **0** |
| A3 | Duplicate IDs | **0** |
| A4 | Non-standard format | **0** |
| A5 | VERDICT | READY nebo CONDITIONAL |

### FAIL akce

| Situace | Co delat |
|---------|----------|
| CR missing lead_id > 0 | Spustit znovu Krok 1 (Ensure lead IDs), pak znovu Krok 2 |
| Duplicate IDs > 0 | STOP — nutna manualni investigace, nepokoracovat |
| Non-standard format > 0 | Overit ktere ID maji spatny format (Logger), pravdepodobne manualni vstup |
| VERDICT = NOT READY | Viz specificke duvody v reportu, opravit a znovu auditovat |

---

## Krok 3: Refresh "Ke kontaktovani"

**Ucel:** Prestavit kontaktni sheet s novym formatem (sloupec 19 = Lead ID misto CRM radek).

**Kde:** Google Sheets CRM → menu `Autosmartweby CRM` → submenu `Ke kontaktovani` → `Refresh "Ke kontaktovani"`

**Co se stane:**
- Prebuduje cely list "Ke kontaktovani"
- Sloupec 19 (skryty, ve skupine "detail") nyni obsahuje Lead ID misto cisla radku
- Pokud nektere contact-ready leady nemaji lead_id, zobrazi varovani

**Ocekavany vysledek:** Alert s poctem leadu. Zadne varovani o chybejicich lead_id (pokud Krok 1+2 prosly).

**Overeni:**
1. Otevrit "Ke kontaktovani" sheet
2. Zobrazit skryte sloupce (skupinu "detail" — kliknout na + vlevo od sloupce 12)
3. Sloupec 19 musi obsahovat hodnoty ve formatu `ASW-xxxxx-xxxx` (ne cisla)

**Fail condition:**
- Sloupec 19 stale obsahuje cisla → stary kod, deploy se neprovedl
- Varovani o chybejicich lead_id → Krok 1 neprobehl nebo se pridaly nove radky

---

## Krok 4: Smoke test write-back

**Ucel:** Overit ze editace v "Ke kontaktovani" se spravne propise do LEADS.

### Test 4a: Zmena outreach stage

1. Otevrit sheet "Ke kontaktovani"
2. Vybrat libovolny radek (idealne s prioritou MEDIUM)
3. Zapamatovat si firmu a mesto z pole "Firma" (sloupec 2)
4. Ve sloupci 7 (Stav) zmenit hodnotu z dropdownu — napr. z "Neosloveno" na "Pripraveno"
5. Pockat 2-3 sekundy (trigger se spousti asynchronne)
6. Prepnout na sheet "LEADS"
7. Najit stejnou firmu (Ctrl+F)
8. Overit ze sloupec `outreach_stage` ma hodnotu `DRAFT_READY` (anglicky ekvivalent "Pripraveno")

**PASS:** Hodnota v LEADS odpovida zmene. Zadna warning note na bunce.
**FAIL:** (a) Hodnota se nezmenila, (b) Na bunce je zluta note s varovanim, (c) V _asw_logs je chybovy zaznam.

### Test 4b: Zmena poznamky

1. Ve sloupci 11 (Poznamka) napsat libovolny text, napr. "Test write-back VB"
2. Pockat 2-3 sekundy
3. V LEADS najit stejnou firmu
4. Overit ze sloupec `sales_note` obsahuje "Test write-back VB"

**PASS:** Text v LEADS odpovida. Zadna warning note.
**FAIL:** Stejne jako 4a.

### Test 4c: Overeni bezpecnostniho guardu (volitelne)

1. Otevrit "Ke kontaktovani"
2. Zobrazit skryty sloupec 19 (Lead ID)
3. Rucne smazat obsah bunky v sloupci 19 jednoho radku (smazat lead_id)
4. Editovat jiny sloupec na stejnem radku (napr. Poznamka)
5. Overit ze se objevi zluta note: "Chybi lead_id..."
6. Overit ze se zmena NEPROPSALA do LEADS

**PASS:** Write-back je zablokovany, uzivatel dostal jasnou zpravu.
**FAIL:** Zmena se propsala i bez lead_id.

> Po testu 4c: spustit Refresh "Ke kontaktovani" pro obnoveni lead_id.

---

## Krok 5: Kontrola logu

**Kde:** Google Sheets CRM → sheet `_asw_logs` (posledni tab dole)

**Co hledat:**
- Zaznamy s `function = onContactSheetEdit`
- Posledni zaznamy musi byt `level = INFO` s textem `Write-back OK: lead_id=ASW-...`
- Zadne `level = ERROR` zaznamy po testech

---

## Krok 6: Uzavreni C-3

Po PASS vsech kroku (1-5):

1. Otevrit `docs/09-project-control-tower.md`
2. V sekci "5. Otevrene problemy" / "Kriticke" zmenit radek C-3:
   - Z: `Identity verification existuje...`
   - Na: `**CLOSED** (2026-04-XX) — Varianta B implementovana a provozne overena. lead_id lookup, identity check jako secondary guard.`
3. V sekci "6. Provedene intervence" pridat radek:
   - `| 11 | 2026-04-XX | Write-back Varianta B | lead_id lookup, LockService v refresh, identity check zachovan | C-3 CLOSED |`
4. Commitnout zmenu

---

## Pending update pro docs/09-project-control-tower.md

> Tento soubor byl locked pri posledni aktualizaci. Nasledujici zmeny je nutne propsat rucne:

**Zmena 1 — Sekce 5, tabulka Kriticke:**
```
PRED:
| C-3 | Row-based write-back — posunute radky | apps-script | Identity verification existuje (business_name + city), ale edge case: dva leadi se stejnym nazvem + mestem |

PO (po provoznim overeni):
| C-3 | Row-based write-back — posunute radky | apps-script | **CLOSED** (2026-04-XX) — Varianta B (lead_id lookup) implementovana a overena |
```

**Zmena 2 — Sekce 6, nova intervence:**
```
| 11 | 2026-04-XX | Write-back Varianta B (lead_id lookup) | C-3: findRowByLeadId_(), LockService v refresh, identity check zachovan | C-3 CLOSED |
```

**Zmena 3 — Sekce 1, shrnuti stavu:**
```
PRED:
Zbyva: auth model (H-1/D-7), rate limiting (H-3), PreviewPipeline.gs refaktoring (M-6), web-starter bugy

PO:
Zbyva: auth model (H-1/D-7), rate limiting (H-3), PreviewPipeline.gs refaktoring (M-6), web-starter bugy
C-3 (write-back row drift) CLOSED — Varianta B implementovana a overena
```

**Zmena 4 — Sekce governance validace:**
```
PRED: 26 pass, 0 warn, 0 fail
PO: 28 pass, 0 warn, 0 fail
```
