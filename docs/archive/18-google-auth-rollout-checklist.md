# Rollout Checklist — Google Auth (Faze 1)

> Verze 1.0 | 2026-04-04 | Autor: Claude + user
> Stav: KOD IMPLEMENTOVAN, CLIENT ID ZISKANO — ceka na .env.local a lokalni test

---

## Predpoklady

- Kod je implementovan a builduje (tsc OK, npm run build OK)
- Google auth funguje VEDLE existujiciho hesla (dual mode)
- Middleware se nezmenilo — zpetne kompatibilni

---

## Krok 1: Google Cloud setup

**HOTOVO.** Client ID vytvoren:
```
550611170097-26oc6j24ohekb9t15k3mkgrn1qe0ogv1.apps.googleusercontent.com
```

Authorized JavaScript origins (overit v Google Cloud Console):
- `http://localhost:3000` (pro vyvoj) — **NUTNE**
- `https://PRODUKCNI-URL` (pro produkci) — doplnit pozdeji

---

## Krok 2: Env promenne

Nastavit v `.env.local` (nebo v deployment platforme):

```env
# Google Auth (OBE promenne musi mit STEJNOU hodnotu)
NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID=550611170097-26oc6j24ohekb9t15k3mkgrn1qe0ogv1.apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_ID=550611170097-26oc6j24ohekb9t15k3mkgrn1qe0ogv1.apps.googleusercontent.com

# Existujici (uz musi byt nastavene):
# NEXTAUTH_SECRET=...
# ALLOWED_EMAILS=sfridrich@unipong.cz   ← MUSI obsahovat Google ucet
# AUTH_PASSWORD=... (zachovat jako fallback)
```

**Pozor:** Pokud `.env.local` jeste neexistuje, zkopirovat z `.env.example`:
```bash
cd crm-frontend
cp .env.example .env.local
# Doplnit vsechny hodnoty
```

**Proc dve promenne:**
- `NEXT_PUBLIC_*` je pristupna v browseru (pro GIS SDK inicializaci)
- `GOOGLE_OAUTH_CLIENT_ID` je server-only (pro backend token verification)

---

## Krok 3: Overeni ALLOWED_EMAILS

Zkontrolovat ze `ALLOWED_EMAILS` obsahuje Google ucty, ktere se maji prihlasit.

Priklad: `ALLOWED_EMAILS=sfridrich@unipong.cz,jiny@gmail.com`

**Pozor:** Google ucet musi mit email v tomto seznamu. Pokud neni → pristup zamitnut (403).

---

## Krok 4: Spusteni a test

```bash
cd crm-frontend
npm run dev
```

### Test T1: Google login (happy path)
1. Otevrit http://localhost:3000/login
2. Melo by se zobrazit Google Sign-In tlacitko NAD email+heslo formularem
3. Kliknout "Prihlasit se pres Google"
4. Vybrat Google ucet ktery je v ALLOWED_EMAILS
5. **Ocekavany vysledek:** Redirect na /dashboard. V headeru se zobrazi email a inicialky.

### Test T2: Google login (ucet mimo allowlist)
1. Kliknout "Prihlasit se pres Google"
2. Vybrat ucet ktery NENI v ALLOWED_EMAILS
3. **Ocekavany vysledek:** Chybova zprava "Pristup zamitnut"

### Test T3: Legacy heslo login
1. Zadat email a heslo do formulare
2. Kliknout "Prihlasit se heslem"
3. **Ocekavany vysledek:** Login funguje jako drive

### Test T4: Logout
1. Po prihlaseni kliknout na ikonu odhlaseni (sipka ven) v pravem hornim rohu
2. **Ocekavany vysledek:** Redirect na /login

### Test T5: Session identita
1. Po prihlaseni pres Google zkontrolovat header — melo by ukazovat email a "Google" v sidebar
2. Po prihlaseni pres heslo — melo by ukazovat email a "Heslo" v sidebar

### Test T6: Pristup bez session
1. V browseru smazat cookie `crm-session` (DevTools → Application → Cookies)
2. Pristoupit na /dashboard
3. **Ocekavany vysledek:** Redirect na /login

### Test T7: Expirovana session
1. Pockam 7+ dni (nebo rucne zmenim ts v cookie na stare datum)
2. **Ocekavany vysledek:** Redirect na /login

---

## Krok 5: Produkcni deploy

1. Nastavit env promenne na deploymentu platforme
2. Deploy
3. Overit T1-T6 na produkci
4. Zkontrolovat ze Authorized JavaScript origins v Google Cloud obsahuji produkcni URL

---

## Krok 6: Dokumentace

Po PASS vsech testu:
1. Aktualizovat `docs/01-decision-list.md` — D-7 stav na CASTECNE VYRESENO (Google auth + heslo fallback)
2. Aktualizovat `docs/09-project-control-tower.md` — H-1 stav

---

## Troubleshooting

| Problem | Reseni |
|---------|--------|
| Google tlacitko se nezobrazuje | Zkontrolovat `NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID` (musi byt nastavena) |
| "Google auth neni nakonfigurovano" | Zkontrolovat `GOOGLE_OAUTH_CLIENT_ID` (server-side) |
| "Pristup zamitnut" po Google login | Email neni v `ALLOWED_EMAILS` |
| "Neplatny Google token" | Client ID nesouhlasi s Authorized JavaScript origins |
| Google tlacitko se nacita ale nereaguje | Zkontrolovat konzoli browseru — GIS script error |
| Legacy login nefunguje | `AUTH_PASSWORD` neni nastavena |
