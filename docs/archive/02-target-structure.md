# Cílová struktura projektu — Nabídka weby (Autosmartweby)

> **Datum:** 2026-04-04
> **Účel:** Navržený cílový stav složkové struktury po úklidu
> **Pravidlo:** Tento dokument nic nemění — pouze definuje cílový stav

---

## 1. Navržený strom cílové struktury

```
Nabídka weby/                          ← root = monorepo
├── .git/                              ← NOVÝ — root-level git
├── .gitignore                         ← NOVÝ — root-level gitignore
├── CLAUDE.md                          ← beze změny (Claude Code config)
├── .mcp.json                          ← beze změny
│
├── apps-script/                       ← CRM backend (Apps Script)
│   ├── Config.gs                      ← source of truth pro column mappings
│   ├── Helpers.gs
│   ├── PreviewPipeline.gs
│   ├── ContactSheet.gs
│   ├── OutboundEmail.gs
│   ├── MailboxSync.gs
│   ├── GmailLabels.gs
│   ├── LegacyWebCheck.gs
│   ├── Menu.gs
│   ├── appsscript.json
│   ├── .clasp.json
│   └── README.md                      ← setup & development docs pro AS
│
├── crm-frontend/                      ← CRM frontend (Next.js)
│   ├── src/
│   │   ├── app/                       ← pages + API routes
│   │   ├── components/                ← UI komponenty
│   │   ├── hooks/                     ← React hooks
│   │   ├── lib/
│   │   │   ├── config.ts              ← frontend config (odkazuje na AS Config.gs)
│   │   │   ├── domain/                ← typy a modely
│   │   │   ├── google/                ← integrace s Sheets API + AS Web App
│   │   │   ├── mappers/               ← sheet → domain mapping
│   │   │   ├── mock/                  ← dev mock data
│   │   │   └── utils.ts
│   │   └── middleware.ts
│   ├── .env.example
│   ├── .gitignore                     ← zůstává (ignoruje .env*, node_modules, .next)
│   ├── package.json
│   └── README.md                      ← PŘEPSAT — skutečný frontend setup docs
│
├── offers/                            ← NOVÁ SLOŽKA — obchodní nabídky
│   ├── nabidka-web-remeslnici.html    ← source (HTML šablona)
│   ├── nabidka-automatizace.html      ← source (HTML šablona)
│   ├── nabidka-web-remeslnici.pdf     ← generovaný výstup
│   ├── nabidka-automatizace.pdf       ← generovaný výstup
│   ├── Nabídka - web - onepager.pdf   ← generovaný výstup
│   ├── Nabídka - automatizace - onepager.pdf  ← generovaný výstup
│   ├── html2pdf.py                    ← konverzní nástroj
│   └── html2pdf_auto.py               ← konverzní nástroj (ověřit, zda potřeba)
│
├── docs/                              ← systémová dokumentace celého projektu
│   ├── CRM-SYSTEM-MAP.md             ← source of truth pro CRM architekturu
│   ├── 00-project-map.md             ← mapa projektu
│   ├── 00-folder-inventory.md        ← inventář složek
│   ├── 01-audit-consolidation.md     ← sjednocený audit
│   ├── 01-decision-list.md           ← otevřená rozhodnutí
│   ├── 02-target-structure.md        ← tento dokument
│   └── 02-cleanup-plan.md            ← plán úklidu
│
├── .claude/                           ← Claude Code infra (beze změny)
├── .claude-flow/                      ← claude-flow daemon (beze změny)
└── .swarm/                            ← ověřit zda potřeba (L-5)
```

### Co ZMIZELO z root:
- ~24 junk souborů (0 B) → **SMAZÁNO**
- `nabidka-*.html/pdf`, `Nabídka - *.pdf` → **přesunuto do `offers/`**
- `html2pdf.py`, `html2pdf_auto.py` → **přesunuto do `offers/`**
- `SeedTestData.gs.bak` → **SMAZÁNO** (apps-script)
- `docs/~$M-SYSTEM-MAP.md` → **SMAZÁNO** (temp lock)
- `crm-frontend/.git/` → **SMAZÁNO** (nahrazeno root git)

---

## 2. Oblasti a jejich pravidla

### 2.A — `apps-script/` (CRM Backend)

