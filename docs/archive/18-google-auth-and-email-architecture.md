# Google Auth + Email Sending Architecture

> Verze 1.0 | 2026-04-04 | Autor: Claude + user
> Stav: ARCHITEKTONICKY NAVRH — ceka na owner decisions a implementaci
> Zavislost: docs/01-decision-list.md (D-7), docs/09-project-control-tower.md (H-1, H-3)

---

## CAST A — Audit soucasneho stavu

### A.1 Soucasna autentizace

| Aspekt | Soucasny stav |
|--------|---------------|
| Mechanismus | Sdilene heslo (`AUTH_PASSWORD` env var) |
| Session | HMAC-podepsana cookie `crm-session` (7 dni, httpOnly) |
| Overeni | `crypto.subtle.verify` (timing-safe, H-2 fix) |
| Allowlist | `ALLOWED_EMAILS` env var (comma-separated) |
| Middleware | `src/middleware.ts` — kontrola cookie na vsech chranena routes |
| Login UI | `src/app/login/page.tsx` — email + heslo formular |
| Login API | `src/app/api/auth/login/route.ts` — POST, email + password → cookie |
| Logout | Neexistuje (cookie expiruje po 7 dnech) |
| Per-user audit | Neni mozny (vsichni sdili jedno heslo) |

**Dotcene env promenne:**
- `AUTH_PASSWORD` — sdilene heslo
- `NEXTAUTH_SECRET` — HMAC signing secret pro session cookie
- `ALLOWED_EMAILS` — povolene emaily

**Poznamka:** `next-auth@5.0.0-beta.30` je v `package.json`, ale NENI pouzivany v kodu. Vsechny auth soubory jsou custom implementace.

### A.2 Soucasny email workflow

| Aspekt | Soucasny stav |
|--------|---------------|
| Draft vytvoreni | `OutboundEmail.gs` → `createCrmDraft()` pres `GmailApp.createDraft()` |
| Odeslani | `OutboundEmail.gs` → `sendCrmEmail()` pres `GmailApp.sendEmail()` |
| Sender | Ucet, pod kterym bezi Apps Script (sfridrich@unipong.cz nebo Workspace ucet) |
| Reply-To | Defaultni (sender ucet) |
| Inbox sync | `MailboxSync.gs` → `syncMailboxMetadata()` — read-only sync z Gmailu |
| Metadata | Extension sloupce v LEADS: `email_thread_id`, `email_sync_status`, `email_reply_type`, atd. |
| Statusy | `NOT_LINKED`, `NOT_FOUND`, `REVIEW`, `DRAFT_CREATED`, `SENT`, `LINKED`, `REPLIED`, `ERROR` |
| Bounce detekce | `classifyReplyType_()` — heuristika na From, Subject, Snippet |
| Double-send guard | `OUTBOUND_DOUBLE_SEND_MINUTES = 5` |
| Gmail labels | `ASW/CRM` label na threadech |

**Klicove omezeni soucasneho stavu:**
1. Sender je Workspace/Gmail ucet — ne `info@autosmartweb.cz`
2. Gmail ma denni limity (100 emailu pro free, 2000 pro Workspace)
3. Zadny SPF/DKIM/DMARC pro custom domenu
4. Zadna bounce subdomena
5. Zadne queuing / retry
6. Odeslani jen pres Google Sheets UI (menu item), ne z CRM frontend

### A.3 Napojovaci body pro zmeny

| Zmena | Kde se napoji | Dotcene soubory |
|-------|---------------|-----------------|
| Google auth login | Frontend login + API route + middleware | `login/page.tsx`, `api/auth/login/route.ts`, `middleware.ts` |
| Google auth session | Middleware + session model | `middleware.ts` |
| Logout | Nova route + header UI | `api/auth/logout/route.ts` (novy), `header.tsx` |
| ESP adapter | Novy modul + nova API route | `src/lib/email/` (novy), `api/email/send/route.ts` (novy) |
| Draft z frontendu | Nova stranka/komponenta + API | `api/email/draft/route.ts` (novy) |
| Statusy | Existujici extension sloupce | `Config.gs` (rozsireni enum), LEADS sheet |

