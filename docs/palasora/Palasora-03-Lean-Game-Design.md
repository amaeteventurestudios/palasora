---
title: "Palasora · Lean Game Design Document"
subtitle: "Document 03 · Working draft v0.4 · 21 Oct 2026 · Amaete Umanah"
---

**The answer in one line:** one calm, grounded coastal town, a little futuristic, that the app opens into and that fills a phone screen, where every building is generated from our kit, rises floor by floor, glows with its health, and opens into a one-tap card. Everything else waits until after the first playable version.

This document covers what players see and touch. The loop is in Document 02, and the rules and numbers are in Document 04.

# 1. Design pillars

- **Belong:** your name on a plot, your agent, your neighbours.
- **Delegate:** you decide, your agent does the work.
- **Discover:** something worth seeing changed every time you return.
- **Calm and light:** soft, readable, 2 to 5 minutes a visit, smooth on a mid-range Android phone.

If a feature doesn't serve one of these, it waits.

# 2. The first town

About 120 plots in one grounded town on the coast, laid out on a street grid. The world sits on the ground. There are no floating islands. Every person gets a home plot in town.

The town is a downtown core with neighbourhoods around it. Each neighbourhood is a district.

| District | Where | What's there |
|---|---|---|
| **Downtown** | Centre | Town Hall under a glass dome (votes, civic jobs), Market Hall under a glass roof (prices), the plaza (events), round glass towers, and the Sora Exchange, the gold-topped tower (closed until the exchange opens) |
| **Market Street** | Ring around downtown | Food stalls and small shops |
| **Home quarters** | Middle ring | Houses with gardens and fences on small plots, one per resident, and apartment blocks with rooftop gardens and solar panels |
| **Workshop yard** | Near the harbour | Workshops, delivery depot |
| **Farm belt** | Edge of town | Farms with greenhouses, and wind turbines |
| **Harbour and beach** | The coast | Fishing port, marina and ferry pier: imports, exports, visitors. A beach beside it |

**Around the town** (set dressing in the first version, not playable businesses): an arena, a campus, a drone vertiport, a monorail loop that links the districts, and wind turbines on the hills and offshore.

**Plots:** small (1×1) for homes and stalls, large (2×2) for farms and workshops. Every owned plot carries a small sign with the owner's name. Empty plots show a "for sale" marker.

**Growth:** when the town fills up, a new district opens on its edge, joined by road and the monorail. Later, other towns are reached by monorail, road or ferry. That's out of scope for the first version, but the street grid leaves room to extend on three sides.

**Communities:** each town and district is also a SubPal in the social network. Owning a plot joins you to it.

# 3. Buildings and procedural construction

Every building is generated from our kit, never modelled by hand.

| Kind | Buildings | Who runs it |
|---|---|---|
| **Business** (playable) | Farm, workshop, food stall, delivery (its building is the depot) | A player or an agent |
| **Home** | House | Its resident; not a business |
| **Town building** | Town Hall, Market Hall, Harbour, Exchange | The town's rules |
| **Civic project** | Park, pitch, fountain and the other vote templates | Built by the Town Hall after a vote |

- **A building is** a type (stall, farm, workshop, depot, house, civic) + a level + a style seed + the owner's colour.
- **Kit parts:** foundations, walls, roofs (pitched or flat with solar panels), awnings, signs, fences, gardens, crop rows, greenhouses, props (tables, crates, carts).
- **Levels:** each level adds a floor, an extension or props. A level 3 stall has a second floor and seating.
- **Construction on screen:** a fenced site, then the foundation, then floor by floor with scaffolding and workers, then done. It runs on the real build time from the simulation.
- **Health glow:** a soft ring under each business: green (has everything), yellow (running low), orange (getting a little), red (getting nothing).
- **Requests:** about 10 civic templates for the weekly vote in the first version: park, football pitch, night market, fountain, clock tower, school, clinic, bus stop, lighthouse, festival stage.
- **Later civic templates:** a police station and a jail, for the future civic justice system (Document 06 section 16). Not in the first playable version.

# 4. People and traffic on screen

- **Residents:** up to about 150 walking figures on a phone (more on desktop). The simulation has everyone; the screen shows a sample near the camera.
- **Name tags:** shown when tapped, when followed, and always for your own agent and your neighbours.
- **Agent tag:** every agent, house agent or player's, carries a small gold marker and an "AI" tag.
- **Vehicles:** delivery carts follow real deliveries between real businesses. Cargo boats and ferries arrive at the harbour on real imports and exports. The monorail runs its loop, and drones come and go from the vertiport.
- **Day and night:** follow the real clock. Lights come on in homes, stalls, towers and streets at night.

# 5. Camera

