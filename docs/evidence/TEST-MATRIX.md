# Test matrix T-001 to T-042: local Mac evidence

**Environment:** founder's Mac (x86_64, macOS 12.7.6). Services run natively on loopback. Browser tests run against the **isolated test stack** (`scripts/test-stack.sh`: `data-test/`, ports 3300/8390/8400, production `next build`, deterministic **fixture** model provider) unless noted. **Date:** 2026-10-09 (UTC). **Code:** see the git log, final commit in `OVERNIGHT-BUILD-REPORT.md`.

**Suites (all executed tonight, logs referenced):**

| Suite | Result | Evidence |
| --- | --- | --- |
| Web typecheck (`tsc --noEmit`) | clean | `scripts/test-all.sh` log |
| Vitest unit (`apps/web/tests/unit`) | **17/17 pass** | `docs/evidence/test-runs/*/vitest.log` |
| pytest unit + integration on an isolated PocketBase (`services/editorial/tests`) | **39 passed, 3 skipped** (the skipped ones are the opt-in real-Qwen tests) | `docs/evidence/test-runs/20261009T065138Z/pytest.log` |
| pytest **real Qwen** (opt-in, `PALAVVA_REAL_QWEN=1`) | **4/4 pass** | `docs/evidence/phase2-real-qwen-tests.txt` |
| Playwright E2E incl. axe and outage (`apps/web/tests/e2e`) | **32/32 pass** | `docs/evidence/test-runs/20261009T065138Z/playwright.log`, `docs/evidence/e2e/results.json` |

Status key: **PASS** = executed and observed. **PARTIAL** = the executed part passed and the gap is named. **BLOCKED** = needs an external system or approval; local fallback status is given.