---

## CAST B — Navrh Google Auth

### B.1 Cilovy flow

```
1. Uzivatel otevre /login
2. Klikne "Prihlasit se pres Google"
3. Frontend vola Google Identity Services (GIS) SDK
4. Google zobrazi consent screen → uzivatel vybere ucet
5. Google vrati ID token (JWT) do frontend callbacku
6. Frontend posle ID token na POST /api/auth/google
7. Backend overi ID token pres Google tokeninfo endpoint
8. Backend zkontroluje email vuci allowlistu
9. Backend vytvori HMAC session cookie (stejny format jako dnes)
10. Redirect na /dashboard
```

### B.2 Frontend flow

```
login/page.tsx:
  - Zachovat stavajici email+heslo formular (migraci perioda)
  - Pridat tlacitko "Prihlasit se pres Google"
  - Nacist Google GIS client library (<script src="https://accounts.google.com/gsi/client">)
  - google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: handleGoogleResponse
    })
  - google.accounts.id.renderButton(element, { theme: 'outline', size: 'large', text: 'signin_with' })
  - handleGoogleResponse(response) → POST /api/auth/google s response.credential
```

### B.3 Backend verification flow

```
POST /api/auth/google:
  1. Prijmi { credential: string } (Google ID token)
  2. Over ID token:
     - Varianta A (jednoducha): GET https://oauth2.googleapis.com/tokeninfo?id_token=XXX
     - Varianta B (robustni): pouzit google-auth-library verifyIdToken()
  3. Extrahuj email z tokenu
  4. Zkontroluj email vuci ALLOWED_EMAILS (case-insensitive)
  5. Pokud OK: vytvor HMAC session cookie (stejny signToken() jako dnes)
  6. Pokud FAIL: vrat 401
```

**Doporucena varianta:** A (tokeninfo endpoint) pro MVP — zadna nova knihovna, jednoduchy HTTPS call.

### B.4 Session model

Session cookie **zustava stejna** — HMAC-podepsana cookie `crm-session` s payloadem `{ email, ts }`.

| Aspekt | Pred | Po |
|--------|------|-----|
| Cookie nazev | `crm-session` | `crm-session` (beze zmeny) |
| Payload | `{ email, ts }` | `{ email, ts, provider: 'google' }` |
| Signing | HMAC-SHA256 (`NEXTAUTH_SECRET`) | Beze zmeny |
| Expiry | 7 dni | Beze zmeny |
| Middleware | `src/middleware.ts` | Beze zmeny (uz validuje HMAC) |

**Klicovy princip:** Middleware se NEMENI. Session format je zpetne kompatibilni.

### B.5 Allowlist model

- `ALLOWED_EMAILS` env var zustava
- Kontrola v `POST /api/auth/google` — same jako dnes v `POST /api/auth/login`
- Pozdeji moznost presunout allowlist do Google Sheets / config souboru

### B.6 Logout flow

```
1. Header komponenta: tlacitko "Odhlasit se"
2. POST /api/auth/logout
3. Backend smaze cookie crm-session
4. Redirect na /login
```

Dnes logout neexistuje. Treba pridat:
- `src/app/api/auth/logout/route.ts` (novy)
- Tlacitko v `src/components/layout/header.tsx`

### B.7 Env promenne

| Promenna | Popis | Nutna pro |
|----------|-------|-----------|
| `GOOGLE_CLIENT_ID` | OAuth 2.0 Client ID z Google Cloud Console | Google auth |
| `ALLOWED_EMAILS` | Povolene emaily (uz existuje) | Allowlist |
| `NEXTAUTH_SECRET` | HMAC secret (uz existuje) | Session signing |
| `AUTH_PASSWORD` | Zachovat pro prechodne obdobi | Legacy login |

### B.8 Migracni strategie

