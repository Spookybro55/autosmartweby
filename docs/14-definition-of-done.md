# Definice hotoveho (Definition of Done)

Tento dokument definuje podminky, ktere musi byt splneny, aby byla zmena povazovana za dokoncenu.

**Pro human-driven tasky:** zmena je HOTOVA kdyz jsou splneny vsechny tri oblasti: Code Done + Documentation Done + Test Done.

**Pro agent-driven tasky (Track A autonomous):** zmena je HOTOVA kdyz jsou splneny VSECHNY CTYRI oblasti: Code Done + Documentation Done + Test Done + **Agent Done** (sekce 4 niže). Pro Track B plan-driven tasky se Agent Done aplikuje primerene (diff size limit neplati, ale ostatni body ano).

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
| T3 | Validace dokumentace | `node scripts/docs/check-doc-sync.mjs` — 0 fail |

## 4. Agent Done (jen pro Track A autonomous runs; Track B partially)

> Pridano v Phase 1 agent team setup (master plan §4 amendment).
> Discovery report Sekce 8 #5 (DoD harmonizace).

| # | Podminka | Jak overit |
|---|---------|------------|
| A1 | Diff size limit | Track A: <500 LOC. Track B: no limit (plan defines phase scope). |
| A2 | Secret scan clean | Mental scan diff for API keys, tokens, sheet IDs >20 znakù v plain textu, hesla, private keys. (Phase 2 CI: gitleaks). |
| A3 | Self-review pass | Agent re-read whole diff with fresh eyes, found 0 issues. Append `self-review` OK do `docs/agents/RUN-LOG.md`. |
| A4 | Cross-role review pass | Tech Lead role re-read diff before PR open. Append `cross-review` OK do RUN-LOG. |
| A5 | QUEUE.md updated | If Track A task: removed from `docs/agents/QUEUE.md`. If Track B: checkbox ticked in active plán. |
| A6 | RUN-LOG.md appended | `complete` step appended s task-id + timestamp. |
| A7 | No `.clasp.json` change | Diff does NOT touch `apps-script/.clasp.json`. |
| A8 | No `.env*` change | Diff does NOT touch `.env`, `.env.local`, etc. (`.env.example` OK pri legitimní env-doc update). |
| A9 | No `docs/archive/` change | Diff does NOT touch `docs/archive/*`. |
| A10 | Branch convention | Branch name matches `agent/{role}/{task-id-or-finding-id}` (Track A) NEBO `task/{TASK_ID}-{name}` (Track B can use either). |

Agent done se aplikuje **navic** k Code/Doc/Test, ne jako náhrada.

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
