# Fáze 4 — Frontend Audit (`crm-frontend/`)

> **Cíl:** Analyzovat Next.js aplikaci — auth, routing, API, state, bezpečnost, UX.
> **Agent pattern:** 🤖🤖🤖 — 3 paralelní agenty (Structure & routing + Data flow & state + Security & build).
> **Scope:** vše v `crm-frontend/` kromě `node_modules/`, `.next/`.

Tento soubor vyplňuje Fáze 4.

---

## Sekce 1 — Struktura a routing (Agent A)

### App Router vs Pages Router

_(nebo mix?)_

### Mapa routes

| Soubor | URL | Účel | Přístup (public/auth/role) | Server/client |
|--------|-----|------|----------------------------|----------------|

### Layout hierarchy

_(root layout → nested layouts; co se loaduje kde)_

### Middleware

_(co kontroluje `middleware.ts`)_

### Error boundaries / loading / not-found states

### Navigační komponenty

### Globální state (context / Zustand / other)

### Shared komponenty

### Dead routes / komponenty

---

## Sekce 2 — Data flow a state (Agent B)

### HTTP volání z frontendu

| Endpoint URL | Metoda | Odkud (komponenta / route) | Auth |
|---------------|--------|-----------------------------|------|

### Data fetching library

_(React Query / SWR / vanilla fetch)_

### Mutations pattern

### Optimistic updates

### Loading UX (skeletony, spinnery)

### Error UX (500 / network fail / 401/403)

### Retry logika

### Stale data / refetch

### Forms library + validation

### File upload

---

## Sekce 3 — Security a build health (Agent C)

### Auth mechanism

### Session storage (cookie / localStorage / in-memory; HttpOnly, Secure)

### Chráněné routes — server-side vs client-only

### CSRF ochrana

### XSS risk (`dangerouslySetInnerHTML`, `innerHTML`)

### Secrets separation (`NEXT_PUBLIC_*` vs server-only)

### `.env.example` coverage

### Build health

- `npm install` output: _(⚪ nebo reálný výstup z Fáze 9)_
- `npm run lint`: _(⚪ nebo výstup)_
- `npm run build`: _(⚪ nebo výstup)_ — **P0 pokud selže**
- `npx tsc --noEmit`: _(⚪ nebo výstup)_
- `npm audit --production`: _(⚪ nebo výstup)_

---

## Sekce 4 — Konsolidované findings (FE-XXX)

_(Build health P0 findings jsou nahoře — blocker pro cokoli dalšího)_

| ID | Popis | Agent | Severity | Evidence |
|----|-------|-------|----------|----------|

Plný seznam v [../FINDINGS.md](../FINDINGS.md).
