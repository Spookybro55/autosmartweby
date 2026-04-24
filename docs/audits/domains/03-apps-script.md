# Fáze 3 — Apps Script Backend Audit

> **Cíl:** Do hloubky analyzovat kvalitu, bezpečnost a robustnost Apps Script kódu.
> **Agent pattern:** 🤖🤖🤖 — 3 paralelní agenty (Funkční inventář + Failure mode analyst + Security auditor).
> **Scope:** všechny `.gs` / `.js` soubory v Apps Script části repa.

Tento soubor vyplňuje Fáze 3.

---

## Sekce 1 — Funkční mapa (Agent A)

### Tabulka všech funkcí

| # | Funkce | Soubor:řádek | Účel (1 věta) | Volá kdo | Volá koho | Čistá / side-effect | Idempotentní | Píše do LEADS |
|---|--------|---------------|---------------|-----------|-----------|---------------------|--------------|---------------|

### Mrtvé funkce (nikdo je nevolá)

_(seznam)_

### Funkce volané z frontendu (přes webapp API)

_(seznam)_

### Funkce volané triggerem

_(seznam + frekvence)_

---

## Sekce 2 — Robustnost a failure modes (Agent B)

### Try/catch coverage

_(per funkce: má try/catch? Co dělá při selhání?)_

### Timeout risk (6 min limit)

_(funkce s dlouhým execution time)_

### Batch operace

_(používá se `getValues()` jednou nebo iterace row-by-row?)_

### Atomicita částečného failu

_(co se stane při failu uprostřed zápisu?)_

### Logging pattern

_(kam se loguje? Logger / console / Sheet?)_

### Triggery

- Všechna volání `ScriptApp.newTrigger(...)`
- Cleanup před re-create
- Idempotence při souběžném běhu

### Quota risk

- UrlFetchApp calls per run (limit 20k / 100k)
- Email send per run (limit 100 / 1500)
- Long execution (6 min limit)

---

## Sekce 3 — Security (Agent C)

### Hardcoded secrets

_(grep: Sheet IDs, API keys, tokens — per match: soubor:řádek, typ, first 4 chars)_

### Script Properties vs hardcoded

_(config konstanty co by měly jít přes PropertiesService)_

### Prompt injection risk (LLM calls)

_(všechna volání LLM — sanitizace vstupu, oddělení instrukcí, validace výstupu)_

### External URL fetch

_(seznam domén, trust level)_

### OAuth scopes v `appsscript.json`

_(minimální vs overclaim)_

### WebApp deployment

_(access level, auth mechanism)_

### `eval` / `Function()`

_(používá se? S jakým vstupem?)_

### Logging citlivých dat

_(loguje se Sheet ID / token / PII?)_

---

## Sekce 4 — Konsolidované findings (AS-XXX)

_(finding = místo, kde se nezávislí agenti potkali; vyšší confidence = významnější)_

| ID | Popis | Našel A / B / C | Severity | Evidence |
|----|-------|-----------------|----------|----------|

Plný seznam v [../FINDINGS.md](../FINDINGS.md).
