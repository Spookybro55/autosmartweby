# `docs/agents/` — AI Agent Team Vault

> **Co to je:** Knowledge base + role definitions + queue + run history pro
> AI agent tým, který obsluhuje projekt Autosmartweby.
>
> **Co to není:** Public dokumentace produktu. Ne pro klienty. Interní operační
> vrstva mezi ownerem (Sebastián) a agenty.

---

## Pro Sebastiána

### Jak to spustit

```bash
$ claude
> "vezmi další task z queue"          # Track A — autonomous bug fix
> "exekutuj aktivní plány"            # Track B — plan-driven feature
> "pokračuj v plánu phase-3-medic"    # Track B — specific plan
```

Claude Code načte `docs/agents/roles/tech-lead.md` jako default role context. Tech
Lead pak rozhoduje, kdy si vystřídá role (Bug Hunter, Security Engineer, atd.).

**NEŘÍKEJ** "Bug Hunter, udělej X". Tech Lead je single point of dispatch.

### Kde co najít

| Hledáš | Soubor |
|---|---|
| Co tahle architektura DĚLÁ a NEDĚLÁ | `ARCHITECTURE.md` |
| Aktuální Track A queue | `QUEUE.md` |
| Aktivní Track B plány | `plans/ACTIVE/` |
| Co agent dělal kdy | `RUN-LOG.md` |
| Co potřebuje tvoje rozhodnutí | `QUESTIONS-FOR-HUMAN.md` |
| "Když AS vrátí X, příčina je Y" | `PATTERNS.md` |
| "Tohle už bylo opraveno jednou" | `REGRESSION-LOG.md` |
| Project-specific gotchas (clasp swap, atd.) | `GOTCHAS.md` |
| Ručně psané recepty | `PLAYBOOKS.md` |
| Architecture decisions | `DECISIONS.md` |
| Co máš manuálně udělat před Phase 3 | `SETUP-CHECKLIST.md` |
| Discovery audit (locked, frozen) | `_discovery-report.md` |
| Co která role dělá | `roles/{role}.md` |

### Obsidian vault setup (volitelné)

```
File → Open vault → C:\Users\spook\Nabídka weby\docs\agents
```

Graph view ukáže propojení patterns ↔ tasks ↔ gotchas. Můžeš si tam i sám psát
do `## Manual entries` sekcí PATTERNS / GOTCHAS / REGRESSION-LOG. `.obsidian/`
je gitignored.

### Co se DEJ A NEDEJ z dashboardu

CRM `/admin/dev-team` (Phase 3) je **read-only**. Vidíš tam 8 panelů (Now / Queue
/ Plans / Review Queue / Knowledge / Stats / Cost / Health) ale **NEMŮŽEŠ tam
nic spustit**. Agenti se vždy spouští z terminálu (claude). Dashboard je jen
visualizace.

---

## Pro agenta (každá role SKILL musí přečíst tento řádek)

**Než cokoli začneš:**
1. Přečti `ARCHITECTURE.md` — zejména sekci 7 (NEOBJEDITELNÉ guardraily) a sekci 8 (audit prefixy).
2. Přečti svůj `roles/{your-role}.md` SKILL.
3. Přečti relevantní entries v `GOTCHAS.md` (3 seed entries jsou load-bearing).
4. Pokud Track A: přečti `QUEUE.md`. Pokud Track B: přečti `plans/ACTIVE/{plan-id}.md`.
5. Tvůj výstup končí PR (nikdy přímý merge), update `RUN-LOG.md`, update `QUEUE.md`.

**Za žádných okolností:**
- Necommituj secrets (`.env*`, API keys, hesla, sheet IDs > 20 znaků v jasném textu)
- Nemodifikuj `docs/archive/`, `apps-script/.clasp.json`, Apps Script Script Properties
- Nepushuj přímo do `main` (vždy přes PR)
- Neignoruj `node scripts/docs/check-doc-sync.mjs` failure
- Nepřepisuj task records jiných agentů
- Nemažeš ani nemodifikuješ `_discovery-report.md` (locked, Phase 0 audit output)

Pokud narazíš na situaci, kde nevíš, co dělat → **NEUHADUJ**, vytvoř entry v
`QUESTIONS-FOR-HUMAN.md` a označ task jako `blocked` v QUEUE.md.

---

## Mapa Phase 1 → Phase 3

| Phase | Co je v ní | Status |
|---|---|---|
| **Phase 0** | Discovery audit | Done. `_discovery-report.md` locked. |
| **Phase 1** | Vault structure + Tech Lead + Bug Hunter | **This PR** |
| **Phase 2** | Security + QA + Docs Guardian + CI workflow + triage script | Next PR po Phase 1 merge |
| **Phase 3** | CRM dashboard + Make scenarios + learning loop | After Phase 2 merge + manual API key setup |

Detail: `_discovery-report.md` Sekce 10-11.

---

## Linked external docs

- Master plan: `~/agent-team-setup-files/03-master-plan.md` (mimo repo, lokální)
- Project governance: `CLAUDE.md`, `docs/13-doc-update-rules.md`, `docs/14-definition-of-done.md`
- Audit findings: `docs/audits/FINDINGS.md`, `docs/audits/12-summary.md`
- Task records: `docs/30-task-records/` (46 records před Phase 1)
- Project boundary callout: `CLAUDE.md` § "Project boundary" — internal system vs `Spookybro55/ASW-MARKETING-WEB`
