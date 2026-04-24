# Manual Checks — co musí ověřit člověk

> Items, které audit nemohl ověřit ze zdrojáků (označené ⚪). Každá fáze sem přesouvá všechny své ⚪ items. Finální konsolidace ve Fázi 12.

---

## Jak používat

Každá položka má:
- **Co ověřit:** konkrétní otázka
- **Kde ověřit:** systém / UI / konzole / dokument
- **Očekávaný výsledek:** co by mělo být
- **Jak zaznamenat:** zpátky do audit dokumentu nebo sem

---

## By role

### Developer checks

_(vyplňuje se postupně jak fáze běží)_

| # | Fáze | Co ověřit | Kde | Očekávaný výsledek |
|---|------|-----------|-----|---------------------|

### Ops checks

_(vyplňuje se postupně)_

| # | Fáze | Co ověřit | Kde | Očekávaný výsledek |
|---|------|-----------|-----|---------------------|

### Product / business checks

_(vyplňuje se postupně)_

| # | Fáze | Co ověřit | Kde | Očekávaný výsledek |
|---|------|-----------|-----|---------------------|

### Security checks

_(vyplňuje se postupně)_

| # | Fáze | Co ověřit | Kde | Očekávaný výsledek |
|---|------|-----------|-----|---------------------|

---

## Kontexty bez přístupu z auditu (anticipated)

Audit nemá přístup k následujícím systémům a proto sem v průběhu fází přidá relevantní otázky:

- **Live Apps Script Console** — triggery v cloudu, execution history, Script Properties
- **Live Google Sheets** — reálný obsah LEADS, Ke kontaktování, _raw_import
- **Produkční env variables** — hodnoty v Vercel / hosting provider
- **GCP / Google Workspace admin** — OAuth apps, service accounts, quotas
- **Penetrační testování** — aktivní security testing
- **Load / stress testing** — reálné chování pod zátěží
- **Compliance audit** — GDPR právní review
- **CI secrets** — GitHub Actions secret values
