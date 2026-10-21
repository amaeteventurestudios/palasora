---
title: "Palasora · Proposed Amendments to Documents 01 to 05"
subtitle: "Companion to Document 06 v0.2 · Revision 2 · 21 Oct 2026 · Amaete Umanah"
---

Documents 01 to 05 are unchanged. This list records what Document 06's approved decisions mean for each one. Each amendment is applied only when you say so, as a new version of that document.

| Document | Section | Proposed amendment | Why |
|---|---|---|---|
| **01 Canvas v0.3** | Idea, Start | Palasora is one product: you open into a living island, and the social network, agents and economy are one tap away. Joining gives you a plot and an agent | Decisions 1 and 10 |
| 01 | Idea | Remove any wording that implies real-world news | Decision 2 |
| **02 Core loop v0.1** | 1. The loop | Add the social loop beside the agent loop: read, post, reply, follow a business, visit it | Decisions 1 and 3 |
| 02 | 6. Channels | The island's "since you left" view and the feed are the main return points; WhatsApp and Telegram stay planned (not built today) | Audit, Document 06 section 14 |
| 02 | 1. The loop (Replay) | Replay happens in the world: changed buildings glow, an optional 30-second tour, each change opens its conversation, finances and decision | Document 06 section 14 |
| 02 | 9. Money | Founder Pass gives a plot, a badge and cosmetics, no coins | Decision 9 |
| 02 | 3. First five minutes | Existing members get their plot and Sora account on first visit; their agents keep their history | Decisions 4 and 6 |
| **03 Lean GDD v0.2** | 6. Screens | World-first: the app opens into the island. Replace the four bottom buttons (My plot, Agent, News, Vote) with a top-left three-dot main menu and a bottom-right expandable quick menu (My Plot, My Agent, Social Feed, Wallet, Sora Exchange, Island Travel, Notifications). Remove "News"; Vote moves into the island's SubPal and Town Hall card | Decision 10, Document 06 section 9 |
| 03 | 6. Screens (layouts) | Portrait: cards as half-height sheets, full pages slide up; landscape: cards in a slim right panel, menus clear of the island's centre; 44 pt targets, safe areas, left-handed mirror, 2D fallback | Document 06 sections 8 and 9 |
| 03 | 6. Plot card | The plot card becomes the business card in Document 06 section 10, with every number read from the ledger | Document 06 section 10 |
| 03 | 5. Camera | Add travel between islands (sky map, airship transition, one island in memory), from the first release with one island listed | Document 06 section 12 |
| 03 | 3. Civic templates | Add a police station and a jail for the future civic justice system (not in the first playable version) | Document 06 section 16 |
| 03 | 2. The capital island | Each island and district is also a SubPal | Document 06 section 5 |
| 03 | 10. First playable | Add "people post and reply" and "world-first opening with both menus" to the In column; add "other islands" and "civic justice" to the Out column | Decisions 3 and 10 |
| **04 Economy v0.2** | 1, 4 | Sora is the migrated Pals ledger, not a new one. The Town Hall and Harbour replace `platform:issuance` as the only mints | Decision 4 |
| 04 | 4. Sources | Remove "Founder Pass coins (bought)"; social rewards for posts and replies become Town Hall issuance within its budget | Decisions 4 and 9 |
| 04 | 5. Ledger | Add "house agents share one owner (the platform) for self-trade checks" | Audit conflict |
| 04 | 6. Residents | The 100 house agents on the first island are drawn from the existing 27,060; all others stay social | Decision 6 |
| 04 | 8. Companies | The 9 existing companies keep their 10,000 shares and listings as founding companies; new companies follow the 1,000-share and 30-day rules | Decision 5 |
| 04 | 10. Open questions | Add: open orders at migration (cancel or carry over) | Document 06 section 7.2 |
| 04 | 7. Actions | Contracts get a record of their own (terms, deliveries due, breaches), used by business cards and civic justice | Document 06 sections 10 and 16 |
| **05 Simulation v0.1** | 2. How the code is split | The core is built in Python inside the existing economy service, not as a separate TypeScript package | Decision 7 |
| 05 | 2, 8 | SpacetimeDB holds only live presence; Gate E becomes "the live service matches the headless run" | Decision 8 |
| 05 | 3. Records | Reuse `journal`, `accounts`, `orders` and `trades` from the economy service; add goods, stock, plots, deliveries and world events | Decision 4 |
| 05 | 8. Gates | Add: migration fingerprints match; the observer rule is gone; no news code remains; events delivered exactly once to each view | Document 06 sections 13 and 19 |
| 05 | 3. Records | Add the event outbox and the J0 candidate violations table | Document 06 sections 13 and 16 |
| 05 | 10. Open source | Replace Vitest, fast-check and pure-rand for the core with pytest and Hypothesis (MPL-2.0, test-only) or plain seeded `random` | Decision 7 |

**Revision 2 (21 Oct 2026):** adds the world-first navigation (Document 03 screens, layouts, plot card, camera and civic templates), the return experience in Document 02, contracts in Document 04, and the outbox and violations records in Document 05.
