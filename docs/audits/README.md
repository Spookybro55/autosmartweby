# Autosmartweby — Deep Audit

> **Status:** AUDIT-ONLY. Nic se neopravuje. Pouze se dokumentuje.
> **Baseline:** `origin/main` @ `1dfc7e8` (po merge B-06)
> **Zahájeno:** 2026-04-24
> **Scope:** celé repo, read-only, bez live-system přístupu

Tato složka obsahuje všechny výstupy deep auditu projektu Autosmartweby. Audit běží ve 13 fázích, každá fáze = samostatný PR do `main`. Změny auditu se **nikdy** nemění na produkčním kódu — pouze přidávají nové dokumenty do `docs/audits/`.

---

## Mapa dokumentů

### Top-level
| Soubor | Fáze | Obsah |
|--------|------|-------|
| [README.md](README.md) | 0 | Tento soubor — legenda, mapa, pravidla |
| [INVENTORY.md](INVENTORY.md) | 1 | Faktický soupis repa (co tam je) |
| [FINDINGS.md](FINDINGS.md) | 2–12 | Centrální seznam všech nálezů, prioritizace |
| [MANUAL_CHECKS.md](MANUAL_CHECKS.md) | 2–12 | Co musí ověřit člověk (AI nemá přístup) |
| [12-summary.md](12-summary.md) | 12 | Executive summary, TL;DR pro management |

### Doménové audity
| Soubor | Fáze | Doména |
|--------|------|--------|
| [domains/02-data-model.md](domains/02-data-model.md) | 2 | Google Sheets schema, LEADS ↔ Ke kontaktování |
| [domains/03-apps-script.md](domains/03-apps-script.md) | 3 | Apps Script backend — funkce, triggery, bezpečnost |
| [domains/04-frontend.md](domains/04-frontend.md) | 4 | Next.js — auth, routing, API, build |
| [domains/05-integration.md](domains/05-integration.md) | 5 | Kontrakt Apps Script ↔ Frontend |
| [domains/06-deploy-pipeline.md](domains/06-deploy-pipeline.md) | 6 | clasp, TEST/PROD izolace, CI |
| [domains/07-security-secrets.md](domains/07-security-secrets.md) | 7 | Secrets, oprávnění, injection risk |
| [domains/08-funnel-flow.md](domains/08-funnel-flow.md) | 8 | End-to-end tok leadu |
| [domains/09-buildability.md](domains/09-buildability.md) | 9 | Jde projekt od čistého cloneu spustit? |
| [domains/10-docs-onboarding.md](domains/10-docs-onboarding.md) | 10 | Dokumentace, onboarding gap |

### Cross-check (4 role)
| Soubor | Fáze | Perspektiva |
|--------|------|-------------|
| [cross-check/11a-newbie.md](cross-check/11a-newbie.md) | 11 | Nový obchodník (non-dev) |
| [cross-check/11b-devops.md](cross-check/11b-devops.md) | 11 | DevOps pre-launch review |
| [cross-check/11c-attacker.md](cross-check/11c-attacker.md) | 11 | Útočník / red team |
| [cross-check/11d-qa.md](cross-check/11d-qa.md) | 11 | QA tester (edge cases) |

---

## Značky stavu

| Značka | Význam |
|--------|--------|
| ✅ | OK — ověřeno, funguje, bez problému |
| ⚠️ | Problém — existuje, ale s nedostatky |
| ❌ | Chybí nebo rozbité |
| ❓ | Nejasné ze zdrojáků — potřebuje dohledání |
| ⚪ | Nemohu ověřit bez přístupu — přesunuto do [MANUAL_CHECKS.md](MANUAL_CHECKS.md) |

---

## Severity

| Level | Význam | Příklad |
|-------|--------|---------|
| **P0** | Blocker | Ztráta dat možná, security breach, systém ned spustitelný, prod data corruption risk |
| **P1** | Must fix před PROD | Nespolehlivost, špatná UX, chybějící monitoring pro critical path, známá race condition |
| **P2** | Tech debt | Zhoršuje údržbu, ne blocking |
| **P3** | Nice-to-have | Optimalizace, drobná UX zlepšení |

---

## ID formát

Každý finding má ID `<PREFIX>-<CISLO>` podle domény, ve které byl nalezen:

| Prefix | Doména | Příklad |
|--------|--------|---------|
| `DM` | Data Model (Fáze 2) | DM-001 |
| `AS` | Apps Script (Fáze 3) | AS-001 |
| `FE` | Frontend (Fáze 4) | FE-001 |
| `IN` | Integration (Fáze 5) | IN-001 |
| `DP` | Deploy Pipeline (Fáze 6) | DP-001 |
| `SEC` | Security & Secrets (Fáze 7) | SEC-001 |
| `FF` | Funnel Flow (Fáze 8) | FF-001 |
| `BLD` | Buildability (Fáze 9) | BLD-001 |
| `DOC` | Docs & Onboarding (Fáze 10) | DOC-001 |
| `CC-NEW` | Cross-check — Newbie (Fáze 11a) | CC-NEW-001 |
| `CC-OPS` | Cross-check — DevOps (Fáze 11b) | CC-OPS-001 |
| `CC-SEC` | Cross-check — Attacker (Fáze 11c) | CC-SEC-001 |
| `CC-QA` | Cross-check — QA (Fáze 11d) | CC-QA-001 |

Čísla jsou sekvenční v rámci prefixu. Vyplňují se postupně jak fáze běží.

---

## Citlivá data — pravidla redakce

**NIKDY** neukládat do audit dokumentů plné hodnoty:
- API klíče
- Tokeny
- Sheet IDs delší než 20 znaků
- Service account credentials
- Private keys
- Passwords

**MÍSTO TOHO:** zaznamenat pouze:
```
nalezeno v souboru X na řádku Y, typ: <api_key|token|sheet_id>, prvních 4 znaky: XXXX
```

Pokud najdeš secret → P0 finding v [FINDINGS.md](FINDINGS.md) s akcí "rotate + cleanup history", ale **rotaci neprovádíš**.

---

## Jak číst audit (pořadí)

1. **Nejdřív [12-summary.md](12-summary.md)** — TL;DR pro management, 5-minutové čtení (dostupné až po Fázi 12)
2. **Pak [FINDINGS.md](FINDINGS.md)** — všechny nálezy s prioritou, filtrovatelné podle domény/severity
3. **Hloubka: konkrétní doména** — pokud chceš detail k určité oblasti, otevři `domains/XX-*.md`
4. **Cross-check** — `cross-check/11*-*.md` najdou to, co doménové audity přehlédly
5. **[MANUAL_CHECKS.md](MANUAL_CHECKS.md)** — co si musí člověk ověřit sám

---

## Meta

- Audit baseline: `origin/main` @ `1dfc7e8` (po merge PR #36 B-06)
- Runbook: lokálně u auditora, **NENI v repu** (per pravidlo runbooku)
- Tento README se může měnit s přibývajícími fázemi (status markerů, progress tracking)
