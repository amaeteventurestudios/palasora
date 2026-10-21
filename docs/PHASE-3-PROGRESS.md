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
- **Simulation** (`economy/sim/`): the ten scenarios, metrics, runner, Gate A to D checks, self-contained HTML run
  reports (uPlot vendored, MIT), and the `scripts/sim` command (`run`, `gates`, `record`).
- **AI recordings** (`town/recordings/plans-v1.json`): 1,944 answers from the deterministic fixture planner (no
  OpenRouter key here). Recorded runs replay them with no fallbacks.
- **Tests**: `tests/test_phase3_town.py` (19 tests).

## Tuning (Doc 05 section 9 step 4; listed in `town/params.py` TUNING with reasons)

crop price 2.00, 1 tool per 40 crops, 10-unit loads at 6 Sora, cart 100, stall 200, decor comfort 60/120 Sora,
working capital 1.5 days, genesis mix 5 stalls / 3 farms / 1 workshop / 2 carts.

## Gates (final code: 10 scenarios x 10 seeds x 30 days, plus a 180-day Baseline; `docs/evidence/phase-3/`)

- **A, fail.** Pass: conservation, determinism, cheater refused (every trick, every seed), growth band (80/80, and
  +19.9 to +20.0% in every 30-day window over 180 days), thermostat, meal price, no windfall, playing beats sitting,
  closure and recovery, first job. Fail: profitable share 80/80 runs (58 to 79% at worst, but 100% in some week of
  every run), payback lanes 35/80 (stall on-curve median 15.5 days against 2 to 4), first business 14/80 (all 10
  Job squeeze, 4 Sitter), out of stock 14/80 (7 Drought, 5 Sitter).
- **B, fail.** AI-planned 64.83 Sora a day against rules 41.51 (house businesses, same trade mix); recovery equal;
  closures 65.6% against 52.3% (fail); no stuck agents; recordings cover every prompt.
- **C, pass.** Every story links records; at least 73% of mornings carry a real event; no padded quiet mornings.
- **D, blocked.** Estimate $0.009 a player a month; no live sample (no key).
- Harbour floor at 40/60/80% (12 runs each): out of stock median 2.2/1.8/1.3%, payback in lane 7/8/8 of 12,
  growth unchanged. Kept at 60%.

## Tests (final code)

tsc clean; vitest 146 passed; pytest 229 passed, 3 skipped (baseline 210 passed, 3 skipped); Playwright 150 passed, 2 failed (v18 ISSUE-24 and ISSUE-28, known before Phase 3), 1 did not run (ISSUE-23), 5 skipped.

## Next

Owner decisions listed in the PR.
