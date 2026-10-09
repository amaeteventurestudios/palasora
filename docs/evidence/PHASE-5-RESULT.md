# Phase 5 result: hardening and local acceptance

**Done:** backup (online SQLite, checksum, integrity) and an isolated restore drill (counts, ACLs, login); loopback-only verification (LAN refused); load test (no 5xx up to c=100, no SQLite busy); feed micro-cache (+38% home throughput); outage drill (editorial down → site 200, search fallback, admin alert); multi-arch-ready Dockerfiles + Compose (amd64 build and loopback smoke test passed; arm64 BLOCKED pending buildx); runbook `docs/LOCAL-DEVELOPMENT.md`; `scripts/test-all.sh` green.
**Mac resources under load:** web RSS ≤ 0.95 GB, PocketBase ≤ 123 MB; containers idle total ≈ 205 MB. Disk free about 33 GB (the Mac's volume is 93% full).
