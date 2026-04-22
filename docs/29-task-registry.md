# Task Registry — Autosmartweby

> **Auto-generated** from task records (`docs/30-task-records/`).
> Regenerate: `node scripts/docs/build-task-registry.mjs`
> Do NOT edit manually — changes will be overwritten.

---

| Task ID | Stream | Title | Owner | Status | Date | Affected Docs | Code Areas |
|---------|--------|-------|-------|--------|------|---------------|------------|
| A1 | A | Scraping Job Input Contract | Stream A | done | 2026-04-06 | docs/23-data-model.md, docs/20-current-state.md, docs/24-automation-workflows.md, docs/30-task-records/A1.md | docs, crm-frontend |
| A10 | A | Ingest runtime bridge — LEADS append + segment ... | Stream A | done | 2026-04-17 | docs/20-current-state.md, docs/24-automation-workflows.md, docs/30-task-records/A10.md | apps-script |
| A2 | A | RAW_IMPORT Staging Layer | Stream A | done | 2026-04-06 | docs/20-current-state.md, docs/23-data-model.md, docs/24-automation-workflows.md, docs/30-task-records/A2.md | docs, crm-frontend |
| A3 | A | Normalization Raw to LEADS Rules | Stream A | done | 2026-04-06 | docs/20-current-state.md, docs/23-data-model.md, docs/24-automation-workflows.md, docs/30-task-records/A3.md | docs |
| A4 | A | firmy.cz scraper — 1 portal runtime | Stream A | done | 2026-04-11 | docs/20-current-state.md, docs/23-data-model.md, docs/24-automation-workflows.md, docs/30-task-records/A4.md | scripts |
| A5 | A | Dedupe & company_key matching | Stream A | done | 2026-04-16 | - | apps-script, docs |
| A6 | A | Auto web check hook | Stream A | done | 2026-04-17 | - | apps-script, scripts, docs |
| A7 | A | Auto qualify hook | Stream A | done | 2026-04-17 | docs/20-current-state.md, docs/24-automation-workflows.md | apps-script, scripts, docs |
| A8 | A | Preview queue → BRIEF_READY | Stream A | done | 2026-04-20 | docs/20-current-state.md, docs/24-automation-workflows.md | apps-script, scripts, docs |
| A9 | A | Ingest quality report per source_job_id | Stream A | done | 2026-04-20 | docs/20-current-state.md, docs/23-data-model.md, docs/24-automation-workflows.md | apps-script, scripts, docs |
| B1 | B | Preview brief data contract — formalizace datov... | — | done | 2026-04-05 | docs/23-data-model.md, docs/26-offer-generation.md, docs/30-task-records/B1.md | crm-frontend |
| B2 | B | Preview renderer na sample briefu | — | done | 2026-04-08 | docs/20-current-state.md, docs/22-technical-architecture.md, docs/26-offer-generation.md, docs/30-task-records/B2.md | crm-frontend |
| B3 | B | Template family mapping vrstva mezi template_ty... | — | done | 2026-04-17 | docs/20-current-state.md, docs/22-technical-architecture.md, docs/26-offer-generation.md, docs/30-task-records/B3.md | crm-frontend, scripts, package.json (monorepo root) |
| B4 | B | Preview render endpoint — POST /api/preview/render | Stream B | done | 2026-04-20 | docs/12-route-and-surface-map.md, docs/20-current-state.md, docs/22-technical-architecture.md, docs/26-offer-generation.md, docs/30-task-records/B4.md | crm-frontend, scripts, package.json |
| B5 | B | Preview URL return + statusy (caller-side + lif... | Stream B | done | 2026-04-21 | docs/20-current-state.md, docs/22-technical-architecture.md, docs/23-data-model.md, docs/24-automation-workflows.md, docs/26-offer-generation.md, docs/30-task-records/B5.md | apps-script, scripts, package.json |
| BX1 | B | CRM write path — doPost handler for frontend wr... | Stream B | done | 2026-04-17 | docs/20-current-state.md, docs/30-task-records/BX1.md | apps-script |
| C-04 | C | Sendability Gate pravidla — autoritativni SPEC ... | Claude | done | 2026-04-21 | docs/24-automation-workflows.md, docs/21-business-process.md, docs/20-current-state.md | — |
| C-05 | C | Outbound queue + send payload kontrakt — SPEC-o... | Claude | done | 2026-04-21 | docs/24-automation-workflows.md, docs/20-current-state.md | — |
| C-06 | C | Provider abstraction + sender interface — SPEC-... | Claude | done | 2026-04-21 | docs/24-automation-workflows.md, docs/20-current-state.md | — |
| C-07 | C | Inbound event ingest — SPEC-only kontrakt pro r... | Claude | done | 2026-04-21 | docs/24-automation-workflows.md, docs/20-current-state.md | — |
| C-08 | C | Follow-up engine — SPEC-only sekvence / časován... | Claude | done | 2026-04-21 | docs/24-automation-workflows.md, docs/20-current-state.md | — |
| C-09 | C | Exception queue & human-in-the-loop — SPEC-only... | Claude | done | 2026-04-21 | docs/24-automation-workflows.md, docs/20-current-state.md | — |
| C-10 | C | Automation performance report — SPEC-only kontr... | Claude | done | 2026-04-21 | docs/24-automation-workflows.md, docs/20-current-state.md | — |
| C-11 | C | Config, secrets, limity a budget guardrails — S... | Claude | done | 2026-04-22 | docs/24-automation-workflows.md, docs/20-current-state.md | — |
| C2 | C | Hardening audit — přepis sekce Souhrn v docs/20 | claude | done | 2026-04-05 | docs/20-current-state.md | — |
| C3 | C | Repo governance hardening — CLAUDE.md, branch p... | claude | done | 2026-04-05 | CLAUDE.md, docs/13-doc-update-rules.md, docs/github-collaboration-setup.md, docs/00-folder-inventory.md, docs/00-project-map.md, docs/CRM-SYSTEM-MAP.md | CLAUDE.md, scripts |
| C4 | C | Post-audit docs corrections — docs/20, docs/23,... | claude | done | 2026-04-05 | docs/20-current-state.md, docs/23-data-model.md, CLAUDE.md, docs/13-doc-update-rules.md | — |
| CS1 | C | Definovat end-to-end lifecycle leadu jako state... | Claude | done | 2026-04-05 | docs/21-business-process.md, docs/23-data-model.md, docs/20-current-state.md, docs/11-change-log.md, docs/29-task-registry.md | *(zadne code changes)* |
| CS2 | C | Navrhnout workflow orchestrator — co spousti co... | Claude | done | 2026-04-05 | docs/24-automation-workflows.md, docs/20-current-state.md | *(zadne code changes)* |
| CS3 | C | Definovat idempotency keys, retry politiku a de... | Claude | done | 2026-04-05 | docs/24-automation-workflows.md, docs/20-current-state.md | *(zadne code changes)* |

*30 tasks total.*
