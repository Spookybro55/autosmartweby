# Git a deployment rozhodnutí — Nabídka weby (Autosmartweby)

> **Datum:** 2026-04-04
> **Účel:** Rozhodovací memo ke 3 otevřeným bodům z cleanup plánu
> **Pravidlo:** Nic se neprovádí bez explicitního potvrzení vlastníka

---

## Bod 1: Root monorepo git strategie

### Aktuální stav

- Root `Nabídka weby/` **NEMÁ git** — žádný version control pro:
  - `apps-script/` (9 .gs souborů, 4 640 řádků — CRM jádro)
  - `offers/` (nabídkové materiály)
  - `docs/` (7 dokumentů)
  - `CLAUDE.md`, `.gitignore`, `.mcp.json`
- `crm-frontend/` **MÁ vlastní git** (viz Bod 2)
- `apps-script/` **MÁ clasp** (viz Bod 3) — ale clasp není version control

### Varianty

| # | Varianta | Popis |
|---|---------|-------|
| A | **Root monorepo** | `git init` v root, vše v jednom repo |
| B | **Oddělené repozitáře** | apps-script dostane vlastní git, crm-frontend zůstane jak je |
| C | **Jen root git pro non-frontend** | root git ignoruje crm-frontend/ (nested repo) |

### Výhody / nevýhody

| Varianta | Výhody | Nevýhody |
|----------|--------|----------|
| **A — monorepo** | Jednoduchý, vše v jednom, jeden `git log`, atomické commity přes celý systém | Potřeba vyřešit crm-frontend/.git |
| **B — oddělené** | Nezasahuje do crm-frontend | 3 místa pro version control (git, git, clasp), složitá koordinace |
| **C — hybrid** | Nezasahuje do crm-frontend, verzuje root + apps-script | Dva git repo vedle sebe, matoucí, git varuje na nested repo |

### Rizika

| Varianta | Riziko |
|----------|--------|
| A | Ztráta crm-frontend git historie (řešitelné — viz Bod 2) |
| B | apps-script zůstane bez git pokud se zapomene inicializovat |
| C | Konflikty mezi root git a nested crm-frontend git |

### Doporučená varianta: **A — monorepo**

**Proč:**
- Projekt je malý (~11 000 řádků, 2 komponenty + nabídky)
- Atomické commity napříč apps-script a crm-frontend (důležité při synchronizaci column mappings)
- Jeden `git log` pro celou historii projektu
- Nejjednodušší údržba

### Bezpečný další krok

1. Nejdříve vyřešit Bod 2 (crm-frontend/.git)
2. Pak `git init` v root
3. `git add .` + initial commit

---

## Bod 2: Co udělat s crm-frontend/.git a historií

### Aktuální stav

```
crm-frontend/.git/
├── 2 commity:
│   1. "Initial commit from Create Next App" (scaffolding)
│   2. "feat: initial commit" (první vlastní kód)
├── Branch: master (žádný remote)
├── Uncommitted changes: 42 souborů
│   - 6 modified (layout, page, package, globals, README, package-lock)
│   - 36 untracked (API routes, components, hooks, lib — veškerá CRM logika)
└── Žádný remote (čistě lokální)
```

**Klíčový fakt:** Většina aktuálního CRM frontend kódu (API, components, hooks, lib) je **untracked** — nikdy nebyla commitnuta. Git historie obsahuje jen scaffolding a po��áteční nastavení.

### Varianty

