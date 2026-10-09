# 17. Executable testing, quality and staging acceptance plan


> **v1.2 test-environment override:** **Run phases 0–5 against the real app on the Mac. Do not touch Oracle.** `21-LOCAL-FIRST-DEVELOPMENT.md` controls execution. The 42 test IDs remain; report remote-only conditions `BLOCKED`/`DEFERRED` until a separately approved Phase 6, never `PASS` based on historical infrastructure notes. The aim is first a **local acceptance report**, not an Oracle staging acceptance claim.


**Project context:** Palavva MVP implementation specification.

## Evidence, not assertions

All tests must be run against actual code in a known commit and image digests. A `PASS` must include command/test name, execution date/time, environment, actual expected vs observed behavior and artifact path (screenshot/log/sanitized JSON/coverage). `BLOCKED` names dependency and graceful fallback; `FAIL` requires issue. A test file existing, compilation passing or container running is **not** equivalent to browser acceptance.

## Gates per layer

**Gate A:** license/security/architecture audit complete; source rights recorded; no production side effects. **B:** typed schema/API and auth integration pass. **C:** real source → source-backed draft → review → approved detail page. **D:** E2E public/member/admin/commercial/tenant flows pass. **E:** failover, backup restore, performance, security, SEO/crawler evidence. **F:** founder review of working **Mac-local** app before any deployment; later Oracle staging and public launch are independent approval gates.

## Test matrix

| ID | Layer | Test / observable acceptance |
| --- | --- | --- |
| T-001 | Infra | **Local-first:** Mac CPU architecture, OS, RAM/disk, Docker daemon or native fallback, localhost ports and toolchain recorded; no Oracle/remote changes. **Oracle ARM64/SSH test deferred until separately authorized Phase 6.** |
| T-002 | OSS | OpenMolt commit/license/working code audited; adaptation decision and package manifests pinned |
| T-003 | Migration | PocketBase clean migration, seed counts, restart and backup+restore consistent |
| T-004 | Public | Desktop JS-disabled HTML has actual approved headline, date, source and links without login |
| T-005 | Mobile | At 320/375/390 px, readable headline, filters, no sideways overflow/blocked content |
| T-006 | Feed | Six feed modes sort/filter real data according to metric definitions, Random eligible content only |
| T-007 | Filters | Country + sector + language URL filtering independent, stable back/forward and pagination |
| T-008 | Search | FTS finds approved text, handles accent/typo/empty, never returns private drafts or cross-tenant content |
| T-009 | Auth | Sign-in/out, verification/session expiry, CSRF rules; no unauthorized post/like |
| T-010 | Draft | Unauthenticated comment attempt opens login, after sign-in restores exact draft and destination |
| T-011 | Comment/vote | One permitted comment and idempotent vote; counts represent human vs AI separately |
| T-012 | Moderation | Flag/report/quarantine/review/edit/removal/appeal states with audit and suitable user display |
| T-013 | Source rights | Rights-pending and revoked source never auto fetched/published outside permitted actions |
| T-014 | Fetch | One real rights-approved African source RSS/API fetch with publisher URL and UTC dates; record fetched metadata |
| T-015 | RSS safety | Reject XXE, giant payload, malformed XML, redirects to localhost/private/metadata IP, unsafe schemes |
| T-016 | Dedup | Same GUID/link/content replay creates no new story; material update appends to existing cluster |
| T-017 | Classification | Country/industry/language combinations correct, ambiguous classifications flagged |
| T-018 | Claims | Each published atomic factual claim resolves to permitted real source; invalid citation IDs blocked |
| T-019 | AI | Private Qwen response through Tailscale with measured latency/tokens; role distinction and abstention tested |
| T-020 | Safety | Prompt injection inside feed/source ignored, no secrets/tools access, no fabricated citations |
| T-021 | Risk review | Sensitive politics/health/finance/legal allegations cannot publish without documented human approval |
| T-022 | Editorial | 1–3 roles maximum, real distinct contributions, no empty bot chatter or fabricated personal experiences |
| T-023 | History | Time Lens uses verifiable archive IDs and differences; unsupported era honestly returns empty |
| T-024 | Correction | Corrected source-backed headline creates public history, timestamps, share/meta/cache update |
| T-025 | Share | WhatsApp/Facebook/X/copy links use real canonical URL, no login or broken intent encoding |
| T-026 | SEO | SSR crawl test, robots/sitemap/canonical/OG 1200×630, `Article` schema, no fake forum schema |
| T-027 | Analytics | Client event + server action definitions persist with no PII; actual aggregate reflects event once |
| T-028 | Analytics privacy | Consent opt-out stops nonessential tracking, retention/purge and tenant partition verified |
| T-029 | Admin | Queue source/risk/evidence/action, model run/cost, genuine metrics, kill switches, audit visible |
| T-030 | CRM | Sponsor inquiry server validates, durable persists, EspoCRM forward succeeds OR exact pending fallback shown |
| T-031 | Ads | Actual approved Revive zone tag only, sponsor disclosure works, disconnected state safe, metrics sourced correctly |
| T-032 | Business | Verification state and editorial vs paid spotlight clearly labeled, malicious business URL blocked |
| T-033 | Tenant | A/B negative list/read/edit/search/attachment/cached SSR/events cross-access all denied |
| T-034 | Outage | Qwen down/slow: public page remains 200, jobs queue/backoff; no surprise cloud usage |
| T-035 | Outage | Source down/EspoCRM down/Revive down: transparent degraded state, no feed outage |
| T-036 | Durable jobs | Lease expiry, retry, dead letter, idempotency and restart do not publish duplicate stories |
| T-037 | Backup | Actual off-host backup and isolated restore drill with integrity, attachments and ACL recheck |
| T-038 | Network | Approved external security test finds only explicitly authorized ports exposed; Ollama/PB internal hidden |
| T-039 | Load | Warm SSR and burst at measured safe concurrency; SQLite locks, RAM, CPU, disk and p95 recorded |
| T-040 | Accessibility | Keyboard, landmarks, focus, sheet return, contrast, reduced motion, screenreader headings |
| T-041 | Assets | News imagery rights and labels recorded; no fake current-event photo; share assets fit limits |
| T-042 | Ops | Reboot/restart, resource/backup status and alert logs; rollback to prior known-good version |

