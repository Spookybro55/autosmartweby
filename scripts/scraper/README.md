# scripts/scraper — A-04 firmy.cz scraper

Runtime implementation of **A-04: Scraper runtime**. Pro 1 A-01 job produkuje pole
RAW_IMPORT rows (per A-02 kontrakt) z jednoho portálu. Pilot cíluje na **firmy.cz**.

## Quick start

```bash
# Fixture mode (deterministic, offline — default)
node scripts/scraper/firmy-cz.mjs \
  --job scripts/scraper/samples/job.sample.json \
  --out scripts/scraper/samples/output.sample.json

# Live mode (real HTTP to firmy.cz — verify ToS first)
node scripts/scraper/firmy-cz.mjs \
  --job scripts/scraper/samples/job.sample.json \
  --mode live \
  --out /tmp/scrape.json
```

## CLI flags

| Flag | Popis |
|------|-------|
| `--job <path>` | Cesta k A-01 `ScrapingJobInput` JSON souboru (povinné) |
| `--mode <mode>` | `fixture` (default) nebo `live` |
| `--out <path>` | Výstupní JSON (default: stdout) |
| `--max-results <n>` | Override `job.max_results` pro testování |
| `--help` | Nápověda |

## Režimy

### `fixture` (default)

Deterministický offline mód. Čte HTML soubory z `samples/fixtures/`:

- `firmy-cz-listing.html` — listing page s odkazy na detail pages
- `firmy-cz-detail-*.html` — detail pages (8 fixtures pro pilot)

Fixtury jsou realistické reprezentace firmy.cz detail stránek — obsahují JSON-LD
schema.org bloky (LocalBusiness / Electrician / Plumber), Open Graph meta tagy,
a fallback HTML pro regex extrakci. Slouží k unit testingu parseru i jako
reproducibilní sample output pro A-04 acceptance audit.

### `live`

Reálné HTTP requesty na `https://www.firmy.cz/`. Rate limit 1.5 s mezi requesty,
identifikující User-Agent `autosmartweby-scraper/0.1`.

**Důležité upozornění:** Před použitím live módu ověř firmy.cz Terms of Service
a robots.txt. Scraping je ve většině podmínek upravený a může být omezen
nebo zakázán. Tento skript je nástroj — zodpovědnost za soulad s pravidly
portálu leží na provozovateli.

## Architektura

```
scripts/scraper/
├── firmy-cz.mjs              CLI entry, orchestrator
├── lib/
│   ├── job-id.mjs            A-01 source_job_id (deterministický hash)
│   ├── raw-row.mjs           A-02 RAW_IMPORT row builder
│   ├── html-extract.mjs      JSON-LD / OG / meta helpers (no deps)
│   ├── firmy-cz-parser.mjs   portal-specific parsing
│   └── fetch-polite.mjs      rate-limited HTTP fetch
└── samples/
    ├── job.sample.json       A-01 vzorový job input
    ├── output.sample.json    vzorový výstup (generovaný fixture módem)
    └── fixtures/             offline fixture HTML (listing + 8 detail)
```

Dependency: **žádné** runtime deps. Pouze Node.js built-ins (Node ≥ 18 kvůli global `fetch`).

## Výstup

JSON s polem `rows` — každý prvek je kompletní A-02 RAW_IMPORT row (16 polí)
připravený k zápisu do `_raw_import` sheetu. Součástí je také `summary` s metrics
(`attempted`, `extracted`, `failed`, `skipped`, `duration_ms`) a `errors` s
per-record failure kontextem.

Zápis do Google Sheets (`_raw_import`) není součástí A-04 — je to samostatná
odpovědnost v A-05 / A-09 nebo ve sheet bootstrap skriptu. A-04 produkuje
validní RAW_IMPORT row objekty; jejich perzistence je downstream.

## Parsing strategie (firmy.cz)

Pro každou detail stránku:

1. **Primary — JSON-LD schema.org.** Hledá `<script type="application/ld+json">` a
   vytahuje object s `@type` v `LocalBusiness` / `Organization` / `Electrician` /
   `Plumber` / `HomeAndConstructionBusiness` / `ProfessionalService` / `Store`.
   Z něj čte `name`, `telephone`, `email`, `url`, `taxID` / `identifier.value`,
   `address.{addressLocality,addressRegion}`, `contactPoint.name`, `employee[0].name`,
   `aggregateRating.{ratingValue,reviewCount}`.
2. **Fallback 1 — Open Graph / named meta.** `og:title` → business_name (s odstraněním
   `| firmy.cz` suffixu), `og:url` → canonical URL.
3. **Fallback 2 — regex na stable HTML patterns.** `href="tel:..."`, `href="mailto:..."`,
   `href="https://..." ... Webové stránky`, `IČO: 12345678`.
4. **Kategorie:** primární přes `@type` (konkrétní podtyp jako `Electrician`),
   fallback přes `BreadcrumbList` JSON-LD, konečný fallback na `job.segment`.

Každé pole má vlastní `try/catch` — selhání jednoho pole neselže celou detail extrakci.

## Error handling

- **Per-field fail:** individuální pole selže → zalogováno v `fieldsFailed`, ostatní
  pole pokračují normálně.
- **Per-record fail:** celá detail page hodí výjimku NEBO extrakce nevrátí žádná
  smysluplná pole (`business_name` + `phone` + `email` jsou všechny null) →
  `summary.failed++`, záznam se přeskočí, **job pokračuje na další detail**.
- **Listing fail:** chyba při načtení listing page → job se ukončí s
  `job_status = "failed"`, report obsahuje chybu a prázdné `rows`. Kód exit 0
  (report je valid), caller rozhodne o retry.

## Acceptance test — fixture run

Spuštění:

```bash
node scripts/scraper/firmy-cz.mjs --job scripts/scraper/samples/job.sample.json --mode fixture --out scripts/scraper/samples/output.sample.json
```

Očekávaný výstup:
```
[INFO] 8 candidate detail URLs
[OK]   ... — 11 fields: business_name, ico, contact_name, phone, email, website, city, district, category, rating, reviews_count
...
[FAIL] fixture://firmy-cz-detail-08-broken — no meaningful fields
[DONE] attempted=8 extracted=7 failed=1 skipped=0
```

Rows v `output.sample.json` odpovídají A-02 `RawImportRow` kontraktu
(16 sloupců, `raw_import_id` = `RAW-{hash10}-{seq6}`, `normalized_status="raw"`,
`processed_by="scraper"`, `raw_payload_json` je serializovaný JSON string s klíči
odpovídajícími A-03 normalizačnímu mappingu).

## Omezení / known limits

- **Pouze firmy.cz.** zivefirmy.cz (druhý enum portal v A-01) není implementován
  — vyžaduje vlastní parser v `lib/` jako sibling k `firmy-cz-parser.mjs`.
- **Žádný sheet writer.** Scraper produkuje JSON; zápis do `_raw_import` je
  odpovědnost jiného kroku pipeline.
- **Live smoke test proveden 2026-04-11** — `attempted=10 extracted=10 failed=0
  skipped=0`, `job_status=completed`, duration 15.4 s. Výstup v
  `samples/output.live.json` (gitignored — obsahuje reálná kontaktní data).
- **Parser předpokládá SSR HTML.** firmy.cz v produkci kombinuje SSR s client-side
  renderingem. Pokud bude listing heavily JS-driven, listing extractor vrátí
  prázdný seznam — pro A-04 acceptance je to validní fail mode (listing fail
  → `job_status=failed`), ale může vyžadovat headless browser (out of scope).
