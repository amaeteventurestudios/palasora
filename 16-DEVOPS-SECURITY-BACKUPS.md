# 16. DevOps, ARM64 deployment, private networking, security and disaster recovery


> **v1.2 local-first execution override:** The current build target is **the founder's Mac**, not Oracle. Read `21-LOCAL-FIRST-DEVELOPMENT.md`. Everything below involving Oracle commands, inventory, private staging, firewall, SSH or Caddy is a **future Phase 6 guide ONLY after separate explicit approval**. No SSH, Oracle API calls, uploads or staging containers on Oracle in phases 0–5. Do not confuse compiling an ARM64 image with deploying it.

## Mac development/acceptance operations (phases 0–5)

1. Audit local CPU architecture/macOS/storage/RAM/ports/toolchain/Docker daemon, then audit OpenMolt/PocketBase licenses and source rights. Do **not** run the Oracle preflight below now.
2. Create Mac-native or Docker Compose developer services (`web`, `pocketbase`, `editorial`, `analytics`) in isolated local workspace. Web is at `http://127.0.0.1:3000` where available. Native PocketBase and FastAPI listen only on `127.0.0.1`; container internal ports remain on a private bridge. Never bind admin/API ports to the Mac's public interfaces.
3. For Mac builds, verify supported architecture without assuming Apple Silicon. If the Docker daemon is unavailable, choose safe native local startup, document a Compose fallback and do not force QEMU packages without need or approval. Portable multiarch Dockerfile/Compose build assets still must be prepared for **eventual** Oracle ARM64.
4. Keep developer secrets in non-versioned local env/OS key store. `.env.example` contains placeholders. Local fixture adapter is default for sponsors/CRM and model unit tests. Optional real private Qwen calls can be made through existing Tailscale only if functioning; no changes to Simeon's host.
5. Run real browser E2E, unit/integration, responsive/accessibility, source/editorial QA, local tenant isolation, backup/restore, resilience and local load tests. Record Mac resource usage, not fictional Oracle measurements. Keep test data separately named and prevent public indexing.
6. End with `docs/evidence/LOCAL-ACCEPTANCE.md` and release artifact inventory. **Stop without uploading files or connecting to Oracle.** Next steps require explicit approval for a separate private Oracle staging phase, and later separate approval for public launch.


## Operating state and safeguards

At 2026-10-08 handoff: Oracle VM `palavva-prod` display name, SSH hostname `palavva-vnic`, Ubuntu 24.04.5 LTS ARM64, VM.Standard.A1.Flex 2 OCPUs / 12 GB configured RAM, public IPv4 `129.146.26.28`, SSH user `ubuntu`, Docker and Compose previously working, Tailscale previously online. Qwen at Simeon's iMac `100.70.149.32:11434` via tailnet, previously one successful completion. These are **historical checks, not a live scan now**. No Palavva application, PocketBase, source worker, domain DNS or public HTTPS had yet been deployed. Revive/EspoCRM are separate existing Hetzner services and unrelated production workloads must be preserved.

**Nonnegotiable:** preflight inventory **before changes**, back up config, no blind firewall replacement, no public exposure of PocketBase, worker, analytics, Ollama or Docker sockets. No public DNS, paid services, internet ingress 80/443 or destructive changes without explicit founder approval. Avoid extracting, printing, copying or committing private key contents. Mac-local known SSH key alias `~/.ssh/palavva_oracle` (available only if user agent operates on Mac); connection shape `ssh -i ~/.ssh/palavva_oracle ubuntu@129.146.26.28`. Do not request SSH password in chat. Check Tailscale ACLs before assuming tailnet peers trusted.

## Future Oracle Phase 6 preflight read-only checklist (NOT permitted during Mac-first build)

1. `hostnamectl`, `uname -m`, `free -h`, `df -h`, `docker --version`, `docker compose version`, `docker ps`, `ss -lntp`, `iptables -S` and `ip6tables -S`, `tailscale status`, `tailscale ping` with private host. Capture timestamp/command output to evidence with secrets masked.
2. Inspect Oracle VCN Security Lists/NSGs and default firewall behavior via permitted read-only UI/API. `ufw` was historically absent; **do not** run script that assumes UFW active. Docker can bypass naive host firewall policies; use verified binding, DOCKER-USER rules when appropriate, Oracle security layer and actual external port scans.
3. Verify storage/billing/free tier state through authorized Oracle management access. No assumption that VM remains free or reserved forever. Record CPU/RAM/space available and any other projects on node.
4. Check health of Revive/EspoCRM with **read-only** access; do not restart shared Hetzner services. Qwen single test with bounded `num_predict`, infer speed and safe response, not stress test without permission.
5. Inspect code upstream, image manifests/ARM64 support, license/SBOM and environment; create branch and rollback snapshot before migrations.

