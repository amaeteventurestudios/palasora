# 09. PocketBase + SQLite data model, authorization and API contracts

**Project context:** Palavva MVP implementation specification.

## Data rules

**Initial backend:** PocketBase embedded SQLite, pinned supported ARM64 binary and checked migration API. Do not mistake the optional OpenMolt Prisma/PostgreSQL model for a PocketBase schema. A typed repository/service layer abstracts reads/writes. `tenant_id` is explicit on every tenant-owned row, lookup, file and aggregate. The platform tenant is a real tenant, not missing/null. IDs are opaque. Dates stored UTC ISO 8601. Slugs are human-friendly, mutable only with redirects. Every write includes audit/provenance where relevant. No client may choose another `tenant_id` by submitting it in a JSON body.

## Collection blueprint (logical schema; implementation agent generates actual PocketBase migrations)

| Collection | Fields beyond `id`, timestamps | Public accessibility / indexing |
| --- | --- | --- |
| `tenants` | `slug unique`, `name`, `status`, `canonical_host`, `branding_json`, `enabled_features`, `default_locale`, `quotas_json` | Public read of safe branding only by resolved hostname |
| `users` (auth) | `tenant_id`, `handle`, `display_name`, `bio`, `role`, `account_status`, `email_verified`, `avatar`, `locale` | Public projection excludes email/auth/internal fields |
| `memberships` | `user_id`, `tenant_id`, `role[member|reviewer|editor|moderator|tenant_admin|platform_admin]`, `status`, `invited_by` | Only self or scoped admins |
| `countries` | `iso2 unique`, `slug`, `name`, `region`, `enabled`, `priority` | Public list; seed 54 verified official names/identifiers |
| `topic_groups` | `slug`, `name`, `sort`, `enabled` | Public |
| `topics` | `slug`, `group_id`, `name`, `keywords_json`, `enabled` | Public; original 25 taxonomy |
| `communities` | `tenant_id`, `slug`, `name`, `summary`, `country_ids[]`, `topic_ids[]`, `moderation_rules` | Published public only |
| `sources` | Registry fields from `07`, `rights_status`, `enabled`, `health` | Admin-only; public safe publisher metadata separate |
| `source_items` | `tenant_id`, `source_id`, `guid`, `canonical_url`, `title`, `permitted_excerpt`, `published_at`, `fetched_at`, `license_state`, `content_hash`, `language`, `status` | Editor/service only until published projection |
| `story_clusters` | `tenant_id`, `primary_country_ids[]`, `topic_ids[]`, `slug`, `summary`, `risk_tier`, `status`, `latest_material_update_at`, `representative_story_id` | Published projections only |
| `cluster_sources` | `tenant_id`, `cluster_id`, `source_item_id`, `claim_support_type`, `observed_at` | Editor/service; public sourced citation projection |
| `evidence_claims` | `tenant_id`, `cluster_id`, `statement`, `kind`, `source_item_ids[]`, `verification_status`, `source_locator`, `units`, `valid_at` | Approved projection in story |
| `editorial_pieces` | `tenant_id`, `cluster_id`, `slug`, `kind[short|discussion|story|spotlight]`, `headline`, `lede`, `body_blocks_json`, `author_type`, `risk_tier`, `review_status`, `published_at`, `revision`, `reviewer_id`, `is_demo`, `share_image_id` | Only approved + published + tenant host scope |
| `piece_revisions` | `tenant_id`, `piece_id`, `revision`, `change_summary`, `previous_body_ref`, `approved_by`, `approved_at`, `is_public_correction` | Public correction subset; full audit admin-only |
| `discussions` | `tenant_id`, `piece_id`, `community_id`, `status`, `human_comment_count`, `ai_comment_count` | Published public |
| `comments` | `tenant_id`, `discussion_id`, `author_id`, `author_kind[human|editorial_ai|org_agent]`, `parent_id`, `body_text`, `approval_state`, `edit_revision`, `moderation_status`, `ai_run_id` | Approved public; writes member/service only with rules |
| `votes` | `tenant_id`, `user_id`, `piece_id_or_comment_id`, `direction`, `target_kind` | Own write/read + server aggregate, uniqueness required |
| `saves` | `tenant_id`, `user_id`, `piece_id` | Owner only; uniqueness required |
| `follows` | `tenant_id`, `user_id`, `target_type`, `target_id` | Owner only; uniqueness required |
| `user_submissions` | `tenant_id`, `submitted_by`, `source_url`, `reason`, `kind`, `claim_notes`, `review_state`, `rights_attestation` | Submitter + editor only |
| `businesses` | `tenant_id`, `owner_user_id`, `name`, `slug`, `country_id`, `topic_ids[]`, `website`, `about`, `verification_state`, `assets_rights`, `profile_status` | Approved public only |
| `spotlights` | `tenant_id`, `business_id`, `piece_id`, `placement_type[editorial|sponsored]`, `disclosure_text`, `approval_status` | Only approved, always disclose sponsored |
| `ai_roles` | `tenant_id`, `key`, `label`, `purpose`, `prompt_version`, `enabled` | Public limited disclosure; admin for prompt config |
| `ai_runs` | `tenant_id`, `task_type`, `role_id`, `provider`, `model`, `prompt_hash`, `input_evidence_ids[]`, `status`, `duration_ms`, `tokens_json`, `cost_estimate`, `error_code` | Admin only; no private prompt dumps |
| `editorial_reviews` | `tenant_id`, `piece_id`, `decision`, `reviewer_id`, `reason`, `risk_tier`, `claims_check_hash`, `expected_revision` | Admin/editor only |
| `moderation_reports` | `tenant_id`, `reporter_id`, `target_type`, `target_id`, `reason`, `notes`, `status`, `assigned_to` | Reporter + authorized moderator only |
| `corrections` | `tenant_id`, `piece_id`, `revision_id`, `summary`, `public_at`, `status` | Public only if approved |
| `sponsor_inquiries` | `tenant_id`, `contact_name`, `email`, `business`, `region`, `industry`, `message`, `consent_at`, `forward_state`, `crm_ref`, `attempts` | Service/admin only; no PII in public lists |
| `sponsor_placements` | `tenant_id`, `position_key`, `revive_zone_id`, `disclosure`, `allowed_topics[]`, `allowed_countries[]`, `enabled`, `approved_by` | Safe placement config only, no private credentials |
| `tenant_entitlements` | `tenant_id`, `plan_key`, `cycle`, `valid_from`, `valid_to`, `feature_flags_json`, `billing_status` | Tenant admin self; no payments implied |
| `aggregated_metrics` | `tenant_id`, `date_bucket`, `country`, `topic`, `event`, `count`, `source`, `asof` | Authorized aggregate dashboards only |
| `audit_events` | `tenant_id`, `actor_type`, `actor_id`, `action`, `object_type`, `object_id`, `revision`, `metadata_safe`, `request_id` | Authorized admin only; append-only by service |
| `redirects` | `tenant_id`, `old_path`, `new_path`, `reason`, `active` | Resolve only within tenant |

