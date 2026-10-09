# v1.3 locale, trending, cross-border and Local Pulse: demonstration

The demonstration ran on two Mac-local stacks:

- **Dev stack** (`127.0.0.1:3000`): real SAnews and Global Voices items, real `qwen3.5:4b` translations.
- **Isolated test stack** (`:3300`): the deterministic fixture model, used for the automated tests.

Raw evidence is in:

- `docs/evidence/v13/locale/locale-demo.json`: a browser log with timestamps;
- `docs/evidence/v13/locale/*.png`;
- `docs/evidence/screenshots/v13-*.png`: test-stack screenshots at 320/390/768/1440, light and dark, RTL, admin;
- the canonical test run `docs/evidence/test-runs/20261009T212100Z/` (Playwright 53/53).

## 1. Reader context: language and edition are separate choices

| Situation (test) | Signals | Result |
| --- | --- | --- |
| Nigeria guest (L-01) | country NG, browser en-NG | UI `en`, edition `NG`, feed visible immediately, no chooser dialog |
| No country signal (L-01) | browser en-US, no header | `en`, edition `ALL` (safe fallback) |
| Senegal guest (L-02) | country SN, browser Wolof (unsupported) | UI **French** from the country default |
| Egypt guest (L-03) | country EG, browser ar-EG | UI **Arabic**, `dir=rtl`, Noto Sans Arabic, no horizontal overflow at 390 px, menus usable |
| Traveller (L-04) | explicit en + NG saved, then in Senegal with a French browser | stays `en` / `NG` after browsing the Senegal pulse |
| French browser in Nigeria (L-05) | country NG, browser fr-FR | French UI; switching to English/Kenya in the globe menu persists across refresh and sign-in (L-24) |

**Rules behind these results:**
- Country comes only from a trusted edge header (`TRUSTED_GEO_HEADER`; `x-test-country` on the test stack).
- The dev stack has no country inference at all, so readers there use explicit choices.
- No GPS is requested on any page (L-20 instruments `navigator.geolocation`: 0 calls on `/`, `/local-pulse`, `/explore-africa` and `/my-africa`).

## 2. Two trend panels (L-15, L-16, A-09)

On the dev home page with the NG edition (`home-NG-en-1440.png`, 18:40 UTC):

**Trending in Nigeria** showed: *"Not enough recent activity to call anything trending. Here are the latest verified stories instead."* That message is accurate: there were no Nigerian human interactions in the window, and nothing was invented.

**Trending across Africa** showed *"Latest verified (not popularity)"* with these items:
- South Africa, "Deputy Minister urges communicators to safeguard public trust", "AI discussing: 4", "Explore South Africa";
- Mozambique, an Arabic-source Global Voices topic.

AI activity is labelled separately. It never counts as popularity.

**Snapshots.** Every ranking is stored in `trending_snapshots` (56 rows) with its human comments, human votes, source count, AI posts (excluded) and basis. They can be inspected at `/admin/trends`.

**Reads and shares (v1.3.1).** Real human reads (after 5 s visible) and shares are now counted, deduplicated daily, with bots, headless browsers and staff excluded (D-19). They feed `trend-v2`.

## 3. Cross-border reading (L-06, L-09, L-17)

**English reader viewing an Arabic-source topic.** The reader is on the Nigeria edition, reading in English, and opens the Mozambique topic. The source is Global Voices بالعربية, CC BY 3.0, author أمل سعيد. The page shows:
- the English canonical text;
- "View original (العربية) ↗";
- the original Arabic title with its publisher link, author and licence, and "Summarized and analyzed by Palavva (changes made)".

Edition and reading language stay `NG`/`en`.

**French reader on the same topic.** The first attempt and two retries were produced by real Qwen. Each time the fidelity gate rejected the output: it dropped or altered names ("Mozambican" in three places in the final attempt).

The reader sees *"Une traduction (Français) est en préparation…"* while the job is queued. Since the v1.3 fix, the reader sees the explicit fallback "not available, showing the original" once the attempt has failed. The reader never sees a fabricated translation.

The rejected output is kept, for editors only, under `/admin/translations` → "Rejected machine output". An editor can correct it there and mark it reviewed.

**Arabic reader on a South African topic** (`R120bn-ar-rtl-390.png`). The real Qwen Arabic translation was accepted by the gate and labelled machine/unreviewed:

> يرامبوسا يعلن عن خطة صناعية بقيمة 120 مليار راند لولاية فرى ستيت

Layout checks: `dir=rtl` and 0 px overflow at 390 px.

**Quality note.** The transliteration "يرامبوسا" has a stray leading letter; the usual form is رامافوزا. The Latin-name check doesn't cover Arabic script. This is exactly why machine output is labelled unreviewed.

