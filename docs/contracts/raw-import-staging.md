# RAW_IMPORT Staging Layer — v1.0

> **Canonical schema:** [`raw-import-row.schema.json`](./raw-import-row.schema.json)
> **TypeScript type:** [`crm-frontend/src/lib/contracts/raw-import-row.ts`](../../crm-frontend/src/lib/contracts/raw-import-row.ts)
> **Sheet name:** `_raw_import` (leading underscore = system sheet, convention matches `_asw_logs` in `Config.gs:14`)
> **Depends on:** A-01 Scraping Job Input Contract v1.0
> **Stream:** A (Data & Automation)

---

## 1. Purpose

`RAW_IMPORT` is a **staging buffer** between scraper output and the production `LEADS` sheet. It lets raw scraped data be inspected, normalized, deduplicated, and explicitly decided upon before it ever becomes a production lead. `LEADS` remains the source of truth for clean leads; `RAW_IMPORT` is the source of truth for **raw input and its ingest lifecycle**, never for business state of a lead.

### Principles
1. **Same spreadsheet, new sheet.** `_raw_import` lives in the same `SPREADSHEET_ID` as `LEADS`. Shared authorization, backup, and audit trail with the rest of the project.
2. **Append-only rows.** A raw row is inserted once and never deleted or overwritten. Status and decision columns mutate; raw content is immutable.
3. **Status vs decision separation.** `normalized_status` tracks *where* the row is in the pipeline; `import_decision` tracks *what we decided* about it. Both exist independently.
4. **One-way flow.** Raw to normalized to LEADS. Never LEADS back to raw.
5. **Hard duplicate goes directly to `error`.** The `duplicate_candidate` status is reserved only for soft duplicates awaiting manual review.
6. **Error is terminal.** Retry of a failed row means a new raw row with a new `raw_import_id`. The original error row stays forever as audit.

---

## 2. Columns (16 total)

| # | Field | Type | Required | Default | Description |
|---|---|---|---|---|---|
| 1 | `raw_import_id` | string | yes | — | Unique row id. Format: `RAW-{source_job_id_hash10}-{seq6}`. Deterministic within a job. Immutable. |
| 2 | `source_job_id` | string | yes | — | FK to A-01 job. Immutable. |
| 3 | `source_portal` | enum | yes | — | `firmy.cz` or `zivefirmy.cz`. Denormalized. Immutable. |
| 4 | `source_url` | string (URL) | yes | — | Detail page URL on the portal. Immutable. |
| 5 | `scraped_at` | string (ISO 8601 UTC) | yes | — | Extraction timestamp. Immutable. |
| 6 | `raw_payload_json` | string (serialized JSON) | yes | — | Full raw scrape output as JSON string. Shape defined by A-04. Immutable. |
| 7 | `normalized_status` | enum | yes | `raw` | Technical lifecycle. `raw` / `normalized` / `duplicate_candidate` / `error` / `imported`. |
| 8 | `normalization_error` | string \| null | no | `null` | Technical error message. Non-null only when `import_decision = rejected_error`. |
| 9 | `duplicate_candidate` | boolean | yes | `FALSE` | TRUE if dedupe found any match (hard or soft). |
| 10 | `duplicate_of_lead_id` | string \| null | no | `null` | FK to `LEADS.lead_id` of the matched lead. Non-null only for hard duplicates. |
| 11 | `lead_id` | string \| null | no | `null` | FK to `LEADS.lead_id` of *this* row after import. Non-null only in `imported` status. |
| 12 | `import_decision` | enum \| null | no | `null` | Business decision. `imported` / `rejected_error` / `rejected_duplicate` / `pending_review`. |
| 13 | `decision_reason` | string \| null | no | `null` | Human-readable reason code (e.g. `HARD_DUP_ICO`, `MISSING_BUSINESS_NAME`). |
| 14 | `created_at` | string (ISO 8601 UTC) | yes | — | Row insert timestamp. Immutable. |
| 15 | `updated_at` | string (ISO 8601 UTC) | yes | — | Last mutation timestamp. Equals `created_at` at insert. |
| 16 | `processed_by` | enum | yes | `scraper` | Component that last wrote. `scraper` / `normalizer` / `dedupe` / `import_writer` / `manual`. |

