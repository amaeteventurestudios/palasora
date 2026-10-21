---
title: "Palasora · Headless Simulation & Validation Plan"
subtitle: "Document 05 · Working draft v0.7 · 21 Oct 2026 · Amaete Umanah"
---

**The answer in one line:** we write the economy once, as plain Python functions with no graphics, inside the existing economy service, run it for thousands of simulated days on a laptop, and only approve it when it passes every gate below. The live service then runs the same functions.

This document turns Documents 02 and 04 into a test we can run. It is the last planning document before code. Numbers come from Document 04 v0.7 and are starting values to tune. Its section 4A balance rules (one payback curve, one money growth target, playing beats sitting) are tested here.

# 1. What the tests must prove

| # | Evidence | Proved by |
|---|---|---|
| 1 | The economy runs without the 3D view. | Every test runs headless; there is no graphics code in the simulation. |
| 2 | Nothing appears from nowhere: no coins, no goods. | Conservation checks on every tick (section 8). |
| 3 | Humans and agents follow the same rules. | One action list and one rule check; a parity test runs the same plays as a human and as an agent. |
| 4 | The town keeps running when players are offline. | The Quiet spell scenario. |
| 5 | Agents are worth what they cost. | AI-planned businesses compared with rules-only ones on the measures in section 7. |
| 6 | Every story is real, not invented drama. | Every story in a morning message must point to a real change in the records. |

# 2. How the code is split

The core is built in Python inside the existing economy service (`economy/`, next to the Pals ledger), not as a separate TypeScript package. Its centre has no outside dependencies. Three things use it:

- **The test runner** (pytest on a laptop): runs scenarios as fast as possible.
- **The economy service:** the live server. Its hourly tick calls the same functions.
- **The 3D client** (later): only reads the results and draws them.

**SpacetimeDB holds only live presence:** who is looking at which plot, walking characters, live construction. It never holds money, goods or ownership, and it is evaluated later.

| Part | Owns | Never does |
|---|---|---|
| **World** | Clock, plots, residents, seeded random numbers | Moves money |
| **Ledger** | Every coin transfer, coin creation and destruction | Decides anything |
| **Goods** | Stock held by each account; production, eating, wear, imports, exports | Sets prices |
| **Market** | Market Hall order book and matching | Creates coins |
| **Business** | Farms, workshops, stalls, delivery: production, wages, upkeep | Acts without a rule check |
| **Civic** | Town Hall budget, civic jobs, grants, the weekly vote; the Harbour | Spends outside its budget |
| **Agents** | Choosing actions: rules, recorded AI or live AI | Changes the records directly |
| **Actions** | The single gate every action from a human or agent passes through | Skips a check |
| **Reports** | Turning recorded events into morning messages and "since you left" items | Invents events |
| **Outbox** | Every event, written in the same transaction as the change, then delivered once to each view (world, feed, notifications, records, reports) | Sends anything during tests |

**The one rule that keeps it honest:** agents and humans can only submit actions. Only the Actions gate can change the records, and only by calling the Ledger and Goods parts.

# 3. The records (data tables)

All money is stored as whole numbers in hundredths of a Sora, so there is never a rounding error.

**Reused from the economy service:** `journal`, `accounts`, `orders` and `trades`, with their history. **New:** goods (`stock`, `goods_log`), plots, deliveries and world events, plus contracts, the event outbox and the J0 candidate violations table.

| Table | Key fields |
|---|---|
| **accounts** (reused) | id, kind (player, house agent, business, Town Hall, Harbour), owner (the platform for every house agent), balance |
| **journal** (reused) | id, tick, from, to, amount, reason, action id, idempotency key |
| **mint** | id, tick, account (Town Hall or Harbour), amount created or destroyed, rule |
| **stock** | account, good (crops, meals, tools, materials), quantity |
| **goods_log** | id, tick, account, good, change, cause (made, eaten, worn, imported, exported, moved) |
| **plots** | id, area, size, owner, building, level |
| **businesses** | id, type, plot, company, price, wage, health colour |
| **companies** | id, founder, shares issued |
| **shares** | company, holder, quantity |
| **jobs** | id, employer, worker, wage, start, end |
| **orders** (reused) | id, account, good, side, price, quantity, status |
| **trades** (reused) | id, buy order, sell order, price, quantity, tick |
| **deliveries** | id, from, to, goods, cart, status |
| **contracts** | id, parties, terms, deliveries due, breaches, status |
| **agents** | id, owner, role, personality, limits, AI budget left today |
| **decisions** | id, agent, tick, mode (rules, recorded, live), prompt hash, chosen actions, reason, cost |
| **actions** | id, actor, type, inputs, result (done or refused), refusal reason |
| **world_events** | id (event id), tick, kind, who, visibility, linked record ids |
| **outbox** | event id, destination, attempts, delivered at, status |
| **violations** (J0) | id, rule, accused (agent or business), evidence refs (journal, action and event ids), opened at, status (candidate) |
| **messages** | id, agent, channel, text, linked event ids, status |
| **votes** | week, options, who asked, ballots, winner |