**Proč zde:** Samostatná deployovatelná jednotka — Apps Script projekt s vlastním `.clasp.json` a `appsscript.json`. Clasp vyžaduje flat directory.

**Co patří dovnitř:**
- Všechny `.gs` soubory (business logika CRM)
- `appsscript.json` (manifest)
- `.clasp.json` (deployment config)
- `README.md` (setup instrukce specifické pro Apps Script)

**Co sem NEPATŘÍ:**
- Frontend kód
- Systémová dokumentace (ta patří do `docs/`)
- Testovací data (`.bak` soubory)
- Junk artefakty

**Source of truth:**
- Column mappings → `Config.gs` (LEGACY_COL + EXTENSION_COLS)
- Business logika CRM → všechny `.gs` soubory
- Spreadsheet ID → `Config.gs`

**Vazby na ostatní:**
- `crm-frontend/src/lib/config.ts` musí být synchronní s `Config.gs`
- `crm-frontend/src/lib/google/` integruje s Apps Script Web App endpoint
- `docs/CRM-SYSTEM-MAP.md` dokumentuje celý systém

---

### 2.B — `crm-frontend/` (CRM Frontend)

**Proč zde:** Samostatná Next.js aplikace s vlastním `package.json`, build pipeline, deployment. Nemá smysl ji rozpadat — je to jedna deployovatelná jednotka.

**Co patří dovnitř:**
- `src/` — veškerý zdrojový kód (pages, components, hooks, lib)
- Konfigurační soubory (package.json, tsconfig, eslint, postcss)
- `.env.example` (template pro env vars)
- `README.md` (frontend-specifický setup a development guide)

**Co sem NEPATŘÍ:**
- `.env.local` (správně ignorován v .gitignore — OK)
- Junk artefakty
- Systémová CRM dokumentace (ta je v `docs/`)

**Source of truth:**
- Frontend UI → `src/`
- Frontend column mappings → `src/lib/config.ts` (ODVOZENO z `Config.gs`)
- Domain model → `src/lib/domain/`

**Vazby na ostatní:**
- Čte data z Google Sheets (přes `src/lib/google/sheets-reader.ts`)
- Zapisuje přes Apps Script Web App (přes `src/lib/google/apps-script-writer.ts`)
- Config musí být synchronní s `apps-script/Config.gs`

---

### 2.C — `offers/` (Obchodní nabídky)

**Proč zde:** Obchodní materiály nemají nic společného s CRM kódem. Smíchané v root znečišťují projekt. Vlastní složka je čistá separace.

**Co patří dovnitř:**
- HTML šablony nabídek (source)
- Generované PDF (výstup)
- Python konverzní nástroje

**Co sem NEPATŘÍ:**
- CRM kód nebo dokumentace
- Jakékoli `.gs` nebo `.ts` soubory

**Source of truth:**
- HTML soubory → source pro PDF
- PDF → generované výstupy (regenerovatelné)

**Vazby na ostatní:** Žádné — nezávislé na CRM.

---

### 2.D — `docs/` (Systémová dokumentace)

**Proč zde:** Centrální místo pro dokumentaci celého projektu — architektura, audity, mapy, rozhodnutí. Dokumentace, která se týká celého systému, ne jen jedné komponenty.

**Co patří dovnitř:**
- Systémové mapy (`CRM-SYSTEM-MAP.md`)
- Projektové mapy a inventáře (`00-*.md`)
- Auditní výstupy (`01-*.md`)
- Strukturální návrhy (`02-*.md`)
- Architektonická rozhodnutí (ADR) — pokud vzniknou v budoucnu

**Co sem NEPATŘÍ:**
- Setup instrukce pro konkrétní komponentu (ty patří do `*/README.md`)
- Pracovní zápisy z chatů (ty patří do `docs/notes/` pokud je potřeba je uchovávat)
- Temp/lock soubory editoru

**Source of truth:**
- CRM architektura → `CRM-SYSTEM-MAP.md`
- Stav projektu → `00-project-map.md`
- Otevřené problémy → `01-audit-consolidation.md`

**Pravidlo číslování:**
- `00-*` = mapa a inventář (statický snapshot)
- `01-*` = audit a rozhodnutí (analytická vrstva)
- `02-*` = návrhy a plány (akční vrstva)
- `CRM-SYSTEM-MAP.md` = živý referenční dokument (bez čísla)

