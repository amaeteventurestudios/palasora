# QA report (v1.8+, session of 12–13 Oct 2026)

Every number below comes from an actual run. Logs: `docs/evidence/test-runs/<timestamp>/` (typecheck, vitest, pytest, test-stack, playwright). Command: `scripts/test-all.sh`, which runs `tsc --noEmit`, `vitest run`, `pytest -q tests/` (isolated PocketBase on :8291) and then Playwright against a freshly reset and built isolated stack (`data-test/`, :3300/:8390/:8400, deterministic fixture model). Paid models are never called by tests.

## Baseline (start of session, before any edit)
| Suite | Result |
| --- | --- |
| typecheck | PASS |
| vitest | 93 passed |
| pytest | 179 passed, 3 skipped |
| Playwright | not established cleanly: my first edits landed during that run's build, so it was stopped and not counted |

## Full runs during the session

| Run | Logs | typecheck | vitest | pytest | Playwright | What failed and why |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `20261012T220804Z` | PASS | 137 ✓ | 179 ✓ / 3 skip | **98 ✓, 17 ✗, 31 not run** | (a) my E2E sign-in helper waited for `networkidle`, which pages with live SSE never reach, so 12 tests timed out; (b) Games link overflowed the 1280 px header (V16-01); (c) tests written for the old rank model (editor opening System health / Revenue, tenant admin on Tenants, a second checkbox on sign-up); (d) Editorial Manager/Moderator lost `agents.edit` (demo conversation) |
| 2 | `20261013T000335Z` | PASS | 137 ✓ | 181 ✓ / 3 skip | **137 ✓, 4 ✗, 2 skip, 5 not run** | mail-sink filenames lost the legacy `-reset-` tag (V17-10); Moderator no longer opens Settings & audit (test updated: audit checked as Super Admin); Games link moved to the footer; one flaky test (a random tag made a short English reply look French to the language rule, so the test text was made unambiguous) |
| 3 | `20261013T002458Z` | PASS | 137 ✓ | **11 ✗** (171 ✓) | **146 ✓, 0 ✗, 2 skip** | pytest: the new switch-read cache (3 s) hid switches the tests flip and read back immediately. Fixed by `SWITCH_CACHE_SECONDS=0` in `tests/conftest.py`; a separate full pytest then gave **182 passed, 3 skipped, 0 failed** |
| **4 (final)** | `20261013T010243Z` | **PASS** | **137 ✓** | **182 ✓ / 3 skip, 0 ✗** | **146 ✓, 2 skip, 0 ✗** | **none: complete, successful regression run (`scripts/test-all.sh` exit 0)** |

The 2 Playwright "skipped" are the evidence-screenshot tests (`v18-shots.spec.ts`), which run only with `SHOTS=1`.

## What the new tests cover (added this session)

| Area | Tests |
| --- | --- |
| Authentication, permissions, privilege escalation | vitest `access.test.ts` (16): role templates, sensitive grants, route→module, escalation rules, RFC 6238/4226 TOTP vectors, AES-GCM sealing, recovery codes. Playwright `v18-access.spec.ts` (8): MFA before pages **and** APIs, wrong code refused, secret stored sealed; invite → accept → Operations refused on revenue/users/Pals/sponsors and on economy rule changes, unmapped admin path refused; matrix edit takes effect, audited, restorable; role change needs a reason; suspension signs out and blocks sign-in; external-agent claim negatives |
| Account lifecycle and email | Playwright `v18-access`: transactional mails, newsletter double opt-in (button only), unsubscribe, change password (other devices signed out), change email (new address confirms, old told), forgot password (same answer for unknown emails, expired link refused), lockout after 10 wrong passwords |
| Games and match integrity | vitest `games.test.ts` (18); pytest `test_v18_voice_dna_api.py` (2); Playwright `v18-games.spec.ts` (6) |
| Advertiser and CRM adapters | vitest `espo.test.ts` (4, local EspoCRM API fixture), `ads.test.ts` (4); Playwright `v18-commerce.spec.ts` (2) |
| Command Center standards and accessibility | Playwright `v18-admin-standards.spec.ts` (all 36 routes: H1, named controls, axe serious/critical = 0; report `ADMIN-STANDARDS-AUDIT.json`); existing `v18-admin-layout.spec.ts` (no sideways scroll, full width, 9-digit values at 390/1440/2560) and `a11y.spec.ts`; vitest `page-help.test.ts` (every admin route has help and maps to a permission module) |
| Performance | pytest `test_v18_switch_cache.py` |

## Other required areas
* **Database migrations and rollback:** every new migration round-tripped (up → down → up) on a copy of live data with integrity checks and unchanged counts; restore drill OK (`MIGRATION-REPORT.md`).
* **Financial ledger and Exchange settlement:** existing `test_economy.py` and v18 economy tests pass. Independent read-only audit on live data: **PASS on 7 checks** (`EXCHANGE-AUDIT.json`). Pals integrity: 10 checks clean.
* **Editorial policies:** `test_v18_disposition.py` passes; LINK_POLICY_V2 impact measured read-only on 625 held cards.
* **Translation and localisation, real-time delivery:** existing v13/v16/v17/wave-B Playwright specs pass in runs 3–4 (Arabic RTL, French preference, SSE live replies, pulses).
* **Responsive layouts:** layout sweep over every admin route at 3 widths passes. The public header overflow found in run 1 was fixed.
* **Security and secrets:** no secret is printed by any report. MFA secrets are stored sealed (checked in e2e). Mail-sink previews redact tokens (existing wave-C test). Production refuses seeded `*.local` accounts and requires `ACCESS_ENCRYPTION_KEY`.
* **Infrastructure health and backup/restore:** `scripts/status.sh` all green; `scripts/restore-drill.sh` OK on the session backup.

## Measured performance effect of the switch-read cache
Deployed 13 Oct ≈ 01:01 UTC. PocketBase request log: 30 min before = 19,109 rows (≈ 637/min), including 6,348 settings reads (≈ 211/min). In the first 5.7 min after = 3,835 rows (≈ 675/min), including 937 settings reads (≈ 165/min). **Total volume did not drop.** The cache is correct (each switch is read at most about every 3 s per process), but switch reads are only ~20 % of traffic; polling loops dominate. Follow-up and log retention are recommended in `ORACLE-STAGING-READINESS.md` §4. The cache is kept because it is harmless and reduces the hottest single queries; it is not claimed as a fix.

## Spend
OpenRouter provider-reported usage: **$1.06** (13 Oct, rising slowly with the writer pool) of the authorised **$5** ceiling (cutoff $4.50 enforced in code). Tests use the fixture model only, and this session made no paid calls itself; the existing writer pool, as configured in `.env.local`, made routine agent calls within the gate.

## Not verified (honest gaps)
* Live EspoCRM, live Revive delivery and live email: no credentials, so these were tested against fixtures and the development sink only.
* OpenSpiel cross-check of the game rules: needs an ARM64/Linux machine.
* A manual screen-reader pass, native-speaker translation QA and load tests beyond the earlier c=100 run.
