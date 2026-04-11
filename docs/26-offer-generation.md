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

### Preview Slug Contract (B-01)

Formalni pravidla pro `preview_slug` jsou definovana v `preview-contract.ts` jako `PreviewSlugContract` interface a `PREVIEW_SLUG_PATTERN` regex. Klicove garance:

- **Format:** lowercase, hyphenated, URL-safe (`/^[a-z0-9](...)[a-z0-9]$/`)
- **Diakritika:** transliterovana do ASCII (ceske znaky)
- **Stabilita:** slug se po vygenerovani nesmi menit
- **Unikatnost:** garantovana, kolize reseny numerickim suffixem (-2, -3, ...)
- **Delka:** 3–80 znaku

Samotna implementace slug generatoru (`buildSlug_()`) neni soucasti B-01 — kontrakt definuje pouze pravidla, ktera musi generator splnovat.

### Section Mapping Contract (B-01)

Explicitni mapping brief fields → render sections je definovan v `preview-contract.ts` jako `SECTION_MAPPING_CONTRACT`. Pro kazdou ze 6 sections specifikuje:
- ktere fields ji napaji (primary / fallback)
- kdy je section renderovatelna (full / degraded / hidden)
- ktere fields jsou required pro render

Gate pravidlo: section se renderuje pouze pokud je v `suggested_sections`. Field mapping rozhoduje o kvalite renderovani uvnitr section.

### Adoption path

| Task | Co pouziva z B-01 |
|------|-------------------|
| B-02 | PreviewBrief + template_type + preview_slug + SECTION_MAPPING_CONTRACT — **DONE**: MVP renderer v `/preview/[slug]`, 6 sekci, hardcoded sample brief |
| B-03 | TemplateType (mapovani na render sablony) |
| B-04 | MinimalRenderRequest + MinimalRenderResponse |
| B-05 | Response schema + preview_slug gap fix v GAS + PreviewSlugContract |

**Doporuceni:** Minimal Compatible first → Target po MVP.

**POZOR:** Alias `PreviewRenderResponse` byl odstranen — downstream tasky musi referencovat explicitne `MinimalRenderResponse` nebo `TargetRenderResponse`.

## Preview Renderer (B-02)

MVP preview renderer je implementovan jako Next.js App Router route `/preview/[slug]`. Renderuje landing page z hardcoded sample briefu. Sekce se renderuji vyhradne podle `brief.suggested_sections`. Nepouziva API endpoint ani runtime validaci — data jsou staticky importovana z B-01 fixture souboru.

Dostupne sample previews: `remesla-dvorak` (rich fixture, 5 sekci), `sluzby-priklad` (minimal fixture, 4 sekce).

## Cilovy model

Preview URL = personalizovany web generovany z briefu, zaslany klientovi v emailu.
Zatim jen pripraveny smer, ne hotova vrstva.
