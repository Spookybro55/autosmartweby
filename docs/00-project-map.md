# Mapa projektu — Nabídka weby (Autosmartweby)

> **Datum:** 2026-04-04
> **Účel:** Read-only orientace v projektu, podklad pro reorganizaci
> **Pravidlo:** Tento dokument nic nedoporučuje smazat ani přesunout — pouze mapuje

---

## 1. Strom hlavních složek

```
Nabídka weby/                         ← kořen projektu (NENÍ git repo)
├── apps-script/                      ← Apps Script CRM backend (clasp)
├── crm-frontend/                     ← Next.js CRM webové rozhraní (vlastní .git)
├── docs/                             ← dokumentace a auditní výstupy
├── .claude/                          ← Claude Code konfigurace, agenti, skills
├── .claude-flow/                     ← claude-flow daemon stav, metriky
├── .swarm/                           ← swarm state (memory.db, state.json)
├── nabidka-web-remeslnici.html/pdf   ← nabídka "web pro řemeslníky"
├── nabidka-automatizace.html/pdf     ← nabídka "automatizace"
├── Nabídka - web - onepager.pdf      ← onepager verze nabídky web
├── Nabídka - automatizace - onepager.pdf  ← onepager verze nabídky automatizace
├── html2pdf.py / html2pdf_auto.py    ← Python skripty na generování PDF
├── CLAUDE.md                         ← hlavní Claude Code instrukce
├── .mcp.json                         ← MCP server konfigurace
└── [~15 prázdných 0B artefaktových souborů]
```

---

## 2. Hlavní funkční celky projektu

| # | Celek | Složka / soubory | Stav |
|---|-------|-----------------|------|
| A | **Apps Script CRM backend** | `apps-script/` | AKTIVNÍ — source of truth pro CRM logiku |
| B | **CRM Frontend** | `crm-frontend/` | AKTIVNÍ — Next.js UI nad Google Sheets |
| C | **Nabídkové materiály** | `nabidka-*.html`, `nabidka-*.pdf`, `Nabídka - *.pdf` | AKTIVNÍ — obchodní nabídky |
| D | **PDF generování** | `html2pdf.py`, `html2pdf_auto.py` | POMOCNÉ — jednorázové nástroje |
| E | **Dokumentace / audit** | `docs/` | AKTIVNÍ — ale obsahuje jen 1 soubor + temp |
| F | **Claude Code tooling** | `.claude/`, `.claude-flow/`, `.swarm/`, `CLAUDE.md`, `.mcp.json` | INFRASTRUKTURNÍ — Claude Code konfigurace |
| G | **Artefaktové soubory (0B)** | `0)`, `3)`, `300)`, `{,`, `{const`, `}`, `WON`, `Modifies`, `console.error('FAIL`, `m[1])` | JUNK — prázdné soubory, chybně vytvořené |

---

## 3. Detailní sekce

### 3.A — Apps Script / CRM backend (`apps-script/`)

**Účel:** Jádro CRM systému — kvalifikace leadů, preview pipeline, email drafty, synchronizace mailboxu, obchodní workflow. Běží nad Google Sheets spreadsheetem `1RBcLZkn3AruiqaQdJ7PHIxvCcoO5SC9Qnlw_NiLnpYc`.

**Hlavní soubory (9 .gs, celkem ~4 640 řádků):**

| Soubor | Řádků | Účel |
|--------|-------|------|
| `Config.gs` | 178 | Konstanty, feature flags, column definitions |
| `Helpers.gs` | 769 | HeaderResolver (duplicate-safe), logging, string utils |
| `PreviewPipeline.gs` | 1 492 | Kvalifikace, template selection, preview brief, email drafty, webhook |
| `ContactSheet.gs` | 906 | "Ke kontaktování" sheet — refresh, write-back, KPI |
| `OutboundEmail.gs` | 384 | Odesílání emailů přes Gmail |
| `MailboxSync.gs` | 390 | Synchronizace Gmail → LEADS metadata |
| `GmailLabels.gs` | 111 | Správa Gmail labels (ASW/CRM) |
| `LegacyWebCheck.gs` | 313 | Starší web-check přes Serper API |
| `Menu.gs` | 99 | UI menu v Google Sheets |

**Další soubory:**
- `.clasp.json` — clasp deployment config (parentId ukazuje na TEST spreadsheet)
- `appsscript.json` — Apps Script manifest
- `README.md` — dokumentace architektury a setupu
- `SeedTestData.gs.bak` — záloha testovacího seederu (neaktivní)

