# Change Log — Autosmartweby

> **Auto-generated** from task records (`docs/30-task-records/`).
> Regenerate: `node scripts/docs/build-changelog.mjs`
> Do NOT edit manually — changes will be overwritten.

---

## 2026-04-05

### [A/A1] [SAMPLE] Scraping pipeline — data vstup do LEADS — DRAFT
- **Scope:** Implementace prvniho zdroje dat pro LEADS sheet. Definice formatu vstupu, mapovani sloupcu, validace.
- **Docs:** docs/20-current-state.md, docs/23-data-model.md, docs/24-automation-workflows.md

### [B/B1] [SAMPLE] Preview web generator — webhook service — DRAFT
- **Scope:** Implementace externi sluzby pro generovani preview webu z briefu. Napojeni na existujici webhook pipeline.
- **Docs:** docs/20-current-state.md, docs/22-technical-architecture.md, docs/26-offer-generation.md, docs/27-infrastructure-storage.md

### [C/C1] [SAMPLE] Lead qualification tuning — enterprise filter — DRAFT
- **Scope:** Uprava kvalifikacni logiky — zpreseni enterprise/chain filtru, pridani novych kriterii.
- **Docs:** docs/20-current-state.md, docs/21-business-process.md, docs/24-automation-workflows.md, docs/25-lead-prioritization.md

### [C/C2] Hardening audit — přepis sekce Souhrn v docs/20 — DONE
- **Scope:** Nahrazení sekce „Souhrn" v docs/20-current-state.md schváleným textem z hardening auditu. Text explicitně rozlišuje commitnutý kód, governance vrstvu (definovaná/validovaná/nevynucovaná) a uncommitted změny v working tree.
- **Owner:** claude
- **Code:** — (—)
- **Docs:** docs/20-current-state.md

### [C/C3] Repo governance hardening — CLAUDE.md, branch protection, cleanup — DONE
- **Scope:** Kompletni hardening repa pro 3-osobni tym: nahrazeni CLAUDE.md (z generickeho RuFlo V3 na project-specific governance), nahrazeni docs/13 (.new → aktivni), nastaveni branch protection na GitHubu, pridani collaboratora, odstraneni duplicit a smeti, aktualizace docs/github-collaboration-setup.md.
- **Owner:** claude
- **Code:** CLAUDE.md (modified), scripts/check-doc-sync.mjs (deleted)
- **Docs:** CLAUDE.md, docs/13-doc-update-rules.md, docs/github-collaboration-setup.md, docs/00-folder-inventory.md, docs/00-project-map.md, docs/CRM-SYSTEM-MAP.md
