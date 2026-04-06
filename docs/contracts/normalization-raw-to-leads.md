# Normalization: Raw -> LEADS Rules — v1.0

> **Machine-readable mapping:** [`raw-to-leads-mapping.json`](./raw-to-leads-mapping.json)
> **Depends on:** A-01 Scraping Job Input Contract v1.0, A-02 RAW_IMPORT Staging Layer v1.0
> **Stream:** A (Data & Automation)

---

## 1. Purpose

Defines how a raw row in `_raw_import` becomes a validated row in `LEADS`. Covers field mapping, cleaning rules, missing/null/empty policy, `lead_id` generation, and 6 new source metadata columns added to LEADS.

### Principles
1. **Reuse existing helpers.** All cleaning goes through `Helpers.gs:320-395`: `normalizePhone_`, `trimLower_`, `removeDiacritics_`, `canonicalizeUrl_`, `isRealUrl_`, `extractDomainFromUrl_`, `extractBusinessDomainFromEmail_`, `isBlank_`. No parallel normalization functions.
2. **No new lead_id scheme.** Reuse `ASW-{ts36}-{rnd4}` format from `PreviewPipeline.gs:63-108`; generator extracted into a shared `generateLeadId_()` helper used by both backfill and import writer.
3. **Append-only LEADS schema extension.** 6 new `source_*` columns appended to `EXTENSION_COLUMNS` in `Config.gs:63`. Legacy columns 1-20 untouched; `validateLegacyColHeaders_()` guard unaffected.
4. **Scraper produces uniform payload.** Portal-specific parsing (firmy.cz vs zivefirmy.cz) is the responsibility of the scraper (A-04). Normalizer consumes canonical key shape.
5. **Empty string `""` over null for core contact fields.** `phone`, `email`, `website_url` are always strings, never null. Consistent with `isBlank_()` guard convention and Sheets API round-trip.

---

## 2. Field mapping (summary)

Full machine-readable version in [`raw-to-leads-mapping.json`](./raw-to-leads-mapping.json).

| Raw source (payload key) | Target LEADS field | Transform | Missing |
|---|---|---|---|
| `business_name` | `business_name` (LEGACY_COL=4) | trim + collapse whitespace | REJECT MISSING_BUSINESS_NAME |
| `ico` | `ico` (HeaderResolver) | strip non-digits, valid iff 8 digits | null |
| `contact_name` | `contact_name` (HeaderResolver) | trim, fake tokens -> null | null |
| `phone` | `phone` (LEGACY_COL=11) | `normalizePhone_()` + CZ prefix rules | **empty string ""** |
| `email` | `email` (LEGACY_COL=12) | `trimLower_()` + regex | **empty string ""** |
| `website` | `website_url` (LEGACY_COL=13) | `canonicalizeUrl_()` + `isRealUrl_()` | **empty string ""** |
| *(computed)* | `has_website` (LEGACY_COL=20) | `isRealUrl_(website_url) ? 'yes' : 'no'` | always filled |
| `city` | `city` (LEGACY_COL=9) | trim, preserve diacritics | REJECT MISSING_CITY |
| `district` | `district` (HeaderResolver) | trim | null |
| `area` | `area` (HeaderResolver) | trim | null |
| `segment` / `category` | `segment` (HeaderResolver) | `removeDiacritics_(trimLower_())` + dash normalization | null |
| `service_type` | `service_type` (HeaderResolver) | trim (no lowercase, no diacritics stripping) | null |
| `pain_point` | `pain_point` (HeaderResolver) | trim | null |
| `rating` | `rating` (HeaderResolver) | `replace(',','.') -> Number()`, valid iff [0..5] | null (no clamp) |
| `reviews_count` | `reviews_count` (HeaderResolver) | `parseInt(v, 10)`, valid iff integer >= 0 | null |
| `_raw_import.source_job_id` | `source_job_id` *(new)* | copy | always present |
| `_raw_import.source_portal` | `source_portal` *(new)* | copy | always present |
| `_raw_import.source_url` | `source_url` *(new)* | copy | always present |
| `_raw_import.raw_import_id` | `source_raw_import_id` *(new)* | copy | always present |
| `_raw_import.scraped_at` | `source_scraped_at` *(new)* | copy | always present |
| *(generated)* | `source_imported_at` *(new)* | `new Date().toISOString()` | always present |
| *(generated)* | `lead_id` | `generateLeadId_()` | always generated |
| *(constant)* | `lead_stage` | literal `'NEW'` | always filled |

**Not written by A-03** (downstream responsibility): `company_key`, `branch_key`, `dedupe_group`, `dedupe_flag` (A-05); `preview_*`, `email_*`, `contact_*`, `template_type`, `qualification_*` (`qualifyLeads()`, `processPreviewQueue()`, mailbox sync).

