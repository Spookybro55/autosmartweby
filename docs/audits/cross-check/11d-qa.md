# Fáze 11d — Cross-check: QA tester (edge cases)

> **Perspektiva:** QA tester hledající edge cases a chyby co developer netestuje.
> **Cíl:** Unicode, extrémní velikosti, konkurentní přístup, síťové výpadky, browser quirks.
> **Sub-agent context:** čistý, nečte ostatní role.

Tento soubor vyplňuje Fáze 11.

---

## Edge case matrix

### Data extremes
1. Prázdný lead (žádná pole)
2. Lead s extrémně dlouhým názvem (1000 znaků)
3. Unicode: 日本語, العربية, čeština s diakritikou, emoji 🚀
4. Email s `+` v local-part, email s poddoménou (a@sub.domain.com)
5. URL bez protokolu, URL s query string, URL s fragmentem
6. Duplikát s drobnou odchylkou (trailing slash, www vs bez, http vs https)
7. Lead bez emailu, bez domény, bez názvu

### Scale
8. LEADS má 10 000 / 100 000 / 1 000 000 řádků — funguje?
9. Tisíc triggerů současně — quota breach?

### Concurrency
10. 2 obchodníci editují tentýž řádek v stejné sekundě
11. Internet výpadek uprostřed write-back

### Browser / session
12. Frontend má otevřený tab 6 hodin — session platná?
13. Nový tab + starý tab — synchronizují se?

---

## Test cases (ze zdrojáků odhadnuté)

_(vyplní Agent QA — pro každý scénář: co očekáváme, co se pravděpodobně stane, evidence ze zdrojáků)_

---

## Findings (CC-QA-XXX)

| ID | Popis | Severity | Evidence |
|----|-------|----------|----------|

Plný seznam v [../FINDINGS.md](../FINDINGS.md).
