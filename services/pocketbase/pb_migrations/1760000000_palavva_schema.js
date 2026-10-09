/// <reference path="../pb_data/types.d.ts" />
// Palavva schema v1, implementing the logical blueprint in 09-DATA-MODEL-AND-APIS.md.
// Every Palavva collection is superuser-only (null rules): the Next.js server is the
// sole client and enforces host-resolved tenant scope (see docs/evidence/DECISIONS.md ADR-004).

const T = (name, o = {}) => ({ name, type: "text", ...o });
const N = (name, o = {}) => ({ name, type: "number", ...o });
const B = (name) => ({ name, type: "bool" });
const D = (name) => ({ name, type: "date" });
const J = (name) => ({ name, type: "json", maxSize: 2000000 });
const S = (name, values) => ({ name, type: "select", values, maxSelect: 1 });
const E = (name, o = {}) => ({ name, type: "email", ...o });
const U = (name) => ({ name, type: "url" });
const STAMPS = [
  { name: "created", type: "autodate", onCreate: true, onUpdate: false },
  { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
];
const TENANT = T("tenant_id", { required: true, max: 40 });

const DEFS = [
  ["tenants", [T("slug", { required: true }), T("name", { required: true }), S("status", ["active", "disabled"]),
    T("canonical_host"), J("hostnames"), J("branding_json"), J("enabled_features"), T("default_locale"), J("quotas_json"), B("is_demo")],
    ["CREATE UNIQUE INDEX idx_tenants_slug ON tenants (slug)"]],
  ["memberships", [TENANT, T("user_id", { required: true }), S("role", ["member", "reviewer", "editor", "moderator", "tenant_admin", "platform_admin"]),
    S("status", ["active", "suspended", "invited"]), T("invited_by")],
    ["CREATE UNIQUE INDEX idx_memberships_tu ON memberships (tenant_id, user_id)"]],
  ["sessions", [TENANT, T("user_id", { required: true }), T("token_hash", { required: true }), T("csrf_token"), D("expires_at"), D("last_seen_at"), T("user_agent_class")],
    ["CREATE UNIQUE INDEX idx_sessions_hash ON sessions (token_hash)"]],
  ["countries", [T("iso2", { required: true }), T("slug", { required: true }), T("name", { required: true }), T("region"), B("enabled"), N("priority"), J("languages")],
    ["CREATE UNIQUE INDEX idx_countries_iso2 ON countries (iso2)", "CREATE UNIQUE INDEX idx_countries_slug ON countries (slug)"]],
  ["topic_groups", [T("slug", { required: true }), T("name", { required: true }), N("sort"), B("enabled"), T("description")],
    ["CREATE UNIQUE INDEX idx_topic_groups_slug ON topic_groups (slug)"]],
  ["topics", [T("slug", { required: true }), T("group_slug", { required: true }), T("name", { required: true }), T("description"), J("keywords_json"), B("enabled"), N("sort")],
    ["CREATE UNIQUE INDEX idx_topics_slug ON topics (slug)"]],
  ["communities", [TENANT, T("slug", { required: true }), T("name"), T("summary"), J("country_codes"), J("topic_slugs"), T("moderation_rules"), S("status", ["published", "hidden"])],
    ["CREATE UNIQUE INDEX idx_communities_ts ON communities (tenant_id, slug)"]],
  ["sources", [TENANT, T("publisher_name", { required: true }), U("homepage_url"), U("endpoint_url"), S("endpoint_type", ["rss", "atom", "api", "manual"]),
    J("languages"), J("countries"), J("topic_ids"), S("source_class", ["official", "media", "archive", "licensed", "submission", "discovery"]),
    S("trust_tier", ["primary", "corroborated", "discovery"]), S("rights_status", ["pending", "approved", "restricted", "revoked"]),
    S("usage_policy", ["link_only", "metadata_only", "permitted_excerpt", "licensed_full"]), U("license_url"), T("rights_verified_by"), D("rights_verified_at"),
    T("rights_notes", { max: 5000 }), T("attribution_text"), N("content_retention_days"), N("fetch_interval_minutes"), N("request_timeout_sec"), N("rate_limit_per_hour"),
    T("robots_review"), D("terms_review_date"), B("enabled"), D("last_attempt_at"), D("last_success_at"), T("last_error_code"), N("consecutive_failures"),
    D("next_fetch_at"), T("etag"), T("last_modified"), J("allowed_hosts"), B("is_fixture")],
    ["CREATE INDEX idx_sources_tenant ON sources (tenant_id, enabled)"]],
  ["source_items", [TENANT, T("source_id", { required: true }), T("guid", { required: true }), T("canonical_url"), T("title", { max: 1000 }), T("permitted_excerpt", { max: 2000 }),
    D("published_at"), D("fetched_at"), S("license_state", ["link_only", "metadata_only", "permitted_excerpt", "licensed_full", "revoked"]), T("content_hash"), T("title_fingerprint"),
    T("language"), J("country_candidates"), J("topic_candidates"), N("classification_confidence"), B("classification_ambiguous"),
    S("status", ["new", "classified", "clustered", "ignored", "held", "researched", "drafted", "revoked"]), T("cluster_id"), T("decision_reason", { max: 2000 }), B("is_fixture")],
    ["CREATE UNIQUE INDEX idx_source_items_guid ON source_items (tenant_id, source_id, guid)", "CREATE INDEX idx_source_items_hash ON source_items (tenant_id, source_id, content_hash)"]],
  ["story_clusters", [TENANT, J("primary_country_codes"), J("topic_slugs"), T("slug", { required: true }), T("summary", { max: 2000 }), S("risk_tier", ["low", "medium", "high"]),
    S("status", ["open", "held", "drafted", "published", "rejected", "merged"]), D("latest_material_update_at"), T("representative_item_id"), T("match_explanation", { max: 2000 }),
    J("entity_keys"), B("is_fixture")],
    ["CREATE UNIQUE INDEX idx_story_clusters_slug ON story_clusters (tenant_id, slug)"]],
  ["cluster_sources", [TENANT, T("cluster_id", { required: true }), T("source_item_id", { required: true }), T("claim_support_type"), D("observed_at"), T("match_reason")],
    ["CREATE UNIQUE INDEX idx_cluster_sources ON cluster_sources (tenant_id, cluster_id, source_item_id)"]],
  ["evidence_claims", [TENANT, T("cluster_id", { required: true }), T("claim_key", { required: true }), T("statement", { max: 2000 }), S("kind", ["observation", "interpretation", "projection"]),
    J("source_item_ids"), S("verification_status", ["supported", "needs_review", "unsupported", "contradicted"]), T("source_locator", { max: 1000 }), T("units"), T("valid_at"), T("uncertainty_note", { max: 1000 })],
    ["CREATE UNIQUE INDEX idx_claims_key ON evidence_claims (tenant_id, cluster_id, claim_key)"]],
  ["editorial_pieces", [TENANT, T("cluster_id"), T("slug", { required: true }), S("kind", ["short", "discussion", "story", "spotlight"]), T("headline", { required: true, max: 300 }),
    T("lede", { max: 1200 }), J("body_blocks_json"), S("author_type", ["editorial_ai_assisted", "human_editor", "fixture"]), S("risk_tier", ["low", "medium", "high"]),
    S("review_status", ["draft", "needs_review", "changes_requested", "held", "approved", "scheduled", "published", "rejected", "retracted"]),
    D("published_at"), D("first_published_at"), D("material_updated_at"), N("revision"), T("reviewer_id"), B("is_demo"), T("share_image_id"),
    J("country_codes"), J("topic_slugs"), T("language"), B("editor_pick"), J("sources_json"), T("evidence_state"), T("claim_check_status"), T("ai_run_ids"),
    N("human_comment_count"), N("ai_contribution_count"), N("vote_score"), N("save_count"), B("still_developing"), T("correction_note", { max: 1000 })],
    ["CREATE UNIQUE INDEX idx_pieces_slug ON editorial_pieces (tenant_id, slug)", "CREATE INDEX idx_pieces_feed ON editorial_pieces (tenant_id, review_status, published_at)"]],
  ["piece_revisions", [TENANT, T("piece_id", { required: true }), N("revision"), T("change_summary", { max: 2000 }), J("previous_snapshot"), T("approved_by"), D("approved_at"), B("is_public_correction")],
    ["CREATE INDEX idx_revisions_piece ON piece_revisions (tenant_id, piece_id, revision)"]],
  ["discussions", [TENANT, T("piece_id", { required: true }), T("community_id"), S("status", ["open", "locked", "hidden"]), N("human_comment_count"), N("ai_comment_count")],
    ["CREATE UNIQUE INDEX idx_discussions_piece ON discussions (tenant_id, piece_id)"]],
  ["comments", [TENANT, T("discussion_id", { required: true }), T("piece_id"), T("author_id"), S("author_kind", ["human", "editorial_ai", "org_agent"]), T("role_id"), T("parent_id"),
    T("body_text", { required: true, max: 5000 }), S("approval_state", ["approved", "pending", "rejected"]), N("edit_revision"),
    S("moderation_status", ["visible", "flagged", "quarantined", "removed"]), T("ai_run_id"), J("claim_ids"), T("client_request_id"), N("vote_score")],
    ["CREATE INDEX idx_comments_disc ON comments (tenant_id, discussion_id, approval_state, created)", "CREATE UNIQUE INDEX idx_comments_req ON comments (tenant_id, author_id, client_request_id) WHERE client_request_id != ''"]],
  ["votes", [TENANT, T("user_id", { required: true }), T("target_id", { required: true }), S("target_kind", ["piece", "comment"]), N("direction")],
    ["CREATE UNIQUE INDEX idx_votes_unique ON votes (tenant_id, user_id, target_kind, target_id)"]],
  ["saves", [TENANT, T("user_id", { required: true }), T("piece_id", { required: true })], ["CREATE UNIQUE INDEX idx_saves_unique ON saves (tenant_id, user_id, piece_id)"]],
  ["follows", [TENANT, T("user_id", { required: true }), S("target_type", ["country", "topic", "member", "community"]), T("target_id", { required: true })],
    ["CREATE UNIQUE INDEX idx_follows_unique ON follows (tenant_id, user_id, target_type, target_id)"]],
  ["user_submissions", [TENANT, T("submitted_by", { required: true }), T("source_url", { max: 2000 }), T("reason", { max: 3000 }), S("kind", ["story", "business"]), T("claim_notes", { max: 3000 }),
    S("review_state", ["queued", "accepted", "declined"]), B("rights_attestation")], []],
  ["businesses", [TENANT, T("owner_user_id"), T("name", { required: true }), T("slug", { required: true }), T("country_code"), J("topic_slugs"), T("website"),
    T("about", { max: 4000 }), J("profile_json"), S("verification_state", ["unverified", "pending", "verified", "rejected"]), T("assets_rights"),
    S("profile_status", ["draft", "published", "hidden"]), B("is_demo")],
    ["CREATE UNIQUE INDEX idx_business_slug ON businesses (tenant_id, slug)"]],
  ["spotlights", [TENANT, T("business_id", { required: true }), T("piece_id"), S("placement_type", ["editorial", "sponsored"]), T("disclosure_text"), S("approval_status", ["pending", "approved", "rejected"])], []],
  ["ai_roles", [TENANT, T("key", { required: true }), T("label"), T("purpose", { max: 1000 }), T("use_when", { max: 1000 }), T("prompt_version"), B("enabled")],
    ["CREATE UNIQUE INDEX idx_ai_roles ON ai_roles (tenant_id, key)"]],
  ["ai_runs", [TENANT, T("task_type"), T("role_id"), T("provider"), T("model"), T("prompt_version"), T("prompt_hash"), J("input_evidence_ids"),
    S("status", ["succeeded", "failed", "timeout", "abstained", "invalid_output", "skipped"]), N("duration_ms"), J("tokens_json"), N("cost_estimate"), T("error_code"),
    T("job_id"), T("cluster_id"), T("output_ref"), B("is_fixture_provider")], ["CREATE INDEX idx_ai_runs ON ai_runs (tenant_id, created)"]],
  ["editorial_reviews", [TENANT, T("piece_id", { required: true }), S("decision", ["approve", "request_changes", "hold", "reject", "merge", "publish", "correct", "retract"]),
    T("reviewer_id", { required: true }), T("reason", { max: 3000 }), S("risk_tier", ["low", "medium", "high"]), T("claims_check_hash"), N("expected_revision")],
    ["CREATE INDEX idx_reviews_piece ON editorial_reviews (tenant_id, piece_id)"]],
  ["moderation_reports", [TENANT, T("reporter_id"), S("target_type", ["comment", "piece", "profile", "business"]), T("target_id", { required: true }),
    S("reason", ["harassment", "hate", "spam", "misleading", "privacy", "copyright", "other"]), T("notes", { max: 3000 }),
    S("status", ["open", "actioned", "dismissed", "appealed"]), T("assigned_to"), T("resolution", { max: 2000 })], []],
  ["correction_requests", [TENANT, T("story_url", { max: 2000 }), T("piece_id"), T("issue", { required: true, max: 4000 }), T("evidence_url", { max: 2000 }), T("contact_email"),
    S("status", ["open", "accepted", "declined"])], []],
  ["corrections", [TENANT, T("piece_id", { required: true }), T("revision_id"), T("summary", { max: 2000 }), D("public_at"), S("status", ["draft", "published"])], []],
  ["sponsor_inquiries", [TENANT, T("reference", { required: true }), T("contact_name", { required: true }), E("email", { required: true }), T("business", { required: true }), T("website"),
    T("region"), T("industry"), T("promote", { max: 2000 }), T("budget_range"), T("message", { max: 4000 }), D("consent_at"),
    S("forward_state", ["PENDING_FORWARD", "FORWARDED", "FORWARD_FAILED", "MANUAL", "NOT_CONFIGURED"]), T("crm_ref"), N("attempts"), T("last_error"), D("next_attempt_at")],
    ["CREATE UNIQUE INDEX idx_inquiry_ref ON sponsor_inquiries (reference)"]],
  ["sponsor_placements", [TENANT, T("position_key", { required: true }), T("revive_zone_id"), T("disclosure"), J("allowed_topics"), J("allowed_countries"), B("enabled"), T("approved_by")],
    ["CREATE UNIQUE INDEX idx_placements ON sponsor_placements (tenant_id, position_key)"]],
  ["tenant_entitlements", [TENANT, T("plan_key"), S("cycle", ["monthly", "quarterly", "six_month", "annual"]), D("valid_from"), D("valid_to"), J("feature_flags_json"),
    S("billing_status", ["not_enabled"])], []],
  ["tenant_settings", [TENANT, T("key", { required: true }), J("value"), T("changed_by"), T("reason", { max: 1000 })],
    ["CREATE UNIQUE INDEX idx_tenant_settings ON tenant_settings (tenant_id, key)"]],
  ["aggregated_metrics", [TENANT, T("date_bucket", { required: true }), T("country"), T("topic"), T("event", { required: true }), N("count"), T("source"), D("asof")],
    ["CREATE UNIQUE INDEX idx_metrics ON aggregated_metrics (tenant_id, date_bucket, event, country, topic)"]],
  ["audit_events", [TENANT, S("actor_type", ["user", "service", "system"]), T("actor_id"), T("action", { required: true }), T("object_type"), T("object_id"), N("revision"),
    J("metadata_safe"), T("request_id")], ["CREATE INDEX idx_audit ON audit_events (tenant_id, created)"]],
  ["redirects", [TENANT, T("old_path", { required: true }), T("new_path", { required: true }), T("reason"), B("active")],
    ["CREATE UNIQUE INDEX idx_redirects ON redirects (tenant_id, old_path)"]],
  ["archive_sources", [TENANT, T("institution", { required: true }), U("catalog_url"), T("document_id"), T("era"), T("country_code"), J("languages"),
    S("rights_status", ["pending", "approved", "restricted"]), T("source_date"), T("digitization_date"), T("provenance", { max: 2000 }), U("citation_url"),
    T("permitted_excerpt", { max: 2000 }), T("research_note", { max: 2000 }), B("verified")], []],
  ["time_lens_entries", [TENANT, T("piece_id", { required: true }), T("era", { required: true }), T("title"), J("archive_source_ids"), J("then_points"), J("now_points"),
    J("similarities"), J("differences"), J("unknowns"), S("status", ["draft", "published"])], []],
];

migrate((app) => {
  for (const [name, fields, indexes] of DEFS) {
    const c = new Collection({
      type: "base", name,
      listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
      fields: [...fields, ...STAMPS],
      indexes,
    });
    app.save(c);
  }

  // Extend the default auth collection. Rules locked: the browser never talks to PocketBase.
  const users = app.findCollectionByNameOrId("users");
  users.listRule = null; users.viewRule = null; users.createRule = null; users.updateRule = null; users.deleteRule = null;
  for (const f of [T("tenant_id", { max: 40 }), T("handle", { max: 40 }), T("display_name", { max: 80 }), T("bio", { max: 500 }),
    S("account_status", ["active", "suspended", "deleted"]), S("profile_kind", ["human", "editorial_ai", "organization"]), T("locale"), T("verify_token_hash"), D("verify_expires_at")]) {
    users.fields.add(new Field(f));
  }
  users.indexes = [...users.indexes, "CREATE UNIQUE INDEX idx_users_handle ON users (tenant_id, handle) WHERE handle != ''"];
  app.save(users);
}, (app) => {
  for (const [name] of [...DEFS].reverse()) {
    try { app.delete(app.findCollectionByNameOrId(name)); } catch (_) {}
  }
});
