# Bigger businesses: the player market at the Market Hall

The Market Hall's order book for crops, tools and materials has been in place since Phase 3, but until now only agents used it. People can now trade there through the businesses they own. An owner can offer the business's goods at a price they choose, or bid for the goods it needs. Every offer shows up as a stall in the Hall.

## Rules (`economy/town/market.py`, `card.py`)

- **Who trades:** the owner of an open business, on that business's behalf. Goods are always held by a business, never by a resident.
- **Orders are owner requests:** an order is sent as kind `place_order` or `cancel_order` to `POST /town/businesses/{bid}/requests`. The town's next hour applies it through the Actions gate, with the owner agent's limits, including the daily spending cap.
- **Checks before an order queues:** the request is turned back, with a reason, if any of these is true:
  - the good is not crops, tools or materials;
  - the quantity is outside 1 to 500;
  - the price is more than 50% away from the usual price;
  - it is a sell and the business doesn't have enough goods free;
  - it is a bid and the business doesn't have enough Sora;
  - the price would meet one of the owner's own orders, which the Hall would refuse.
- **Matching:** the Hall's matching rules haven't changed.
  - The best price fills first; at the same price, the earlier order fills first.
  - The price of the order already waiting is the trade price.
  - A bid holds the Sora it needs and an offer holds the goods.
  - Both sides settle in one transaction, and the goods leave on a cart.
- **How long an order waits:** a person's order waits up to 3 days. An agent's order still waits 1 day.

## Agents

At 13:00, `agents.bargains` runs. Any business that is low on its input looks round the stalls.

- **What counts as low:** it has less than three days' use of the input, counting goods already on their way.
- **What it buys:** offers from other owners priced at or below the usual price. It buys up to three days' use, and spends at most a third of its cash.
- **Why it matters:** this is what makes a person's fair offer sell.
- **No self-trade:** a business never buys against an offer from its own owner.

In the baseline town, agents alone still almost never use the Hall: in 28-day runs with seeds 7 and 11 there were no Hall trades and no rule breaks, the same as before this change. The Hall comes alive once people open stalls.

## People

- **Market Hall** (in the main menu, or "Walk round the stalls" on the Market Hall's own card). For each good it shows:
  - the last price and its change over the last day;
  - what is for sale and from how many stalls;
  - what is wanted, and the last day's trading.
  
  It also lists every stall selling now, and your own businesses with the goods they hold.
- **A good's page:** the order book, two weeks of daily average prices, its stalls and the last trades with who sold to whom. An owner can offer or bid at their own price, cancel an open order, and see each request's outcome: waiting, done, or refused and why.
- **Business card:** an owner sees "sell at the Market Hall" next to any market good the business holds.
- **In the 3D town:** the five stalls in front of the Market Hall have bright awnings and crates for each business selling now. Stalls with no seller stand grey.

## API

- `GET /town/market?user_id=` returns the board, the stalls, and the viewer's businesses with their goods, orders and requests.
- `GET /town/market/{good}?user_id=` returns one good: its book, trades, price history and stalls.
- The world view gains `market.stalls`, the number of businesses selling now.

## Tests

- **Service:** `tests/test_player_market.py` covers:
  - the board;
  - the request checks;
  - a person's offer that a stall buys at the person's price;
  - cancelling, which gives the goods back;
  - house businesses buying fair offers at 13:00.

  The conservation checks run every hour throughout.
- **Browser:** `tests/e2e/world-market.spec.ts` (M-01 to M-03). The test town (`e2e_fixtures._seed_market`) has:
  - farm b007 offering 40 crops at 1.40 Sora;
  - farm b002 with 10 crops left at 1.55 Sora;
  - workshop b008 offering 6 tools at 21.00 Sora;
  - workshop b003 wanting 10 materials at 7.60 Sora;
  - the reader's stall b001 holding 14 crops.
