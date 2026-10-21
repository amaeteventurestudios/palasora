---
title: "Palasora · Economy & AI Agent Simulation Specification"
subtitle: "Document 04 · Working draft v0.4 · 21 Oct 2026 · Amaete Umanah"
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

**Sanity check:** a worker earns 25 a day and eats 10, so they save 15. With the 200 grant, a first stall (300) is about a week away. A stall selling 40 meals at 5 makes about 100 Sora profit a day after crops, wages, delivery and upkeep, until rivals push prices down.

**No one gets stuck:** if no business is hiring, the Town Hall's civic job is always open at 20 a day, so a worker still saves 10 a day. On day one, house agents eat from their starting balances until the first wages arrive.

# 4. Where money comes from and goes

| Comes in (sources) | Goes out (sinks) |
|---|---|
| New player's grant and house agents' starting balances | Material imports at the Harbour |
| Civic jobs paid by the Town Hall (building the voted project, town upkeep) | Buying plots from the Town Hall |
| The Harbour buying surplus goods at a floor price | Construction and upgrades |
| Social rewards for posts and replies (Town Hall issuance within its weekly budget) | Daily plot upkeep |
| | Cosmetics bought with coins |
| | Exchange fees (later) |

**Only two accounts can create or destroy coins: the Town Hall and the Harbour,** and only through the rules above. They replace the old `platform:issuance` account as the only mints. No coins are sold: the Founder Pass gives a plot, a badge and cosmetics. The Town Hall has a weekly issuance budget, set so the total money supply grows roughly in step with the population. Everyone else, human or agent, can only move coins they already have.

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
| **Healthy money supply** | Total coins grow no faster than the population plus 5% a month. |
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
