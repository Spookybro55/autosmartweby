# Scraping Job Input Contract — v1.0

> **Canonical schema:** [`scraping-job-input.schema.json`](./scraping-job-input.schema.json)
> **TypeScript type:** [`crm-frontend/src/lib/contracts/scraping-job-input.ts`](../../crm-frontend/src/lib/contracts/scraping-job-input.ts)
> **Stream:** A (Data & Automation)
> **Version:** 1.0

---

## 1. Purpose

Contract for a **single scraping job**. One job = one query on one portal in one city/segment. This contract defines what is required to create, run, and complete a scraping job, and how it is identified deterministically.

## 2. Fields

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `schema_version` | string (const `"1.0"`) | yes | — | Contract version. Const in this version. |
| `source_job_id` | string | yes | — | Deterministic unique id. See section 6. |
| `portal` | enum | yes | — | `firmy.cz` \| `zivefirmy.cz`. |
| `segment` | string | yes | — | Lowercase ASCII business segment, e.g. `instalater`. |
| `city` | string | yes | — | Czech city name with diacritics, Title Case. Example: `Plzeň`. |
| `district` | string \| null | yes | — | District or `null` for whole-city job. Required key, nullable value (design decision: explicit null over missing key for serialization consistency). |
| `max_results` | integer | yes | — | 1..500. |
| `job_created_at` | string (ISO 8601 UTC) | yes | — | `YYYY-MM-DDTHH:mm:ssZ`. |
| `job_status` | enum | yes | `"created"` | `created` \| `running` \| `completed` \| `failed`. |
| `job_started_at` | string \| null | yes | — | Set when entering `running`, otherwise `null`. |
| `job_completed_at` | string \| null | yes | — | Set when entering `completed`/`failed`, otherwise `null`. |
| `error_message` | string \| null | yes | — | Error detail when `failed`. `null` for non-failed jobs. Max 1024 chars. |

12 fields total. All 12 required (must be explicitly present). No nested objects.

## 3. Validation rules

### Required
All 12 fields must be explicitly present. `additionalProperties: false`.

### Enums
- `portal` in `{firmy.cz, zivefirmy.cz}`. New portals require a schema version bump.
- `job_status` in `{created, running, completed, failed}`.
- `schema_version` const `"1.0"`.

### Strings
- `segment`: pattern `^[a-z0-9][a-z0-9_-]*[a-z0-9]$`, length 2..64. Diacritics and uppercase forbidden. Caller normalizes before submit.
- `city`: length 2..64, diacritics allowed, not enumerated.
- `district`: `null` or 2..64 chars. Empty string `""` is invalid; use `null`.
- `source_job_id`: regex `^[a-z0-9]+-\d{8}T\d{6}Z-[0-9a-f]{10}$`, minLength 35, maxLength 64.

### Datetimes
- All `*_at` fields: ISO 8601 UTC with `Z` suffix. Timezone offsets (`+02:00`) are invalid.
- Semantic checks (caller-enforced):
  - `job_started_at >= job_created_at`
  - `job_completed_at >= job_started_at`
  - `job_created_at` in the future by >5 min is invalid (clock skew guard).

### Error message
- `error_message`: `null` or string up to 1024 chars. Semantically expected to be non-null when `job_status = "failed"`, `null` otherwise.

### Numeric
- `max_results`: integer 1..500. Non-integer is invalid.

### Status-dependent (schema-enforced via `allOf`)
- `job_status = created` implies `job_started_at = null` AND `job_completed_at = null`.
- `job_status = running` implies `job_started_at != null` AND `job_completed_at = null`.
- `job_status = completed` or `failed` implies both `job_started_at != null` AND `job_completed_at != null`.

## 4. `source_job_id` definition

### Format
```
{portal_slug}-{yyyymmddThhmmssZ}-{hash10}
```

Three parts:

1. `portal_slug`: `portal` without dots. `firmy.cz` to `firmycz`, `zivefirmy.cz` to `zivefirmycz`.
2. `yyyymmddThhmmssZ`: `job_created_at` in compact ISO 8601 UTC (no dashes/colons), second precision. Milliseconds dropped.
3. `hash10`: first 10 hex chars of SHA-256 over the canonical concatenation:
   ```
   sha256("{portal}|{segment_normalized}|{city_trimmed}|{district_or_empty}|{max_results}")
   ```

### Normalization rules for hash input

Each component of the canonical concatenation string must be normalized exactly as follows. Two independent implementors given the same input must produce byte-identical hash input.