---

### 2.E — Infra / Claude tooling (`.claude/`, `.claude-flow/`, `.swarm/`)

**Proč zde:** Claude Code konfigurace a runtime state. Nemění se ručně, spravuje je tooling.

**Co patří dovnitř:** Vše co Claude Code a claude-flow potřebují pro svůj provoz.

**Co sem NEPATŘÍ:** Projektový kód nebo dokumentace.

**Pravidlo:** Nesahat, nečistit, nechat na tooling. Při git init přidat relevantní cesty do `.gitignore`.

**Otevřená otázka (L-5):** `.swarm/` může být redundantní s `.claude-flow/`. Vyžaduje ověření.

---

## 3. Pravidla dokumentace

### Co kam patří

| Typ dokumentace | Kam | Příklad |
|----------------|-----|---------|
| **Systémová architektura** | `docs/` | `CRM-SYSTEM-MAP.md` |
| **Projektová mapa / audit** | `docs/` | `00-project-map.md`, `01-audit-consolidation.md` |
| **Architektonická rozhodnutí** | `docs/` | Budoucí ADR soubory |
| **Setup & dev guide pro komponentu** | `*/README.md` | `apps-script/README.md`, `crm-frontend/README.md` |
| **API reference** | `docs/` nebo `*/README.md` | Záleží na rozsahu |
| **Pracovní poznámky** | `docs/notes/` | Pokud vůbec potřeba — jinak neukládat |

### Pravidla

1. **`docs/` = celý systém.** Dokumentace, která se týká více komponent nebo celkového pohledu.
2. **`*/README.md` = jedna komponenta.** Jak nastavit, spustit, deployovat danou část.
3. **Žádné duplikace.** Pokud je informace v `docs/CRM-SYSTEM-MAP.md`, `apps-script/README.md` na ni odkazuje — nekopíruje ji.
4. **Audity mají číselný prefix** (`01-`, `02-`) pro jasné řazení.
5. **Temp soubory (`~$*`) se nesmí commitovat.** Přidat do `.gitignore`.

---

## 4. Pravidla pro archivaci

### Definice statusů

| Status | Význam | Kam s tím |
|--------|--------|-----------|
| **active** | Aktivně používáno, editováno, deployováno | Zůstává na místě |
| **deprecated** | Nahrazeno něčím novým, ale zatím funguje | Přidat komentář `// DEPRECATED — use X instead`, nearchivovat dokud funguje |
| **archive** | Už se nepoužívá, ale může být užitečné jako reference | Přesunout do `_archive/` ve stejné složce |
| **temporary** | Dočasný soubor (lock, cache, build output) | Přidat do `.gitignore`, necommitovat |
| **junk** | Prázdný artefakt, omylem vytvořený soubor | SMAZAT |

### Pravidla

1. **Junk = smazat okamžitě.** Žádné archivování prázdných souborů.
2. **Archive = `_archive/` podsložka.** Ne v root, ne ve zvláštní globální složce. Archiv zůstává u své komponenty.
3. **Deprecated = komentář v kódu.** Ne přesun, ne přejmenování.
4. **Temporary = `.gitignore`.** Nikdy necommitovat.
5. **Pokud si nejsi jistý → `review later`**, ne smazat.

---

## 5. Source of truth — přehled

| Doména | Source of truth | Soubor / místo |
|--------|----------------|----------------|
| Lead data | Google Sheets — LEADS sheet | Externí spreadsheet |
| CRM business logika | Apps Script `.gs` soubory | `apps-script/` |
| Column mappings (master) | `apps-script/Config.gs` | LEGACY_COL + EXTENSION_COLS |
| Column mappings (frontend) | `crm-frontend/src/lib/config.ts` | ODVOZENO z Config.gs |
| CRM systémová dokumentace | `docs/CRM-SYSTEM-MAP.md` | `docs/` |
| Frontend UI | `crm-frontend/src/` | `crm-frontend/` |
| Nabídky — šablony | HTML soubory | `offers/` |
| Nabídky — PDF | Generováno z HTML | `offers/` (regenerovatelné) |
| Stav projektu | `docs/00-project-map.md` | `docs/` |

---

## 6. Git strategie

### Doporučení: Monorepo