## 10 end-to-end launch demonstrations

1. Ingest one **permitted** real African headline and original link/time.
2. Correctly classify country/language/industry/source and join duplicate into coverage.
3. Have Qwen produce meaningful sourced explanation with evidence and reviewer gate.
4. Human editor approves safely and publishes a permanent page.
5. Anonymous visitor reads and shares on WhatsApp/Facebook without a login.
6. Login gate preserves attempted comment, authenticated human contribution persists.
7. Admin can inspect source, model latency, revision and real human counts.
8. Sponsor form durable records/forwards or shows honest integration status; Revive placement labeled.
9. Tenant A and sample B branding differ, roles/data isolated with negative tests.
10. Qwen outage plus backup restore drill proves service resilience and recovery.

## Local-first PASS/BLOCKED treatment and handoff

- `T-019` is PASS only if the Mac worker actually calls the existing private Qwen endpoint through Tailscale and receives a validated response. The fake deterministic provider is allowed for automated unit/E2E but not evidence of real Qwen. If Qwen is unavailable, T-019 is BLOCKED while offline fallback tests may still PASS.
- Existing Revive/Espo integrations may be BLOCKED if no secure authorized connection is available; independently verify local adapters, durable outbox, disclosures and failure states. Do not modify Hetzner to make a demo pass.
- Oracle runtime checks, external ingress, certificate behavior and real ARM64 service execution cannot PASS in phases 0–5. Prepare image manifests and migration runbook; verify on Oracle **only** after approval.
- Report local screenshots/measurements and a checklist for the founder to test actual login, comment, editorial approval, source links, Time Lens, sponsor inquiry, tenant isolation and admin. End at Mac local acceptance; no deployment or upload.

## Browser verification

Use Playwright or equivalent with real browser engine, screenshots at 320/390/768/1440 widths and both themes. Test network degraded simulation (4G/slow 3G where practical), JS-disabled crawler and mobile touch/keyboard. Never use screenshots of rendered static mocks as evidence that dynamic app buttons work; click them and assert real response/data changes.

## Performance test plan [targets until measured]

- Define warm/cold SSR scenarios and 10/50/100 concurrent anonymous page requests within host capacity, plus deliberately limited authenticated writes. Measure p50/p95 latency, CPU, RAM, disk IO, SQLite busy retries, pool saturation, error rate and cache behavior.
- Separate real Qwen throughput tests with safe bounded concurrency (start 1) and explicit operator permission before stress of Simeon's iMac. One earlier 5.014-second completion is not a throughput benchmark.
- Budget mobile assets (font/image/js payload), test LCP/CLS, image lazy loading and source attribution visibility before labeling fast.
- No aggressive load test against real external publishers, Revive, EspoCRM or services without permissions.

## Security cases beyond basic tests

Cross-tenant crafted IDs, request-host spoof, access via internal PocketBase collection endpoints, PII via public JSON, stored XSS in comment, SSRF via RSS endpoint, malicious OpenGraph image URL, forged webhook from ad/CRM, CSRF logout/comment, replayed source item/job, unmoderated AI publish attempt, signed session expiry, arbitrary tenant color CSS injection, unauthorized secret exposure, audit deletion attempt, directory traversal in assets.

## Test report format

```markdown
# Local Mac Acceptance Evidence | commit SHA / local build digests / date

| Test ID | Status PASS/FAIL/BLOCKED | Evidence file | Notes/issue |
| --- | --- | --- | --- |
| T-001 | PASS | evidence/t001-infra-redacted.txt | ... |

## Demonstration links (Mac localhost only, no Oracle stage)
## Real CPU/RAM/disk/load/inference measurements
## Editorial human QA ratings and outstanding source/licensing risks
## Regressions and rollback rehearsal
## Hard launch blockers
## Oracle private-stage approval: NOT REQUESTED / PENDING / EXPLICITLY GRANTED
## Public-launch approval: NOT REQUESTED / PENDING / EXPLICITLY GRANTED (separate gate)
```

No false test pass. An unavailable external connector gets `BLOCKED` and a tested safe fallback, not skipped. The implementation agent must report failures with priority and reproducible conditions.
