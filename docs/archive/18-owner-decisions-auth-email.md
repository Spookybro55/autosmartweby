# Owner Decisions — Google Auth + Email Sending

> Verze 1.0 | 2026-04-04 | Autor: Claude + user
> Stav: CEKA NA ROZHODNUTI VLASTNIKA
> Zavislost: docs/18-google-auth-and-email-architecture.md, docs/18-implementation-plan-auth-email.md

---

## Prehled

| # | Rozhodnuti | Blokuje | Priorita |
|---|-----------|---------|----------|
| OD-1 | Google Cloud projekt + OAuth Client ID | Fazi 1 (auth) | VYSOKA |
| OD-2 | Vyber ESP providera | Fazi 2 (email) | VYSOKA |
| OD-3 | DNS pristup k autosmartweb.cz | Fazi 2 (email) | VYSOKA |
| OD-4 | Odebrat legacy heslo login | Fazi 1 dokonceni | NIZKA |
| OD-5 | ALLOWED_EMAILS — aktualni seznam | Fazi 1 | STREDNI |
| OD-6 | Deployment platforma (Vercel / jina) | Rollout | STREDNI |
| OD-7 | Email reply workflow | Fazi 3 | NIZKA |

---

## OD-1: Google Cloud projekt + OAuth Client ID