**Immutable after insert (7):** 1–6, 14.
**Update-in-place (9):** 7–13, 15, 16.

---

## 3. Status model

### States

| Status | Meaning | Terminal |
|---|---|---|
| `raw` | Row just inserted by scraper. No normalization yet. | No |
| `normalized` | Normalizer parsed and validated raw payload. Waiting for dedupe. | No |
| `duplicate_candidate` | Soft duplicate awaiting manual review. | No |
| `error` | Auto-reject (technical failure, hard duplicate, write failure, manual reject of soft dup). | Yes |
| `imported` | Row written to LEADS. `lead_id` is set. | Yes |

### Allowed transitions

| From | To | Trigger | Resulting decision |
|---|---|---|---|
| *(new)* | `raw` | Scraper insert | `null` |
| `raw` | `normalized` | Normalizer: parse + validation OK | `null` |
| `raw` | `error` | Normalizer: fail | `rejected_error` |
| `normalized` | `imported` | Dedupe clean + LEADS write OK | `imported` |
| `normalized` | `error` | LEADS write fail | `rejected_error` |
| `normalized` | `error` | Dedupe hard match | `rejected_duplicate` |
| `normalized` | `duplicate_candidate` | Dedupe soft match | `pending_review` |
| `duplicate_candidate` | `imported` | Manual review accept | `imported` |
| `duplicate_candidate` | `error` | Manual review reject | `rejected_duplicate` |

### Forbidden
- `imported -> *` (terminal)
- `error -> *` (terminal — retry means new row with new `raw_import_id`)
- `* -> raw` (raw is entry state only)
- `raw -> duplicate_candidate` (dedupe runs after normalization)
- Any transition without updating `updated_at` and `processed_by`

---

## 4. Decision model

`import_decision` is independent from `normalized_status`.

| Decision | Meaning | When | Terminal |
|---|---|---|---|
| `null` | Not decided yet. | Default at insert; during `raw` and `normalized`. | No |
| `pending_review` | Soft duplicate awaits manual action. | Dedupe soft match. | No |
| `imported` | Row was written to LEADS. | `normalized -> imported` or `duplicate_candidate -> imported`. | Yes |
| `rejected_error` | Rejected due to technical failure. | Parse/validation fail, write fail. | Yes |
| `rejected_duplicate` | Rejected due to duplicate (hard auto or soft-rejected by review). | Dedupe hard match or manual reject. | Yes |

**Rule:** Every terminal status (`imported`, `error`) has a non-null `import_decision` and `decision_reason`.

---

## 5. Invariants matrix

Every valid row matches exactly one of these shapes.

| # | `normalized_status` | `import_decision` | `lead_id` | `duplicate_candidate` | `duplicate_of_lead_id` | `normalization_error` |
|---|---|---|---|---|---|---|
| 1 | `raw` | `null` | `null` | `FALSE` | `null` | `null` |
| 2 | `normalized` | `null` | `null` | `FALSE` | `null` | `null` |
| 3 | `duplicate_candidate` | `pending_review` | `null` | `TRUE` | `null` | `null` |
| 4 | `error` | `rejected_error` | `null` | `FALSE` | `null` | non-null |
| 5 | `error` | `rejected_duplicate` | `null` | `TRUE` | non-null or `null` | `null` |
| 6 | `imported` | `imported` | non-null | `FALSE` | `null` | `null` |

Shape #5 has `duplicate_of_lead_id` non-null for hard duplicates and `null` for soft duplicates rejected by manual review.

---

## 6. Flow