| Mode | How it works |
|---|---|
| **Home view** | A Meadowvale-style isometric three-quarter angle with the whole town in frame |
| **Orbit** | Drag to spin all the way round and tilt between 25° and 60°. After 4 seconds idle, it eases back toward the home tilt. |
| **Zoom** | Pinch through town, district and street. |
| **Follow** | Tap a resident or a cart and the camera follows it to its destination. |
| **Inspect** | Tap a building and its card opens; the camera frames the building. |
| **Region view** | Zoom all the way out to see the town on the region map (only the first town in the first version). |
| **Travel** | Travel in the quick menu opens the district list and the region map. Districts first; other towns later. Pick a place, then a short monorail or road transition (2 to 3 s, skippable) carries you there. Only one town or district is in memory at a time. From the first release, with only the first town listed. |

# 6. Screens

**World-first.** The app opens into the town, and the town fills the screen. Two menus float over it, and panels appear only when you tap. The only other thing on screen is a small status chip at the top centre: town or district name, time of day, unread count.

| Screen | What's on it |
|---|---|
| **Town (default)** | The world. Top-left: the three-dot main menu. Bottom-right: the quick menu. |
| **Main menu (⋯, top-left)** | Social Network, My Profile, SubPals, Notifications and Messages, My Agents, Towns and Districts, Businesses, Games, Leaderboards, Settings, Help. Staff also see the Command Center. |
| **Quick menu (+, bottom-right)** | Expands seven labelled actions, nearest the thumb first: My Plot, My Agent, Social Feed, Wallet, Sora Exchange, Travel, Notifications. |
| **Plot card (business card)** | Top line first: name, owner, status and health colour, today's profit or loss. Then the managing agent, products and prices, recent sales, revenue and costs, employees, stock, contracts, reputation, recent posts and ownership. Every number is read from the ledger, never estimated. Your agent's suggestion with three choices, upgrade, and "Open profile". (Document 06 section 10) |
| **Agent chat** | The same conversation as WhatsApp or Telegram, mirrored in the app |
| **Since you left** | Changed buildings glow; a card lists the changes; an optional 30-second tour; a share button |
| **Social Feed** | The full social network: posts and replies from people and agents, town events, SubPals, follows |
| **Vote** | The weekly ballot, with who asked for each item. Opens from the town's SubPal and the Town Hall card |
| **Market Hall** | Simple prices for crops, tools and materials, with up or down arrows |
| **Wallet and Sora Exchange** | Balance, income and spending; the founding companies and your holdings |
| **Agent builder** | Name, look, voice, personality, goals and limits |
| **Shop** | Founder Pass, agent subscription, cosmetics |

There is no News screen. Every main action is one tap.

**Portrait:** cards are half-height sheets over the town. Full pages (feed, wallet, Exchange, profiles) slide up, and "Back to town" returns to the same view. The main menu is a sheet from the left; the quick menu stacks upward. **Landscape:** cards open in a slim right panel. The main menu is a left panel, and the quick menu fans out leftward along the bottom, so both stay clear of the town's centre.

**Touch and fallback:** every target is at least 44 pt with 8 pt spacing. Layouts respect the safe areas. A left-handed setting mirrors both menus. When WebGL or memory is short, a light 2D town map opens with the same taps and cards. (Document 06 sections 8 and 9)

# 7. The agent builder

| Field | Choices | Default |
|---|---|---|
| Name and look | Pick a face, outfit and colour | Random friendly look |
| Voice | Two text styles plus optional voice notes | Warm and brief |
| Personality | Cautious ↔ bold, friendly ↔ blunt | Middle of both |
| Goal | Save for a shop, best business on the street, become a producer, just enjoy the town | Save for a shop |
| Limits | Daily spend cap, price range, what needs approval | Land, closing, shares and over-cap spending need approval |
| Channel | WhatsApp, Telegram, app only | App, plus whichever you connect |
| Bring your own AI | Connect your own model (later) | Off |

# 8. Look and sound

**Look:** a grounded, Meadowvale-style town, a little futuristic. Flat, pastel, low-poly, on a coast. Seen from an isometric, orthographic camera. A street grid with a domed glass Town Hall at the centre and round glass towers downtown; the Sora Exchange is the gold-topped one. Apartment blocks with rooftop gardens and solar. Houses with gardens and fences. A Market Hall under a glass roof, an arena, a campus, a drone vertiport and a monorail loop. A beach, a fishing port and a marina. Farms with greenhouses, and wind turbines, some offshore. Day and night. Agents carry a gold marker and an "AI" tag. The reference sketch is the Palasora town sketch (`town/index.html`, 21 Oct 2026).

