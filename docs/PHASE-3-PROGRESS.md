# Phase 3 progress: the economy engine and the headless simulation

Branch `phase-3-economy-engine`. Spec: Doc 05 v0.6 (gates A to D), Doc 04 v0.7, Doc 06 sections 7.4, 13, 16.2 and 19.

## Done

- **Records** (`economy/db.py`, schema 3): stock and goods log, plots, town agents, businesses, jobs, goods orders and
  trades, contracts, deliveries, agent decisions, actions, world events with outbox rows in the same transaction, event
  receipts, J0 candidate violations, morning messages, votes, town metrics, growth weeks. Seeded clock (`db.clock`).
- **Town engine** (`economy/town/`): the hourly tick in Doc 05 order; the Actions gate (one door for humans and agents,
  refusal codes, daily cap, approvals); goods with conservation; delivery carts; the four businesses; the Harbour
  (imports, floor at 60% against the budget); the Market Hall (reservation first, price-time, self-trade rejected);
  contracts (pay on dispatch, breach makes a J0 candidate violation); the Town Hall (civic wage, pro-rata valve,
  recycling, carry, thermostat); outbox and relay (exactly once, retry, held after 5); morning reports with linked
  stories; rules agents, fixture/recorded/live AI planners, mischief agent; genesis; per-tick conservation checks.
- **Issuance** (`economy/issuance.py`): weekly budget = growth part x thermostat + Sora destroyed this week + carry of
  destroyed Sora not yet reissued; population rules excluded; thermostat records per week.
- **Simulation** (`economy/sim/`): the ten scenarios, metrics, runner, Gate A to D checks, self-contained HTML run
  reports (uPlot vendored, MIT), and the `scripts/sim` command (`run`, `gates`, `record`).
- **AI recordings** (`town/recordings/plans-v1.json`): 1,944 answers from the deterministic fixture planner (no
  OpenRouter key here). Recorded runs replay them with no fallbacks.
- **Tests**: `tests/test_phase3_town.py` (19 tests).

## Tuning (Doc 05 section 9 step 4; listed in `town/params.py` TUNING with reasons)

crop price 2.00, 1 tool per 40 crops, 10-unit loads at 6 Sora, cart 100, stall 200, decor comfort 60/120 Sora,
working capital 1.5 days, genesis mix 5 stalls / 3 farms / 1 workshop / 2 carts.

## Owner decisions applied (after the first full gate run)

1. Tight payback lane widened to 4 to 10 days (Doc 04 v0.7, Doc 05 v0.5). No other gate threshold changed.
2. Starter grant: 80 Sora, once per person (keyed by the person), paid by the Town Hall 5 days after arrival from the
   weekly issuance budget (counts against it), before the day's civic wages. 80 is the float a first stall needs on
   top of the 200 arrival grant. Paid on arrival or at 100 Sora, it put first businesses at a median of 1 day.
3. New stalls are placed on the free plot with the most residents nearby for each stall already in its street.
4. Starter grants are spread: each person's falls due on a seeded day 5 to 9 days after arrival.
5. Profitable share leaves out the town's first week (windows from day 7; Doc 05 v0.6). The band is unchanged.
6. One tuning round (TUNING in `town/params.py`):
   - 2 days between newcomers in a trade (was 5).
   - A trade has room while its payback is at or under the lane's middle (no shortage needed).
   - A player's first stall waits up to 3 days for room.
   - Stall stock buffer kept at 1.2x + 3: 1.4x + 5 and 1.1x + 2 were both worse.
   - Players who start with a scenario endowment (Sitter's runner) are left off the worker path for first business.

## Gates (final code: 10 scenarios x 10 seeds x 30 days, plus a 180-day Baseline; `docs/evidence/phase-3/`)

- **A, fail.**
  - Pass: conservation, determinism, every cheat refused, growth band (80/80; +19.8 to +20.0% in every 30-day window
    over 180 days), thermostat, meal price, no windfall, closure and recovery, first job.
  - Payback lanes: 19/80 fail (was 27). Stall on-curve median 5.8 days, 51 of 58 runs in lane.
  - Out of stock: 12/80 fail (was 14): 6 Sitter, 2 Cheater, 2 Job squeeze, 1 Drought, 1 Rush.
  - First business: 11/80 fail (was 5). The 3-day wait pushes the median to 10.5 to 12 days: 7 Job squeeze,
    2 Cheater, 2 Quiet spell.
  - Playing beats sitting: 10/80 fail, all Job squeeze (median business still -1% of its cost a day).
  - Profitable share: 80/80 fail. From day 7, the median run has 82% of its weeks above 80% profitable (was 71%).
    More entry did not hold more businesses at the margin.
- **B, fail.** AI-planned 64.39 Sora a day against rules 36.30; recovery equal; closures 64.8% against 55.3% (fail);
  no stuck agents; recordings cover every prompt. Fixture planner only: Gate B with a real model is blocked (no key).
- **C, pass.** Every story links records; at least 57% of mornings carry a real event; no padded quiet mornings.
- **D, blocked.** Estimate $0.009 a player a month; no live sample (no key).

## Tests (final code)

tsc clean; vitest 146 passed; pytest 232 passed, 3 skipped (baseline 210 passed, 3 skipped). Playwright (before the
owner decisions, no web code changed since): 150 passed, 2 failed (v18 ISSUE-24 and ISSUE-28, known before Phase 3),
1 did not run (ISSUE-23), 5 skipped.

## Next

Owner decisions listed in the PR.
