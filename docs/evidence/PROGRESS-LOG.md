# Overnight build progress log

Times are US Pacific, 2026-10-08/09. Newest entries last.

- **21:45** Read the binding specs (19, 21, 01, 03–09, 11–14, 16–18, 20 and the relevant handoff sections).
- **21:48** Mac inventory: x86_64 i7, macOS 12.7.6, 32 GB, **34 GB disk free**, Colima Docker, no buildx. Unrelated apps occupy 8090/3100, so Palavva uses 3000/8190/8100.
- **21:49** Qwen `qwen3.5:4b` reachable over Tailscale (DERP relay, ~130 ms). Read-only tags probe only.
- **21:50–21:55** OpenMolt audit at `1be0e28`: MIT, Next 14.1/Express/Postgres, 3 failing tests, typecheck failure, 21 advisories. Decision: Path B (no code copied).
- **21:56** PocketBase v0.40.5 pinned, SHA-256 verified. Web deps pinned; `pnpm audit`: 0 known vulnerabilities. Respected the pnpm minimum-release-age policy.
- **22:00** Schema migration for all `09` collections, plus DB hooks: tenant immutability, append-only audit, and a publish gate requiring a recorded human approval from an editorial role.
- **22:05** Idempotent seed done. Commit `05cdcb0`.
