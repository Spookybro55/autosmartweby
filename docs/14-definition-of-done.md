# Definice hotoveho (Definition of Done)

Tento dokument definuje podminky, ktere musi byt splneny, aby byla zmena povazovana za dokoncenu.

Zmena je HOTOVA az kdyz jsou splneny vsechny tri oblasti: Code Done + Documentation Done + Test Done.

---

## 1. Code Done

| # | Podminka | Jak overit |
|---|---------|------------|
| C1 | Kod se zkompiluje | `tsc --noEmit` bez chyb |
| C2 | Build uspesny | `npm run build` bez chyb |
| C3 | Zadne tajne udaje | zadne API klice, hesla, tokeny, .env soubory v kodu |
| C4 | Zadne regrese | existujici funkcionalita nerozbita |

## 2. Documentation Done

| # | Podminka | Jak overit |
|---|---------|------------|
| D1 | Dotcene dokumenty identifikovany | viz `docs/13-doc-update-rules.md` |
| D2 | Dotcene dokumenty aktualizovany | rucni kontrola |
| D3 | Changelog zaznam pridan | novy radek v `docs/11-change-log.md` |
| D4 | Control tower zkontrolovan | `docs/09-project-control-tower.md` — ovlivnuje zmena sledovane polozky? |
| D5 | Route mapa zkontrolovana | `docs/12-route-and-surface-map.md` — pokud se menily routy/API |
| D6 | README v dotcene slozce | aktualizovan pokud se menilo chovani komponenty |

## 3. Test Done

| # | Podminka | Jak overit |
|---|---------|------------|
| T1 | Testy prochazi | `npm test` nebo rucni overeni |
| T2 | Build verified | `npm run build` uspesne dokoncen |
| T3 | Validace dokumentace | `node scripts/check-doc-sync.mjs` — 0 fail |

---

## Completion Contract

Ukol NENI hotovy, dokud:
- changelog NEMA novy zaznam o zmene
- dokumentacni sync NENI dokoncen
- povinny vystup na konci ukolu NENI vypsan

Povinny vystup na konci KAZDEHO ukolu:

```
- files changed: (seznam)
- docs changed: (seznam)
- why these docs: (kratke zduvodneni)
- changelog updated: yes/no
- documentation sync complete: yes/no
- remaining open items: (seznam nebo "none")
```

Pokud je `changelog updated: no` nebo `documentation sync complete: no`, je NUTNE to opravit PRED ukoncenim odpovedi.

---

## Zkraceny kontrolni seznam

```
## Code Done
- [ ] tsc --noEmit: OK
- [ ] npm run build: OK
- [ ] zadne secrets: overeno

## Documentation Done
- [ ] dotcene docs identifikovany a aktualizovany
- [ ] changelog: aktualizovan
- [ ] control tower: zkontrolovan
- [ ] route mapa: zkontrolovana / nerelevantni

## Test Done
- [ ] testy: OK / nerelevantni
- [ ] build: verified
- [ ] node scripts/check-doc-sync.mjs: 0 fail
```
