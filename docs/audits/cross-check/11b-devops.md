# Fáze 11b — Cross-check: DevOps (pre-launch review)

> **Perspektiva:** DevOps před go-live. Jediné co zajímá: "co mě probudí v noci?".
> **Cíl:** operational readiness — monitoring, alerting, logs, rollback, DR, secrets rotation, on-call.
> **Sub-agent context:** čistý, nečte obchodní logiku.

Tento soubor vyplňuje Fáze 11.

---

## Otázky z pohledu DevOps

1. **Monitoring** — vidí někdo, že systém teď běží?
2. **Alerting** — přijde notifikace při failu?
3. **Logy** — kde jsou? Jak dlouho se drží? Kdo je umí číst?
4. **On-call** — existuje? Kdo je odpovědný o víkendu?
5. **SLO / SLI** — definované?
6. **Load test** — proběhl? Co zvládne (leadů/den)?
7. **DR plán** — co když Google Sheets uklíclo data?
8. **Rollback** — umím vrátit deploy za 5 minut?
9. **Secrets rotation** — možná bez downtime?

---

## Zjištění per bod

_(vyplní Agent DevOps)_

---

## Findings (CC-OPS-XXX)

| ID | Popis | Severity | Evidence |
|----|-------|----------|----------|

Plný seznam v [../FINDINGS.md](../FINDINGS.md).
