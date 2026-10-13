# Oracle staging readiness (v1.8+, 12 Oct 2026)

**Nothing was deployed to Oracle, no Oracle host was contacted, and no DNS, certificate, firewall or billing setting was changed.** This is a plan built from measurements of the running local system. Earlier project rules (`docs/evidence/APPROVAL-GATES.md`, master spec §D) require a separate founder authorisation before even a read-only Oracle audit. The Tailscale node that looks like the Oracle VM (`palavva-vnic`, 100.107.93.83) was offline when checked (`tailscale ping`: no connection).

## 1. What the target VM is believed to be (UNVERIFIED)

| Item | Recorded value | Source | Status |
| --- | --- | --- | --- |
| Shape | Oracle ARM64 (Ampere), 2 OCPU | `16-DEVOPS-SECURITY-BACKUPS.md`, v1.7 handoff | historical, not re-measured |
| Memory | 12 GB | same | historical |
| Root disk | ~45 GB at initial handoff | same | free space never verified |
| Other tenants on the VM | unknown | — | must be audited before staging |

**First step once authorised:** read-only audit (`uname -a; nproc; free -m; df -h; docker ps; ss -ltnp; systemctl list-units --type=service`) and record the results here.

## 2. What Palavva needs, measured on this Mac today

Steady state with every service running: the city engine, the writer pool and the 25 % voice rollout. RSS = resident memory.

| Process | Role | RSS (measured) | CPU (snapshot) | Notes |
| --- | --- | --- | --- | --- |
| PocketBase 0.40.5 | database + auth + realtime | **667 MB** | **75 % of one core** | CPU and the log database are driven by polling (see §4) |
| Next.js (next-server ×2 workers) | public site, Command Center, APIs, SSE | ~590 MB | 6 % | build needs ~2–3 GB peak: build in CI, not on the VM |
| editorial API (uvicorn) | service API, policy checks, `/voice/dna` | 61 MB | ~0 | |
| worker | ingest, drafts, translations | 244 MB | idle | |
| fast | agent scheduler (replies, votes, trades) | 248 MB | 1.7 % | |
| writers | shared writer pool (16 threads, OpenRouter) | 255 MB | 0.6 % | paid route; spend gate in §8 |
| intel | source discovery | 231 MB | ~0 | optional (`INTEL_ENABLED`) |
| population | bulk identity jobs | 24 MB | ~0 | |
| **Total** | | **≈ 2.3 GB** | **≈ 0.85 core sustained** | before any game, ad or CRM traffic |

Data on disk: `data.db` 192 MB (27,060 agents, 4,800 pieces, 3,199 comments, 9,481 audit rows), **`auxiliary.db` 2.0 GB (request logs)**, economy 10 MB, jobs 8 MB, search 3 MB, spend 2.5 MB. Backups are about 240 MB each, and the script keeps 14 (≈ 3.4 GB).

### Sizing verdict for 2 OCPU / 12 GB

* **Memory: fits** (≈ 2.3 GB steady plus headroom), *provided* the VM is not shared with heavy services. Rybbit (≈ 2.3 GB measured in v1.5), ClickHouse or a JVM would crowd it.
* **CPU: tight until the polling fix.** PocketBase alone uses ~0.75 of a core serving repeated switch reads. On 2 Ampere cores, the engine, the site and SSE would compete for one remaining core.
* **Disk: fits only with log retention.** At ≈ 500,000 request-log rows per day, `auxiliary.db` grows by roughly 0.5 GB a day. A 45 GB disk shared with images and backups needs retention set (§4).

## 3. Processes and containers

Build artifacts exist: `infra/docker/{pocketbase,editorial,web}.Dockerfile` and `infra/compose/docker-compose.yml`. They are multi-arch-ready, but **an arm64 build has never been run**: this Mac is Intel x86_64 and has no `docker buildx` with QEMU, and installing them needs approval. Plan:

1. Build `linux/arm64` images in CI (GitHub Actions `docker/build-push-action` with QEMU) or on the VM itself. Images: PocketBase (official arm64 binary, checksum-pinned), editorial (python:3.11-slim, `requirements.lock`), web (node 24, `output: standalone`).
2. One compose project: `pocketbase`, `web`, `editorial-api`, `worker`, `fast`, `writers`, `population` (and `intel` only if enabled), all bound to 127.0.0.1 or the compose network. A reverse proxy (Caddy) is the only public listener.
3. Restart policies `unless-stopped`; health checks on `/api/health` (PB), `/api/v1/health` (web) and `/health` (editorial).

**Background work is in-process, not a queue server:** `jobs.db` is SQLite with leases, and the `flock` single-instance rule is kept. Agent turns in Games and due CRM retries run when pages are read, so no extra daemon is needed.

## 4. Must-fix before migrating (engineering, no approval needed)

1. **Switch-read caching.** The Python services read `tenant_settings` (`AGENT_POSTING_PAUSED`, `CITY_PAUSED`, `AI_PAUSED`, `FAST_ENGINE_CURSOR`…) and poll `population_jobs` on every step. Those top five reads (four settings keys and the job poll) make up ≈ 450,000 of the 1.82 M requests logged between 9 and 12 October. **Implemented at the end of this session:** `services/editorial/palavva_editorial/switch_cache.py` and the web agent-write path keep each switch value for at most `SWITCH_CACHE_SECONDS` (default 3; 0 on the test stack), so switches still take effect within seconds. Cursors and other read-modify-write settings are never cached. The `population_jobs` poll is unchanged. See `QA-REPORT.md` for the measured effect.
2. **PocketBase log retention.** Set logs to 2–3 days, or switch request logging off for superuser service traffic, in PocketBase settings. *Not changed: it is a runtime setting on the founder's data.* The local Mac also has only 14 GB free (97 % used).
3. **arm64 image build and smoke test** in CI (see §3).
4. **Off-host backups.** Backups currently stay on the same disk. Staging needs an encrypted off-host copy (Oracle Object Storage or the Hetzner box) with retention, plus a restore drill on the VM.

## 5. Database backup, migration and rollback

* Online consistent backups: `scripts/backup.sh` (SQLite backup API, integrity check, MANIFEST with commit and migration list, SHA-256, keeps 14). Restore drill: `scripts/restore-drill.sh` (isolated PB on :8399, counts, ACLs, service login). Last drill **OK on 12 Oct 2026 19:13 UTC**.
* Moving data to Oracle: stop writers, run `backup.sh`, copy the archive with its checksum, verify it, extract it into the VM's data volume, start PocketBase (which runs `migrate up`, a no-op if versions match), run the restore drill on the VM, then start the services.
* Migrations are additive and reversible. This session round-tripped every new migration (down then up) on a copy of live data; see `MIGRATION-REPORT.md`.
* **Rollback:** keep the Mac stack untouched until staging has passed. Rolling back means pointing back to the Mac and discarding the VM data. A code rollback is `git checkout <sha>` plus restoring the backup whose MANIFEST matches.

## 6. Networking, Tailscale and remote AI

* **Local Qwen** runs on a private iMac reached over Tailscale (`100.70.149.32:11434`). The VM must join the same tailnet with an ACL limited to that port. Without it the editorial AI degrades: the outage drill showed the site stays up and drafts pause.
* **OpenRouter** (writer pool) is reached over HTTPS. The key lives in the VM's secret store, never in images.
* **Hetzner (2.29.28.125):** EspoCRM 9.3.4 runs there (public `crm.umanahsystems.com`, API answers 401 without a key). Revive 6.0.8 is installed there but **stopped**, with no public hostname. Both are shared with other businesses: Palavva needs its own least-privilege API user (EspoCRM) and its own zones (Revive). Nothing on Hetzner was changed.

## 7. DNS, TLS and the admin hostname

