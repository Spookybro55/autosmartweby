# Questions for Human — Escalation Log

> **Append-only.** Tech Lead writes here when an agent run hits an
> out-of-scope decision, a 3rd consecutive failure, or an ambiguous spec.
>
> Sebastián resolves entries by editing the `Answer` field and changing
> `Status` to `resolved`. Tech Lead picks resolved entries up on next
> session and unblocks the corresponding QUEUE entry.
>
> **Format per entry:**
> ```
> ### QFH-{NNNN}: {Short title}
> - **Date:** YYYY-MM-DD HH:MM (Europe/Prague)
> - **From role:** tech-lead / bug-hunter / security-engineer / qa-engineer / docs-guardian
> - **Task:** {task-id or finding-id}
> - **Track:** A / B
> - **Question:** what's blocking; what alternatives are on the table
> - **Tried:** what agent tried before escalating (if applicable)
> - **Status:** open / resolved / dropped
> - **Answer:** Sebastián's resolution (filled when status flips)
> - **Resolved at:** YYYY-MM-DD HH:MM
> ```

---

### QFH-0001: Anthropic API key creation (manual browser step)

- **Date:** 2026-04-29 22:40 (Europe/Prague)
- **From role:** docs-guardian (autonomous setup)
- **Task:** AGENT-TEAM-PHASE-3-PREREQUISITES
- **Track:** B
- **Question:** Anthropic API key creation requires browser session — nelze
  automatizovat. Tech Lead potřebuje key pro Phase 3 learning loop scenarios.
- **Tried:** Created `~/.config/anthropic/` config dir s mode 700. Wrote
  step-by-step instructions to `/tmp/anthropic-key-instructions.md`.
- **Status:** open
- **Answer:** _(awaiting Sebastián manual step per `/tmp/anthropic-key-instructions.md`)_
- **Resolved at:** —

### QFH-0002: Vercel preview env OWNER_EMAIL — git repo not connected

- **Date:** 2026-04-29 22:42 (Europe/Prague)
- **From role:** docs-guardian (autonomous setup)
- **Task:** AGENT-TEAM-PHASE-3-PREREQUISITES
- **Track:** B
- **Question:** Vercel project `autosmartweby` má v Vercel API status
  "Project does not have a connected Git repository". Bez Git connection
  Vercel CLI v52 neumí přidat preview env (vyžaduje per-branch či wildcard,
  ale bez git = error). Production ✓, Development ✓, Preview ✗.
- **Tried:** `vercel env add OWNER_EMAIL preview --value ... --yes` →
  api_error. `vercel env add OWNER_EMAIL preview * --value ... --yes` →
  same. `vercel env add OWNER_EMAIL preview main --value ... --yes` → same.
- **Status:** open
- **Answer:** _(Sebastián: open https://vercel.com/spookybro55s-projects/autosmartweby/settings/git
  → connect to `Spookybro55/autosmartweby` GitHub repo, OR manually add
  OWNER_EMAIL preview via UI Settings → Environment Variables)_
- **Resolved at:** —

### QFH-0003: Vercel orphan project `crm-frontend` (cleanup recommended)

- **Date:** 2026-04-29 22:42 (Europe/Prague)
- **From role:** docs-guardian (autonomous setup)
- **Task:** AGENT-TEAM-PHASE-3-PREREQUISITES
- **Track:** B
- **Question:** Při `vercel link --yes` z `crm-frontend/` Vercel CLI auto-
  vytvořilo nový projekt `crm-frontend` (bez deploye, bez git repo). Existující
  pilot deployment `autosmartweby` byl ten správný target. Re-linkuli na
  `autosmartweby`. Orphan `crm-frontend` projekt zůstává v Vercel účtu se
  2 env vars (OWNER_EMAIL production + development), bez deploye, bez kódu.
- **Tried:** `rm -rf .vercel` + `vercel link --yes --project autosmartweby`
  → success. Orphan project NEZRUŠEN automaticky.
- **Status:** open
- **Answer:** _(Sebastián: Vercel Dashboard → spookybro55s-projects →
  crm-frontend → Settings → Delete Project. Žádný deploy nezávisí na něm.)_
- **Resolved at:** —

### QFH-0004: Make blueprint format invalid — need reference template from UI export

