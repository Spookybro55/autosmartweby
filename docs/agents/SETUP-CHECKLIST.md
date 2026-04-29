# Setup Checklist — Manual Prerequisites

> **Audience:** Sebastián (owner). Toto jsou kroky, které **MUSÍŠ udělat
> ručně** mimo Claude Code, než se aktivuje Phase 3 (CRM dashboard +
> learning loop).
>
> Phase 1 a Phase 2 **nepotřebují žádný manual setup** — vše proběhne v
> repu. Tento dokument se týká pouze toho, co Phase 3 potřebuje k aktivaci
> learning loop a real-time monitoring.

---

## Před Phase 3 PR (přípravné kroky)

Tyhle kroky uděláš **PŘED** otevřením Phase 3 PR. Phase 3 PR se opírá o
secrets/configs, které vytvoříš tady.

### 1. Anthropic API key (pro learning loop)

- [ ] Přihlas se do Anthropic Console: https://console.anthropic.com/
- [ ] Settings → API Keys → Create Key. Pojmenuj např. `autosmartweby-learning-loop`.
- [ ] Zkopíruj key (start `sk-ant-...`). **NEPOUKLÁDEJ NIKAM V REPU.**
- [ ] Zkontroluj billing — očekávaný náklad $3-5/měs (master plan §2). Set
      monthly cap $20 jako safety net (Console → Billing → Spend caps).

### 2. Make scenario secret store

- [ ] V Make UI: Connections → Add → "Anthropic" (nebo HTTP module s manual
      API config pokud Anthropic connector neexistuje).
- [ ] Vlož API key z Kroku 1 sem. **Make UI = jediné místo, kde key žije.**
- [ ] Test connection (Make scenario test mode).

### 3. Make plán

- [ ] Discovery report Sekce 9 Q5 řekl: **Make Core ($9/měs, 10k ops)**.
- [ ] Verify aktuální plán v Make Settings → Subscription. Pokud je `Free`
      (1k ops), upgrade na Core PŘED importem learning loop scenarios
      (Free tier 1k ops/měs je <100% potřeba; Core 10k je ~8× headroom).

### 4. GitHub PAT pro CRM dashboard (volitelné, jen pokud chceš dashboard)

- [ ] GitHub → Settings → Developer settings → Personal access tokens →
      Tokens (classic) → Generate.
- [ ] Scope: **read-only**: `repo:status`, `public_repo`, `read:org` (pokud relevant).
      **NE** `repo:write`. Dashboard je read-only.
- [ ] Pojmenuj `autosmartweby-dashboard-readonly`.
- [ ] Expiry: 90 dní (rotation runbook v Phase 2 SECRETS-ROTATION.md).
- [ ] Token jde do Vercel env: Settings → Environment Variables → Add
      `GITHUB_AGENT_TOKEN` = `<token>` v scope `production` + `preview`.

### 5. Vercel env vars

- [ ] `OWNER_EMAIL=s.fridrich@autosmartweb.cz` v scope `production`,
      `preview`, `development` (per discovery report Sekce 8 #7 — middleware
      check pro `/admin/*`).
- [ ] `GITHUB_AGENT_TOKEN` (z Kroku 4, pokud děláš dashboard).
- [ ] Existing `NEXTAUTH_SECRET` musí být **všech 3 scopes** s 32+ char value.
      (Per finding SEC-016 fail-fast resolved in `24e3d65`. Build fail loud
      jinak — `NEXTAUTH_SECRET= npm run build` throws.)

### 6. ntfy topic (volitelné, pokud chceš push notifikace)

- [ ] https://ntfy.sh — vyber unique topic name (e.g. `autosmartweby-sebastian-{random6}`).
- [ ] Subscribe v ntfy iOS / Android app na ten topic.
- [ ] Topic name jde do Make scenario notification module (Phase 3 import).
      **NE** v repu.

---

## Phase 3 import workflow

Když Phase 3 PR landne, Sebastián:

1. Pull main, otevři Make UI.
2. Importuj `docs/agents/make/daily-triage-scenario.json`.
3. Importuj `docs/agents/make/learning-loop-scenario.json`.
4. Importuj `docs/agents/make/weekly-digest-scenario.json`.
5. Edit imported scenarios — replace placeholder values:
   - `{ANTHROPIC_API_KEY_CONNECTION}` → connection name z Krok 2.
   - `{NTFY_TOPIC}` → topic name z Krok 6.
   - `{GITHUB_REPO}` → `Spookybro55/autosmartweby`.
6. Spusť test run každého scenario manually (Run once button).
7. Activate scenarios (zelené tlačítko).

---

## Re-evaluace po 4 týdnech provozu (master plan §16)

Po 4 týdnech od merge Phase 3 PR, Sebastián zkontroluje:

- [ ] Anthropic API actual spend < $10/měs (pokud >, viz §16 master plan
      "Kdy upgradovat na Max 20x").
- [ ] Make ops/měs < 5000 (Core plan headroom check).
- [ ] PR review backlog stays < 5 unmerged PRs > 24h.
- [ ] Failure cascade hasn't tripped > 1× za týden.
- [ ] Sebastián review čas ~6-10h týdně (master plan §15 expectation).

Pokud kterýkoli z těchto je porušen → revisit configuration nebo escalate
to Max 20x ($200) tier.

---

## Co tato setup NEPOTŘEBUJE

- ✗ Žádný service account vytvořit nemusíš (current architecture = single
  Claude session, žádný daemon).
- ✗ Žádný GitHub App (PAT classic stačí pro read-only dashboard).
- ✗ Žádný Vercel deployment URL pro agent system samotný (agent běží
  lokálně v terminálu).
- ✗ Žádný DNS / domain change.
- ✗ Žádný dedicated cloud server / Lambda / cron beyond Make scheduled scenarios.