**Violations at J0:** gate refusals and contract breaches are recorded as candidate violations, with no penalties (Document 06 section 16).

# 4. The hourly tick

Each tick runs the same steps in the same order:

1. **Clock:** advance one hour; daily and weekly jobs run at their set hours.
2. **Arrivals and scenario events:** new players, droughts, cargo ships.
3. **Decide:** each agent picks actions (rules every hour; AI at its planning hour or on a trigger).
4. **Act:** every action passes the gate in a fixed order (by account id), then is applied or refused.
5. **Produce:** farms grow crops, workshops make tools, stalls cook meals, tools wear.
6. **Move:** deliveries progress and arrive.
7. **Trade:** the Market Hall matches orders; residents choose stalls and eat.
8. **Pay:** wages at end of shift, daily upkeep, Town Hall civic pay, Harbour floor-price purchases.
9. **Check:** the conservation checks run; any failure stops the run and saves the tick. Contract breaches are recorded as candidate violations.
10. **Record:** daily metrics, world events (each with its outbox row), and at 07:00 each agent's morning message.

**Same seed, same result.** No real clock, no unseeded random numbers, a fixed processing order, and AI answers treated as recorded inputs. Two runs with the same seed must produce the same fingerprint (a hash of the ledger and stock tables).

# 5. Agents during tests

| Mode | What it does | When we use it |
|---|---|---|
| **Rules** | Fixed rules only | Every run; the baseline |
| **Recorded AI** | Plays back saved AI answers, matched by prompt hash | Repeatable runs with AI decisions |
| **Live AI** | Calls a real model and saves the answer | A small sample of runs, to refresh recordings and measure cost |
| **Mischief** | Tries forbidden actions on purpose | The Cheater scenario |

If a recorded answer is missing, the agent falls back to rules and the run notes it. An AI answer is only a list of proposed actions; it still goes through the gate like anything else. The daily AI budget is enforced by the Agents part, and the cost of every call is written to the decisions table.

# 6. Genesis and scenarios

**Genesis (day 0)**, the same for every scenario:

- 120 plots; the first 20 businesses built and run by business agents.
- 100 house agents: 70 residents, 20 business agents, 10 entrepreneurs.
- Starting balances from the Town Hall: 100 Sora per resident (10 days of meals), 200 working capital per business, 300 per entrepreneur. Every coin is recorded in the mint table.
- Starting stock: 3 days of crops and tools.
- The Town Hall civic job is always open at 20 Sora a day.

| # | Scenario | What changes | What it mainly checks |
|---|---|---|---|
| 1 | **Baseline** | Nothing | All gates |
| 2 | **Drought** | Farm output halves on days 8 to 14 | Prices rise and recover; no collapse |
| 3 | **Rush** | 10 new food stalls open on day 10 | Some close, owners recover |
| 4 | **Rich arrivals** | 20 Founder Pass players on day 5 (a prime plot each, no coins) | Prices stay sane; no takeover |
| 5 | **Cheater** | A mischief agent tries self-trades, over-limit spending, fake goods | Every attempt refused and logged |
| 6 | **Quiet spell** | All players silent days 15 to 17 | The town keeps running |
| 7 | **Growth** | 500 players join over 2 weeks | Jobs, food and money keep up |
| 8 | **Job squeeze** | 50 players join on one day | Everyone has a job within 1 game day |
| 9 | **Price shock** | Material import prices rise 50% on days 10 to 16 | Old buildings and incomes don't jump; payback lanes hold |
| 10 | **Sitter** | One agent holds 2,000 Sora and does nothing; another runs a business with the same money | Playing beats sitting |

Each scenario runs for 30 days on 10 seeds: 100 runs, 3,000 simulated days. A longer 180-day baseline run checks slow drifts.

# 7. What we measure

