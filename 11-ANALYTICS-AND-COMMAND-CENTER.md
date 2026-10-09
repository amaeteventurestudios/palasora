# 11. Analytics, first-party event platform and Command Center

## The measurement contract

Palavva needs **real measurements**, not decorative dashboards or fabricated engagement. Every figure shows a label, unit, scope, period, source, last-updated timestamp and a clear distinction between `0`, `not instrumented`, `delayed`, `not connected`, and `unknown`. Do not describe a browser cookie as a unique human, AI replies as human activity, share-button clicks as successful external posts, or an ad zone request as a verified billing event.

## Event collection architecture

`browser/server event → authenticated/signed or privacy-limited collector → bounded disk queue → append-only NDJSON/Parquet rotation → scheduled DuckDB aggregation → PocketBase aggregate view → Command Center`. Do not write each view event into central PocketBase collections. Use first-party same-origin `/api/v1/analytics/events`, request ID, event allowlist and payload schema; ignore unrecognized keys and strip PII. Server authoritative actions (comment, signup, publish, vote) log once after successful transaction. Frontend navigation/scroll events are best-effort and never block page rendering.

**Canonical event fields:** `event_id` UUID, `event_name`, `occurred_at UTC`, `tenant_id derived_server_side`, `anonymous_session_id rolling_pseudonym`, `member_id?` only with policy-approved scope, `story_id?`, `source_id?`, `country_code?`, `topic_slug?`, `referrer_category?`, `utm_source?`, `utm_medium?`, `device_class?`, `consent_state`, `metadata_allowlisted`, `server_received_at`. Discard email, free-form comments, full IP and raw URL query by default. IP may be transiently handled for abuse/security according to public privacy statement, not retained as an analytics identity.

## Event dictionary

| Event | Fired when | Do not infer |
| --- | --- | --- |
| `story_viewed` | Loaded/visible published detail with debouncing | Unique human / verified read-through |
| `discussion_read` | Visible content and defined dwell threshold | Fully read or agreed |
| `source_opened` | Click on attribution source link | Source site actually loaded |
| `time_lens_opened` | Historic module opened | User confirmed history true |
| `share_clicked` | Intent action selected | Actual share completed on third-party network |
| `comment_created` | Server confirms a human posted permitted comment | AI commentary; pending/unapproved count |
| `vote_cast` | Server commits unique member vote | Bots as genuine users |
| `signup_completed` | Account verified/created per policy | Unique real-world person |
| `business_profile_opened` | Legitimate published profile page viewed | Lead conversion |
| `sponsor_placement_viewed` | Slot in-view measurement if permitted | Revive-billed impression |
| `sponsor_clicked` | Labeled slot tracked per consent | Completed purchase |
| `ai_generation_completed` | Worker stores successful AI run | Published/reviewed story |
| `story_published` | Editorial gate commits publication | Readership |
| `correction_published` | New public correction revision | Original error not significant |
| `source_fetch_failed` | Fetch job logged failure | Publisher source permanently dead |
| `inquiry_created` | Durable validated inquiry accepted | EspoCRM delivery unless confirmed |

## Core metric definitions

- **Estimated active browser reach:** count consent-eligible pseudonymous sessions in selected interval; show privacy/identity caveats. Authenticated DAU/WAU/MAU count distinct valid member IDs with eligible human activity, not AI roles.
- **Returning readers:** eligible sessions observed in multiple periods, with consent and retention limitations disclosed.
- **Human comments:** approved human-authored responses only; AI count shown separately and never used as fake popularity boost.
- **Engaged story sessions:** sessions with meaningful dwell, source open, Time Lens open, save, or authentic human interaction. State denominator.
- **Share conversion:** `share_clicked` / eligible story detail visits. **Referral return:** confirmed inbound sessions tagged/referrer to published URL; not automatically attributable to specific shares without reliable campaign evidence.
- **Freshness:** `now - latest successful source fetch` per source; story occurrence date and publication date distinct.
- **Editorial throughput:** ingested candidates → clustered → held/rejected → drafted → approved → published. Track corrections/retractions by category and reason.
- **AI effectiveness:** median/p95 wall time by provider/task, queue wait time, success/failure, tokens if returned, provider billed fees only where metered; separate local hardware operating estimate from actual vendor invoice.
- **Ads:** Revive is source of truth for delivered impressions/clicks/campaigns, show only actual validated mapping and freshness; compare local slot reach only as secondary diagnostic.
- **Revenue:** only verified settled/recorded financial activity if payment/invoicing ever connected; initially show `Not connected`, not `$0 MRR` conflated with measurement.

