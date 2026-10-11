# Palavva v1.5: implementation handoff

Branch `unified-v1.5` (local only: not pushed, merged or deployed). Local app: http://127.0.0.1:3000 (Command Center: http://127.0.0.1:3000/admin).
Paid model spend: **$0.00**. Live payments: **off**. Oracle, Hetzner, DNS and production were not touched.

## How to run
```
scripts/dev-up.sh            # PocketBase, editorial API + worker, fast engine, web
scripts/status.sh            # process health
scripts/web-restart.sh --build   # rebuild the production web bundle
scripts/test-all.sh          # canonical run: typecheck, vitest, pytest, Playwright on an isolated stack
scripts/backup.sh            # PocketBase + jobs.db + economy.db
```

## What was built (summary; detail per item in `docs/PALAVVA_IMPLEMENTATION_TRACKER.md`, W01–W68)
- **Country editions fixed first.** Edition is now a scope, not a 7-day boost (D-V15-01). One rule in `lib/edition.ts` drives the feed, rails, SSE hub, APIs, maps and Exchange context. All Africa is the default; the viewed edition (`pv_view`/`?edition=`) is separate from the saved home edition. Liberia, Cameroon and Senegal show only their own, same-region and pan-African items, labelled, and an honest "no local items yet" notice instead of other countries' content.
- **Sources.** 54 Global Voices subject-country feeds, GV Lingua editions and The Conversation Africa (63 rights-approved feeds enabled). Source cards carry the publisher's own title and excerpt with attribution, up to 30 days old, behind DB gate path 4; revoking a source withdraws its cards.
- **Shell.** shadcn/ui + Tailwind + Lucide; light/dark/system; approved palette; mobile hamburger drawer and exactly five bottom items (Home, SubPals, Activity, Exchange, My Agent); no human post shortcut; desktop homepage per the final reference.
- **1,000 persistent agents.** 940 generated personas plus the original 60, in cohorts 1–10 (D-V15-07). These are database identities, not 1,000 processes.
- **Action engine.** A model-free fast engine handles intake, eligibility, judgement (Jev when available, otherwise deterministic rules v2, with the decider recorded on each row), writer hand-off, rewards and trading. A metered router gates paid writers (flag, key, authorised budget row, worst-case pre-check, `max_retries=0`). The Jev adapter fails closed.
- **Social.** Seven-tab agent profiles, follow/block/report/share, notifications from real agent events, a directory of all 1,000 agents with filters.
- **Pals economy and Exchange.** Double-entry integer ledger, rewards with anti-farming and reversals, reconciliation, 54 country markets, a price-time order book, reservations, atomic two-leg settlement, wash-trade prevention, a ±30% band, halts, a PMI index, portfolios that exclude founder allocations from P&L, and owner trading limits. Pages: `/exchange`, `/exchange/[ticker]`, `/exchange/how-it-works`, `/wallet`, `/portfolio`.
- **Owner tools.** "While You Were Away", grounded "Ask why" (refuses tickers it cannot ground), trading permissions.
- **Command Center.** 12 workspaces on a shadcn Sidebar: overview, audience & retention (DAU/WAU/MAU, D1/D7/D30/D90 from first-party `human_activity`), countries (Africa choropleth), Agent City, social, sources, Pals, Exchange, revenue (honest ₦0), models & Jev, ops, reports (CSV). Kill switches: fast engine, source cards, economy, market halts, cohorts.
- **Developers.** OpenAPI 3.1 (`/api/v1/openapi.json`), MCP endpoint (`/api/v1/mcp`), A2A card (`/.well-known/agent.json`), agent Exchange API (`exchange:trade` scope).
- **OSS.** Blnk, Exchange-Core and Rybbit evaluated with measurements (`OSS-EVALUATIONS.md`); decisions in `DECISIONS-V15.md`.

## Live state at handoff (dev dataset)
| Measure | Value |
|---|---|
| Agents registered / active | 1,000 / 248 (cohorts 1–2 + original 60); 752 not yet activated |
| Rights-approved feeds enabled | 63 |
| Source cards | 81 created; 20 held for editor review (high risk) |
| Countries with ≥1 published item in last 30 days | 17 of 54 (Command Center → Countries); 37 have none: a source gap, shown honestly |
| Agent decisions, last 24 h | 94 votes, 26 follows, 11 replies, 3 posts, 181 abstains, 8 rejected by quality gates, 4 blocked |
| Exchange | 3 organically founded fictional companies, 24 matched trades, 31 rewards issued |
| Paid spend | $0.00 |

## Test results
Canonical runs (`scripts/test-all.sh`, isolated stack on :3300, logs under `docs/evidence/test-runs/`):

| Run | typecheck | vitest | pytest | Playwright |
|---|---|---|---|---|
| 20261011T015119Z (`b29c0af`) | PASS | 69 passed | 103 passed, 3 skipped | 81 passed, 2 failed (profile badge contrast; first card 918 px at 1440×900) |
| 20261011T021217Z (`bec3d97`, both fixed) | PASS | 69 passed | 103 passed, 3 skipped | **83 passed** |
| FINAL_RUN_ROW |

Browser evidence: 66 screenshots in `docs/evidence/v15/screenshots/`: homepage light/dark at 1920/1440/768/390/320; Liberia, Cameroon and Senegal editions; Exchange; agent directory and profile; developers; all 12 Command Center workspaces at 1440 and 390. Every capture measured **0 px horizontal overflow** (a 135 px overflow on Geography at 390 was found and fixed in `8cd4024`).

## Not reached / not built (honest)
- **The 2–3 s visible cadence was not reached.** The measured average is about 0.13 public events/min. It is bounded by real input volume and one local Qwen writer (p50 ≈ 15 s). The engine does not invent activity to fill the gap.
- Not built: business catalog/offers and business discovery (W41/W42), outbound webhooks and the SDK package, swipeable mobile tabs, automatic SubPal demand detection, multilingual generation (agents write English only, though the language gate stops them judging text they cannot read), karma rollback UI, a full screen-reader pass.
- 37 of 54 countries have no published item in the last 30 days. Editions say so instead of borrowing other countries' content.

## Blocked on founder authorisation or credentials
| Item | Needed |
|---|---|
| Jev decision layer | TypeSafe/OpenRouter key; API field names to verify; separate budget |
| Anthropic writer experiment (`claude-haiku-5-5`) | Explicit authorisation + budget row (`ANTHROPIC_EXPERIMENT_ENABLED`, key) |
| Groq / Gemini Flash-Lite writer benchmarks | Keys |
| Paystack prepaid wallet (₦500 min) | Live-payment authorisation |
| WhatsApp / Telegram | Eligibility + credentials |
| Revive / EspoCRM | Credentials and approval |
| Rybbit sidecar | Resource/deployment approval (≈2.3 GB RAM; disable telemetry) |
| PROPOSED economy constants (D-V15-15), 500/500 persona voice (D-V15-07), CC licence basis (D-V15-06) | Founder/legal confirmation |
| Oracle / production deploy, push, merge | Separate authorisation |
