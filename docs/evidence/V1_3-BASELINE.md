# v1.3 baseline (observed 2026-10-09 ~09:30 PT, before any v1.3 change)

**Last commit before v1.3:** `b98e39f` (overnight report); v1.3 specs committed as `c9049ed`. Branch `main`, no remote configured. **Safety backup:** `backups/palavva-20261009T163013Z.tar.gz` (sha256 `fbb6afeb…1ee0`-style file alongside).

## Services (all loopback)

| Service | Port | State |
| --- | --- | --- |
| Next.js (production build) | 127.0.0.1:3000 | running |
| PocketBase 0.40.5 | 127.0.0.1:8190 | running |
| Editorial API | 127.0.0.1:8100 | running |
| Editorial worker | n/a | **stopped by me** at baseline so old-style drafting stops consuming Qwen budget during the refactor |
| Qwen (Simeon's iMac, Tailscale) | 100.70.149.32:11434 | reachable |

Disk: 29 GiB free (94% used). Policy flags: Oracle/public launch/paid fallback all `false`.

## Actual behavior vs. the overnight claims

- **Confirmed:** last canonical test run (`docs/evidence/test-runs/20261009T065138Z`): typecheck clean, vitest 17/17, pytest 39 passed + 3 opt-in skipped, Playwright 32/32.
- **Data since the report:** the worker kept ingesting SAnews through the morning. Now 24 real source items, clusters: 2 drafted, 8 held, **14 open with queued `draft_cluster` jobs deferred by `DAILY_BUDGET_EXHAUSTED`** (100/day per tenant reached).
- **Editorial queue:** 2 real Qwen drafts `needs_review` (Mandela Bay housing: low risk, `NEEDS_REVIEW` for an uncited sentence; industrial/procurement targets: **high** risk, `PASS`). 7 published items are all demo fixtures (`is_demo=true`). No real story has been published.
- **AI participation today:** AI role contributions exist only as flat "AI analysis" cards (max 3) under a piece; there is **no nested reply tree, no AI-to-AI replies, no autonomous publication and no realtime**. This is the main gap v1.3 addresses.
- **Why output was held:** (1) policy, since every piece required human approval; (2) the 4B model abstained in 20/31 researcher calls with headline+excerpt evidence; (3) the classifier set any government/policy mention to HIGH risk, so most SAnews items could never qualify as low risk.
- **Locale/geo:** English only; no edition/language preferences; countries only at ISO level; no subnational geography; one blended "New publications" rail; no trending computation.

## Decision on the existing held drafts

Under the new policy they are **not** auto-released. Mandela Bay has a validator flag (`UNCITED_SENTENCE`), so it fails the LOW/evidenced gate and stays in the exception queue. Industrial targets is HIGH risk, so mandatory human review remains. Both stay for the founder.

## Known open risks carried in

DNS-rebinding window in the fetcher (ADR-012), which is now addressed in v1.3; no off-host backup; no ARM64 build; Terms/Privacy placeholders.
