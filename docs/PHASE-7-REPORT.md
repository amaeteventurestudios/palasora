# Phase 7 report: business cards and owner controls

Branch `claude/project-thread-410plq`. Spec: Doc 06 section 10 (the business card, every field from the ledger) and
section 11.3 (owners manage through the Actions gate), with Doc 03 section 6 (the business's books).

## Gate: card numbers match the ledger — PASS

- Revenue, costs and profit on the card are sums of journal entries on the business's own company account, for today,
  the last 7 days, the last 30 days and all time (`economy/town/card.py`). Money that only moves between an owner and
  their business (genesis capital, owner capital and draws, dividends, business sales) is neither revenue nor cost,
  and a reserve or release on the same account is not counted twice. This is the same split the business keeps in its
  own daily books.
- `tests/test_phase7_card.py` runs the baseline scenario for 12 days on seeds 3 and 5 and checks every business:
  the card's all-time revenue, costs and profit equal the business's own books to the centi-Sora (0 mismatches), the
  7-day figures equal the last seven days of its books, and the balance equals every entry in minus every entry out
  (`balance_matches`).
- In the browser (`tests/e2e/phase7.spec.ts`), stall b001 has a day of real ledger entries from the test fixture:
  the card shows revenue 35.00, costs 18.00, profit 17.00, balance 417.00 and "from the ledger, 16 entries".

## What the card shows

Status and health, business type and level, who runs it (AI badge), what it sells and at what price, what it buys,
the daily wage, reputation, money by period (Today, 7 days, 30 days), the balance and the number of ledger entries,
sales in the last 24 hours, costs in the last 7 days by kind, staff, stock, active contracts. "Open profile" opens a
full page at `/town/business/<id>` with the same numbers plus recent events.

Visitors see the numbers. Owner-only events and the controls are shown only to the owner, decided by the service
from the signed-in person's account, never from anything the browser sends.

## Owner controls

Change price, change wage, hire, let someone go, upgrade (with the cost shown and a confirm step), end a contract, and
close the business (with a confirm step). Each one is stored as a request (`owner_requests`); the town's next hour
runs it through the Actions gate as the owner's agent, with the owner's limits, so a request can be refused for the
same reasons an agent's action can (for example a price outside the allowed range, or a wage below half the civic
wage). The card lists the owner's last requests as waiting, done or refused with the reason. At most ten requests
can wait at once per business.

## 3D

A business opened in the last town day stands in scaffolding (poles, two plank decks and a hoist). Buildings already
grow with their level (a second floor on stalls, more greenhouses on farms, an annexe on workshops, more carts at
depots); closed businesses stand shuttered.

## Defaults chosen

- The live service does not run the town's tick yet, so on a live deployment requests wait until Phase 8 turns the
  tick on. The tests run the tick in the simulation and check that requests are applied or refused.
- "Let someone go" lets the most recent hire go, as the Actions gate does for agents.
- Reputation is shown as the business's rating, where a new business starts at 1.00.
- Request inputs are checked twice: for shape when stored, and against the owner's limits when applied.

## Tests

- `services/editorial/tests/test_phase7_card.py`: money equals the books, week figures, visitors see no owner data,
  owner requests go through the gate (done, PRICE_RANGE and WAGE_TOO_LOW refusals, the price on the card after).
- `apps/web/tests/e2e/phase7.spec.ts`: P7-01 card numbers, P7-02 profile page, P7-03 owner requests on a phone with
  44 pt targets and a cost preview, P7-04 another signed-in person sees no controls.
- Screenshots: `docs/evidence/phase-7/`.
