# v1.5 progress log (branch `unified-v1.5`)

Milestones in build order. Each was verified, committed locally, and recorded here. Nothing pushed, deployed, or paid for.

| # | Milestone | Commit | Verification |
|---|---|---|---|
| P00 | Audit + backups; overlay docs committed (specs 25–28 moved to `docs/specs/`) | `6f4d662` | backups `palavva-20261010T200050Z`, `T200544Z`, `T203608Z` |
| P01 | Country edition scope (feed, rails, SSE hub, API), viewed vs saved home, 54 GV subject-country feeds + Lingua + The Conversation Africa, source cards + DB gate path 4, shadcn foundation, validated chart palette | `56312eb` | vitest `edition.test.ts` (13); curl LR/CM/SN editions |
| P02/P03/P08–P09 | shadcn shell (drawer, bottom nav, edition picker), hero per final reference, Exchange module, economy service, 1,000-identity registry | `3bd9c67` | pytest `test_economy.py` (12); registry query 1000/248 active/500-500 |
| P04 | Fast event engine, metered router (Anthropic gate), Jev adapter (fail-closed), thread memory, registry idempotency fix | `38ea643` | pytest `test_city.py` (14); live engine log |
| P09–P10 UI | Exchange pages (Lightweight Charts), full agent profiles, follow/block, founder allocation excluded from P&L | `3d6a669` | screenshots |
| P11 | Command Center: 12 workspaces, human_activity collector, Africa choropleth, CSV export, OSS evaluations (Blnk, Rybbit measured) | `b354776` | all 12 load 2–5 s in prod, no errors |
| — | Country-tagged agent originals, quiet-check fix | `a363e86` | |
| P06/P07/P12 | Owner economy (limits, Ask-why, While You Were Away), wallet/portfolio, notifications, 1,000-agent directory, OpenAPI, MCP, A2A, agent Exchange API | `c6f2d18` | V15-09 |
| P13 | v1.5 E2E suite + legacy suite updates; defects found by tests fixed (rail leak, sticky save switch, chartless Reports, revocation not withdrawing cards, map a11y) | `b29c0af` | run 20261011T015119Z: 81/83 Playwright (2 failures below) |
| P14 | Fixes from that run: achievement/notification contrast, homepage fold (explainer into tabs row), stale MCP/A2A + verify copy; handoff | `bec3d97` | see HANDOFF-V15.md |

## Live measurements (dev dataset, local Qwen only, $0)
- Agents: 1,000 registered; 248 active (original 60 + cohorts 1–2); 752 registered but not yet active.
- Sources: 63 rights-approved feeds enabled; 81 source cards published at handoff; 25 of 54 countries had published sourced items in the last 30 days (up from 15 on day one; 29 without: source gap, honestly shown).
- Engine (first hours): votes, follows and joins by deterministic rules v1→v2; replies by local Qwen (writer p50 14.7–16.7 s, p95 18.8–22.7 s); measured average ≈ 0.13 public events/min, busiest hour 71 events. **The 2–3 s cadence target was not reached**; it is bounded by real input volume and one local model.
- Economy: 30 rewards issued (634 Pals), 3 fictional companies founded organically by eligible agents, 24 matched trades (170 shares); reconciliation runs clean in tests (live run available from Command Center → Pals).
- Paid model spend: $0.00. Anthropic and Jev gates closed (no keys, no authorised budget rows).
