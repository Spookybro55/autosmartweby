# Task Record: {TASK_ID}

## Metadata

| Pole | Hodnota |
|------|---------|
| **Task ID** | {TASK_ID} |
| **Title** | {TITLE} |
| **Owner** | {OWNER} |
| **Status** | draft / in-progress / code-complete / ready-for-deploy / done / blocked / cancelled |
| **Date** | {DATE} |
| **Stream** | A / B / C |
| **Agent Role** | human / tech-lead / bug-hunter / security-engineer / qa-engineer / docs-guardian |
| **Track** | A / B / - |
| **Plan** | {plan-id-or-dash} |
| **Autonomous run** | yes / no / partial |

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

## DoD Checklist

> Required for agent-driven tasks (Track A or Track B with `Agent Role` ≠ `human`). Optional for human tasks.

### Code Done

- [ ] `npx tsc --noEmit` (frontend, if touched): OK
- [ ] `npm run build` (frontend, if touched): OK
- [ ] No secrets in diff
- [ ] No regressions in existing tests

### Documentation Done

- [ ] Affected docs identified per `docs/13-doc-update-rules.md` stream mapping
- [ ] Affected docs updated
- [ ] `docs/11-change-log.md` regenerated (build-changelog.mjs)
- [ ] `docs/29-task-registry.md` regenerated (build-task-registry.mjs)
- [ ] Control tower (`docs/09-project-control-tower.md`) checked
- [ ] Route mapa (`docs/12-route-and-surface-map.md`) checked, if relevant

### Test Done

- [ ] Tests pass (or N/A — explain in Tests table above)
- [ ] `npm run build` verified
- [ ] `node scripts/docs/check-doc-sync.mjs`: 0 fail

### Agent Done (Track A only)

- [ ] Diff size < 500 LOC (Track A hard limit) OR `[size-override]` with owner approval (Track B)
- [ ] Secret scan clean (gitleaks-style mental review of diff)
- [ ] Self-review pass (re-read diff with fresh eyes, found 0 issues)
- [ ] Cross-role review pass (Tech Lead read whole diff before PR)
- [ ] `docs/agents/QUEUE.md` updated (task removed if completed)
- [ ] `docs/agents/RUN-LOG.md` appended with `complete` step
