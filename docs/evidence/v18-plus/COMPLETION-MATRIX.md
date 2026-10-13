# 28-issue completion matrix (12 Oct 2026, end of session)

Columns:
* **Implemented**: code exists for the core of the issue.
* **Tested**: automated tests cover it (file names in `ISSUE-TRACKER.md`).
* **Deployed**: running on the founder's local Mac stack. Nothing is deployed to Oracle or production.
* **Pending**: work that can be done without approval.
* **Blocked**: needs an external credential, decision or authorisation (see `REMAINING-DECISIONS.md`).

Full evidence per issue is in `ISSUE-TRACKER.md`; test totals are in `QA-REPORT.md`.

| # | Issue | Implemented | Tested | Deployed (local) | Pending (no approval needed) | Blocked on |
| --- | --- | --- | --- | --- | --- | --- |
| 01 | Restore homepage | ✅ | ✅ | ✅ | — | — |
| 02 | OASIS + Letta persona / memory | ◐ DNA, shapes, memory blocks; rollout 25 % | ✅ | ✅ | DNA/memory inspector UI, OASIS export bridge, multi-turn depth metric | spend for wider rollout (within $5) |
| 03 | Local Pulse | ◐ | ✅ | ✅ | rail mini-map default layer; per-region last activity | — |
| 04 | Full-width admin shell | ✅ (all 36 routes) | ✅ layout + standards sweeps | ✅ | 2–3-column re-layout of some long pages | — |
| 05 | Jev / TypeSafe audit | ✅ audit | n/a | n/a | — | paid benchmark (approval + key) |
| 06 | Explainable admin | ◐ page help on every route, metric ? everywhere | ✅ | ✅ | "Learn more" drawers, inline thread translation in Conversations | — |
| 07 | Exceptions / editorial queue | ◐ v2 rules built, impact measured | ✅ | ✅ (switch OFF) | rebuild the Exceptions page | **founder:** enable LINK_POLICY_V2, backlog release |
| 08 | Editorial AI runs | ◐ | ✅ | ✅ | per-run raw detail drawer | — |
| 09 | Social & sources | ◐ | ✅ | ✅ | feed/terms discovery research, bulk archive | — |
| 10 | Languages / translation | ◐ | ✅ | ✅ | global Translate button on remaining surfaces | native-speaker QA (people) |
| 11 | Geo QA | ◐ | ✅ | ✅ | ambiguous place-name test set | labelled data for auto-pass |
| 12 | Trend audit | ◐ | ✅ | ✅ | topic×country chart, explain-score drawer | — |
| 13 | Moderation | ◐ | ✅ | ✅ | case drawer depth | real report volume (none exists) |
| 14 | Pals economy | ✅ + replay scenarios | ✅ | ✅ | two-pool budget + per-agent cap code (after decision) | **founder:** reward values |
| 15 | Virtual Exchange | ✅ + audit PASS | ✅ | ✅ | — | **founder:** founder allowance (provisional) |
| 16 | Revive advertising | ◐ inventory, targeting, safe parser, test creatives | ✅ (unit + e2e) | ✅ (non-billable) | — | **founder:** Revive restart/host/GeoIP/zones, live ads authorisation |
| 17 | Payments | ◐ sandbox only | ✅ | ✅ (sandbox) | — | **founder:** provider, legal entity, live payments |
| 18 | EspoCRM sponsor pipeline | ◐ adapter, pipeline, dedupe, retries | ✅ (fixture + e2e) | ✅ (not connected) | — | **founder:** EspoCRM API user |
| 19 | Businesses & founders | ✅ | ✅ | ✅ | — | Revive/EspoCRM link for paid placements (16/18) |
| 20 | llms.txt / SEO | ◐ | ✅ | ✅ | — | Search Console / Bing credentials; production domain |
| 21 | Infrastructure & services | ◐ | ✅ | ✅ | metrics history store; switch-read caching (perf) | Oracle/Hetzner inventory access |
| 22 | Settings & audit | ◐ | ✅ | ✅ | — | email provider for delivery health |
| 23 | Users & access / RBAC | ✅ (11 roles, matrix, MFA, invitations) | ✅ | ✅ | — | **founder:** admin hostname spelling + DNS |
| 24 | Accounts, email, notifications | ✅ (development mail sink) | ✅ | ✅ | — | **founder:** email provider + DNS auth; listmonk later |
| 25 | Realtime homepage | ✅ | ✅ | ✅ | — | — |
| 26 | My Agents performance | ✅ (+ games column) | ✅ | ✅ | leaderboard topic filter | — |
| 27 | Sidebar resources | ✅ | ✅ | ✅ | — | — |
| 28 | Palavva Games | ✅ MVP (3 games, 3 modes) | ✅ | ✅ | per-move commentary; OpenSpiel cross-check | ARM64 box for the cross-check |

Legend: ✅ done · ◐ working slice, remainder listed · n/a not applicable.

**Count:** 12 issues fully done (01, 04, 14, 15, 19, 23, 24, 25, 26, 27, 28, plus 05 as an audit). 16 have working slices with listed remainders; for 6 of those (07, 16, 17, 18, 20, 22) the main remaining step is a founder decision or credential. Live email for 24 is likewise blocked on a provider. Nothing is marked done without tests.
