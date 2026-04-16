# Task Record: CS3

## Metadata

| Pole | Hodnota |
|------|---------|
| **Task ID** | CS3 |
| **Title** | Definovat idempotency keys, retry politiku a dead-letter handling |
| **Owner** | Claude |
| **Status** | done |
| **Date** | 2026-04-05 |
| **Stream** | C |

## Scope

Reliability vrstva nad CS2 orchestratorem. Definuje idempotency key pro kazdy automaticky krok, retry matici (transient/permanent/ambiguous failures, max_attempts, backoff), dead-letter handling v dedickovany `_asw_dead_letters` sheet (append-only, separatni od `_asw_logs` run history), locking pravidla pro LockService. Specifikace — ne implementace.

## Code Changes

| Soubor | Typ zmeny | Popis |
|--------|-----------|-------|
| *(zadne code changes)* | — | Architekturni/specifikacni task |

## Docs Updated

| Dokument | Typ zmeny | Proc |
|----------|-----------|------|
| docs/24-automation-workflows.md | modified | Pridana kompletni CS3 reliability specifikace (10 sekci) |
| docs/20-current-state.md | modified | Zminka o existenci CS3 specifikace |

## Contracts Changed

Navrzeny kontrakty:
- Idempotency tabulka: 12 kroku, kazdy s explicitnim idempotency_mode (state-guard-only / formal_key), guard/key formula, duplicate detection point, duplicate outcome
- `_asw_dead_letters` sheet: novy dedickovany append-only sheet s 16 flat sloupci, nikdy pruneable, source of truth pro dead-letter zaznamy
- Retry matice: 27 radku pokryvajicich 12 kroku × 4 failure classes, 100% coverage
- Lock pravidlo: processPreviewQueue vyzaduje ScriptLock (identifikovana mezera)

## Tests

| Test | Vysledek |
|------|----------|
| tsc --noEmit | N/A (no code changes) |
| npm run build | N/A (no code changes) |
| check-doc-sync | OK (43 pass / 0 fail) |

## Output for Audit

Autoritativni reliability specifikace v docs/24-automation-workflows.md obsahujici:
- 8 reliability principu vcetne "run_id != idempotency key" a "lock nenahrazuje idempotency"
- 12 kroku v katalogu (9 current, 3 target) s trigger_source, subject_type, side_effect_type
- Idempotency key tabulka: 12 kroku, rozliseni state-guard-only vs formalni key
- Retry matice: 27 radku pokryvajicich 4 failure classes pro 12 kroku (100% coverage)
- Dead-letter design: dedickovany `_asw_dead_letters` sheet (append-only, nikdy pruneable) s 16 flat sloupci
- Lock pravidla: 3 kroky s existujicim/pozadovanym lockem, identifikovana mezera (processPreviewQueue)
- 3 fail scenare: preview generation PERMANENT, email send AMBIGUOUS, mailbox sync TRANSIENT
- Sample dead-letter radek s kompletnim JSON payloadem

## Known Limits

- Retry count tracking z _asw_logs vyzaduje JSON parsing v Apps Script — neni efektivni pro velke logy. Pri implementaci zvazit runtime cache.
- Dead-letter resolution_status update neni automatizovany — operator musi rucne editovat _asw_dead_letters sheet.
- max_attempts enforcement pro processPreviewQueue vyzaduje implementacni task (pridat retry_count check do smycky).
- Per-lead lock neni v Apps Script mozny (LockService nema named locks) — ScriptLock je global a blokuje i neprekryvajici se operace.
- _asw_dead_letters sheet musi byt vytvoren implementacni taskem (analogicky k ensureLogSheet_ pattern).

## Next Dependency

C-04 (Sendability gate) muze vyuzit idempotency key design pro send_email.
C-05 (Outbound queue) prebira retry matici pro process_email_queue.
C-06 (Provider abstraction) mapuje provider-specific errory na failure classes z CS3.
C-09 (Exception queue) formalizuje operator workflow pro dead-letter resolution.
