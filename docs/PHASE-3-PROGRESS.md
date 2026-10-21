# Phase 3 progress: the economy engine and the headless simulation

Branch `phase-3-economy-engine`. Spec: Doc 05 v0.4 (gates A to D), Doc 04 v0.5, Doc 06 sections 7.4, 13, 16.2 and 19.

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
- **Simulation** (`economy/sim/`): the ten scenarios, metrics, runner, Gate A to D checks.

## Tuning so far (Doc 05 section 9 step 4; listed in `town/params.py` TUNING with reasons)

crop price 2.00, 1 tool per 40 crops, 10-unit loads at 6 Sora, cart 100, stall 200, decor comfort 60/120 Sora,
working capital 1.5 days, genesis mix 5 stalls / 3 farms / 1 workshop / 2 carts.

## Latest Gate A (rules, 8 scenarios x 3 seeds, 30 days)

Pass: conservation, cheater refused, first job, meal price, playing beats sitting, closure and recovery, thermostat.
Mostly pass: growth band (17/24; Rush +32%), payback lanes (16/24), out of stock (14/24; Drought 7 to 12%).
Fail: profitable share (62 to 100%, gate wants 50 to 80% in every 7-day window), first business in Job squeeze.

## Next

Finish tuning, HTML run report, `sim` CLI, recordings, pytest tests, full runs (10 scenarios x 10 seeds + 180 days),
all suites, PR.

## Tests

Baseline before Phase 3 (main c7cd6ea): pytest 210 passed, 3 skipped.