**Vazby:**
- → Google Sheets spreadsheet (LEADS, Ke kontaktování, _asw_logs)
- → Gmail (labels, send, sync)
- → Serper API (web-check)
- → crm-frontend (čte stejný spreadsheet přes Google Sheets API)

**Source of truth:** ANO — toto je source of truth pro CRM business logiku.

**Stav:** ZJEVNĚ AKTIVNÍ

**Artefakty:** 7 prázdných 0B souborů (`0`, `0)`, `1)`, `200`, `300)`, `TOTAL_COLS_)`, `m[1])`) — fragmenty kódu omylem vytvořené jako soubory.

---

### 3.B — CRM Frontend (`crm-frontend/`)

**Účel:** Webové rozhraní CRM pro obchodníky. Next.js 16 + React 19 + Tailwind + shadcn/ui. Čte data z Google Sheets přes Sheets API, zapisuje přes Apps Script Web App endpoint.

**Struktura (~6 220 řádků TypeScript/TSX):**

```
crm-frontend/
├── src/
│   ├── app/
│   │   ├── api/                    ← Next.js API routes (backend-for-frontend)
│   │   │   ├── auth/login/         ← login endpoint
│   │   │   ├── leads/              ← CRUD pro leady
│   │   │   └── stats/              ← dashboard statistiky
│   │   ├── dashboard/              ← dashboard stránka
│   │   ├── leads/                  ← seznam leadů
│   │   ├── follow-ups/             ← follow-up přehledy
│   │   ├── pipeline/               ← kanban pipeline
│   │   └── login/                  ← přihlášení
│   ├── components/
│   │   ├── dashboard/              ← widgety dashboardu
│   │   ├── layout/                 ← app shell, header, sidebar
│   │   ├── leads/                  ← tabulka, filtry, detail drawer
│   │   ├── pipeline/               ← kanban board + column
│   │   └── ui/                     ← shadcn/ui komponenty (18 ks)
│   ├── hooks/                      ← React hooks (leads, stats, detail, update)
│   ├── lib/
│   │   ├── config.ts               ← sheet config, column mappings, enums
│   │   ├── domain/                 ← Lead, Filters, Stats typy
│   │   ├── google/                 ← sheets-reader.ts, apps-script-writer.ts
│   │   ├── mappers/                ← sheet-to-domain.ts
│   │   ├── mock/                   ← mock data pro dev (509 řádků dat)
│   │   └── utils.ts
│   └── middleware.ts               ← auth middleware
├── .env.local                      ← ⚠️ lokální env (neměl by být v repo)
├── .env.example                    ← template pro env
├── package.json                    ← Next.js 16, React 19, googleapis
└── [Next.js config soubory]
```

**Vazby:**
- → Google Sheets (čte LEADS sheet přes Sheets API)
- → Apps Script Web App (zapisuje editovatelná pole)
- → Sdílí column mappings s `apps-script/Config.gs`
- → Vlastní `.git` repo (samostatný od kořenového projektu)

**Source of truth:** NE — frontend je read/write klient nad daty v Google Sheets. Source of truth je Apps Script + Sheets.

**Stav:** ZJEVNĚ AKTIVNÍ (má .next/ build, .git s commity)

**Artefakty:** 6 prázdných 0B souborů (`(DEFAULT_FILTERS)`, `([])`, `0`, `l.contactPriority`, `maxAge)`, `pathname.startsWith(p)))`)

**⚠️ Pozor:** `.env.local` je přítomen — může obsahovat credentials.

---

### 3.C — Nabídkové materiály (kořen projektu)

**Účel:** Obchodní nabídky pro klienty — HTML šablony a generované PDF.

**Soubory:**
| Soubor | Typ | Účel |
|--------|-----|------|
| `nabidka-web-remeslnici.html` (400 ř.) | HTML | Šablona nabídky "web pro řemeslníky" |
| `nabidka-web-remeslnici.pdf` (126 KB) | PDF | Vygenerovaný PDF z HTML |
| `nabidka-automatizace.html` (454 ř.) | HTML | Šablona nabídky "automatizace" |
| `nabidka-automatizace.pdf` (482 KB) | PDF | Vygenerovaný PDF z HTML |
| `Nabídka - web - onepager.pdf` (295 KB) | PDF | Onepager verze nabídky web |
| `Nabídka - automatizace - onepager.pdf` (315 KB) | PDF | Onepager verze nabídky automatizace |

**Vazby:** Nezávislé na CRM. Slouží čistě jako obchodní materiály.

**Source of truth:** HTML soubory jsou source of truth; PDF jsou generované výstupy.

**Stav:** AKTIVNÍ — ale nejasné, zda jsou PDF aktuální vůči HTML.

---

