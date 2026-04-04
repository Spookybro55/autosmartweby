# Cleanup log — provedeno 2026-04-04

> **Podle:** `docs/02-cleanup-plan.md` faze 1-6, 8
> **Vynechano:** git init (F7), crm-frontend/.git (F8), .clasp.json (F9), auth fix (F10) — vyzaduji rozhodnuti vlastnika

---

## Smazano: junk soubory (24 ks, vsechny 0 B)

### Root (10 ks)
- `0)`, `3)`, `300)`, `Modifies`, `WON`, `{,`, `{const`, `}`, `console.error('FAIL`, `m[1])`

### apps-script (7 ks)
- `0`, `0)`, `1)`, `200`, `300)`, `TOTAL_COLS_)`, `m[1])`

### crm-frontend (6 ks)
- `(DEFAULT_FILTERS)`, `([])`, `0`, `l.contactPriority`, `maxAge)`, `pathname.startsWith(p)))`

### Temp/lock (1 ks)
- `docs/~$M-SYSTEM-MAP.md`

## Smazano: stare zalohy (1 ks)
- `apps-script/SeedTestData.gs.bak`

## Presunuto: nabidkove materialy root → offers/ (8 ks)

| Puvodni umisteni | Nove umisteni |
|-----------------|---------------|
| `nabidka-web-remeslnici.html` | `offers/nabidka-web-remeslnici.html` |
| `nabidka-web-remeslnici.pdf` | `offers/nabidka-web-remeslnici.pdf` |
| `nabidka-automatizace.html` | `offers/nabidka-automatizace.html` |
| `nabidka-automatizace.pdf` | `offers/nabidka-automatizace.pdf` |
| `Nabídka - web - onepager.pdf` | `offers/Nabídka - web - onepager.pdf` |
| `Nabídka - automatizace - onepager.pdf` | `offers/Nabídka - automatizace - onepager.pdf` |
| `html2pdf.py` | `offers/html2pdf.py` |
| `html2pdf_auto.py` | `offers/html2pdf_auto.py` |

## Upraveno: cesty v Python souborech (2 ks)

- `offers/html2pdf.py` — html_path a pdf_path aktualizovany na `...\offers\...`
- `offers/html2pdf_auto.py` — html_path a pdf_path aktualizovany na `...\offers\...`

## Prepsano: crm-frontend/README.md

- Puvodni obsah: default Next.js template (zadna hodnota)
- Novy obsah: skutecna dokumentace — setup, architektura, datovy tok, vazby

## Vytvoreno: root .gitignore

- `Nabídka weby/.gitignore` — pokryva node_modules, .next, .env*, .claude-flow runtime, .swarm, editor artifacts, Python cache, temp soubory

---

## Shrnuti

| Akce | Pocet |
|------|-------|
| Smazano junk | 24 |
| Smazano temp | 1 |
| Smazano backup | 1 |
| Presunuto | 8 |
| Upraveno (cesty) | 2 |
| Prepsano (README) | 1 |
| Vytvoreno (.gitignore) | 1 |
| **Celkem zmen** | **38** |

## Co zbyva resit (vyzaduje rozhodnuti vlastnika)

- F7: `git init` — monorepo?
- F8: `crm-frontend/.git/` — zachovat historii?
- F9: `.clasp.json` parentId — zamer nebo chyba?
- F10: Timing-safe HMAC fix v middleware
