# Pravidla aktualizace dokumentace

Tento dokument definuje presna pravidla typu spoustec → akce pro aktualizaci dokumentace.

## Tabulka spoustecu a pozadovanych aktualizaci

| Spoustec | Povinne aktualizace dokumentace | Volitelne |
|----------|-------------------------------|-----------|
| Novy/smazany soubor | zaznam zmen, mapa projektu (pokud strukturalni zmena) | control tower |
| Prejmenovani/presun souboru | zaznam zmen, mapa projektu, inventar slozek | README pokud je cesta referencovana |
| Nova routa | mapa rout, zaznam zmen, testovaci plan | control tower |
| Zmena routy | mapa rout, zaznam zmen, testovaci plan | rozhodovaci log pokud zmena kontraktu |
| Novy API povrch | mapa rout, zaznam zmen, testovaci plan | control tower |
| Zmena API kontraktu | mapa rout, zaznam zmen, testovaci plan, rozhodovaci log | control tower |
| Zmena autentizace | dokumentace nastaveni, zaznam zmen, control tower | testovaci plan |
| Zmena env/konfigurace | dokumentace nastaveni (README), zaznam zmen | control tower |
| Zmena CRM workflow | systemova dokumentace CRM, zaznam zmen, rozhodovaci log | testovaci plan |
| Zmena logiky Apps Script | apps-script/README pokud se meni chovani, zaznam zmen | control tower |
| Zmena zdroje pravdy | control tower, governance dokumenty, zaznam zmen | - |
| Oprava chyby | registr chyb, zaznam zmen, reference na test | control tower |
| Uzavreni auditniho nalezu | control tower, zaznam zmen | anotace v auditnim dokumentu |
| Cisteni se strukturalnim dopadem | zaznam zmen, mapa projektu | control tower |

## Povinne referencovane dokumenty

- **Zaznam zmen**: `docs/11-change-log.md`
- **Mapa projektu**: `docs/00-project-map.md`
- **Inventar slozek**: `docs/00-folder-inventory.md`
- **Mapa rout**: `docs/12-route-and-surface-map.md`
- **Testovaci plan**: `docs/07-test-plan.md` *(existuje v web-starter repo, ne v tomto monorepu)*
- **Rozhodovaci log**: `docs/01-decision-list.md`
- **Control tower**: `docs/09-project-control-tower.md`
- **Governance**: `docs/10-documentation-governance.md`
- **Registr chyb**: `docs/06-bug-registry.md` *(existuje v web-starter repo, ne v tomto monorepu)*
- **Systemova dokumentace CRM**: `docs/CRM-SYSTEM-MAP.md`

## Kontrolni seznam na konci ukolu

Po dokonceni kazdeho ukolu je nutne vyplnit nasledujici seznam:

```
## Kontrolni seznam na konci ukolu
- [ ] zmenene soubory: (seznam)
- [ ] zmenene dokumenty: (seznam)
- [ ] zaznam zmen aktualizovan: ano/ne
- [ ] synchronizace dokumentace dokoncena: ano/ne
- [ ] zbyvajici otevrene polozky: (seznam)
```

Tento seznam musi byt pripojen ke kazde odpovedi, ktera obsahuje zmeny v kodu nebo dokumentaci.