| Measure | Definition |
|---|---|
| Coin conservation | Coins held = coins created − coins destroyed, every tick |
| Goods conservation | Stock = made + imported − eaten − worn − exported, every tick, per good |
| Money supply growth | Sora per active resident, change per month, against the 20% a year target (band 15 to 25%) |
| Issuance thermostat | Town Hall weekly budget against measured growth; weeks above or below the band |
| Payback by business | Build cost ÷ median daily profit over 7 days, per business type, against its lane (Document 04 Rule 1) |
| Active against passive | Sora a day from holding money or rent, against the median business run with the same money |
| Meal price stability | Daily average meal price against its 7-day average |
| Profitable businesses | Share profitable over each 7-day window |
| Closures and recovery | Businesses closed; days until the owner earns again |
| Time to first business | Days from arrival to owning a business, worker path |
| Time to first job | Hours from arrival to a paid job |
| Out of stock | Business-hours with no crops or tools |
| Agent value | AI-planned against rules-only: profit, days to recover from a shock, cost per call, owner override rate, decisions reversed within 3 days |
| AI and message cost | Calls, tokens and messages per agent per day, in dollars |
| Real stories | Share of morning-message stories linked to real records (must be 100%) |
| Quiet mornings | Share of mornings with nothing worth saying (fine, but not most) |
| Run speed | Simulated days per minute on a laptop |

# 8. Pass or fail gates

**Gate A, the core (rules only).** Baseline, Drought, Rush, Cheater, Quiet spell, Job squeeze, Price shock and Sitter, all seeds:

