# Cleanup plán — Nabídka weby (Autosmartweby)

> **Datum:** 2026-04-04
> **Účel:** Konkrétní kroky pro přechod ze současného stavu do cílové struktury
> **Pravidlo:** Nic se neprovádí bez explicitního potvrzení vlastníka

---

## Přehled kroků

| Fáze | Co | Effort | Riziko | Potvrzení |
|------|-----|--------|--------|-----------|
| **1** | Smazat junk soubory (0 B) | 1 min | nulové | bezpečné hned |
| **2** | Smazat temp/lock soubory | 10 s | nulové | bezpečné hned |
| **3** | Smazat staré zálohy | 10 s | nulové | bezpečné hned |
| **4** | Přesunout nabídky do `offers/` | 2 min | nízké | bezpečné hned |
| **5** | Přepsat `crm-frontend/README.md` | 15 min | nulové | bezpečné hned |
| **6** | Vytvořit root `.gitignore` | 5 min | nulové | bezpečné hned |
| **7** | Git init + initial commit | 10 min | **vyžaduje rozhodnutí** | vlastník rozhodne |
| **8** | Řešit `crm-frontend/.git/` | 5 min | **vyžaduje rozhodnutí** | vlastník rozhodne |
| **9** | Ověřit `.clasp.json` parentId | 2 min | **vyžaduje rozhodnutí** | vlastník rozhodne |
| **10** | Timing-safe HMAC fix | 5 min | nízké | bezpečné hned |

---

## Fáze 1: Smazat junk soubory (0 B artefakty)

**Co:** Smazat všech ~24 prázdných souborů ve 3 složkách.

**Riziko:** NULOVÉ — všechny jsou 0 B, žádný obsah.

**Potvrzení:** Bezpečné udělat hned.

### Root (10 souborů)

```
SMAZAT:
  Nabídka weby/0)
  Nabídka weby/3)
  Nabídka weby/300)
  Nabídka weby/Modifies
  Nabídka weby/WON
  Nabídka weby/{,
  Nabídka weby/{const
  Nabídka weby/}
  Nabídka weby/console.error('FAIL
  Nabídka weby/m[1])
```

### apps-script (7 souborů)

```
SMAZAT:
  apps-script/0
  apps-script/0)
  apps-script/1)
  apps-script/200
  apps-script/300)
  apps-script/TOTAL_COLS_)
  apps-script/m[1])
```

### crm-frontend (6 souborů)

```
SMAZAT:
  crm-frontend/(DEFAULT_FILTERS)
  crm-frontend/([])
  crm-frontend/0
  crm-frontend/l.contactPriority
  crm-frontend/maxAge)
  crm-frontend/pathname.startsWith(p)))
```

---

## Fáze 2: Smazat temp/lock soubory

**Co:** Smazat dočasné soubory editorů.

**Riziko:** NULOVÉ.

**Potvrzení:** Bezpečné udělat hned.

```
SMAZAT:
  docs/~$M-SYSTEM-MAP.md
```

---

## Fáze 3: Smazat staré zálohy

**Co:** Smazat neaktivní `.bak` soubory.

**Riziko:** NULOVÉ — `.bak` = explicitní záloha, originál neexistuje.

**Potvrzení:** Bezpečné udělat hned.

```
SMAZAT:
  apps-script/SeedTestData.gs.bak
```

---

## Fáze 4: Přesunout nabídky do `offers/`

**Co:** Vytvořit složku `offers/` a přesunout do ní všechny nabídkové materiály z root.

**Riziko:** NÍZKÉ — soubory nejsou referencovány z žádného kódu. Jediná vazba je `html2pdf.py`, který má hardcoded cestu — bude potřeba aktualizovat.

**Potvrzení:** Bezpečné udělat hned (s úpravou cest v `html2pdf.py`).

### Přesuny

