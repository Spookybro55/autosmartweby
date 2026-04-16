# Dedupe Decision Contract — v1.0

> **Runtime:** `apps-script/DedupeEngine.gs`
> **Constants:** `apps-script/Config.gs` (DEDUPE_BUCKET, DEDUPE_REASON)
> **Depends on:** A-03 normalization, A-01/A-02 raw import contracts
> **Stream:** A (Data & Automation)

---

## 1. Purpose

Define the deterministic rules for classifying incoming raw records as
HARD_DUPLICATE, SOFT_DUPLICATE, REVIEW, or NEW_LEAD relative to existing LEADS.

---

## 2. company_key Algorithm

### Priority order

| Tier | Prefix | Source | Type |
|------|--------|--------|------|
| T1 | `ico:` | IČO | Primary stable identifier |
| T2 | `dom:` | Website domain | Secondary stable identifier |
| T3 | `edom:` | Business email domain | Secondary identifier |
| T4 | `name:` | Normalized name + city | Heuristic signal |

### Normalization rules

**IČO (T1):**
- Strip all non-digit characters
- If 8 digits → valid
- If 9 digits and first is `0` → strip leading zero, accept 8
- Otherwise → INVALID (skip tier)

**Website domain (T2):**
- `extractDomainFromUrl_()` → lowercase, strip protocol, strip `www.`
- If domain matches `BLOCKED_HOST_FRAGMENTS` → skip tier

**Email domain (T3):**
- `extractBusinessDomainFromEmail_()` → lowercase, split `@`, exclude `FREE_EMAIL_DOMAINS`
- If domain matches `BLOCKED_HOST_FRAGMENTS` → skip tier

**Business name (T4 — name component):**
- `removeDiacritics_()` + `trimLower_()`
- Strip legal suffixes: `s.r.o.`, `spol. s r.o.`, `a.s.`, `v.o.s.`, `k.s.`, `SE`, `z.s.`, `z.ú.`, `družstvo`, `o.p.s.`
- Replace non-alphanumeric → space, collapse, trim

**City (T4 — city component):**
- `removeDiacritics_()` + `trimLower_()`
- Prague normalization: `praha N`, `praha - X` → `praha`
- Replace non-alphanumeric → space, collapse, trim
- **REQUIRED** — if empty, skip T4 entirely

### Key format

```
T1: ico:{8digits}
T2: dom:{hostname}
T3: edom:{hostname}
T4: name:{normalized_name}|{normalized_city}
```

Empty string if no tier matches.

---

## 3. Decision Tree

```
INPUT: normalized record R

1. key = computeCompanyKeyFromRecord_(R)
   ├── key == "" → NEW_LEAD (NEW_LEAD_NO_KEY)
   └── key != "" → step 2

2. tier = key prefix (ico/dom/edom/name)

3. Search LEADS index for key
   ├── no match → step 5 (intra-batch)
   └── match found → step 4

4. Classify by tier:
   ├── T1 (ico) → HARD_DUPLICATE (HARD_DUP_ICO)
   ├── T2 (dom):
   │   ├── both have valid IČO AND they differ
   │   │   → REVIEW (REVIEW_CONFLICTING_ICO_DOMAIN)
   │   └── else → HARD_DUPLICATE (HARD_DUP_DOMAIN)
   ├── T3 (edom) → SOFT_DUPLICATE (SOFT_DUP_EMAIL_DOMAIN)
   └── T4 (name) → SOFT_DUPLICATE (SOFT_DUP_NAME_CITY)

5. Intra-batch check (same company_key in current batch):
   ├── no collision → NEW_LEAD (NEW_LEAD_NO_MATCH)
   └── collision:
       ├── T1/T2 → HARD_DUPLICATE (intra-batch variant)
       └── T3/T4 → REVIEW (REVIEW_INTRA_BATCH_T3/T4)
```

---

## 4. Bucket Definitions

### HARD_DUPLICATE

| Attribute | Value |
|-----------|-------|
| Condition | T1 IČO match OR T2 domain match (without conflicting IČO) |
| Action | Auto-reject |
| _raw_import fields | `normalized_status=error`, `import_decision=rejected_duplicate`, `duplicate_candidate=TRUE`, `duplicate_of_lead_id=<matched>` |

### SOFT_DUPLICATE

| Attribute | Value |
|-----------|-------|
| Condition | T3 email domain match OR T4 name+city match |
| Action | Block → pending_review (never auto-merge) |
| _raw_import fields | `normalized_status=duplicate_candidate`, `import_decision=pending_review`, `duplicate_candidate=TRUE` |

### REVIEW

| Attribute | Value |
|-----------|-------|
| Condition | Conflicting signals (domain match + different IČO) OR intra-batch T3/T4 collision |
| Action | Block → pending_review |
| _raw_import fields | Same as SOFT_DUPLICATE |