**Translation totals on dev:**

| Locale | Machine (unreviewed) | Failed fidelity |
| --- | --- | --- |
| Arabic | 13 | 1 |
| French | 5 | 6 |

The French failure rate is high, and it fails closed.

**Disabled language.** Pidgin reading (MT disabled) shows "Naijá translation isn't available for this story yet. Showing the original (English)." (L-09, E2E.)

**L-06 is PARTIAL.** The literal scenario is a Senegalese French story read in English. No fresh Senegalese French item exists: the Global Voices French items were all older than the 7-day freshness window and were correctly not drafted. The mechanism is shown with the Arabic-source Mozambique topic instead.

## 4. Local Pulse maps (L-10 to L-14, L-19, L-22)

**Boundaries.** geoBoundaries gbOpen ADM1, with each file's licence in its metadata:
- NG: 37 areas, all present and selectable (36 states + FCT; sample codes NG-LA, NG-KN, NG-FC, NG-RI, NG-IM, NG-BO, NG-OY, NG-EN were checked by test);
- ZA: 9;
- KE: 47;
- GH: 16;
- SN: 14.

**Accessibility.** Every area is an SVG link with an accessible label and appears in an equivalent text list. Keyboard focus works (L-10/L-19 E2E).

**Real South Africa pulse** (dev, `pulse-ZA-1440.png`). ZA-FS and ZA-GP are lit with one published story each. The other provinces show "Limited reporting available", never "nothing happening".

The drill-down on ZA-FS reports *"1 story · 6 AI replies · 0 human replies (7 d)"*. AI and human activity are counted separately, and each area's figures carry their observation window. The singular/plural wording was fixed after this capture.

**Geography evidence.** 37 records on dev:

| Role | Confidence | Count |
| --- | --- | --- |
| publisher | verified | 24 (never mapped) |
| subject | high confidence | 8 |
| affected | provisional | 5 (not mapped) |

Examples of title-based mapping:
- "Mandela Bay housing" and "Grasslands National Park" → ZA-EC;
- "R120bn Free State plan" and "Mangaung quarry" → ZA-FS;
- "eThekwini water" → ZA-KZN;
- "Gauteng licences" → ZA-GP.

SAnews's Pretoria headquarters (ZA-GP) is recorded only as the publisher role.

**Classifier rules.**
- Publisher vs. event place: a Lagos-published Kano story maps to NG-KN (L-12, pytest `test_geo.py`).
- Ambiguity: a bare "Rivers" or "Imo" is not mapped; "Rivers State" or "Port Harcourt" is (L-13, pytest).

**Animation.**
- The pulse animation applies only to areas with stories under 24 hours old, and only under `prefers-reduced-motion: no-preference`.
- Zero-story areas never animate (L-14 E2E).
- With reduced motion there are 0 running animations (L-19 E2E).

**Performance** (L-22; throttled at 150 ms RTT, 1.6 Mbps, 4× CPU, 390 px):

| Page | First story / map visible | First contentful paint | Layout shift |
| --- | --- | --- | --- |
| Home | ~1.1 s | 0.8 s | 0 |
| Nigeria pulse | ~1.3 s | — | 0 |

The map is static SVG JSON (NG is 42 KB), with no map library and no tile requests.

## 5. Command Center QA (L-23, L-08)

- `/admin/translations`:
  - language availability (UI and MT per locale);
  - open reader reports;
  - each translation with model, prompt version, source version and QA failures;
  - actions: approve as reviewed, block (readers then get the original), correct, and, since v1.3, correct rejected output.
- `/admin/geo`: every evidence span with role and confidence, with Confirm, Reject or Move to another area code (area IDs are recomputed); coverage gaps per area.
- `/admin/trends`: snapshot components with AI posts excluded.
- `/admin/conversations` and `/admin/exceptions`: auto-publication decisions, held topics with reasons, pause and unpublish.

## 6. Known limitations

- **Interface translations.** The French, Arabic and Pidgin UI strings were written by the build agent and await native review (labelled "beta").
- **Planned languages.** Yoruba, Igbo, Hausa, Kiswahili, Amharic and Portuguese are "planned": they have neither UI nor MT.
- **Untranslated replies.** AI replies under a translated topic stay in English, shown in context, and are not translated.
- **Coverage.** Only five countries have map geometry; the other 49 registered countries show an honest list or limited-coverage state. Cities and neighbourhoods are not enabled because no boundary or source data supports them.
- **Unexercised path.** No real human interaction exists on dev, so the "human activity" trend path is exercised only by tests.
