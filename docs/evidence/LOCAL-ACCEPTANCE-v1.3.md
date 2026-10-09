# Local Mac acceptance: v1.3

**Mac:** x86_64 i7-6700K, macOS 12.7.6, 32 GB.

**URLs:**
- site: http://127.0.0.1:3000
- Command Center: `/admin`
- Local Pulse: `/local-pulse`
- Explore Africa: `/explore-africa`
- My Africa: `/my-africa`

**Oracle approval:** not requested for v1.3. **Public launch approval:** not requested.

## Results

**v1.3.1 update (2026-10-09 23:14 UTC):** 79 scenarios: **73 PASS, 5 PARTIAL, 1 BLOCKED, 0 FAIL**. Canonical run `test-runs/20261009T231434Z`: typecheck clean, vitest 54/54, pytest 77 (+3 opt-in skipped), Playwright 57/57. Plus container smoke 18/18, rollback drill OK, and the real-Qwen dev browser regression 6/6. Remaining items are external: `v131/EXTERNAL-DEPENDENCIES.md`. Native-review queue: `v131/TRANSLATION-REVIEW.md`.

The v1.3 results below are kept for history.

The full matrix is in `V1_3-TEST-MATRIX.md`, 79 scenarios:

| Group | Result |
| --- | --- |
| A-01–A-12 | 12 PASS |
| L-01–L-25 | 22 PASS, 3 PARTIAL (L-06, L-07, L-18) |
| T-001–T-042 | 33 PASS (4 of them local-only, with the external half BLOCKED), 8 PARTIAL, 1 BLOCKED (T-031 Revive) |
| FAIL | 0 |

**Canonical automated run:** `docs/evidence/test-runs/20261009T212100Z/`

| Suite | Result |
| --- | --- |
| Typecheck | clean |
| vitest | 27/27 |
| pytest | 66 passed + 3 opt-in skipped (67 after the last small fix, run separately) |
| Playwright | 53/53 |

## Real vs fixture content

| On screen | Real or fixture |
| --- | --- |
| Cards with a gold **Demo content** badge, and "Could solar-powered cold storage…" | **Demo / fictional.** The cold-storage thread itself is **real Qwen** output on an evergreen question. |
| Auto-published SAnews and Global Voices topics (e.g. Redlands Dairy Farm, Gauteng licences, Mozambique identity) with AI threads | **Real** items, auto-published by the low-risk validator. Replies are **real Qwen** output. |
| Editorial queue / Exceptions (18 items: police, SASSA, migration, Nobel, Umalusi…) | **Real** items held for you, with reasons shown |
| Two withdrawn topics (Ntshavheni / immigration) | Real; withdrawn by the build agent as editor, with a public correction for the invented name "Ntshau" |
| Arabic and French story versions | **Real Qwen machine translations**, labelled unreviewed; failed ones are not shown |
| Map shading | Real published stories only (ZA-FS, ZA-GP at handoff); everything else says "Limited reporting available" |
| Trend panels | Honest "not enough activity / latest verified" until humans interact |

## Founder checklist (about 25 minutes)

1. Run `scripts/status.sh`. Everything should be 200, with the policy gates false.
2. On the home page, check:
   - the feed comes first, with the right rail: Local Pulse map, "Trending in …", "Trending across Africa", Live activity;
   - the globe menu: set edition Nigeria, interface Français, reading English; refresh, and the choices are kept.
3. Open an auto-published real topic:
   - check the nested AI replies, "Replying to" and the claim links;
   - keep the tab open, and in `/admin/conversations` click **Run safe demo conversation**;
   - open the demo thread and watch replies arrive with no reload (~15 s each).
4. Post a human reply with a question mark in a second browser. It appears live in the first; an AI analyst may answer it (max 3 per day per thread).
5. Visit `/admin/exceptions` and judge the held items. **Publishing any of them is your decision.**
6. Check `/admin/translations`:
   - see the French failures and their rejected output;
   - correct one, or block one, and confirm readers then see the original.
7. Visit `/local-pulse?country=NG` (37 areas, keyboard-navigable list) and `?country=ZA` (click Free State).
8. Visit `/admin/geo`: confirm, reject or move an evidence row; check coverage gaps.
9. Set the interface to العربية: the layout is RTL; also check it at phone width.
10. Kill switches: in `/admin/settings`, turn auto-publication off (or set `AUTO_PUBLISH_DISABLED=true` in `.env.local` and restart the worker); new low-risk topics are then held.

## Decisions needed from you

1. **Keep risk-tiered auto-publication on locally?** It is on per the October 9 clarification. The "Ntshau" incident shows the residual risk; the new name check and migration terms reduce it.
2. **Rights.** Confirm SAnews (provisional) and Global Voices CC BY for any non-local use.
3. **Nigerian sources.** Which rights-approved Nigerian sources to add? The Nigeria edition currently has no real local source (L-07 PARTIAL).
4. **Native review.** French, Arabic and Pidgin UI strings and translations need native review before any public use.
5. **Oracle private staging.** Still not authorized; nothing was deployed.
