# Infrastructure & Storage — Autosmartweby

> **Kanonicky dokument.** Aktualizuje se pri zmene infrastruktury.
> **Posledni aktualizace:** 2026-04-05

---

## Aktualni infrastruktura

| Sluzba | Provider | Ucel | Stav |
|--------|----------|------|------|
| Databaze | Google Sheets | LEADS sheet, runtime data | Produkcni |
| Backend | Google Apps Script | Pipeline, emaily, write-back | Produkcni |
| Email | Gmail (GmailApp) | Draft/send, sync, labeling | Produkcni |
| Web check | Serper API | Hledani chybejicich webu | Produkcni |
| Frontend | Next.js (lokalne) | CRM dashboard | Lokalni dev |
| Auth | HMAC session + Google OAuth | Prihlaseni | Implementovano (OAuth ceka na .env) |
| Deployment AS | clasp | Apps Script deploy | Manualni |
| Source code | Git (lokalni) | Verzovani | Lokalni, GitHub pending |

## Uloziste

- **Google Sheets** — jedine datove uloziste (LEADS, Ke kontaktovani, _asw_logs)
- **Google Drive** — zminen jako budouci uloziste per klient, NENI implementovan
- **Lokalni filesystem** — offers/ (staticke HTML/PDF nabidky)

## Environment promenne

Definovane v crm-frontend/.env.example:
- GOOGLE_SPREADSHEET_ID
- GOOGLE_SERVICE_ACCOUNT_EMAIL
- GOOGLE_PRIVATE_KEY
- APPS_SCRIPT_WEB_APP_URL
- NEXTAUTH_SECRET
- AUTH_PASSWORD
- ALLOWED_EMAILS
- NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID
- GOOGLE_OAUTH_CLIENT_ID
- APPS_SCRIPT_SECRET

## Limity

- Google Sheets: ~50 000 radku pro rozumny vykon
- Apps Script execution time: 6 min/run
- Apps Script trigger limit: 90 min/den
- Gmail sending: 100/den (consumer), 1500/den (Workspace)
- Zadny hosting pro frontend
- Zadny CI/CD

## Deployment postup

### Apps Script
1. Kod se meni v repo (apps-script/)
2. Po merge do main: clasp push do TEST prostredi
3. Po overeni: manualni clasp push do PROD
4. .clasp.json defaultne ukazuje na TEST (bezpecnostni mechanismus)

### Frontend
Zatim jen lokalni vyvoj (npm run dev). Zadny hosting.
