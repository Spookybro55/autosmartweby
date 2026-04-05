# Implementation Plan — Google Auth + Email Sending

> Verze 1.0 | 2026-04-04 | Autor: Claude + user
> Zavislost: docs/18-google-auth-and-email-architecture.md
> Stav: PLAN — ceka na owner decisions pred implementaci

---

## 1. Seznam souboru ke zmene

### Faze 1: Google Auth

| Soubor | Akce | Popis |
|--------|------|-------|
| `crm-frontend/src/app/login/page.tsx` | EDIT | Pridat Google Sign-In tlacitko vedle existujiciho formulare |
| `crm-frontend/src/app/api/auth/google/route.ts` | **NOVY** | POST: prijmi Google ID token, over, vytvor session cookie |
| `crm-frontend/src/app/api/auth/logout/route.ts` | **NOVY** | POST: smaz crm-session cookie, redirect |
| `crm-frontend/src/components/layout/header.tsx` | EDIT | Pridat logout tlacitko + zobrazeni emailu uzivatele |
| `crm-frontend/src/app/layout.tsx` | EDIT | Pridat Google GIS script tag do `<head>` |
| `crm-frontend/src/middleware.ts` | BEZ ZMENY | Existujici HMAC verifikace funguje i pro Google auth sessions |
| `crm-frontend/src/app/api/auth/login/route.ts` | BEZ ZMENY | Zachovat jako fallback (migraci perioda) |

**Nove env promenne:**
- `GOOGLE_OAUTH_CLIENT_ID` — OAuth 2.0 Client ID

**Zadne nove npm balicky** — GIS SDK se nacita pres `<script>` tag, tokeninfo pres fetch.

### Faze 2: Email Send MVP

| Soubor | Akce | Popis |
|--------|------|-------|
| `crm-frontend/src/lib/email/types.ts` | **NOVY** | Typy: EmailMessage, SendResult, EmailProvider, DeliveryStatus |
| `crm-frontend/src/lib/email/resend-provider.ts` | **NOVY** | Resend adapter implementujici EmailProvider interface |
| `crm-frontend/src/lib/email/provider-factory.ts` | **NOVY** | Factory: vyber providera dle env config |
| `crm-frontend/src/app/api/email/send/route.ts` | **NOVY** | POST: overeni auth, cteni draft dat, odeslani pres ESP |
| `crm-frontend/src/components/leads/lead-detail-drawer.tsx` | EDIT | Pridat "Odeslat email" tlacitko do detailu leadu |
| `crm-frontend/src/hooks/use-email-send.ts` | **NOVY** | React hook pro odeslani emailu s loading/error state |
| `apps-script/Config.gs` | EDIT | Pridat 5 novych EXTENSION_COLUMNS pro outbound tracking |
| `crm-frontend/src/lib/config.ts` | EDIT | Pridat nove DYNAMIC_HEADERS pro outbound sloupce |
| `crm-frontend/src/lib/domain/lead.ts` | EDIT | Pridat outbound fields do Lead interface |

**Nove env promenne:**
- `RESEND_API_KEY` — API klic od Resend (nebo jineho ESP)
- `EMAIL_FROM_ADDRESS` — `Autosmartweb <info@autosmartweb.cz>`
- `EMAIL_REPLY_TO` — `info@autosmartweb.cz`

**Nove npm balicky:**
- `resend` — Resend SDK (~50 KB)

### Faze 3: Email Tracking + Replies (budouci)

| Soubor | Akce | Popis |
|--------|------|-------|
| `crm-frontend/src/app/api/webhooks/email/route.ts` | **NOVY** | Webhook receiver pro ESP eventy |
| `crm-frontend/src/components/leads/email-thread-view.tsx` | **NOVY** | Zobrazeni emailove konverzace v lead detailu |
| `apps-script/MailboxSync.gs` | EDIT | Propojeni ESP sent ID s Gmail thread ID |

---

## 2. MVP Scope (Faze 1 + Faze 2)

### Co je v MVP

- Google Sign-In na login strance
- Overeni Google ID tokenu na backendu
- Allowlist kontrola (ALLOWED_EMAILS)
- Session cookie (existujici format)
- Logout
- Odeslani emailu z CRM frontend detailu leadu pres ESP
- From: info@autosmartweb.cz
- Zakladni delivery status (SENT / FAILED)
- Zapis statusu do LEADS

### Co NENI v MVP

- Odebrani legacy email+heslo loginu
- Draft editace v CRM frontendu (pouzit pipeline drafty)
- ESP delivery webhooky
- Thread view
- Reply parsing
- Bulk send
- Email scheduling
- Email templates v CRM frontendu

---

## 3. Poradi implementace

### Faze 1: Google Auth (4-6h)

```
1. [PREREQ] Owner vytvori Google Cloud OAuth Client ID
   → Nastavit Authorized JavaScript origins: http://localhost:3000, https://crm.autosmartweb.cz
   → Nastavit Authorized redirect URIs: (zadne — GIS pouziva popup/redirect mode)

2. [CODE] Pridat /api/auth/google route
   → Prijmout credential (Google ID token)
   → Overit pres https://oauth2.googleapis.com/tokeninfo?id_token=XXX
   → Zkontrolovat email vuci ALLOWED_EMAILS
   → Vytvorit HMAC session cookie (signToken)
   → Vratit { success: true }

3. [CODE] Pridat /api/auth/logout route
   → Smazat cookie crm-session
   → Vratit { success: true }

4. [CODE] Upravit login/page.tsx
   → Pridat Google GIS inicializaci
   → Pridat "Prihlasit se pres Google" tlacitko
   → Po uspechu: redirect na /dashboard

5. [CODE] Upravit layout.tsx
   → Pridat <Script src="https://accounts.google.com/gsi/client" strategy="beforeInteractive" />

6. [CODE] Upravit header.tsx
   → Pridat logout tlacitko
   → Zobrazit email prihlaseneho uzivatele (z cookie / API)

7. [TEST] Overeni
   → tsc --noEmit
   → npm run build
   → Manualni test: Google login → dashboard → logout → redirect na /login
   → Legacy login stale funguje
```

