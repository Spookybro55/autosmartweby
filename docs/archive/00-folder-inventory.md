# Inventář složek a souborů — Nabídka weby (Autosmartweby)

> **Datum:** 2026-04-04
> **Účel:** Kompletní inventář po složkách s kategorizací a doporučeným statusem
> **Pravidlo:** Tento dokument nic nemění — pouze eviduje

---

## Legenda statusů

| Status | Význam |
|--------|--------|
| **keep as active** | Aktivně používané, ponechat |
| **review later** | Vyžaduje rozhodnutí / kontrolu |
| **likely archive** | Pravděpodobně staré, k archivaci nebo smazání |
| **unclear** | Nejasný účel, vyžaduje vyjasnění |
| **junk — delete candidate** | Prázdný artefakt (0 B), zjevný odpad |
| **infra** | Infrastrukturní tooling (Claude Code), ne projektový kód |

---

## Kořenový adresář (`Nabídka weby/`)

| Soubor/složka | Účel | Typ obsahu | Stav | Web | Apps Script | CRM | Docs | Audit | Poznámka | Status |
|---------------|------|------------|------|-----|-------------|-----|------|-------|----------|--------|
| `apps-script/` | CRM backend | GS kód | aktivní | — | ✅ hlavní | ✅ backend | — | — | Jádro CRM business logiky | **keep as active** |
| `crm-frontend/` | CRM webové UI | Next.js/TS | aktivní | — | — | ✅ frontend | — | — | Vlastní .git repo | **keep as active** |
| `docs/` | Dokumentace | MD | aktivní | — | — | ✅ dokumentace | ✅ | ✅ | Obsahuje systémovou mapu | **keep as active** |
| `nabidka-web-remeslnici.html` | Nabídka web | HTML | aktivní | ✅ šablona | — | — | — | — | Source pro PDF | **keep as active** |
| `nabidka-web-remeslnici.pdf` | Nabídka web | PDF | aktivní | ✅ výstup | — | — | — | — | Generovaný z HTML | **review later** |
| `nabidka-automatizace.html` | Nabídka automatizace | HTML | aktivní | ✅ šablona | — | — | — | — | Source pro PDF | **keep as active** |
| `nabidka-automatizace.pdf` | Nabídka automatizace | PDF | aktivní | ✅ výstup | — | — | — | — | Generovaný z HTML | **review later** |
| `Nabídka - web - onepager.pdf` | Onepager web | PDF | aktivní | ✅ výstup | — | — | — | — | Verze onepager | **review later** |
| `Nabídka - automatizace - onepager.pdf` | Onepager automatizace | PDF | aktivní | ✅ výstup | — | — | — | — | Verze onepager | **review later** |
| `html2pdf.py` | Konvertor HTML→PDF | Python skript | pomocný | ✅ tool | — | — | — | — | Headless Chrome | **review later** |
| `html2pdf_auto.py` | Konvertor HTML→PDF (auto) | Python skript | pomocný | ✅ tool | — | — | — | — | Varianta html2pdf | **review later** |
| `CLAUDE.md` | Claude Code config | MD | aktivní | — | — | — | — | — | Hlavní instrukce pro Claude | **infra** |
| `.mcp.json` | MCP server config | JSON | aktivní | — | — | — | — | — | MCP konfigurace | **infra** |
| `.claude/` | Claude Code tooling | mixed | aktivní | — | — | — | — | — | Agenti, skills, helpers | **infra** |
| `.claude-flow/` | claude-flow daemon | mixed | aktivní | — | — | — | — | — | Daemon state, metriky | **infra** |
| `.swarm/` | Swarm state | DB/JSON | nejasný | — | — | — | — | — | Starší swarm data | **unclear** |
| `0)` | — | prázdný (0 B) | junk | — | — | — | — | — | Fragment kódu jako soubor | **junk — delete candidate** |
| `3)` | — | prázdný (0 B) | junk | — | — | — | — | — | Fragment kódu jako soubor | **junk — delete candidate** |
| `300)` | — | prázdný (0 B) | junk | — | — | — | — | — | Fragment kódu jako soubor | **junk — delete candidate** |
| `Modifies` | — | prázdný (0 B) | junk | — | — | — | — | — | Fragment kódu jako soubor | **junk — delete candidate** |
| `WON` | — | prázdný (0 B) | junk | — | — | — | — | — | Fragment kódu jako soubor | **junk — delete candidate** |
| `{,` | — | prázdný (0 B) | junk | — | — | — | — | — | Fragment kódu jako soubor | **junk — delete candidate** |
| `{const` | — | prázdný (0 B) | junk | — | — | — | — | — | Fragment kódu jako soubor | **junk — delete candidate** |
| `}` | — | prázdný (0 B) | junk | — | — | — | — | — | Fragment kódu jako soubor | **junk — delete candidate** |
| `console.error('FAIL` | — | prázdný (0 B) | junk | — | — | — | — | — | Fragment kódu jako soubor | **junk — delete candidate** |
| `m[1])` | — | prázdný (0 B) | junk | — | — | — | — | — | Fragment kódu jako soubor | **junk — delete candidate** |