```
JOB (A-01 contract)
  |
  |-- scraper (A-04) -> insert _raw_import row [status: raw]
  |
  v
NORMALIZER (A-03)
  |-- parse raw_payload_json
  |-- validate required fields
  |-- clean phone, email, URL, diacritics
  |
  +-- OK   -> status: normalized
  +-- FAIL -> status: error, decision: rejected_error
  |
  v
DEDUPE (A-05)
  |-- compute company_key (reuse PreviewPipeline.gs:365)
  |-- match against LEADS + intra-job
  |
  +-- no match   -> status stays normalized
  +-- hard match -> status: error, decision: rejected_duplicate,
  |                  duplicate_candidate=TRUE, duplicate_of_lead_id=non-null
  +-- soft match -> status: duplicate_candidate, decision: pending_review,
                     duplicate_candidate=TRUE, duplicate_of_lead_id=null
  |
  v
IMPORT WRITER (for normalized rows only)
  |-- generate lead_id (ASW-{ts36}-{rnd4}) via shared helper
  |-- append new LEADS row
  |-- update _raw_import: status=imported, lead_id=<new>, decision=imported
  |
  v
LEADS  <-- production source of truth starts here
```

### Boundary

There is exactly one moment in the pipeline where a production lead is born: the import writer atomically (a) appends a row to `LEADS` with a fresh `lead_id`, and (b) updates the `_raw_import` row to `imported`. Before this moment, data lives only in `_raw_import` and is invisible to CRM, `Ke kontaktovani`, web check, qualify, or preview queue. After this moment, the `_raw_import` row is an immutable audit reference.

---

## 7. Sample rows

### 7.1 Fresh raw
```json
{
  "raw_import_id": "RAW-9a3f2b1c4e-000001",
  "source_job_id": "firmycz-20260405T143022Z-9a3f2b1c4e",
  "source_portal": "firmy.cz",
  "source_url": "https://www.firmy.cz/detail/12345678-instalaterstvi-novak-plzen.html",
  "scraped_at": "2026-04-05T14:30:47Z",
  "raw_payload_json": "{\"business_name\":\"Instalaterstvi Novak s.r.o.\",\"ico\":\"12345678\",\"phone\":\"+420 777 123 456\",\"email\":\"info@instalater-novak.cz\",\"website\":\"https://instalater-novak.cz\",\"city\":\"Plzen\"}",
  "normalized_status": "raw",
  "normalization_error": null,
  "duplicate_candidate": false,
  "duplicate_of_lead_id": null,
  "lead_id": null,
  "import_decision": null,
  "decision_reason": null,
  "created_at": "2026-04-05T14:30:47Z",
  "updated_at": "2026-04-05T14:30:47Z",
  "processed_by": "scraper"
}
```

### 7.2 Imported
```json
{
  "raw_import_id": "RAW-9a3f2b1c4e-000002",
  "source_job_id": "firmycz-20260405T143022Z-9a3f2b1c4e",
  "source_portal": "firmy.cz",
  "source_url": "https://www.firmy.cz/detail/87654321-elektro-svoboda-plzen.html",
  "scraped_at": "2026-04-05T14:30:48Z",
  "raw_payload_json": "{\"business_name\":\"Elektro Svoboda\",\"ico\":\"87654321\",\"phone\":\"+420 602 555 111\",\"email\":\"svoboda@elektro-svoboda.cz\",\"website\":\"https://elektro-svoboda.cz\",\"city\":\"Plzen\",\"district\":\"Slovany\"}",
  "normalized_status": "imported",
  "normalization_error": null,
  "duplicate_candidate": false,
  "duplicate_of_lead_id": null,
  "lead_id": "ASW-lu8k3x9a-b4f1",
  "import_decision": "imported",
  "decision_reason": "CLEAN_INSERT",
  "created_at": "2026-04-05T14:30:48Z",
  "updated_at": "2026-04-05T14:31:15Z",
  "processed_by": "import_writer"
}
```

