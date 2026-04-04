# Change Log -- Autosmartweby

> Append-only. Nejnovejsi zaznamy nahore.

---

## 2026-04-04

### [FEATURE] Varianta B — lead_id-based write-back (C-3 VYRESENO)
- **Oblast:** apps-script (ContactSheet.gs, Helpers.gs), docs
- **Zmenene soubory:** apps-script/ContactSheet.gs (buildContactRowV2_, onContactSheetEdit, refreshContactingSheet), apps-script/Helpers.gs (findRowByLeadId_)
- **Co:** Write-back prepsany z row-number na lead_id lookup. Sloupec 19 contact sheetu nyni drzi lead_id misto cisla radku. onContactSheetEdit pouziva findRowByLeadId_ pro nalezeni aktualniho radku. refreshContactingSheet pridan LockService (R-3 fix). Lock timeout zvysen z 2s na 5s (R-2 fix). Missing/invalid lead_id bezpecne blokuje write-back s warning note. Identity check zachovan jako secondary guard.
- **Proc:** C-3 (row-based write-back) bylo kriticke riziko — insert/delete radku v LEADS mohl zpusobit silent data corruption
- **Dopad:** R-1 (row drift) VYRESENO, R-2 (race) ZMIRNENO, R-3 (refresh race) VYRESENO. Write-back je nyni odolny vuci zmene poradi radku v LEADS.
- **Aktualizovane docs:** docs/15-writeback-risk-analysis.md, docs/15-writeback-options.md, docs/12-route-and-surface-map.md, docs/11-change-log.md
- **Test/Overeni:** tsc --noEmit OK (frontend beze zmen), Apps Script syntax review OK
- **Poznamka:** Pred prvnim pouzitim nutne spustit "Ensure lead IDs" z CRM menu, aby vsechny leady mely lead_id
- **Autor:** Claude + user

### [FEATURE] auditLeadIds() — read-only audit utility v Apps Script
- **Oblast:** apps-script, docs
- **Zmenene soubory:** apps-script/PreviewPipeline.gs (pridana auditLeadIds()), apps-script/Menu.gs (novy menu item)
- **Co:** Implementace auditLeadIds() primo v kodu jako menu funkce. Ciste read-only — analyzuje pokryti, unikatnost, format a contact-ready pokryti lead_id. Vystup pres Logger + safeAlert. Pridano do CRM menu jako "Audit lead IDs (read-only)".
- **Proc:** Overeni pripravenosti dat pred implementaci Varianty B (lead_id-based write-back)
- **Dopad:** Nova menu funkce, zadne zmeny existujici logiky
- **Aktualizovane docs:** docs/16-lead-id-audit.md (aktualizovano na odkaz na kod), docs/12-route-and-surface-map.md (2 nove menu entrypointy), docs/11-change-log.md
- **Test/Overeni:** node scripts/check-doc-sync.mjs
- **Autor:** Claude + user

### [ANALYSIS] Lead ID audit — feasibility pro Variantu B
- **Oblast:** docs (analyza, zadne zmeny kodu)
- **Vytvorene soubory:** docs/16-lead-id-audit.md
- **Zmenene soubory:** docs/15-writeback-risk-analysis.md (pridana sekce 6 lead_id feasibility), docs/15-writeback-options.md (rozsirena feasibility analyza, nova rizika), docs/11-change-log.md
- **Co:** Audit zdroje, formatu, immutability a pokryti lead_id v Apps Script. Zjisteni: lead_id existuje, format ASW-{ts}-{rnd}, de facto immutable, ale ensureLeadIds() je pouze manualni. Pripraveny auditni skript pro spusteni v Apps Script editoru (read-only, bezpecny).
- **Proc:** Overeni pripravenosti dat pred implementaci Varianty B (lead_id-based write-back)
- **Dopad:** Zadne zmeny kodu. Rozhodovaci strom pro dalsi krok zavisi na vysledku auditu dat.
- **Aktualizovane docs:** docs/15-writeback-risk-analysis.md, docs/15-writeback-options.md, docs/11-change-log.md
- **Test/Overeni:** node scripts/check-doc-sync.mjs
- **Autor:** Claude + user

### [ANALYSIS] Write-back risk analysis + repair options
- **Oblast:** docs (analyza, zadne zmeny kodu)
- **Vytvorene soubory:** docs/15-writeback-risk-analysis.md, docs/15-writeback-options.md
- **Co:** End-to-end analyza row-based write-back mechanismu (refresh flow, onContactSheetEdit, frontend writer), identifikace 7 rizik (R-1 az R-7), 10 testovacich scenaru, 3 varianty opravy (A: minimal, B: lead_id-based lookup, C: ideal s doPost + audit trail)
- **Proc:** Zadost vlastnika pred implementaci — "Ted nic neprepisuj, jen analyzuj a navrhni bezpecne varianty"
- **Dopad:** Zadne zmeny kodu, pouze dokumentace. Doporucena Varianta B (lead_id-based lookup) jako dalsi krok.
- **Aktualizovane docs:** docs/11-change-log.md
- **Test/Overeni:** node scripts/check-doc-sync.mjs
- **Autor:** Claude + user

