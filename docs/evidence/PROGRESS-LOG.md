# Overnight build progress log

Times are US Pacific, 2026-10-08/09. Newest entries last.

- **21:45** Read the binding specs (19, 21, 01, 03–09, 11–14, 16–18, 20 and the relevant handoff sections).
- **21:48** Mac inventory: x86_64 i7, macOS 12.7.6, 32 GB, **34 GB disk free**, Colima Docker, no buildx. Unrelated apps occupy 8090/3100, so Palavva uses 3000/8190/8100.
- **21:49** Qwen `qwen3.5:4b` reachable over Tailscale (DERP relay, ~130 ms). Read-only tags probe only.
- **21:50–21:55** OpenMolt audit at `1be0e28`: MIT, Next 14.1/Express/Postgres, 3 failing tests, typecheck failure, 21 advisories. Decision: Path B (no code copied).
- **21:56** PocketBase v0.40.5 pinned, SHA-256 verified. Web deps pinned; `pnpm audit`: 0 known vulnerabilities. Respected the pnpm minimum-release-age policy.
- **22:00** Schema migration for all `09` collections, plus DB hooks: tenant immutability, append-only audit, and a publish gate requiring a recorded human approval from an editorial role.
- **22:05** Idempotent seed done. Commit `05cdcb0`.
- **22:50** Phase 1 public app: all routes from 03 return correct status; typecheck clean. Commit 733ce0c.
- **23:35** Phase 2 editorial service built. Real Qwen probe: 3.4 s, schema-valid JSON. pytest 38/38 (unit + integration against an isolated PocketBase). Commit 804f028.
- **00:55** E2E 26/26 passing on isolated test stack; vitest 17/17; pytest 38/38. Fixed real bugs found by tests: duplicate dialog label ids, stale layout after sign-in (server-action redirect render), same-page hash reload, concurrent vote delete. Commit 438cb70.
- **00:05 (10-09)** Evidence documents complete; production stack restarted for review; final backup + restore drill OK. Report: OVERNIGHT-BUILD-REPORT.md.

## v1.3 (2026-10-09, US Pacific)

- **09:30** Baseline recorded and backed up (`V1_3-BASELINE.md`). v1.3 specs committed (`6120cfa`).
- **10:00–10:30** Conversation engine, database gate automated path and migrations (`b850f60`). Real-Qwen prompt tuning; the root cause of 100% abstention was schema field order.
- **10:05** Live timed demo: 4 real-Qwen replies, nested to depth 3, arriving in the browser without reload (`edbd8e2`).
- **10:30–11:00** Built:
  - locale registry, translations and fidelity gate;
  - geoBoundaries maps and geography classifier;
  - Global Voices sources (`9aab332`);
  - frontend for locale, trends, Local Pulse, Explore Africa, My Africa and admin QA (`e560903`).
- **11:00–12:00** v13 E2E suite added. Fixed:
  - 320 px header and RTL skip-link overflow;
  - researcher-v3;
  - language detection;
  - test-stack worker.
- **11:20–11:50** Acceptance found and fixed:
  - the invented "Ntshau" headline (2 topics withdrawn, public correction);
  - an ignored env kill switch;
  - an open DNS-rebinding window;
  - broken stem keywords;
  - dishonest pending state for failed and blocked translations;
  - RTL menus;
  - test-infrastructure races (`47b41a0`).
- **14:20** Canonical run `20261009T212100Z`: typecheck clean, vitest 27/27, pytest 66 (+3 opt-in skipped), Playwright 53/53. Backup and restore drill OK.
- **14:40** Rejected translation output kept for editor correction; colon-capitalisation fix. Evidence docs written: decisions, conversation demo, locale and pulse demo, 79-row matrix, acceptance, deployment state, report.
