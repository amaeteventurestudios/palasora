# Palasora Phase 4 handoff: town events in the feed, notifications and reports

Written 22 Oct 2026 by the Claude thread "Meadowvale city review" for the next Claude thread. Read this file first.

## Where things stand

- **Repo:** github.com/amaeteventurestudios/palasora (private). Work from `main` (1467efe or later).
- **Merged:**
  - **Phase 1 (PR #1):** people post, reply and vote; news stages 1 and 2 retired; backups tested. Report: `docs/PHASE-1-REPORT.md`.
  - **Phase 2 (PRs #2, #4):** Pals become Sora (migration tool, human accounts, one platform owner, two mints, burn account). Report: `docs/PHASE-2-REPORT.md`. Runbook: `docs/operations/SORA-MIGRATION.md`.
  - **Phase 3 (PR #5):** the town economy engine in `services/editorial/palavva_editorial/economy/town/`. It covers goods, the hourly tick, the Actions gate, the Harbour, the Market Hall, contracts, the Town Hall, issuance with the thermostat, and a world event plus outbox row written in the same transaction. It also has the exactly-once relay, morning reports and J0 records, plus the headless simulation (`scripts/sim`). Report: `docs/PHASE-3-REPORT.md`. Gate C (stories link to records) passes. Gates A and B have balance follow-ups, listed in that report. The owner chose to merge with them open.
- **Never deployed.** Palasora runs only locally. The Sora migration has never run on real data.
- **Old repo:** github.com/amaeteventurestudios/palavva. Leave it untouched.

## Read before coding

1. `docs/palasora/Palasora-06-Unified-Platform-Architecture.md` (v0.3): section 5 (item 3: `town_event` feed items), section 13 (one event, many views, and the delivery table), section 14 (the return experience) and section 19 (phase 4 row and integration tests).
2. `docs/palasora/Palasora-02-Core-Loop-and-Retention.md`: the morning report and "while you were away".
3. `docs/PHASE-3-REPORT.md`, then the outbox, relay and event code in the economy service.
4. The feed and gate code: `apps/web`, `pb_hooks/lib/gate.js`, the feed cache, notifications, SSE hub and `events/replay`.

## Phase 4 scope

Phase 4 delivers town events into the feed, notifications and reports. **Gate:** every story links to a record, and there are no duplicates.

- **Relay consumers:** the Phase 3 relay delivers outbox events to PocketBase (feed items, notifications) and to the SSE hub. Each consumer stores the `event_id` it applied and ignores repeats. After retries, a failed event goes to a held list in the Command Center.
- **Feed:** a new piece kind `town_event`, with a gate path that requires a linked event record. Withdrawn events disappear through the existing feed cache invalidation. Public events go to the town's SubPal, or the main feed if they are public enough.
- **Visibility:** events are public, town, owner only or staff. Consumers filter by it, and owner-only money detail never reaches the public feed.
- **No second truth:** feed items, notifications and reports store only the event id and display text. Numbers are read live from the economy service.
- **Notifications:** the owner is told about their business's real events. No notification goes out without a real event behind it.
- **"While you were away" / morning report:** built from stored events, newest and most important first, with no AI call to pad quiet days.
- **Place SubPals:** each town gets a SubPal (Doc 06 section 5 item 5), and owning a plot joins you. Topic SubPals stay.
- **Translation:** town content goes through the existing translation pipeline.
- **Tests:** the Doc 06 section 19 integration test "a town event appears in the feed exactly once, and repeats from the relay are ignored", plus visibility and withdrawal tests.

**Not in Phase 4:**
- Removing news code (phase 5).
- Anything 3D (phases 6 and 7).
- WhatsApp and Telegram: proposed to the owner for after phase 4; not yet approved.
- Fixing the Phase 3 balance follow-ups, unless one blocks this phase.

## Rules

- Work on a branch such as `phase-4-town-events`. Push at each milestone. Keep `docs/PHASE-4-PROGRESS.md` current.
- The owner said not to stop and ask. Pick sensible defaults, note them in the PR, and ask only for a decision that changes the product.
- The owner is careful with tokens. Use few subagents and short replies: what changed, exact test counts, and what you need.
- Never commit secrets, `.env*`, `services/editorial/.venv`, `apps/web/tsconfig.tsbuildinfo` or `data*/`.
- Paid AI: the OpenRouter ledger has a $5 cap, and no key is set in the cloud container. Use the fixture or recorded providers.
- **Do not:** deploy; run the Sora migration on real data; force-push; skip or disable tests; touch the palavva repo; ask for credentials in chat.
- Public content never mentions USG.
- When the gate passes and every suite has been re-run on the final code, open a PR against main and tell the owner. They have so far said to merge once it is ready.

## Testing

- Typecheck: `cd apps/web && npx tsc --noEmit`.
- Vitest: `cd apps/web && npx vitest run` (146 at the end of Phase 3).
- Pytest: `cd services/editorial && .venv/bin/python -m pytest` (232 passed, 3 skipped).
- Playwright: `E2E_BUILD=1 bash scripts/test-stack.sh reset`, then `cd apps/web && npx playwright test` (about 20 minutes). In the cloud container, set `PLAYWRIGHT_BROWSERS_PATH` to wherever the browsers are installed. Known failures that are not yours: v18 ISSUE-24 and ISSUE-28 (sign-up timeouts), so ISSUE-23 does not run; ISSUE-10 is occasionally flaky. Last count: 150 passed, 5 skipped.
- Simulation: `scripts/sim gates` takes about 4.5 minutes. Gate C must still pass.
- Restore tracked screenshots after Playwright (`git checkout -- docs/evidence/screenshots`) unless you meant to change them.

## Owner context

- The owner is Amaete. They are careful with tokens and prefer short, plain replies.
- **Look direction for phases 6 to 8:** `/mnt/project-files/palasora/look-reference/`. It covers real roads, traffic lights, buses, old and new buildings, landmarks, planes and an airport, in a Meadowvale-calm, toy-like style. No floating city.
- **Open owner items:**
  - An OpenRouter key on the server, for Gate B with a real model and Gate D.
  - Whether to add WhatsApp/Telegram agent messaging after phase 4.
