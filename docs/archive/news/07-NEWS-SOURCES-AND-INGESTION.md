# 07. News source registry, permitted ingestion and story clustering

**Project context:** Palavva MVP implementation specification.

## Principles

Fresh RSS provides **information**, not model training. Sources must be checked for rights **before** enabling fetching, storing excerpts, translation, embedding, archiving, or redistribution. Prefer official releases, publisher-approved RSS, APIs, and lawful short attribution with link-outs. A source can be searchable for discovery but **not** reusable for substantial republishing. Never assume an RSS feed grants a license.

## Source candidates (unverified for automation)

| Candidate | Source type | Example site | Rights/action |
| --- | --- | --- | --- |
| AllAfrica | Syndication/news | https://allafrica.com/misc/tools/rss.html | Verify syndication and attribution permission first |
| Africanews | EN/FR journalism | https://www.africanews.com/page/widgets/ | Check live RSS and usage rights first |
| Business Day SA | Economy | https://www.businessday.co.za/information/rss-feeds/ | Verify feed endpoints and licensing |
| GDELT | News discovery/event monitoring | https://www.gdeltproject.org/ | Discovery metadata, not independent redistribution rights |
| GSMA | Telecom industry | https://www.gsma.com/newsroom/rss-feeds/ | Inspect feed terms and reuse permission |
| Central Bank of Nigeria | Primary policy | https://www.cbn.gov.ng/ | Identify approved announcement access, reuse rules |
| African Union | Primary communiqués | https://au.int/en/press-releases | Verify eligible automated access and terms |
| African Development Bank | Primary reports | https://www.afdb.org/ | Check document license and source attribution |
| National statistics / regulators | Primary country data | Official regulator URLs | Per-site review and freshness |
| TechCabal, Techpoint Africa, Reuters, BBC, The EastAfrican, Daily Maverick | Journalism | Publisher-controlled URL | Only licensed or explicitly permitted feeds / links |

**Launch target:** 1–3 actually approved, working sources, enough to prove end-to-end. Selection requires real timestamp, coverage of at least one African market, low failure rate and clear permissions. All candidates ship **disabled** until approval data is recorded. A source with unknown rights may be manually researched and linked without unauthorized archive copying.

## Registry shape

`source_registry`: `{id, tenant_id, publisher_name, homepage_url, endpoint_url, endpoint_type[rss|atom|api|manual], languages[], countries[], topic_ids[], source_class[official|media|archive|licensed|submission], trust_tier[primary|corroborated|discovery], rights_status[pending|approved|restricted|revoked], usage_policy[link_only|metadata_only|permitted_excerpt|licensed_full], license_url, rights_verified_by, rights_verified_at, attribution_text, content_retention_days, fetch_interval_minutes, request_timeout_sec, rate_limit_per_hour, robots_review, terms_review_date, enabled, last_attempt_at, last_success_at, last_error_code, consecutive_failures, next_fetch_at}`. Enabling requires `rights_status=approved`, endpoint safety test, and approved use scope. Preserve audit changes.

`source_item`: stable canonical URL, source ID, source GUID, published and fetched timestamps, allowed title/excerpt, content/language metadata, country/topic candidates, hash, legal retention timestamp, trust info, normalized claim references. Do not archive unlicensed full text merely to make AI output richer. Use sources and permitted extracts in ephemeral RAG context.

## Fetch contract

1. Scheduler selects eligible registry row: enabled, rights approved, interval due, not backoff.
2. Fetch server-side with strict per-host allowlist, DNS resolution validation and block of loopback/private/link-local/metadata IPs, cloud metadata hosts, unauthorized redirects and unknown schemes. HTTPS preferred. Timeouts, max response size, content-type allowlist, finite redirects. If dynamic DNS rebinds to private address abort.
3. Send honest UA, honor rate constraints and `ETag`/`Last-Modified`, parse RSS/Atom/API with safe parser (disable XML external entities). Store response metadata/HTTP status; scrub secrets and subscriber links from logs.
4. Normalize title, source GUID, canonicalized URL (remove tracking fields safely), dates UTC, publisher, allowed excerpt, language, country/industry candidates. Preserve original URL and source publication date; compare publisher time versus fetch time.
5. Candidate duplicate fingerprint: `sha256(source_id | stable_guid_or_canonical_url)` plus normalized title/source/semantic similarity. Do NOT merge unrelated events just because title words match; include actors, location, occurrence date and source lineage.
6. Cluster by event/revision. Choose existing `story_cluster` when update likely; preserve all `cluster_sources`. Source update does not make a new public thread by default. Human merge/unmerge available.
7. Relevance/risk score. Reject irrelevant/stale/suspect items, or enqueue research packet.
8. Retrieve independent source links and specific permitted primary documents/archives. Preserve citations and extracted claim lines only where license permits.
9. Editorial workflow in `08`; publish only reviewed/allowed record, never raw ingest as truth.