- **Palette:** cream and pale stone walls, slate and terracotta roofs, sage lawns, sea teal, glass in soft aqua, a touch of gold, a few owner colours. No textures, no images.
- **Light:** soft shadows, warm sunrise and sunset, lit windows and street lights at night.
- **Built on** our Three.js diorama kit: heightfield terrain, merged geometry, the light tier for phones.
- **Sound:** soft ambience (market chatter, waves and gulls, the monorail's hum), one gentle chime when something good happens. Off by default on first open.

# 9. Phone budgets

| Measure | Target |
|---|---|
| Frame rate | 30 fps or better on a mid-range Android; 60 on desktop |
| First load | Under 5 MB and under 8 seconds on 4G |
| Draw calls | Under 150 on phones |
| Memory | Under 300 MB on phones |
| Battery | No more drain than a short video while the app is open |

The kit's light tier applies on every touch device: lower pixel ratio, fewer walking figures, no heavy effects.

# 10. First playable version

| In | Out (later) |
|---|---|
| The first town with about 120 plots | New districts on the town's edge |
| Homes, food stalls, farms, workshops, delivery | The rest of the production ladder |
| Jobs, wages, the Market Hall | The public Sora Exchange (ownership records exist from day one) |
| Your agent with the agent builder | Bring your own AI |
| WhatsApp, Telegram and app channels, weekly email | Instagram and Facebook DMs |
| Morning message, "since you left", the town's feed | Walking around as your own character |
| Weekly vote with 10 civic templates | Guilds, wars, rivalries between towns |
| Founder Pass, agent subscription, a few cosmetics | Large cosmetic shop |
| 100 house agents | The full mystery storyline (only hints) |
| People post and reply | Other towns (Travel lists only the first town) |
| World-first opening with both menus | Civic justice (police station and jail) |

# 11. Safety basics

- Name and chat filters, with a report button on every player and agent.
- The agent tag is always visible; agents never pretend to be people.
- A clear privacy note before connecting WhatsApp, because those chats are not end-to-end encrypted.
- No real money ever comes out.

# 12. Changes in v0.2

- Added the table in section 3 separating the four playable businesses from homes, island buildings and civic projects.

# 13. Changes in v0.3

Applied from the approved amendments, following Document 06 v0.2:

- **6. Screens:** world-first. The app opens into the island. The four bottom buttons (My plot, Agent, News, Vote) are replaced by a top-left three-dot main menu and a bottom-right quick menu (My Plot, My Agent, Social Feed, Wallet, Sora Exchange, Island Travel, Notifications). "News" is removed; Vote moves into the island's SubPal and the Town Hall card.
- **6. Screens (layouts):** portrait and landscape layouts, 44 pt targets, safe areas, a left-handed mirror and a 2D fallback.
- **6. Plot card:** it is now the business card from Document 06 section 10, with every number read from the ledger.
- **5. Camera:** added travel between islands (sky map, airship transition, one island in memory), from the first release with one island listed.
- **3. Civic templates:** added a police station and a jail for the future civic justice system.
- **2. The capital island:** each island and district is also a SubPal.
- **10. First playable:** "people post and reply" and "world-first opening with both menus" are in; "other islands" and "civic justice" are out.
- "Island news" is now the island's feed. There is no real-world news anywhere.

# 14. Changes in v0.4

**Why:** user decision, 21 Oct 2026. The world is no longer floating islands. It is a grounded, Meadowvale-style town, a little futuristic, as shown in the town sketch. Document 06 v0.3 makes the same change.

- **One line and 2:** the floating capital island is now the first town: a downtown core with districts as neighbourhoods (Downtown, Market Street, Home quarters, Workshop yard, Farm belt, Harbour and beach). Every person gets a home plot in town. Waterfalls, clouds and island edges are gone. Growth is a new district on the town's edge, joined by road and monorail, not a district island docking by bridge.
- **2. Harbour:** it is now a fishing port, marina and ferry pier, not an airship dock. It keeps its role for imports, exports and visitors.
- **2. Communities:** each town and district SubPal replaces each island and district SubPal.
- **3. Buildings:** "island building" is now "town building". Kit parts gain flat roofs with solar, gardens and greenhouses.
- **4. People and traffic:** cargo boats and ferries replace airships on imports and exports. The agent tag is a gold marker and an "AI" tag. The monorail and drones are added.
- **5. Camera:** zoom runs town, district, street. Sky view becomes the region view. Island Travel becomes Travel: districts now, other towns later, with a monorail or road transition. One town or district is in memory at a time.
- **6. Screens:** "Island" is now "Town" on screen, in the status chip, the main menu (Towns and Districts), the quick menu (Travel), "Back to town" and the 2D town map.
- **8. Look and sound:** added the Look note. Fog under the island and airship hum are removed; waves, gulls and the monorail's hum are added.
- **10. First playable:** district islands become new districts; other islands become other towns.
- **Unchanged:** world-first mobile with the top-left three-dot main menu and the bottom-right quick menu, one currency Sora, the 120 plots, the businesses, budgets, civic templates, the agent tag rule, the Founder Pass with no coins, no news, and civic justice for later.
