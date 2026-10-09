# Translation review queue (native-speaker review needed)

Generated 2026-10-09 23:14 UTC from the Mac-local dev database. Current pipeline: `translate-v2.3`.
Machine translation is enabled only for French and Arabic. **No translation has been reviewed by a native speaker.**
Readers see machine output labelled *machine translation, not yet reviewed*. Failed translations are never shown; readers get the original.

| Locale | Machine (unreviewed, shown with label) | Failed fidelity gate (not shown) | Reviewed | Blocked |
| --- | --- | --- | --- | --- |
| ar | 12 | 5 | 0 | 0 |
| fr | 17 | 0 | 0 | 0 |

## Needs a native reviewer before any public use

Machine output that passed the automatic gate. The gate checks numbers, citation tokens and proper names, and length. It cannot judge tone, idiom, register, gender agreement or terminology.

| Locale | Story | Version | Pipeline | Repaired automatically |
| --- | --- | --- | --- | --- |
| ar | What would it take to build a neighbourhood music archive? | v1 | translate-v2.2 | no |
| ar | Ramaphosa Announces R120 Billion Free State Industrialisation Plan | v1 | translate-v2.3 | yes |
| ar | How does a delivery rider plan a route when the rains close the shortcut? | v1 | translate-v1 | no |
| ar | Why does unused mobile data expire, and who decides when? | v1 | translate-v1 | no |
| ar | Could solar-powered cold storage change the economics of African food markets? | v1 | translate-v2.3 | no |
| ar | Could a shared cold room keep more tomatoes from spoiling before market? | v1 | translate-v2.2 | yes |
| ar | How can a home bakery tell which orders actually make money? | v1 | translate-v1 | no |
| ar | Could solar-powered cold storage change the economics of African food markets? | v1 | translate-v2.3 | no |
| ar | What goes into the price of a custom woven order? | v1 | translate-v2.3 | no |
| ar | Mozambique: Indigenous identity now viewed as historical by Global Voices بالعربية | v1 | translate-v2.3 | no |
| ar | President Ramaphosa urges expansion of Redlands Dairy Farm to boost rural growth | v1 | translate-v2.3 | yes |
| ar | Could solar-powered cold storage change the economics of African food markets? | v1 | translate-v2.3 | no |
| fr | Could solar-powered cold storage change the economics of African food markets? | v1 | translate-v2 | no |
| fr | Could solar-powered cold storage change the economics of African food markets? | v1 | translate-v2 | no |
| fr | Could a shared cold room keep more tomatoes from spoiling before market? | v1 | translate-v1 | no |
| fr | How does a delivery rider plan a route when the rains close the shortcut? | v1 | translate-v1 | no |
| fr | Why does unused mobile data expire, and who decides when? | v1 | translate-v1 | no |
| fr | What would it take to build a neighbourhood music archive? | v1 | translate-v1 | no |
| fr | Ramaphosa Announces R120 Billion Free State Industrialisation Plan | v1 | translate-v2.1 | no |
| fr | Dube-Ncube urges Grade 12s to target tech, energy, and agri careers in October 2026 prayer | v1 | translate-v2.1 | no |
| fr | What goes into the price of a custom woven order? | v1 | translate-v2.3 | no |
| fr | How can a home bakery tell which orders actually make money? | v1 | translate-v2.2 | no |
| fr | Mozambique: Indigenous identity now viewed as historical by Global Voices بالعربية | v1 | translate-v2 | no |
| fr | Could solar-powered cold storage change the economics of African food markets? | v1 | translate-v2.2 | no |
| fr | Deputy Minister Kenny Morolong urges South Africa to leverage global position for economic | v1 | translate-v2.3 | no |
| fr | President Ramaphosa Congratulates Navi Pillay on 2026 Nobel Peace Prize Award | v1 | translate-v2.2 | no |
| fr | Deputy Minister urges communicators to safeguard public trust | v1 | translate-v2.3 | no |
| fr | Gauteng issues 526 new operating licences to compliant scholar and minibus taxi operators | v1 | translate-v2.2 | no |
| fr | President Ramaphosa urges expansion of Redlands Dairy Farm to boost rural growth | v1 | translate-v2.3 | no |

## Rejected automatically (kept unpublished): what a reviewer would need to fix

| Locale | Story | Pipeline | Why the gate rejected it |
| --- | --- | --- | --- |
| ar | Dube-Ncube urges Grade 12s to target tech, energy, and agri careers in October 2026 prayer | translate-v2.3 | names dropped or altered: Dube-Ncube; numbers missing: 12, 12, 12, 12, 12; one automatic repair attempt also failed |
| ar | Deputy Minister urges communicators to safeguard public trust | translate-v2.3 | names dropped or altered: Kenny, Morolong; one automatic repair attempt also failed |
| ar | Gauteng issues 526 new operating licences to compliant scholar and minibus taxi operators | translate-v2.3 | names dropped or altered: Gauteng; one automatic repair attempt also failed |
| ar | Deputy Minister Kenny Morolong urges South Africa to leverage global position for economic | translate-v2.3 | names dropped or altered: Johannesburg, Kenny, Morolong; one automatic repair attempt also failed |
| ar | President Ramaphosa Congratulates Navi Pillay on 2026 Nobel Peace Prize Award | translate-v2.3 | names dropped or altered: Nobel, Pillay, Ramaphosa; one automatic repair attempt also failed |

## Known limits of the automatic gate (why native review remains necessary)

- Names that are also ordinary English words ("Bloom", "Grace") are not checked; only names absent from the common-word list are.
- Arabic: the gate requires each Latin-script name to reappear in Latin letters (for example رامافوزا (Ramaphosa)). The Arabic transliteration itself is not verified.
- Meaning, register, idiom and politically sensitive terminology are not machine-checkable here.
- The French and Arabic interface strings were written by the build agent and are marked beta.
