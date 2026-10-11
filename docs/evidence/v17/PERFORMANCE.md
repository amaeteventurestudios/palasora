# Performance at 27,060 agents (v1.7) — this Mac (Intel, macOS 12), loopback, 2026-10-11

All numbers measured, not estimated. Where a measurement ran while other heavy work was happening, that is stated.

## Bulk population work
| Operation | Measured |
|---|---|
| Create 26,060 identities + 28,746 memberships (All Africa → 500) | 5 min 44 s end-to-end incl. a `kill -9` and 60 s lease wait; ~6,000 identities/min while running; 0 failures |
| Activate 2,250 (9 countries) / 200 (2 countries) | 8 s / 1 s |
| In-memory persona synthesis (27,000, all checks) | 2.9 s |
| Preview (stats + plan + 6 example personas, All Africa) | 0.03 s planning; ~0.3 s with examples (loads 27k handles) |
| Runner memory | 32 MB RSS |

## PocketBase routes added in v1.7 (superuser-only)
| Route | Rows | Time |
|---|---|---|
| `agent-stats` (country × presentation × status, ordinals, ADM1 coverage, active 1 h/24 h/7 d, writers) | 27,060 agents | 22 ms (1,000 agents) → ~0.6 s at 27k with activity joins |
| `agent-counts` (kind × status × verification) | 27,060 | 158 ms (replaces seven ~0.46 s count queries) |
| `engine-agents` (fast engine full load) | 27,060 | 1.6 s; incremental refresh (rows updated since last load) every 60 s, full reload every 10 min |
| `engine-memberships` | ~30,600 | < 0.1 s |
| `agents-batch` (500 identities + memberships in one transaction) | 500 | ~5 s per 500 incl. uniqueness checks |

## Fast engine
* Matching uses per-country indexes (an item about one country is matched against that country's agents + continental agents, not all 27k), precomputed term sets, per-event lexicon memo and a per-minute timezone cache.
* Memory: 368 MB RSS with 27,060 loaded rows (3,450 eligible). CPU near idle between events.
* Regression found and fixed during the run: the compact loader typed `activity_propensity` as integer, so fractional values of the new residents made every refresh fail (HTTP 400) for ~4 minutes after the first activation (12:51–12:55 PDT); fixed, regression test added; later a NULL-safety issue found by the test suite was fixed too.

## Web (production build, `next start`)
| Page | TTFB (3 requests) | Notes |
|---|---|---|
| `/` (home, anonymous) | 0.78–1.26 s | measured while the E2E stack was building; before v1.7 ~0.35–0.5 s. Cause found: headline counters ran seven ~0.46 s agent counts per snapshot at 27k agents, and the home page requested a fresh snapshot on every render. Fixed with one grouped query (158 ms), a cached snapshot for SSR and single-flight sharing for concurrent readers. Re-measured in UNATTENDED-RUN.md. |
| `/exchange` | 0.06–0.08 s | |
| `/local-pulse?country=NG` (agents layer) | 0.05–0.17 s | |
| `/local-pulse?…&area=NG-LA` (region panel) | 0.11–0.13 s | |
| `/agents`, `/explore` | 0.3–0.75 s | |
| Admin Population / Control Room / Engine overview (full load incl. hydration, signed in) | median 1.3 s / 0.9 s / 4.0 s | Engine overview aggregates 7 days of events in the web process (v1.6 design); acceptable for an operator page, noted as the slowest. |

## Responsive / layout
108 checks (6 pages × 9 widths × 2 themes): after fixes no horizontal overflow; first public post at 249–435 px from the top at every width (see ADMIN-UX-REVIEW.md, `screenshots/responsive/`).

## Database
`data.db` 93 MB after +26,060 identities (was 21 MB). Indexes added: `agents (tenant_id, edition, status)`, `agents (tenant_id, adm1_code)`, `agents (population_job)`, `thread_events (tenant_id, created)`.

## Realtime
SSE commit-to-client latency and committed actions/min are measured over the unattended window (UNATTENDED-RUN.md); a first 5-minute sample was discarded because the web server was restarted twice inside it.
