# Claude Code Configuration — Autosmartweby

## Source of Truth

- **Tento repo (GitHub) je jediny source of truth.**
- Apps Script editor NENI source of truth — clasp push se dela az z integrovaneho stavu po merge do main.
- Google Sheets je runtime source of truth pro data; tento repo je source of truth pro kod a dokumentaci.

## Tym a workflow

3 lide pracuji paralelne, kazdy na vlastni branch. Pravidla:

- `main` je chranena branch — direct push zakazan
- zmeny jdou do `main` pouze pres Pull Request
- kazdy PR musi projit status checkem `docs-governance`
- kazdy PR musi byt schvalen minimalne 1 reviewerem

## Branch naming

```
task/<TASK_ID>-<short-name>
```

Priklady: `task/A3-serper-retry`, `task/B2-auth-phase1`, `task/C4-priority-logic`

Streamy:
- **A** = Data & Automation
- **B** = Infrastructure & Offer
- **C** = Business Process & Prioritization

## Co kazdy task MUSI dodat

1. **Code changes** (pokud je to code task)
2. **Task record** v `docs/30-task-records/{TASK_ID}.md`
3. **Kanonicke docs** podle stream mapy (viz nize)
4. **Regenerovane generated files:**
   ```bash
   node scripts/docs/build-changelog.mjs
   node scripts/docs/build-task-registry.mjs
   ```
5. **Validace:**
   ```bash
   node scripts/docs/check-doc-sync.mjs
   ```

## Task-Doc Mapa (povinne mapovani)

| Stream | Nazev | Povinne docs |
|--------|-------|-------------|
| **A** | Data & Automation | docs/20, docs/23, docs/24 |
| **B** | Infrastructure & Offer | docs/20, docs/22, docs/26, docs/27 |
| **C** | Business Process & Prioritization | docs/20, docs/21, docs/24, docs/25 |

Vzdy povinne bez ohledu na stream:
- Task record v `docs/30-task-records/`
- Regenerovane: `docs/11-change-log.md`, `docs/29-task-registry.md`

Dalsi docs podle typu zmeny:
- Nova/zmenena routa → `docs/12-route-and-surface-map.md`
- Zmena API kontraktu → `docs/12`, `docs/01-decision-list.md`
- Zmena auth/env/config → `docs/22`, `docs/27`
- Nove riziko → `docs/28-risks-bottlenecks-scaling.md`

## Zakazy

- **Necommituj secrets** (.env, API keys, hesla)
- **Needituj archive docs** (`docs/archive/`) pokud task neni explicitne archivni
- **Needituj cizi task records** — kazdy task = jiny soubor
- **Nerucne edituj generated files** (`docs/11-change-log.md`, `docs/29-task-registry.md`) — regeneruji se skriptem
- **Nepushuj do main primo** — vzdy pres PR
- **Nepushuj do Apps Scriptu z feature branche** — az po merge do main

## Povinny vystup na konci kazdeho tasku

```
- files changed: (seznam)
- docs changed: (seznam)
- why these docs: (kratke zduvodneni)
- changelog updated: yes/no
- documentation sync complete: yes/no
- remaining open items: (seznam nebo "none")
```

Pokud `changelog updated: no` nebo `documentation sync complete: no`, oprav to PRED ukoncenim odpovedi.

## Definition of Done

Tri nezavisle checklisty (viz `docs/14-definition-of-done.md`):
1. **Code done:** tsc OK, build OK, no secrets
2. **Documentation done:** affected docs updated, changelog entry added
3. **Test done:** tests pass (if applicable), build verified

Vsechny tri musi byt splneny.

## Build & Scripts

```bash
# Regeneruj changelog z task records
npm run docs:build-changelog

# Regeneruj task registry z task records
npm run docs:build-task-registry

# Validuj dokumentacni sync
npm run docs:check

# Vytvor novy task record
npm run docs:new-task -- <TASK_ID> "<TITLE>"
```

## Apps Script deployment

Az po merge do main:
```bash
cd apps-script
# Prepni .clasp.json scriptId na PROD
clasp push
# Vrat scriptId zpet na TEST
```

## Struktura dokumentace

```
docs/
  01-decision-list.md          # Owner decisions
  09-project-control-tower.md  # Master ridici dokument
  10-documentation-governance.md
  11-change-log.md             # GENERATED — needituj rucne
  12-route-and-surface-map.md
  13-doc-update-rules.md       # Task-doc mapa a pravidla
  14-definition-of-done.md
  20-current-state.md          # Kanonicka vrstva 20-29
  21-business-process.md
  22-technical-architecture.md
  23-data-model.md
  24-automation-workflows.md
  25-lead-prioritization.md
  26-offer-generation.md
  27-infrastructure-storage.md
  28-risks-bottlenecks-scaling.md
  29-task-registry.md          # GENERATED — needituj rucne
  30-task-records/             # Task records (1 soubor per task)
  archive/                     # Archivni/reference docs — needituj
```
