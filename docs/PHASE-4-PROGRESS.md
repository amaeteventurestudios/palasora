# Phase 4 progress: town events in the feed, notifications and reports

Branch `claude/project-thread-410plq`. Spec: Doc 06 sections 5, 13, 14 and 19; handoff `docs/handoffs/PHASE-4-HANDOFF.md`.

## Done

- **Relay consumers** (`economy/town/social.py`): `feed`, `notifications`, `world` (live SSE via `thread_events`) and
  `profile` (place SubPals), beside the Phase 3 `records` and `report`. Each stores its receipt in economy.db, and every
  PocketBase write is also keyed by the event id (unique indexes), so a repeat after a crash changes nothing.
- **Held list**: `events.held()`, `events.retry_held()`, `events.outbox_counts()`; API `/economy/admin/town/outbox` and
  `/economy/admin/town/outbox/retry`.
- **Withdrawal**: `events.withdraw()` marks the event and writes an `event_withdrawn` event through the same views: the
  post is retracted, notifications removed, a `town_event_withdrawn` live event sent, reports leave it out.
- **PocketBase** (`1761100000_palasora_town_events.js`): `town_events` collection; `town_event` piece kind, author type
  and publish path; `town_event_id` and `feed_scope` on pieces; notification and live-event types; `place_kind` and
  `town_id` on communities; `source` on follows.
- **Gate** (`pb_hooks/lib/gate.js`, path 3c): a `town_event` post publishes only through `system:town-relay`, with a
  linked `town_events` record that is public and live, and a `town_event` moderation decision. `town_event_id` is
  immutable once set (`integrity.pb.js`).
- **Reports**: `reports.rank()` (fixed importance per kind, then newest), `reports.away()` ("while you were away"),
  morning stories ranked the same way; withdrawn events left out; `verify()` also counts duplicates.
- **Worker**: one relay pass every 10 s when the outbox has pending rows (`TOWN_RELAY_ENABLED`, `PALASORA_TOWN_TENANT`).
- **Tests**: `tests/test_phase4_town_events.py` (11, against a real PocketBase with the production hooks).

## Next

- Web: feed card label and main-feed scope, town record page (live numbers), notifications icon and "while you were
  away", Command Center held list.
- Full suite re-run, Playwright, `scripts/sim gates` (Gate C), PR.
