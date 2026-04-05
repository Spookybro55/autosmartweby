# Business Process — Autosmartweby

> **Kanonicky dokument.** Popisuje aktualni obchodni proces, ne budouci vizi.
> **Posledni aktualizace:** 2026-04-05

---

## Cilova skupina

Male ceske firmy (remeslnici, sluzby), ktere nemaji web nebo maji slaby web.

## Aktualni workflow

### 1. Vstup dat
Data se dostavaji do LEADS sheetu mimo tento system. Neexistuje automaticky scraper.

### 2. Obohaceni — web check
LegacyWebCheck pres Serper API hleda chybejici weby. Rucni spusteni z menu (20/50/100 radku).

### 3. Kvalifikace
qualifyLeads() — rucni spusteni. Kriteria:
- Musi mit email NEBO telefon
- Musi mit business_name
- Enterprise/chain → REVIEW
- Bez webu / slaby web / konflikt / neznamy → QUALIFIED
- Dobry web → DISQUALIFIED

### 4. Prioritizace
- HIGH: chybi/slaby web + email draft + email
- MEDIUM: castecne splneno
- LOW: omezene kontaktni udaje

### 5. Generovani briefu a draftu
processPreviewQueue() — automaticky timer (15min) nebo rucne:
- Template typ podle segmentu
- Preview brief (JSON)
- Email draft (cesky, personalizovany)
- Pipeline se zastavi na BRIEF_READY (DRY_RUN=true)

### 6. Kontaktni sheet
refreshContactingSheet() — odvozeny list "Ke kontaktovani":
- KPI dashboard
- Tabulka leadu s prioritou
- 5 editovatelnych sloupcu s write-back do LEADS

### 7. Osloveni
Per-lead, rucne z menu v Google Sheets:
- Gmail draft nebo primo odeslani
- Predvyplneny predmet + telo z draftu
- Double-send ochrana

### 8. Sledovani odpovedi
syncMailboxMetadata() — read-only scan Gmailu:
- Klasifikace: REPLY / BOUNCE / OOO
- Metadata zapis do LEADS
- CRM labely na vlakna

### 9. CRM dashboard
Next.js frontend — sledovani pipeline, follow-upu, editace stavu.

## Chybejici kroky (budouci smer)

- Scraping kontaktu z portalu (firmy.cz apod.)
- Automaticka tvorba preview webu z briefu
- Hromadne odesilani emailu
- Automaticky trigger na novy lead
