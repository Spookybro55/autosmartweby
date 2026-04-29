# Run Log — Agent Activity

> **Append-only.** Tech Lead writes one entry per discrete step (claim
> task, classify, dispatch role, self-review, open PR, etc.). The CRM
> dashboard "Now" panel (Phase 3) tails this file.
>
> **Format per entry:**
> ```
> ### {YYYY-MM-DD HH:MM} | {role} | {task-id} | {step} | {outcome}
> - **Notes:** optional, brief
> - **Refs:** optional commit / PR / file:line
> ```
>
> **Steps vocabulary** (Tech Lead defines, others reuse):
> - `claim` — picked task from QUEUE / plan
> - `classify` — assigned Stream + Track + role(s)
> - `dispatch` — handed off to role role
> - `repro` — reproduced bug (Bug Hunter)
> - `fix` — implemented change
> - `test` — ran tests (or wrote test)
> - `self-review` — reread own diff
> - `cross-review` — Tech Lead review of role output
> - `dod-check` — ran 4 sub-DoDs
> - `commit` — git commit
> - `push` — git push
> - `pr-open` — gh pr create
> - `block` — blocked, escalated to QFH
> - `complete` — task done, moved to next
>
> **Outcomes vocabulary:**
> - `OK` — step succeeded
> - `FAIL` — step failed
> - `BLOCKED` — needs human input
> - `RETRY` — retrying same step (max 3)
>
> Long Sebastián-only sessions (planning conversations, manual reviews)
> are not logged here — RUN-LOG is for autonomous and semi-autonomous
> agent activity only.

---

*No entries yet. First entry will be the first agent-driven task in Phase 2+.*
