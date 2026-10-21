# Phase 3 report: the economy engine and the headless simulation

Branch `phase-3-economy-engine`, PR #5. Spec: Doc 04 v0.7, Doc 05 v0.7, Doc 06 sections 7.4, 13, 16.2 and 19.
Progress notes: `docs/PHASE-3-PROGRESS.md`. Evidence: `docs/evidence/phase-3/`.

## What was built

- **Town engine** (`services/editorial/palavva_editorial/economy/town/`): the hourly tick and one Actions gate for
  humans and agents, with refusal codes and a daily cap.
  - Goods are conserved and checked every tick.
  - Businesses and trade: delivery carts, the four businesses, the Harbour (floor 60%), the Market Hall (self-trade
    rejected), and contracts (a breach makes a J0 candidate).
  - The Town Hall: civic wage, pro-rata valve, recycling with carry, the thermostat, and the 80 Sora starter grant
    (once per person, 5 to 9 days after arrival, from the weekly budget).
  - Also: an exactly-once outbox, morning reports with linked stories, rules/AI/mischief agents, and genesis.
- **Simulation** (`economy/sim/`, `scripts/sim run|gates|record`): the ten scenarios, metrics, Gate A to D checks and
  self-contained HTML run reports.
- **Tests**: `tests/test_phase3_town.py` (22 tests).

## Owner decisions applied

1. The tight payback lane is 4 to 10 days.
2. Starter grant of 80 Sora, once per person, from the Town Hall's weekly budget, due 5 to 9 days after arrival.
3. New stalls go to the street with the most room.
4. Profitable share leaves out the town's first week.
5. Profitable-share band is 50 to 90%.
6. One tuning round (in TUNING with reasons):
   - 2 days between newcomers in a trade.
   - A trade has room at or under its lane's middle.
   - A first stall waits 1 day for room.
   - Stall stock buffer kept at 1.2x + 3.

## Final gates (10 scenarios x 10 seeds x 30 days, plus a 180-day Baseline)

| Gate | Result | Key numbers |
|---|---|---|
| A | fail | conservation, determinism, cheater, growth (80/80; +19.8 to +20.0% over 180 days), thermostat, meal price, no windfall, closure and recovery, first job: pass. Five checks fail (below). |
| B | fail | AI 64.25 Sora a day against rules 36.42; recovery equal; closures 68.3% against 59.0%; no stuck agents; 0 fallbacks |
| C | pass | every story linked; at least 62% of mornings with a real event; no padded mornings |
| D | blocked | estimate $0.009 a player a month; no live sample (no key) |

## Follow-ups

1. **Profitable share (79/80 runs fail).** Even from day 7 and with the 50 to 90% band, every run has weeks above
   90%. The median run has 47% of its weeks above 90% and 18% at 100%. Closures remove losers faster than newcomers
   arrive.
2. **Payback lanes (26/80 runs fail).** In lane: stall 53/62 runs (median 4.5 days), farm 63/80 (median 7.3), delivery
   72/80 (median 6.7), workshop 80/80 (median 1.4).
3. **Out of stock (23/80 runs fail).** Median 4.3% of business-hours, worst 13.7%. Failing runs: Price shock 6,
   Sitter 6, Job squeeze 4, Cheater 3, Quiet spell 2, Baseline 1, Rush 1.
4. **Playing beats sitting (9/80 runs fail, all Job squeeze).** 50 players arriving on one day open about 69 stalls.
   The median business loses 1% of its cost a day.
5. **First business (1/80 runs fail).** Sitter seed 2 has a median of 4 days.
6. **Gate B closure rate.** AI-planned businesses close more often (68.3% against 59.0%). These are fixture answers.
7. **Blocked: Gate B with a real model** needs an OpenRouter key (recordings, under the $5 cap).
8. **Blocked: Gate D live sample** needs an OpenRouter key.

## Tests (final code)

- tsc: clean.
- vitest: 146 passed.
- pytest: 232 passed, 3 skipped (baseline before Phase 3: 210 passed, 3 skipped).
- Playwright (last run; no web code changed after it): 150 passed, 5 skipped. 2 failed (v18 ISSUE-24 and ISSUE-28,
  failing before Phase 3) and 1 did not run (ISSUE-23).
