# Make Scenarios — Import Guide

> **Audience:** Sebastián (owner) — manuální setup po Phase 3 prerequisites PR.
> **Time:** 15-30 minutes total.
> **Pre-req:** Phase 3 prerequisites PR mergnutý + Anthropic API key vytvořen
> (viz `docs/agents/SETUP-CHECKLIST.md`).

5 Make scenarios žije v `docs/agents/make/0{1,2,3,4,5}-*.json`. Make Core
($9/měs, 10k ops) plně podporuje všechny tyto scenarios; expected total ~1000 ops/měs.

---

## Předpoklady (před importem)

### 1. Make účet (Core plan)

- https://www.make.com/en/pricing
- Core: $9/měs, 10k ops/měs (8× více než potřebujeme)
- Free (1k ops) nestačí na všech 5 scenarios

### 2. GitHub Personal Access Token (PAT)

1. https://github.com/settings/tokens/new
2. Note: `make-agent-team-autosmartweby`
3. Expiration: 90 days (rotation v `docs/SECRETS-ROTATION.md`, jakmile DOC-020 landne)
4. Scopes:
   - **`repo`** (full — needed for read PRs + commit to PATTERNS/GOTCHAS/REGRESSION-LOG)
   - **`workflow`** (NICE-TO-HAVE — pokud někdy budeš workflow_dispatch z Make)
5. Generate, **save token immediately** (zobrazí se jen 1×)

### 3. Anthropic API key

Viz `docs/agents/SETUP-CHECKLIST.md` "Anthropic API key" (manual step).
Bez něj nepojede `03-learning-loop` (ostatní 4 scenarios poběží OK).

### 4. ntfy topic

1. Otevři https://ntfy.sh app v iOS / Android (free).
2. Add subscription → vyber random topic name.
3. Doporučení: `autosmartweby-agents-{14-char-random-suffix}`. Generuj např.
   `openssl rand -hex 7`. Příklad: `autosmartweby-agents-a3b2c1d4e5f6g7`.
4. **NESDÍLEJ topic name** — kdokoli ho zná, dostane tvoje notifikace.
5. **NEPATŘÍ do gitu.** Nahraj jen do Make scenario.

---

## Setup Make connections (jednou, společné)

V Make UI → **Connections → Add**:

### Connection: GitHub

- Name: `Spookybro55 GitHub`
- Auth: Personal Access Token
- Token: paste GitHub PAT z předchozího kroku
- Test connection → ✓

### Connection: Anthropic

- Name: `Anthropic Production`
- Auth: API Key
- Key: paste contents of `~/.config/anthropic/api-key`
- Test connection → ✓

### HTTP module pro ntfy

ntfy NENÍ v Make module library. Použij **HTTP module** (built-in):

- Modul: `HTTP` → `Make a request`
- URL: `https://ntfy.sh/<your_topic>` (replace v každém scenario)
- Method: POST
- Headers: `Title`, `Tags`, `Priority` (per scenario JSON)
- Body: text/plain message

(Není to "connection" v Make smyslu — HTTP je per-call.)

---

## Import scenarios — postup pro každý

Pro každý z 5 JSON souborů v `docs/agents/make/0*.json`:

1. Make UI → **Scenarios → Create new scenario → Import blueprint**
2. Upload JSON file (např. `01-daily-triage.json`)
3. Make zobrazí scenario diagram. Klikni postupně každý modul:
   - **GitHub modul:** vyber `Spookybro55 GitHub` connection.
   - **Anthropic modul** (jen v 03-learning-loop): vyber `Anthropic Production`.
   - **HTTP modul:** replace `{{TODO_SEBASTIAN_TOPIC}}` v URL s tvým ntfy topic.
4. **Save** scenario
5. **Activate** scenario (přepínač top-right). NEAKTIVUJ 03-learning-loop dokud
   neukončíš webhook setup níže.

### Scenario-specific dokončení

#### `01-daily-triage`

- Schedule: **08:00 Europe/Prague** (default v JSON `cron: "0 8 * * *"`).
- No additional config.
- Test: Run once → ntfy notification přijde do 5s.

#### `02-pr-review-reminder`

- Schedule: 6× daily Europe/Prague (`0 9,11,13,15,18,21 * * *`).
- Threshold: 24h (adjustable in Filter module condition).

#### `03-learning-loop` ⚠️ MOST COMPLEX

**Webhook URL setup:**

1. After import, klikni na webhook module → Make zobrazí unique URL
   (e.g. `https://hook.eu1.make.com/abc...`). **Copy URL.**