| Component | Rule |
|---|---|
| `{portal}` | Raw field value, e.g. `firmy.cz`. NOT the slug. |
| `{segment_normalized}` | The `segment` field value verbatim. Already validated as lowercase ASCII by schema regex; no further transform. |
| `{city_trimmed}` | Leading/trailing whitespace stripped. Unicode NFC normalization applied. Diacritics **preserved**. Case **preserved** (Title Case as stored). Internal whitespace preserved as-is (single spaces). |
| `{district_or_empty}` | If `null` → empty string `""`. If non-null → same rules as `city_trimmed` (trim, NFC, diacritics preserved, case preserved). |
| `{max_results}` | Decimal integer string, no leading zeros. Example: `"50"`. |

**Separator:** pipe `|` between each component, no trailing pipe.

**Example canonical string** (valid sample):
```
firmy.cz|instalater|Plzeň||50
```
SHA-256 of this UTF-8 encoded string → take first 10 hex chars → `hash10`.

### Examples
```
firmycz-20260405T143022Z-a1b2c3d4e5
zivefirmycz-20260405T090000Z-f6e7d8c9b0
firmycz-20260412T143022Z-a1b2c3d4e5   (same scope, different day = different id)
```

> **Note:** Hash values in examples are illustrative. Real values must be computed from the canonical string using SHA-256.

### Uniqueness
Job is unique over (portal, segment, city, district, max_results, creation second). Same scope in the same second produces the same id — this is desirable idempotence. Same scope in a different second produces a different id — intentional time-series re-crawl.

### Idempotence
Deterministic. Same input yields the same `source_job_id`. Normalization before hashing is critical — any drift (`"Instalater"` vs `"instalater"`, `"Plzen "` vs `"Plzen"`) breaks idempotence.

## 5. Sample payloads

### 5.1 Valid
```json
{
  "schema_version": "1.0",
  "source_job_id": "firmycz-20260405T143022Z-a1b2c3d4e5",
  "portal": "firmy.cz",
  "segment": "instalater",
  "city": "Plzeň",
  "district": null,
  "max_results": 50,
  "job_created_at": "2026-04-05T14:30:22Z",
  "job_status": "completed",
  "job_started_at": "2026-04-05T14:30:25Z",
  "job_completed_at": "2026-04-05T14:31:47Z",
  "error_message": null
}
```
Canonical hash input: `firmy.cz|instalater|Plzeň||50`

### 5.2 Borderline (valid, at the edge)
```json
{
  "schema_version": "1.0",
  "source_job_id": "zivefirmycz-20260405T090000Z-f6e7d8c9b0",
  "portal": "zivefirmy.cz",
  "segment": "elektrikar-rev",
  "city": "Hradec Králové",
  "district": "Nový Hradec Králové",
  "max_results": 500,
  "job_created_at": "2026-04-05T09:00:00Z",
  "job_status": "created",
  "job_started_at": null,
  "job_completed_at": null,
  "error_message": null
}
```
Canonical hash input: `zivefirmy.cz|elektrikar-rev|Hradec Králové|Nový Hradec Králové|500`

Borderline because `max_results = 500` is at the maximum (soft warning on Serper/ToS risk), `segment` contains a hyphen (valid but edge), `district` contains spaces and diacritics.

### 5.3 Invalid
```json
{
  "schema_version": "1.0",
  "source_job_id": "firmy-cz-abc",
  "portal": "google.com",
  "segment": "Instalater",
  "city": "",
  "district": "",
  "max_results": 0,
  "job_created_at": "2026-04-05 14:30:22+02:00",
  "job_status": "failed",
  "job_started_at": null,
  "job_completed_at": null,
  "error_message": null
}
```

Violations:
1. `source_job_id` does not match pattern.
2. `portal = "google.com"` is not in the enum.
3. `segment = "Instalater"` violates pattern (uppercase).
4. `city = ""` violates minLength 2.
5. `district = ""` is invalid; use `null` for "no district".
6. `max_results = 0` violates minimum 1.
7. `job_created_at` has a space instead of `T` and a timezone offset instead of `Z`.
8. `job_status = "failed"` requires `job_started_at` and `job_completed_at` to be non-null.
9. `error_message = null` is semantically incorrect for `failed` status (expected non-null error detail).

## 6. Related artifacts

- JSON Schema: [`scraping-job-input.schema.json`](./scraping-job-input.schema.json)
- TypeScript type: [`crm-frontend/src/lib/contracts/scraping-job-input.ts`](../../crm-frontend/src/lib/contracts/scraping-job-input.ts)
- Data model reference: [`../23-data-model.md`](../23-data-model.md)

## 7. Open questions

1. Enum `portal` extension after pilot (`mapy.cz`, `najisto.cz`?) — will require `schema_version` bump to 1.1.
2. `segment` catalog — currently free-form with a regex. If A-03 normalization needs a fixed catalog for LEADS mapping, this becomes a breaking change to 2.0.
3. `max_results` upper bound 500 is an estimate; real bound may be lower depending on Serper quota and portal ToS. To be finalized in A-04 / A-06.