### 7.3 Pending review (soft duplicate)
```json
{
  "raw_import_id": "RAW-9a3f2b1c4e-000003",
  "source_job_id": "firmycz-20260405T143022Z-9a3f2b1c4e",
  "source_portal": "firmy.cz",
  "source_url": "https://www.firmy.cz/detail/55566677-instalater-novak-2.html",
  "scraped_at": "2026-04-05T14:30:49Z",
  "raw_payload_json": "{\"business_name\":\"Instalater Novak\",\"ico\":null,\"phone\":\"+420 777 888 999\",\"email\":null,\"website\":null,\"city\":\"Plzen\"}",
  "normalized_status": "duplicate_candidate",
  "normalization_error": null,
  "duplicate_candidate": true,
  "duplicate_of_lead_id": null,
  "lead_id": null,
  "import_decision": "pending_review",
  "decision_reason": "SOFT_DUP_NAME_CITY",
  "created_at": "2026-04-05T14:30:49Z",
  "updated_at": "2026-04-05T14:31:20Z",
  "processed_by": "dedupe"
}
```

### 7.4 Rejected error
```json
{
  "raw_import_id": "RAW-9a3f2b1c4e-000004",
  "source_job_id": "firmycz-20260405T143022Z-9a3f2b1c4e",
  "source_portal": "firmy.cz",
  "source_url": "https://www.firmy.cz/detail/11122233-firma-xyz.html",
  "scraped_at": "2026-04-05T14:30:50Z",
  "raw_payload_json": "{\"business_name\":\"\",\"ico\":null,\"phone\":null,\"email\":null,\"website\":null,\"city\":\"Plzen\"}",
  "normalized_status": "error",
  "normalization_error": "business_name is empty AND no contact channels (phone, email both null)",
  "duplicate_candidate": false,
  "duplicate_of_lead_id": null,
  "lead_id": null,
  "import_decision": "rejected_error",
  "decision_reason": "MISSING_BUSINESS_NAME_AND_CONTACT",
  "created_at": "2026-04-05T14:30:50Z",
  "updated_at": "2026-04-05T14:31:05Z",
  "processed_by": "normalizer"
}
```

### 7.5 Rejected duplicate (hard)
```json
{
  "raw_import_id": "RAW-9a3f2b1c4e-000005",
  "source_job_id": "firmycz-20260405T143022Z-9a3f2b1c4e",
  "source_portal": "firmy.cz",
  "source_url": "https://www.firmy.cz/detail/87654321-elektro-svoboda-duplicate.html",
  "scraped_at": "2026-04-05T14:30:51Z",
  "raw_payload_json": "{\"business_name\":\"Elektro Svoboda s.r.o.\",\"ico\":\"87654321\",\"phone\":\"+420 602 555 111\",\"email\":\"info@elektro-svoboda.cz\",\"website\":\"https://elektro-svoboda.cz\",\"city\":\"Plzen\"}",
  "normalized_status": "error",
  "normalization_error": null,
  "duplicate_candidate": true,
  "duplicate_of_lead_id": "ASW-lu8k3x9a-b4f1",
  "lead_id": null,
  "import_decision": "rejected_duplicate",
  "decision_reason": "HARD_DUP_ICO (ico:87654321 matches existing lead ASW-lu8k3x9a-b4f1)",
  "created_at": "2026-04-05T14:30:51Z",
  "updated_at": "2026-04-05T14:31:22Z",
  "processed_by": "dedupe"
}
```

---

## 8. Open questions

1. **`raw_payload_json` size limit** — Google Sheets has a 50k char cell limit. For firmy.cz detail pages (~2KB) this is fine, but HTML offloading would need a strategy. Deferred to A-04.
2. **Archival of `imported` / `error` rows** — at >9M cells per spreadsheet, an archive sheet is needed. Irrelevant for pilot, critical for production. Deferred to A-09.
3. **Review UI for `pending_review`** — for pilot, manual cell edit is sufficient; long-term needs frontend support (B-stream territory, out of A-02 scope).