**Co je potreba:**
1. Prihlasit se do Google Cloud Console (https://console.cloud.google.com)
2. Vytvorit projekt (nebo pouzit existujici)
3. Povolit Google Identity API
4. Vytvorit OAuth 2.0 Client ID (typ: Web application)
5. Nastavit Authorized JavaScript origins:
   - `http://localhost:3000` (vyvoj)
   - `https://crm.autosmartweb.cz` (produkce — nebo jaka je URL)
6. Predat Client ID jako env promennou `GOOGLE_OAUTH_CLIENT_ID`

**Doporuceni:** Pouzit existujici Google Cloud projekt (pokud uz existuje pro service account, ktery cte Sheets). Staci pridat OAuth Client ID.

**Blokuje:** Celou Fazi 1 (bez Client ID nelze testovat Google login)

**Moznost bez tohoto rozhodnuti:** Lze pripravit veskery kod s placeholder Client ID a otestovat se stavajicim heslem. Ale Google login tlacitko nebude funkcni.

---

## OD-2: Vyber ESP providera

**Varianty:**

| Provider | Cena (MVP) | Setup slozitost | Uz v ekosystemu? | Doporuceni |
|----------|-----------|-----------------|-------------------|------------|
| **Resend** | Free do 100/den | Nizka | ANO (web-starter) | **1. volba** |
| Postmark | $15/mo | Nizka | Ne | 2. volba (nejlepsi reputace) |
| SendGrid | Free do 100/den | Stredni | Ne | 3. volba |
| Amazon SES | ~$0.10/1000 | Vyssi | Ne | 4. volba (nejlevnejsi pri objemu) |

**Doporuceni:** **Resend** — uz se pouziva pro kontaktni formular na web-starteru, jednoduche API, dobra dorucivanost, free tier staci pro MVP objem (~10-50 emailu/den).

**Blokuje:** Implementaci Faze 2 (bez API klice nelze odeslat)

**Moznost bez tohoto rozhodnuti:** Lze pripravit:
- EmailProvider interface
- Provider factory
- API route s mock providerem (loguje misto odeslani)
- Frontend UI pro odeslani

---

## OD-3: DNS pristup k autosmartweb.cz

**Co je potreba:**
1. Pristup k DNS sprave domeny autosmartweb.cz
2. Pridat SPF zaznam (nebo upravit existujici)
3. Pridat DKIM CNAME zaznam (dle ESP)
4. Pridat DMARC TXT zaznam

**Otazky pro vlastnika:**
- Kde je domena registrovana? (registrar, DNS provider)
- Kdo ma pristup k DNS sprave?
- Existuje uz SPF zaznam? (zjistit: `dig TXT autosmartweb.cz`)
- Je domena na Cloudflare / jinym DNS proxy?

**Doporuceni:** Overit stavajici DNS pred zmenami. Pokud uz existuje SPF, pouze pridat `include:` pro ESP.

**Blokuje:** Dorucitelnost emailu z info@autosmartweb.cz (bez SPF/DKIM budou emaily v spamu)

**Moznost bez tohoto rozhodnuti:** Lze testovat s Resend test domenou (neco@resend.dev) — funkcni, ale nepouzitelne pro produkci.

---

## OD-4: Odebrat legacy heslo login

**Soucasny stav:** Email + sdilene heslo (`AUTH_PASSWORD`)

**Varianty:**
1. **Zachovat oba** (doporuceno pro MVP) — Google auth jako primarni, heslo jako fallback
2. **Odebrat heslo** — jen Google auth (cistejsi, ale vyzaduje ze vsichni uzivatele maji Google ucet)
3. **Odebrat heslo s grace periodem** — po 30 dnech dual-mode prepnout na Google-only

**Doporuceni:** Varianta 1 pro MVP. Odebrat heslo az po overeni, ze Google auth funguje bezchybne.

**Blokuje:** Nic (implementace pokracuje s obema)

---

## OD-5: ALLOWED_EMAILS — aktualni seznam

**Soucasny stav:** `ALLOWED_EMAILS` env var s comma-separated emaily. Pouziva se pro overeni pri loginu.

**Otazky:**
- Kteri uzivatele (Google ucty) maji mit pristup?
- Jsou to @autosmartweb.cz ucty, @gmail.com, nebo mix?
- Chcete omezit na konkretni Google Workspace domenu?

**Doporuceni:** Predat konkretni seznam emailu. Format: `user1@gmail.com,user2@autosmartweb.cz`

**Blokuje:** Testovani Google auth (bez platneho emailu v allowlistu se nikdo neprihlasi)

**Moznost bez tohoto rozhodnuti:** Pouzit existujici `ALLOWED_EMAILS` hodnotu — funguje i pro Google auth.

---

## OD-6: Deployment platforma

**Soucasny stav:** CRM frontend bezi lokalne (`npm run dev`) nebo je deploynuto... kam?

**Otazky:**
- Kde bezi CRM frontend v produkci? (Vercel, VPS, lokalne?)
- Jaka je produkcni URL? (crm.autosmartweb.cz? jina?)
- Env promenne se nastavuji kde? (Vercel dashboard? .env.local?)

**Doporuceni:** Vercel — automaticky deploy z gitu, env promenne pres dashboard, preview deploys.

**Blokuje:** Rollout plan (kam deployovat, jak nastavit env)

---

## OD-7: Email reply workflow

**Otazka pro budoucnost (Faze 3):**
- Kdyz prijemce odpovi na email z info@autosmartweb.cz, kam odpoved prijde?
- Varianta A: info@autosmartweb.cz je Google Workspace mailbox → odpovedi v Gmailu → MailboxSync je precte
- Varianta B: info@autosmartweb.cz je forwardovany alias → kam?
- Varianta C: ESP webhook zachyti inbound reply → zapise do CRM

**Doporuceni:** Varianta A (Workspace mailbox) je nejjednodussi. MailboxSync.gs uz umi cist odpovedi. Staci nastavit `EMAIL_MAILBOX_ACCOUNT = 'info@autosmartweb.cz'` v Config.gs.

**Blokuje:** Nic pro MVP (Faze 3)

---

## Co lze delat BEZ owner decisions

| Ukol | Zavisi na | Lze delat? |
|------|----------|------------|
| Pripravit /api/auth/google route | OD-1 (Client ID) | ANO — s placeholder |
| Pripravit /api/auth/logout route | Nic | ANO |
| Pripravit logout UI v header | Nic | ANO |
| Pripravit login UI s Google tlacitkem | OD-1 (Client ID) | ANO — s placeholder |
| Pripravit EmailProvider interface | Nic | ANO |
| Pripravit Resend adapter | OD-2 | ANO — s mock |
| Pripravit /api/email/send route | OD-2 | ANO — s mock providerem |
| Pripravit "Odeslat email" UI | Nic | ANO |
| DNS zmeny | OD-3 | NE |
| Produkcni Google login | OD-1 | NE |
| Produkcni email odeslani | OD-2 + OD-3 | NE |

**Zaver:** ~80% kodu lze pripravit bez jakychkoli owner decisions. Zbyvajicich 20% jsou env promenne a DNS konfigurace.

---

## Doporuceny dalsi krok

1. Vlastnik rozhodne OD-1 (Google Cloud Client ID) a OD-2 (ESP = Resend)
2. Implementace Faze 1 (Google auth) — okamzite po ziskani Client ID
3. Paralelne: vlastnik zajisti DNS pristup (OD-3)
4. Implementace Faze 2 (email send) — po DNS zmenach
