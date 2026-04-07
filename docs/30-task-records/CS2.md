# Task Record: CS2

## Metadata

| Pole | Hodnota |
|------|---------|
| **Task ID** | CS2 |
| **Title** | Navrhnout workflow orchestrator — co spousti co po zmene stavu leadu |
| **Owner** | Claude |
| **Status** | done |
| **Date** | 2026-04-05 |
| **Stream** | C |

## Scope

Logicka orchestracni vrstva nad CS1 lifecycle. Definuje co se stane po kazde zmene lifecycle_state, formalni workflow step kontrakt, event katalog, run history design a orchestration model (hybrid: poll + manual + reactive). Specifikace — ne implementace.

## Code Changes

| Soubor | Typ zmeny | Popis |
|--------|-----------|-------|
| *(zadne code changes)* | — | Architekturni/specifikacni task |

## Docs Updated

| Dokument | Typ zmeny | Proc |
|----------|-----------|------|
| docs/24-automation-workflows.md | modified | Pridana kompletni orchestrator specifikace (10 sekci) |
| docs/20-current-state.md | modified | Zminka o existenci orchestrator specifikace |

## Contracts Changed

Navrzeny workflow step kontrakt (step_name, trigger_in, preconditions, action, success/failure_output, write_targets, retry_eligibility, observability). 17 eventu v katalogu. Run history rozsireni _asw_logs payload.

## Tests

| Test | Vysledek |
|------|----------|
| tsc --noEmit | N/A (no code changes) |
| npm run build | N/A (no code changes) |
| check-doc-sync | OK (43 pass / 0 fail) |

## Output for Audit

Autoritativni orchestrator specifikace v docs/24-automation-workflows.md obsahujici:
- Orchestration model decision: hybrid (poll + manual + reactive) s zduvodnenim
- 17 eventu v katalogu s trigger type, payload subject, next action, idempotency
- Formalni workflow step kontrakt s 4 konkretnmi priklady (qualify, brief, send, detect_reply)
- Run history design rozsirujici existujici _asw_logs
- Sample event payload (JSON)
- Sample orchestration run (4 kroky od importu po BRIEF_READY vcetne fail scenare)
- Flow diagram (ASCII)
- Mapping current vs target s 7 mezerami/nesoulady

## Known Limits

- Ingest pipeline (RAW_IMPORTED→DEDUPED) dosud neexistuje — orchestrator spec je pro budouci stav.
- Webhook callback (PREVIEW_GENERATING→PREVIEW_APPROVED) neni testovany v produkci.
- Event payloady jsou specifikace, ne implementovany kod.
- Run ID korelace v _asw_logs neni dosud implementovana.


## Next Dependency

CS3 (Idempotency & retry) zavisi na step kontraktu a retry_eligibility definici.
C-05 (Outbound queue) zavisi na EMAIL_QUEUED specifikaci.
C-09 (Exception queue) zavisi na FAILED resolution paths.