1. **Faze 1:** Pridat Google auth VEDLE stavajiciho email+heslo loginu
2. **Faze 2:** Po overeni → nastavit Google auth jako default (heslo jako fallback)
3. **Faze 3:** Odebrat email+heslo login (az owner potvrdi)

### B.9 Minimalni zmeny

| Soubor | Zmena | Rozsah |
|--------|-------|--------|
| `src/app/login/page.tsx` | Pridat Google Sign-In tlacitko | ~30 LOC |
| `src/app/api/auth/google/route.ts` | **NOVY** — Google ID token verification + cookie | ~50 LOC |
| `src/app/api/auth/logout/route.ts` | **NOVY** — smazani cookie | ~15 LOC |
| `src/components/layout/header.tsx` | Pridat logout tlacitko | ~10 LOC |
| `src/app/layout.tsx` | Pridat Google GIS script tag | ~5 LOC |

**Middleware se NEMENI.** Stavajici login route se NEMENI (zustva jako fallback).

---

## CAST C — Navrh email sending architektury

### C.1 Provider adapter rozhrani

```typescript
// src/lib/email/types.ts

interface EmailMessage {
  to: string;
  subject: string;
  bodyHtml: string;
  bodyText?: string;
  from: string;        // "Autosmartweb <info@autosmartweb.cz>"
  replyTo: string;     // "info@autosmartweb.cz"
  leadId: string;      // Pro tracking
  messageType: 'outreach' | 'follow_up';
}

interface SendResult {
  success: boolean;
  messageId?: string;  // Provider-specific ID
  error?: string;
  provider: string;    // 'resend' | 'postmark' | 'sendgrid' | ...
}

interface EmailProvider {
  name: string;
  send(message: EmailMessage): Promise<SendResult>;
  // Budouci rozsireni:
  // getStatus(messageId: string): Promise<DeliveryStatus>;
}
```

### C.2 Doporuceni provideři (ESP)

| Provider | From domain | DKIM | Bounce handling | Cena (MVP) | Doporuceni |
|----------|------------|------|----------------|------------|------------|
| **Resend** | Vlastni domena | Ano | Webhooky | Free do 100/den, $20/mo do 50k | **1. volba** — uz pouzivan pro web-starter kontaktni formular |
| Postmark | Vlastni domena | Ano | Nativni | $15/mo za 10k | 2. volba — nejlepsi reputace |
| SendGrid | Vlastni domena | Ano | Webhooky | Free do 100/den | 3. volba |
| Mailgun | Vlastni domena | Ano | Webhooky | $35/mo | 4. volba |

**Doporuceni: Resend** — uz je v ekosystemu (web-starter), jednoduche API, dobra dorucivanost, free tier staci pro MVP.

### C.3 Data model pro outbound message

Rozsireni existujicich LEADS extension columns:

| Sloupec | Typ | Ucel |
|---------|-----|------|
| `email_outbound_id` | string | ID zpravy od ESP providera |
| `email_outbound_status` | enum | `DRAFTED`, `QUEUED`, `SENT`, `DELIVERED`, `FAILED`, `BOUNCED` |
| `email_outbound_provider` | string | Nazev providera (`resend`, `postmark`, ...) |
| `email_outbound_error` | string | Chybova zprava pri selhani |
| `email_outbound_sent_at` | ISO timestamp | Cas odeslani |

**Poznamka:** Existujici `email_sync_status` a `last_email_sent_at` zustavaji pro Gmail inbox sync. Nove sloupce jsou pro ESP outbound.

### C.4 Draft vs Send flow

```
DRAFT FLOW (z CRM frontendu):
1. Uzivatel otevre lead detail
2. Vidi "Predmet" a "Text zpravy" (z email_subject_draft, email_body_draft)
3. Muze editovat text
4. Klikne "Ulozit draft" → POST /api/email/draft
5. Backend zapise editovany draft do LEADS (pres Apps Script)
6. Status: DRAFTED

SEND FLOW (z CRM frontendu):
1. Uzivatel vidi draft na lead detailu
2. Klikne "Odeslat email"
3. Confirmation dialog
4. POST /api/email/send
5. Backend:
   a. Cte draft data z LEADS
   b. Sestavi EmailMessage (from: info@autosmartweb.cz)
   c. Vola EmailProvider.send()
   d. Zapise vysledek do LEADS (outbound_id, status, sent_at)
   e. Aktualizuje outreach_stage na CONTACTED (pokud byl NOT_CONTACTED/DRAFT_READY)
6. Response s vysledkem
```