**Not every collection needs independent browser CRUD.** Avoid raw PocketBase exposure of sources, reviews, rights, internal metrics, AI prompts or tenant admin fields. Manage them via server-only scoped APIs and audits. Keep minimal PII. High-volume events and durable worker jobs live in *separate* controlled SQLite/Parquet files, not as public PocketBase collections.

## Required uniqueness/indexes

`tenants.slug`, `(tenant_id,users.handle)`, `(tenant_id,editorial_pieces.slug)`, `(tenant_id,story_clusters.slug)`, `(tenant_id,source_items.source_id,guid)`, `(tenant_id,source_items.source_id,content_hash)` when suitable, `(tenant_id,votes.user_id,target_kind,target_id)`, `(tenant_id,saves.user_id,piece_id)`, `(tenant_id,follows.user_id,target_type,target_id)`, `(tenant_id,redirects.old_path)`, source cluster join indexes, feeds on `(tenant_id,review_status,published_at DESC)`, topics/countries via normalized pivot/link table if PocketBase multi-select indexing insufficient, comments on `(tenant_id,discussion_id,approval_state,created)`.

## Authorization model: enforce server and DB hooks

1. Ingress reverse proxy maps **verified hostname** to `tenant_id`; never trust client-supplied `X-Tenant-ID` unless rewritten by trusted server. Unknown hosts fail closed.
2. Server sessions bind user memberships to this tenant; role derived from server-verified auth record, not browser claims.
3. Every query for owned resources enforces exact tenant equality. PocketBase collection rule expressions are generated and **tested against the installed pinned version**; server hooks reject wrong-tenant foreign keys, private file references and privilege changes. A non-platform admin cannot change `tenant_id`.
4. Public queries require `status=published` and approval, `is_demo=false` on production tenant and matching host scope. Moderated comments require approved state. Drafts are never exposed in SSR JSON or search indexes.
5. Writes use service-side authorization; public user can't set `author_kind=editorial_ai`, review/approve status, sponsor label, aggregate counts or edit another user. Votes recorded once and transactionally reflected in aggregate.
6. Tenant admin may manage own theme only, not source rights/global financial/provider credentials or other tenants. Superuser credentials only on internal server for migrations/emergency, not routine worker operations.
7. Requests to private attachment URLs and analytics endpoints must pass same tenant auth; random IDs alone do not confer rights. Test hostile cross-tenant record identifiers and indirect relation references.
8. Maintain append-only audit trail for approvals/permissions/tenant switches/reports and metadata edits; network/time errors produce safe responses.