## Privacy, sampling, retention [initial policy proposals, counsel review]

- Minimize PII and browser identifiers; honor required opt-in/out cookie rules by jurisdiction. No stealth fingerprinting or IP-based individual profiling.
- Coarse geography can come from consent/voluntary country preference or appropriately processed coarse IP; state provenance and treat it as approximate.
- Proposed retention: raw events 30 days, hourly/daily aggregates 13 months, security incident logs scoped separately; implement deletion mechanisms and get legal review before making firm promises. Backups follow documented expiry.
- Rotate event segments at bounded size, compress, avoid dual writes, handle dropped/delayed counts transparently and record collector loss rate. Use safe sampling only where disclosed/metrics adjusted.
- Tenant ID on all raw events, Parquet paths, queries and aggregates. Prevent one tenant from querying another's data even with handcrafted URLs.

## Command Center module design

1. **Overview:** date range, health status, human reach estimates, publishing/approval totals, pending actions, queue/backup/outage highlights. Top card shows last refresh and pending data note.
2. **Editorial Queue:** rows by story cluster, rights, evidence, risk, reviewer, duplicate matches, decisions, correction history and overrides.
3. **Sources:** registry status, fetch response rates, lag, rights approval age, country mix, last exception, test fetch action.
4. **AI Operations:** provider health, model choices, masked credentials state, latency histograms, queue budgets, paused state, cost (if actual metered), role contribution usefulness panel.
5. **Content & Moderation:** user reports, flagged comments, priority, assigned admin, appeals, correction requests, repeat violations, audit log.
6. **Audience Analytics:** human activity, pseudonymous reach, returning estimates, country/topic interest, source clicks, saves, significant referral channels.
7. **Distribution & Search:** published URLs/metadata, sitemap counters, share clicks vs arrivals, Search Console when officially linked, errors.
8. **Sponsors:** zone mapping and actual Revive status, recent campaigns as validated, inquiries' EspoCRM status, safe drillouts; not ad-campaign editing replacement.
9. **Founders & Businesses:** verification queue, sponsored and editorial spotlight disambiguation, view and inquiry counts.
10. **Tenants:** domain/theme, scoped health, quotas and forbidden cross-tenant counts; platform admins only for cross-tenant actions.
11. **System Health:** Compose/service liveness, disk free, WAL/queue/dead letters, backup age, test restore, Caddy TLS, Tailscale/Ollama reachability. Host process telemetry may be read-only.
12. **Settings/Audit:** roles, prompts versions, kill switches, configured endpoints status, retention, feature flags and immutable action log.

## Analytics queries (illustrative DuckDB SQL)

```sql
-- Events are privacy-reviewed files, partitioned by tenant and day.
SELECT event_name, count(*) AS event_count
FROM read_parquet('/data/analytics/tenant_id=*/date=*/*.parquet', hive_partitioning = true)
WHERE tenant_id = ? AND occurred_at >= ? AND occurred_at < ?
GROUP BY event_name;
```

Use parameterized query construction and verified approved tenant partition, not client-controlled arbitrary file globs. SQL above shows a logical shape; actual DuckDB binding syntax must be tested in pinned runtime. Run ETL from private job with resource/time caps and staging-to-final atomic replacement. Never expose raw DuckDB admin endpoint.

## Empty/sparse-data behavior

Dashboard first day should show real zero and `Not enough data to compare periods`, no beautiful seeded conversion chart. Demo dashboard may show labeled demo fixtures **only in separate demo tenant**, excluded from platform metrics. Disabled integrations show `Not connected`, last-check timestamp, and authorized action to configure rather than fake success icons.

## Acceptance queries

A human user views article → event increments once under defined debounce window; selecting WhatsApp increments share intent but no invented successful post; opening source counts click only; creating one comment updates human count once, not AI. Turning off measurement consent stops nonessential client events. Tenant B aggregate cannot contain tenant A events. During a forced analytics outage public SSR still works, with loss/queue recorded.
