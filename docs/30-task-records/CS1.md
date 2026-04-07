# Task Record: CS1

## Metadata

| Pole | Hodnota |
|------|---------|
| **Task ID** | CS1 |
| **Title** | Definovat end-to-end lifecycle leadu jako state machine |
| **Owner** | Claude |
| **Status** | done |
| **Date** | 2026-04-05 |
| **Stream** | C |

## Scope

Definice jedineho kanonicky lifecycle stavu (`lifecycle_state`) pro kazdy lead v systemu. Pokryva cestu od importu az po reakci leadu (REPLIED/BOUNCED/UNSUBSCRIBED) nebo diskvalifikaci. WON/LOST jsou downstream sales outcome mimo scope CS1. Specifikace — ne implementace.

## Code Changes

| Soubor | Typ zmeny | Popis |
|--------|-----------|-------|
| *(zadne code changes)* | — | Toto je architekturni/specifikacni task, ne implementace |

## Docs Updated

| Dokument | Typ zmeny | Proc |
|----------|-----------|------|
| docs/21-business-process.md | modified | Pridana kompletni lifecycle state machine specifikace (10 sekci) |
| docs/23-data-model.md | modified | Pridana poznamka o canonical lifecycle a auxiliary roli existujicich state machines |
| docs/20-current-state.md | modified | Zminka o existenci lifecycle specifikace |

## Contracts Changed

Navrzeny novy kontrakt: `lifecycle_state` jako jediny kanonicky stav leadu. Existujici `lead_stage`, `preview_stage`, `outreach_stage` se stanou auxiliary. Schema migrace neni soucasti tohoto tasku.

## Tests

| Test | Vysledek |
|------|----------|
| tsc --noEmit | N/A (no code changes) |
| npm run build | N/A (no code changes) |
| check-doc-sync | OK (43 pass / 0 fail) |

## Output for Audit

Autoritativni specifikace v docs/21-business-process.md obsahujici:
- 18 canonical lifecycle stavu s popisem, vrstvou, terminal/review oznacenim
- 24 povolenych prechodu s podminkami
- 4 terminal stavy (DISQUALIFIED, REPLIED, BOUNCED, UNSUBSCRIBED)
- 3 review stavy (REVIEW_REQUIRED, PREVIEW_READY_FOR_REVIEW, FAILED)
- 3 validni pruchody, 2 nevalidni prechody
- Derivacni pravidla pro prechodne obdobi s explicitnimi omezenimi
- Mapping existujicich stavu na lifecycle + downstream WON/LOST mimo scope

## Known Limits

- Ingest sub-stavy (RAW_IMPORTED, NORMALIZED, DEDUPED, WEB_CHECKED) nelze v aktualnim systemu rozlisit — vsechny jsou lead_stage=NEW.
- EMAIL_QUEUED a UNSUBSCRIBED jsou nove stavy bez implementace v aktualnim kodu.
- Derivacni pravidla pro prechodne obdobi jsou specifikace, ne implementovany kod.

## Next Dependency

CS2 (Workflow orchestrator design) zavisi na teto state machine.
CS3 (Idempotency & retry pravidla) zavisi na FAILED stavu a retry semantice.
