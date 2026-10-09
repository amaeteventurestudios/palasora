# 23. Locale Intelligence, Trending Across Africa, and Local Pulse: Implementation Contract

**Authority:** October 9 supplemental handoff `PALAVVA_LOCALE_TRENDING_LOCAL_PULSE_HANDOFF_2026-10-09.md`; fully read it. This concise contract does not replace it or loosen its geographic and translation accuracy safeguards.

## 1. Invariants

- Existing homepage is **conversation first**. No hero map, no content hidden below large marketing panel.
- Reader location, selected country edition, interface locale, reading locale, source language and followed regions are independent. Explicit preference always beats inferred location.
- Original author/publisher and evidence IDs persist across translations. No locale-only duplicate topic IDs.
- Nearby locality is a **verified coverage classification**, not a device IP extrapolation.
- Trending activity is genuine; AI counts separate from human popularity.
- Midnight `#1B2030`, Tangerine `#E85E31`, Warm Gold `#F8C45C`, Ivory `#F8F5F0`; do not use the palette recalled tentatively in supplemental §1.1.

## 2. Suggested locale resolution pseudocode

```
resolveReaderContext(user, guestPreference, acceptLanguage, coarseGeoCountry):
  explicitUserChoice = user.explicit || guestPreference.explicit
  interfaceLocale = explicitUserChoice.interface || saved.interface ||
                    supported(acceptLanguage) || countryDefault(coarseGeoCountry) || 'en'
  readingLocale = explicitUserChoice.reading || saved.reading ||
                  supported(acceptLanguage) || countryReadingDefault(coarseGeoCountry) || 'en'
  homeEdition = explicitUserChoice.edition || saved.edition ||
                knownCountry(coarseGeoCountry) || 'ALL'
  return { interfaceLocale, readingLocale, homeEdition, sourceLocale: 'per story' }
```

Order differs intentionally from read-time news geography. A user in Senegal may set Nigeria and Pidgin. Never overwrite these explicit choices after navigation to Senegal or any other country. No GPS prompt on page load.

## 3. Locales and rollout gates

Nigeria: English initial and quality-reviewed Nigerian Pidgin, Yoruba, Igbo, Hausa where feasible. Senegal: French-first supported initial state with English reader-preserving links. North Africa: Arabic-first configured countries with verified RTL, not merely literal text translation. East Africa: English/Kiswahili as appropriate. Other countries and languages remain progressive and gated. Need actual locales/routes, localizable labels/forms/empty/errors, script/font testing and clear available vs fallback language status. Do not claim generalized local-model quality on all languages without independently tested samples/native QA.

Translation source is canonical reviewed text, not chain-translated variants. Immutable source attribution and version IDs; link corrected renditions to corrected originals. Cache per canonical ID + content version + locale + model/prompt version. `View original`, `Translate` and `Report translation` behave honestly. Consider how parent/child conversations remain intelligible if some replies are untranslated: display originals with explicit fallback and avoid hiding direct reply context.

## 4. Geographies and maps

Initial Nigeria reference dataset must contain 36 states and FCT. Add stable region IDs, administrative names, parent links and legally usable simplified geometry; check accuracy and disputed boundary treatment, make all polygons selectable and keyboard-addressable. A geographic ID labels country/region/city *content scope*. `MapLibre` is preferred where integration footprint suits Mac and future Oracle ARM; fallback to `Leaflet`/static vector with accessible list where warranted. Load map component lazily, obey OSM/Overture/tile terms, never rely on public tile servers as a production guarantee. PostGIS/Martin are optional future services, not automatic database migrations.

RSS geoclassification must preserve source publisher area and **subject/event area** separately. Identify source evidence spans; verify ambiguous names with gazetteer; do not inflate locality accuracy. Country → region → city → district/neighborhood only with actual source/boundary quality. Labels `Limited reporting available` for low coverage, not `Nothing happened`. Map signal snapshots record observation window, source count, human interactions, agent responses, confidence, updated time and basis. No illumination without real grounded events; motion subtle and obeys reduced-motion.

## 5. Dual trending

Trending Now = one home edition or selected area, with real covered topics and human engagement components, optionally AI activity shown **under a separate label**. Across Africa = salient threads from other countries, localized for the reading language, with source freshness and origin label. Cross-border clicking never changes reader language preference or home edition; show options `Explore Senegal` / `View original: Français` when relevant. If no verified recent basis, show honest limited-data / editor-picked label, no invented trend/engagement figures.

Data contract for snapshot: `tenant_id`, `topic_id`, `scope` (`home`/`africa`), `country_id`, `geo_area_id`, `time_window_start/end`, `computed_at`, `source_count`, `human_views`, `human_comments`, `human_shares`, `ai_posts`, `basis` (verified_coverage/human_activity/ai_activity/editorial_selection), `confidence`, `display_locale`. Ranking uses documented normalized features and excludes AI replies from human engagement demand. Cache keys isolate tenant, area, locale and time window.

## 6. My Africa and Command Center

Allow follows on multiple countries/states/cities and topics, guest local prefs / logged-in cross-device. Add admin panels for source coverage gaps by area, geography evidence/review, translation fidelity/report, per-language availability, map/tile fallback, trend basis and true human-vs-AI metric separation. Use existing Command Center and analytics; do not build a second admin application.

## 7. UI and scenarios

Desktop: feed remains dominant left; right sidebar compact home-country map, separate Trending Now and Trending Across Africa plus existing live activity/community/spotlight/sponsor components. Mobile: first topic visible, compact Local Pulse discovery then deep map bottom sheet, accessible dual trend cards. Dedicated Explore Africa map is not homepage hero. Arabic layout needs actual RTL components, labels and forms; source URLs/numerals must remain legible in bidirectional text.

**Acceptance:** All 25 L-01–L-25 tests in `24-EXTENDED-ACCEPTANCE-MATRIX.md`, plus existing T-001–T-042 and A-01–A-12. Keep future Palavva Radio feature-flagged and scope it as a separately reviewed audio enhancement, not a launch blocker.
