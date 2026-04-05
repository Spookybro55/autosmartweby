# Sjednocený audit — Nabídka weby (Autosmartweby)

> **Datum:** 2026-04-04
> **Účel:** Deduplikovaný přehled všech nalezených problémů z jednoho místa
> **Pravidlo:** Tento dokument nic nemění — pouze sjednocuje závěry

---

## A. Auditní zdroje

| # | Zdroj | Typ | Co obsahuje |
|---|-------|-----|-------------|
| 1 | `docs/00-project-map.md` | Mapa projektu | Struktura složek, funkční celky, nejasnosti, duplicity |
| 2 | `docs/00-folder-inventory.md` | Inventář | Kompletní seznam souborů se statusy |
| 3 | `docs/CRM-SYSTEM-MAP.md` | Systémová mapa CRM | Detailní architektura, sloupce, funkce, 15 nejmatoucnějších míst |
| 4 | `apps-script/README.md` | Dokumentace AS | Architektura, setup, checklist, edge cases |
| 5 | `crm-frontend/src/` | Zdrojový kód frontendu | Přímá inspekce auth, middleware, config, integrace |
| 6 | `apps-script/Config.gs` | Konfigurace AS | SPREADSHEET_ID, DRY_RUN, column mappings |
| 7 | `apps-script/.clasp.json` | Clasp config | parentId vs produkční ID |
| 8 | `crm-frontend/.gitignore` | Git ignore | Ověření, co je a není trackováno |

---

## B. Deduplikované problémy — podle priority

### KRITICKÉ (blokuje spolehlivost systému)

| ID | Problém | Oblast | Popis | Zdroj | Potvrzeno? | Co udělat | Blokuje? |
|----|---------|--------|-------|-------|------------|-----------|----------|
| C-1 | **Column mappings na 2 místech** | apps-script + crm-frontend | `Config.gs` definuje LEGACY_COL s hardcoded indexy (4,9,11,12,13,20). `crm-frontend/src/lib/config.ts` definuje LEADS_COLUMNS s 0-based indexy odvozenými od stejných pozic. Při změně sloupce v sheetu je nutné synchronizovat oba soubory ručně. Žádný mechanismus validace. | 00-project-map §5.1, CRM-SYSTEM-MAP §I.12 | **POTVRZENO** — oba soubory existují a mapují stejné sloupce nezávisle | Rozhodnout: sdílená konfigurace, nebo alespoň validační test | ANO — může způsobit tichý data mismatch |
| C-2 | **LEGACY_COL hardcoded pozice — křehké** | apps-script | 6 sloupců (business_name, city, phone, email, website_url, has_website) mají hardcoded pozice. Vložení sloupce před pozici 20 rozbije systém. Runtime validace (`validateLegacyColHeaders_`) existuje jen ve write-back cestě, ne v pipeline. | CRM-SYSTEM-MAP §C.1, §I.12 | **POTVRZENO** — zdokumentováno jako known risk | Rozhodnout: přejít na HeaderResolver pro všechny sloupce, nebo přidat validaci na všechny cesty | ANO — potenciální data corruption |
| C-3 | **Write-back selže tiše při posunutých řádcích** | apps-script | Col 19 (CRM řádek) v "Ke kontaktování" ukládá číslo řádku v LEADS. Po vložení/smazání řádků v LEADS reference zastarají. Write-back zapíše data do špatného řádku. | CRM-SYSTEM-MAP §I.15 | **POTVRZENO** — zdokumentováno jako "trojúhelníková varování, snadno se přehlédnou" | Zvážit lead_id-based write-back místo row-number-based | ANO — může přepsat data jiného leadu |

### VYSOKÉ (bezpečnost nebo zásadní tech debt)

