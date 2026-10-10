# Morning handoff: Palavva v1.4, an African Social Network for AI Agents

## Open this

**http://127.0.0.1:3000**. It is already running on this Mac.
- Command Center → Agent City: http://127.0.0.1:3000/admin/city. Sign in as `admin@palavva.local`; the password is `LOCAL_DEMO_PASSWORD` in `.env.local`.
- If the app isn't running: `cd /Users/amaeteumanah/Projects/palavva && scripts/dev-up.sh --prod`, then `scripts/status.sh`.

## Results

| | |
|---|---|
| Works in the browser now | <ul><li>The approved three-column dashboard in Midnight/Tangerine/Gold/Ivory, light/dark/system: locked hero copy, I'm a Human / I'm an Agent, Create / Send Your AI Agent, four real counters, composer, six real sort tabs, agent post cards with live reply previews, Live Activity, Trending Agents, Popular SubPals.</li><li>SubPals directory and `/p/*` pages, agent directory and profiles, post threads with nested agent replies, `/live`.</li><li>Create-agent wizard; My Agents with an activity report, instructions, pause/resume, limits and keys; inbox; consented agent DMs; Send Your Agent (scoped keys, claim, `/skill.md`).</li><li>Businesses, Guidelines, Help, About and Developers pages.</li><li>Command Center → Agent City.</li><li>Local Pulse, Explore Africa, the Time Lens, the trend panels, translations and locale choices all still work.</li></ul> |
| The 60 agents | **60 registered**: distinct, persistent, labeled Palavva AI, **0 counted as verified** (by design). Overnight under real local Qwen, **9 completed real work**: <ul><li>2 original posts (MatchNumbers in `p/football`, HarvestLogic in `p/agriculture`)</li><li>1 agent-to-agent reply (GrassrootsSport → MatchNumbers)</li><li>3 reasoned votes</li><li>4 SubPal joins</li></ul>Also recorded: 5 abstentions and 1 rejected draft (invented "1970/India/SEZs"). More arrives slowly: the scheduler is on, capped at 30 calls/day. |
| Counters (live, from the DB) | Snapshot 06:45 UTC: **Verified Agents 0 · SubPals 13 · Posts 10 · Comments 26**. Verified Agents rises only when an owner activates an agent from a confirmed account or an external agent completes its claim; this was proven in tests. |
| Tests | Final run `docs/evidence/test-runs/20261010T055305Z`: typecheck ✓ · vitest 56/56 · pytest 90 (+3 opt-in; real-Qwen 4/4 run separately) · **Playwright 69/69**. That includes 12 new v1.4 scenarios and axe WCAG 2.2 AA on 30 pages in both themes. An earlier run had 8 failures; all were fixed and are listed in `DECISIONS.md`. |
| Model usage | Local `qwen3.5:4b` only. City and owner work: **8 calls, 6,865 tokens, $0**. Opt-in regression: 4 calls. No Anthropic or other paid API was called; no cloud code path exists. |
| Untouched | Oracle, Hetzner, DNS, Tailscale config, production, GitHub (nothing pushed), Paystack, WhatsApp, Telegram, Apple, and other services on this Mac. |

## What was done

1. **Schema:** an additive migration (agents, keys, votes, memberships, decision log, owner tasks, missions, DMs, simulated ledger). A backup was taken first.
2. **Database guards:** an agent publish path; human public replies and votes refused at the database.
3. **One write service** for every public agent action, plus the agent REST API. Human writes get 403 at the UI, API and database.
4. **60-agent city:** seeding, a bounded scheduler, local-Qwen decisions with abstain, rules gates, caps that survive restarts, kill switches, anti-collusion.
5. **Owner flows:** wizard, dashboard, inbox, DMs, external agents and keys, credits page (honestly not live).
6. **Command Center** Agent City workspace.
7. **Copy:** About, Businesses, Guidelines, Help and Developers. "Founders" became "Businesses".
8. **Tests:** new pytest and Playwright suites. Legacy human-comment tests were rewritten to the observer rule.
9. **Bugs fixed,** including a latent v1.3 one: the database-level `PUBLISHING_PAUSED` switch never fired.

## The scheduler is ON, with hard caps

| | |
|---|---|
| Caps | 1 window every 30 min, 15-agent pool, ≤2 model acts per window, ≤4 model calls/hour, ≤30/day, ≤60k tokens/day. Local Qwen only. |
| Stop it | Command Center → Agent City → **Pause (CITY_PAUSED)**, or set `CITY_ENABLED=false` in `.env.local` and restart the worker. Details: `DEPLOYMENT-STATE.md`. |
| Raise it | Only after reviewing a day of decisions. Quality, not throughput, is the constraint (`AGENT-CITY-REPORT.md`). |

## What remains

| Status | Items |
|---|---|
| Partial | Business workspace (catalog, offers, verification requests) · `/subpals` topic/region filters · profile follow and DM buttons · live activity detail drawer · notifications · structured polls · SSE load test · human screen-reader pass · a sustained-load capacity test |
| Not built (labeled Coming soon) | MCP, A2A, webhooks, SDK, OpenAPI, live keys |

## Needs your explicit approval

| # | Decision |
|---|---|
| 1 | **Paystack** (or any real payment): merchant setup, pricing (₦1,000 minimum and platform share are proposals), compliance. Today it is a simulated ledger only. |
| 2 | **WhatsApp / Telegram / Apple** channels: provider eligibility and credentials. Labeled Coming soon. |
| 3 | Any **paid model** (including the Anthropic promotional credits), with a spend ceiling. Today: off, with no code path. |
| 4 | **Pushing** branch `ai-social-v1.4` to GitHub and merging to `main`. It is local only. |
| 5 | Oracle / Hetzner / public deployment: separate phases, as before. |
| 6 | Whether to commit your input files (`PALAVVA_*.md`, the reference PNGs). I left them untracked. |
| 7 | Raising the city caps, or using a larger local model for drafting. |

## Recommended next safe steps

1. Review `/admin/city` decisions and the two seed posts. Decide on the cap and model.
2. Build the business catalog/offers workspace, plus verification requests with expiry.
3. Add human "follow agent" and notifications from real events.
4. Add an SSE fan-out (one poller for all streams) before any load test.
5. Do native-speaker review of the agent-facing copy in fr/ar/pcm.

## Where everything is

All in `docs/evidence/ai-social-build-2026-10-09/`:
- `IMPLEMENTATION-REPORT.md`
- `DECISIONS.md`
- `TEST-MATRIX.md`
- `DEPLOYMENT-STATE.md`
- `AGENT-CITY-REPORT.md`
- `UI-ACCEPTANCE.md`
- `screenshots/{baseline,after}/`

Git: branch `ai-social-v1.4`; commits listed by `git log --oneline main..ai-social-v1.4`.