### [DOCS] Finalizace governance pravidel
- **Oblast:** CLAUDE.md, docs, scripts
- **Zmenene soubory:** CLAUDE.md, docs/14-definition-of-done.md, docs/13-doc-update-rules.md, docs/09-project-control-tower.md, scripts/check-doc-sync.mjs
- **Co:** Zprisneni CLAUDE.md (ukol NENI hotovy bez doc sync + changelog), rozdeleni DoD na Code/Documentation/Test Done, pridani completion contractu, vylepseni validacniho skriptu (detekce undocumented code changes, known external refs), oprava 2 warningu (07-test-plan.md a 06-bug-registry.md jsou v web-starter repo — oznaceny jako known external)
- **Proc:** Finalni dotazeni governance discipliny
- **Dopad:** Validace nyni 26 pass / 0 warn / 0 fail
- **Aktualizovane docs:** docs/09-project-control-tower.md (v1.1), docs/14-definition-of-done.md, docs/13-doc-update-rules.md
- **Test/Overeni:** node scripts/check-doc-sync.mjs — 26 pass, 0 warn, 0 fail
- **Autor:** Claude + user

### [DOCS] Dokumentacni governance + control tower
- **Oblast:** dokumentace, CLAUDE.md, scripts
- **Zmenene soubory:** CLAUDE.md (pridana sekce Mandatory Documentation Sync)
- **Vytvorene soubory:** docs/09-project-control-tower.md, docs/10-documentation-governance.md, docs/11-change-log.md, docs/12-route-and-surface-map.md, docs/13-doc-update-rules.md, docs/14-definition-of-done.md, scripts/check-doc-sync.mjs
- **Co:** Zavedeni dokumentacni governance — master ridici dokument s integraci nocnich auditu, changelog, route mapa, pravidla aktualizace, definition of done, validacni script, persistent instrukce v CLAUDE.md
- **Proc:** Zabraneni budoucimu rozjezdeni dokumentace s realitou, konsolidace dvou auditnich streamu
- **Dopad:** Claude ma povinnost aktualizovat dokumentaci pri kazde zmene; existuje validacni mechanismus
- **Aktualizovane docs:** CLAUDE.md, docs/01-decision-list.md
- **Test/Overeni:** node scripts/check-doc-sync.mjs — 23 pass, 2 warn, 0 fail
- **Autor:** Claude + user

### [CLEANUP] Faze 03 -- bezpecny cleanup projektu
- **Oblast:** struktura projektu
- **Zmenene soubory:** 26 smazanych (junk), 8 presunutych (nabidky -> offers/), 3 upravene (html2pdf cesty), 2 vytvorene (.gitignore, offers/)
- **Co:** Smazani 24 junk souboru (0B artefakty), presun nabidek do offers/, aktualizace cest v Python skriptech, prepsani README souboru, vytvoreni root .gitignore
- **Proc:** D-1 cleanup, D-5 nabidky, D-6 dokumentace -- dle docs/02-cleanup-plan.md
- **Dopad:** Cistsi struktura, zadny dopad na funkcnost
- **Aktualizovane docs:** docs/03-cleanup-executed.md
- **Test/Overeni:** Vizualni kontrola struktury
- **Autor:** Claude + user

### [INFRA] Faze 05 -- monorepo setup
- **Oblast:** git, infrastruktura
- **Zmenene soubory:** crm-frontend/.git/ smazan, git init v root, .gitignore vytvoren
- **Co:** Commit crm-frontend stavu, export git historie, smazani nested .git, root git init, initial monorepo commit
- **Proc:** D-3 rozhodnuti vlastnika -- monorepo, lokalni git, bez GitHub remote
- **Dopad:** Cely projekt verzovany v jednom git repo
- **Aktualizovane docs:** docs/05-monorepo-setup-log.md, docs/crm-frontend-git-history.txt
- **Test/Overeni:** git log --oneline -- 2 commity
- **Autor:** Claude + user

### [FIX] Faze 06 -- column mappings synchronizace (Varianta B)
- **Oblast:** crm-frontend, apps-script
- **Zmenene soubory:** crm-frontend/src/lib/config.ts, crm-frontend/src/lib/mappers/sheet-to-domain.ts, apps-script/LegacyWebCheck.gs
- **Co:** Smazan dead code LEADS_COLUMNS, pridana REQUIRED_HEADERS + runtime validace, pridan validateLegacyColHeaders_() guard do LegacyWebCheck.gs
- **Proc:** D-2 -- column mappings desynchronizace byla hlavni technicke riziko
- **Dopad:** Frontend ma warning pri chybejicich hlavickach, LegacyWebCheck blokuje pri mismatch
- **Aktualizovane docs:** docs/06-column-mappings-analysis.md, docs/06-column-mappings-options.md, docs/01-decision-list.md (D-2 HOTOVO)
- **Test/Overeni:** tsc --noEmit OK, npm run build OK
- **Autor:** Claude + user

### [SECURITY] H-2 -- timing-safe HMAC comparison
- **Oblast:** crm-frontend, auth
- **Zmenene soubory:** crm-frontend/src/middleware.ts
- **Co:** Nahrazena string comparison (signature !== expected) za crypto.subtle.verify(), smazana nepouzivana hmacSign()
- **Proc:** H-2 audit finding -- timing-unsafe HMAC verification
- **Dopad:** Session token verification je nyni timing-safe
- **Aktualizovane docs:** docs/01-decision-list.md (D-7 dodatek H-2 HOTOVO)
- **Test/Overeni:** tsc --noEmit OK, npm run build OK
- **Autor:** Claude + user
