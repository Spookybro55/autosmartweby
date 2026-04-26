# Fáze 2 — Data Model Audit

> **Cíl:** Zjistit, jestli datový model LEADS ↔ Ke kontaktování je konzistentní, správně dokumentovaný a neztrácí data.
> **Agent pattern:** 🤖🤖 — 2 paralelní agenty (Schema archeolog + Contract reviewer), merge na konci.
> **Scope:** read-only (žádné live Sheets).

Tento soubor vyplňuje Fáze 2 po proběhnutí multi-agent auditu.

---

## 1. Schema dle kódu (Agent A — Schema archeolog)

_(vyplní Agent A — grep `SpreadsheetApp`, `getRange`, `getValues`, `setValues`, `appendRow`, `getSheetByName`, …)_

### Tabulka sloupec × funkce × směr (R/W)

| Sloupec | Typ (z kódu) | Čte (funkce) | Píše (funkce) |
|---------|--------------|--------------|----------------|

### Centralizovaná definice?

_(existuje `LEADS_COLUMNS` / `EXTENSION_COLUMNS` / header map? Kde?)_

### Primary key?

_(podle čeho se identifikuje řádek při write-back?)_

### Naming konzistence

_(grep `email`/`Email`/`E-mail` variants)_

---

## 2. Schema dle dokumentace (Agent B — Contract reviewer)

_(vyplní Agent B — čte jen dokumentaci, komentáře, JSDoc, docs/)_

### Tabulka sloupec × popis (dle docs)

| Sloupec | Popis (dle docs) | Očekávané chování |
|---------|-------------------|---------------------|

### Source of truth claim

_(co docs říká o source of truth mezi LEADS a Ke kontaktování?)_

### Write-back pravidla (dle docs)

_(co docs slibuje?)_

### Dedupe pravidla (dle docs)

_(co docs říká o algoritmu dedup?)_

---

## 3. Rozpory (Merge — A vs B)

_(každý rozpor = finding)_

| Aspekt | Kód říká | Docs říká | Severity |
|--------|----------|-----------|----------|

---

## 4. Bílá místa v kódu

_(co dokumentace slibuje, ale kód nedělá — P0/P1 findings)_

---

## 5. Bílá místa v dokumentaci

_(co kód dělá, ale není dokumentované)_

---

## 6. Odpovědi na 32 checklist bodů

### A. LEADS struktura
1. ❓ Každá read funkce
2. ❓ Každá write funkce
3. ❓ Centralizovaná definice schémat
4. ❓ Mapa sloupec → semantický význam
5. ❓ Naming konzistence
6. ❓ Primary key
7. ❓ Rows bez primary key

### B. Ke kontaktování struktura
8. ❓ Kopie sloupců
9. ❓ Přidané sloupce
10. ❓ Tvorba (filter, četnost)
11. ❓ Primary key

### C. Write-back
12. ❓ Funkce co zapisuje zpět
13. ❓ Pole zapisovaná zpět
14. ❓ Lookup mechanism
15. ❓ Race condition při editu + write-back
16. ❓ Smazaný řádek v LEADS

### D. Deduplikace
17. ❓ Algoritmus
18. ❓ Co s duplikátem
19. ❓ Zachování poznámek
20. ❓ Idempotence

### E. Validace
21. ❓ Email validace
22. ❓ URL validace
23. ❓ Lead bez emailu
24. ❓ Unicode
25. ❓ Fixture / test data

### F. Dokumentační pohled
26. ❓ Kde je schema dokumentované
27. ❓ Dedup pravidla
28. ❓ Write-back pravidla
29. ❓ Source of truth

### G. Merge
30. ❓ Rozpory kód ↔ docs
31. ❓ Chybějící dokumentace
32. ❓ Chybějící kód

---

## Findings (DM-XXX)

_(linkuje do [../FINDINGS.md](../FINDINGS.md))_