```
PŘESUNOUT root → offers/:
  nabidka-web-remeslnici.html      → offers/nabidka-web-remeslnici.html
  nabidka-web-remeslnici.pdf       → offers/nabidka-web-remeslnici.pdf
  nabidka-automatizace.html        → offers/nabidka-automatizace.html
  nabidka-automatizace.pdf         → offers/nabidka-automatizace.pdf
  Nabídka - web - onepager.pdf     → offers/Nabídka - web - onepager.pdf
  Nabídka - automatizace - onepager.pdf → offers/Nabídka - automatizace - onepager.pdf
  html2pdf.py                      → offers/html2pdf.py
  html2pdf_auto.py                 → offers/html2pdf_auto.py
```

### Úprava po přesunu

- Aktualizovat cesty v `html2pdf.py` a `html2pdf_auto.py` (hardcoded cesty na `C:\Users\spook\Nabídka weby\...`).

---

## Fáze 5: Přepsat `crm-frontend/README.md`

**Co:** Nahradit default Next.js template skutečnou dokumentací projektu.

**Riziko:** NULOVÉ — současný obsah nemá žádnou hodnotu.

**Potvrzení:** Bezpečné udělat hned.

**Obsah nového README by měl obsahovat:**
- Co je to (CRM frontend pro Autosmartweby)
- Prerequisites (Node.js, env vars)
- Setup (`.env.local` z `.env.example`)
- Spuštění (`npm run dev`)
- Architektura (stručně — pages, API routes, integrace s Google Sheets)
- Odkaz na `docs/CRM-SYSTEM-MAP.md` pro systémovou dokumentaci

---

## Fáze 6: Vytvořit root `.gitignore`

**Co:** Vytvořit `.gitignore` v root pro přípravu na git init.

**Riziko:** NULOVÉ — soubor nic nemaže, jen připravuje.

**Potvrzení:** Bezpečné udělat hned.

**Obsah:** Viz `docs/02-target-structure.md` §6.

---

## Fáze 7: Git init + initial commit — VYŽADUJE ROZHODNUTÍ

**Co:** Inicializovat git repo v root, přidat vše, vytvořit initial commit.

**Riziko:** STŘEDNÍ — rozhodnutí o tom, co verzovat a co ne. Hlavní otázka je fáze 8.

**Vyžaduje rozhodnutí vlastníka:**
1. Chceš monorepo (doporučeno) nebo oddělené repozitáře?
2. Chceš zachovat historii `crm-frontend/.git/`?
3. Chceš repo na GitHubu nebo jen lokálně?

**Doporučený postup:**
```bash
# Po fázích 1-6
cd "Nabídka weby"
git init
git add .
git commit -m "Initial commit — project after cleanup"
```

---

## Fáze 8: Řešit `crm-frontend/.git/` — VYŽADUJE ROZHODNUTÍ

**Co:** Rozhodnout o existujícím git repo uvnitř crm-frontend.

**Riziko:** STŘEDNÍ — smazání `.git/` ztratí historii commitů.

**Vyžaduje rozhodnutí vlastníka:**
- **Varianta A (doporučená):** Exportovat historii, smazat `.git/`, vše v root monorepo.
  ```bash
  cd crm-frontend
  git log --oneline > ../docs/crm-frontend-git-history.txt
  rm -rf .git
  ```
- **Varianta B:** Nechat jako nested repo (git bude varovat, ale funguje).
- **Varianta C:** Převést na git submodule (komplikace, pro tento projekt zbytečné).

---

## Fáze 9: Ověřit `.clasp.json` parentId — VYŽADUJE ROZHODNUTÍ

**Co:** Potvrdit, zda `.clasp.json` parentId → TEST spreadsheet je záměrná safety pojistka.

**Vyžaduje rozhodnutí vlastníka:**

| Otázka | Pokud ANO | Pokud NE |
|--------|-----------|----------|
| Používáš `clasp push`? | Ověř, kam deployuje | Žádná akce |
| Je parentId → TEST záměr? | Zdokumentovat v README | Opravit na produkci nebo přidat profily |