---

## Složka `apps-script/`

| Soubor | Účel | Typ | Stav | Web | Apps Script | CRM | Docs | Audit | Poznámka | Status |
|--------|------|-----|------|-----|-------------|-----|------|-------|----------|--------|
| `Config.gs` | Konstanty, flags, sloupce | GS | aktivní | — | ✅ | ✅ config | — | — | SPREADSHEET_ID, DRY_RUN, BATCH_SIZE | **keep as active** |
| `Helpers.gs` | HeaderResolver, logging, utils | GS | aktivní | — | ✅ | ✅ core | — | — | Kritické: aswLog_, HeaderResolver | **keep as active** |
| `PreviewPipeline.gs` | Kvalifikace, preview, drafty | GS | aktivní | — | ✅ | ✅ core | — | — | Největší soubor (1 492 ř.) | **keep as active** |
| `ContactSheet.gs` | "Ke kontaktování" sheet mgmt | GS | aktivní | — | ✅ | ✅ core | — | — | Write-back, refresh, KPI | **keep as active** |
| `OutboundEmail.gs` | Odesílání CRM emailů | GS | aktivní | — | ✅ | ✅ email | — | — | Gmail send, draft create | **keep as active** |
| `MailboxSync.gs` | Gmail → LEADS sync | GS | aktivní | — | ✅ | ✅ email | — | — | Reply/bounce/OOO detection | **keep as active** |
| `GmailLabels.gs` | Gmail label management | GS | aktivní | — | ✅ | ✅ email | — | — | ASW/CRM label | **keep as active** |
| `LegacyWebCheck.gs` | Web existence check (Serper) | GS | aktivní | — | ✅ | ✅ pipeline | — | — | Starší funkce, ale stále v menu | **keep as active** |
| `Menu.gs` | Google Sheets menu | GS | aktivní | — | ✅ | ✅ UI | — | — | Uživatelské menu | **keep as active** |
| `.clasp.json` | Clasp deployment config | JSON | aktivní | — | ✅ | — | — | — | parentId → TEST spreadsheet | **review later** |
| `appsscript.json` | Apps Script manifest | JSON | aktivní | — | ✅ | — | — | — | Runtime config | **keep as active** |
| `README.md` | Architektura + setup | MD | aktivní | — | ✅ | ✅ | ✅ | — | Detailní setup instrukce | **keep as active** |
| `SeedTestData.gs.bak` | Testovací data seeder | GS backup | starý | — | ✅ | — | — | — | Záloha, neaktivní | **likely archive** |
| `0` | — | prázdný (0 B) | junk | — | — | — | — | — | Fragment | **junk — delete candidate** |
| `0)` | — | prázdný (0 B) | junk | — | — | — | — | — | Fragment | **junk — delete candidate** |
| `1)` | — | prázdný (0 B) | junk | — | — | — | — | — | Fragment | **junk — delete candidate** |
| `200` | — | prázdný (0 B) | junk | — | — | — | — | — | Fragment | **junk — delete candidate** |
| `300)` | — | prázdný (0 B) | junk | — | — | — | — | — | Fragment | **junk — delete candidate** |
| `TOTAL_COLS_)` | — | prázdný (0 B) | junk | — | — | — | — | — | Fragment | **junk — delete candidate** |
| `m[1])` | — | prázdný (0 B) | junk | — | — | — | — | — | Fragment | **junk — delete candidate** |

---

## Složka `crm-frontend/`

