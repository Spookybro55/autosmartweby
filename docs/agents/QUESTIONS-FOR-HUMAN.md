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
