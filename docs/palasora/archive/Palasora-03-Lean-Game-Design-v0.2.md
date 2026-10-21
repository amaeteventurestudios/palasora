---
title: "Palasora · Lean Game Design Document"
subtitle: "Document 03 · Working draft v0.2 · 20 Oct 2026 · Amaete Umanah"
---

**The answer in one line:** one calm, floating capital island that fills a phone screen, where every building is generated from our kit, rises floor by floor, glows with its health, and opens into a one-tap card. Everything else waits until after the first playable version.

This document covers what players see and touch. The loop is in Document 02, and the rules and numbers are in Document 04.

# 1. Design pillars

- **Belong:** your name on a plot, your agent, your neighbours.
- **Delegate:** you decide, your agent does the work.
- **Discover:** something worth seeing changed every time you return.
- **Calm and light:** soft, readable, 2 to 5 minutes a visit, smooth on a mid-range Android phone.

If a feature doesn't serve one of these, it waits.

# 2. The capital island

About 120 plots on one floating island, with visible edges, waterfalls and clouds below.

| Area | Where | What's there |
|---|---|---|
| **Downtown** | Centre | Town Hall (votes, civic jobs), Market Hall (prices), the plaza (events), the Exchange building (closed until the exchange opens) |
| **Market Street** | Ring around downtown | Food stalls and small shops |
| **Home quarters** | Middle ring | Houses on small plots, one per resident |
| **Workshop yard** | Near the harbour | Workshops, delivery depot |
| **Farm terraces** | Outer edge | Farms stepping down toward the island's rim |
| **Harbour** | One edge | Airship dock: imports, exports, visitors |

**Plots:** small (1×1) for homes and stalls, large (2×2) for farms and workshops. Every owned plot carries a small sign with the owner's name. Empty plots show a "for sale" marker.

**Growth:** when the capital fills up, a district island rises from the clouds and docks with a bridge. That's out of scope for the first version, but the layout leaves room for bridges on three sides.

# 3. Buildings and procedural construction

Every building is generated from our kit, never modelled by hand.

| Kind | Buildings | Who runs it |
|---|---|---|
| **Business** (playable) | Farm, workshop, food stall, delivery (its building is the depot) | A player or an agent |
| **Home** | House | Its resident; not a business |
| **Island building** | Town Hall, Market Hall, Harbour, Exchange | The island's rules |
| **Civic project** | Park, pitch, fountain and the other vote templates | Built by the Town Hall after a vote |

- **A building is** a type (stall, farm, workshop, depot, house, civic) + a level + a style seed + the owner's colour.
- **Kit parts:** foundations, walls, roofs, awnings, signs, fences, crop rows, props (tables, crates, carts).
- **Levels:** each level adds a floor, an extension or props. A level 3 stall has a second floor and seating.
- **Construction on screen:** a fenced site, then the foundation, then floor by floor with scaffolding and workers, then done. It runs on the real build time from the simulation.
- **Health glow:** a soft ring under each business: green (has everything), yellow (running low), orange (getting a little), red (getting nothing).
- **Requests:** about 10 civic templates for the weekly vote in the first version: park, football pitch, night market, fountain, clock tower, school, clinic, bus stop, lighthouse, festival stage.

# 4. People and traffic on screen

- **Residents:** up to about 150 walking figures on a phone (more on desktop). The simulation has everyone; the screen shows a sample near the camera.
- **Name tags:** shown when tapped, when followed, and always for your own agent and your neighbours.
- **Agent tag:** a small badge on every agent, house agent or player's.
- **Vehicles:** delivery carts follow real deliveries between real businesses. Airships arrive at the harbour on real imports and exports.
- **Day and night:** follow the real clock. Lights come on in homes and stalls at night.

# 5. Camera

| Mode | How it works |
|---|---|
| **Home view** | A Meadowvale-style three-quarter angle with the whole island in frame |
| **Orbit** | Drag to spin all the way round and tilt between 25° and 60°. After 4 seconds idle, it eases back toward the home tilt. |
| **Zoom** | Pinch through island, district and street. At street level the island's edges leave the frame and it's simply a town. |
| **Follow** | Tap a resident or a cart and the camera follows it to its destination. |
| **Inspect** | Tap a building and its card opens; the camera frames the building. |
| **Sky view** | Zoom all the way out to see the capital among other islands (empty sky in the first version). |

# 6. Screens

The island fills the screen. Panels appear only when you tap.

| Screen | What's on it |
|---|---|
| **Island (default)** | Top: coins, time and weather, notifications. Bottom: four buttons: My plot, Agent, News, Vote. |
| **Plot card** | Health colour, today's numbers, your agent's suggestion with three choices, upgrade, and the replay button |
| **Agent chat** | The same conversation as WhatsApp or Telegram, mirrored in the app |
| **Replay** | A 30-second clip of your day, with a share button |
| **Island news** | Today's stories from the simulation |
| **Vote** | The weekly ballot, with who asked for each item |
| **Market Hall** | Simple prices for crops, tools and materials, with up or down arrows |
| **Agent builder** | Name, look, voice, personality, goals and limits |
| **Shop** | Founder Pass, agent subscription, cosmetics |

**Portrait:** the island takes the top two-thirds and cards slide up from the bottom. **Landscape:** the island fills the screen and cards open in a slim right panel. Every main action is one tap.

# 7. The agent builder

| Field | Choices | Default |
|---|---|---|
| Name and look | Pick a face, outfit and colour | Random friendly look |
| Voice | Two text styles plus optional voice notes | Warm and brief |
| Personality | Cautious ↔ bold, friendly ↔ blunt | Middle of both |
| Goal | Save for a shop, best business on the street, become a producer, just enjoy the island | Save for a shop |
| Limits | Daily spend cap, price range, what needs approval | Land, closing, shares and over-cap spending need approval |
| Channel | WhatsApp, Telegram, app only | App, plus whichever you connect |
| Bring your own AI | Connect your own model (later) | Off |

# 8. Look and sound

- **Palette:** sage greens, warm cream, terracotta roofs, soft sky blue, a few owner colours. No textures, no images.
- **Light:** soft shadows, gentle fog under the island, warm sunrise and sunset.
- **Built on** our Three.js diorama kit: the rounded island block, heightfield terrain, merged geometry, the light tier for phones.
- **Sound:** soft ambience (market chatter, wind, airship hum), one gentle chime for good news. Off by default on first open.

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
| The capital island with about 120 plots | District islands and bridges |
| Homes, food stalls, farms, workshops, delivery | The rest of the production ladder |
| Jobs, wages, the Market Hall | The public Sora Exchange (ownership records exist from day one) |
| Your agent with the agent builder | Bring your own AI |
| WhatsApp, Telegram and app channels, weekly email | Instagram and Facebook DMs |
| Morning message, replay, island news | Walking around as your own character |
| Weekly vote with 10 civic templates | Guilds, wars, rivalries between islands |
| Founder Pass, agent subscription, a few cosmetics | Large cosmetic shop |
| 100 house agents | The full mystery storyline (only hints) |

# 11. Safety basics

- Name and chat filters, with a report button on every player and agent.
- The agent tag is always visible; agents never pretend to be people.
- A clear privacy note before connecting WhatsApp, because those chats are not end-to-end encrypted.
- No real money ever comes out.

# 12. Changes in v0.2

- Added the table in section 3 separating the four playable businesses from homes, island buildings and civic projects.
