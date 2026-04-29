# Agent Team Architecture

> **Verze:** 1.0 (Phase 1)
> **Datum:** 2026-04-29
> **Reference:** `~/agent-team-setup-files/03-master-plan.md` v1.0; `docs/agents/_discovery-report.md`
> **Audience:** Sebastián (owner) a každý agent role SKILL při startu sezení.

Tento dokument je **kanonický** pro architekturu agent týmu v projektu Autosmartweby.
Master plan v1.0 je referenční zdroj; tento dokument je jeho projekce do reality
tohoto repa s 8 architectural amendments z discovery reportu Sekce 8.

---

## 1. Co tato architektura JE a NENÍ

### Je to:
- **Jeden Claude Code session** (lokální `claude` v terminálu) přepínající mezi 5
  rolemi tím, že načítá různé `roles/*.md` SKILL files jako system prompt context.
- **File-based knowledge base** (`docs/agents/*` Obsidian vault). Žádná databáze.
  Žádný daemon. Žádný agent runtime. Jen markdown + git + Make orchestrace.
- **Plan-driven (Track B) pro features + autonomous (Track A) pro audit findings.**
- **Existing governance discipline** (CLAUDE.md, docs/13, docs/14, branch
  protection, audit findings, task records) — agent system **se napojuje**, ne
  přepisuje.

### Není to:
- Multi-process multi-agent framework (CrewAI / AutoGen / agentic-flow swarm).
- Fine-tuned model. Agenti se "učí" přes append-only learning loop, ne změnou vah.
- Substituce za engineering judgment. Velká rozhodnutí (architecture, business,
  legal) si Sebastián řeší sám.
- 24/7 fully autonomous. Vyžaduje review PRs od Sebastiána.

---

## 2. Tracks (workflow modes)

```
TRACK A — Bug fixing / Audit findings (AUTONOMOUS)
==================================================
Vstup:    docs/audits/FINDINGS.md (P2/některé P1) → docs/agents/QUEUE.md
Trigger:  `claude` v terminálu, "vezmi další task z queue"
Workflow: Tech Lead vezme top priority unblocked task → klasifikuje (Stream + 
          finding type) → načte odpovídající role SKILL → vyřeší → self-review →
          docs-guardian update → otevře PR (nikdy přímý push do main)
Hard limit: 500 LOC diff. Větší → block + escalate do QUESTIONS-FOR-HUMAN.md.
Sebastián: review + merge. Žádný hands-on coding.

TRACK B — Vývoj feature (PLAN-DRIVEN, AUTONOMOUS EXECUTION)
==========================================================
Vstup:    Plán v docs/agents/plans/ACTIVE/{plan-id}.md (Sebastián autoroval s
          Claude přes chat / Claude Code conversation, schválil "go").
Trigger:  `claude` v terminálu, "exekutuj aktivní plány"
Workflow: Tech Lead čte ACTIVE plány → najde další unchecked task s vyřešenými
          dependencies → exekuce jako Track A (kroky 4-9) → check checkbox v
          plánu po PR merge → další task. 100% done → plán do COMPLETED/.
Hard limit: žádný (plán definuje phase scope = 1 PR).
Sebastián: tvorba plánů + review PRs.
```

### Klíčový amendment z discovery Sekce 8 #1: **Stream ⊥ Track**

> **Stream** je doménová klasifikace pro doc-mapping (per `docs/13-doc-update-rules.md`).
>   Stream A = Data & Automation, Stream B = Infrastructure & Offer, Stream C =
>   Business Process & Prioritization.
>
> **Track** je workflow mode (per master plan §3.1). Track A = autonomous bug fix.
>   Track B = plan-driven feature.
>
> **Jsou to ortogonální axes.** Každý task má **OBĚ pole** v task record:
>   - SEC-013 fix = Stream B (auth/infra → docs/22, docs/27) + Track A (autonomous)
>   - A-11 scrape feature = Stream A (data → docs/20, 23, 24) + Track B (plan-driven)
>   - DOC-019 ROLLBACK.md create = Stream B (infra) + Track A
>
> Bez tohoto rozlišení agent klasifikuje špatně. Tech Lead role SKILL má
> classification table.

---

## 3. Agent role (5 rolí, ne 5 oddělených agentů)

V Claude Code je vždy **jedna session** = **jeden Claude**. "Role" = different
system prompt context načtený z `docs/agents/roles/*.md`. Tech Lead přepíná mezi
rolemi tím, že čte konkrétní SKILL.md před tím, než začne dělat tu část práce.

| Role | Kdy | SKILL file | Phase ship |
|---|---|---|---|
| **Tech Lead** | Default, vždy. Single entry point. Klasifikuje, dispatches, self-reviews. | `docs/agents/roles/tech-lead.md` | **Phase 1** ✅ |
| **Bug Hunter** | FF-* / AS-* / IN-* findings. Reproduce → fix → test. | `docs/agents/roles/bug-hunter.md` | **Phase 1** ✅ |
| **Security Engineer** | SEC-* / CC-SEC-* findings. Secrets, auth, redaction. | `docs/agents/roles/security-engineer.md` | Phase 2 |
| **QA Engineer** | Tests, regression, smoke. CC-QA-* findings. | `docs/agents/roles/qa-engineer.md` | Phase 2 |
| **Docs Guardian** | Task records, docs sync, FINDINGS.md `**Resolved**` annotation. DOC-* / BLD-* findings. | `docs/agents/roles/docs-guardian.md` | Phase 2 |