2. GitHub repo → Settings → Webhooks → **Add webhook**.
3. Payload URL: paste Make webhook URL.
4. Content type: `application/json`.
5. Secret: leave empty (Make doesn't validate signature in MVP — Phase 3
   improvement: add HMAC validation).
6. Events: **"Let me select individual events"** → uncheck all → check
   **"Pull requests"**.
7. Active: ✓.
8. Save.
9. Test: zelená galka by se měla objevit v "Recent Deliveries" do 1-2 minut
   (GitHub posts a `ping` event).

**Anthropic API rate cost:**

- ~$0.05 per merged agent PR (Sonnet 4.6, ~1500 tokens).
- Set Make scenario → Settings → Notifications → "Receive an email when
  this scenario fails or runs successfully".
- Set spending cap v Anthropic Console → Settings → Billing → Spend caps:
  - Monthly: $20
  - Daily: $2

**Then activate scenario.**

#### `04-backpressure-check`

- Schedule: hourly (`0 * * * *`).
- Threshold: 5 PRs (Router condition).

#### `05-weekly-digest`

- Schedule: Monday 09:00 (`0 9 * * 1`).

---

## Test postup (po importu všech 5)

1. **`01-daily-triage`:** Run once → ntfy notif "Daily Triage Ready".
2. **`02-pr-review-reminder`:** Run once → notif jen pokud máš ≥1 unmerged
   agent PR > 24h.
3. **`03-learning-loop`:** vytvoř + mergni testovací branch
   `agent/test/learning-loop-smoke` s minimal change → notif via Make + commit
   do PATTERNS.md (or no commit pokud Anthropic vrátil null pro pattern).
4. **`04-backpressure-check`:** Run once → notif jen pokud ≥5 unmerged agent PRs.
5. **`05-weekly-digest`:** počkej do pondělí, nebo Run once.

---

## Troubleshooting

### Notif nepřišel

- Otevři https://ntfy.sh/{your_topic} v prohlížeči — měl bys vidět recent messages.
- Pokud topic je prázdný, problem je v HTTP module (URL typo, body format).
- Make UI → scenario history → klikni na last run → expand HTTP module → "Output" tab.

### Anthropic API call failí

- Test API key sám: `curl -H "x-api-key: $(cat ~/.config/anthropic/api-key)"
  -H "anthropic-version: 2023-06-01" https://api.anthropic.com/v1/models`
- Make connection → reauthorize / re-paste key.
- Check Make scenario history pro exact error code (401 = auth, 429 = rate
  limit, 500 = Anthropic side).

### GitHub webhook nedoručuje

- Repo Settings → Webhooks → klikni na webhook → Recent Deliveries.
- Pokud red ✗, klikni a uvidíš HTTP code + response body z Make.
- Common cause: Make scenario není ACTIVE (přepínač off).
- Common cause: webhook URL špatná — copy znova z Make UI.

### Učení loop NIKDY nezapisuje commit

- Module 5 JSONParse: pokud Anthropic vrátí non-JSON (např. plain text),
  parse failuje → moduly 7-9 se nespustí. Check scenario history → modul 4
  Output → ověř, že Claude vrátil valid JSON.
- Module 7-9 mají `_condition` checks které možná Make nehonoruje out of box —
  může vyžadovat refactor jako BasicRouter větve s explicit per-route filter.
  See `_setup_notes` v `03-learning-loop.json`.

---

## Náklady & ops budget

| Scenario | Ops/měs | Cena na Make Core | Cena na Anthropic |
|---|---|---|---|
| `01-daily-triage` | ~30 | included | $0 |
| `02-pr-review-reminder` | ~180 | included | $0 |
| `03-learning-loop` | ~60 | included | ~$3 (60 × $0.05) |
| `04-backpressure-check` | ~720 | included | $0 |
| `05-weekly-digest` | ~4 | included | $0 |
| **Total** | **~1000** | **10% of 10k Core** | **~$3-5** |

Combined: **~$12/měs** (Make $9 + Anthropic $3). Master plan §2 odhad
$0-5 byl pre-Make (only Anthropic). $9 Make Core je accepted (Sebastián
schválil v discovery Q5).

---

## Vypnutí (kill switch)

Pokud agent system dělá problémy:

1. Make UI → Scenarios → **Deactivate vše** (přepínač top-right).
2. GitHub repo → Settings → Webhooks → **Disable** the Make webhook.
3. Done — agent runs jsou stopnuté, žádný background activity.

Lokálně spuštění `claude` v terminálu fungovat dál — to není
napojeno na Make, jen Sebastián může spustit.