### 3.D — PDF generování (kořen projektu)

**Soubory:**
- `html2pdf.py` — generuje `Nabídka - web - onepager.pdf` z `nabidka-web-remeslnici.html` (přes headless Chrome)
- `html2pdf_auto.py` — pravděpodobně automatizovaná verze

**Stav:** POMOCNÉ NÁSTROJE — jednorázově použité, nepravidelně.

---

### 3.E — Dokumentace (`docs/`)

**Obsah:**
| Soubor | Účel | Stav |
|--------|------|------|
| `CRM-SYSTEM-MAP.md` (~500+ ř.) | Kompletní systémová mapa CRM — sheety, sloupce, funkce, vazby | ZJEVNĚ AKTIVNÍ — nejpodrobnější dokument v projektu |
| `~$M-SYSTEM-MAP.md` | Lock soubor (Word/editor) | DOČASNÝ — artefakt editoru |

**Vazby:** `CRM-SYSTEM-MAP.md` dokumentuje celý Apps Script + Google Sheets systém.

**Source of truth:** `CRM-SYSTEM-MAP.md` je source of truth pro dokumentaci CRM architektury.

**Stav:** AKTIVNÍ, ale chudá — jen 1 reálný dokument. Mohla by obsahovat víc.

---

### 3.F — Souhrny / zápisy / backlog / pomocné soubory

V projektu nejsou explicitní backlog, zápisy z chatů nebo souhrny konverzací jako samostatné soubory. Veškerá projektová znalost je rozptýlena v:
- `docs/CRM-SYSTEM-MAP.md`
- `apps-script/README.md`
- `crm-frontend/README.md` (jen defaultní Next.js README)
- `crm-frontend/CLAUDE.md` (odkaz na AGENTS.md)
- `CLAUDE.md` (Claude Code config — ne projektová dokumentace)

**Stav:** Žádné zjevné pracovní souhrny nebo chat záznamy.

---

### 3.G — Claude Code infrastruktura

**`.claude/`** — Claude Code agents, skills, helpers, commands. Cca 200+ souborů. Standardní tooling, ne projektový kód.

**`.claude-flow/`** — claude-flow daemon state: agents store, swarm state, autopilot, metrics, config.yaml, daemon.pid/log.

**`.swarm/`** — starší swarm state: memory.db, schema.sql, state.json.

**`CLAUDE.md`** — hlavní Claude Code instrukce pro tento projekt.

**`.mcp.json`** — MCP server konfigurace.

**Stav:** INFRASTRUKTURNÍ — funguje jako tooling, ne jako projektový kód.

---

## 4. CRM jako samostatný funkční celek

CRM systém se skládá ze dvou hlavních částí rozprostřených ve dvou složkách:

### 4.1 Kde leží části CRM

| Vrstva | Složka | Klíčové soubory |
|--------|--------|-----------------|
| **Datová vrstva** | Google Sheets (externí) | Spreadsheet `1RBcLZkn3...` — sheety LEADS, Ke kontaktování, _asw_logs |
| **Business logika / Backend** | `apps-script/` | 9 × .gs souborů (4 640 řádků) |
| **API / Integrační vrstva** | `crm-frontend/src/app/api/` | Next.js API routes (leads, stats, auth) |
| **Datový most** | `crm-frontend/src/lib/google/` | `sheets-reader.ts` (čtení), `apps-script-writer.ts` (zápis) |
| **Domain model** | `crm-frontend/src/lib/domain/` | `lead.ts`, `filters.ts`, `stats.ts` |
| **UI vrstva** | `crm-frontend/src/` | components/, app/pages, hooks/ (~6 200 řádků) |
| **Konfigurace** | `apps-script/Config.gs` + `crm-frontend/src/lib/config.ts` | ⚠️ Dva zdroje mapování sloupců |
| **Dokumentace** | `docs/CRM-SYSTEM-MAP.md` + `apps-script/README.md` | Systémová mapa + setup instrukce |
| **Mock data** | `crm-frontend/src/lib/mock/` | `leads-data.ts` (509 ř.), `mock-service.ts` |

### 4.2 Source of truth CRM

| Co | Source of truth | Kde |
|----|----------------|-----|
| Lead data | Google Sheets — LEADS sheet | externí |
| Business logika (kvalifikace, pipeline, email) | `apps-script/*.gs` | `apps-script/` |
| Column mappings | `apps-script/Config.gs` | `apps-script/` |
| Frontend column mappings | `crm-frontend/src/lib/config.ts` | `crm-frontend/` |
| Systémová dokumentace | `docs/CRM-SYSTEM-MAP.md` | `docs/` |