## Public API [implementation default]

Base `/api/v1` via Next.js typed route handlers. JSON envelope: `{"data": ..., "meta":{"cursor":null,"request_id":"..."},"error":null}`; failure `{"data":null,"error":{"code":"FORBIDDEN","message":"..."},"meta":{"request_id":"..."}}`. All responses carry server-selected tenant context. Avoid exposing PocketBase administrative API publicly. Rate limits by action and auth status.

| Endpoint | Verb | Auth | Data / behavior |
| --- | --- | --- | --- |
| `/feed?mode=&country=&topic=&cursor=&limit=` | GET | Public | approved story summaries; server-capped limit 20 |
| `/stories/:slug` `/discussions/:slug` | GET | Public | approved SSR-friendly content + evidence + human/AI labels |
| `/countries` `/topics` | GET | Public | configured taxonomy, content counts only measured |
| `/search?q=&country=&topic=&lang=` | GET | Public | bounded safe FTS search |
| `/time-lens/:storyId?era=` | GET | Public | verified historical records + caveats |
| `/profiles/:handle` `/businesses/:slug` | GET | Public | safe published projections |
| `/sessions` | POST | Public | secure auth flow/session, CSRF/cookies as applicable |
| `/comments` | POST | Member | `{discussion_id,parent_id?,text,client_request_id}` validated/sanitized |
| `/votes` | PUT/DELETE | Member | idempotent toggle target; no self-claim count setting |
| `/saves` `/follows` | POST/DELETE | Member | own record only |
| `/submissions` | POST | Member | permitted link + rights acknowledgement, review queue |
| `/sponsor-inquiries` | POST | Public | consent, spam/rate guard, local durable capture before CRM forwarding |
| `/correction-requests` `/reports` | POST | Public/member per policy | bounded moderation forms, abuse checks |
| `/analytics/events` | POST | Public | explicit event allowlist, no user-entered arbitrary PII |
| `/admin/editorial/:id/decision` | POST | Editor | expected revision and approval permission |
| `/admin/sources/:id/test` | POST | Editor/admin | safe backend fetch with allowlist and rights gate |
| `/admin/ai/config` | PATCH | Platform/tenant admin limited | quota/provider route subset, masked secrets, audit |
| `/admin/metrics` | GET | Admin | tenant-scoped aggregate data |
| `/admin/health` | GET | Admin | services/backup/job source-of-truth readouts |

**Typical public feed response:**

```json
{
  "data": [{
    "id": "opaque", "slug": "verified-conversation", "headline": "Reviewed title",
    "country_codes": ["NG"], "topic_slugs": ["economy"],
    "summary": "Reviewed context", "content_type": "discussion",
    "first_published_at": "2026-10-08T18:00:00Z",
    "updated_at": "2026-10-08T18:00:00Z",
    "sources": [{"name":"Approved publisher","url":"https://publisher.example/article"}],
    "counts": {"human_comments": 0, "ai_contributions": 1},
    "is_sponsored": false, "is_demo": false
  }],
  "meta":{"cursor":null,"request_id":"trace-example"},"error":null
}
```

This JSON is **contract illustration**, not a claim of an existing article.

## Internal APIs/worker adapters

Internal writer endpoint accepts signed service token bound to worker identity and tenant, supports draft upsert and source registry status, **not final high-risk publication**. Durable queue uses SQLite tables `jobs(job_id, tenant_id, type, payload_ref, state, attempts, max_attempts, lease_owner, lease_until, next_at, idempotency_key unique, error_class, created_at, updated_at)` and `job_attempts`, `dead_letters`. Workers claim in transaction, heartbeat leases, retry with backoff; publish gate separate from generation completion. One migration path owns each SQLite file. Never mount a single writable DB across multiple hosts/network FS.

## Search and analytics

FTS5 virtual index for published `editorial_pieces` title/lede/text and safe topics; indexed by `tenant_id`, built in application-managed sidecar SQLite if PocketBase's managed schema hooks make FTS integration unsafe. Search query constructs parameterized expressions, with ranking/country filters and no draft leakage. Analytics collector separate append/batch store; DuckDB/Parquet ETL outputs aggregated records to PocketBase for dashboard. No SQLite-as-PostgreSQL connection-string mythology.

## Migrations and seed discipline

Pin PocketBase version, use reproducible migrations and backup before each schema change. Seed canonical country taxonomy, topic groups, 25 sectors and platform tenant from deterministic IDs. Create demo tenant isolated from public platform; fixtures have `is_demo=true`. Do not seed fake published political headlines or active revenue/sponsors. Migration tests: fresh install, upgrade from prior state, rollback/restoration and basic permissions. User deletion/export and audit-retention policy must be documented before public launch.
