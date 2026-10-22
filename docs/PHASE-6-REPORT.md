# Phase 6 report: the town becomes the landing screen

Branch `claude/project-thread-410plq`. Spec: Doc 06 sections 8 (world-first mobile), 9 (menus, cards, "since you left"),
9.4 (fallbacks) and 14 (performance), and Doc 03 sections 2 to 6, 8 and 9 (the town's look and layout).

## Gates — PASS

| Gate | Evidence |
| --- | --- |
| The app opens into the 3D town | `/` and `/town/first-town` draw the town for the Palasora tenant (P6-01). Other tenants keep the feed at `/`. |
| Both menus work on phones, 44 pt targets | Main menu (⋯, top left) and quick menu (+, bottom right) in portrait and landscape (P6-03, P6-04). |
| Cards open on tap; shared links land on the plot | `?at=P405` opens that plot's card (P6-02). |
| "Since you left" comes from stored events | Built from the town's event store for the viewer's residents; markers sit on the changed plots (P6-05). |
| Works without Three.js | 2D map with `?view=2d`, when 3D is off in Settings, with Save-Data, low memory or no WebGL 2 (P6-07); list view for screen readers (P6-08). |
| Three.js only on the world routes | Loaded as its own chunk; never on the feed, wallet, Exchange or Command Center (P6-09). |
| Under 150 draw calls | About 13 to 15 draw calls: buildings, roads and props are merged into a few meshes; cars, buses, people and lights are instanced (P6-01 asserts < 150). |
| Reduced motion | No tour, no camera easing (P6-06). |

Screenshots: `docs/evidence/phase-6/` (desktop day and night, phone portrait and landscape, both menus, a card, the 2D map,
the list view, "since you left" and My Plot).

## What was built

- **Service.** `economy/town/layout.py` is the town's plot grid (12 by 10: harbourside, market, main street, homes,
  farmland, and the Town Hall, Market Hall and Harbour). Genesis now founds plots from it. `GET /town/world?viewer=`
  (`economy/town/view.py`) returns one read for the first frame: plots, businesses with owner names, prices and wages,
  the viewer's plot, residents and businesses, "since you left" items and markers.
- **Web.** `lib/world/scene.ts` draws the town on the diorama kit's approach (`lib/world/kit.ts`): a rounded block,
  merged-geometry builders plus a glow mesh, an orthographic camera that the person can pan, zoom and tilt a little
  and that eases back to a framed angle after four seconds. Streets have lane markings, crossings, traffic lights,
  bus stops and street lamps; cars keep to the right-hand lane, stop at red lights and keep their distance; buses wait
  at stops; people walk the pavements, with a gold marker on AI agents. Day and night follow the town clock.
  Around the playable grid sits set dressing (an Exchange quarter with towers, avenues, an arena, a campus, a
  vertiport, farms, wind turbines, a marina, a monorail and a ferry) so the town reads as a city.
- **Components.** `components/world/`: `WorldApp` (menus, status chip, cards, preferences, fallbacks), `WorldCanvas`
  (lazy Three.js), `Town2D`, `TownList`, `WorldCard`, `WorldPage` (server read).
- **Routes and navigation.** `/` is the town; the feed moved to `/feed` (links, redirects and the bottom navigation
  updated: Town, Feed, SubPals, Exchange, My Agent). The site header, footer and bottom navigation are hidden on the
  world routes, where the world's own menus take over.

## Defaults chosen (no answer needed to proceed)

- The world is the landing screen for the Palasora tenant only; other tenants keep the feed.
- "Decisions waiting" on My Agent shows 0 until agents run plots (Phase 8).
- Homes appear on home plots once the town is founded; there is no construction time in the simulation yet.
- The set dressing around the grid is decoration only: it is not on the ledger and has no cards beyond a short
  description.
- The camera starts a little further out in portrait so the whole town fits on a phone.

## Tests changed

- The browser suite moved every `goto("/")` meant for the feed to `/feed`.
- `member.spec` T-009 and `v131.spec` T-009: logging out or an expired session lands on the town, which has no site
  header, so the "Log in" link is checked on `/feed`.
- `v13.spec` L-22 measures the feed at `/feed`; `v15.spec` V15-03 and its neighbour sign in to `/feed`, where the edition menu lives.
- `phase1.spec` P1-04: since Phase 5, `llms.txt` no longer mentions news at all, so the check is that it does not.
- `phase4.spec`: fixture plot ids corrected to the grid's format (`P405`, not `P0405`).
- New: `tests/e2e/phase6.spec.ts` (10 tests), `tests/unit/world.test.ts`, `services/editorial/tests/test_phase6_world.py`.

## Full suite

Browser: 165 tests. All pass except ISSUE-24 (password reset lockout) and ISSUE-28 (Oware), both failing before this
phase too. Service: 182 tests pass. Unit: 151 pass.

## Not in this phase

- The live service still does not run the town's tick: the world shows the town as its records stand (Phase 8).
- Travel lists one town; more towns come with population.
