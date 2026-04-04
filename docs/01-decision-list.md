# Seznam otevřených rozhodnutí — Nabídka weby (Autosmartweby)

> **Datum:** 2026-04-04
> **Účel:** Přehled rozhodnutí, která potřebují vlastníka projektu
> **Pravidlo:** Tento dokument nic nemění — pouze předkládá varianty

---

## Přehled

| # | Rozhodnutí | Priorita | Řešit |
|---|-----------|----------|-------|
| D-1 | Co s ~24 junk soubory | střední | HNED |
| D-2 | Column mappings — jak synchronizovat | kritická | HNED |
| D-3 | Git strategie pro celý projekt | vysoká | BRZY |
| D-4 | Co s `.clasp.json` parentId | vysoká | BRZY |
| D-5 | Kam s nabídkovými materiály | střední | POZDĚJI |
| D-6 | Co s dokumentací (3 místa) | střední | POZDĚJI |
| D-7 | Auth model — sdílené heslo | vysoká | BRZY |
| D-8 | `.env.local` v crm-frontend | nízká* | OVĚŘIT |

---

## D-1: Co s ~24 junk soubory (0 B artefakty)

**Proč je to důležité:** Znečišťují projekt, matou při navigaci, vypadají jako kód ale nic neobsahují.

**Varianty:**
1. **Smazat všechny najednou** — jednorázový cleanup
2. **Smazat jen z root a apps-script, nechat crm-frontend** — crm-frontend má vlastní git, cleanup tam zvlášť
3. **Nechat** — neškodí funkčně

**Doporučená varianta:** **1 — smazat všechny najednou.** Všechny jsou potvrzeně 0 B, žádný z nich nemá smysluplný obsah. Žádné riziko ztráty dat.

**Riziko špatného rozhodnutí:** Nulové — jsou prázdné.

**Řešit:** HNED — 30 sekund práce, nulové riziko.

---

## D-2: Column mappings — jak synchronizovat Apps Script a Frontend

**Proč je to důležité:** `apps-script/Config.gs` (LEGACY_COL: 4,9,11,12,13,20) a `crm-frontend/src/lib/config.ts` (LEADS_COLUMNS: 3,8,10,11,12,19 = 0-based) mapují stejné sloupce nezávisle. Při přidání sloupce do sheetu se jeden aktualizuje a druhý ne → tichý data mismatch.

**Varianty:**
1. **Sdílený konfigurační soubor** — JSON soubor v root, oba systémy ho čtou. Problém: Apps Script nemá přímý přístup k lokálním souborům.
2. **Generovaný config** — skript, který z Config.gs vygeneruje config.ts. Spouštět při změně.
3. **Frontend čte column pozice dynamicky z header řádku** — frontend už to částečně dělá (DYNAMIC_HEADERS). Rozšířit na všechny sloupce.
4. **Validační test** — CI/skript, který porovná oba soubory a varuje při nesouladu.
5. **Komentářová konvence** — ručně, s poznámkou "SYNC WITH Config.gs" v obou souborech.

**Doporučená varianta:** **3 + 4 kombinace.** Frontend už dynamicky resolvuje většinu sloupců přes DYNAMIC_HEADERS. Rozšířit to na všech 6 LEGACY_COL sloupců (eliminuje hardcoded pozice ve frontendu). Přidat jednoduchý validační skript jako pojistku.

**Riziko špatného rozhodnutí:** Pokud se nic neudělá → při první změně struktury sheetu frontend přestane správně číst data, ale nebude to vidět hned (tichá chyba).

**Řešit:** HNED — je to největší technické riziko v projektu.

---

## D-3: Git strategie pro celý projekt

**Proč je to důležité:** Root adresář NENÍ git repo. `crm-frontend/` má vlastní `.git`. `apps-script/` nemá git (jen clasp). Kód v root (HTML, Python) a apps-script není verzován vůbec.

**Varianty:**
1. **Monorepo** — `git init` v root, přidat vše. `crm-frontend/.git` buď smazat (jeden repo) nebo nechat jako submodule.
2. **Oddělené repozitáře** — `apps-script/` dostane vlastní git. Root zůstane jako workspace.
3. **Jen přidat root .gitignore + .git** — minimální řešení, verzovat aspoň root soubory a apps-script.

**Doporučená varianta:** **1 — monorepo.** Projekt je malý (3 složky, <11 000 řádků kódu). Monorepo je nejjednodušší na údržbu. `crm-frontend/.git` nahradit — historie se zachová exportem, nebo se akceptuje reset.

**Riziko špatného rozhodnutí:** Pokud se nic neudělá → apps-script kód není verzován, při chybě v editoru Apps Script se ztratí práce.

**Řešit:** BRZY — ne urgentní, ale důležité pro bezpečnost kódu.

---

## D-4: Co s `.clasp.json` parentId (TEST vs PRODUKCE)

**Proč je to důležité:** `clasp push` deployuje do TEST spreadsheet (`13fyA...`), ne do produkčního (`1RBcLZkn3...`). Buď je to záměrná safety pojistka, nebo chyba.

**Varianty:**
1. **Nechat TEST jako default** — `clasp push` jde do testu. Produkce se deployuje ručně kopírováním souborů do Apps Script editoru.
2. **Změnit parentId na produkci** — `clasp push` jde rovnou do produkce. Rychlejší, ale nebezpečnější.
3. **Dva .clasp.json profily** — `.clasp.json` (test) a `.clasp-prod.json` (produkce). Přepínat ručně nebo skriptem.

