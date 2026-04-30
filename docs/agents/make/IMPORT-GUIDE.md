# Make Scenarios — Import Guide

> **Audience:** Sebastián (owner) — manuální setup po Phase 3 prerequisites PR.
> **Time:** 15-30 minutes total (post-prerequisites).
> **Pre-req:** GitHub PAT + Anthropic API key + ntfy topic generated (viz § Předpoklady níže).

5 Make scenarios žije v `docs/agents/make/Agent Team — *.blueprint.json`. Make Core
($9/měs, 10k ops) plně podporuje všechny tyto scenarios; expected total ~1000 ops/měs.

## Architecture (HTTP-only against GitHub REST API)

These blueprints implement complete logic. They use **HTTP modules with
token-in-header auth** instead of Make's native GitHub / Anthropic
connectors — this avoids ambiguity about Make's internal connector
schemas, makes auth explicit (PAT in `Authorization` header, Anthropic
key in `x-api-key` header), and means **no Make connections need to be
configured**.

| Scenario | File | Modules | Logic |
|---|---|---|---|
| Daily Triage | `Agent Team — Daily Triage.blueprint.json` | 1 | HTTP POST ntfy. Schedule fires daily; no GitHub query. |
| PR Review Reminder | `Agent Team — PR Review Reminder.blueprint.json` | 2 | HTTP GET GitHub Search `is:pr is:open created:<{yesterday} head:agent` → Filter `total_count > 0` → HTTP POST ntfy. |
| Learning Loop | `Agent Team — Learning Loop.blueprint.json` | 9 | Webhook trigger → Filter merged-agent-PR → HTTP GET PR diff (`Accept: application/vnd.github.v3.diff`) → HTTP POST Anthropic Messages API → 3× sequential GET file + PUT file (PATTERNS.md, GOTCHAS.md, REGRESSION-LOG.md) with base64 round-trip + marker replace. |
| Backpressure Check | `Agent Team — Backpressure Check.blueprint.json` | 2 | Same shape as PR Review Reminder but search query is `is:pr is:open head:agent` (no time filter) and threshold is `total_count >= 5`. |
| Weekly Digest | `Agent Team — Weekly Digest.blueprint.json` | 2 | HTTP GET GitHub Search `is:pr is:merged merged:>={7d-ago} head:agent` → HTTP POST ntfy with summary. **MVP behavior:** the digest message lists raw PR titles without per-role aggregation. True per-role count requires nested aggregator chain in Make (deferred as out-of-scope). |

The architecture is intentionally **leaner than the prior 5-blueprint
revision** (which used local Filter + Aggregator chains). GitHub Search
API does the filtering server-side, dropping module count from 4 → 2 for
PR Review Reminder, Backpressure Check, and Weekly Digest.

## 3 placeholders to replace post-import

After importing each blueprint, replace these strings in the imported
scenario modules (Make UI Find&Replace per scenario, NOT module-by-module
to avoid missing one):

| Placeholder | Where | Value |
|---|---|---|
| `TODO_GITHUB_TOKEN` | every HTTP request to api.github.com (`Authorization: Bearer TODO_GITHUB_TOKEN`) — 10 occurrences across 4 blueprints (1 in PR Review Reminder, 1 in Backpressure Check, 1 in Weekly Digest, 7 in Learning Loop) | GitHub PAT (scope: `repo`). One token used by all scenarios. |
| `TODO_ANTHROPIC_API_KEY` | Learning Loop M3 (`x-api-key: TODO_ANTHROPIC_API_KEY`) | Anthropic API key. |
| `TODO_NTFY_TOPIC` | every HTTP POST to ntfy.sh (URL path `https://ntfy.sh/TODO_NTFY_TOPIC`) — 4 occurrences (Daily Triage + 3 cron scenarios; Learning Loop has no ntfy module) | Random ntfy topic name (e.g. `openssl rand -hex 7`). NEVER commit to repo. |

These are the only manual edits per scenario. All scenario logic
(filters, aggregators, base64 manipulation, ntfy bodies, cron schedules
once set in UI) is pre-built in the blueprint JSON.

---

## Post-export sanitization recipe