- Both conservation checks hold on every tick of every run.
- Same seed gives the same fingerprint.
- Every Cheater attempt is refused.
- Sora per active resident grows within 15 to 25% a year, measured monthly after the first 2 weeks (on the 180-day run, the whole run sits in the band).
- No two weeks in a row above the band: the issuance thermostat pulls growth back.
- Every business type's payback sits in its lane, within half a lane either side, unless marked as beside the curve (tight lane 4 to 10 days, so 1 to 13 with the margin; Document 04 v0.6).
- Playing beats sitting: in the Sitter scenario, and across all runs, holding money or rent earns less per day than the median business with the same money.
- Price shock: no building, rent or income already owned rises in value by more than the shock itself.
- Meal price within ±25% of its 7-day average after week 1.
- 50 to 90% of businesses profitable in any 7-day window from day 7 on (the town's first week is left out); at least one closure and recovery per 30-day run.
- First business in 5 to 10 days on the worker path; first job within 1 game day.
- Out of stock under 5% of business-hours.

**Gate B, agents.** All scenarios with recorded AI:

- AI-planned businesses beat rules-only ones on profit and recovery time, with no worse closure rate.
- No agent stuck losing money for 3 days without changing something.
- The parity test passes: the same plays give the same results whether a human or an agent submits them.

**Gate C, reports.** Every morning message:

- Every story links to real records.
- At least one real event per player's agent on most mornings; quiet mornings are allowed and are not padded.

**Gate D, cost.** Live AI sample runs:

- AI and message cost per active player stays under our budget (proposed: $1 a month for free players, to confirm).

**Gate E, the live service matches the headless run.** The Baseline run on the live economy service produces the same fingerprint as the laptop run.

**Gate F, the platform** (Document 06 sections 13 and 19):

- The Pals to Sora migration fingerprints match, before and after.
- The observer rule is gone: people can post, reply and vote.
- No news code remains.
- Every event is delivered exactly once to each view; repeats from the relay are ignored.

The economic model is approved for building the 3D town only when gates A to F all pass. Any failure goes back to Document 04, the numbers change, and every gate runs again.

# 9. How we run it

1. Build the core and Gate A with rules-only agents.
2. Add the run report: one HTML page per run with charts of prices, money, jobs and closures, plus the event log. It includes the payback curve (every business type against its lane), money growth against the target, and a leaderboard sorted three ways (fastest to pay back, most Sora a day, cheapest to start). The same charts become the public Economy notes when a change ships.
3. Add recorded and live AI; run Gates B, C and D.
4. Tune Document 04's numbers until every gate passes. Any later balance change repeats steps 1 to 4 before it goes live, and ships with Economy notes showing before and after.
5. Run the Baseline on the live economy service; run Gate E. Run Gate F alongside the migration and the news removal.
6. Freeze the numbers as Document 04 v1.0 and start the 3D greybox.

Each run is one command, for example `sim run --scenario drought --seed 3 --days 30`, and `sim gates` runs everything and prints pass or fail per gate.

# 10. Open source we use (the 80%)

| Need | Choice | Licence |
|---|---|---|
| Live server and database | The existing Python economy service | Ours |
| Live presence only (later, evaluated) | SpacetimeDB | BSL 1.1, our approved exception |
| Tests and property tests | pytest, Hypothesis (test-only) | MIT, MPL-2.0 |
| Seeded random numbers | Python's plain seeded `random` | Python standard library |
| Order book matching | The economy service's existing matching engine | Ours |
| AI calls | The existing OpenRouter writer and spend ledger | Ours |
| Run report charts | uPlot | MIT |

**What we write ourselves (the 20%):** the tick, the rules, the Actions gate, the agents' rules and prompts, the scenarios, the metrics and the gates.

# 11. Not in this plan

The 3D town, real WhatsApp or Telegram sending, payments, the public exchange, new districts and other towns, and the weekly vote's request collection from social channels. The vote itself runs, using test requests.

# 12. Defaults used until you decide

| Open question (Document 04) | Default for the tests |
|---|---|
| Businesses per player before the exchange | Up to 3 |
| Rent in v0.1 | No |
| Harbour floor price | 60% of the reference price, with a daily cap; tested at 40% and 80% too |
| AI budget for free players | 1 plan a day plus up to 3 event calls |

# 13. Changes in v0.2

Applied from the approved amendments, following Document 06 v0.2:

- **2. How the code is split:** the core is built in Python inside the existing economy service, not as a separate TypeScript package.
- **2 and 8:** SpacetimeDB holds only live presence. Gate E is now "the live service matches the headless run".
- **3. Records:** `journal`, `accounts`, `orders` and `trades` are reused from the economy service; goods, stock, plots, deliveries and world events are added.
- **3. Records:** added the event outbox and the J0 candidate violations table, plus contracts (Document 04 v0.3).
- **8. Gates:** added Gate F: migration fingerprints match; the observer rule is gone; no news code remains; events delivered exactly once to each view.
- **10. Open source:** Vitest, fast-check and pure-rand are replaced by pytest and Hypothesis (MPL-2.0, test-only) and plain seeded `random`. The order book and AI calls now use what the economy service already has.
- The "News" part and Gate C are renamed "Reports". There is no real-world news anywhere.

# 14. Changes in v0.3

**Why:** user decision, 21 Oct 2026. The world is no longer floating islands. It is a grounded, Meadowvale-style town, a little futuristic (Document 03 v0.4, Document 06 v0.3).

- "Island" becomes "town" in the evidence table, the Quiet spell scenario, the approval line and what is not in this plan. District islands become new districts and other towns.
- **4. The tick:** cargo ships replace airships as scenario arrivals.
- Document 04 is now v0.4. Its numbers are unchanged.
- **Unchanged:** the Python core inside the economy service, SpacetimeDB for presence only, the records, the tick, the scenarios, and Gates A to F.

# 15. Changes in v0.4

**Why:** user decision, 21 Oct 2026, after studying how a live player-run city economy fixed its inflation. Its one-day untested rebalance closed shops across the game; this plan makes sure every balance change passes the simulation first.

- **6. Scenarios:** added Price shock and Sitter (100 runs, 3,000 simulated days).
- **7. Measures:** money growth per resident against the target, the issuance thermostat, payback by business, and active against passive income.
- **8. Gate A:** money growth within 15 to 25% a year per resident (replacing "population plus 5% a month"), the thermostat holds, every business on its payback lane, playing beats sitting, and no windfall from a price shock.
- **9. How we run it:** the run report shows the payback curve, growth against the target and a three-way leaderboard; the same charts become the public Economy notes; every later balance change reruns the gates first.
- **Unchanged:** the Python core inside the economy service, the records, the tick, Gates B to F.

# 16. Changes in v0.5

**Why:** owner decision, 21 Oct 2026, after the first full run of the gates (Phase 3).

- **Gate A:** the tight payback lane is 4 to 10 days (Document 04 v0.6), so with half a lane either side a stall or cart passes between 1 and 13 days. No other gate threshold changed.
- **Scenarios:** new players also get the starter grant (80 Sora, once per person, paid after 5 days from the Town Hall's weekly budget), and new stalls are placed in the street with the most room (Document 04 v0.6).
- **Unchanged:** every other gate, scenario and measure.

# 17. Changes in v0.6

**Why:** owner decision, 21 Oct 2026, after the second full run of the gates (Phase 3).

- **Gate A, profitable share:** the town's first week is left out; the check covers 7-day windows that start on day 7 or later. In the first week every genesis business opens stocked, with no rivals yet, so every run was 100% profitable there by construction. That said nothing about the balance of the economy. The 50 to 80% band itself is unchanged.
- **Scenarios:** each new player's starter grant falls due on a seeded day between 5 and 9 days after arrival, not all on day 5, so a crowd that arrives together (Job squeeze) does not open all its stalls on the same day.
- **Unchanged:** every other gate threshold, scenario and measure.

# 18. Changes in v0.7

**Why:** owner decision, 21 Oct 2026, after the Phase 3 tuning rounds.

- **Gate A, profitable share:** the band is now 50 to 90% (was 50 to 80%). Losing shops close fast (an owner shuts a business after days of losses or a week far slower than its lane), so the businesses still trading in any week are mostly profitable. Even with more newcomers, most weeks sat above 80%.
- **Unchanged:** every other gate threshold, scenario and measure.