**Důvod:** Projekt je malý (~11 000 řádků kódu ve 2 komponentách + nabídky). Monorepo je nejjednodušší na údržbu. Jedna commit historie, jeden `git log`, jedna truth.

### Kroky

1. `git init` v root `Nabídka weby/`
2. Vytvořit root `.gitignore` (viz níže)
3. Smazat `crm-frontend/.git/` (po exportu historie pokud je potřeba)
4. `git add` + initial commit

### Doporučený `.gitignore` pro root

```gitignore
# Dependencies
node_modules/
.pnp.*

# Build outputs
.next/
out/
build/
*.tsbuildinfo

# Environment & secrets
.env
.env.local
.env.*.local

# Claude Code runtime
.claude-flow/daemon.pid
.claude-flow/daemon.log
.claude-flow/data/
.claude-flow/metrics/
.claude-flow/swarm/
.claude-flow/system/
.claude-flow/tasks/
.claude-flow/agents/
.claude-flow/security/
.swarm/

# Editor artifacts
~$*
*.swp
*.swo
.DS_Store
Thumbs.db

# Python
__pycache__/
*.pyc

# Temp
*.tmp
*.bak
```

### Co dělat s `crm-frontend/.git/`

**Vyžaduje rozhodnutí vlastníka:**
- **Varianta A:** Exportovat historii (`git log --oneline > crm-frontend-git-history.txt`), pak smazat `.git/`. Vše bude v jednom root repo.
- **Varianta B:** Nechat jako git submodule (komplexnější, pro tento projekt zbytečné).
- **Doporučení:** Varianta A — projekt je malý, historie crm-frontend je krátká.

---

## 7. CRM — celkový pohled po reorganizaci

### Kde leží části CRM

| Vrstva | Složka | Klíčové soubory | Source of truth |
|--------|--------|-----------------|-----------------|
| **Data** | Google Sheets (externí) | LEADS, Ke kontaktování, _asw_logs | LEADS sheet |
| **Backend / logika** | `apps-script/` | 9 × `.gs` | Config.gs (master config) |
| **Frontend / UI** | `crm-frontend/src/` | components/, app/, hooks/ | src/ |
| **API vrstva** | `crm-frontend/src/app/api/` | leads/, stats/, auth/ | src/app/api/ |
| **Integrační most** | `crm-frontend/src/lib/google/` | sheets-reader.ts, apps-script-writer.ts | src/lib/google/ |
| **Domain model** | `crm-frontend/src/lib/domain/` | lead.ts, filters.ts, stats.ts | src/lib/domain/ |
| **Systémová dokumentace** | `docs/` | CRM-SYSTEM-MAP.md | docs/ |
| **Backend setup docs** | `apps-script/README.md` | — | apps-script/ |
| **Frontend setup docs** | `crm-frontend/README.md` | — | crm-frontend/ |
| **Audit** | `docs/` | 01-audit-consolidation.md | docs/ |

### Co se mění oproti současnosti

| Aspekt | Současný stav | Cílový stav |
|--------|--------------|-------------|
| CRM dokumentace | 3 místa, překryvy | `docs/` = systém, `*/README.md` = setup |
| Column mappings | 2 nezávislé soubory | Config.gs = master, config.ts = odvozený + validace |
| Git | crm-frontend má .git, zbytek nic | Root monorepo |
| Junk soubory | ~24 ks ve 3 složkách | Smazány |
| Nabídky | V root vedle kódu | Ve vlastní `offers/` složce |

---

## 8. Zásady pro udržení pořádku do budoucna

1. **Žádné soubory v root** kromě `CLAUDE.md`, `.mcp.json`, `.gitignore` a složek.
2. **Nové komponenty** = nová top-level složka s `README.md`.
3. **Nová dokumentace celého systému** → `docs/` s číselným prefixem.
4. **Dokumentace jedné komponenty** → její `README.md`.
5. **Při změně column mappings v Config.gs** → aktualizovat i `crm-frontend/src/lib/config.ts` (dokud nebude automatická synchronizace).
6. **Temp soubory** → přidat do `.gitignore`, nikdy necommitovat.
7. **Archive** → `_archive/` podsložka ve složce kde soubor byl, ne globální archiv.
8. **Pokud nevíš kam** → `docs/` pro dokumenty, `scripts/` pro utility, zeptat se před vytvořením nové top-level složky.