> **When you re-export a scenario from Make UI** (after token rotation,
> scenario edits, or any other reason), the export contains your live
> tokens verbatim. **Do not commit the raw export.** Run this 3-pass
> sanitize before staging the file:

```bash
# Replace literal token strings with TODO_* placeholders.
# Use exact-match string replace, not regex (no escape concerns).
node -e "
  const fs = require('fs');
  const f = process.argv[1];
  let c = fs.readFileSync(f, 'utf8');
  c = c.split(process.env.GH_PAT).join('TODO_GITHUB_TOKEN');
  c = c.split(process.env.ANTHROPIC_KEY).join('TODO_ANTHROPIC_API_KEY');
  c = c.split(process.env.NTFY_TOPIC).join('TODO_NTFY_TOPIC');
  fs.writeFileSync(f, c);
  JSON.parse(c); // structural integrity check
  console.log('OK:', f);
" "docs/agents/make/Agent Team — *.blueprint.json"

# Then verify zero hits:
grep -nE 'ghp_[A-Za-z0-9]{15,}|sk-ant-api03-[A-Za-z0-9_-]{15,}|autosmartweby-agents-[0-9]{6,}' docs/agents/make/
# (should return nothing)
```

If a token slips through, GitHub Push Protection will block the push at
`git push` time — but don't rely on that as the only defence; the
placeholders should be in place before staging.

---

## Předpoklady (před importem)

### 1. Make účet (Core plan)

- https://www.make.com/en/pricing
- Core: $9/měs, 10k ops/měs (10× více než potřebujeme; expected ~1000 ops/měs total).
- Free (1k ops) just-barely covers all 5 scenarios but leaves no headroom — Core recommended.

### 2. GitHub Personal Access Token (PAT)

