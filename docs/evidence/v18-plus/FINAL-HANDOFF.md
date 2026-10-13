# Final development handoff (session of 12 Oct 2026)

Branch `unified-v1.5`, local commits only: nothing was pushed or force-pushed, and nothing was deployed to Oracle. The local stack on this Mac is migrated and running on the newest code.

## What this session did

| Phase | Outcome |
| --- | --- |
| 1 Recover state | Audited git, tracker, runtime, spend and backups. Found the ISSUE-19 migration **already applied** at 18:04 UTC; the previous session's "pre-migration-businesses" snapshot is actually post-migration (the true pre-state is `pre-migration-payments-…151056Z`). Found the writer pool had died at that PocketBase restart (not a deliberate stop). |
| 2 ISSUE-19 | New verified backup, restore drill OK, migration round trip on a live copy, e2e passes under the new permission model. **Done.** |
| 3 ISSUE-23 | Server-enforced role/permission matrix (11 roles), middleware gate, escalation guards, TOTP MFA, invitations, suspension/recovery, Users & access workspace. **Done**; admin hostname left for the founder. |
| 4 ISSUE-24 | Account lifecycle (password, email change, sessions, lockout), one mail path with transactional vs double-opt-in marketing, development mail sink. **Done** apart from live sending (blocked). listmonk evaluated. |
| 5 ISSUE-28 | Palavva Games MVP: Oware, checkers and trivia; AI vs AI, Human vs AI and Human vs Human; ratings, challenges, tournaments, result posts, staff workspace. **Done (MVP)**; boardgame.io/OpenSpiel evaluated, not adopted. |
| 6 ISSUE-16/18 | Read-only Hetzner audit (Revive 6.0.8 installed but stopped; EspoCRM 9.3.4 running; no Palavva credentials). Ad inventory, targeting, non-billable test creatives and people-only accounting; sponsor pipeline with an EspoCRM adapter, dedupe and retries. **Live delivery and sync blocked** on credentials and decisions. |
| 7 Economy / Exchange / LINK_POLICY_V2 | Replay scenarios with a recommendation; Exchange audit PASS; v2 impact measured. **No values changed.** |
| 8 Command Center | Page help on all 36 routes, a ? on every metric card, axe serious/critical 0 on every route; standards sweep added. |
| 9 Regression | **Final full run clean** (`20261013T010243Z`, exit 0): typecheck PASS, vitest 137/137, pytest 182 passed / 3 skipped, Playwright 146 passed / 2 skipped (screenshot-only) / 0 failed. Earlier runs and fixes are in `QA-REPORT.md`. |
| 10 Oracle | `ORACLE-STAGING-READINESS.md`: do not migrate yet; blockers listed. |
| 11 Docs | This file plus `COMPLETION-MATRIX.md`, `QA-REPORT.md`, `MIGRATION-REPORT.md`, `REMAINING-DECISIONS.md`, `INTEGRATION-AUDITS.md` (appended), `ECONOMY-EXCHANGE-LINKPOLICY-REVIEW.md`, `BEFORE-AFTER/session-2026-10-12/`. |

## Commits this session (oldest first)
- `8f48d0f` ISSUE-23/24: Users & access with a server-enforced role/permission matrix (11 roles, view/create/edit/approve/delete/export/administer per module, deny by default, sensitive money/secrets/security never in other templates), middleware gate on every
- `c00d9fd` ISSUE-28: Palavva Games — deterministic Ayo/Oware (abapa), English checkers and sourced African trivia engines; AI vs AI, Human vs AI and Human vs Human under one destination; append-only moves with a unique (match, ply) index, replay from the move
- `3d667d5` ISSUE-16/18: Advertising & inventory (8 placements with density rules, All Africa → region → country → admin region + language/SubPal/topic/device targeting from the reader's chosen edition, approved-placement gate, non-billable labelled test creat
- `0edb234` Phase 7/8: Pals reward-policy replay scenarios (separate welcome/contribution pools, per-agent total cap, quality weighting; cross-checked against the product's own preview) and an independent read-only Exchange audit (price provenance, trade/order
- `8fb24e3` Regression fixes and performance: E2E sign-in helper no longer waits for "networkidle" (never reached on live SSE pages); Games removed from the 1280px top bar (overflowed) and added to the footer; Editorial Manager and Moderator can pause threads/
- `1686ebb` pytest: disable the switch-read cache in tests (they flip switches and read them back at once)
- (this documentation commit follows)

## How to open it
* Public site: http://127.0.0.1:3000. Games: `/games`. Account security: `/account`.
* Command Center: http://127.0.0.1:3000/admin. As Super Administrator (`admin@palavva.local`) you will now be asked to set up an authenticator app. Save the 8 recovery codes it shows.
* New workspaces: Users & access, Games, Advertising & inventory, and the rebuilt Sponsors & inquiries.

## Exact next steps
1. **Founder decisions** in `REMAINING-DECISIONS.md`, especially: admin hostname; Oracle read-only audit; Pals two-pool policy; EspoCRM API user; Revive restart and host; email provider.
2. **Engineering, no approval needed:**
   a. Cache switch reads in the Python services (2–5 s) to cut PocketBase CPU and log volume (≈ 500k log rows a day).
   b. Build arm64 images in CI.
   c. ISSUE-02 DNA/memory inspector UI.
   d. ISSUE-06 "Learn more" drawers and inline translation in Conversations.
   e. ISSUE-10 global Translate button.
   f. ISSUE-03 rail mini-map default layer.
   g. When approved: the two-pool reward budget in `economy/rewards.py` and the replay.
3. **After credentials arrive:** set `ESPOCRM_URL`/`ESPOCRM_API_KEY` and run one controlled inquiry; set up Revive zones and `REVIVE_DELIVERY_URL` with a non-billable test campaign; switch to the SMTP provider sending to a staff inbox only.

## Safety state at hand-off
* `ORACLE_DEPLOYMENT_AUTHORIZED=false`, `PUBLIC_LAUNCH_AUTHORIZED=false`, `PAID_FALLBACKS_ENABLED=false`.
* `ADS_LIVE_AUTHORIZED` unset: no paid ads; every ad event is billable=false.
* `MAIL_TRANSPORT=sink`: no email leaves the machine.
* Payments: sandbox only.
* Paid AI: **$1.06 of the $5 ceiling (13 Oct 01:4x UTC)** used (provider-reported); hard cutoff $4.50 in code.
* LINK_POLICY_V2 **OFF**. GAMES_PAUSED off. AD_SLOTS_DISABLED as before, and no placement is switched on in live data.