Single entry point pro Sebastiána:
```
$ claude
> "vezmi další task z queue"          # Track A
> "exekutuj aktivní plány"            # Track B
> "pokračuj v plánu phase-3-medic"    # Track B specific
```

Sebastián NIKDY neříká "Bug Hunter, udělej X". Tech Lead rozhoduje, kdy si vystřídat role.

---

## 4. Knowledge base layout

```
docs/agents/
├── README.md                   Entry point — read first.
├── ARCHITECTURE.md             Tento dokument.
├── PATTERNS.md                 Auto-appended (learning loop). "When AS X, cause Y."
├── PLAYBOOKS.md                Manual. Step-by-step recipes.
├── GOTCHAS.md                  Auto-appended + 3 seed entries (clasp, EXTENSION_COLUMNS, HMAC).
├── REGRESSION-LOG.md           Auto-appended. "This bug was fixed once before in <commit>."
├── DECISIONS.md                Manual. ADRs.
├── QUEUE.md                    Tech Lead spravuje. Track A queue. Top-N unblocked tasks.
├── QUESTIONS-FOR-HUMAN.md      Append-only. Escalation log.
├── RUN-LOG.md                  Append-only. Kdo co kdy dělal.
├── SETUP-CHECKLIST.md          Manuální setup steps pro Phase 3 (API key, Make, env).
├── _discovery-report.md        Discovery audit (Phase 0 output, locked).
├── plans/                      Track B plans.
│   ├── ACTIVE/
│   ├── COMPLETED/
│   └── BACKLOG/
├── roles/                      SKILL files.
│   ├── tech-lead.md
│   ├── bug-hunter.md
│   ├── security-engineer.md    (Phase 2)
│   ├── qa-engineer.md          (Phase 2)
│   └── docs-guardian.md        (Phase 2)
├── make/                       Make scenario JSON exports (Phase 3).
└── tasks/                      (gitignored) Per-run agent scratch notes.
```

**Obsidian vault setup (volitelné):** otevři `docs/agents/` v Obsidian jako vault.
Graph view ukáže propojení. Sebastián si tam může i sám psát do `## Manual entries`
sekcí PATTERNS / GOTCHAS / REGRESSION-LOG.

### Auto-append vs Generated (amendment Sekce 8 #6)

Repo má 2 různé typy "AI does not edit by hand" souborů — **nepleť si je**:

- **Generated files** (`docs/11-change-log.md`, `docs/29-task-registry.md`):
  rebuilds **deterministically** z task records `node scripts/docs/build-*.mjs`.
  Manuální edit přepíše příští rebuild → CI to detekuje → fail.
- **Auto-appended files** (`docs/agents/PATTERNS.md`, `GOTCHAS.md`, `REGRESSION-LOG.md`):
  Make scenario na PR-merged webhook → Anthropic API extract → append do `## Auto-generated`
  sekce. **Manual entries OK** v `## Manual entries` sekci. Žádný rebuild, jen append.

Hlavička každého auto-appended souboru deklaruje split. Agent NIKDY needituje
`## Auto-generated` sekci. Sebastián může editovat `## Manual entries`.

---

## 5. Definition of Done (4 sub-DoDs)

`docs/14-definition-of-done.md` zůstává canonical. Phase 1 přidává **4. sekci
"Agent Done"** specificky pro Track A autonomous runs:

1. **Code Done** (existing) — tsc OK, build OK, no secrets, no regressions
2. **Documentation Done** (existing) — affected docs updated, changelog entry, CT check, route mapa, README
3. **Test Done** (existing) — `npm test`, build verified, `node scripts/docs/check-doc-sync.mjs` 0 fail
4. **Agent Done** (new — see `docs/14-definition-of-done.md`) — diff size <500 LOC for Track A, secret scan clean, self-review pass, cross-role review (Tech Lead reads diff before PR), QUEUE.md updated, RUN-LOG.md appended

Track B tasks splňují 1+2+3 ale NEMUSÍ splňovat všechny body 4 (např. diff size limit
neplatí — plán definuje phase scope).

---

## 6. Stop conditions / Backpressure (master plan §5)

Tech Lead přestane brát nové tasky a notifikuje Sebastiána pokud:

- **Review backlog:** 5+ unmerged PRs starších než 24h
- **Failure cascade:** 3 tasky v řadě selhaly (failure = blocked, ne done)
- **Quota warning:** Claude Max ukáže warning o blížícím se 5h limitu
- **Daily cap:** 30 promptů per day (soft, lze přepsat)
- **Weekly cap:** 50 PRs per měsíc (hard)

Trigger → queue zastavena → Sebastián rozhoduje co dál. Aktivace přes
edit `QUEUE.md` hlavičky `status: PAUSED` (Tech Lead respektuje).

---