- **Date:** 2026-04-29 23:00 (Europe/Prague)
- **From role:** docs-guardian (autonomous setup follow-up)
- **Task:** AGENT-TEAM-PHASE-3-PREREQUISITES (PR #90, merged as `ccd8714`)
- **Track:** B
- **Question:** 5 Make scenario JSONs v `docs/agents/make/0{1..5}-*.json`
  failují import s "invalid blueprint" v Make UI. Použili jsme zjednodušený
  JSON format bez exact Make blueprint struktury — top-level metadata blok
  chybí, moduly použily zjednodušené IDs (`github:WatchFiles`) místo
  Make-catalog IDs (`github-app:listFiles` apod.), `flow` array postrádá
  `mapper` / `parameters` / `metadata` wrapping. **Phase 3 learning loop
  blocking** dokud nemáme funkční blueprintů.
- **Tried:** Generated 5 JSONs based on master plan §10 description +
  general Make scenario understanding. Bez exported reference z Make UI
  nelze přesný format zrekonstruovat — Claude Code CLI nemá Make UI access
  ani Make API credentials. WebSearch by mohl najít blueprint structure
  docs ale to je guess approach; lepší je real export z Sebastiánova
  Make účtu (matches jeho region + account schema verze).
- **Status:** open — **blocking Phase 3 learning loop activation**
- **Answer:** _(awaiting Sebastián, ~2 minuty práce)_

  **Postup pro odblokování:**
  1. V Make UI vytvoř prázdný scenario s 1 trigger + 1 HTTP action.
     Doporučení: GitHub `Watch issues` modul (nepotřebuje webhook URL pro
     test export) + HTTP `Make a request` modul. Vyber jakékoli moduly,
     pointa je získat **valid blueprint structure**, ne functional scenario.
  2. Save scenario (i bez aktivace).
  3. Scenario menu (... vpravo nahoře) → **Export Blueprint** → stáhne JSON.
  4. Pošli stažený JSON do Claude Code session **NEBO** ulož do
     `~/agent-team-setup-files/make-reference-blueprint.json` a napiš mi.
  5. Claude pak otevře nový branch `fix/make-blueprints-format`, přepíše
     všech 5 blueprints podle real format, otevře follow-up PR.

  **Alternativní cesta** (pokud Make export taky failí nebo Sebastián
  nechce řešit): označ JSON soubory jako `*-DESCRIPTION.md` (markdown s
  pseudokódem), Sebastián si scenarios v Make UI postaví manuálně podle
  IMPORT-GUIDE.md popisů. JSON soubory pak žijí jako reference description,
  ne import target.
- **Resolved at:** —

### QFH-0005: Post-merge closure routine missing from `tech-lead.md` SKILL

- **Date:** 2026-04-30 (Europe/Prague)
- **From role:** tech-lead (self-retrospective from DP-001)
- **Task:** DP-001 closure
- **Track:** A
- **Question:** Workflow §5 step 11–13 končí na `pr-open` + RUN-LOG `complete` + QUEUE update. Chybí explicit post-merge steps:
  - **(a) Wait for merge confirmation** (no auto-assume) — agent runs to `pr-open` and reports; resumption after merge needs explicit signal from owner. Currently undocumented.
  - **(b) `git pull origin main` + verify** — must happen before any next-task work to avoid stale-base branches. Not in the workflow diagram.
  - **(c) Auto-delete remote branch** — `git push origin --delete <branch>` after squash-merge is **standard housekeeping, not "ask owner"**. SKILL currently doesn't mandate it; DP-001 closure had to ask.
  - **(d) `complete` RUN-LOG entry placement** — chicken-egg: §5 step 11 says `complete` is the Final entry, but final entry only knows the merge SHA *post-merge*, which is *post-PR*. Two viable options:
    - **(d.1)** Append `complete` entry inside the original PR using `at HEAD` placeholder, then post-merge follow-up commit bumps to actual SHA → 2 PRs per task.
    - **(d.2)** Defer `complete` entry to *next* Track A run's RUN-LOG additions (first append at session start = `complete: previous-task (PR #N, merge {sha})` → `claim: next-task`) → 1 PR per task, slight async log lag.
    - **Sebastián decided 2026-04-30:** option **(d.2)** is policy. Less PR noise. Encode in tech-lead.md.
  - **(e) Re-run `triage.mjs` after merge** — current approach captures triage output **inside the resolving PR** (anticipates own merge → optimistic). After merge, the actual triage state is identical (DP-001 was already marked Resolved in the PR). But for tasks where merge introduces external changes (other PRs land in between), the in-PR triage snapshot is stale at merge time. Three options:
    - **(e.1)** Bundle re-triage into the *next* Track A run's first commits (matches policy from (d.2)).
    - **(e.2)** Open separate housekeeping PR per closure → overhead.
    - **(e.3)** Direct push to main → blocked by branch protection per CLAUDE.md hard rule.
  - **(d.2) + (e.1) implication:** the next Track A run's PR carries housekeeping for the *previous* run alongside its own work. Task records and commit messages need to acknowledge the pattern so reviewers don't see it as scope creep.
- **Tried:** Followed §5 to step 10 (`pr-open`); paused at step 11 since `complete` requires merge SHA. Closure was orchestrated through ad-hoc Q&A with Sebastián this session — not from a documented routine.
- **Status:** open — **policy partially decided (d.2), full SKILL update pending**
- **Answer:** _(Sebastián fills in via Track B plan `agent-team-skill-improvements-v1`. Decision (d.2) already given 2026-04-30. Open items: encode (a)–(e) explicitly in `docs/agents/roles/tech-lead.md` §5 (extend to step 14 = `closure-bundle-into-next`); update `docs-guardian.md` §6 to note the bundled-housekeeping pattern; possibly add `git push origin --delete` + `git pull --ff-only origin main` to bug-hunter / docs-guardian close-out checklists; consider GitHub repo setting "Automatically delete head branches" to remove (c) from agent's plate entirely.)_
- **Resolved at:** —
