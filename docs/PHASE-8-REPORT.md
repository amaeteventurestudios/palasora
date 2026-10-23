# Phase 8: the town runs on its own

The live economy service now runs the same hourly tick as the headless simulation, with one town in memory, on the real clock. One game day is one real day (Doc 04 section 1). The town's hour follows the real hour in `TOWN_TIMEZONE`, which defaults to Africa/Lagos.

## How it works
- `economy/town/live.py`:
  - `found(seed)` runs genesis once, on a clean ledger that is already in Sora, and sets the clock to start at today's midnight.
  - `advance()` runs every hour that is due, up to 48 per call, so a long outage catches up in steps.
  - Each hour commits together with a snapshot of the in-memory world: agents, businesses, random-number states and the conservation checker. A restart carries on exactly where it stopped. The last 48 snapshots are kept, about 160 KB each.
- The worker calls `advance()` every 10 seconds, but only when `TOWN_LIVE_ENABLED=true`. It is off by default.
- A second process can never run the same hour. The snapshot write checks the stored hour inside the tick's transaction and rolls back if another process got there first.
- A failed conservation check pauses the town and does not retry. Run `live resume` after looking into it.
- `GET /economy/town/live` shows the tick, how far it is behind, and any pause. `run_tick` takes a `before_commit` hook. Restoring also refills `w.at_auction`.
- With the town running live, the requests people send are applied at the next real hour: moving in, carts, plots, bids, building, and the business-card controls.

## Gate E
`tests/test_phase8_live.py` founds the town, then restores from the stored snapshot before every advance. After three days it ends on the same ledger fingerprint as the headless Baseline run (seed 5). The same file covers:
- catch-up
- never running an hour twice
- requests applied by the live hour
- the pause on a failed check
- refusing to found twice

A 30-day soak ran 720 hours at about 7 ms per hour, with no pause.

## Going live (needs the owner's go)
1. Run the Pals to Sora migration on the real ledger. `found` refuses while Pals remain.
2. `python -m palavva_editorial.economy.town.live found --seed <n>`
3. Set `TOWN_LIVE_ENABLED=true` for the worker and restart it.
4. `python -m palavva_editorial.economy.town.live status`

Nothing here was run against real data.
