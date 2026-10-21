---
title: "Palasora · Economy & AI Agent Simulation Specification"
subtitle: "Document 04 · Working draft v0.7 · 21 Oct 2026 · Amaete Umanah"
---

**The answer in one line:** one town, one coin (the Sora), four businesses that need each other, and one set of rules that humans and agents both follow. Every coin and every good has a recorded source, so the headless simulation can prove the economy works before anyone sees it.

All numbers below are **starting values to tune**, not final prices. The headless simulation exists to change them.

# 1. The world being simulated

- **One coin, Sora.** Sora is the migrated Pals ledger from the existing economy service, not a new ledger. Its history is kept, and every balance converts once at 1 Pal = 1 Sora (Document 06 section 7).
- **One town** (the first town, grounded on the coast) with about 120 plots: homes, the four starter businesses, the Market Hall, the Harbour and the Town Hall.
- **Time:** one game day is one real day, so the morning message matches real mornings. The simulation runs in hourly ticks, and the headless test runs them as fast as it can.
- **Population at the start:** 100 house agents, drawn from the existing 27,060 agents (see section 6). Players join on top of them.

# 2. Goods and the four starter businesses

| Business | Buys | Makes or sells | Needs | Starting cost to build |
|---|---|---|---|---|
| **Farm** | Tools (they wear out) | **Crops**: 40 a day per worker | 1 tool per 100 crops | 400 Sora |
| **Workshop** | **Materials** (imported at the Harbour) | **Tools**: 1 material plus work makes 1 tool | Workers | 500 Sora |
| **Food stall** | Crops | **Meals** to residents: up to 60 a day per worker | 1 crop per meal | 300 Sora |
| **Delivery** | Nothing | **Moves goods** between businesses | A cart and a driver | 250 Sora |

Goods only arrive when delivered. An owner can fetch goods themselves, but slowly. That keeps delivery a real business.

**Demand:** every resident, human or agent, eats 2 meals a day. Each resident picks a stall by price, distance and rating, with a little randomness, so the best stall never wins everyone.

# 3. Starting values

