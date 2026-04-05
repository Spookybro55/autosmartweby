# Offer Generation — Autosmartweby

> **Kanonicky dokument.** Aktualizuje se pri zmene preview/offer pipeline.
> **Posledni aktualizace:** 2026-04-05

---

## Dnesni stav

### Co existuje

**Preview brief (JSON)** — generovany v Apps Script:
- headline (cesky, s lokativem mesta)
- subheadline
- CTA (telefon > email > generic)
- key_benefits (lokace, rating, kontakt, service type)
- suggested_sections (hero, services, contact, reviews, location, faq)
- confidence_level (high/medium/low)

**Email draft** — generovany v Apps Script:
- Personalizovany predmet
- Telo zpravy s situacne zavislym uvodem (bez webu / slaby web / dobry web / konflikt)
- Pain point mention (pokud existuje)
- Cesky jazyk s lokativy

**Template typy** (chooseTemplateType_):
- instalater, electrician, locksmith, painter, mason, cleaning, gardener, auto-service, beauty, restaurant
- Generic local-service fallback
- Suffix: -no-website, -weak-website, -data-conflict, -basic

### Co neexistuje

**Preview web** — ze briefu se negeneruje skutecny web:
- Webhook pipeline je v kodu pripravena
- ENABLE_WEBHOOK=false, WEBHOOK_URL prazdny
- Zadna externi sluzba pro generovani preview webu
- Pole preview_url a preview_screenshot_url jsou prazdna

**Staticke nabidky** (offers/):
- nabidka-web-remeslnici.html + PDF
- nabidka-automatizace.html + PDF
- Toto jsou obecne obchodni nabidky, NE personalizovane preview weby

## Cilovy model

Preview URL = personalizovany web generovany z briefu, zaslany klientovi v emailu.
Zatim jen pripraveny smer, ne hotova vrstva.