### NEW_LEAD

| Attribute | Value |
|-----------|-------|
| Condition | No match on any tier OR empty company_key |
| Action | Pass through to import writer |
| _raw_import fields | Status stays `normalized` → import writer sets `imported` |

---

## 5. Decision Reasons

| Reason Code | Bucket | Trigger |
|-------------|--------|---------|
| `HARD_DUP_ICO` | HARD_DUPLICATE | Same 8-digit IČO in LEADS |
| `HARD_DUP_DOMAIN` | HARD_DUPLICATE | Same website domain in LEADS |
| `SOFT_DUP_EMAIL_DOMAIN` | SOFT_DUPLICATE | Same business email domain in LEADS |
| `SOFT_DUP_NAME_CITY` | SOFT_DUPLICATE | Same normalized name+city in LEADS |
| `REVIEW_CONFLICTING_ICO_DOMAIN` | REVIEW | Domain matches but IČO differs |
| `REVIEW_INTRA_BATCH_T3` | REVIEW | Email domain collision within batch |
| `REVIEW_INTRA_BATCH_T4` | REVIEW | Name+city collision within batch |
| `NEW_LEAD_NO_MATCH` | NEW_LEAD | Key computed but no match anywhere |
| `NEW_LEAD_NO_KEY` | NEW_LEAD | Could not compute company_key |

---

## 6. Sample Scenarios

### 6.1 Clear duplicate (IČO match)

**Raw:** `{ business_name: "Instalaterstvi Novak s.r.o.", ico: "12345678", city: "Praha" }`
**LEADS:** `{ company_key: "ico:12345678", lead_id: "ASW-exist01" }`
**Result:** `HARD_DUPLICATE`, reason: `HARD_DUP_ICO`, duplicate_of: `ASW-exist01`

### 6.2 Clear new lead

**Raw:** `{ business_name: "Revizni technik Malek", ico: "11223344", city: "Ceske Budejovice" }`
**LEADS:** No match for `ico:11223344`
**Result:** `NEW_LEAD`, reason: `NEW_LEAD_NO_MATCH`

### 6.3 Conflicting IČO + domain → REVIEW

**Raw:** `{ business_name: "Topenari nove Brno SE", ico: "99998888", website: "https://topenari-brno.cz", city: "Brno" }`
**LEADS:** `{ company_key: "dom:topenari-brno.cz", lead_id: "ASW-exist09", ico: "11112222" }`
**Analysis:** Record has valid IČO `99998888` → T1 key `ico:99998888`. Not in LEADS → T1 miss. Secondary cross-check: record's domain `topenari-brno.cz` IS in LEADS as `dom:topenari-brno.cz` (ASW-exist09, IČO `11112222`). Record IČO `99998888` ≠ LEADS IČO `11112222` → conflicting signal.
**Result:** `REVIEW`, reason: `REVIEW_CONFLICTING_ICO_DOMAIN`, duplicate_of: `ASW-exist09`

**Why not auto-merge:** Same website but different IČO strongly suggests either (a) company re-registration, (b) data entry error, or (c) two companies sharing hosting. Human review required.

**HARD_DUP variant:** If the raw record had `ico: ""` (no IČO), it would skip T1 → resolve to T2 `dom:topenari-brno.cz` → direct match → HARD_DUP_DOMAIN. The REVIEW path fires only when both sides have valid IČO AND they differ.

### 6.4 IČO match through different formatting

**Raw:** `{ business_name: "NOVAK INSTALACE spol. s r.o.", ico: "012345678", city: "Praha 5" }`
**LEADS:** `{ company_key: "ico:12345678", lead_id: "ASW-exist01" }`
**Analysis:** `normalizeIco_("012345678")` → 9 digits, leading zero → strip → `12345678`. Match.
**Result:** `HARD_DUPLICATE`, reason: `HARD_DUP_ICO`, duplicate_of: `ASW-exist01`

### 6.5 Name+city match

**Raw:** `{ business_name: "Instalaterství Novák", email: "novacek@gmail.com", city: "Praha 1" }`
**LEADS:** `{ company_key: "name:instalaterstvi novak|praha", lead_id: "ASW-exist18" }`
**Analysis:** No IČO, no website, gmail = freemail. Name normalized: `instalaterstvi novak`. City: `praha 1` → `praha`. Key: `name:instalaterstvi novak|praha`. Match.
**Result:** `SOFT_DUPLICATE`, reason: `SOFT_DUP_NAME_CITY`

---

## 7. Idempotence

`company_key` is deterministic: same input always produces the same key.
`dedupeAgainstLeads_()` with the same LEADS state returns the same result.
Running the batch test twice with the same synthetic data produces identical stats.