| ID | Problém | Oblast | Popis | Zdroj | Potvrzeno? | Co udělat | Blokuje? |
|----|---------|--------|-------|-------|------------|-----------|----------|
| H-1 | **Auth heslo sdílené plain-text** | crm-frontend | `AUTH_PASSWORD` env var se porovnává přímo (`password !== AUTH_PASSWORD`). Všichni uživatelé sdílejí jedno heslo. Žádný rate-limiting, žádné per-user credentials. | Inspekce `login/route.ts` | **POTVRZENO** — kód ověřen | Přejít na per-user credentials nebo OAuth; přidat rate-limiting | NE — funguje, ale bezpečnostní riziko |
| H-2 | **Session token bez constant-time comparison** | crm-frontend | Middleware porovnává HMAC signatury přes `signature !== expected` (string comparison), ne přes `crypto.timingSafeEqual`. Teoretický timing attack vektor. | Inspekce `middleware.ts:32` | **POTVRZENO** — kód ověřen | Přepsat na `crypto.timingSafeEqual` | NE — nízká pravděpodobnost exploitu, ale snadný fix |
| H-3 | **Žádná verzovací strategie** | struktura projektu | Root adresář NENÍ git repo. `crm-frontend/` má vlastní `.git`. `apps-script/` nemá git (jen clasp). Žádný společný version control. | 00-project-map §5.3 | **POTVRZENO** — ověřeno | Rozhodnout: monorepo, nebo oddělené repo pro apps-script | NE — ale zvyšuje riziko ztráty kódu |
| H-4 | **`.clasp.json` parentId nesedí s produkčním spreadsheet** | apps-script | `.clasp.json` parentId = `13fyA63p6g9eLMdy9KhBUO6lrbdtMhsL0kbHOVafvmyo` (TEST), `Config.gs` SPREADSHEET_ID = `1RBcLZkn3AruiqaQdJ7PHIxvCcoO5SC9Qnlw_NiLnpYc` (PRODUKCE). `clasp push` deployuje do TEST prostředí, ne do produkce. | 00-project-map §5.3, inspekce souborů | **POTVRZENO** — hodnoty ověřeny | Rozhodnout: záměr (safety) nebo chyba? Zdokumentovat. | NE — ale matoucí pro deployment |

### STŘEDNÍ (tech debt / organizace)

| ID | Problém | Oblast | Popis | Zdroj | Potvrzeno? | Co udělat | Blokuje? |
|----|---------|--------|-------|-------|------------|-----------|----------|
| M-1 | **~24 junk souborů (0 B artefakty)** | struktura projektu | Prázdné soubory s názvy jako `0)`, `{const`, `console.error('FAIL`, `(DEFAULT_FILTERS)` rozptýlené ve 3 složkách. Vznikly chybným výstupem AI code generation. | 00-project-map §5.2, 00-folder-inventory | **POTVRZENO** — všechny ověřeny jako 0 B | Smazat celou dávku | NE — ale znečišťují projekt |
| M-2 | **Nabídkové materiály v kořeni vedle CRM kódu** | struktura projektu | HTML/PDF nabídky (`nabidka-*.html/pdf`, `Nabídka - *.pdf`) leží v root složce vedle apps-script a crm-frontend. Nesouvisí s CRM. | 00-project-map §3.C | **POTVRZENO** | Rozhodnout: přesunout do `offers/` nebo nechat | NE |
| M-3 | **`crm-frontend/README.md` je default Next.js template** | dokumentace | Neobsahuje nic o CRM projektu — jen generický "Getting Started" z create-next-app. | 00-project-map §4.3 | **POTVRZENO** | Nahradit skutečnou dokumentací | NE |
| M-4 | **Dokumentace CRM rozptýlená na 3 místech** | dokumentace | `docs/CRM-SYSTEM-MAP.md` (nejpodrobnější), `apps-script/README.md` (setup), `crm-frontend/README.md` (prázdný). Částečné překryvy mezi prvními dvěma. | 00-project-map §5.1 | **POTVRZENO** | Rozhodnout: jeden zdroj, nebo jasná dělba (arch vs setup) | NE |
| M-5 | **Mock data mohou být zastaralá** | crm-frontend | `src/lib/mock/leads-data.ts` (509 řádků) — není jasné, zda odpovídají aktuální struktuře sheetu. | 00-project-map §4.3 | **HYPOTÉZA** — nezjištěno | Ověřit vůči aktuálnímu schema | NE |
| M-6 | **PreviewPipeline.gs je příliš velký** | apps-script | 1 492 řádků — obsahuje kvalifikaci, template selection, briefs, drafts, webhook v jednom souboru. | CRM-SYSTEM-MAP, 00-project-map | **POTVRZENO** | Zvážit rozdělit na menší soubory | NE |
| M-7 | **Tři různé významy "REVIEW" v systému** | apps-script | `lead_stage=REVIEW`, `preview_stage=REVIEW_NEEDED`, `email_sync_status=REVIEW` — stejné slovo, tři různé kontexty. | CRM-SYSTEM-MAP §I.3 | **POTVRZENO** — zdokumentováno | Zvážit přejmenování (LEAD_REVIEW, PREVIEW_CHECK, EMAIL_AMBIGUOUS) | NE |
| M-8 | **`email_reply_type=REPLIED` nepropaguje do `outreach_stage`** | apps-script | Mailbox sync detekuje odpověď, ale neaktualizuje obchodní stav. Obchodník musí ručně změnit stav na "Reagoval". | CRM-SYSTEM-MAP §I.2 | **POTVRZENO** — zdokumentováno jako design decision | Rozhodnout: auto-update nebo keep manual | NE |

