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

## Email infrastructure

> **Cross-reference:** Email identity model (kdo je sender / Reply-To / mailbox) je dokumentovan v `docs/22-technical-architecture.md`. Konkretni Script Properties pro pilot v `docs/24-automation-workflows.md`. Tato sekce popisuje **infrastrukturu** (DNS, MX, providers).

### Domena a DNS

- **Domena:** `autosmartweb.cz` (sdilena s verejnym webem `Spookybro55/ASW-MARKETING-WEB`, viz project boundary v `CLAUDE.md`)
- **Web hosting:** Vercel (A: `76.76.21.21`)
- **DNS hosting:** Wedos (`ns.wedos.com`)

### Mailboxy (LIVE)

- `info@autosmartweb.cz` — centralni obchodni inbox
- `s.fridrich@autosmartweb.cz` — osobni sender (Sebastián Fridrich)
- `t.maixner@autosmartweb.cz` — osobni sender (Tomáš Maixner)
- `j.bezemek@autosmartweb.cz` — osobni sender / owner (Honza / Jan Bezemek)

### Mail providers

- **Inbound MX:** Wedos (5× `mx1.wedos.*`, pref 10/20)
- **Outbound z CRM (Apps Script):** GmailApp pres Apps Script editor account. **VYZADUJE Gmail "Send mail as" alias setup** pro kazdy sender adresu pred realnym sendem (viz `docs/22-technical-architecture.md` sekce "Apps Script outbound prerequisite").
- **Outbound z webu (`/api/contact`):** Resend (predpoklad — vyzaduje overit v `Spookybro55/ASW-MARKETING-WEB` repo)

### DNS authentication stav (per audit P0-MAIL-01, 2026-04-26)

| Record | Aktualni stav | Doporuceni |
|--------|---------------|------------|
| MX | 5× Wedos | OK ✓ |
| SPF (TXT root) | `v=spf1 mx include:_spf.we.wedos.net include:amazonses.com ~all` | ⚠️ `~all` (soft fail). Po pilot: `-all` (hard fail). Pokud Resend pro `/api/contact`: pridat `include:send.resend.com`. |
| DMARC | `v=DMARC1; p=none; rua=mailto:s.fridrich0@gmail.com` | ⚠️ `p=none` = monitor only. Po 2-4 tydnech sberu: `p=quarantine` + `sp=quarantine`. Migrovat `rua` na firemni `dmarc-rua@autosmartweb.cz`. |
| DKIM | Žadny common selector neexistuje (zkousene: default, wedos, google, resend, k1, s1, dkim, mail, smtp, amazonses, mta, pm) | ⚠️ **P0** — DKIM nelze overit zdrojakove. Akce: pošli test e-mail z planovaneho odesilatele → `Authentication-Results` header. |
| `_amazonses.autosmartweb.cz` | NEEXISTUJE | Pokud SES nepouzivame: odstranit `include:amazonses.com` ze SPF |
| MTA-STS / TLS-RPT / BIMI | NEEXISTUJE | P3 future |

### TLS / HTTPS

- **Web cert:** Let's Encrypt R12, valid Apr 2 → Jul 1 2026, CN=`autosmartweb.cz`
- **HSTS:** `max-age=63072000` (2 roky) ✓

### Pre-flight checklist pred zapnutim outbound

Viz `docs/24-automation-workflows.md` sekce "Pre-flight checklist pro outbound aktivaci".

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