| Item | Starting value |
|---|---|
| New player's grant | 200 Sora |
| Starter grant (once per person, due 5 to 9 days after arrival, from the Town Hall's weekly budget) | 80 Sora |
| Reference meal price | 5 Sora |
| Reference crop price | 1.5 Sora |
| Reference tool price | 20 Sora |
| Material import price (fixed by the Harbour) | 8 Sora |
| Reference wage | 25 Sora a day |
| Delivery fee | 3 Sora a load (up to 20 units) |
| Plot upkeep | 2 Sora a day |
| Civic job wage (Town Hall, always open) | 20 Sora a day |
| House agents' starting balances (from the Town Hall) | 100 Sora per resident, 200 per business, 300 per entrepreneur |
| Workers per business | Owner plus up to 2 at level 1, more per level |

**Sanity check:** a worker earns 25 a day and eats 10, so they save 15. With the 200 grant, a first stall is about a week away. The starter grant, due 5 to 9 days after arrival, covers the stall's first crops, so a new player can start even when jobs are scarce. A stall selling 40 meals at 5 makes about 100 Sora profit a day after crops, wages, delivery and upkeep, until rivals push prices down.

**No one gets stuck:** if no business is hiring, the Town Hall's civic job is always open at 20 a day, so a worker still saves 10 a day. On day one, house agents eat from their starting balances until the first wages arrive.

# 4. Where money comes from and goes

| Comes in (sources) | Goes out (sinks) |
|---|---|
| New player's grant and house agents' starting balances | Material imports at the Harbour |
| Starter grant (Town Hall, within its weekly budget) | |
| Civic jobs paid by the Town Hall (building the voted project, town upkeep) | Buying plots from the Town Hall |
| The Harbour buying surplus goods at a floor price | Construction and upgrades |
| Social rewards for posts and replies (Town Hall issuance within its weekly budget) | Daily plot upkeep |
| | Cosmetics bought with coins |
| | Exchange fees (later) |

**Only two accounts can create or destroy coins: the Town Hall and the Harbour,** and only through the rules above. They replace the old `platform:issuance` account as the only mints. No coins are sold: the Founder Pass gives a plot, a badge and cosmetics. The Town Hall has a weekly issuance budget, set from the money growth target in section 4A. Everyone else, human or agent, can only move coins they already have.

# 4A. Balance rules: one curve, one growth target

These rules come from a live game that went through this the hard way (a player-run city economy, October 2026). Its NPC income caused heavy inflation. A one-day "pay what the real business earns" rebalance then made running a business the worst use of money, while rent and savings interest grew, and shops closed in a day. It finally fixed the economy with the rules below. We adopt them from the start so we don't repeat that route.

**Rule 1. One payback curve for every way to earn.** Every business and every income is tuned by its payback time: the build cost divided by its normal daily profit at a typical spot. Where it sits depends on what limits how many anyone can own. The tighter the limit, the faster the payback, because a fast payback is cheap when few can have it and ruinous when only money limits it.

| Lane | What limits it | Example | Target payback |
|---|---|---|---|
| **Tight** | One per player | Your first food stall, your own cart | 4 to 10 days |
| **Shared** | Local demand in a district | More stalls, farms, workshops, delivery fleets | 4 to 10 days |
| **Money only** | Nothing but cash | Big builds, upgrades, extra plots | 15 to 40 days |
| **Holding** | Nothing | Savings, rent on buildings already owned | Slower than any business (Rule 3) |

- **Starter targets:** food stall about 6 days, delivery about 5 days, farm 4 to 6 days, workshop 5 to 7 days. The simulation tunes prices and wages until each sits in its lane.
- **Harder setups earn more per Sora:** a setup that needs more play (staff, contracts, a supply chain of its own) earns up to 1.5 times what a place-and-go setup earns for the same money.
- **Some things sit beside the curve, not on it:** a stall in a crowded street (it shares shoppers by design) or a second cart past what one person can run. They are shown, not forced.
- **New stalls go where there is room:** unless the owner picks a plot, a new stall is placed on the free plot with the most residents nearby for each stall already trading in its street.

**Rule 2. One target for how fast money grows.** Added up, every earning decides how fast the town's money grows, and money that grows too fast makes everything people own worth less. The target is **Sora per active resident grows about 20% a year** (allowed band 15 to 25%), and the total supply grows with the population on top. For comparison, long-running online worlds report about 14 to 17% a year.

- The Town Hall's weekly issuance budget is computed from this target. Harbour floor-price buying counts against the same budget.
- If measured growth runs above the band for two weeks, next week's issuance budget shrinks automatically. If it runs below, the budget grows. No one's coins are ever taken back.
- The Command Center shows growth against the target every day.

**Rule 3. Playing beats sitting.** Money that needs no play must never beat running a business.

- **No savings interest in v0.1.** If it is added later, it comes in bands: full rate up to 1,000 Sora, a quarter of the rate from 1,000 to 10,000, and nothing above 10,000 (starting values).
- **Rent (when it arrives) is tied to what the building cost when it was bought,** not to today's price, so a price change never turns old buildings into a windfall.
- **Test:** a resident who only holds savings or rent must earn less per day than one who runs the median business with the same money.

**Rule 4. Every change is tested first, then explained in public.**

- No balance change goes live without passing every scenario in Document 05 on all seeds. There is no "try it on the live town" switch for the whole economy.
- Each change ships with **Economy notes**: a public page that says what changed and why, with before-and-after charts per business. It has a leaderboard of every business sorted three ways (fastest to pay back, most Sora a day, cheapest to start) and money growth against the target. Every number comes from the ledger.

**Later:** a production-chain view showing what each business makes and needs, with live rates, drawn from the goods table. It comes after the Exchange.

# 5. The ledger

- **Double entry:** every transfer records who paid, who received, the amount, the reason and the time.
- **Invariant 1:** total coins held equals coins created minus coins destroyed, checked every tick.
- **Invariant 2:** goods are created only by production and imports, and destroyed only by eating, wear and exports.
- **No negative balances.** There's no debt in v0.1.
- **No self-trading.** An order that would match two accounts with the same owner is rejected.
- **House agents share one owner (the platform) for self-trade checks.** Two house agents can never trade with each other.
- **Money and investments are separate.** Business transactions (buying crops) and ownership transactions (shares) use different record types.

# 6. Residents and agents

| Type | What it does | How it decides | Cost |
|---|---|---|---|
| **Simulated resident** | Works, eats, shops, commutes | Rules only | Nothing beyond the server |
| **Business agent** | Runs a business: restock, price, hire, deliver | Rules every hour, plus 1 AI plan a day | 1 AI call a day |
| **Entrepreneur agent** | Spots gaps, proposes new businesses, negotiates deals | Rules, plus AI when something happens | A few AI calls, only on events |
| **Player's agent** | Any of the above for its owner, within the owner's limits | Same as its role, plus chat with its owner | Its role's cost plus chat |

**The 100 house agents at launch:** 70 residents, 20 business agents running the first 20 businesses, and 10 entrepreneurs. They are drawn from the existing 27,060 agents and keep their personas, memory and relationships; all the others stay social (they post, reply and vote). They carry the visible "house agent" tag. As players arrive, house agents sell businesses to them, hire them, and step back.

**When an agent calls the AI:**

- once a day, to plan (prices within the owner's range, staffing, orders, one suggestion for the owner)
- when an event happens: a rival opens nearby, stock runs out two days running, three days of losses, an offer above the owner's threshold, or the owner sends a message

**AI budget per agent per day:** free agents 1 plan plus events (capped), subscribers more. When the budget runs out, the agent falls back to rules.

# 7. The action list (same for humans and agents)

Every action goes through the same checks: is it allowed by the rules, by the owner's limits, and by the balance?

| Area | Actions |
|---|---|
| Work | apply for a job, quit, hire, fire, set wage |
| Trade | set price, place a buy or sell order at the Market Hall, cancel an order, sign or end a supply contract |
| Property | buy a plot, sell a plot, build, upgrade, close a business |
| Delivery | request a delivery, accept a delivery job |
| Community | make a request, vote, message an owner |
| Ownership | issue shares at founding, transfer shares (only through approved sales), pay dividends |

**Contracts** get a record of their own: the parties, the terms, the deliveries due and any breaches. Business cards show it, and the future civic justice system reads breaches from it (Document 06 sections 10 and 16).

**Owner limits,** set in the agent builder: a daily spending cap, a price range, and which actions need approval. By default, buying land, closing a business, any share action and anything over the daily cap need approval.

# 8. Market Hall and company ownership

- **Market Hall:** an order book for crops, tools and materials, built on the same matching engine the Sora Exchange will use later. Prices come from orders, not from the game. The Harbour sits underneath as the buyer of last resort (floor price) and the seller of materials (fixed price).
- **Founding companies:** the 9 existing companies keep their 10,000 shares, their holders and their listings.
- **New companies:** every new business is a company from day one. The founder holds 1,000 shares. Shares can move only through an approved private sale, paid for with earned coins only.
- **Listing on the Sora Exchange (later):** a new company needs 30 days of operations with revenue, books that balance, and enough independent shareholders. The public exchange opens when enough companies qualify.

# 9. What the headless simulation must prove

| Test | Pass when |
|---|---|
| **Conservation** | Both invariants hold on every tick of every run. |
| **Stable prices** | The average meal price stays within ±25% of its 7-day average after the first week. |
| **Healthy money supply** | Sora per active resident grows within 15 to 25% a year (Rule 2), checked monthly after the first 2 weeks. |
| **On the curve** | Every business's measured payback sits in its lane (Rule 1), within half a lane either side, unless it is marked as beside the curve. |
| **Playing beats sitting** | Holding money or rent never earns more per day than running the median business with the same money (Rule 3). |
| **Winners and losers** | 50 to 80% of businesses are profitable over any 7-day window; at least one closes and the owner recovers in a 30-day run. |
| **Progression** | A new worker can afford a first stall in 5 to 10 days. |
| **Supply** | Crops and tools are out of stock less than 5% of business-hours. |
| **Jobs** | A new player has a paid job within 1 game day. |
| **Agents are worth it** | AI-planned businesses beat rules-only ones on profit and recovery time, at an acceptable cost per AI call and owner override rate; no agent sits stuck for 3 days while losing money. |
| **Something to report** | Every player's agent has at least one real event to report each morning. |
| **Cost** | AI calls and messages per agent per day are measured and stay within budget. |

**Scenarios to run, each 30 days, 10 seeds each:**

1. **Baseline:** 100 house agents.
2. **Drought:** farm output halves for a week.
3. **Rush:** 10 new food stalls open in one day.
4. **Rich arrivals:** 20 players arrive with Founder Passes (a prime plot each, no coins).
5. **Cheater:** an agent tries self-trades and over-limit spending. Every attempt must be rejected.
6. **Quiet spell:** all players go silent for 3 days. The town must keep running.
7. **Growth:** 500 players join over 2 weeks.
8. **Job squeeze:** 50 players join on one day.
9. **Price shock:** material import prices rise 50% for a week. Old buildings and incomes must not jump in value, and payback lanes must hold.
10. **Sitter:** one agent with 2,000 Sora only holds it, while another runs a business with the same money.

Document 05 turns these into runnable tests and pass or fail gates.

# 10. Open questions

- Should a player own more than one business before the exchange opens? (Proposed: yes, up to 3 plots.)
- Should rent exist (owners leasing plots to others) in v0.1, or wait? (Proposed: wait.)
- How strong should the Harbour's floor price be? Too high and it becomes a free money machine; too low and farms go bankrupt in a glut.
- What is the AI budget for free players, in calls per day, once real costs are measured?
- Open orders at migration: cancel them (proposed, releasing reservations) or carry them over?

# 11. Changes in v0.2

- Added the always-open civic job and the house agents' starting balances, both paid by the Town Hall and recorded.
- Added the Jobs test and the Job squeeze scenario.
- Agents are now judged on recovery, cost and overrides as well as profit.

# 12. Changes in v0.3

Applied from the approved amendments, following Document 06 v0.2:

- **1 and 4:** Sora is the migrated Pals ledger, not a new one. The Town Hall and the Harbour replace `platform:issuance` as the only mints.
- **4. Sources:** removed "Founder Pass coins (bought)". Social rewards for posts and replies are Town Hall issuance within its budget.
- **5. Ledger:** house agents share one owner (the platform) for self-trade checks.
- **6. Residents:** the 100 house agents on the first island are drawn from the existing 27,060; all others stay social.
- **7. Actions:** contracts get a record of their own (terms, deliveries due, breaches), used by business cards and civic justice.
- **8. Companies:** the 9 existing companies keep their 10,000 shares and listings as founding companies; new companies follow the 1,000-share and 30-day rules.
- **10. Open questions:** added open orders at migration.

# 13. Changes in v0.4

**Why:** user decision, 21 Oct 2026. The world is no longer floating islands. It is a grounded, Meadowvale-style town, a little futuristic (Document 03 v0.4, Document 06 v0.3).

- **One line, 1, 4 and 9:** the capital island is now the first town. "Island" becomes "town" in the summary, the world, town upkeep and the Quiet spell scenario.
- The Harbour is now a real port with a marina. Its role is unchanged: it imports materials, buys surplus at a floor price, and is one of the two mints with the Town Hall.
- **Unchanged:** every number, one currency Sora, the ledger rules, the 100 house agents drawn from the 27,060, the action list, contracts, the Market Hall, company rules, the tests and scenarios.

# 14. Changes in v0.5

**Why:** user decision, 21 Oct 2026, after studying how a live player-run city economy fixed its inflation.

- **New section 4A, balance rules:** one payback curve with four lanes, a money growth target of about 20% a year per resident (band 15 to 25%) that sets the Town Hall's issuance budget, playing beats sitting (no savings interest in v0.1, banded if added; rent tied to purchase cost), and every change tested first and explained in public Economy notes.
- **4:** the Town Hall's issuance budget now comes from the growth target.
- **9:** the money supply test uses the new target; added the On the curve and Playing beats sitting tests, and the Price shock and Sitter scenarios.
- **Unchanged:** every starting value in section 3, one currency Sora, the two mints, the ledger rules and the action list.

# 15. Changes in v0.6

**Why:** owner decision, 21 Oct 2026, after the first full run of the Phase 3 simulation gates (Document 05).

- **4A, Rule 1:** the tight lane is now 4 to 10 days (was 2 to 4). At 2 to 4 days the first stall and cart were so profitable that the town could not also keep 20 to 50% of its businesses unprofitable in every week (Document 05 Gate A). Starter targets moved to match: food stall about 6 days, delivery about 5.
- **4A, Rule 1:** new stalls are placed in the street with the most room (residents nearby for each stall already there).
- **3 and 4:** new starter grant of 80 Sora, once per person, paid by the Town Hall 5 days after a player arrives. Unlike the new player's grant it counts against the weekly issuance budget, and it is paid before the day's civic wages. It gives a player in a town short of jobs the float for a first stall.
- **Unchanged:** the other starting values, the two mints, the growth target and the other lanes.

# 16. Changes in v0.7

**Why:** owner decision, 21 Oct 2026, after the Phase 3 gate runs.

- **3:** the starter grant falls due on a day between 5 and 9 days after a player arrives, set per person (seeded), not on day 5 for everyone. Players who arrive together then open their first stalls on different days.
- **Unchanged:** the grant's size (80 Sora), once per person, paid from the Town Hall's weekly budget.