**Akce:** Přidat komentář do `apps-script/README.md` s vysvětlením.

---

## Fáze 10: Timing-safe HMAC fix

**Co:** Nahradit `signature !== expected` v `crm-frontend/src/middleware.ts:32` za constant-time comparison.

**Riziko:** NÍZKÉ — jednoduchá změna, vylepšuje bezpečnost.

**Potvrzení:** Bezpečné udělat hned.

**Změna:**
```typescript
// Současný stav (middleware.ts:32):
if (signature !== expected) return null;

// Cílový stav:
const sigBuf = Buffer.from(signature);
const expBuf = Buffer.from(expected);
if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null;
```

Pozn.: Middleware běží v Edge runtime — ověřit, zda `crypto.timingSafeEqual` je dostupný. Pokud ne, alternativně přes `crypto.subtle`.

---

## Soubory k ponechání beze změny

Tyto soubory/složky se NEMĚNÍ:

| Soubor/složka | Důvod |
|---------------|-------|
| `apps-script/*.gs` (všech 9) | Aktivní CRM backend |
| `apps-script/appsscript.json` | Apps Script manifest |
| `apps-script/.clasp.json` | Clasp config (po ověření v F9) |
| `apps-script/README.md` | Setup dokumentace |
| `crm-frontend/src/` (celý) | Aktivní CRM frontend |
| `crm-frontend/package.json` | Dependencies |
| `crm-frontend/.env.example` | Template |
| `crm-frontend/.gitignore` | Správně nakonfigurován |
| `crm-frontend/[config soubory]` | eslint, postcss, tsconfig, next.config |
| `docs/CRM-SYSTEM-MAP.md` | Source of truth pro CRM arch |
| `docs/00-*.md` | Mapa a inventář |
| `docs/01-*.md` | Audit a rozhodnutí |
| `docs/02-*.md` | Návrhy a plány |
| `CLAUDE.md` | Claude Code config |
| `.mcp.json` | MCP config |
| `.claude/` | Claude Code infra |
| `.claude-flow/` | claude-flow daemon |

---

## Shrnutí: Co je bezpečné hned vs co vyžaduje rozhodnutí

### Bezpečné udělat HNED (6 akcí)

| # | Akce | Effort | Riziko |
|---|------|--------|--------|
| F1 | Smazat ~24 junk souborů | 1 min | nulové |
| F2 | Smazat `docs/~$M-SYSTEM-MAP.md` | 10 s | nulové |
| F3 | Smazat `apps-script/SeedTestData.gs.bak` | 10 s | nulové |
| F4 | Přesunout nabídky do `offers/` | 2 min | nízké |
| F5 | Přepsat `crm-frontend/README.md` | 15 min | nulové |
| F6 | Vytvořit root `.gitignore` | 5 min | nulové |

### Vyžaduje rozhodnutí vlastníka (3 akce)

| # | Akce | Otázka |
|---|------|--------|
| F7 | Git init | Monorepo? GitHub? |
| F8 | `crm-frontend/.git/` | Zachovat historii nebo smazat? |
| F9 | `.clasp.json` parentId | Záměrný TEST nebo chyba? |

### Odložené (nezahrnuto v tomto plánu)

| Problém | Proč odloženo |
|---------|--------------|
| C-1: Column mappings sync | Vyžaduje implementační rozhodnutí a kódování |
| C-2: LEGACY_COL hardcoded | Vyžaduje refaktoring Apps Script |
| C-3: Row-based write-back | Vyžaduje zásadní architekturní změnu |
| H-1: Auth model | Vyžaduje rozhodnutí o scope (kolik uživatelů?) |
| M-6: PreviewPipeline.gs split | Refaktoring — po stabilizaci |
| M-7: REVIEW přejmenování | Breaking change v datech |