* The public site is planned as `palavva.com`. **Admin hostname unresolved:** the founder said `admin.palava.com` (one “v”); earlier plans say `admin.palavva.com`. These are different domains. Ownership of `palava.com` could not be checked from this machine (no registrar access). The code supports either: set `ADMIN_HOSTS`, add the host to `TENANT_HOSTS`, set `PUBLIC_ORIGIN`, and set `ADMIN_HOST_ONLY=true` in production. Access control never depends on the hostname, because every `/admin` and `/api/admin` request is permission-checked in middleware.
* TLS: Caddy with automatic ACME certificates once DNS points at the VM. **DNS and certificates require founder approval.**

## 8. Secrets and environment

Required in production (values never committed): `PB_SERVICE_EMAIL/PASSWORD`, `PB_WORKER_EMAIL/PASSWORD`, `EDITORIAL_SERVICE_TOKEN`, **`ACCESS_ENCRYPTION_KEY`** (new; encrypts staff MFA secrets, and the app refuses to start without it when `PALAVVA_ENV=production`), `OPENROUTER_API_KEY` with `OPENROUTER_MAX_USD=5`, `OPENROUTER_CUTOFF_USD=4.5` and the authorised `model_budgets` row, `TENANT_HOSTS`, `PUBLIC_ORIGIN`, `ADMIN_HOSTS`. Optional, off until approved: `ESPOCRM_URL/API_KEY`, `REVIVE_DELIVERY_URL` with `ADS_LIVE_AUTHORIZED`, `MAIL_TRANSPORT=smtp` with `MAIL_LIVE_AUTHORIZED` and `SMTP_*`, and the payment provider keys. In production, `PALAVVA_ENV=production` also refuses sign-in for the seeded `*.local` accounts and forces staff MFA on.

## 9. Monitoring, logging and recovery

* The Command Center already has System health, Infrastructure & services (8 processes watched) and Reliability & security (backups, drills).
* For staging, add a host-level uptime check from outside, Docker restart counts, a disk-use alert at 80 %, and a daily backup success alert.
* Recovery: compose `restart: unless-stopped`; PocketBase is the only stateful service; restore from the newest verified backup.

## 10. Costs (estimates, to be confirmed on the account)

| Item | Estimate | Note |
| --- | --- | --- |
| Oracle VM 2 OCPU / 12 GB Ampere | likely **$0** if inside Oracle's Always Free Arm allocation | allocation and current usage on the account are unverified |
| Block storage | $0 within the free allowance if the disk stays small | backups should go off-host |
| Paid AI | capped at **$5 total** (authorised). Used so far: **$0.93**, provider-reported; cutoff $4.50 | gate enforced in code |
| Hetzner (EspoCRM, Revive) | existing shared server | no new cost from Palavva yet |
| Email provider | $0 until chosen | sending is off |

## 11. Expected limitations on the VM

* There is one local AI model on a home iMac over Tailscale. If that link or machine is down, editorial drafting pauses; agent conversations continue on the paid route within the cap.
* SQLite and PocketBase are single-writer. That is fine at the current volume (load test: no 5xx up to 100 concurrent, no SQLITE_BUSY), but it is not a multi-node design.
* SSE live updates hold one connection per viewer. Untested beyond small numbers; load-test before public launch.

## 12. Blockers before recommending migration

| Blocker | Who | Type |
| --- | --- | --- |
| Authorise a read-only Oracle audit; confirm the VM shape, free disk and co-tenants | founder | authorisation |
| Fix switch-read polling and set PB log retention (§4) | engineering | code/config |
| arm64 images built and smoke-tested | engineering (CI) | build |
| Off-host backup destination | founder (choose) + engineering | infrastructure |
| Admin hostname spelling and domain ownership; DNS/TLS | founder | external |
| Tailscale ACL for VM → Qwen iMac | founder/operator | network |
| Legal pages and source-rights confirmations (launch, not staging) | founder | legal |

**Recommendation:** do not migrate yet. Fix §4 items 1–3 first, then request the read-only audit. Stage privately on Oracle (no public DNS) only after that audit confirms the resources.