**⚠️ Potenciální problém:** Column mappings existují na dvou místech (`Config.gs` a `config.ts`). Při změně sloupců je nutné synchronizovat oba.

### 4.3 Co je aktivní vs staré

| Část | Stav |
|------|------|
| Apps Script (všech 9 .gs) | AKTIVNÍ |
| CRM Frontend (celý src/) | AKTIVNÍ |
| `SeedTestData.gs.bak` | STARÉ — záloha, neaktivní |
| Mock data (`crm-frontend/src/lib/mock/`) | NEJASNÉ — dev-only, ale může být outdated |
| `crm-frontend/README.md` | NEDOSTATEČNÉ — jen default Next.js template |

---

## 5. Nejasnosti, duplicity a překryvy

### 5.1 Duplicitní / překrývající se konfigurace

| Problém | Soubory | Riziko |
|---------|---------|--------|
| Column mappings na 2 místech | `apps-script/Config.gs` (LEGACY_COL) vs `crm-frontend/src/lib/config.ts` (LEADS_COLUMNS) | Desynchronizace při změně sloupců |
| README dokumentace | `apps-script/README.md` (detailní) vs `crm-frontend/README.md` (default template) vs `docs/CRM-SYSTEM-MAP.md` (nejpodrobnější) | 3 místa, různá úroveň detailu |

### 5.2 Artefaktové / junk soubory (0 bytů)

Celkem **~23 prázdných souborů** rozptýlených ve 3 složkách — vznikly chybným výstupem při code generation:

- **Kořen (10):** `0)`, `3)`, `300)`, `Modifies`, `WON`, `{,`, `{const`, `}`, `console.error('FAIL`, `m[1])`
- **apps-script (7):** `0`, `0)`, `1)`, `200`, `300)`, `TOTAL_COLS_)`, `m[1])`
- **crm-frontend (6):** `(DEFAULT_FILTERS)`, `([])`, `0`, `l.contactPriority`, `maxAge)`, `pathname.startsWith(p)))`

Všechny jsou 0 B a vypadají jako fragmenty JavaScript/TypeScript kódu.

### 5.3 Nejasné soubory

| Soubor | Nejasnost |
|--------|-----------|
| `crm-frontend/.env.local` | Přítomen v repo — může obsahovat credentials. Neměl by být verzovaný. |
| `docs/~$M-SYSTEM-MAP.md` | Lock soubor editoru — dočasný artefakt |
| `apps-script/.clasp.json` parentId | Ukazuje na TEST spreadsheet (`13fyA...`), ne na produkční (`1RBcLZkn3...`). Je to záměr? |
| `crm-frontend` vlastní `.git` | Má vlastní git repo, zatímco root ne. Nejasná verzovací strategie. |

### 5.4 Kandidáti na budoucí úklid

- ~23 prázdných artefaktových souborů (zjevný junk)
- `docs/~$M-SYSTEM-MAP.md` (temp lock file)
- `SeedTestData.gs.bak` (záloha, neaktivní)
- `crm-frontend/README.md` (default template — neříká nic o projektu)

---

## 6. Závěrečné shrnutí

### Zjevně aktivní
- `apps-script/` — 9 .gs souborů, jádro CRM logiky
- `crm-frontend/src/` — Next.js CRM frontend, ~6 200 řádků
- `docs/CRM-SYSTEM-MAP.md` — kompletní systémová mapa
- Nabídkové HTML/PDF soubory v kořeni

### Zjevně staré / junk
- ~23 prázdných artefaktových souborů (fragmenty kódu jako soubory)
- `SeedTestData.gs.bak`
- `docs/~$M-SYSTEM-MAP.md` (temp)

### Nejasné
- `.env.local` v crm-frontend (credentials?)
- `.clasp.json` parentId vs produkční spreadsheet
- Mock data v `crm-frontend/src/lib/mock/` — aktuální nebo zastaralá?
- Vztah dvou nabídkových PDF variant (onepager vs plná verze) — které jsou aktuální?

### Co bude potřeba rozhodnout v dalším kroku
1. **Smazat ~23 artefaktových 0B souborů?** — Jednoznačný junk.
2. **Kam s nabídkovými materiály?** — Nyní leží v kořeni vedle CRM kódu.
3. **Sjednotit column mappings?** — `Config.gs` a `config.ts` musí být synchronní.
4. **Verzovací strategie** — root nemá git, crm-frontend má vlastní. Má být monorepo?
5. **Vyčistit .env.local** — nebo alespoň přidat do .gitignore root úrovně.
6. **Doplnit dokumentaci** — `crm-frontend/README.md` je prázdný template.