| # | Varianta | Popis |
|---|---------|-------|
| A | **Smazat .git/, vše do root monorepo** | Export historie, smazat .git, commitnout vše z root |
| B | **Commitnout aktuální stav, pak smazat .git/** | Nejdřív zachytit aktuální stav do git, pak přejít na monorepo |
| C | **Nechat nested repo** | Root git ignoruje crm-frontend/, fungují nezávisle |
| D | **Git submodule** | crm-frontend jako submodule root repo |

### Výhody / nevýhody

| Varianta | Výhody | Nevýhody |
|----------|--------|----------|
| **A — smazat** | Nejčistší výsledek, jeden repo | Ztráta 2 commitů (minimální hodnota) |
| **B — commit + smazat** | Zachová snapshot aktuálního stavu v historii | Extra krok, ale bezpečnější |
| **C — nechat** | Žádný zásah | Dva git repo, matoucí, git varuje |
| **D — submodule** | Formálně čisté | Overkill pro tento projekt, komplikace |

### Rizika

| Varianta | Riziko |
|----------|--------|
| A | Ztráta 2 commitů — ale obsahují jen scaffolding, ne CRM kód |
| B | Žádné reálné riziko |
| C | Trvalá komplikace s nested repo |
| D | Zbytečná složitost |

### Doporučená varianta: **B — commitnout aktuální stav, pak smazat .git/**

**Proč:**
- Zachová kompletní snapshot před migrací (safety net)
- Historie má jen 2 commity (scaffolding) — minimální hodnota, ale proč ji zbytečně zahazovat
- Po commitu je jasné, co bylo v jakém stavu
- Pak čistý přechod na root monorepo

### Bezpečný postup krok za krokem

```bash
# 1. Nejdřív commitnout aktuální stav v crm-frontend
cd "C:/Users/spook/Nabídka weby/crm-frontend"
git add -A
git commit -m "snapshot: full CRM frontend before monorepo migration"

# 2. Exportovat historii (3 commity)
git log --oneline > "../docs/crm-frontend-git-history.txt"
git log --stat > "../docs/crm-frontend-git-history-detailed.txt"

# 3. Smazat .git/
rm -rf .git

# 4. Pokračovat s root git init (Bod 1)
cd "C:/Users/spook/Nabídka weby"
git init
git add .
git commit -m "Initial monorepo commit — apps-script + crm-frontend + offers + docs"
```

**Co se zachová:**
- Kompletní kód (samozřejmě — je na disku)
- Export commit historie v docs/
- Snapshot aktuálního stavu jako poslední commit před migrací

**Co se ztratí:**
- Možnost `git diff` proti starým commitům (ale ty obsahují jen scaffolding)
- Nic z aktuální CRM práce se neztratí

---

## Bod 3: .clasp.json parentId — TEST vs PRODUKCE

### Aktuální stav

```json
// .clasp.json
{
  "scriptId": "1SjdUXQc4i2RzYkRVKldp8q6Z7JtGrsY5TQwaBl4b_93hj8aD4_p-ScrT",
  "parentId": "13fyA63p6g9eLMdy9KhBUO6lrbdtMhsL0kbHOVafvmyo"    ← TEST
}

// Config.gs
var SPREADSHEET_ID = '1RBcLZkn3AruiqaQdJ7PHIxvCcoO5SC9Qnlw_NiLnpYc';  ← PRODUKCE
```

- `parentId` v `.clasp.json` ukazuje na **TEST** spreadsheet
- `SPREADSHEET_ID` v `Config.gs` ukazuje na **PRODUKČNÍ** spreadsheet
- V `Config.gs` komentáři je TEST ID i ROLLBACK ID explicitně pojmenovány

### Analýza: záměr nebo chyba?

| Indikátor | Naznačuje |
|-----------|-----------|
| `Config.gs` má TEST a ROLLBACK ID v komentářích | Vývojář zná oba environmenty — **záměr** |
| `.clasp.json` parentId = TEST | clasp push jde do test prostředí — **safety pojistka** |
| `Config.gs` SPREADSHEET_ID = PRODUKCE | Kód běží proti produkci — ale to je tím, že `.gs` soubory se kopírují do Apps Script editoru produkčního spreadsheetu ručně |

**Závěr: S vysokou pravděpodobností ZÁMĚR.** Workflow je pravděpodobně:
1. Vývoj lokálně v `apps-script/*.gs`
2. `clasp push` → deployuje do TEST spreadsheetu pro ověření
3. Ruční kopie do produkčního Apps Script editoru (nebo `clasp clone` + push s jiným .clasp.json)

### Varianty

| # | Varianta | Popis |
|---|---------|-------|
| A | **Nechat TEST, zdokumentovat** | Přidat komentář do README, nechat jako safety |
| B | **Přidat .clasp-prod.json** | Dva profily — test (default) a produkce (explicitní) |
| C | **Změnit na PRODUKCI** | `clasp push` rovnou do produkce |

### Výhody / nevýhody

| Varianta | Výhody | Nevýhody |
|----------|--------|----------|
| **A — nechat + zdokumentovat** | Bezpečné, žádný zásah | Deployment do produkce je ruční |
| **B — dva profily** | Explicitní, bezpečné, rychlý přepínání | Mírná komplexita |
| **C — změnit na produkci** | Rychlý deployment | Riziko push chybného kódu do produkce |

### Rizika

| Varianta | Riziko |
|----------|--------|
| A | Žádné |
| B | Žádné (default zůstává test) |
| C | Omylem `clasp push` s chybným kódem → rozbije produkci |

### Doporučená varianta: **A — nechat TEST, zdokumentovat**

**Proč:**
- Aktuální stav je pravděpodobně záměrný a bezpečný
- Projekt je malý, ruční deployment do produkce je přijatelný
- Zbytečné měnit fungující workflow

### Jak ověřit bez rizika

```bash
# Ověř, kam clasp push směřuje (DRY RUN — jen info, nepushuje):
cd apps-script
clasp status
# Ukáže připojený projekt a spreadsheet

# Ověř obsah TEST spreadsheetu:
# Otevři https://docs.google.com/spreadsheets/d/13fyA63p6g9eLMdy9KhBUO6lrbdtMhsL0kbHOVafvmyo
# Pokud existuje a má Apps Script → clasp je nastavený správně na TEST
```

### Dokumentace k přidání do apps-script/README.md

```markdown
## Deployment

- `.clasp.json` parentId ukazuje na **TEST** spreadsheet (záměr — safety pojistka)
- `clasp push` deployuje do TEST prostředí
- Pro deploy do produkce: ručně zkopírovat soubory do Apps Script editoru
  produkčního spreadsheetu (ID v Config.gs)
- NIKDY neměnit parentId na produkční ID bez vědomí vlastníka
```

---

## Akční plán

### Varianta KONZERVATIVNÍ (minimální zásah)

| Krok | Akce | Riziko |
|------|------|--------|
| 1 | Zdokumentovat .clasp.json stav v apps-script/README.md | nulové |
| 2 | Commitnout aktuální stav v crm-frontend/.git | nulové |
| 3 | Exportovat crm-frontend git historii do docs/ | nulové |
| 4 | **STOP** — nepokračovat dál, dokud vlastník nepotvrdí monorepo | — |

**Výsledek:** Aktuální práce je zachycena v crm-frontend git, .clasp.json je zdokumentovaný. Root git se zatím nezavádí.

### Varianta DOPORUČENÁ (kompletní git setup)

| Krok | Akce | Riziko |
|------|------|--------|
| 1 | Zdokumentovat .clasp.json stav v apps-script/README.md | nulové |
| 2 | Commitnout aktuální stav v crm-frontend/.git | nulové |
| 3 | Exportovat crm-frontend git historii do docs/ | nulové |
| 4 | Smazat crm-frontend/.git/ | nízké (historie exportována) |
| 5 | `git init` v root | nulové |
| 6 | `git add .` + initial monorepo commit | nulové |
| 7 | (Volitelně) Vytvořit GitHub repo a push | závisí na preferencích |

**Výsledek:** Celý projekt verzovaný v jednom monorepo. Kompletní historie od tohoto bodu dál. Stará historie crm-frontend zachována jako export v docs/.

---

## Jak bezpečně zavést root git bez rozbití crm-frontend

**Klíčový princip:** Nejdřív zachytit aktuální stav, pak migrovat.

1. **Před čímkoliv:** `cd crm-frontend && git add -A && git commit` — zachytí vše
2. **Export:** `git log --stat > ../docs/crm-frontend-git-history-detailed.txt`
3. **Smazat:** `rm -rf crm-frontend/.git`
4. **Root init:** `cd .. && git init && git add . && git commit`

**Co se NEMŮŽE rozbít:**
- Zdrojový kód — je na disku, git ho nemění
- Běžící aplikace ��� git init nemá vliv na runtime
- Apps Script — clasp operuje nezávisle na git

**Jediné co se změní:**
- `crm-frontend/` přestane mít vlastní git historii (exportovanou do docs/)
- Root získá git tracking pro vše

---

## Jak zachovat historii crm-frontend

Historie má jen **2 commity** (scaffolding + initial) + **42 uncommitted souborů** (= veškerá CRM logika).

| Co | Jak zachovat |
|----|-------------|
| Commit messages | `git log --oneline > docs/crm-frontend-git-history.txt` |
| Detailní diff historie | `git log --stat > docs/crm-frontend-git-history-detailed.txt` |
| Aktuální uncommitted kód | `git add -A && git commit` před smazáním .git |
| Plný git bundle (pro jistotu) | `git bundle create ../docs/crm-frontend.bundle --all` |

**Doporučuji:** Exportovat log + udělat bundle (10 sekund navíc, kompletní safety net).

---

## Jak ověřit .clasp target bez rizika

```bash
# 1. Zjisti kam clasp míří (read-only):
cd apps-script
clasp status

# 2. Ověř TEST spreadsheet existenci:
# Otevři v prohlížeči:
# https://docs.google.com/spreadsheets/d/13fyA63p6g9eLMdy9KhBUO6lrbdtMhsL0kbHOVafvmyo

# 3. Ověř produkční spreadsheet:
# https://docs.google.com/spreadsheets/d/1RBcLZkn3AruiqaQdJ7PHIxvCcoO5SC9Qnlw_NiLnpYc

# 4. NEPOUŽÍVEJ clasp push dokud neověříš, že TEST spreadsheet obsahuje očekávaný obsah
```

Žádný z těchto kroků nemá vliv na produkci.