| Soubor/složka | Účel | Typ | Stav | Web | Apps Script | CRM | Docs | Audit | Poznámka | Status |
|---------------|------|-----|------|-----|-------------|-----|------|-------|----------|--------|
| `src/app/api/` | API routes (BFF) | TS | aktivní | — | — | ✅ API | — | — | auth, leads, stats | **keep as active** |
| `src/app/dashboard/` | Dashboard stránka | TSX | aktivní | — | — | ✅ UI | — | — | Stat cards, widgety | **keep as active** |
| `src/app/leads/` | Seznam leadů | TSX | aktivní | — | — | ✅ UI | — | — | Hlavní tabulka | **keep as active** |
| `src/app/follow-ups/` | Follow-up přehled | TSX | aktivní | — | — | ✅ UI | — | — | 226 řádků | **keep as active** |
| `src/app/pipeline/` | Kanban pipeline | TSX | aktivní | — | — | ✅ UI | — | — | Vizuální pipeline | **keep as active** |
| `src/app/login/` | Login stránka | TSX | aktivní | — | — | ✅ UI | — | — | Auth UI | **keep as active** |
| `src/components/dashboard/` | Dashboard komponenty | TSX | aktivní | — | — | ✅ UI | — | — | 3 widgety | **keep as active** |
| `src/components/layout/` | Layout komponenty | TSX | aktivní | — | — | ✅ UI | — | — | Shell, header, sidebar | **keep as active** |
| `src/components/leads/` | Lead komponenty | TSX | aktivní | — | — | ✅ UI | — | — | Tabulka, filtry, drawer | **keep as active** |
| `src/components/pipeline/` | Pipeline komponenty | TSX | aktivní | — | — | ✅ UI | — | — | Kanban board | **keep as active** |
| `src/components/ui/` | shadcn/ui knihovna | TSX | aktivní | — | — | ✅ UI | — | — | 18 generických komponent | **keep as active** |
| `src/hooks/` | React hooks | TS | aktivní | — | — | ✅ logic | — | — | 4 hooks (leads, stats, detail, update) | **keep as active** |
| `src/lib/config.ts` | Sheet config + enums | TS | aktivní | — | ✅ mapování | ✅ config | — | — | ⚠️ Duplikát column mappings | **keep as active** |
| `src/lib/domain/` | Domain typy | TS | aktivní | — | — | ✅ model | — | — | Lead, Filters, Stats | **keep as active** |
| `src/lib/google/` | Google integrace | TS | aktivní | — | ✅ integrace | ✅ data | — | — | Sheets reader + AS writer | **keep as active** |
| `src/lib/mappers/` | Data mapping | TS | aktivní | — | — | ✅ mapping | — | — | Sheet → domain | **keep as active** |
| `src/lib/mock/` | Mock data | TS | nejasný | — | — | ✅ dev | — | — | 509 ř. mock dat — aktuální? | **review later** |
| `src/middleware.ts` | Auth middleware | TS | aktivní | — | — | ✅ auth | — | — | Route protection | **keep as active** |
| `.env.local` | Lokální env vars | env | ⚠️ | — | — | ✅ config | — | — | Může obsahovat credentials | **review later** |
| `.env.example` | Env template | env | aktivní | — | — | ✅ config | — | — | Template pro .env | **keep as active** |
| `package.json` | Dependencies | JSON | aktivní | — | — | ✅ | — | — | Next.js 16, React 19 | **keep as active** |
| `README.md` | Dokumentace | MD | nedostatečné | — | — | — | ✅ | — | Pouze default Next.js template | **review later** |
| `CLAUDE.md` | Claude agent config | MD | aktivní | — | — | — | — | — | Odkaz na AGENTS.md | **infra** |
| `AGENTS.md` | Agent pravidla | MD | aktivní | — | — | — | — | — | Next.js agent rules | **infra** |
| `.git/` | Git repo | git | aktivní | — | — | — | — | — | Vlastní repo (ne root) | **review later** |
| `.next/` | Next.js build cache | build | generovaný | — | — | — | — | — | Build artefakty | **keep as active** |
| `(DEFAULT_FILTERS)` | — | prázdný (0 B) | junk | — | — | — | — | — | Fragment | **junk — delete candidate** |
| `([])` | — | prázdný (0 B) | junk | — | — | — | — | — | Fragment | **junk — delete candidate** |
| `0` | — | prázdný (0 B) | junk | — | — | — | — | — | Fragment | **junk — delete candidate** |
| `l.contactPriority` | — | prázdný (0 B) | junk | — | — | — | — | — | Fragment | **junk — delete candidate** |
| `maxAge)` | — | prázdný (0 B) | junk | — | — | — | — | — | Fragment | **junk — delete candidate** |
| `pathname.startsWith(p)))` | — | prázdný (0 B) | junk | — | — | — | — | — | Fragment | **junk — delete candidate** |

---

## Složka `docs/`

| Soubor | Účel | Typ | Stav | Web | Apps Script | CRM | Docs | Audit | Poznámka | Status |
|--------|------|-----|------|-----|-------------|-----|------|-------|----------|--------|
| `CRM-SYSTEM-MAP.md` | Kompletní systémová mapa CRM | MD | aktivní | — | ✅ reference | ✅ | ✅ hlavní | ✅ | Source of truth pro CRM dokumentaci | **keep as active** |
| `~$M-SYSTEM-MAP.md` | Editor lock file | temp | dočasný | — | — | — | — | — | Word/editor artefakt | **junk — delete candidate** |
| `00-project-map.md` | Mapa projektu | MD | nový | — | — | — | ✅ | — | Tento dokument | **keep as active** |
| `00-folder-inventory.md` | Inventář složek | MD | nový | — | — | — | ✅ | — | Tento dokument | **keep as active** |

---

## Souhrnná statistika

| Kategorie | Počet položek |
|-----------|--------------|
| **keep as active** | ~35 |
| **review later** | ~10 |
| **likely archive** | 1 |
| **unclear** | 1 |
| **junk — delete candidate** | ~24 |
| **infra** | ~7 |

### Junk soubory celkem: ~24

Všechny jsou 0 B, prázdné, vypadají jako fragmenty JavaScript/TypeScript/Apps Script kódu, které byly omylem vytvořeny jako soubory (pravděpodobně při AI code generation). Rozptýlené ve 3 složkách: root (10), apps-script (7), crm-frontend (6), docs (1 temp).
