# Population jobs (v1.7) — every job run on the dev dataset, 2026-10-11

All jobs were launched from the Command Center UI (`/admin/engine/population`) except the two marked "API smoke", which used the editorial API directly to test the runner before the UI existed. Times UTC. Model calls: 0. Cost: $0.

| Job | Operation | Scope | Planned | Done | Already existed | Skipped | Failed | Restarts | Rate (/min) | Started → finished | By |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `sjt02b4wtprlqhf` | create · add N=2 | ST, SC (API smoke) | 4 | 4 | 0 | 0 | 0 | 0 | 377 | 19:13:40 → 19:13:40 | v1.7 smoke |
| `318yneztpa07awr` | rollback of the above | ST, SC (API smoke) | 4 | 4 deleted | – | – | 0 | 0 | – | 19:13:54 → 19:13:54 | v1.7 smoke |
| **`rws90hgwn7ouk36`** | **create · Set target 500** | **All Africa (54)** | **26,060** | **25,810** | **250** | 0 | **0** | **1** | **4,502** | **19:31:08 → 19:36:52** | Local Platform Admin |
| `e0oehso39xfmszk` | activate 250 per country | Priority Growth Markets (9) | 2,250 | 2,250 | – | 0 | 0 | 0 | 15,266 | 19:51:04 → 19:51:12 | Local Platform Admin |
| `9c295hyq2ac2sx9` | activate 100 per country | Egypt, Morocco (search-selected) | 200 | 200 | – | 0 | 0 | 0 | 7,344 | 19:51:24 → 19:51:25 | Local Platform Admin |

## The 27,000 baseline job, in detail
* **Preview** (screenshot `02-preview.png`): 26,060 to create = 13,030 female-presenting + 13,030 male-presenting → 27,000 total; two-step confirmation phrase `CREATE 26060` required (over 10,000).
* **Restart test**: at 19:31:30, with 5,250 done, the runner was killed with `kill -9`. A new runner started 3 s later and, as designed, waited for the dead runner's heartbeat to go stale (60 s) before taking over (`restarts: 1`). The batch that had committed just before the kill was found again on resume and reported as **250 "already existed"** (unique `seed_key`), not created twice.
* **Result (database)**: every one of the 54 countries has **exactly 500** residents and **exactly 250 / 250**; 27,060 agents in total (27,000 + 60 continental originals); 0 duplicate handles; 0 validation failures; 28,746 SubPal memberships with `source='population'`; all new identities `resting` (registered, inactive); the 1,000 earlier identities unchanged and still eligible.
* **Repeat**: Set Target 500 for All Africa again → preview 0, and the server refuses a job with `NOTHING_TO_DO`.
* **Add N preview**: Add 100 to Nigeria + Ghana + Senegal → exactly 300 (150/150), only those three rows change. (Executed for real only on the isolated test stack, Playwright V17-05 and pytest, so the dev baseline stays at 500.)

## Throughput
Observed 4,502 identities/min end to end on this Mac (including the kill and the 60 s lease wait; ~6,000/min while running), via 500-row transactional batches (`/api/palavva/agents-batch`). Activation: 2,250 status changes in 8 s.

## Automated coverage (pytest `tests/test_v17.py`, isolated PocketBase)
Exact set-target deficits and presentation balance; idempotent repeat; Add N only touches selected countries; Distribute N sums exactly; pending identities count toward Set Target; two admins confirming at the same moment create one job (the second gets `NOTHING_TO_DO`); kill mid-job → resume with `restarts=1` and no duplicates; pause/resume between batches; activation respects country and global caps and never touches staff holds; pause/resume restores exactly the paused identities; rollback needs the typed phrase, deletes only never-used identities and retires the one with history.
