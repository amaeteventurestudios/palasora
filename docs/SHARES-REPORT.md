# Bigger businesses: company shares on the Town Exchange

Every business is a company from its first day: the founder holds all 1,000 shares (`business.mint_shares`). A business that has done well can now list some of those shares on the Town Exchange. Residents buy and sell them, and a listed business pays a weekly dividend to everyone who holds its shares.

## Rules (`economy/town/shares.py`)

- **Who can list:** an open business on its own plot (not a food cart) that has traded for at least 14 days and made a profit over the last 7.
- **How much the owner can offer:** up to 490 shares, so the owner always keeps the majority.
- **Listing price:** set by a rule, not chosen by the owner. It is what the business cost plus 20 days of its recent average daily profit, divided by 1,000. The lowest possible price is 0.10 Sora. The listing goes up as a single sell order that stays open for two weeks.
- **Trading:** this works like the Market Hall and the Sora Exchange.
  - Only limit orders are allowed, matched by best price and then by who ordered first, and orders can fill in part.
  - The trade happens at the price of the order that was already waiting.
  - A buy order holds the Sora it needs and a sell order holds the shares, and both sides settle in the same transaction.
  - Each order must be within 30% of the last trade price.
  - Orders that don't fill expire after 3 days.
- **No self-trade:** an order never matches another order with the same owner. All house agents share one owner, so house agents can't trade a house business's shares among themselves. People buy those shares, and house agents buy into people's businesses.
- **Dividends:** every Sunday at 21:00, each listed business that made a profit that week pays out half of it. Each shareholder gets the same amount per share, and the business always keeps 100 Sora. Each payment is a ledger transfer (rule `dividend`), so the conservation checks cover it.
- **Closing:** if a listed business closes, its open share orders are cancelled first. Its cash is then shared out per share to every shareholder (rule `wind_up`), and it is delisted.
- **Private sale:** a listed business can no longer be sold in a private sale, because its shares are spread across many people.

## Agents

At 11:00 each day:

- **Listing:** one house entrepreneur lists a business that made at least 70 Sora in the week (300 shares). At most 8 businesses are listed at once.
- **Buying:** agents with savings (above 150 Sora for house agents, above 100 for people's agents) buy shares when they are priced at no more than 1.2 times what the agent thinks they're worth. That value is what the business cost plus a month of its profit, divided by 1,000.
- **Selling:** agents sell when the price is at least 1.5 times that value, or when their wallet drops below 30 Sora.
- **Within limits:** every one of these actions passes the Actions gate, so the daily spending cap and the other limits apply.

A 28-day run of the baseline town (seed 7) listed 8 businesses, with steady trading and two rounds of Sunday dividends. There were no self-trade refusals, and the conservation checks held every hour.

## People

- **Town Exchange** (main menu). This lists every listed business with its price, change since listing, last dividend and yield, and number of shareholders. It also shows your own shares.
- **Listing card.** It shows the order book, recent trades, shareholders and dividends. A resident can buy or sell there, and cancel an open order. The order is placed at the town's next hour.
- **Business card.** A listed business shows its share price and dividend, with a "Buy or sell shares" button. An owner sees whether the business can list yet, and if so can offer shares at the listing price.
- **In the 3D town.** A listed business has a gold coin on top of its sign.

## API

- `GET /town/exchange?user_id=` returns the board and the viewer's holdings.
- `GET /town/exchange/{bid}?user_id=` returns one listing: its book, trades, shareholders, dividends and the viewer's orders.
- Orders are sent as `POST /town/me/requests`, with kind `buy_shares`, `sell_shares` or `cancel_share_order`.
- Listing is sent as `POST /town/businesses/{bid}/requests`, with kind `list_shares` and a `qty`.

## Tests

- **Service tests:** `tests/test_shares.py` covers:
  - listing, and the refusals for a business that is too young or an offer that is too big;
  - a person buying, selling and cancelling, with every reservation checked;
  - the self-trade block;
  - Sunday dividends reaching every shareholder;
  - the payout when a listed business closes;
  - the card and request checks.
- **Browser tests:** `tests/e2e/world-exchange.spec.ts`, cases X-01 to X-03. The test stack lists stall b005 at 4.20 Sora, with 25 shares already bought by p002 and a 0.30 Sora dividend.
