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

### [B/B3] Google Auth Phase 1 — Google Identity Services login — WIP
- **Scope:** Pridani Google OAuth prihlasovani do CRM frontendu pomoci Google Identity Services SDK. Existujici email+heslo login zustava jako fallback. Session je HMAC-SHA256 signed cookie (timing-safe verifikace pres crypto.subtle.verify).
- **Owner:** claude
- **Code:** crm-frontend/src/app/api/auth/google/route.ts (new), crm-frontend/src/app/api/auth/logout/route.ts (new), crm-frontend/src/app/api/auth/me/route.ts (new), crm-frontend/src/hooks/use-session.ts (new), crm-frontend/src/app/login/page.tsx (modified), crm-frontend/src/components/layout/header.tsx (modified), crm-frontend/src/components/layout/sidebar.tsx (modified), crm-frontend/.env.example (modified), apps-script/ContactSheet.gs (modified)
- **Docs:** docs/20-current-state.md, docs/22-technical-architecture.md

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

### [C/C4] Post-audit docs corrections — docs/20, docs/23, governance wording — DONE
- **Scope:** Oprava fakticke nepravdy v docs/20-current-state.md (Souhrn tvrdil "frontend neobsahuje dashboard" — commitnuty kod ho obsahuje). Oprava poctu extension sloupcu v docs/23 (43 → 45). Zpreseni governance wordingu v CLAUDE.md a docs/13 — CI vynucuje aktuálnost generated files, ale nevynucuje existenci task recordu.
- **Owner:** claude
- **Code:** — (—)
- **Docs:** docs/20-current-state.md, docs/23-data-model.md, CLAUDE.md, docs/13-doc-update-rules.md
