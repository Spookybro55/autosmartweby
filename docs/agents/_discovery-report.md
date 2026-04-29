# Discovery Report — AI Agent Team Setup

> **Datum:** 2026-04-29
> **Auditor:** Claude Code (Opus 4.7)
> **Scope:** Discovery před implementací AI agent týmu (`docs/agents/*`, role SKILLs, CRM `/admin/dev-team`, learning loop, CI guardrails)
> **Reference:** `~/agent-team-setup-files/03-master-plan.md` v1.0 (16 sekcí, schváleno)
> **Prerequisite prompt:** `~/agent-team-setup-files/01-discovery-prompt.md`
> **Status:** AWAITING APPROVAL
> **Audited commit:** `main` @ `fa550ae` (po merge PR #87 visual restyle)

---

## 1. Executive Summary

Master plan je implementovatelný a fundamentálně kompatibilní s existující governance — neexistuje žádný hard blokátor, který by ho znemožnil. Repo už má sofistikovanou doc-governance vrstvu (CLAUDE.md, docs/13/14, branch protection, 2× CI workflow, append-only audit findings, 46 task records s rebuild scripts), takže agent system se má **napojit na existující pipeline**, ne stavět paralelní strukturu.

Tři **zásadní gaps** mezi master plánem a realitou repa, které vyžadují rozhodnutí PŘED implementací: **(a) slovník Stream vs Track** je nezarovnaný (Stream A/B/C v repu = doménová klasifikace pro doc mapping; Track A/B v master planu = autonomy mode — jsou to ortogonální dimenze, ne synonyma), **(b) audit findings prefixy** v repu (SEC, IN, DP, FF, BLD, DOC, AS, FE, DM, CC-*) NEodpovídají prefixům v master planu (SEC, BUG) — `BUG-` neexistuje, `FF-` (Funnel Flow) je ekvivalent, **(c) task record IDs nejsou vždy `{stream}{number}`** — 5 z 46 záznamů má ad-hoc string ID (`visual-restyle-dark-futuristic-pr1`, `cleanup-and-sec-016` atd.), takže commit convention `fix(SEC-005): [role]: ...` musí povolit i ne-prefixované task IDs.

Žádný blokátor, ale 7 otázek pro Sebastiána (sekce 9) chce vyřešit před fází 1 implementace, jinak agent system bude vznikat na nedořešených premise.

## 2. Governance baseline (co existuje)

### CLAUDE.md (216 řádků, owner: Sebastián)

Je to **operační manuál pro AI agenta** uvnitř repa — ne dokumentace pro lidi. Definuje:
- **Project boundary** (interní system tento repo vs marketing web `Spookybro55/ASW-MARKETING-WEB`) — toto pravidlo musí být v každé agent SKILL.md jako hard rule, jinak agent začne reportovat "missing public website" jako P0.
- **Source of truth** (GitHub repo = code; Sheets = runtime data; Apps Script editor není SoT).
- **Tým a workflow** — 3 lidi paralelně, branch protection, povinný `docs-governance` status check, povinný 1+ reviewer.
- **Branch naming** — `task/{TASK_ID}-{name}`, kde TASK_ID = `A2`, `B3`, `C4`, `A-11`, atd.
- **Stream mapping** — A=Data&Automation, B=Infrastructure&Offer, C=Business&Prioritization.
- **Co každý task musí dodat** — code + task record + kanonické docs + regenerated changelog/registry + `node scripts/docs/check-doc-sync.mjs` validace.
- **Zákazy** — necommituj secrets, needituj archive docs / cizí task records / generated files / nepushuj do main / nepushuj do AS z feature branche.
- **Povinný výstup na konci tasku** — 6-bodový checklist (files changed, docs changed, why, changelog updated yes/no, doc sync complete yes/no, remaining items).
- **Definition of Done** — odkazuje na docs/14.

**Co bude třeba doplnit/upravit pro agent system:**
- Sekce "AI Agent Team" s odkazem na `docs/agents/README.md` a `docs/agents/ARCHITECTURE.md`.
- Sekce "Track" jako ortogonální axe vedle Stream (viz sekce 6 této reportu).
- Branch convention: doplnit `agent/{role}/{task-id}` jako alternativa k `task/{...}` pro autonomous Track A runs.
- Commit convention: doplnit `[role]: {agent_role}`, `[track]: {A|B}` mezi-řádek metadata.
- Hard rule: "Agent NIKDY needituje `.clasp.json`", "Agent NIKDY nespouští `clasp deploy`", "Agent NIKDY netoucha Apps Script Script Properties".

### docs/13-doc-update-rules.md (47 řádků) — stream-doc mapa

Definuje **3 streamy s povinnými docs** + **5 trigger-based extensions** (route → docs/12, API contract → docs/12+01, auth/env → docs/22+27, riziko → docs/28, owner decision → docs/01).

**Stream mapa (canonical, repo source of truth):**
- **Stream A — Data & Automation:** docs/20, 23, 24
- **Stream B — Infrastructure & Offer:** docs/20, 22, 26, 27
- **Stream C — Business Process & Prioritization:** docs/20, 21, 24, 25

Vždy povinně bez ohledu na stream: task record + regenerated 11-change-log.md + 29-task-registry.md.

**Co bude třeba pro agent system:**
- `docs-guardian.md` SKILL musí mít tuhle mapu jako machine-readable check (preferovaně auto-derived, ne duplikované — single source of truth zůstává docs/13).
- Agent system nepřidává **nové streamy** — Stream A/B/C zůstává klasifikační schema. Track A/B (autonomous vs plan-driven) je separátní axis (viz §6 bod 7).

### docs/14-definition-of-done.md (80 řádků) — 3 checklisty

Definuje 3 nezávislé Done checklisty:
1. **Code Done** (4 body): tsc --noEmit OK, npm run build OK, no secrets, no regressions
2. **Documentation Done** (6 bodů): D1-D6 affected docs, changelog, control tower check, route mapa check, README in affected folder
3. **Test Done** (3 body): `npm test`, `npm run build` verified, `node scripts/check-doc-sync.mjs` 0 fail

**Completion contract** (silný language): task NENÍ done dokud changelog NEMA novy zaznam o zmene a documentation sync NENÍ dokoncen. Povinný 6-řádkový závěrečný output.

**Pozn:** docs/14 odkazuje na `node scripts/check-doc-sync.mjs` (BEZ `docs/` v cestě). Realita je `node scripts/docs/check-doc-sync.mjs`. Drift v dokumentaci — finding pro DOC-* (post-implementation cleanup).

**Jak rozšířit pro agenty:** přidat **Agent Done** 4. checklist:
- Diff size < 500 LOC (jinak escalate na human review)
- Žádné secrets (auto-scan v CI / gitleaks)
- Self-review pass (agent znova přečte diff, najde 0 problémů)
- Cross-role review pass (Tech Lead jako reviewer před PR)

### Task records template (`docs/30-task-records/_template.md`, 53 řádků)

Sekce: Metadata (Task ID, Title, Owner, Status, Date, Stream), Scope, Code Changes, Docs Updated, Contracts Changed, Tests, Output for Audit, Known Limits, Next Dependency.

**Status enum**: `draft / in-progress / done / blocked`. (Realita v 46 records: `done`, `code-complete`, `READY_FOR_DEPLOY`, `blocked`, `draft` — drift mezi template a usage.)

**Stream enum**: `A / B / C`. (Realita: některé records mají `Stream B` jako string, ne jen `B`.)

**Co bude třeba přidat:**
- `Agent Role` field (Metadata table) — values: `tech-lead | bug-hunter | security-engineer | qa-engineer | docs-guardian` nebo `human` (pro non-agent tasks)
- `Track` field (Metadata table) — values: `A | B | -` (`-` pro pre-agent tasks)
- `Plan` field (Metadata table) — values: plan_id pro Track B, jinak `-`
- `Autonomous run` field — values: `yes / no / partial`
- `Self-review verdict` field — values: `pass / fail / human-required`
- Sekce `## DoD Checklist` (machine-parseable checkbox list — všechny 3 sub-DoD + agent-specific)

**KRITICKÉ:** Build scripts (`build-changelog.mjs`, `build-task-registry.mjs`) parsují **PŘESNÉ regex** `\| \*\*${label}\*\* \| (.+?) \|` na metadata table. Přidání nových polí je **safe** (každý nový label = nový regex). Ale registry tabulka má 8 fixed sloupců (Task ID / Stream / Title / Owner / Status / Date / Affected Docs / Code Areas) — pokud chceš mít agent_role v registry, **musíš upravit `build-task-registry.mjs`**. To je triviální (5-7 řádků), ale je to code change.

### CI workflows (`.github/workflows/*.yml`)

3 existující workflows:

| Workflow | Trigger | Co dělá |
|---|---|---|
| **docs-governance.yml** (35 řádků) | `pull_request` to main | Build changelog + task registry; verify generated files up-to-date (`git diff --quiet`); `node scripts/docs/check-doc-sync.mjs`. Toto je **status check** vyžadovaný branch protection. |
| **pilot-ci.yml** (82 řádků) | `pull_request` + push to main | Frontend job: `npm run lint`, `npx tsc --noEmit`, `npm run build` (s NEXTAUTH_SECRET fail-fast workaround pomocí test secret + MOCK_MODE), `npm run test:b06`. Apps-script job: `node scripts/test-ingest-runtime.mjs`, `node scripts/test-a08-preview-queue.mjs`. |
| **scrape.yml** (205 řádků) | `workflow_dispatch` (z `/api/scrape/trigger`) | A-11 firmy.cz scraper run + POST do AS. Není relevantní pro agent system. |

**Co bude třeba přidat / upravit:**
- Nový workflow `agent-pr-validation.yml` — spuštěný na PR. Validuje: branch matches `agent/*` nebo `task/*`, task record exists pro tento task ID, DoD checklist filled, diff size < 500 LOC (nebo `[size-override]` v PR body), žádné secrets (gitleaks/trufflehog scan), `agent_role` v task record matches jedné z 5 rolí.
- Volitelně rozšířit `docs-governance.yml` o validaci `Agent Role` field konzistence — ale lepší to oddělit.
- **Pozor:** docs-governance.yml a pilot-ci.yml už running paralelně. agent-pr-validation.yml má separátní `name:` a `jobs:` — žádný collision.

### scripts/docs/* (3 build scripts + check)

| Script | LOC | Co dělá |
|---|---|---|
| `check-doc-sync.mjs` | 230 | 6 sekcí: required governance docs exist (6), canonical docs exist (10), task records dir + _template.md, generated files freshness (mtime check ±5s), code-vs-task-record sync (git diff parse), cross-references in canonical docs. Používá known-archive set. |
| `build-changelog.mjs` | 123 | Parse task records → groupBy date desc → write `docs/11-change-log.md`. |
| `build-task-registry.mjs` | 97 | Parse task records → write `docs/29-task-registry.md` jako 8-col tabulka. |

**Pozn:** `check-doc-sync.mjs` má **stale paths v known-archive set** — 17 archive paths. Agent který by chtěl přidat nový archive doc by tu množinu musel updatovat. Drift risk: někdo archive doc přidá ale tahle množina se neupdatuje → false WARN.

`create-task-record.mjs` (zmíněn v package.json jako `docs:new-task` a v CONTRIBUTING.md, ale **NENAČETL JSEM HO** — předpokládá se že bere `<TASK_ID> "<TITLE>"` a vyrenderuje template; nezbytný pro agent workflow protože agent musí umět vytvořit task record přes deterministicky path).

## 3. Audit findings inventory

**Audit baseline:** `origin/main` @ `1dfc7e8` (po PR #36 B-06). Audit běží ve 13 fázích, každá fáze = samostatný PR (read-only, append-only do `docs/audits/`).

### Counts (z FINDINGS.md, 248 řádků; counts via grep `\| P[0-3] \|` + status patterns)

| Severity | Count | Example IDs |
|---|---|---|
| **P0 (Blocker)** | 14 | CC-QA-002 (E2E pipeline not testable), SEC-001 (Sheet IDs), CC-SEC-* |
| **P1 (Must fix před PROD)** | ~68 | DOC-009 (offer-generation stale), DOC-019 (no ROLLBACK.md), DOC-020 (no SECRETS-ROTATION.md), CC-QA-004 (preview store loss regression), CC-QA-005 (concurrency test) |
| **P2 (Tech debt)** | ~69 | IN-003 (route-and-surface drift), IN-013 (sales_note length), DP-015 (22-tech-architecture stale), SEC-013 (URL token), FF-010 (queue SPEC-only), FF-011 (provider abstraction SPEC-only), FF-020 (LockService gap), DOC-013 |
| **P3 (Nice-to-have)** | ~14 | BLD-020 (package-lock.json size), CC-QA-012 (no test config) |

**Total findings: ≈165** (across 13 phases + cross-checks)

| Status | Count |
|---|---|
| **Open** | 67 |
| **Resolved** (`**Resolved** in <commit>` convention) | 23 |
| **Other / Stale / Cross-ref** | ~75 |

(Total 67+23 < 165 — rozdíl jsou findings se statusem `—` (cross-ref na jiný finding bez vlastního statusu) nebo `N/A`. Status sloupec tedy NENÍ exhaustive.)

### Prefixy v audit (canonical schema)

| Prefix | Doména | Phase |
|---|---|---|
| **DM** | Data Model | 2 |
| **AS** | Apps Script | 3 |
| **FE** | Frontend | 4 |
| **IN** | Integration | 5 |
| **DP** | Deploy Pipeline | 6 |
| **SEC** | Security & Secrets | 7 |
| **FF** | Funnel Flow | 8 |
| **BLD** | Buildability | 9 |
| **DOC** | Docs & Onboarding | 10 |
| **CC-NEW** | Cross-check Newbie | 11a |
| **CC-OPS** | Cross-check DevOps | 11b |
| **CC-SEC** | Cross-check Attacker | 11c |
| **CC-QA** | Cross-check QA | 11d |

**KRITICKÝ DRIFT:** Master plan §13 commit convention zmiňuje `fix(SEC-005)` (existuje) ale `01-discovery-prompt.md` Krok 2 zmiňuje **`BUG-`** jako prefix — `BUG-` v repu **NEEXISTUJE**. Realita má `FF-` (Funnel Flow) jako nejbližší ekvivalent pro behavioral bugs. Master plan + agent SKILLs musí použít real prefixy.

### Track A candidates (autonomous-eligible)

Hrubý odhad — agenti by měli umět vzít všechny **P2 single-file fix** findings (např. IN-003 doc drift fix, BLD-006 add `typecheck` script, IN-013 backend length cap). Z 67 Open findings odhadem **~30-40 jsou Track A candidates** (single-file diff + clearly defined acceptance + nemají compliance/legal aspect).

Velké refactors (FF-010 implement queue, FF-011 provider abstraction, B-* implementace SPEC-only tasks) jsou **Track B** (plan-driven) — vyžadují předchozí plánování s ownerem.

P0 findings (např. SEC-001 sheet IDs rotation, CC-QA-002 E2E gap) **vyžadují human action** (rotace tokenů, infrastrukturní rozhodnutí) — NEjsou Track A. Odhad: ~3-5 z 14 P0 lze dělat agentem (např. dokumentační P0), zbytek čistě human.

**Doporučení:** Sebastián by měl explicitně označit Track A vs Track B v `QUEUE.md` při triage, ne nechat agenta rozhodovat. Track A = clearly green-light. Track B = vyžaduje schválený plán.

## 4. Sample findings (reference for agents)

### Sample SEC finding (Open, P2)

```
| SEC-013 | Security | Apps Script Web App URL je v Vercel env (`APPS_SCRIPT_WEB_APP_URL`) — pokud
unikne (logs, env exposure, CI artifact), token v body je single point of failure pro write
authority. | P2 | `crm-frontend/src/lib/config.ts:7`; `crm-frontend/src/lib/google/apps-script-writer.ts:20`
| Defense-in-depth: jediná vrstva (token) místo dvou (URL secrecy + token). | Předpokládat URL je
known a chránit pouze tokenem. Posílit token rotation runbook (SEC-017). | Open |
```

**Pro Security Engineer SKILL.md:** to je typický finding — má (a) přesnou evidence cestu s line numbers, (b) impact analysis s threat model, (c) konkrétní recommendation s cross-ref na další finding (SEC-017). Agent musí umět všech 3 vrstvy reprodukovat.

### Sample FF (Funnel Flow) finding (Open, P2 — equivalent k "BUG" v master planu)

```
| FF-020 | Funnel Flow | `OutboundEmail.executeCrmOutbound_` bez LockService. 2 paralelní operator
menu clicks (theoretically) mohou poslat 2×. | P2 | `apps-script/OutboundEmail.gs:47` (žádný
`LockService.tryLock`) | Apps Script script-level locks by zabránily 2 současným executions od
různých operátorů. Bez lock + bez idempotency key = duplicate sends možné v concurrent scenario.
| Wrap `executeCrmOutbound_` do LockService(10s). Při lockFailed safeAlert. | Open |
```

**Pro Bug Hunter SKILL.md:** ukázka **race condition / concurrency** finding. Agent musí umět: reprodukovat (nebo navrhnout reproducer), implementovat fix s LockService pattern (existuje precedent v ContactSheet.gs B-06), napsat test scénář, update task record + docs/24-automation-workflows.md (Stream — neclear, default = stream A).

### Sample DOC finding (Open, P1)

```
| DOC-019 | Docs & Onboarding | Žádný `docs/ROLLBACK.md @ 26d4802`. Cross-ref DP-018 — Phase 6
identified gap, Phase 10 owner = deploy owner audience. | P1 | `find docs/ -iname "ROLLBACK*"` =
empty; `grep "rollback" docs/*.md` = pouze v audits | Při PROD incident deploy owner nezná exact
steps (revert + clasp push + Vercel rollback + env restore). TTR risk + panic risk. | Vytvořit
`docs/ROLLBACK.md` per DP-018 doporučení. | DP-018 |
```

**Pro Docs Guardian SKILL.md:** typický doc-creation finding s clear deliverable. Cross-ref na DP-018 (Deploy Pipeline domain) znamená že Docs Guardian musí DP-018 přečíst pro context. Stream classification: B (infrastructure/operations).

### Sample resolved finding (precedent pro `**Resolved**` convention)

Z `docs/30-task-records/cleanup-and-sec-016.md` se ukazuje že auditor convention pro označení resolved findings je:

```
status: **Resolved** in `<commit-sha>` ... | verification timestamp `2026-04-29` | verified
behaviour: `NEXTAUTH_SECRET= npm run build` fails with throw message; valid 32+ char secret builds
successfully
```

Strike-through na původní evidence cell preserves audit history. Agent (zejména Docs Guardian) musí tento convention dodržovat při uzavírání findings — nikdy **nepřepisuje** finding row, jen **annotuje** status sloupec a strikethroughne stale evidence.

## 5. Existing task records analysis

46 task records v `docs/30-task-records/`. Analyzed sample: A-11 (Stream A, large), visual-restyle-dark-futuristic-pr1 (Stream B, ad-hoc ID, large), cleanup-and-sec-016 (Stream B, ad-hoc ID, doc-only), B-13 (Stream B, status `READY_FOR_DEPLOY`), C-11 (Stream C, SPEC-only) — last 2 jsem nestáhl plně, jen z registry.

### Co dobře funguje

1. **Metadata table konzistentní napříč všemi 46 records** — build-changelog/build-task-registry parsují bez problémů.
2. **Stream je explicitní** — každý record má `Stream A/B/C` v metadata + `Stream` field v rebuild scripts.
3. **Code Changes tabulka** je rich — `Soubor | Typ změny | Popis` formát umožňuje grep / diff porovnání.
4. **Docs Updated tabulka** explicit — žádné "and other docs", konkrétní paths.
5. **Tests sekce** s konkrétními výsledky (např. `26/26`, `OK — Compiled in 13.5 s`).
6. **Known Limits sekce** je discipline-driven — agenti to musí dodržovat (žádné "everything works").
7. **Next Dependency tabulka** linkuje follow-up tasks → přirozený QUEUE.md feed.

### Co bude třeba upravit pro agenty

1. **Status enum drift** — `done`, `code-complete`, `READY_FOR_DEPLOY`, `blocked` v realitě vs jen `draft/in-progress/done/blocked` v _template.md. Sjednotit.
2. **Owner field je nekonzistentní** — `Stream A`, `Stream B`, `Claude`, `claude`, `—`, `TBD`. Agent records by měly mít **role** ne stream (`tech-lead`, `bug-hunter`, atd.).
3. **Task ID convention** — 5 z 46 (visual-restyle-..., cleanup-and-sec-016, redesign-lead-detail-modal, email-cleanup-eliminate-legacy, audit-reconciliation-2026-04) má **ad-hoc string ID**, ostatní mají `A1`, `B-13`, `C-11`, `BX1`, `CS3`. Agent commit convention `fix(SEC-005)` musí povolit i ad-hoc IDs (např. `fix(visual-polish-pr2)`).
4. **Žádný `Agent Role` field** v records → musí se přidat (sekce 6 bod 2).
5. **Žádný `DoD Checklist` sekce** → agenti potřebují machine-parseable checkbox list pro CI validation.
6. **Length** — A-11.md je ~110 řádků code/docs/tests/limits, C-11.md je ~100+ řádků v jediné sekci docs/24 (SPEC tasks expand do hlavního doc). Agent records pro Track A by měly být kratší (~50-80 řádků), Track B (multi-file features) může být delší.
7. **Krátký scope** — visual-restyle scope je 3 odstavce (good for context). Agent records musí mít buď reference na plán (Track B) nebo přímý finding ID (Track A) v Scope sekci.

## 6. Compatibility audit (10 bodů)

| # | Plánovaný prvek | Stav | Akce |
|---|---|---|---|
| 1 | Cesta `docs/agents/` | **NEUTRAL** — neexistuje (Glob `docs/agents/**/*` = no files). `docs/archive/` má 23 souborů, ale liší se path → žádný conflict. | Vytvořit. Zápis do .gitignore? — **NE**, celá `docs/agents/` má být tracked. Volitelný `docs/agents/.obsidian/` je gitignored (Obsidian local config). |
| 2 | `Agent Role` field v task records | **NEUTRAL** — `_template.md` to nemá. Build scripts parsují **fixed labels** (`Task ID`, `Title`, `Owner`, `Status`, `Date`, `Stream`) přes generic regex `\| \*\*${label}\*\* \| (.+?) \|` — přidání nového řádku je **safe** pro parsing. **ALE registry tabulka** má 8 fixed sloupců — pokud `agent_role` má být v registry, **musíš upravit `build-task-registry.mjs`** (~7 LOC change). | (a) Add 4 nové fields do `_template.md` Metadata: `Agent Role`, `Track`, `Plan`, `Autonomous run`. (b) Volitelně upravit `build-task-registry.mjs` o 9. sloupec `Role`. (c) Update všech 46 existujících records → backfill `Agent Role: human`, `Track: -` (manual sed nebo `node scripts/agent/backfill-records.mjs`). |
| 3 | Commit convention `fix(SEC-005): [role]: ...` | **PARTIAL CONFLICT** — current commits jsou volné: `feat(ui):`, `fix(scrape):`, `refactor(email):`, `docs(audit):`, `chore:`. Žádný hard rule, žádný commitlint config v repu. **Ale**: master plan předpokládá `(SEC-005)` task ID jako prefix — to **NEFUNGUJE pro 5 ad-hoc records** (visual-restyle-..., cleanup-and-sec-016, atd.). | Document nový convention v CLAUDE.md jako **doporučený, ne hard rule**. Volitelně přidat commitlint do `.husky/commit-msg` ale bez enforcementu na ad-hoc IDs. Příklad: `fix(SEC-013): [security-engineer]: timing-safe URL check`. |
| 4 | Branch convention `agent/{role}/{task-id}` | **KOMPATIBILNÍ** — current je `task/{TASK_ID}-...`. Master plan zavádí nový namespace (`agent/{role}/{task-id}`) — **coexistuje** s `task/...`. **Ale** branch protection na main je nastavená přes GitHub UI (CLAUDE.md: `enforce_admins=false`) — nemám file-level access do branch rules; ALLOW pattern je default `*` → měl by povolit oba namespaces. | Document v CLAUDE.md. Volitelně CI workflow `agent-pr-validation.yml` může enforce: pokud author = bot/agent, branch musí matchovat `agent/{role}/{task-id}` regex. Pro human-driven Track B plan run může branch být `task/...`. |
| 5 | Workflow `agent-pr-validation.yml` | **NEUTRAL** — neexistuje. Existují 3 workflows (docs-governance, pilot-ci, scrape). | Add nový workflow s job name `agent-pr-validation` (≠ existing `docs-governance` / `frontend-checks` / `apps-script-checks` / `scrape`). Žádný name conflict. **Pozor:** docs-governance je single status check vyžadovaný branch protection → pokud má i agent-pr-validation být required, owner musí přidat status check do branch rules přes GitHub UI. Doporučuji: agent-pr-validation jako **non-blocking** první iteraci, blocking později. |
| 6 | DoD checklist v každém PR | **KOMPATIBILNÍ** — docs/14 už definuje 3-section DoD. Master plan rozšiřuje (DoD master plan §4 = 10-bod list, lehce odlišný formát od docs/14). | (a) Update docs/14 → přidat **Agent Done** 4. sekci (≈4 body: diff size, secrets, self-review, cross-role review). (b) Vytvořit `.github/pull_request_template.md` (neexistuje) s 4-section checklist. Pre-existing tasks tím nejsou ovlivněny (template je opt-in). |
| 7 | Stream A/B/C vs Track A/B | **HARD CONFLICT VOCAB** — Stream v repu = doménová klasifikace pro doc mapping (A=Data, B=Infra, C=Business). Track v master planu = workflow mode (A=autonomous bug fix, B=plan-driven feature). **Jsou to ortogonální axes!** Příklad: A-11 task = Stream A (data domain) + Track B (plan-driven feature). SEC-013 fix = Stream B (auth/infra) + Track A (autonomous). | **Tvrdě zarovnat slovník v ARCHITECTURE.md.** Jasná separace: "Stream je doménová klasifikace pro doc mapping (per docs/13). Track je workflow mode (autonomous vs plan-driven). Každý task je tagnut **OBEMA** axes." Update `_template.md` aby měl `Stream` AND `Track` jako separate fields. Update CLAUDE.md odpovídajícím způsobem. |
| 8 | Auto-update PATTERNS.md přes API (learning loop) | **PARTIAL CONFLICT** — governance říká "needituj generated files manually" (CLAUDE.md). Ale current generated files (changelog, registry) jsou **rebuildy z task records** — deterministic. PATTERNS.md by byl **append-only** (extracted patterns z PR diffu) — nový režim. | (a) Mark PATTERNS.md / GOTCHAS.md / REGRESSION-LOG.md explicitně jako "auto-appended (not auto-rebuilt)" v hlavičce. (b) Operator může i ručně přidat řádek (manual entry). (c) Make scenario edituje souboru přes GitHub API — to znamená auto-generated commit (např. `chore(learning): append pattern <id>`); auto-merge může bypass branch protection (enforce_admins=false → owner has bypass; agent jako owner = OK). (d) Volitelně: PATTERNS.md má `last_auto_update_at: <timestamp>` v hlavičce + check-doc-sync warns pokud manual edit > 1h after auto-update. |
| 9 | CRM tab `/admin/dev-team` | **POTENTIAL CONFLICT** — auth model je `ALLOWED_EMAILS` (Vercel env) + sdílené heslo (4 pilot users). **Žádné role-based access** v current code. | Tab musí být viditelný **jen Sebastiánovi**. Možnosti: (a) hardcoded `s.fridrich@autosmartweb.cz` check v page.tsx (rychlé, fragile). (b) Nový env var `OWNER_EMAIL` + middleware check (čisté, doporučuji). (c) Nový env var `ADMIN_EMAILS` (pro buducí extension). **Pozor**: route `/admin/*` neexistuje v current code → musí se vytvořit `crm-frontend/src/app/admin/dev-team/page.tsx` + `crm-frontend/src/middleware.ts` update pro `/admin/*` allowlist check. |
| 10 | Diff size limit 500 LOC | **POTENTIAL CONFLICT pro non-Track-A tasks** — visual-restyle PR mělo 12 file rewrites + 600+ LOC change (ale šlo o plan-driven Track B). A-11 task mělo ~2000+ LOC change přes 14 souborů. C-* SPEC tasks mají 500+ LOC v jediné sekci `docs/24-automation-workflows.md`. | **500 LOC limit je pro Track A autonomous PR** (master plan §4, contextu Track A workflow §9). Track B plan-driven PRs mohou být velké, vyžadují schválení v plánu. Document jasně v ARCHITECTURE.md a docs/14. Volitelně agent-pr-validation.yml přidá `[size-override]` v PR body bypass mechanism (ne na Track A). |

## 7. Risk assessment

| ID | Risk | Severity | Mitigace |
|---|---|---|---|
| **R1** | Agent commitne secrets | **HIGH** | Aktuální stav: `.gitignore` pokrývá `.env*`. Žádný pre-commit hook ani CI secret-scan. Agent může omylem commitnout secret v dokumentaci, debug log, task record, nebo .env.local copy. **Mitigace:** (a) každá SKILL.md má hard rule "NEVER commit secrets, NEVER write secret value to docs". (b) CI workflow `agent-pr-validation.yml` musí mít gitleaks/trufflehog scan jako blocking step. (c) Pre-commit hook (.husky/pre-commit) s `npx detect-secrets-hook` — opt-in pro lokální dev. (d) Docs Guardian SKILL.md hard rule: "NIKDY include literal secret value v evidence path — místo toho `prvních 4 znaky: XXXX` per `docs/audits/README.md` redaction rules". |
| **R2** | Agent přepíše/poškodí archive docs | **LOW** | Master plan §11 explicit guardrail: "NIKDY modifikovat `docs/archive/`". Každá SKILL.md má tuhle hard rule. Volitelně CI workflow check: "If diff touches `docs/archive/` AND author is agent AND task type ≠ explicit archive task → fail". CLAUDE.md už toto pravidlo má. |
| **R3** | Agent obejde branch protection | **MEDIUM** | `enforce_admins=false` znamená že owner credentials mohou bypass. Pokud agent runtime má owner credentials (claude code lokálně běží jako Sebastián), **agent má teoretický bypass capability**. Master plan §11: "NIKDY mergovat do main přímo (vždy přes PR)" — covers. **Mitigace:** (a) SKILL.md hard rule. (b) Tech Lead role nikdy nezavolá `git push origin main` — vždy `git push -u origin agent/{role}/{task-id}` + `gh pr create`. (c) Volitelně: `pre-push` hook čte branch name a refuses `main` push. |
| **R4** | Agent rozbije Apps Script PROD | **LOW-MEDIUM** | `clasp deploy` do PROD je **manuální** ruční proces po merge do main (CLAUDE.md: "Apps Script deployment — Az po merge do main, prepni .clasp.json scriptId na PROD, clasp push, vrat scriptId zpet na TEST"). Master plan §11: "NIKDY spouštět clasp deploy do PROD (jen TEST)". **Risk:** pokud agent omylem upraví `.clasp.json` `parentId` nebo `scriptId` na PROD ID, následné `clasp push` (lokálně by Sebastián) by mohlo deploynout. **Mitigace:** (a) SKILL.md hard rule "NIKDY needituj `apps-script/.clasp.json`". (b) CI check: pokud diff touches `apps-script/.clasp.json` AND author is agent → fail. (c) `apps-script/.clasp.json.example` ukazuje TEST-only convention. |
| **R5** | Agent rozbije generated files (`docs/11-change-log.md`, `docs/29-task-registry.md`) | **MEDIUM** | docs-governance.yml CI **chytí** každý PR kde generated files nejsou up-to-date — `git diff --quiet` failuje, status check `docs-governance` failne, branch protection blokuje merge. Risk je tedy bounded — agent dokáže vytvořit broken PR ale ne mergnout. **Mitigace:** (a) Tech Lead workflow §9 step 7 (Docs Guardian dispatch) explicit volá `node scripts/docs/build-changelog.mjs` a `build-task-registry.mjs` před PR. (b) docs-guardian.md SKILL hard rule. (c) `npm run docs:check` je první command v každém self-review krok. |
| **R6** | Agent vytvoří task record bez kompletního DoD | **MEDIUM** | _template.md má prázdná pole. Build scripts parsuji **přesné labels** — pokud agent vyplní text mimo schema (např. `| Task ID | (TBD) |`), record se v registry zobrazí ale s prázdnými fields. CI nedetekuje "incomplete task record" sám o sobě (jen warns o code-without-record). **Mitigace:** (a) docs-guardian.md SKILL musí mít validation: "all 6 metadata fields filled, no `{TASK_ID}` placeholder, no `TBD`, no `—`". (b) `agent-pr-validation.yml` přidá `validate-task-record.mjs` step (3-5 LOC validator). (c) Self-review checklist: "task record má všechna pole filled." |
| **R7** | Agent neaktualizuje docs podle stream mapy | **MEDIUM-HIGH** | Stream-doc mapping (docs/13) **NENÍ auto-vynucen v CI**. `check-doc-sync.mjs` warns "code without docs" ale ne stream-specific. Agent může commitnout Stream A code change a aktualizovat jen docs/22 (Stream B doc) — porušení mapy bez detekce. **Mitigace:** (a) docs-guardian.md SKILL musí parse `Stream` field z task record + check že task `Docs Updated` includes všechny povinné docs pro daný stream (z docs/13). (b) `agent-pr-validation.yml` přidá `validate-stream-mapping.mjs` step (10-15 LOC). (c) Volitelně extend `check-doc-sync.mjs` o stream-aware check (~30 LOC). |
| **R8** | Agent vyplní context Claude Max do limitu na 1 task | **MEDIUM** | Realistický limit. Visual-restyle task (12 files, 600+ LOC, vícenásobné self-review iterations) by snadno spotřeboval velký kus 5h limitu. Master plan §5 stop conditions: "Quota warning — Claude Max ukáže warning". **Mitigace:** (a) Tech Lead detection: "kdykoli se context blíží 80% capacity, pause task, save state do `docs/agents/tasks/{task-id}/state.md`, escalate". (b) Track A favoring small single-file findings (P2-class). (c) Track B tasks vyžadují plán s explicit "phases" — agent řeší 1 phase = 1 PR. (d) Long tasks = agent posunu na ChatGPT Plus / Codex CLI fallback (master plan §2). |
| **R9** | Agent loop / runaway (3 selhání ale pokračuje) | **MEDIUM** | Master plan §6: "Pokud agent failuje 3× za sebou na stejném tasku → blocked + QUESTIONS-FOR-HUMAN.md, skip". Master plan §5: "Failure cascade — 3 tasky v řadě selhaly → queue zastavena". **Mitigace:** (a) Tech Lead role explicit "after 3rd retry on same step, mark task blocked, escalate, move to next." (b) RUN-LOG.md must be append-only with timestamp + step + outcome — Tech Lead reads last N entries before deciding next action. (c) `daily-cap=30 prompts` soft + `weekly-cap=50 PRs` hard limity backpressure (master plan §5). |
| **R10** | Agent halucinace o existujícím kódu (file changed 3 min ago, agent vidí stale view) | **HIGH** (pre-existing risk pro Claude obecně, ne specifické pro agent system) | Visual-restyle task ukázal že claude často edituje a pak má stale context. **Mitigace:** (a) Každá SKILL.md hard rule: "Před každým Edit voláním musíš re-read soubor (Read tool) — i kdyby si ho čet před 30 vteřinami". (b) Cross-role review (Tech Lead) re-reads diff per-file před PR. (c) Test Done sekce (§14 docs/14) catch regressions: `npx tsc --noEmit`, `npm run build`, regression test scripts. (d) `agent-pr-validation.yml` running celého CI pipeline na PR detects functional breakage. |

## 8. Doporučené úpravy plánu

Před fází 1 implementace doporučuji Sebastiánovi zvážit těchto 8 změn:

1. **Stream vs Track** — přidat do master plan §3 explicit sekci "Stream is orthogonal to Track. Stream is doc-mapping classification (A/B/C per docs/13). Track is workflow mode (A/B per master plan §3.1). Every task has both." Bez tohohle bude každá agent SKILL.md guess.

2. **Audit prefixy** — fix master plan §13 example. Použít real prefixy: `fix(SEC-013):`, `fix(FF-020):`, `fix(DOC-019):`. `BUG-` prefix v repu neexistuje. Discovery prompt Krok 2 zmiňuje "BUG-, FF-, DOC-, BLD-, DP-, IN-" — `BUG-` smazat z reference.

3. **Ad-hoc task IDs** — master plan §13 commit convention explicit allow `fix({task-id-or-finding-id})` kde `task-id` může být ad-hoc string (např. `fix(visual-polish-pr2): [bug-hunter]: ...`). `Refs:` line cross-ref na findings je explicit (separately).

4. **Status enum sjednocení** — _template.md `draft / in-progress / done / blocked` vs realita `done / code-complete / READY_FOR_DEPLOY / blocked / draft`. Doporučení: rozšířit template enum na `draft / in-progress / code-complete / ready-for-deploy / done / blocked / cancelled`. Agenti use `code-complete` po self-review pre-PR, `done` po merge.

5. **DoD harmonizace** — master plan §4 (10 bodů) vs docs/14 (3 sekce × 4-6 bodů = 14 bodů). Sjednotit. Buď master plan §4 = "Agent Done" 4. sekce v docs/14, nebo update docs/14 aby reflektoval master plan §4 strukturu. Doporučuji: docs/14 zůstává canonical (existing convention), master plan §4 se přemapuje na sub-DoD checklist v "Agent Done" sekci.

6. **PATTERNS.md auto-append** — explicit oddělit od "generated files" (changelog/registry). Generated = rebuilt deterministically. Auto-appended = appended by external process (Make → API). Hlavička každého auto-appended souboru: "Auto-appended by learning loop. Manual entries OK below `## Manual entries` section." (per-section split) — minimalizuje merge konflikty mezi auto a manual.

7. **CRM `/admin/dev-team` auth model** — nový env `OWNER_EMAIL=s.fridrich@autosmartweb.cz` + middleware check. **NE** `ALLOWED_EMAILS` extension (sdílí allowlist s pilot users → leaky).

8. **Diff size policy** — explicit dichotomie:
   - **Track A** (autonomous bug fix): hard limit 500 LOC. Větší = block + escalate.
   - **Track B** (plan-driven feature): no hard limit. Plán definuje phases → každá phase = 1 PR.
   - Bypass mechanism (agent-pr-validation): `[size-override]` v PR body — only for Track B nebo s explicit owner approval comment v PR.

## 9. Otázky pro Sebastiána

Před fází 1 implementace potřebuji rozhodnutí na těchto 7 bodech:

1. **Q1: Backfill 46 existujících records?** Mám každému přidat `Agent Role: human` + `Track: -` + `Plan: -` + `Autonomous run: no`? Pokud ano, dělat to **(a) ručně přes editaci** (1-soubor-na-task-record, transparent ale tedious), **(b) skriptem `node scripts/agent/backfill-records.mjs`** (auto, audit-trail PR)? Nebo **(c) backfill nedělat** a starý records zůstane bez agent fields (build scripts parsuji jen pokud existuje)?

2. **Q2: Stream A/B/C labeling strategie pro agent records?** Track A autonomous fix (např. SEC-013 → security-engineer agent) = jaký Stream? **(a)** odvodit z affected docs (SEC → docs/22, docs/27 → Stream B), **(b)** každý role má fixed default Stream (security-engineer = Stream B vždy), **(c)** task record Owner sám rozhodne na základě finding domain. Doporučuji (a), ale chci tvůj input.

3. **Q3: Branch protection enforce_admins?** Má zůstat `false` (owner bypass = TY)? Agent run jako TY = teoretický bypass. Nebo `true` aby ani TY nemohl přímý push do main? Risk: pokud `true`, nemůžeš sám ručně commitnout learning-loop API auto-merge → musíme stavět cestu přes service account (něco jako `claude-flow-bot` GitHub App). Doporučuji: zůstat `false` pro pilot, restrukturalizovat až když Make scenario auto-update PATTERNS.md poběží stabilně.

4. **Q4: CRM `/admin/dev-team` route — má být read-only nebo jsou tam kontrolní prvky?** Master plan §7 ukazuje 8 panelů (Now, Queue, Plans, Review Queue, Knowledge, Stats, Cost, Health) — všechny **read-only z gitu / GitHub API**. Žádné akce typu "spustit Tech Lead odsud". Pokud tomu rozumím správně, dashboard nemění žádný state — jen vizualizuje. Potvrď, že nechceš v UI cokoli **měnit** (např. blokovat task v queue přes UI, schvalit plán přes UI). Pokud ano, je to read-only Next.js page + 1-2 API routes pro git/GitHub. Pokud chceš write, scope je 3-4× větší.

5. **Q5: Make scenario license / přístup?** Master plan §10 zmiňuje 5 Make scenarios. Mám předpokládat, že máš **Make Pro** plán (multi-step scenarios, webhook trigger, scheduled run)? Free tier (1k ops/měs) by hraničně stačilo, ale weekly digest + daily triage + reviewers reminder + webhook handler + backpressure check ≈ 800-1200 ops/měs realisticky. Pokud máš **Free**, doporučuji konsolidovat: 1 scenario s multi-trigger (cron 8:00 + 6× daily reminder cron + webhook handler) místo 5 separate. Jaký plán máš?

6. **Q6: Anthropic API key management?** Master plan §2 očekává $3-5/měs pro learning loop. API key musí žít v Make scenario secret store. **NE** v repu, **NE** v Vercel env (Vercel nikdy nevolá API z agent system). Potvrzuješ že máš (nebo vytvoříš) Anthropic console account + API key + Make scenario secret? Bez toho learning loop nefunguje.

7. **Q7: Implementace single PR vs 3 PRs (master plan §12 closing)?** Master plan dává volbu: jeden velký PR (~1500-2500 LOC, ~30+ files) NEBO 3 PRs (Fáze 1, 2, 3 každá samostatně). **Doporučuji 3 PRs** kvůli (a) reviewability — single PR pro tebe nezvladnutelný, (b) safety — pokud Fáze 2 má bug, Fáze 1 už merged a nezablokuje další práci, (c) feedback loop — operator review po Fáze 1 informuje Fáze 2 design. Potvrď.

## 10. Implementační scope (po schválení tohoto reportu)

### Fáze 1 — Core knowledge base + Tech Lead + Bug Hunter

**Files to create (12 souborů):**

| Path | LOC odhad | Co to je |
|---|---|---|
| `docs/agents/README.md` | 80-120 | Entry point — jak číst vault, jak volat Tech Lead, kdy ne |
| `docs/agents/ARCHITECTURE.md` | 150-200 | Master plan §3 + §4 + §5 + Stream-vs-Track explainer |
| `docs/agents/PATTERNS.md` | 30-50 | Empty stub + auto-append hlavička + manual section |
| `docs/agents/PLAYBOOKS.md` | 50-80 | Empty stub s 1-2 sample playbooks |
| `docs/agents/GOTCHAS.md` | 30-50 | Empty stub s "clasp swap risk" + "EXTENSION_COLUMNS pitfall" + "HMAC timing" jako seed entries |
| `docs/agents/REGRESSION-LOG.md` | 20-30 | Empty stub |
| `docs/agents/DECISIONS.md` | 30-50 | Empty stub + 1 sample ADR |
| `docs/agents/QUEUE.md` | 60-100 | Top-10 P2 findings z FINDINGS.md jako initial Track A queue + format spec |
| `docs/agents/QUESTIONS-FOR-HUMAN.md` | 20-30 | Empty stub |
| `docs/agents/RUN-LOG.md` | 20-30 | Empty stub + format spec |
| `docs/agents/roles/tech-lead.md` | 200-300 | Master plan §3.3 + §9 expanded; classification logic; role dispatch logic |
| `docs/agents/roles/bug-hunter.md` | 150-250 | Reproduce → fix → self-review pattern; FF-* + AS-* finding types; sample fix playbook |

**Files to modify (3 soubory):**

| Path | Lines changed | Co změnit |
|---|---|---|
| `CLAUDE.md` | +30-50 | Add "AI Agent Team" sekce s odkazem na docs/agents/, hard rule extensions, Stream-vs-Track callout |
| `docs/30-task-records/_template.md` | +6-8 | Add 4 nové fields (Agent Role, Track, Plan, Autonomous run) + DoD Checklist sekce |
| `docs/14-definition-of-done.md` | +20-30 | Add "Agent Done" 4. sekce |

**Volitelně:**
- `docs/13-doc-update-rules.md` (+5 LOC) — add poznámka "Agent records musí mít Stream A/B/C plus Track A/B."
- `scripts/agent/backfill-records.mjs` (~50 LOC) — backfill 46 existujících records (Q1).

**Total Fáze 1: ~12-15 files, ~1000-1500 LOC, ~3-4h implementation.**

### Fáze 2 — Zbytek rolí + automation infrastructure

**Files to create (6 souborů):**

| Path | LOC odhad | Co to je |
|---|---|---|
| `docs/agents/roles/security-engineer.md` | 150-200 | SEC-* + CC-SEC-* finding patterns; secrets handling; redaction rules per audits/README §"Citlivá data — pravidla redakce" |
| `docs/agents/roles/qa-engineer.md` | 120-180 | Test scenarios authoring; regression suite; test-vs-production gap detection (CC-QA-002 awareness) |
| `docs/agents/roles/docs-guardian.md` | 200-300 | Stream-doc mapping enforcement; build-changelog/build-task-registry orchestration; FINDINGS.md `**Resolved**` convention; docs/13 + docs/14 + check-doc-sync mastery |
| `.github/workflows/agent-pr-validation.yml` | 80-150 | Branch name regex check; task record exists + complete; diff size; secret scan (gitleaks); stream-mapping check |
| `scripts/agent/triage.mjs` | 100-150 | Reads FINDINGS.md (P0..P3 sort) + 29-task-registry.md → produces QUEUE.md |
| `scripts/agent/validate-task-record.mjs` | 50-80 | Used by agent-pr-validation.yml — checks all metadata fields filled, valid enum values, no placeholder |

**Files to modify (1 soubor):**

| Path | Lines changed | Co změnit |
|---|---|---|
| `scripts/docs/build-task-registry.mjs` | +5-10 | Add 9. sloupec `Role` (volitelně, viz Q1) |

**Make scenario template (export JSON, ~3-5 KB):**
- `docs/agents/make/daily-triage-scenario.json` (volitelně committed jako reference; reálný scenario žije v Make).

**Total Fáze 2: ~6-7 files, ~700-1100 LOC, ~3-5h implementation.**

### Fáze 3 — CRM dashboard + learning loop

**Files to create (8-12 souborů):**

| Path | LOC odhad | Co to je |
|---|---|---|
| `crm-frontend/src/app/admin/dev-team/page.tsx` | 200-300 | 8-panel dashboard layout |
| `crm-frontend/src/app/admin/dev-team/components/now-panel.tsx` | 60-100 | File watcher na RUN-LOG.md (server component fetches latest entry) |
| `crm-frontend/src/app/admin/dev-team/components/queue-panel.tsx` | 80-120 | Top-10 z QUEUE.md, classified by track |
| `crm-frontend/src/app/admin/dev-team/components/plans-panel.tsx` | 80-120 | Active plans s % completion |
| `crm-frontend/src/app/admin/dev-team/components/review-queue-panel.tsx` | 100-150 | Unmerged PRs from agents, group by age (GitHub API call) |
| `crm-frontend/src/app/admin/dev-team/components/knowledge-panel.tsx` | 100-150 | Search přes PATTERNS.md / GOTCHAS.md / REGRESSION-LOG.md |
| `crm-frontend/src/app/admin/dev-team/components/stats-cost-health-panels.tsx` | 150-250 | Týdenní stats + Claude Max usage + backpressure |
| `crm-frontend/src/app/admin/dev-team/api/agents/route.ts` | 80-120 | API route — proxy do gitu (`simple-git`) + GitHub API |
| `crm-frontend/src/middleware.ts` | +10-15 lines (modify) | Add `/admin/*` allowlist check (only `OWNER_EMAIL`) |
| `scripts/agent/learn-from-merge.mjs` | 100-150 | Called by Make scenario on PR merged webhook — extracts patterns, posts to GitHub API |
| `docs/agents/make/learning-loop-scenario.json` | (json) | Make scenario export |
| `docs/agents/make/weekly-digest-scenario.json` | (json) | Make scenario export |

**Files to modify (2 soubory):**

| Path | Lines changed | Co změnit |
|---|---|---|
| `crm-frontend/.env.example` | +3-5 | Add `OWNER_EMAIL`, optionally `GITHUB_AGENT_TOKEN` (read-only PAT for dashboard) |
| `crm-frontend/package.json` | +1 dep | Add `simple-git` (or use git CLI via execSync — preferred zero-dep) |

**Total Fáze 3: ~10-12 files, ~1200-2000 LOC, ~6-9h implementation.**

## 11. Estimated effort

| Fáze | Files create | Files modify | LOC | Implementation time | Tests | Cumulative |
|---|---|---|---|---|---|---|
| **Fáze 1** | 12 | 3 | ~1000-1500 | 3-4h | smoke (read all files via check-doc-sync) | 3-4h |
| **Fáze 2** | 6-7 | 1 | ~700-1100 | 3-5h | unit (triage.mjs + validate-task-record.mjs) | 6-9h |
| **Fáze 3** | 10-12 | 2 | ~1200-2000 | 6-9h | integration (page renders without GitHub credentials in dev) | 12-18h |

**Total: ~30 files, ~3000-4500 LOC, ~12-18h implementation.**

(Pokud Q7 = 3 PRs, každý PR ~3-6h + ~1-2h review iteration. Pokud Q7 = 1 PR, ~12-18h jeden go.)

**Realistic with breaks + iterative refinement:** 1.5-2 dní solo work, nebo 3-5 dní přes víc sessions s human review breaks.

---

## Appendix: Sources

| File | Lines | Read |
|---|---|---|
| `~/agent-team-setup-files/03-master-plan.md` | 429 | Full |
| `~/agent-team-setup-files/01-discovery-prompt.md` | 213 | Full |
| `CLAUDE.md` | 216 | Full (via system instructions) |
| `README.md` | 96 | Full |
| `CONTRIBUTING.md` | 107 | Full |
| `docs/09-project-control-tower.md` | 292 | Full |
| `docs/10-documentation-governance.md` | 59 | Full |
| `docs/13-doc-update-rules.md` | 47 | Full |
| `docs/14-definition-of-done.md` | 80 | Full |
| `docs/20-current-state.md` | 108 | Full |
| `docs/22-technical-architecture.md` | 120 | Full |
| `docs/29-task-registry.md` | 58 | Full |
| `docs/30-task-records/_template.md` | 53 | Full |
| `docs/30-task-records/visual-restyle-dark-futuristic-pr1.md` | 135 | Full |
| `docs/30-task-records/A-11.md` | 109 | Full |
| `docs/30-task-records/cleanup-and-sec-016.md` | 113 | Full |
| `docs/30-task-records/B-13.md` | (29k tokens) | Skipped (too large; metadata via registry) |
| `docs/30-task-records/C-11.md` | (26k tokens) | Skipped (too large; metadata via registry) |
| `docs/audits/README.md` | 127 | Full |
| `docs/audits/FINDINGS.md` | 248 | Partial (32k tokens; counts via grep, sample rows via grep) |
| `.github/workflows/docs-governance.yml` | 35 | Full |
| `.github/workflows/pilot-ci.yml` | 82 | Full |
| `.github/workflows/scrape.yml` | 205 | Full |
| `scripts/docs/check-doc-sync.mjs` | 230 | Full |
| `scripts/docs/build-changelog.mjs` | 123 | Full |
| `scripts/docs/build-task-registry.mjs` | 97 | Full |
| `apps-script/.clasp.json` | 17 | Full |
| `apps-script/README.md` | 155 | Full |
| `package.json` (root) | 17 | Full |

**Inventories (ls only):**
- `docs/30-task-records/` — 47 files (1 template + 46 records)
- `docs/audits/` — 5 top-level files + `domains/` + `cross-check/` (not enumerated)
- `docs/agents/` — **NEEXISTUJE** (must be created in Fáze 1)
- `docs/archive/` — 23 files (all out-of-scope per CLAUDE.md zákazy)
- `.github/workflows/` — 3 files (full read above)
- `apps-script/` — 21 .gs files + `.clasp.json` + `appsscript.json` + `tests/`
- `crm-frontend/src/app/` — not enumerated (full inventory deferred to Fáze 3)

**Not read (out of discovery scope):**
- `docs/01-decision-list.md`, `docs/11-change-log.md`, `docs/12-route-and-surface-map.md`, `docs/21-business-process.md`, `docs/23-data-model.md`, `docs/24-automation-workflows.md`, `docs/25-lead-prioritization.md`, `docs/26-offer-generation.md`, `docs/27-infrastructure-storage.md`, `docs/28-risks-bottlenecks-scaling.md` — canonical docs referenced by stream mapping; full read není nutné pro discovery (mapování je v docs/13).
- Většina apps-script `.gs` souborů (kromě README a .clasp.json) — agent SKILL.md nepotřebuje read-all-code; potřebuje rules a patterns.
- `crm-frontend/src/*` většina — Fáze 3 specific.