**Doporučená varianta:** **1 nebo 3.** Záleží na tom, zda se clasp aktivně používá pro deployment. Pokud ano → varianta 3. Pokud se apps-script edituje přímo v editoru → varianta 1 stačí.

**Vyžaduje odpověď vlastníka:** Používáš `clasp push` pro deployment do produkce?

**Riziko špatného rozhodnutí:** Varianta 2 bez testování → push do produkce s chybou.

**Řešit:** BRZY — závisí na deployment workflow.

---

## D-5: Kam s nabídkovými materiály v kořeni

**Proč je to důležité:** HTML šablony, PDF výstupy a Python konvertory leží v root vedle CRM kódu. Funkčně nesouvisí.

**Varianty:**
1. **Přesunout do `offers/`** — čistá separace: `offers/html/`, `offers/pdf/`, `offers/tools/`
2. **Přesunout do `docs/offers/`** — pokud jde o dokumentaci / obchodní materiály
3. **Nechat v root** — jsou jen 8 souborů, neškodí funkčně

**Doporučená varianta:** **1 — `offers/`.** Jasně oddělí obchodní materiály od kódu.

**Riziko špatného rozhodnutí:** Žádné reálné riziko — jde čistě o organizaci.

**Řešit:** POZDĚJI — neblokuje nic.

---

## D-6: Co s dokumentací (3 místa)

**Proč je to důležité:** `docs/CRM-SYSTEM-MAP.md` (architektura), `apps-script/README.md` (setup), `crm-frontend/README.md` (prázdný). Částečné překryvy. Nejasné, kam přidávat novou dokumentaci.

**Varianty:**
1. **`docs/` jako jediný zdroj** — přesunout setup z `apps-script/README.md` do `docs/`. README soubory odkazují do `docs/`.
2. **Dělba zodpovědnosti** — `docs/` = architektura a systémové mapy. `apps-script/README.md` = setup a development. `crm-frontend/README.md` = frontend setup.
3. **Nechat** — dokumentace je malá, 3 místa nejsou katastrofa.

**Doporučená varianta:** **2 — dělba zodpovědnosti** s jedním pravidlem: `docs/` = celkový systém, `*/README.md` = setup dané komponenty. Nahradit default `crm-frontend/README.md` skutečnou dokumentací.

**Riziko špatného rozhodnutí:** Nízké — jde o organizaci, ne funkčnost.

**Řešit:** POZDĚJI — po vyřešení D-1 až D-4.

---

## D-7: Auth model — sdílené heslo pro všechny uživatele

**Proč je to důležité:** CRM frontend používá jednu sdílenou env var `AUTH_PASSWORD` pro všechny uživatele. Nelze odlišit, kdo se přihlásil. Nelze odebrat přístup jednomu uživateli bez změny hesla pro všechny.

**Varianty:**
1. **Per-user credentials** — tabulka uživatelů (v env, config, nebo sheets). Každý má vlastní heslo.
2. **Google OAuth** — přihlášení přes Google účet. Nejbezpečnější, ale vyžaduje OAuth setup.
3. **Nechat sdílené heslo** — pro interní 1-3 uživatele je to pragmatické řešení.

**Doporučená varianta:** **3 krátkodobě, 2 dlouhodobě.** Pokud CRM používají 1-3 lidé interně, sdílené heslo je přijatelné. Při růstu → přejít na Google OAuth (přirozené, protože systém už je na Google ekosystému).

**Dodatek:** Přidat alespoň `crypto.timingSafeEqual` do middleware (H-2) — triviální fix.

**Riziko špatného rozhodnutí:** Při sdíleném hesle a více uživatelích → nemožnost auditu, kdo co udělal.

**Řešit:** BRZY — ale rozsah závisí na počtu uživatelů.

---

## D-8: `.env.local` v crm-frontend

**Proč je to důležité:** Zmíněno v 00-project-map jako potenciální bezpečnostní problém.

**Skutečný stav po ověření:** `.gitignore` v `crm-frontend/` obsahuje `.env*` → soubor NENÍ a NIKDY NEBYL trackován v gitu. To je správné chování.

**Varianty:**
1. **Žádná akce** — `.gitignore` je správně nakonfigurován.
2. **Přidat root-level `.gitignore`** — pokud se vytvoří root git repo (D-3), přidat `.env*` i tam.

**Doporučená varianta:** **1 — žádná akce teď.** Při řešení D-3 (git strategie) přidat root `.gitignore`.

**Řešit:** Samovyřeší se při D-3.

---

## Souhrn: co řešit kdy

### HNED (nulové nebo minimální riziko, velký efekt na pořádek)

| # | Co | Effort |
|---|-----|--------|
| D-1 | Smazat ~24 junk souborů | 1 min |
| D-2 | Rozhodnout o column mappings synchronizaci | 30 min analýza, pak implementace |

### BRZY (důležité, ale ne urgentní)

| # | Co | Effort |
|---|-----|--------|
| D-3 | Git strategie | 30 min setup |
| D-4 | Clasp parentId — ověřit s vlastníkem | 5 min rozhodnutí |
| D-7 | Auth model — minimálně timing-safe fix | 5 min fix |

### POZDĚJI (organizace, nice-to-have)

| # | Co | Effort |
|---|-----|--------|
| D-5 | Nabídky do vlastní složky | 10 min |
| D-6 | Dokumentace — dělba zodpovědnosti | 1-2 hod |
