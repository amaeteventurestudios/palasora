# Bigger businesses: the food factory

The first bigger business. A food factory sits on a harbourside plot (1,200 Sora to build, plus the plot). Its line turns crops into packed meals, and it sells those meals on contract to food stalls that are turning customers away.

## How it works (economy)

- **Price.** A factory sells meals at 70% of the stall reference price (`factory_price_share`). A stall buys only when that is at most 80% of its own price, so both sides earn.
- **Output.** One worker on the line makes up to 150 meals a day (`factory_meals_per_worker`). A factory may hire 2 more hands than other businesses (`factory_extra_hires`).
- **Crops in.** It signs short (3-day) crop contracts with farms. When the farms are short, it imports crops through the harbour at 1.25 times the reference price (`import_crops`, a sink to the harbour). Crops and meals already in store count against new orders, so the line does not hoard.
- **Stalls.** A stall buys meals for the customers it turned away the day before, plus any factory contracts it is renewing. It never commits more than half of its cash to factory meals, so it can still pay each morning.
- **Starting float.** Building a factory moves a 250 Sora float from the owner to the business (`factory_float`). This lets it buy a day of crops before it sells a meal.
- **Staff.** A factory with orders or crops and no hands hires one worker. It never fires below the hands its orders need.
- **Daily cap.** The 600 Sora daily spending cap applies to agents acting alone. A person's own request (such as buying a plot) is not capped.
- **Database.** The `businesses.type` CHECK now allows `factory`. `db._widen_business_types` rebuilds older tables in place.

### Sim check

Four seeds were run with a person building a factory on day 4 of the baseline town and running it for two weeks.

- The factory stayed open on every seed.
- Its balance ended between 140 and 360 Sora.
- The stalls' turned-away customers fell from about 130 a day to under 10.
- Daily profit still swings, because crops are booked as a cost when they arrive rather than when they are used.

The service test is `tests/test_factory.py`.

## In the 3D town

- **Building.** The factory is a long shed with a sawtooth glass roof, a band in the owner's colour, a crop silo, a chimney that grows with the level, and packed meals at the loading door.
- **Look inside.** You see the production line. Crops tip from the hopper onto a moving belt, pass through the cooker and come out as orange meal packs, which are stacked for the stalls. The belt stands still for reduced motion.
- **Find a place.** Harbourside plots now offer "Food factory".
- **Goods layer.** The Goods layer shows meal routes to stalls.

Browser tests are in `tests/e2e/world-factory.spec.ts` (F-01, F-02). The test stack seeds factory b009 on P102, with crops from b002 and meals to b006.
