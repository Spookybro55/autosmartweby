# Change Log — Autosmartweby

> **Auto-generated** from task records (`docs/30-task-records/`).
> Regenerate: `node scripts/docs/build-changelog.mjs`
> Do NOT edit manually — changes will be overwritten.

---

## 2026-04-05

### [A/A1] Scraping Job Input Contract — WIP
- **Scope:** Definice kanonickeho datoveho kontraktu pro jeden scraping job. 1 job = 1 query na 1 portalu v 1 meste/segmentu. Kontrakt obsahuje 11 poli (7 required, 4 optional), lifecycle envelope (created/running/completed/failed) a deterministicky `source_job_id` odvozeny z (portal, segment, city, district, max_results, creation second) pres SHA-256 hash10. Zadne nested objekty. Zaklad pro A-02 staging layer a A-04 scraper runtime.
- **Owner:** Stream A
- **Code:** docs/contracts/scraping-job-input.schema.json (new), docs/contracts/scraping-job-input.md (new), crm-frontend/src/lib/contracts/scraping-job-input.ts (new)
- **Docs:** docs/23-data-model.md, docs/30-task-records/A1.md

### [B/B1] [SAMPLE] Preview web generator — webhook service — DRAFT

### [C/C1] [SAMPLE] Lead qualification tuning — enterprise filter — DRAFT

### [C/C2] Hardening audit — přepis sekce Souhrn v docs/20 — DONE
- **Owner:** claude

### [C/C3] Repo governance hardening — CLAUDE.md, branch protection, cleanup — DONE
- **Owner:** claude

### [C/C4] Post-audit docs corrections — docs/20, docs/23, governance wording — DONE
- **Owner:** claude