---

## 3. Cleaning rules

### `business_name`
- `String(v).trim()`, collapse multiple whitespaces to single space.
- Preserve case, diacritics, suffixes (`s.r.o.`, `a.s.`). Do **not** apply `normalizeBusinessName_()` — that is destructive and reserved for `company_key` computation.
- Max 200 chars (truncate + WARN log).
- REJECT if length < 2 after trim.

### `ico`
- `String(v).replace(/\D/g, '')`.
- Valid **iff** length equals 8. Otherwise `null`.
- No checksum validation (out of scope).

### `contact_name`
- `String(v).trim()`, collapse whitespace.
- Standalone fake tokens (`info`, `kontakt`, `sales`, `office`, `hello`, `admin`, `webmaster`) -> `null`.
- Preserve case and diacritics.

### `phone`
- `normalizePhone_(v)` -> strip to `[0-9+]`.
- CZ prefix normalization:
  - Starts with `+`: keep.
  - Starts with `00420`: replace with `+420`.
  - Exactly 9 digits, no prefix: prepend `+420`.
  - `0` + 9 digits: strip leading `0`, prepend `+420`.
  - `420` + 9 digits: prepend `+`.
- Must be `+` + 9..15 digits. Otherwise **empty string `""`**.

### `email`
- `trimLower_(v)`.
- Regex `^[^\s@]+@[^\s@]+\.[^\s@]+$`.
- Invalid -> **empty string `""`**.
- Freemail domains allowed in LEADS; filtered only for `company_key` via `extractBusinessDomainFromEmail_()`.

### `website_url`
- `canonicalizeUrl_(v)` -> `https://host`.
- `isRealUrl_(canonical)` check (excludes `-`, `n/a`, `nenalezeno`, etc.).
- Invalid or empty -> **empty string `""`**.
- `has_website` then always derives: `"yes"` if non-empty, `"no"` otherwise. Never null, never empty.

### `city`
- `String(v).trim()`.
- **Preserve case and diacritics** (required by `formatLocationPhrase_()` in `Helpers.gs:597` which uses `CITY_LOCATIVES_`).
- REJECT if empty.
- Max 80 chars.

### `district` / `area`
- `String(v).trim()`, preserve case and diacritics.
- Empty -> `null`.
- If `district == city` -> `null` (redundant).
- Max 80 chars.

### `segment`
- Source: `payload.segment`, fallback `payload.category`.
- `removeDiacritics_(trimLower_(v))`.
- Replace non-`[a-z0-9]` chars with `-`, collapse consecutive dashes, strip leading/trailing dashes.
- Must match `^[a-z0-9][a-z0-9_-]*[a-z0-9]$` (compatible with A-01).
- If < 2 chars after cleaning -> `null`.

### `service_type`
- `String(v).trim()`, collapse whitespace.
- **No lowercasing, no diacritics stripping.** Human-readable raw text.
- Max 120 chars.
- Empty -> `null`.

### Numeric fields
See section 5.

---

## 4. Missing / null rules

### REJECT (status `error`, decision `rejected_error`)
Raw row does not become a LEADS row if any of:
- `raw_payload_json` is not valid JSON -> `INVALID_PAYLOAD_JSON`
- `business_name` empty or < 2 chars after trim -> `MISSING_BUSINESS_NAME`
- `city` empty after trim -> `MISSING_CITY`
- Both `phone == ""` and `email == ""` after cleaning -> `NO_CONTACT_CHANNELS`
- Normalizer throws exception -> `NORMALIZATION_FAILED`
- LEADS write fails -> `LEADS_WRITE_FAILED`

### Default — always filled, never null
- `has_website` — computed `"yes"` or `"no"`
- `lead_stage` — `"NEW"`
- `lead_id` — generated
- `source_imported_at` — generated at insert
- `source_job_id`, `source_portal`, `source_url`, `source_raw_import_id`, `source_scraped_at` — copied from `_raw_import`

### Empty string `""` (never null)
- `phone`
- `email`
- `website_url`

### Keep null (optional, not failed)
- `ico`, `contact_name`, `district`, `area`, `segment`, `service_type`, `pain_point`, `rating`, `reviews_count`

### Check order
1. Parse `raw_payload_json` -> `INVALID_PAYLOAD_JSON` on fail
2. Clean `business_name` -> `MISSING_BUSINESS_NAME` on fail
3. Clean `city` -> `MISSING_CITY` on fail
4. Clean `phone` and `email` -> `NO_CONTACT_CHANNELS` if both empty
5. Clean `website_url`, compute `has_website`
6. Clean optional fields
7. Copy source metadata from `_raw_import`
8. Generate `lead_id` and `source_imported_at`
9. Assemble LEADS row and hand off to import writer

