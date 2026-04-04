# Autosmartweby CRM — Frontend

Webove rozhrani CRM systemu pro obchodniky. Postaveno na Next.js 16, React 19, Tailwind CSS a shadcn/ui. Cte data z Google Sheets pres Sheets API, zapisuje pres Apps Script Web App endpoint.

## Prerequisites

- Node.js 20+
- Google Service Account s pristupem ke spreadsheet (read-only scope)
- Apps Script Web App URL pro zapisy (volitelne)

## Setup

1. Naklonuj repo a prejdi do slozky:
   ```bash
   cd crm-frontend
   npm install
   ```

2. Vytvor `.env.local` z template:
   ```bash
   cp .env.example .env.local
   ```

3. Vyplnn env vars v `.env.local`:
   - `GOOGLE_SPREADSHEET_ID` — ID produkcniho spreadsheetu
   - `GOOGLE_SERVICE_ACCOUNT_EMAIL` — email service accountu
   - `GOOGLE_PRIVATE_KEY` — private key service accountu
   - `APPS_SCRIPT_WEB_APP_URL` — URL Apps Script Web App (pro zapisy)
   - `NEXTAUTH_SECRET` — nahodny secret pro session tokeny
   - `AUTH_PASSWORD` — heslo pro prihlaseni
   - `ALLOWED_EMAILS` — povolene emaily (comma-separated)

4. Spust dev server:
   ```bash
   npm run dev
   ```

5. Otevri [http://localhost:3000](http://localhost:3000).

## Architektura

```
src/
├── app/
│   ├── api/             ← Next.js API routes (backend-for-frontend)
│   │   ├── auth/login/  ← login endpoint (HMAC session)
│   │   ├── leads/       ← CRUD pro leady (cte Sheets, pise pres AS)
│   │   └── stats/       ← dashboard statistiky
│   ├── dashboard/       ← hlavni dashboard
│   ├── leads/           ← seznam leadu s filtry
│   ├── follow-ups/      ← prehled follow-upu
│   ├── pipeline/        ← kanban board
│   └── login/           ← prihlaseni
├── components/
│   ├── dashboard/       ← stat-card, follow-up-widget, priority-leads
│   ├── layout/          ← app-shell, header, sidebar
│   ├── leads/           ← leads-table, lead-filters, lead-detail-drawer
│   ├── pipeline/        ← kanban-board, kanban-column
│   └── ui/              ← shadcn/ui komponenty (18 ks)
├── hooks/               ← use-leads, use-lead-detail, use-lead-update, use-dashboard-stats
├── lib/
│   ├── config.ts        ← column mappings, enums (SYNC s apps-script/Config.gs)
│   ├── domain/          ← Lead, Filters, Stats typy
│   ├── google/          ← sheets-reader.ts (cteni), apps-script-writer.ts (zapis)
│   ├── mappers/         ← sheet-to-domain.ts
│   └── mock/            ← mock data pro vyvoj bez Google credentials
└── middleware.ts        ← auth middleware (HMAC session verification)
```

## Datovy tok

```
Google Sheets (LEADS)
      │
      ├──[read]──→ sheets-reader.ts → mappers → domain → React hooks → UI
      │
      └──[write]──→ apps-script-writer.ts → Apps Script Web App → LEADS
```

Frontend je read/write klient. Source of truth pro data je Google Sheets LEADS sheet. Source of truth pro business logiku je Apps Script (viz `apps-script/`).

## Dulezite

- **Column mappings** v `src/lib/config.ts` musi byt synchronni s `apps-script/Config.gs`. Pri zmene sloupcu v sheetu aktualizuj oba soubory.
- **Mock mode:** Pokud nejsou nastaveny Google credentials, aplikace pouziva mock data z `src/lib/mock/`.

## Systemova dokumentace

Kompletni architektura CRM systemu vcetne sheetu, sloupcu, funkci a datovych toku je v:
- [`docs/CRM-SYSTEM-MAP.md`](../docs/CRM-SYSTEM-MAP.md)