### Faze 2: Email Send MVP (6-8h)

```
1. [PREREQ] Owner zaregistruje domenu u Resend (nebo jineho ESP)
   → Verifikace domeny autosmartweb.cz
   → Ziskat API klic

2. [PREREQ] DNS zmeny
   → SPF: pridat include:send.resend.com
   → DKIM: pridat CNAME zaznam
   → DMARC: pridat TXT zaznam (p=none na zacatek)

3. [CODE] Implementovat email typy a provider adapter
   → src/lib/email/types.ts
   → src/lib/email/resend-provider.ts
   → src/lib/email/provider-factory.ts

4. [CODE] Pridat /api/email/send route
   → Auth guard (session cookie)
   → Prijmout { leadId, subject, bodyHtml }
   → Nacteni lead dat z Google Sheets
   → Validace (email, subject, body)
   → Odeslani pres EmailProvider
   → Zapis vysledku do LEADS (pres Apps Script)
   → Aktualizace outreach_stage

5. [CODE] Pridat 5 novych extension columns do Config.gs
   → email_outbound_id, email_outbound_status, email_outbound_provider,
     email_outbound_error, email_outbound_sent_at

6. [CODE] Pridat "Odeslat email" do lead detailu
   → Tlacitko v lead-detail-drawer.tsx
   → Confirmation dialog
   → use-email-send.ts hook

7. [TEST] Overeni
   → tsc --noEmit
   → npm run build
   → Manualni test: otevrit lead → odeslat email → zkontrolovat inbox prijemce
   → Zkontrolovat LEADS extension columns
   → Zkontrolovat _asw_logs
```

---

## 4. Test plan

### Faze 1: Google Auth

| # | Test | Ocekavany vysledek | Typ |
|---|------|-------------------|-----|
| T1 | Google login s platnym uctem v allowlistu | Login OK, redirect na /dashboard | Manualni |
| T2 | Google login s uctem MIMO allowlist | 401, zobrazeni chyby | Manualni |
| T3 | Legacy email+heslo login | Stale funguje | Manualni |
| T4 | Pristup na /dashboard bez session | Redirect na /login | Manualni |
| T5 | Logout | Cookie smazana, redirect na /login | Manualni |
| T6 | Expirovana session (7+ dni) | Redirect na /login | Manualni |
| T7 | Neplatny/expired Google ID token | 401, zobrazeni chyby | Manualni |

### Faze 2: Email Send

| # | Test | Ocekavany vysledek | Typ |
|---|------|-------------------|-----|
| E1 | Odeslani emailu na validni adresu | Email dorucen, status SENT | Manualni |
| E2 | Odeslani emailu na nevalidni adresu | FAILED, error zprava | Manualni |
| E3 | Odeslani bez prihlaseni | 401 | Manualni |
| E4 | Odeslani bez draftu (prazdny subject) | Blokace, chybova zprava | Manualni |
| E5 | Kontrola From headeru | `info@autosmartweb.cz` | Manualni (email header) |
| E6 | Kontrola Reply-To headeru | `info@autosmartweb.cz` | Manualni (email header) |
| E7 | Double-send guard | Varovani pri opakovanem odeslani | Manualni |
| E8 | LEADS metadata update | extension columns aktualizovany | Manualni |

---

## 5. Rollout plan

### Faze 1 rollout

```
1. Implementovat zmeny lokalne
2. tsc --noEmit + npm run build
3. Deploy na staging/preview (Vercel preview branch)
4. Overit T1-T7
5. Deploy na produkci
6. Overit ze legacy login stale funguje
7. Aktualizovat docs
```

### Faze 2 rollout

```
1. DNS zmeny (SPF, DKIM, DMARC) — idealne 24-48h pred prvnim odeslanim
2. Overit DNS propagaci: dig TXT autosmartweb.cz, dig CNAME resend._domainkey.autosmartweb.cz
3. Implementovat zmeny lokalne
4. Testovat s testovaci emailovou adresou (vlastnik)
5. tsc --noEmit + npm run build
6. clasp push (nove extension columns)
7. Deploy na produkci
8. Smoke test: odeslat 1 email, zkontrolovat From/Reply-To/DKIM/SPF v email headeru
9. Aktualizovat docs
```

### DNS zmeny checklist

| Zaznam | Typ | Hodnota | Stav |
|--------|-----|---------|------|
| SPF | TXT @ | `v=spf1 include:_spf.google.com include:send.resend.com -all` | CEKA |
| DKIM | CNAME | `resend._domainkey.autosmartweb.cz → resend._domainkey.resend.dev` | CEKA |
| DMARC | TXT _dmarc | `v=DMARC1; p=none; rua=mailto:dmarc@autosmartweb.cz` | CEKA |
| Return-Path | MX mail | ESP bounce server | VOLITELNE (MVP) |

---

## 6. Odhad prace

| Faze | Effort | Prereq | Blokuje |
|------|--------|--------|---------|
| Faze 1 (Google Auth) | 4-6h | Google Cloud OAuth Client ID | Nic (legacy funguje) |
| Faze 2 (Email Send) | 6-8h | ESP ucet + DNS zmeny | Nic (Gmail funguje) |
| Faze 3 (Tracking) | 8-12h | Faze 2 stabilni | — |

**Celkem MVP (Faze 1 + 2): 10-14h**