---

## 5. Numeric rules

| Field | Input handling | Valid output | Invalid output |
|---|---|---|---|
| `rating` | 1. `null`/`undefined` -> `null`. 2. `String(v).replace(',','.').trim()` -> `Number()`. 3. `NaN` -> `null`. 4. `< 0` or `> 5` -> `null`. 5. Otherwise keep as float. | `number` in `[0, 5]` | `null` |
| `reviews_count` | 1. `null`/`undefined`/`""` -> `null`. 2. `String(v).trim()` -> `parseInt(s, 10)`. 3. `NaN` -> `null`. 4. `< 0` -> `null`. 5. Otherwise keep as integer. | `number` integer `>= 0` | `null` |

### Rating: no clamp
`rating = 6` yields `null`, not `5`. A clamp would silently fix defective scraper input; null forces A-04 to produce valid data and lets A-09 reports surface the anomaly.

### reviews_count: parseInt semantics
`parseInt` reads a leading numeric prefix and ignores trailing garbage: `"27 recenzi"` -> `27`, `"27"` -> `27`, `"27.9"` -> `27` (truncate), `""` -> `null`, `"recenzi: 27"` -> `null` (no leading digit), `"-5"` -> `null`.

---

## 6. `lead_id` generation

### Format
`ASW-{ts36}-{rnd4}` where `ts36 = Date.now().toString(36)` and `rnd4 = Math.random().toString(36).substring(2, 6)`. Example: `ASW-lu8k3x9a-b4f1`.

### Shared helper
Extracted from `PreviewPipeline.gs:63-108` into `Helpers.gs`:
```js
function generateLeadId_() {
  return 'ASW-' + Date.now().toString(36) + '-' +
         Math.random().toString(36).substring(2, 6);
}
```
Both `ensureLeadIds()` backfill and the new import writer call this helper.

### Timing
Generated only at the moment of LEADS insert (A-02 step 4: `normalized -> imported`). Never earlier — raw rows in `_raw_import` have `lead_id = null` until they transition to `imported`.

### Retry
Immutable once written to LEADS. Retry of a failed raw row means a new `_raw_import` row with a new `raw_import_id`; if it passes pipeline, it receives a **new** `lead_id`. Idempotence in LEADS is enforced by `company_key` dedupe (A-05), not by `lead_id`.

### Compatibility
Format unchanged -> existing `ASW-*` leads work without migration. `findRowByLeadId_()` in `Helpers.gs:239` works unchanged.

---

## 7. LEADS source metadata columns

6 new columns appended to `EXTENSION_COLUMNS` in `Config.gs:63-109` (append-only).

| # | Column | Type | Source | Description |
|---|---|---|---|---|
| 1 | `source_job_id` | string | `_raw_import.source_job_id` | FK to A-01 job. Pivot for A-09 per-job reports. |
| 2 | `source_portal` | enum | `_raw_import.source_portal` | `firmy.cz` / `zivefirmy.cz`. Denormalized for filtering. |
| 3 | `source_url` | string | `_raw_import.source_url` | Detail page URL on the portal. Audit and possible re-scrape. |
| 4 | `source_raw_import_id` | string | `_raw_import.raw_import_id` | FK back to `_raw_import` row. Audit link to raw payload. |
| 5 | `source_scraped_at` | ISO 8601 UTC | `_raw_import.scraped_at` | Original extraction timestamp. |
| 6 | `source_imported_at` | ISO 8601 UTC | generated at insert | Time of promotion raw -> LEADS. |

All 6 share the `source_` prefix for consistent naming and HeaderResolver filtering.

### Governance
- Append-only at the end of `EXTENSION_COLUMNS` array.
- `setupPreviewExtension()` (existing) automatically fills missing columns on next menu run — no destructive migration.
- `LEGACY_COL` positions 1-20 untouched; `validateLegacyColHeaders_()` passes unchanged.
- Legacy LEADS rows (inserted before A-03) will have these columns empty. Never overwritten.

### Empty string compatibility
`phone`, `email`, `website_url` use empty string `""` when invalid. Rationale:

- `isBlank_()` (`Helpers.gs:336`) treats `null`, `undefined`, `""`, and whitespace identically via `String(val || '').trim() === ''`. Existing project code uses `isBlank_()` exclusively for contact checks.
- Google Sheets does not store `null` — empty cells are `""` after `getValues()`. Writing `null` is converted to `""` on round-trip. Empty string is the canonical representation.
- `normalizePhone_()`, `extractDomainFromUrl_()`, `extractBusinessDomainFromEmail_()` all return `""` for empty/invalid input — this is the project's existing convention.
- `resolveWebsiteState_()` in `Helpers.gs:440` handles `""` and `null` identically.

