# Fáze 5 — Integration Audit (Apps Script ↔ Frontend contract)

> **Cíl:** Ověřit kontrakt mezi backendem (Apps Script webapp) a frontendem. Často padá v trhlinách mezi Fází 3 a 4.
> **Agent pattern:** single-agent, prochází kód na obou stranách paralelně.
> **Scope:** Apps Script `doGet` / `doPost`, Next.js API routes jako proxy, fetch volání z frontend komponent.

Tento soubor vyplňuje Fáze 5.

---

## A. Kontrakt

### Seznam Apps Script endpoints (doGet / doPost / action handlers)

| Endpoint / action | Soubor:řádek | Vstup | Výstup |
|--------------------|---------------|-------|--------|

### Seznam frontend volání

| Endpoint URL | Metoda | Body / params | Expected response | Odkud |
|---------------|--------|---------------|--------------------|-------|

### Match check

| Frontend call | Backend handler | Match? |
|----------------|------------------|--------|

Každý nepárovaný = finding (zombie endpoint nebo broken client).

### Formát (JSON / form-urlencoded)

### Konzistence patternu

---

## B. Error handling kontrakt

### Apps Script error signalling

### Frontend error detection

### Error messages — lokalizace, bezpečnost (bez stack trace)

---

## C. Autentizace a autorizace

### Jak se volání autentizují

### Jak backend ví kdo volá (ověřené vs trusted)

### API key rotace

---

## D. Verze a kompatibilita

### Verze backendu vs frontendu

### Deployment order

---

## E. Data shapes

### Response shapes per endpoint

### TypeScript types / zod schema

### null / undefined / prázdný string consistency

---

## F. Performance

### Typical latency per endpoint

### Velké payloady (paginace?)

### Frontend caching + invalidation

---

## Findings (IN-XXX)

_(linkuje do [../FINDINGS.md](../FINDINGS.md))_
