# Claude Code Configuration — Autosmartweby

## Project boundary (POVINNE CIST)

Projekt Autosmartweby ma **dva oddelene repozitare**:

| Repo | URL | Co resi |
|------|-----|---------|
| **Spookybro55/autosmartweby** (tento repo) | https://github.com/Spookybro55/autosmartweby | Interni system: CRM, Apps Script, Google Sheets backend, lead pipeline, preview renderer, template pipeline, outbound / automation specifikace, governance docs |
| **Spookybro55/ASW-MARKETING-WEB** (extern) | https://github.com/Spookybro55/ASW-MARKETING-WEB | Verejny marketingovy web `https://autosmartweb.cz/`, Web Starter nabidka, kontaktni formular, landing pages, inbound / duveryhodnost |

**Pravidla pro audity, dokumentaci a Claude Code prompty:**

- `crm-frontend/` v tomto repu **NENI** verejny web firmy. Je to interni CRM Next.js aplikace.
- Preview renderer (`crm-frontend/src/app/preview/[slug]/`) **NENI** `autosmartweb.cz`. Je to interni renderovaci vrstva preview landingu pro outreach k jednotlivym leadum.
- Pri auditu tohoto repa se **verejny web NESMI** oznacovat jako "missing feature" / "not deployed" / "P0 blocker" — patri do externiho repa.
- Pri auditu verejneho webu se pracuje proti repu **Spookybro55/ASW-MARKETING-WEB** nebo proti live URL `https://autosmartweb.cz/`.
- Status verejneho webu z pohledu tohoto repa = **external dependency / external public site (LIVE)**.

## Source of Truth

- **Tento repo (GitHub) je jediny source of truth pro interni system** (CRM + Apps Script + automation).
- Apps Script editor NENI source of truth — clasp push se dela az z integrovaneho stavu po merge do main.
- Google Sheets je runtime source of truth pro data; tento repo je source of truth pro kod a dokumentaci interniho systemu.
- Verejny web `autosmartweb.cz` ma vlastni source of truth v repu **Spookybro55/ASW-MARKETING-WEB** — NEresi se zde.

## Tym a workflow

3 lide pracuji paralelne, kazdy na vlastni branch. Pravidla:

- `main` je chranena branch — direct push zakazan
- zmeny jdou do `main` pouze pres Pull Request
- kazdy PR musi projit status checkem `docs-governance`
- kazdy PR musi byt schvalen minimalne 1 reviewerem

## AI Agent Team (Phase 1+)

Tento repo provozuje **AI agent tým** pod ownerem Sebastiánem. Detail: `docs/agents/README.md`.

- **Single entry point:** `claude` v terminálu, příkazy "vezmi další task z queue" (Track A — autonomous bug fix) nebo "exekutuj aktivní plány" (Track B — plan-driven feature).
- **5 agent rolí** (`docs/agents/roles/*.md`): Tech Lead (default), Bug Hunter, Security Engineer, QA Engineer, Docs Guardian. Sebastián NEVOLÁ role přímo — Tech Lead je single point of dispatch.
- **Knowledge base:** `docs/agents/` Obsidian-compatible vault (PATTERNS.md, GOTCHAS.md, REGRESSION-LOG.md, DECISIONS.md, QUEUE.md, RUN-LOG.md, QUESTIONS-FOR-HUMAN.md, plans/).
- **Stream ⊥ Track:** Stream A/B/C je doménová klasifikace pro doc-mapping (per `docs/13`). Track A/B je workflow mode (autonomous vs plan-driven). Každý agent task má **OBĚ pole** v task record.
- **Reálné audit prefixy:** SEC, FF, DOC, BLD, DP, IN, AS, DM, FE, CC-NEW/OPS/SEC/QA. **`BUG-` prefix v repu NEEXISTUJE** — FF-* je equivalent pro functional findings.
- **Diff size policy:** Track A hard limit 500 LOC. Track B no limit (plán definuje phase scope). Bypass `[size-override]` v PR body jen pro Track B nebo s explicit owner approval.

Kompletní architektura: `docs/agents/ARCHITECTURE.md`.
Discovery audit (locked, frozen): `docs/agents/_discovery-report.md`.

## Branch naming

```
task/<TASK_ID>-<short-name>             # human-driven, existing convention
agent/<role>/<task-id-or-finding-id>    # agent-driven, Phase 1+
```

