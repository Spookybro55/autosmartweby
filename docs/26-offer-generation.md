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

## Preview Brief Schema (B-01)

Formalni kontrakt pro preview brief je definovan v `crm-frontend/src/lib/domain/preview-contract.ts`.

### Brief shape

18 poli, vsechna vzdy pritomna. Generuje `buildPreviewBrief_()` v PreviewPipeline.gs.
Sample fixtures: `crm-frontend/src/lib/mock/preview-brief.minimal.json`, `preview-brief.rich.json`.

### Dve urovne kontraktu

1. **Minimal Compatible** — zpetne kompatibilni s existujicim GAS kodem. Jedina nutna zmena: pridat `preview_slug` do webhook payloadu (1 radek). **Doporuceno pro prvni implementaci** (B-04), protoze nevyzaduje zadne dalsi zmeny v GAS response handling kodu.

2. **Recommended Target** — cistsi verze bez internich GAS metadat, s `contract_version` a strukturovanymi error kody. Ma prijit az po uspesnem MVP / E2E, protoze vyzaduje restrukturalizaci GAS payloadu (odstraneni internich poli, pridani contract_version, prejmenovani timestamp na requested_at).

### Adoption path

| Task | Co pouziva z B-01 |
|------|-------------------|
| B-02 | PreviewBrief + template_type + preview_slug |
| B-03 | TemplateType (mapovani na render sablony) |
| B-04 | MinimalRenderRequest + MinimalRenderResponse |
| B-05 | Response schema + preview_slug gap fix v GAS |

**Doporuceni:** Minimal Compatible first → Target po MVP.

## Cilovy model

Preview URL = personalizovany web generovany z briefu, zaslany klientovi v emailu.
Zatim jen pripraveny smer, ne hotova vrstva.
