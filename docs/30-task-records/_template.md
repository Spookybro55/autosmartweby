# Task Record: {TASK_ID}

## Metadata

| Pole | Hodnota |
|------|---------|
| **Task ID** | {TASK_ID} |
| **Title** | {TITLE} |
| **Owner** | {OWNER} |
| **Status** | draft / in-progress / done / blocked |
| **Date** | {DATE} |
| **Stream** | A / B / C |

## Scope

{Strucny popis co task resi a proc.}

## Code Changes

| Soubor | Typ zmeny | Popis |
|--------|-----------|-------|
| {cesta} | new / modified / deleted | {co se zmenilo} |

## Docs Updated

| Dokument | Typ zmeny | Proc |
|----------|-----------|------|
| docs/20-current-state.md | modified | {duvod} |

## Contracts Changed

{Zmenily se API kontrakty, datovy model, state machines? Pokud ano, jake.}
{Pokud ne: "Zadne."}

## Tests

| Test | Vysledek |
|------|----------|
| tsc --noEmit | OK / FAIL |
| npm run build | OK / FAIL |
| check-doc-sync | OK / FAIL |

## Output for Audit

{Co presne je vysledkem tohoto tasku? Meritelny vystup.}

## Known Limits

{Co tento task NERESI? Jake jsou zname omezeni?}

## Next Dependency

{Na co navazuje dalsi task? Co je blokovano timto taskem?}
