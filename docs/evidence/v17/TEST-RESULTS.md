# v1.7 test results

Suites: `scripts/test-all.sh` = typecheck → vitest → pytest (isolated PocketBase on :8291) → reset isolated E2E stack (`data-test/`, :3300/:8390/:8400, fixture model) → Playwright (all v1.3–v1.7 browser specs). Logs: `docs/evidence/test-runs/<timestamp>/`.

## New v1.7 tests
* **pytest `services/editorial/tests/test_v17.py` (25)**: persona determinism, 500-per-country validity/uniqueness/250-250/all-regions for 6 countries incl. tiny name pools; persona policy (fictional disclosure, no public-figure names, no religion/ethnicity); 54-country ADM1 counts; Set Target deficits and balance; All-Africa delta and zero repeat; Add N scope; Distribute N exact sums; pending counted; activation caps; gender interleave; Control Room inheritance/override/reset, validation and spend ceiling; priority group seeded; set-target job exact + idempotent + existing identities untouched + nothing posted; Add N only selected; two admins at once → one job; kill mid-job → resume without duplicates (`restarts=1`); pause/resume between batches; activation/pause/resume and staff holds; rollback deletes only never-used identities; settings persist, conflict refused, audited; engine routes load fractional/NULL data (regression); sentence openers not entities (regression); spend guard (total, daily, per-country, kill switch, reservations).
* **Playwright `apps/web/tests/e2e/v17.spec.ts` (10)**: V17-01 feed-first at 1440 and 390 with inline promo below posts; V17-02 Log in/Sign up same domain with return path, mobile drawer auth; V17-03 every footer link 200, ©, language control; V17-04 admin APIs 401/403, missing CSRF and foreign Origin 403, member redirected to /forbidden; V17-05 Population Manager UI: two countries, Add 3, exact preview, launch, completed, unselected unchanged, new identities registered with ADM1 and disclosure; V17-06 Control Room override reviewed, reason required, persisted across reload, inherited elsewhere; V17-07 Local Pulse NG 37 / KE 47 / SN 14 / GH 16 / EG 27 regions, click region, layer switch; V17-08 Exchange link, term popover, founder readiness; V17-09 committed agent vote updates score live with highlight; V17-10 password reset (generic answer, single-use link, sessions revoked, new password works).
* Older specs updated where v1.7 deliberately changed the contract (homepage hero/counters/Exchange band → About page / right rail / inline promo; "rails follow the edition" now checks the inline promo; S01 now requires the first post in the first phone viewport).

## Runs during v1.7 (honest history)
| Run | typecheck | vitest | pytest | Playwright | Notes |
|---|---|---|---|---|---|
| 20261011T200314Z | PASS | 71 | 142 + 1 fail | 57 / 69 run, 12 failed | Overlapped with run 2, which reset the E2E stack mid-run; one real NULL-scan bug in the engine route (fixed) |
| 20261011T201344Z | PASS | 71 | 143 | stack failed to start | My hook edit made the test PocketBase reload during seeding |
| 20261011T203321Z | PASS | 71 | 144 | 72 / 80 run, 8 failed | Real regressions: Sign-up button contrast (WCAG), collapsed region list, admin gaps table, wording, edition-aware Exchange link; test timeout |
| 20261011T204805Z | PASS | 71 | 144 | 90 / 92 run, 2 failed, 5 not run | V17-05 test bug on a fresh stack (no prior job row); language-menu click before hydration (flaky under load) |
| 20261011T211628Z | PASS | 71 | 145 | 96 / 97, 1 failed | V17-10 raced the reset email (both answers are identical by design); fixed + V17-06/09 made re-runnable |
| **20261011T213751Z (canonical, `HEAD` at start of run)** | **PASS** | **71** | **145 (+3 skipped)** | **97 / 97** | all v1.3–v1.6 regressions + 10 v1.7 scenarios |
| after canonical: SSE hub on PocketBase realtime | – | – | – | v13 + v14 + v17 specs 43 / 43 on a freshly built stack | plus a 12-vote latency probe: every vote reached the SSE client before its own HTTP response returned |

## Other verification
* Responsive sweep: 6 pages × 9 widths × 2 themes, overflow and first-post position (ADMIN-UX-REVIEW.md).
* Live operator flow recorded on the dev dataset (`screenshots/founder-acceptance-activation-and-control-room.webm`).
* 26,060-identity job with a real `kill -9` and resume (POPULATION-JOBS.md).
