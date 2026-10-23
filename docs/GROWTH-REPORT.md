# Meadowvale growth, with Capital Rift underneath

The town now grows the Meadowvale way. The land around downtown starts empty, and new streets are laid out a few at a time. A house goes up for each person who moves in. The Capital Rift depth sits underneath unchanged:

- the core town keeps its businesses, the goods chain, the auctions, the Market Hall, the Town Exchange and the job board;
- a new "Your path" card shows each person the ladder from a free home to a listed company.

## Rules (`economy/town/growth.py`, `place.py`, `path.py`)

- **Lots:** the suburbs have 192 home lots: Southgate first, then Palm Hill, starting with the block nearest downtown.
  - Each lot has an id (`S001`…) and a street address ("3 Palm Lane").
  - The list is generated from the map code (`apps/web/scripts/suburb-lots.mts` writes `town/suburb_lots.json`), so the map and the service always agree. A unit test checks this.
- **Opening streets:** every hour, `growth.grow` runs first in the tick. When fewer than 4 new lots are free, it lays out the next street of 8.
  - Each new street posts an event to the feed: "A new street opened in Southgate: Palm Lane, 8 homes".
  - The first hour of a fresh town opens Palm Lane.
- **Moving in:** Find a place offers the new houses first, with their addresses, and then any free homes left in the old town.
  - Moving in is still free, one home each.
  - The feed reads "… moved into a new house at 3 Palm Lane".
  - The residents directory shows the street address.
- **Your path** (`path.progress`): seven steps, read from the town's records and never stored:
  1. home;
  2. start earning (a job or a food cart);
  3. open a business on its own plot;
  4. hire a first worker;
  5. trade beyond your counter (Market Hall order or supply contract);
  6. grow bigger (food factory or second business);
  7. list on the Town Exchange.

  `GET /town/me` returns it as `path`.

## The map (`apps/web/lib/world/districts.ts`, `chunks.ts`, `scene.ts`)

- **Before anyone arrives:** the suburbs are meadow, with survey stakes and a country track. A district fills in only once it has open lots, or once the population reaches its threshold.
- **Lot states:**
  - free: pegs with orange flags and a "new homes" sign;
  - moved into within the last day: a house under construction, with scaffolding;
  - after that: a finished house with a fence.
- **Cards:** a lot's card shows its address ("2 Palm Lane, Southgate") and explains that a house goes up the day someone moves in.
- **Your path:** it sits on the main menu before "Find a place". Its "next step" button opens the right panel: Find a place, the job board, the Market Hall or the Town Exchange.

## Tests

- **Service:** `tests/test_growth.py` covers:
  - the lot list;
  - the first street and its event;
  - new homes offered first;
  - moving in, with the address in the feed and the directory;
  - the next street opening when homes run low;
  - Your path.

  `test_phase6_world` now leaves suburb lots out of the core layout check.
- **Unit:** `tests/unit/growth.test.ts` checks that the JSON matches the map, the lots come in blocks of 8, no lots overlap, and the ids and addresses are right.
- **Browser:** `tests/e2e/world-growth.spec.ts` covers a new lot's card, Your path on a phone, and Your path signed out. `world-place` S3-02 now moves into "1 Palm Lane".
- **Evidence:** screenshots are in `docs/evidence/world-growth/`.

## Not changed

- Phase 8 go-live still needs the owner's go.
- Existing homes in the core town stay where they are.