### C.5 Statusy

```
DRAFTED     → Email draft existuje, nebyl odeslan
QUEUED      → Odeslan do fronty providera (async)
SENT        → Provider potvrdil odeslani
DELIVERED   → Provider potvrdil doruceni (webhook, pokud dostupny)
FAILED      → Odeslani selhalo (API error)
BOUNCED     → Email se vratil (hard/soft bounce)
```

### C.6 Logovani

- Vsechny send/fail/bounce akce logovany do `_asw_logs` sheetu (existujici mechanismus)
- Novy prefix pro ESP logy: `function = espOutbound`
- Frontend API routes loguji do Next.js stdout (standardni)

### C.7 Error handling

| Chyba | Akce |
|-------|------|
| ESP API timeout | Retry 1x po 2s, pak FAILED |
| ESP API 4xx | FAILED, log error, zobrazit uzivateli |
| ESP API 5xx | Retry 1x po 5s, pak FAILED |
| Neplatny email | FAILED pred odeslanim (validace) |
| Chybejici draft | Blokovat send, zobrazit uzivateli |

### C.8 Message metadata uloziste

**Moznosti:**
1. **LEADS extension sloupce** (doporuceno pro MVP) — konsistentni s existujicim modelem
2. Samostatny Google Sheet tab (pro vyssi objem)
3. Externi DB (overengineering pro MVP)

**Doporuceni:** Varianta 1 pro MVP. Staci 5 novych extension columns.

### C.9 Sender info@autosmartweb.cz

| Aspekt | Nastaveni |
|--------|-----------|
| From | `Autosmartweb <info@autosmartweb.cz>` |
| Reply-To | `info@autosmartweb.cz` |
| Return-Path | `bounces@mail.autosmartweb.cz` (subdomena) |

### C.10 DNS/auth pozadavky

#### SPF (Sender Policy Framework)

```dns
; Pro autosmartweb.cz
autosmartweb.cz.  TXT  "v=spf1 include:_spf.google.com include:{ESP_SPF} -all"

; Priklad pro Resend:
autosmartweb.cz.  TXT  "v=spf1 include:_spf.google.com include:send.resend.com -all"
```

#### DKIM (DomainKeys Identified Mail)

```dns
; ESP provider vygeneruje DKIM klic
; Priklad pro Resend:
resend._domainkey.autosmartweb.cz.  CNAME  resend._domainkey.resend.dev.
```

#### DMARC

```dns
_dmarc.autosmartweb.cz.  TXT  "v=DMARC1; p=quarantine; rua=mailto:dmarc@autosmartweb.cz; pct=100"
```

**Doporucena progrese:**
1. Zacit s `p=none` (monitoring)
2. Po 2 tydnech overit reporty
3. Prepnout na `p=quarantine`
4. Po mesici `p=reject`

#### Return-Path / Bounce subdomena

```dns
mail.autosmartweb.cz.  MX  10 feedback-smtp.{esp-region}.{esp}.com.
mail.autosmartweb.cz.  TXT  "v=spf1 include:{ESP_SPF} -all"
```

**Proc bounce subdomena:**
- Oddeli outbound bounces od hlavni domeny
- Chrani reputaci `autosmartweb.cz`
- ESP provider typicky vyzaduje verifikaci

### C.11 Vztak k existujicimu Gmail workflow

| Funkce | Gmail (zachovat) | ESP (novy) |
|--------|-----------------|------------|
| Odeslani outbound emailu | NE (deprecated pro objem) | ANO — primarni |
| Inbox sync | ANO — cteni odpovedi | NE |
| Draft vytvoreni | NE (presunout do CRM frontendu) | ANO |
| Thread labeling | ANO — zachovat | NE |
| Reply detekce | ANO — `MailboxSync.gs` | NE (Faze 3) |