## Future Oracle private-staging deployment design (after explicit founder approval)

- Deploy `/srv/palavva/staging` or user-owned safe equivalent on **Oracle** using version-pinned ARM64 or multiarch images in `docker-compose.staging.yml`. File/volume permissions set to non-root where possible, immutable runtime images and explicit health checks.
- Use isolated Compose project name `palavva_stage`; private bridge network for app/PocketBase/worker/collector. Publish **only** a loopback staging web interface `127.0.0.1:PORT` while unauthorised for internet ingress. Access via permitted SSH tunnel or Tailscale Serve after reviewing tailnet access policy; do not call it publicly accessible if not tested.
- Domain `/` and `palavva.com` remain unchanged until manual launch approval. If later approved, run Caddy HTTPS with explicit real host and tested network 80/443 ingress, cert issuance, canonical redirects and monitoring. Avoid speculative DNS changes.
- Keep dedicated volumes for `pb_data`, `jobs_data`, `analytics_data`, `uploads`; mounts and permissions consistent with PocketBase/worker ownership, not world writable. Never put DB files on shared NFS. No Postgres/Redis unless an audit ADR proves mandatory.
- `Caddy` may be included in staging on internal host only; for production configure clear reverse proxy route to Next.js and security headers. Avoid subpath-based exposure of PocketBase admin. Enable HSTS only after correct HTTPS production behavior verified.
- Production Docker images can be built on capable dev Mac or appropriate arm64 builder, pushed to preapproved registry or copied securely; version/digest pinned, checksums/SBOM captured. No giant compile/test builds on constrained live node during traffic.

## Minimal Compose architecture sketch (not production-ready YAML)

```yaml
name: palavva_stage
services:
  web:
    image: registry.example.invalid/palavva-web@sha256:REPLACE_WITH_REAL_DIGEST
    environment:
      NODE_ENV: production
      POCKETBASE_INTERNAL_URL: http://pocketbase:8090
      EDITORIAL_INTERNAL_URL: http://editorial:8000
    ports: ["127.0.0.1:3100:3000"]
    networks: [internal]
  pocketbase:
    image: registry.example.invalid/palavva-pocketbase@sha256:REPLACE_WITH_REAL_DIGEST
    volumes: ["pb_data:/pb/pb_data"]
    networks: [internal]
  editorial:
    image: registry.example.invalid/palavva-editorial@sha256:REPLACE_WITH_REAL_DIGEST
    volumes: ["jobs_data:/data/jobs"]
    networks: [internal]
  analytics:
    image: registry.example.invalid/palavva-analytics@sha256:REPLACE_WITH_REAL_DIGEST
    volumes: ["analytics_data:/data/analytics"]
    networks: [internal]
networks:
  internal: {internal: false}
volumes:
  pb_data: {}
  jobs_data: {}
  analytics_data: {}
```

**Important:** example image names/digests are **placeholders** and must be replaced with built pinned artifacts; internal network `internal:false` means outbound access allowed for update/source/Tailscale under host policy but ports aren't automatically exposed. Secure service-to-service routing, health checks, secrets, filesystem restrictions and resource limits must be supplied in real Compose config. If Tailscale/Ollama reachability from container requires host network routing, configure minimally and document; do not change all tailnet peers or expose Ollama as host public port.

## Secrets handling

