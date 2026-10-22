# Phase 4 report: town events in the feed, notifications and reports

Branch `claude/project-thread-410plq`. Spec: Doc 06 sections 5, 13, 14 and 19; handoff `docs/handoffs/PHASE-4-HANDOFF.md`.
Progress notes: `docs/PHASE-4-PROGRESS.md`. Evidence: `docs/evidence/phase-4/`.

## Gate: every story links to a record, and there are no duplicates — PASS

- Every `town_event` post publishes only through the gate path `system:town-relay`, which requires a linked
  `town_events` record that is public and live (`pb_hooks/lib/gate.js`, path 3c). Any other reviewer is refused.
- Gate C (simulation, 10 scenarios x 10 seeds plus the 180-day Baseline): 301,340 stories in 292,840 morning messages,
  every one checked against the journal and events; 0 padded mornings; **0 duplicates** (new check).
- Integration test: every public event of a 6-day seeded town appears in the feed exactly once; after a simulated
  crash (receipts lost, outbox rows pending again) the relay re-runs and nothing is posted, streamed or notified twice.

## What was built

- **Relay consumers** (`economy/town/social.py`): `feed`, `notifications`, `world` (live updates on the existing
  `thread_events` log, so SSE and `events/replay` carry them) and `profile` (place SubPals). Applied once on both
  sides: receipts in economy.db, plus unique indexes keyed by the event id in PocketBase. The worker runs a pass every
  10 seconds when the outbox has pending rows.
- **Held list**: failed deliveries are held after 5 tries. Command Center page `/admin/town` shows deliveries by view,
  the held list with Retry, and a Withdraw form (audited).
- **Withdrawal**: an event is marked withdrawn (never deleted) and an `event_withdrawn` event follows the same views:
  the post is retracted with the public reason, notifications are removed, a live withdrawal event is sent, reports
  leave it out. The feed cache (5 s) drops it.
- **Visibility**: public events only reach the feed and the public stream; owner, town and staff events never do (the
  relay skips them and the gate refuses them). Owner and town events reach notifications for the people they are about.
- **No second truth**: PocketBase stores the event id, display text and id-only refs. The record page
  `/town/event/[id]` reads the business, contract or vote numbers live from the economy service.
- **Notifications**: only linked people named in an event (or owning a business named in it) are told.
- **While you were away**: on `/notifications`, built from stored events, the person's own first, then town news;
  most important, then newest; a quiet stretch says so. Morning reports use the same ranking. No AI call.
- **Place SubPals**: the town gets SubPal `p/first-town` (`place_kind='town'`). Arriving with a home plot, opening or
  buying a business joins you: people follow it, their agents become members (`source='plot'`). Topic SubPals stay.
- **Translation**: town posts are ordinary pieces (`language='en'`), so the existing on-demand pipeline translates them.

## Defaults chosen (changeable)

1. The first town is called **First Town** (`first-town`) until it is named.
2. "Public enough" for the main feed: business opened, closed or sold, and the weekly vote. Other public events (an
   arrival) stay in the town's SubPal.
3. Town-only live updates wait for the world viewer (phase 6); the public stream carries public events only.
4. "While you were away" looks back 48 town hours (full "since you left" with markers comes in phase 6).
5. Notification and report text is translated in phase 6 with the cards and menus; posts are translated now.
6. Residents are linked to accounts with `POST /economy/town/links`; the world viewer will call it on arrival.

## Tests (final code)

- tsc: clean.
- vitest: 150 passed (146 before; +4 in `tests/unit/phase4.test.ts`).
- pytest: 243 passed, 3 skipped (232 before; +11 in `tests/test_phase4_town_events.py`, real PocketBase with hooks).
- Playwright: 156 passed, 5 skipped (150 before; +6 in `tests/e2e/phase4.spec.ts`). 2 failed and 1 did not run are the
  known v18 ISSUE-24 and ISSUE-28 sign-up timeouts and ISSUE-23. `v14 UI-06` now expects 14 SubPals (13 topic + town).
- Simulation: Gate C pass (with the new no-duplicates check). Gates A, B and D are unchanged from Phase 3
  (same balance follow-ups; Gate D still needs an OpenRouter key).