### NÍZKÉ (nice-to-have / cleanup)

| ID | Problém | Oblast | Popis | Zdroj | Potvrzeno? | Co udělat | Blokuje? |
|----|---------|--------|-------|-------|------------|-----------|----------|
| L-1 | **`SeedTestData.gs.bak` — stará záloha** | apps-script | Neaktivní záloha test seederu. | 00-folder-inventory | **POTVRZENO** | Smazat nebo archivovat | NE |
| L-2 | **`docs/~$M-SYSTEM-MAP.md` — editor lock file** | docs | Temp soubor z Word/editoru. | 00-folder-inventory | **POTVRZENO** | Smazat | NE |
| L-3 | **`html2pdf.py` a `html2pdf_auto.py` — dva podobné skripty** | web/nabídky | Dva Python skripty pro HTML→PDF konverzi. Není jasné, který je aktuální. | 00-project-map §3.D | **HYPOTÉZA** | Ověřit, který se používá; druhý archivovat | NE |
| L-4 | **PDF vs HTML aktuálnost** | web/nabídky | 4 PDF a 2 HTML — není jasné, zda PDF odpovídají aktuálním HTML. | 00-project-map §3.C | **HYPOTÉZA** | Ověřit regenerací PDF z HTML | NE |
| L-5 | **`.swarm/` — starší swarm state** | infra | Obsahuje memory.db, schema.sql, state.json. Není jasné, zda se stále používá vedle `.claude-flow/`. | 00-folder-inventory | **NEJASNÉ** | Ověřit, zda je redundantní s `.claude-flow/` | NE |

---

## C. Problémy podle oblastí

### Apps Script (C-2, C-3, H-4, M-6, M-7, M-8, L-1)

Jádro CRM logiky je funkční a dobře zdokumentované. Hlavní rizika:
- **Hardcoded column pozice** (C-2) — křehké, ale s runtime validací v některých cestách
- **Row-based write-back** (C-3) — tichá chyba při posunutí řádků
- **Clasp config vs produkce** (H-4) — matoucí, ale možná záměrně (safety)

### CRM Frontend (C-1, H-1, H-2, M-3, M-5)

Frontend je funkční Next.js aplikace. Hlavní rizika:
- **Duplikované column mappings** (C-1) — riziko desynchronizace s Apps Script
- **Sdílené plain-text heslo** (H-1) — bezpečnostní slabina
- **Timing-unsafe HMAC comparison** (H-2) — teoretický vektor

### Web / Nabídky (L-3, L-4)

Nezávislé na CRM. Žádné kritické problémy — jen organizační nejasnosti.

### Dokumentace / Struktura projektu (H-3, M-1, M-2, M-4, L-2, L-5)

Největší organizační problémy:
- **Žádný git na root úrovni** (H-3) — zásadní pro verzování
- **~24 junk souborů** (M-1) — zjevný cleanup
- **Nabídky smíchané s kódem** (M-2) — organizační problém

---

## D. Co je potvrzené vs hypotéza vs vyžaduje ověření

### Potvrzené (ověřeno inspekcí kódu/souborů)

- C-1: Column mappings na 2 místech
- C-2: Hardcoded LEGACY_COL
- C-3: Row-based write-back
- H-1: Plain-text shared password
- H-2: String comparison HMAC
- H-3: Žádný git na root
- H-4: Clasp parentId ≠ produkční ID
- M-1: ~24 junk souborů (0 B)
- M-2: Nabídky v root
- M-3: Prázdný README
- M-4: Dokumentace na 3 místech
- M-6: PreviewPipeline.gs je 1 492 řádků
- M-7: Tři významy "REVIEW"
- M-8: REPLIED nepropaguje do outreach_stage
- L-1: SeedTestData.gs.bak
- L-2: Editor lock file

### Hypotézy (nezjištěno)

- M-5: Mock data mohou být zastaralá
- L-3: Který html2pdf skript je aktuální
- L-4: PDF mohou neodpovídat HTML

### Vyžaduje ruční ověření vlastníkem

- H-4: Je `clasp parentId` → TEST záměrné (safety)?
- M-8: Je manuální REPLIED→RESPONDED design decision nebo bug?
- L-5: Používá se `.swarm/` ještě?

---

## E. Souhrnná statistika

| Priorita | Počet | Potvrzeno | Hypotéza | K ověření |
|----------|-------|-----------|----------|-----------|
| Kritické | 3 | 3 | 0 | 0 |
| Vysoké | 4 | 4 | 0 | 1 (H-4 záměr?) |
| Střední | 8 | 6 | 1 | 1 |
| Nízké | 5 | 2 | 2 | 1 |
| **Celkem** | **20** | **15** | **3** | **2** |