## Dedup and clustering rules [initial thresholds are tuning defaults]

- Exact URL or GUID duplicates collapse deterministically; hashed normalized text may flag duplicates but cannot alone establish event equivalence.
- Same entity + topic + close event date + supporting evidence can form one cluster, with an auditable match explanation. Similarity score above preliminary 0.85 signals **candidate**, not guaranteed merge; verify with rules/human for ambiguous high-risk pieces.
- Existing cluster gains `last_material_update_at` and new source links, not repeated identical comment threads. Reopen publication only if genuinely new facts or correction.
- Editorial fatigue: limit same cluster to one surfaced item in a rolling window unless a verified substantive update. Genre/country distribution constraints avoid an all-Nigeria/politics-only home.
- Idempotency key: `sha256(tenant_id + source_item_id + pipeline_version + stage)`. Each stage retries bounded and writes audit; poisoned items move to dead-letter queue.

## Scheduler/job types

`fetch_source`, `normalize_batch`, `classify_item`, `cluster_story`, `research_cluster`, `draft_story`, `validate_claims`, `request_editor_review`, `build_share_card`, `reindex_search`, `refresh_analytics`. **[Implementation default]** Initial schedule: sources 15–60 minutes based on actual permissions, research jobs serialized when on local Qwen, 3 attempts with jittered exponential backoff; apply rate-limit/retry-after. No busy-looping when sources or Qwen unavailable. Protect editorial publish flag separately.

## Classification

- Country IDs use ISO 3166-1 alpha-2 for known 54 states and parent region metadata; a story may have multiple countries, with evidence-backed relevance scores.
- Topic taxonomy references original 25 sectors + six top groups; allow e.g. `Kenya + Food Delivery`, `Nigeria + Fashion`, `Ghana + Fintech`. No 25×54 hardcoded communities.
- Language BCP-47 metadata; multilingual sources can be held for translated analysis with explicit translation labels, but English-only product isn't obligated to invent translations on day one.
- Confidence flag is not an accuracy guarantee; store decision history/reasons.

## Verification and evidence packet

For each proposed claim `{claim_id, claim_text, claim_type[observation|interpretation|projection], source_ids[], exact_permitted_extract_or_reference, source_date, corroboration_status, uncertainty_note}`. Distinguish an official announcement from a completed outcome; no claim without evidence. Corrections point back to claim ID and revision. Where a claimed number depends on timing/currency/comparability, record unit, denominator and period.

## Source health UX

Source table: enabled, rights state, last success, fetch age, items/day, dedupe %, error codes, source distribution, configured refresh and next due. Controls `Test fetch`, `Pause`, `Approve rights`, `Revoke`, `View audit`. No green `healthy` badge purely because a valid endpoint once replied. Stale source creates alert; unapproved source never auto-enables.

## Functional test fixtures

Use small archived **permitted synthetic XML fixtures** only in test suite: well-formed RSS/Atom, duplicate GUID, moved article URL, empty RSS, malformed XML, date timezone, oversized XML, XXE attempt, private-IP redirect, illegal terms flag, changing article/update, syndicated copy from same wire, country overlap, article in French. Test that an unapproved registry row produces **zero network fetches and zero published items**.

## Rights and content deletion

If publisher permission revoked, disable future fetches and downstream derivative reuse as required by license, expire stored excerpts/media, retain minimal legal audit/provenance metadata where permissible, remove public unauthorized quote and regenerate summaries under lawful sources. Make takedown workflows accessible and record time/method of compliance.