Priklady: `task/A3-serper-retry`, `task/B2-auth-phase1`, `task/C4-priority-logic`,
`agent/bug-hunter/FF-020`, `agent/security-engineer/SEC-013`, `agent/docs-guardian/DOC-019`.

Streamy:
- **A** = Data & Automation
- **B** = Infrastructure & Offer
- **C** = Business Process & Prioritization

## Co kazdy task MUSI dodat

1. **Code changes** (pokud je to code task)
2. **Task record** v `docs/30-task-records/{TASK_ID}.md` — ocekavane u kazdeho tasku; CI to nevynucuje jako blocker, ale absence task recordu je process violation. Agent records mají navíc `Agent Role`, `Track`, `Plan`, `Autonomous run` metadata fields + `## DoD Checklist` sekci (viz `docs/30-task-records/_template.md`).
3. **Kanonicke docs** podle stream mapy (viz nize)
4. **Regenerovane generated files** (CI toto vynucuje — PR failne, pokud nejsou aktualni):
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

- **Necommituj secrets** (.env, API keys, hesla, sheet IDs > 20 znaků v plain textu)
- **Needituj archive docs** (`docs/archive/`) pokud task neni explicitne archivni
- **Needituj cizi task records** — kazdy task = jiny soubor
- **Nerucne edituj generated files** (`docs/11-change-log.md`, `docs/29-task-registry.md`) — regeneruji se skriptem
- **Nepushuj do main primo** — vzdy pres PR
- **Nepushuj do Apps Scriptu z feature branche** — az po merge do main

### Agent-specific zákazy (over and above human-task zákazy)

- **NIKDY** edituj `apps-script/.clasp.json` — clasp swap risk (TEST↔PROD), viz `docs/agents/GOTCHAS.md` GOTCHA-001 + finding DP-003.
- **NIKDY** spouštěj `clasp deploy` — jen Sebastián a jen po merge do main (viz "Apps Script deployment" níže).
- **NIKDY** modifikuj Apps Script Script Properties (out-of-band runtime config; agent nesmí).
- **NIKDY** edituj `docs/agents/_discovery-report.md` (locked Phase 0 audit output).
- **NIKDY** edituj `## Auto-generated` sekce v `docs/agents/PATTERNS.md` / `GOTCHAS.md` / `REGRESSION-LOG.md` ručně — to je doména learning loop (Phase 3 Make scenario).
- **NIKDY** přepisuj task records jiných agentů.
- **NIKDY** používej `git --no-verify`, `git push --force` na `main`, `git reset --hard` bez explicit human approval.

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

Ctyri nezavisle checklisty (viz `docs/14-definition-of-done.md`):
1. **Code done:** tsc OK, build OK, no secrets
2. **Documentation done:** affected docs updated, changelog entry added
3. **Test done:** tests pass (if applicable), build verified
4. **Agent done** (Track A only): diff < 500 LOC, secret scan clean, self-review pass, cross-role review pass, QUEUE.md updated, RUN-LOG.md appended

Code/Doc/Test musí být splněny **vždy**. Agent done se aplikuje jen pro autonomous Track A runs.

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

**Tohle dělá Sebastián ručně, ne agent.** Agent NIKDY needituje `.clasp.json`.

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
  agents/                      # AI Agent Team vault (Phase 1+) — Obsidian-compatible
    README.md                  # Entry point
    ARCHITECTURE.md            # Tracks, roles, guardrails
    PATTERNS.md                # Auto-appended (learning loop, Phase 3)
    GOTCHAS.md                 # Auto-appended + 3 seed entries
    REGRESSION-LOG.md          # Auto-appended
    DECISIONS.md               # ADRs
    PLAYBOOKS.md               # Manual recipes
    QUEUE.md                   # Track A queue
    QUESTIONS-FOR-HUMAN.md     # Escalation log
    RUN-LOG.md                 # Append-only run history
    SETUP-CHECKLIST.md         # Manual prerequisites for Phase 3
    _discovery-report.md       # LOCKED — Phase 0 audit output
    roles/                     # SKILL files per role
    plans/                     # Track B plans (ACTIVE / COMPLETED / BACKLOG)
  archive/                     # Archivni/reference docs — needituj
```