- Required runtime secret names in `.env.example` with placeholder values only: `PB_INTERNAL_SERVICE_TOKEN`, `PB_SIGNING/SESSION_SECRET` as appropriate to actual SDK, `OLLAMA_BASE_URL`, `ESPO_API_KEY`, `REVIVE_ZONE_CONFIG`, `ANALYTICS_HASH_SECRET`, `BACKUP_REPO_KEY`, optional `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`. Actual integration env vars adjusted after upstream audit, not copied blindly.
- Key values available only to server-side least-privileged processes through secure env files (chmod 600), OS secret manager or approved Compose secrets, never to Next.js `NEXT_PUBLIC_*`, logs, model prompts, browser or published spec ZIP.
- Mask all secrets in terminal captures, screenshots, CI artifacts and generated reports; rotate if ever exposed. Separate staging from live credentials and tenants.

## Security checklist

- Session/cookie security, CSRF origin validation, proper OAuth/email verification and rate limiting; no open redirects and no public PocketBase superuser API.
- Input schema validation, parameterized SQL/FTS, stored/reflective XSS prevention, HTML/Markdown sanitization, strict image/upload content validation and anti-malware size limits.
- RSS URL SSRF protections including redirects and DNS rebinding; no local/private/cloud-metadata targets or unapproved file schemes. Treat RSS and archives as untrusted text against prompt injection.
- Tenant-aware authorization for reads/writes/caches/attachments and indirect foreign keys; admin routes server-enforced, no browser-only permission controls.
- Security headers/CSP accommodating narrowly audited Revive tags; privacy/cookie controls consistent with actual code. External URLs with proper rel attributes as needed.
- Minimal network exposure, test from unauthenticated external vantage point with approval, Docker socket never mounted in application container.
- Backups encrypted at rest/in transit, server credentials scoped, monitoring on disk pressure and backup failures, staged restore exercises.
- Publication kill switch and approval gate; never let worker secretly publish high-risk AI stories.

## Backups and recovery

**Before any data migration:** make tested recoverable snapshot. SQLite files must be backed up using PocketBase's supported backup API/SQLite online backup or safe point-in-time method, not copying an actively written WAL database in an inconsistent state. Include uploads, migration files, tenant branding, job queue state, approved source registry and necessary configuration manifests; secrets separately secured, not shoved into public ZIP. Compress/encrypt and ship **off-host** to a verified storage destination. Initial plan: at least daily DB backups plus pre-deploy snapshots, retain daily/weekly copies per policy and storage budget. Actual cadence/retention finalized by operator after measuring growth and compliance duties.

**Restore drill:** take clean staging backup; isolate new restore environment; verify DB integrity, counts, tenant isolation, sample URL source/provenance, approved content, file attachments and job queue idempotency; compare checksums; record elapsed time, missing files and recovery point. Do not claim disaster recovery before **successful restore test**. RPO/RTO remain **not yet validated**, not fake commitments.

## Monitoring / operational runbook

`health`: HTTP SSR 200, internal PocketBase status, worker heartbeat/queue lease, source freshness, Tailscale Ollama ping/inference status, analytics buffer lag, Revive/Espo bridge check, disk free/inodes, WAL size, failed backups, Caddy cert age, error rates. Disable expensive constant model pings. Log structured `request_id, tenant_id, actor_type, outcome` with no personal secrets. Provide admin alarms for nonzero dead-letter backlog, stalled publishing/reviews, repeated Qwen timeout, backup miss and disk threshold.

**Incident recipes:**
- Qwen unavailable: pause AI jobs and show queue delay; do not pay for cloud automatically.
- RSS broken: source disabled with audit, retry after backoff, no fabricated content.
- High load/SQLite locked: cap writes, downgrade optional analytics, preserve public read, measure. Consider database migration only after proof.
- Revive/Espo down: no ads/inquiries local safe fallback; leave other Hetzner workloads alone.
- Source correction/takedown: freeze affected story, show appropriate status, update share metadata, preserve correction log and rights obligations.
- Host disk low: pause AI/events, rotate permitted logs and uploads according to retention, preserve backups before cleanup.
- Security incident: restrict ingress, preserve audit, revoke relevant tokens, restore verified version and notify appropriate stakeholders under incident policy.

## Future public-launch change gate (separate approval from Oracle staging)

After *staging acceptance report* and **explicit approval**: registrar/DNS decisions, Oracle 80/443 ingress authorization, cert provisioning, public host and Caddy config, final legal/privacy publication, actual licensed source policy, Google Search Console verification, live ad privacy validation and privacy/tracking consent, external monitoring. Make reversible changes with DNS TTL/rollback. Do not declare production live based solely on Docker green lights.
