# Fáze 10 — Docs & Onboarding Audit

> **Cíl:** Ověřit kvalitu dokumentace z pohledu nového developera i nového obchodníka.
> **Scope:** všechny `.md` soubory v repu, JSDoc komentáře, komentáře obecně.

Tento soubor vyplňuje Fáze 10.

---

## A. README audit

1. Root README obsahuje:
   - Co systém dělá
   - Architektura vysoké úrovně
   - Prerekvizity
   - Setup
   - Deploy
   - Troubleshooting
   - Kontakty / ownership
2. `crm-frontend/README.md`
3. Apps Script README

## B. Architektonická dokumentace

4. ARCHITECTURE.md / docs/architecture.md
   - High-level komponenty
   - Data flow
   - Deployment model
   - Design decisions

## C. API dokumentace

5. Apps Script webapp endpoints
6. Frontend API routes
7. Data schema

## D. Provozní dokumentace

8. Runbook (incident response)
9. Rotace tajemství
10. Backup / restore

## E. Onboarding

11. CONTRIBUTING.md
12. Code style guide
13. Git workflow (branch naming, PR process)
14. Review proces

## F. In-code dokumentace

15. JSDoc coverage %
16. Komentáře aktuální? (náhodný vzorek 10 funkcí)
17. Zavádějící komentáře

## G. Dokumentace pro obchodníka (non-dev)

18. User guide / manuál
19. Training material

## H. Freshness

20. Last update top dokumentů
21. Dokumenty popisující neexistující features

---

## Findings (DOC-XXX)

| ID | Popis | Severity | Evidence |
|----|-------|----------|----------|

Plný seznam v [../FINDINGS.md](../FINDINGS.md).