Gmail zustava pro:
- Read-only inbox sync (`MailboxSync.gs`)
- Reply detekce a thread matching
- Interni workflow (labeling)

ESP prebirá:
- Vsechny outbound emaily
- Delivery tracking
- Bounce handling

---

## CAST D — Doporucene MVP

### MVP scope

| Funkce | Zahrnuto | Poznamka |
|--------|---------|----------|
| Google auth login | ANO | Vedle stavajiciho hesla |
| Logout | ANO | Nova route + UI |
| Email send z frontendu | ANO | Pres ESP adapter |
| Draft editace | NE (MVP) | Pouzit existujici drafty z pipeline |
| Delivery status (basic) | ANO | SENT / FAILED |
| Delivery webhooks | NE (MVP) | Pozdeji |
| Thread sync | NE | Faze 3 |
| Reply parsing | NE | Faze 3 |
| Bulk send | NE | Mimo scope |

### MVP tech stack

- **Auth:** Google Identity Services (GIS) client-side SDK + tokeninfo API
- **Email:** Resend SDK (`resend` npm package)
- **Session:** Existujici HMAC cookie (beze zmeny)
- **Data:** Existujici LEADS extension columns + 5 novych

---

## CAST E — Fazovani

### Faze 1: Google Auth (effort ~4-6h)

1. Vytvorit Google Cloud OAuth Client ID
2. Pridat Google Sign-In do login stranky
3. Pridat `/api/auth/google` route
4. Pridat `/api/auth/logout` route
5. Pridat logout tlacitko do header
6. Testovat: Google login → session → pristup → logout
7. Zachovat legacy email+heslo login jako fallback

**Blokuje:** Google Cloud Console pristup, vytvoreni OAuth Client ID

### Faze 2: Email Send MVP (effort ~6-8h)

1. Zaregistrovat domenu u ESP (Resend doporuceno)
2. Nastavit DNS: SPF, DKIM, DMARC, bounce subdomena
3. Implementovat EmailProvider adapter (Resend)
4. Pridat `/api/email/send` route
5. Pridat "Odeslat email" akci do lead detailu v CRM frontendu
6. Pridat 5 novych extension columns do Config.gs
7. Zapsat delivery status do LEADS
8. Testovat: draft → send → status update

**Blokuje:** DNS pristup k autosmartweb.cz, ESP ucet, env promenne

### Faze 3: Email Tracking + Replies (effort ~8-12h)

1. ESP delivery webhooks (sent, delivered, bounced, complained)
2. Webhook receiver route v CRM frontendu
3. Thread view v lead detailu
4. Reply-to-CRM matching (propojeni ESP sent emailu s Gmail inbox odpoved)
5. Notifikace pri odpovedi

**Blokuje:** Dokonceni Faze 2, stabilni provoz

---

## CAST F — Rizika a rozhodnuti

### Jasne — lze pripravit hned

- [x] Architektonicky navrh (tento dokument)
- [x] Implementacni plan
- [ ] Google auth route + frontend zmeny (az owner potvdri Client ID)
- [ ] Logout route + UI
- [ ] EmailProvider adapter interface
- [ ] `/api/email/send` route (s mock providerem pro testovani)

### Zavisi na ESP vyberur

- Konkretni SDK / API integration
- DKIM CNAME zaznamy
- SPF include hodnota
- Bounce subdomena MX konfigurace
- Webhook URL a secret
- Free tier limity

### Zavisi na DNS / domene

- SPF zaznam pro autosmartweb.cz
- DKIM CNAME zaznam
- DMARC TXT zaznam
- Bounce subdomena (mail.autosmartweb.cz)
- Pristup k DNS sprave domeny

### Owner decisions

Viz `docs/18-owner-decisions-auth-email.md` — samostatny dokument s rozhodnutimi.
