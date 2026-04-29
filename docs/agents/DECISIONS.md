# Decisions (ADRs) — Agent Team

> **Manual log** of architectural decisions for the agent team. Append-only.
> Don't rewrite past decisions — supersede them with a new ADR if needed.
>
> **Format per entry:**
> ```
> ## ADR-{NNN}: {Short title}
> - **Date:** YYYY-MM-DD
> - **Status:** Proposed / Accepted / Superseded by ADR-{NNN} / Deprecated
> - **Context:** why this decision was needed
> - **Decision:** what was decided
> - **Consequences:** trade-offs, risks, follow-ups
> - **References:** related findings, master plan section, discovery report
> ```

---

## ADR-001: Adopt agent team architecture

- **Date:** 2026-04-29
- **Status:** Accepted
- **Context:** Sebastián owns Autosmartweby solo, with a backlog of ~67 open
  audit findings (`docs/audits/FINDINGS.md`) plus ongoing Track B feature
  work (Phase 2/3 product roadmap). Manual workflow is the bottleneck. Three
  options were considered:
  1. Hire human contractor / dev (slow, $$$, onboarding cost on existing
     governance discipline).
  2. Multi-process multi-agent framework (CrewAI / AutoGen / agentic-flow
     swarm). Higher complexity, runtime daemon, IPC overhead.
  3. Single Claude Code session with file-based knowledge base + role
     SKILL loading. Re-uses existing Claude Max subscription, zero new
     runtime, governance preserved.
- **Decision:** Option 3 — file-based knowledge base under `docs/agents/`,
  5 roles loaded as SKILL system prompts, Make orchestrace pro async ticks.
  Per master plan v1.0 (`~/agent-team-setup-files/03-master-plan.md`) +
  discovery report (`docs/agents/_discovery-report.md`) Sekce 10.
- **Consequences:**
  - **Wins:** $0-5/měs incremental cost, no new runtime, agenti respektují
    existing governance (CLAUDE.md, docs/13, docs/14, branch protection, audit
    findings, task records). Roles jsou plain markdown — diff-able a
    review-able. Obsidian vault compat.
  - **Trade-offs:** Agent isn't "always on" — vyžaduje Sebastián trigger.
    Quota constraints (Claude Max 5h limit, 30 prompts/day soft cap, 50 PRs
    /měs hard). Self-review nahrazuje human peer review pre-PR — risk
    halucinace pokud Tech Lead role nezachytí.
  - **Mitigations:** Stop conditions (master plan §5) + escalation log
    (`QUESTIONS-FOR-HUMAN.md`) + cross-role review before PR + Sebastián
    review na PR.
  - **Follow-ups:** ADR-002 (Make plan Core $9/měs vs Free), ADR-003
    (Anthropic API key management), pravidelná re-evaluace po 4 týdnech
    provozu (escalate to Max 20x pokud queue se hromadí).
- **References:**
  - Master plan v1.0 §1-§16
  - Discovery report Sekce 1, 8, 9, 10
  - Findings: not directly resolving any single finding; meta-decision
    o tom, jak findings řešit.

---

*Add new ADRs below as architecture evolves.*
