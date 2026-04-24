# Fáze 7 — Security & Secrets Audit

> **Cíl:** Dedicated sekuritní sken. Konsoliduje a prohlubuje findings z fází 3, 4, 6.
> **Scope:** celé repo + Git historie.

Tento soubor vyplňuje Fáze 7.

---

## A. Secrets v kódu (current state)

### Grep patterns

- Generické: `api[_-]?key`, `secret`, `password`, `token`, `auth`, `bearer`
- Specifické: `sk-`, `ghp_`, `gho_`, `ghs_`, `AIza`, `xox[bpars]-`, `Bearer `, `Basic `
- Sheet IDs: `\b1[A-Za-z0-9_-]{40,}\b`
- AWS: `AKIA[0-9A-Z]{16}`
- Private keys: `BEGIN RSA PRIVATE`, `BEGIN PRIVATE KEY`, `BEGIN OPENSSH`

### Matches (redacted)

| Pattern | Soubor:řádek | Typ | First 4 chars |
|---------|---------------|-----|----------------|

---

## B. Secrets v Git historii

### Historical grep

`git log --all -p | grep -iE '<pattern>'` per pattern

### Historical findings

_(pokud nalezeno → P0 "rotate + cleanup history", akce se **neprovádí**)_

---

## C. `.gitignore` review

- `.env*` (kromě `.env.example`)?
- `.clasprc.json`?
- `*.pem`, `*.key`?
- `credentials.json`, `service-account*.json`?
- Commitnutý `.env`?

---

## D. Dependency vulnerabilities

### `npm audit` per projekt

| Projekt | Critical | High | Moderate | Low |
|---------|----------|------|----------|-----|

### Top 5 nejzávažnějších

---

## E. Injection surface

- SQL injection
- Command injection (`child_process`, `exec`, `spawn`)
- SSRF (`UrlFetchApp` s user input URL)
- Prompt injection (konsoliduje z Fáze 3)
- XSS (konsoliduje z Fáze 4)

---

## F. Authentication deep

- Password storage
- Session management (reuse / rotation / logout invalidation)
- 2FA support
- OAuth scopes minimality

---

## G. PII & GDPR readiness

- Jaká PII systém zpracovává
- Right to erasure mechanism
- Data export per company
- PII v logs?
- Backups lokace, šifrování, retention

---

## H. Rate limiting & abuse

- Ochrana proti webapp flooding
- Implicitní Google quotas

---

## Findings (SEC-XXX)

| ID | Popis | Severity | Evidence |
|----|-------|----------|----------|

Plný seznam v [../FINDINGS.md](../FINDINGS.md).