1. https://github.com/settings/tokens/new
2. Note: `make-agent-team-autosmartweby` (current rotation: `make-agent-team-autosmartweby-{YYYY-MM-DD}`)
3. Expiration: 90 days (rotation reminder lives in `docs/SECRETS-ROTATION.md` once that doc lands).
4. Scopes:
   - **`repo`** (full — needed for read PRs + commit to PATTERNS / GOTCHAS / REGRESSION-LOG)
   - **`workflow`** (NICE-TO-HAVE — only if you'll dispatch GitHub Actions from Make later)
5. Generate → **save token immediately** (zobrazí se jen 1×).
6. Paste into your password manager + Make UI scenarios. NEVER paste into a file in the repo working tree (OneDrive sync = extra exposure surface).

### 3. Anthropic API key

1. https://console.anthropic.com/settings/keys → **Create Key**
2. Name: `make-learning-loop-autosmartweby`
3. Console → Settings → Billing → **Spend caps**: monthly $20, daily $2 (Learning Loop costs ~$0.05 per merged agent PR; spend cap is the cost ceiling).

### 4. ntfy topic

1. Otevři https://ntfy.sh app v iOS / Android (free) nebo web https://ntfy.sh.
2. Subscribe → vyber random topic name. **NIKDY nepoužívej předvídatelné jméno** (`autosmartweby-agents-test`, `123456789`, atd.).
3. Doporučení: `autosmartweby-agents-{14-char-random-suffix}`. Generuj např. `openssl rand -hex 7`. Příklad: `autosmartweby-agents-a3b2c1d4e5f6g7`.
4. **NESDÍLEJ topic name** — kdokoli ho zná, dostane všechny tvoje notifikace.
5. **NEPATŘÍ do gitu.** Nahraj jen do Make scenario (vždy přes Make UI Find&Replace, nikdy nepiš topic do souboru v repo).

---

## No Make connections needed

Tyto blueprints používají **HTTP modules with token-in-header auth**, ne
Make-native GitHub / Anthropic konektory. Takže **nemusíš** v Make UI
připojovat OAuth ani API key konektory — jen vyměnit 3 placeholder stringy
v importovaných scenarios.

Trade-off:
- ✅ Explicit (vidíš přesně který API endpoint + auth)
- ✅ Future-proof (žádná závislost na Make-internal connector schema)
- ✅ Jeden PAT funguje napříč všemi scenarios
- ❌ Žádná Make-managed token rotation (manual rotation per `docs/SECRETS-ROTATION.md` až bude existovat)

---

## Import scenarios — postup pro každý

Pro každý z 5 souborů `Agent Team — *.blueprint.json`:

1. Make UI → **Scenarios → Create new scenario → ⋯ menu → Import Blueprint**
2. Upload JSON file (např. `Agent Team — Daily Triage.blueprint.json`).
3. Make zobrazí scenario diagram. **Use Make UI Find&Replace per scenario** (cog icon → Find & Replace) na 3 placeholdery:
   - `TODO_GITHUB_TOKEN` → `ghp_xxx...` (your PAT, with `Bearer ` prefix already in the JSON)
   - `TODO_ANTHROPIC_API_KEY` → `sk-ant-api03-...` (Learning Loop only)
   - `TODO_NTFY_TOPIC` → your random ntfy topic suffix
4. Configure scenario schedule (cron) per § Scenario-specific dokončení níže.
5. **Save** scenario.
6. **Activate** scenario (toggle top-left). NEAKTIVUJ Learning Loop dokud
   neukončíš webhook setup (§ Scenario-specific dokončení → Learning Loop).

### Scenario-specific dokončení

#### Daily Triage

- Schedule: **08:00 Europe/Prague** (set in Make UI Scheduling tab → cron `0 8 * * *`).
- No additional config.
- Test: Run once → ntfy notification přijde do 5s.

#### PR Review Reminder

- Schedule: 6× daily Europe/Prague (`0 9,11,13,15,18,21 * * *`).
- Threshold: 24h (encoded in Module 1 URL via `created:<{{formatDate(addDays(now; -1); "YYYY-MM-DD")}}`; adjust if you want a different window).

#### Learning Loop ⚠️ MOST COMPLEX

**Webhook URL setup:**

1. After import, klikni na webhook module (M1) → Make zobrazí unique URL
   (e.g. `https://hook.eu2.make.com/abc...`). **Copy URL.**
2. GitHub repo → Settings → Webhooks → **Add webhook**.
3. Payload URL: paste Make webhook URL.
4. Content type: `application/json`.
5. Secret: leave empty (Make doesn't validate signature in MVP — Phase 3+ improvement: add HMAC validation per `GOTCHAS.md` follow-up).
6. Events: **"Let me select individual events"** → uncheck all → check **"Pull requests"**.
7. Active: ✓.
8. Save.
9. Test: zelená galka by se měla objevit v "Recent Deliveries" do 1-2 minut (GitHub posts a `ping` event).

**Anthropic API rate cost & spend cap:**

- ~$0.05 per merged agent PR (Sonnet, ~1500 tokens).
- Set Make scenario → Settings → Notifications → "Receive an email when this scenario fails or runs successfully".
- Anthropic Console → Settings → Billing → Spend caps: monthly $20, daily $2 (already documented in § Předpoklady step 3).

**Then activate scenario.**

#### Backpressure Check

- Schedule: hourly (`0 * * * *`).
- Threshold: 5 PRs (encoded in Module 2 Filter as `total_count >= 5`).

#### Weekly Digest

- Schedule: Monday 09:00 Europe/Prague (`0 9 * * 1`).

---

## Test postup (po importu všech 5)

1. **Daily Triage:** Run once → ntfy notif "Agent Team — Daily Triage".
2. **PR Review Reminder:** Run once → notif jen pokud máš ≥1 unmerged
   agent PR > 24h. Pokud máš 0, je to filter-gated; "scenario runs without
   error" je sufficient acceptance.
3. **Learning Loop:** vytvoř + mergni testovací branch
   `agent-team/learning-loop-smoke` s minimal change → Make scenario history
   green run + commit do PATTERNS.md / GOTCHAS.md / REGRESSION-LOG.md
   (any of the three; Anthropic may legitimately return `{}` for some cats).
4. **Backpressure Check:** Run once → notif jen pokud ≥5 unmerged agent PRs.
5. **Weekly Digest:** Run once → notif s last-7d merged-agent-PR list. Pokud
   nemáš 7d historie agent PRs, list bude prázdný (Make scenario history
   stejně green).

---

## Troubleshooting

### Notif nepřišel

- Otevři https://ntfy.sh/{your_topic} v prohlížeči — měl bys vidět recent
  messages.
- Pokud topic je prázdný, problem je v HTTP module (URL typo, body format).
- Make UI → scenario history → klikni na last run → expand HTTP module →
  "Output" tab.

### Anthropic API call failí

- Test API key sám:
  ```bash
  curl -H "x-api-key: $YOUR_KEY" \
       -H "anthropic-version: 2023-06-01" \
       https://api.anthropic.com/v1/models
  ```
- Make UI scenario M3 → re-paste key (whitespace-strip first).
- Check Make scenario history pro exact error code (401 = auth, 429 =
  rate limit, 500 = Anthropic side).

### GitHub webhook nedoručuje

- Repo Settings → Webhooks → klikni na webhook → Recent Deliveries.
- Pokud red ✗, klikni a uvidíš HTTP code + response body z Make.
- Common cause: Make scenario není ACTIVE (přepínač off).
- Common cause: webhook URL špatná — copy znova z Make UI.
- Common cause: 2 Make webhooks pointing at same repo (orphan from prior
  experiment). Cross-reference with the URL listed in Learning Loop M1.

### Learning Loop NIKDY nezapisuje commit

- Module 3 → Anthropic returns non-JSON → JSONParse downstream fails →
  modules 4-9 don't fire. Check scenario history → M3 Output tab → ověř,
  že Claude vrátil valid JSON.
- M5/M7/M9 (PUT modules) get a 409 Conflict if the file SHA returned by
  M4/M6/M8 is stale by the time M5/M7/M9 fires (rare but possible if 2
  PRs merge within seconds of each other). Make's default retry (3
  attempts) usually covers this. Hardening = `If-Match` SHA recheck loop
  (out of MVP scope).

### Push Protection blocked my commit

- A literal `ghp_*` or `sk-ant-api03-*` slipped through sanitization. Run
  the post-export sanitization recipe (§ above) and re-commit. The leaked
  token MUST also be rotated (revoke at GitHub / Anthropic console, even
  if you sanitized before any other party saw it — OneDrive cloud sync may
  retain old versions for ~30 days).

---

## Náklady & ops budget

| Scenario | Ops/měs | Cena na Make Core | Cena na Anthropic |
|---|---|---|---|
| Daily Triage | ~30 | included | $0 |
| PR Review Reminder | ~180 | included | $0 |
| Learning Loop | ~60 | included | ~$3 (60 × $0.05) |
| Backpressure Check | ~720 | included | $0 |
| Weekly Digest | ~4 | included | $0 |
| **Total** | **~1000** | **10 % z 10k Core** | **~$3-5** |

Combined: **~$12/měs** (Make $9 + Anthropic $3-5). Master plan §2 odhad
$0-5 byl pre-Make (only Anthropic). $9 Make Core je accepted (Sebastián
schválil v discovery Q5).

---

## Vypnutí (kill switch)

Pokud agent system dělá problémy:

1. Make UI → Scenarios → **Deactivate vše** (přepínač top-right).
2. GitHub repo → Settings → Webhooks → **Disable** the Make webhook(s).
3. Done — agent runs jsou stopnuté, žádný background activity.

Lokální spuštění `claude` v terminálu fungovat dál — to není napojeno na
Make, jen Sebastián může spustit.

---

## Maintenance pattern

Per `feedback_make_blueprints_token_placeholders.md` (memory record):

- **Repo blueprints = importable templates** with `TODO_*` placeholders.
- **Make UI = runtime** with real tokens. Tokens never round-trip back into
  the repo on re-export — always sanitize first.
- **Token rotation:**
  1. Generate new token (GitHub PAT / Anthropic key / ntfy topic).
  2. Make UI Find&Replace per scenario → swap old → new.
  3. Revoke old token at the source (GitHub / Anthropic / ntfy nothing-to-do).
  4. **Do NOT re-export-and-recommit.** The repo template is unchanged
     by token rotation; only the Make runtime moves.
- **If you must re-export** (e.g. you edited scenario logic in Make UI and
  want to checkpoint the new logic into the repo): run § Post-export
  sanitization recipe **before** `git add`. Push Protection is the safety
  net, not the primary defence.
