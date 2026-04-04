# Governance dokumentace projektu

Tento dokument definuje typy dokumentace v projektu, jejich role a pravidla pro aktualizaci.

## Typy dokumentu

| Typ | Soubory | Ucel | Kanonicky? |
|-----|---------|------|------------|
| Systemova dokumentace | docs/CRM-SYSTEM-MAP.md | Hloubkovy popis architektury CRM | Ano pro architekturu CRM |
| Nastaveni/Provoz | apps-script/README.md, crm-frontend/README.md | Jak nastavit a spustit jednotlive komponenty | Ano pro kazdou komponentu |
| Auditni dokumenty | docs/01-audit-consolidation.md, web-starter docs/01-08 | Nalezy z auditu kodu | Historicke — stav sledovan v control tower |
| Rozhodovaci log | docs/01-decision-list.md | Rozhodnuti vlastnika (D-1 az D-8) | Ano |
| Zaznam zmen | docs/11-change-log.md | Pouze-pripojovaci zaznam vsech zmen | Ano |
| Mapa rout | docs/12-route-and-surface-map.md | Vsechny routy, povrchy, vstupni body | Ano |
| Testovaci plan | docs/07-test-plan.md (web-starter) | Testovaci scenare | Ano pro web-starter |
| Registr chyb | docs/06-bug-registry.md (web-starter) | Sledovani chyb | Ano pro web-starter |
| Mapovani sloupcu | docs/06-column-mappings-analysis.md | Analyza synchronizace sloupcu | Historicke |
| Control tower | docs/09-project-control-tower.md | Hlavni provozni dokument | Ano — jediny zdroj pravdy |
| README soubory | apps-script/README.md, crm-frontend/README.md | Nastaveni na urovni komponent | Ano pro kazdou komponentu |
| Logy cisteni/migrace | docs/03-cleanup-executed.md, 05-monorepo-setup-log.md | Co bylo provedeno | Historicke |
| Cilova struktura | docs/02-target-structure.md | Planovana struktura slozek | Reference |

## Co aktualizovat pro kazdy typ zmeny

### Zmena routy
- Mapa rout (`docs/12-route-and-surface-map.md`)
- Testovaci plan (`docs/07-test-plan.md`)

### Zmena API
- Mapa rout (`docs/12-route-and-surface-map.md`)
- Testovaci plan (`docs/07-test-plan.md`)
- Rozhodovaci log (`docs/01-decision-list.md`) — pokud se meni kontrakt

### Zmena autentizace / konfigurace / env
- Dokumentace nastaveni (prislusny README)
- Control tower (`docs/09-project-control-tower.md`)

### Zmena CRM workflow
- Systemova dokumentace CRM (`docs/CRM-SYSTEM-MAP.md`)
- Rozhodovaci log (`docs/01-decision-list.md`)
- Testy

### Presun/prejmenovani souboru
- Mapa projektu (`docs/00-project-map.md`)
- Inventar slozek (`docs/00-folder-inventory.md`)
- Zaznam zmen (`docs/11-change-log.md`)

### Zmena zdroje pravdy
- Control tower (`docs/09-project-control-tower.md`)
- Tento dokument (governance)

### Oprava chyby
- Registr chyb (`docs/06-bug-registry.md`)
- Zaznam zmen (`docs/11-change-log.md`)
- Reference na test

### Uzavreni auditniho nalezu
- Control tower (`docs/09-project-control-tower.md`)
