# Fáze 6 — Deploy Pipeline Audit

> **Cíl:** Zjistit, jestli z GitHub repa jde deterministicky nasadit do TEST a PROD. A jestli je TEST bezpečně oddělený od PROD.
> **Scope:** `.clasp.json`, `appsscript.json`, GitHub Actions workflows, deploy scripts, deploy docs.

Tento soubor vyplňuje Fáze 6.

---

## A. Clasp setup

1. Kolik `.clasp.json` v repu a kde?
2. Přepínání TEST vs PROD
3. Ochrana proti omylem pushnutí do PROD
4. `.clasprc.json` v `.gitignore`?
5. `.claspignore` — co se nepushuje

## B. Apps Script deploy flow

6. Deploy do TEST — postup
7. Deploy do PROD — postup
8. Kdo může deploynout do PROD
9. `clasp push` vs `clasp deploy` (verze)
10. Rollback strategie

## C. CI/CD

11. GitHub Action pro clasp push?
12. Auth clasp v CI (refresh token v secrets?)
13. GH secrets scope (Environment vs Repository)
14. Separate workflow TEST vs PROD, required reviewers

## D. Frontend deploy

15. Kam deployuje (Vercel / self-hosted / jiné)
16. Automatic from git push? Which branch?
17. Preview deployments pro PR
18. Env variables dokumentovaný seznam
19. Secrets rotation

## E. Deployment konzistence

20. Frontend ↔ backend inconsistency detection
21. Version stamp v backendu

## F. Dokumentace

22. DEPLOY.md / README sekce
    - First-time setup
    - Regular deploy
    - Rollback
    - Secrets rotation
23. Dokumentace vs realita

## G. TEST/PROD data isolation v kódu

24. Grep hardcoded Sheet IDs `\b1[A-Za-z0-9_-]{40,}\b` v kódu
25. `SpreadsheetApp.openById(...)` call sites — odkud je ID
26. Centralized `Config.js` / `Environment.js`

---

## Findings (DP-XXX)

_(kritické: každý hardcoded Sheet ID / secret → P0)_

| ID | Popis | Severity | Evidence |
|----|-------|----------|----------|

Plný seznam v [../FINDINGS.md](../FINDINGS.md).