Empty string is the only representation consistent with runtime helpers, Sheets round-trip, and the blank-check convention.

---

## 8. Samples

### 8.1 Clean insert
Raw payload:
```json
{
  "business_name": "Elektro Svoboda",
  "ico": "87654321",
  "contact_name": "Petr Svoboda",
  "phone": "+420 602 555 111",
  "email": "svoboda@elektro-svoboda.cz",
  "website": "https://elektro-svoboda.cz",
  "city": "Plzen",
  "district": "Slovany",
  "segment": "elektrikar",
  "service_type": "Elektroinstalace",
  "rating": 4.8,
  "reviews_count": 27
}
```
Normalized LEADS row:
```
business_name:         "Elektro Svoboda"
ico:                   "87654321"
contact_name:          "Petr Svoboda"
phone:                 "+420602555111"
email:                 "svoboda@elektro-svoboda.cz"
website_url:           "https://elektro-svoboda.cz"
has_website:           "yes"
city:                  "Plzen"
district:              "Slovany"
segment:               "elektrikar"
service_type:          "Elektroinstalace"
rating:                4.8
reviews_count:         27
lead_stage:            "NEW"
lead_id:               "ASW-lu8k3x9a-b4f1"
source_job_id:         "firmycz-20260405T143022Z-9a3f2b1c4e"
source_portal:         "firmy.cz"
source_url:            "https://www.firmy.cz/detail/87654321-elektro-svoboda-plzen.html"
source_raw_import_id:  "RAW-9a3f2b1c4e-000002"
source_scraped_at:     "2026-04-05T14:30:48Z"
source_imported_at:    "2026-04-05T14:31:15Z"
```

### 8.2 Insert with cleaning
Raw payload:
```json
{
  "business_name": "  Instalaterstvi  NOVAK  s.r.o.  ",
  "ico": "CZ 123-456-78",
  "contact_name": "info",
  "phone": "777 123 456",
  "email": "  INFO@Instalater-Novak.CZ  ",
  "website": "www.instalater-novak.cz/kontakt",
  "city": "  Plzen ",
  "district": null,
  "segment": "Instalater",
  "service_type": "Vodoinstalace a topeni",
  "rating": "4,5",
  "reviews_count": ""
}
```
Cleaning steps:
- `business_name`: trim + collapse -> `"Instalaterstvi NOVAK s.r.o."`
- `ico`: strip non-digits -> `"12345678"` (8 digits, valid)
- `contact_name`: `"info"` fake token -> `null`
- `phone`: normalizePhone_ -> `"777123456"` -> +420 prefix -> `"+420777123456"`
- `email`: trimLower_ -> `"info@instalater-novak.cz"`
- `website`: canonicalizeUrl_ -> `"https://www.instalater-novak.cz"`, isRealUrl_ true
- `has_website`: computed -> `"yes"`
- `city`: trim -> `"Plzen"`
- `segment`: removeDiacritics_(trimLower_) -> `"instalater"`
- `service_type`: trim (no lowercase) -> `"Vodoinstalace a topeni"`
- `rating`: `"4,5"` -> `"4.5"` -> Number -> `4.5`
- `reviews_count`: `parseInt("", 10)` -> NaN -> `null`

### 8.3 Normalization fail (reject)
Raw payload:
```json
{
  "business_name": "",
  "ico": null,
  "contact_name": "sales",
  "phone": "abc",
  "email": "not-an-email",
  "website": "-",
  "city": "Plzen"
}
```
Result: `_raw_import` row updated to:
```
normalized_status:   "error"
import_decision:     "rejected_error"
normalization_error: "business_name is empty after trim"
decision_reason:     "MISSING_BUSINESS_NAME"
processed_by:        "normalizer"
```
No LEADS row. No `lead_id` generated. The error row stays in `_raw_import` as audit.

---

## 9. Open questions

1. **Rating scale per portal** — firmy.cz and zivefirmy.cz may return different formats (`"4.5"`, `"4,5"`, `4.5`, possibly `"4,5/5"` with suffix). Current rule handles `.` and `,` decimal but not `/5` suffix. Confirm real format in A-04 implementation.
2. **`segment` aliases between portals** — if zivefirmy.cz uses a different category catalog than firmy.cz, scraper (A-04) must map to canonical segment values. Normalizer assumes uniform shape.
3. **Fake `contact_name` tokens** — the list (`info`, `sales`, etc.) is heuristic. Pilot will show whether to extend or remove.