| ID | Status | Evidence | Notes |
| --- | --- | --- | --- |
| T-001 | **PASS (local)** / **BLOCKED (Oracle)** | `phase0/t001-mac-inventory.txt`, `PHASE-0-AUDIT.md` | Mac CPU/OS/RAM/disk/Docker/ports recorded. No Oracle or remote changes were made. The ARM64/SSH part is deferred to Phase 6 by policy. |
| T-002 | **PASS** | `DECISION-OPENMOLT.md`, `.audit/openmolt-*.log` | Commit `1be0e28`; MIT verified from the LICENSE file; baseline: 3 failing tests, typecheck fails, 21 advisories. Path B chosen. Our pins: `pnpm-lock.yaml`, `requirements.lock`. |
| T-003 | **PASS** | pytest `test_seed_counts_and_idempotency`; `restore-drill-*.txt` | Clean migration on fresh dirs (every test stack reset), seed counts 54/25/6/2, re-seed idempotent, restart, backup + restore with matching counts. |
| T-004 | **PASS** | e2e `public.spec` T-004 | JS-disabled context: headline, `<time datetime>`, "Source:", Read link → detail with "What happened?" and sources. |
| T-005 | **PASS** | e2e T-005; screenshots `home-320-*.png` | 0 px horizontal overflow on 7 pages at 320/375/390/768. |
| T-006 | **PASS** | e2e T-006; vitest feed modes | All 7 tabs are routes with `aria-current`; Random is stable for the day; Top excludes items older than 30 days; Discussed ignores AI counts. |
| T-007 | **PASS** | e2e T-007 | Country + topic combine in the URL; back/forward restores; honest empty state. Language param works (`lang=en`); only English content exists. |
| T-008 | **PASS** | e2e T-008; pytest `test_fts_is_tenant_scoped_and_injection_safe` | FTS5 finds approved text; accent folding ("Bakéry"); drafts not found ("Nakuru" exists only in a draft); FTS syntax neutralized; tenant-scoped. Typo tolerance limited to prefix matching. |
| T-009 | **PARTIAL** | e2e `member.spec` T-009 (two tests) | Sign-in/out, wrong password, sign-up → mail-sink verification link → can post; unverified cannot; cross-origin POST → 403; anonymous write → 401; platform credentials rejected on sample host. **Session expiry** is enforced in code (`expires_at`) but was not time-travel tested. |
| T-010 | **PASS** | e2e T-010/T-011 | Anonymous types → Post → sign-in dialog ("We'll keep your comment here…") → full reload → exact draft restored from sessionStorage (never in the URL) → posted once. |
| T-011 | **PASS** | e2e T-010/T-011 and T-011 vote | Human count +1; AI count shown separately and unchanged. Vote toggles; 6 concurrent toggles leave 0 or 1 (unique index). |
| T-012 | **PARTIAL** | e2e T-012 | Report → moderator quarantine → hidden → restore (appeal path), audit `moderation.report_quarantine`. Link-heavy comments are held for approval. **Not built:** member self-edit of comments. |
| T-013 | **PASS** | pytest `test_unapproved_source_makes_zero_requests`; e2e T-013 | Pending/revoked/restricted/disabled sources make **0 fetcher calls**; the admin test fetch on a pending source reports "no network request was made". Revocation clears excerpts and holds drafts (code: `sourceAction` revoke). |
| T-014 | **PASS** (rights caveat) | `sources/SANEWS-RIGHTS-REVIEW.md`; dev DB `source_items` | Real fetch of `https://www.sanews.gov.za/rss.xml`: HTTP 200, 10 items, UTC dates, publisher URLs. **Rights approved by the build agent from the published user policy; needs founder/legal confirmation.** |
| T-015 | **PASS** | pytest `test_check_url…`, `test_redirect_*`, `test_oversize…`, `test_parse_rejects_xxe…` | XXE/DTD rejected, malformed XML, oversize (>2 MB), redirect to private IP / off-allowlist, loops, file:/gopher:, credentials in URL, metadata IP, CGNAT. Residual DNS-rebinding window documented (ADR-012). |
| T-016 | **PASS** | pytest `test_ingest_dedup_cluster_and_pipeline` | Same GUID replay → 0 new items; same text under a new GUID → duplicate; material update joins the existing cluster with no new job. |
| T-017 | **PASS** | pytest `test_classify_*`, integration | Country/topic/language/risk on fixtures (incl. French and an ignored non-African item); ambiguous flag stored with reasons. |
| T-018 | **PASS** | pytest `test_claims_with_unknown_sources_are_dropped`, `test_unknown_claim_id_fails…`, `test_invalid_citation_is_held` | Unknown source IDs dropped; unknown claim IDs → FAIL/held; published pieces render claim anchors to stored evidence records. |
| T-019 | **PASS** | `phase2-real-qwen-tests.txt`; dev DB `ai_runs` | Real `qwen3.5:4b` over Tailscale: structured JSON, latency 13.7–22.0 s, tokens in 455–509 / out 58–161. Overnight pipeline: 60+ real runs logged with duration/tokens. Role distinction and abstention tested (both roles abstained on thin evidence). |
| T-020 | **PASS** | real-Qwen `test_T020…`; unit `test_injection_text_forces_high_risk`, `test_numbers_quotes_injection_and_risk` | Injected "ignore instructions / publish / reveal key / cite S9" stays data: schema forbids PUBLISH, S9 citations dropped, item forced to HIGH risk, and the injection echo validator FAILs. The worker has no publish path; a DB hook blocks publication without human approval. |
| T-021 | **PASS** | pytest `test_publish_gate_blocks_unreviewed_publication`; e2e T-021/T-022 | DB hook: no publish on create; publish needs an approval by an editorial role **in the same tenant** (member and cross-tenant editor rejected). Medium/high risk needs an editor; flags need a written note; kill switch blocks approval. |
| T-022 | **PASS** | unit `test_roles_limited_and_distinct`; e2e; real-Qwen role test | ≤3 roles, duplicates dropped, abstention allowed; AI comments stay pending until the piece is approved; no AI votes or comments on human threads. |
| T-023 | **PARTIAL** | e2e (time-lens pages render); pipeline `NO_VERIFIED_COMPARISON` | Honest empty state for every era. **No verified archival records exist yet**, so the positive path (archive IDs and differences) could not be exercised with real data. |
| T-024 | **PASS** | e2e T-024 | Correction → revision+1, public banner, `/corrections` entry, `og:image ?v=` bumped; revision history in the review page. |
| T-025 | **PASS** | e2e T-025 | WhatsApp/Facebook/X intents carry the exact canonical URL and title (decoded and checked); copy link works; no login. |
| T-026 | **PARTIAL** | e2e T-026 | Canonical, OG 1200×630 (PNG dimensions read), twitter card, demo `noindex`, sitemap excludes demo and drafts, robots `Disallow: /` while `PUBLIC_LAUNCH_AUTHORIZED=false`, no forum schema. `NewsArticle` JSON-LD renders only for non-demo published pieces; **no non-demo piece has been published yet** (awaits founder approval). |
| T-027 | **PASS** | e2e T-027/T-028 | One `story_viewed` per page load written to tenant NDJSON; no PII; DuckDB ETL → `aggregated_metrics` → dashboard. |
| T-028 | **PARTIAL** | e2e T-027/T-028; vitest sanitization | Opt-out sends nothing; allowlist strips email-like and free-text fields; tenant partitioned. The 30-day raw-event purge is implemented in the ETL but was **not exercised** (no data that old). |
| T-029 | **PASS** | e2e `admin.spec`; screenshots `admin-*.png` | RBAC (anon → sign-in, member → 403 page, moderator cannot approve); queue with source/risk/evidence; AI runs with time and tokens; kill switches; audit log; "Not connected" states. |
| T-030 | **PASS (local)** / **BLOCKED (EspoCRM)** | e2e T-030 | Inquiry persisted before a reference is shown (`PV-YYYYMMDD-XXXXXX`); state `NOT_CONFIGURED`; retry is idempotent. **No EspoCRM credentials/authorization**, so live forwarding was not attempted. |
| T-031 | **BLOCKED (Revive)** / local fallback PASS | `SponsoredSlot.tsx`; all pages render with no slot | With no approved zone and no `REVIVE_DELIVERY_URL`, slots collapse (never fabricated). Live Revive zone tags were not tested. |
| T-032 | **PARTIAL** | founders/business pages, e2e a11y pages | Editorial vs Sponsored labels, verification state, "pending verification" notice, unverified items never featured first; website links limited to http(s) with `nofollow ugc`. **No automated malicious-URL test.** Sponsored spotlights have no real data. |
| T-033 | **PASS** | e2e `tenant.spec` (3 tests) | Separate branding; A's content 404 on B (page, API, search, sitemap); A's cookie replayed on B = anonymous; B admin sees only B's tenant/sources/editorial; authenticated B admin posting to A's piece → 404; analytics partitioned by tenant ID. |
| T-034 | **PASS** | e2e `outage.spec`; pytest `test_T034…`, `test_model_offline_defers…`, `test_ai_paused_switch_defers` | Editorial service killed: public pages 200, search falls back with an honest note, admin shows the outage. Unreachable Ollama → `unavailable`, job deferred without consuming an attempt, nothing invented. No cloud fallback exists. Daily quota defers jobs (observed overnight). |
| T-035 | **PASS** | e2e outage; pytest fetch-failure path; e2e T-030/T-029 | Source failure → backoff, error code, admin alert, nothing deleted. CRM down/not configured → durable local inquiry. Revive absent → slot collapses. |
| T-036 | **PASS** | pytest `test_queue_idempotency_retry_dead_letter_and_lease`, `test_queue_defer…`, replay `already_drafted` | Lease expiry → reclaimed; stale owner cannot complete; retries → dead letter → requeue; idempotency key; replay never creates a second piece; single-worker `flock`. |
| T-037 | **PASS (local)** / **BLOCKED (off-host)** | `restore-drill-*.txt`, `scripts/backup.sh`, `scripts/restore-drill.sh` | Online SQLite backup, SHA-256, integrity check, isolated restore on a spare port, counts match, ACL still 403, service login OK. **Off-host copy needs an approved destination.** |
| T-038 | **PASS (local)** / **BLOCKED (Oracle)** | `phase5/t038-network.txt`, `phase5/compose-smoke.txt` | All six Palavva listeners are 127.0.0.1; LAN IP refused; in Compose only web is published (loopback) and PocketBase has no host port. The external scan of Oracle is deferred. |
| T-039 | **PASS (local)** | `phase5/load-test.txt`, `phase5/load-test-cached.txt` | ApacheBench on the production build: c=10/50/100, 0 non-2xx, 0 SQLite busy. With the micro-cache: home 68–76 req/s, p95 192 ms (c=10) / 1362 ms (c=100); story p95 323 ms (c=10). Web RSS ≤ 0.95 GB, PocketBase ≤ 123 MB. |
| T-040 | **PARTIAL** | e2e `a11y.spec` (5 tests), `e2e/axe-*.json` | axe WCAG 2.2 AA: **0 violations** on 18 public pages in light and dark mode and on 6 admin pages (including contrast). Skip link, focus ring, dialog focus trap and return, Esc, reduced motion all pass. **Manual screen-reader pass not done.** |
| T-041 | **PASS** | OG route, `assets/README.md` | No news photographs are used anywhere (typography-first cards); share cards come from the approved headline; demo cards say "Demo content · not real news". |
| T-042 | **PARTIAL** | `scripts/dev-down.sh`/`dev-up.sh`, status, backup and restore | Restart verified (services and worker restarted several times; leases recover jobs); health and backup status in the Command Center. **Code rollback** (git checkout a prior SHA + restore a backup) is documented but not rehearsed end to end. |

## 10 end-to-end demonstrations

| # | Demonstration | Status |
| --- | --- | --- |
| 1 | Ingest a permitted real African headline with link and time | **Done** (SAnews; rights pending founder confirmation) |
| 2 | Classify, join duplicates | **Done** (real items classified ZA plus topics; dedup proven on fixtures) |
| 3 | Qwen sourced explanation with evidence and reviewer gate | **Done**: real Qwen drafts sit in the queue with claims, evidence and flags |
| 4 | Human editor approves and publishes | **Done on fixtures** (E2E). **Real drafts deliberately left for the founder** (ADR-011) |
| 5 | Anonymous read and WhatsApp/Facebook share | **Done** |
| 6 | Login gate preserves the comment draft | **Done** |
| 7 | Admin inspects source, model latency, revision, human counts | **Done** |
| 8 | Sponsor inquiry durable plus honest integration state | **Done locally**; EspoCRM/Revive BLOCKED |
| 9 | Tenant A vs sample B branding and isolation | **Done** |
| 10 | Qwen/editorial outage and backup restore | **Done** |