## 7. Bezpečnostní guardraily (NEOBJEDITELNÉ)

Tyhle pravidla jsou v každém SKILL.md natvrdo + v CLAUDE.md hard rules:

| Pravidlo | Důvod | Kde enforced |
|---|---|---|
| **NIKDY** modifikovat `.env*` (kromě `.env.example`) | Secrets v git history | SKILL + CLAUDE.md + (Phase 2 CI gitleaks) |
| **NIKDY** spouštět `clasp deploy` do PROD | DP-003 (clasp swap risk) | SKILL + CLAUDE.md |
| **NIKDY** modifikovat `apps-script/.clasp.json` | Switch na PROD `parentId` = potential PROD overwrite | SKILL + (Phase 2 CI path check) |
| **NIKDY** modifikovat Apps Script Script Properties | Out-of-band runtime config; agent nesmí | SKILL + CLAUDE.md |
| **NIKDY** committovat secrets | Audit SEC-* findings; gitleaks scan | SKILL + (Phase 2 CI) |
| **NIKDY** mergovat do main přímo | Branch protection enforced (require PR) | GitHub branch rules + CLAUDE.md |
| **NIKDY** ignorovat `docs:check` failure | Generated files drift = registry broken | docs-governance.yml CI |
| **NIKDY** přepisovat task records jiných agentů | Audit history preserve; conflict-free | SKILL |
| **NIKDY** modifikovat `docs/archive/` | Pre-monorepo legacy reference | SKILL + CLAUDE.md |
| **VŽDY** vytvářet feature branch `agent/{role}/{task-id}` | Coexists with `task/...` namespace | SKILL |
| **VŽDY** vyplňovat task record kompletně | Build scripts depend on schema | SKILL + Phase 2 validate-task-record.mjs |
| **VŽDY** spustit DoD checklist před PR | All 4 sub-DoDs | SKILL + Phase 2 agent-pr-validation.yml |

---

## 8. Audit prefixy (amendment Sekce 8 #2)

Real audit prefixy v repu (z `docs/audits/FINDINGS.md`):

| Prefix | Doména | Phase | Default Stream |
|---|---|---|---|
| **DM** | Data Model | 2 | A |
| **AS** | Apps Script | 3 | A |
| **FE** | Frontend | 4 | B |
| **IN** | Integration | 5 | B |
| **DP** | Deploy Pipeline | 6 | B |
| **SEC** | Security & Secrets | 7 | B |
| **FF** | Funnel Flow | 8 | A |
| **BLD** | Buildability | 9 | B |
| **DOC** | Docs & Onboarding | 10 | per affected doc |
| **CC-NEW / CC-OPS / CC-SEC / CC-QA** | Cross-check perspectives | 11a-d | per content |

**`BUG-` prefix v repu NEEXISTUJE.** Master plan §13 původně referenced `BUG-005`
jako example — ten existuje jen v starém docs/09-project-control-tower.md (web-starter
external repo). FF-* je equivalent pro functional bugs v internal CRM.

Stream defaults se použijí jako fallback. Tech Lead může overridnout per task —
classification logic v `tech-lead.md`.

---

## 9. Commit convention (amendment Sekce 8 #3)

```
{type}({task-id-or-finding-id}): {summary}

[role]: {agent_role}
[track]: {A|B}
[plan]: {plan-id-or-dash}

{body — proč, ne co}

Refs: {related findings or task IDs}
```

`{task-id-or-finding-id}` toleruje:
- Real finding ID: `SEC-013`, `FF-020`, `DOC-019`
- Repo task ID: `A-11`, `B-13`, `C-04`
- Ad-hoc string ID: `visual-polish-pr2`, `cleanup-and-sec-016`
- Phase ID: `AGENT-TEAM-PHASE-1`

Příklad:
```
fix(SEC-013): security-engineer: tighten Apps Script Web App URL handling

[role]: security-engineer
[track]: A
[plan]: -

Treat APPS_SCRIPT_WEB_APP_URL as known-public; rely solely on token for
write authority. Updates SECRETS-ROTATION runbook reference.

Refs: docs/audits/FINDINGS.md#SEC-013, SEC-017
```

---

## 10. Co je v Phase 1 a co není

Phase 1 (this PR):
- ✅ Knowledge base structure
- ✅ Tech Lead + Bug Hunter SKILLs
- ✅ CLAUDE.md / _template.md / docs/14 amendments
- ✅ Initial Track A queue (top-10 P2 z FINDINGS.md)

Phase 2 (next PR):
- Security Engineer + QA Engineer + Docs Guardian SKILLs
- `agent-pr-validation.yml` CI workflow
- `scripts/agent/triage.mjs` (regenerates QUEUE.md from FINDINGS.md)
- `scripts/agent/validate-task-record.mjs`

Phase 3 (later PR):
- CRM `/admin/dev-team` read-only dashboard (8 panelů)
- Make scenarios (5: daily triage, review reminder, learning loop, backpressure, weekly digest)
- Anthropic API learning loop wiring (Sebastián manuálně vytvoří API key dle SETUP-CHECKLIST.md)

Reference: discovery report Sekce 10-11 pro detail file-by-file scope.
