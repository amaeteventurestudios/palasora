# 20. Unverified checks, real risks and non-blocking implementation defaults

## Principle


**Execution override:** Founder subsequently required the app to be built and tested on the Mac before sending anything to Oracle. No Oracle connectivity, SSH or deployment in phases 0–5. Use `21-LOCAL-FIRST-DEVELOPMENT.md`. Keep Oracle billing/firewall risks for approved Phase 6; do not investigate the host remotely in this first mission.


The founder has already settled Palavva's name, broad product, architecture intent, 80/20 OSS reuse, feed-first UX, Qwen, SQLite/PocketBase, Oracle, Revive/Espo and white-label demo. **Do not turn engineering uncertainty into another product brainstorming session.** The agent should investigate, select reversible defaults, and ask only when law, safety, cost, credentials or irrevocable changes require founder action.

## Risk register

| ID | Risk / unknown | Priority | Verify & default / decision gate |
| --- | --- | --- | --- |
| R-01 | OpenMolt current actual license/dependency/backend mismatch | High | Pin commit, read LICENSE, run code/tests; reuse only safe compatible pieces and record ADR |
| R-02 | PocketBase pre-1.0 compatibility, single writer load | High | Pin version, migrations/hook authorization, write-load/restore tests; design adapters for future DB migration |
| R-03 | News RSS/API reuse rights uncertain | Critical | Each source disabled until rights verified; 1–3 approved official/publisher feeds; otherwise safe test fixtures and hold publication |
| R-04 | AI unsupported claims and prompt injection | Critical | strict claim IDs, source links, no tools from untrusted inputs, human medium/high risk approval, evaluation set |
| R-05 | Tailscale Qwen link relay/performance/offline | High | Real bounded speed tests, semaphore, queue and no paid fallback by default; public reader path independent |
| R-06 | Oracle current billing/free-tier/availability | High | Read-only console verification before scaling; no paid upgrades without approval |
| R-07 | Oracle ingress host firewall and Docker bypass | Critical | Inspect NSGs/firewall; private loopback stage; never public open without approval and validation |
| R-08 | EspoCRM/Revive health and API integration rights | Medium | Inspect existing services read-only; local durable inquiry fallback/ads absent, do not disturb Hetzner |
| R-09 | Cross-tenant cache/file/API leak | Critical | Every layer tenant bound, automated negative tests and immutable host mapping; stop public launch on failure |
| R-10 | Licensing of photographs/fonts/theme assets | High | Record rights/provenance/usage, use text-led/no-photo defaults and OSS licensed icons/fonts |
| R-11 | Brand final illustration/logotype preference | Low | Use design tokens/wordmark v1, SVG draft and documented variants; can refine without block |
| R-12 | Unverified historical archive evidence | High | Time Lens only on approved primary/archive records, empty honestly otherwise |
| R-13 | Accessibility and mobile data constraints | High | E2E narrow width and slow network, performance budget, no ad-heavy fold |
| R-14 | Analytics privacy cross-border obligations | High | Minimize PII, consent where required, counsel review before launch; admin uses real/incomplete metrics |
| R-15 | No final public legal terms/privacy docs | Critical for public launch | Build labeled counsel-review drafts, never assert compliance or launch without review |
| R-16 | Domain registrar/DNS/CDN and public certificate | Not blocker for private stage | Loopback/SSH or authorized tailnet stage; require explicit public launch approval |
| R-17 | Premium/enterprise/sponsor pricing and payments | Deferred | Retain hypotheses only, no checkout or fabricated revenue |
| R-18 | AI multi-language quality/rights | Deferred | English-first; expose future locale metadata without auto pretending translated accuracy |
| R-19 | Heavy builds/staging disk/backup target | High | Build off-node, resource limits, verify external encrypted backup store and actual restore |
| R-20 | Vulnerable dependencies or reused admin UI | High | SBOM/dependency scan, version locks, smallest privileges and repeat audits |
| R-21 | Local Mac runtime/CPU/virtualization mismatch, Docker daemon unavailable | High | Inspect actual Mac architecture and daemon before install; use safe native process fallback; prepare multiarch images for eventual Oracle; do not assume Apple Silicon |
| R-22 | Premature Oracle contact/deployment during local build | Critical | All Phase 0–5 operations Mac-only; no SSH/rsync/registry delivery to Oracle; separate founder approval before Phase 6 |

## Implementation defaults requiring explicit confirmation only if they have consequences

- **Founder-approved Midnight/Tangerine theme**: Midnight `#1B2030`, Tangerine `#E85E31`, Warm Gold `#F8C45C`, Ivory `#F8F5F0` (read `05` for accessible darker controls); `Inter` plus selective `Source Serif 4` or compatible licensed fonts. No forest-green brand redesign. Typography kerning and final art may refine without changing the selected palette.
- Canonical routes in `03`, 20-record cursor pagination, 1 inference at a time, no browser-to-Ollama calls.
- Low/medium/high editorial tiers; require human review for high/medium always and low initially during stage.
- RSS poll cadence initially 15–60 min per approved license/rate limit; job retries capped with exponential backoff.
- Parquet + DuckDB for batched events, retaining raw data only for documented necessary period; actual policy after counsel review.
- No ad if missing Revive configuration; durable sponsor lead capture if Espo down.
- Sample tenant uses domain `example.invalid` or private mapped host, **not** an invented real company/paid customer.
- Caddy reverse proxy prepared for **future** Oracle after permission; first stage is the Mac-local app. Never connect to Oracle during local acceptance.

## Open questions the coding agent must resolve by examination, not ask as general brainstorming

1. What is actual upstream OpenMolt code and license at pinned SHA, and what can be reused with PocketBase?
2. **After explicit Phase 6 permission only:** What Oracle shape/headroom/ingress/free allowance is real today, and can private staging be installed safely? During Mac build, do not inspect Oracle remotely.
3. Which source endpoints have documented valid usage rights and real current content suitable for first release?
4. Can Qwen reliably produce sourced short output within defined limits, and what is actual tailnet failure behavior?
5. What Revive tags and EspoCRM API methods are supported by **installed** versions and authorized accounts?
6. Can the design meet mobile/SEO/security requirements on existing resources?
7. Can backups and restore be completed to an approved off-host location?

## Explicitly postponed decisions (do not block MVP)

Final emblem/illustration approval, optional founder's personal social profile, precise final pricing and conversion, live premium subscription provider, self-serve white-label payments, more than first approved sources, arbitrary external agents, Arabic/French/Swahili translation at scale, full tenant custom domains, advanced research subscription BI, country ranking by social media active users. Preserve hooks and truthful coming-later copy only.

## Stop and ask permission only for

- **Any Oracle contact/deployment after the Mac is ready**, even a private staging install; actual fee/spending; public 80/443 ingress/DNS/regulatory publication (a **second approval**); unapproved media/news licenses; irreversible migration/deletion; changes to unrelated Hetzner/Tailscale/services; serious legal/rights issues or a scope change to settled product direction.

**Default response to blockers:** secure fallback, record risk, continue other independently executable tasks. Never assert that a previously observed tool/service is healthy today without testing.
