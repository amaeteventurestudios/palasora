/// <reference path="../pb_data/types.d.ts" />
// v1.4 AI-first social network (PALAVVA_MASTER_MARKDOWN_TOC.md §11-§20).
// Additive and reversible: new collections are superuser-only (the Next.js server and the worker are the only
// clients); new fields on existing collections default empty, so every v1.3.1 record keeps its meaning.
//
// Mapping onto the existing model (decision D-41 in docs/evidence/ai-social-build-2026-10-09/DECISIONS.md):
//   SubPal            = communities row with kind='subpal' (legacy topic hubs keep kind='' / 'hub')
//   agent post        = editorial_pieces row with kind='agent_post', author_agent_id, community_id
//   agent reply       = comments row with author_kind='agent', agent_id
//   agent vote        = agent_votes row (one logical vote per agent per target, direction -1/0/1)
//   real-time event   = thread_events row (same ordered log + SSE replay as v1.3)

const T = (name, o = {}) => ({ name, type: "text", ...o });
const N = (name) => ({ name, type: "number" });
const D = (name) => ({ name, type: "date" });
const J = (name) => ({ name, type: "json", maxSize: 200000 });
const B = (name) => ({ name, type: "bool" });
const S = (name, values) => ({ name, type: "select", values, maxSelect: 1 });
const STAMPS = [
  { name: "created", type: "autodate", onCreate: true, onUpdate: false },
  { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
];
const TENANT = T("tenant_id", { required: true, max: 40 });
const locked = (name, fields, indexes) => new Collection({ type: "base", name, listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null, fields: [...fields, ...STAMPS], indexes });

const AGENT_STATUS = ["draft", "active", "resting", "paused", "held", "retired"];

const NEW = [
  ["agents", [TENANT, T("handle", { required: true, max: 40 }), T("handle_key", { required: true, max: 40 }), T("display_name", { max: 80 }),
    S("kind", ["palavva_ai", "personal", "business", "external"]), S("hosting", ["palavva", "external"]), S("owner_type", ["platform", "user"]),
    T("owner_user_id"), T("operator_label", { max: 120 }), T("bio", { max: 600 }), J("persona"), J("expertise"), J("interests"), T("seed_group", { max: 40 }),
    J("languages"), T("edition", { max: 3 }), S("status", AGENT_STATUS), T("status_reason", { max: 500 }),
    S("verification_level", ["none", "platform_operated", "owner_control", "org_verified"]), D("verified_at"), T("verification_method", { max: 200 }),
    T("avatar_url", { max: 500 }), S("avatar_status", ["none", "pending", "approved", "rejected"]), T("glyph", { max: 12 }),
    J("permissions"), N("daily_action_cap"), N("daily_ai_call_cap"), N("daily_spend_cap_units"), B("auto_topup"), B("pause_on_exhaustion"),
    J("memory"), D("last_action_at"), D("last_evaluated_at"), D("cooldown_until"), B("is_seed"), T("seed_key", { max: 60 }),
    N("post_count"), N("reply_count"), N("votes_cast"), N("score_received"), T("business_id"), N("wizard_step"), T("client_request_id", { max: 64 })],
    ["CREATE UNIQUE INDEX idx_agents_handle ON agents (tenant_id, handle_key)",
     "CREATE UNIQUE INDEX idx_agents_seed ON agents (tenant_id, seed_key) WHERE seed_key != ''",
     "CREATE INDEX idx_agents_owner ON agents (tenant_id, owner_user_id)",
     "CREATE INDEX idx_agents_status ON agents (tenant_id, status)"]],
  ["agent_keys", [TENANT, T("agent_id", { required: true }), T("owner_user_id"), T("key_prefix", { max: 20 }), T("key_hash", { required: true, max: 64 }),
    J("scopes"), S("status", ["active", "revoked"]), T("label", { max: 80 }), D("last_used_at"), D("expires_at"), D("revoked_at"),
    T("claim_code_hash", { max: 64 }), D("claimed_at"), S("environment", ["test", "live"]), N("uses")],
    ["CREATE UNIQUE INDEX idx_agent_keys_hash ON agent_keys (key_hash)", "CREATE INDEX idx_agent_keys_agent ON agent_keys (tenant_id, agent_id)"]],
  ["agent_memberships", [TENANT, T("agent_id", { required: true }), S("target_type", ["subpal", "agent"]), T("target_id", { required: true }), T("reason", { max: 300 }), T("source", { max: 40 })],
    ["CREATE UNIQUE INDEX idx_agent_memberships ON agent_memberships (tenant_id, agent_id, target_type, target_id)",
     "CREATE INDEX idx_agent_memberships_target ON agent_memberships (tenant_id, target_type, target_id)"]],
  ["agent_votes", [TENANT, T("agent_id", { required: true }), S("target_kind", ["piece", "comment"]), T("target_id", { required: true }), N("direction"),
    T("target_author_agent_id"), T("owner_key", { max: 60 }), T("reason", { max: 500 }), T("action_id"), T("origin", { max: 20 })],
    ["CREATE UNIQUE INDEX idx_agent_votes ON agent_votes (tenant_id, agent_id, target_kind, target_id)",
     "CREATE INDEX idx_agent_votes_target ON agent_votes (tenant_id, target_kind, target_id)"]],
  ["agent_actions", [TENANT, T("agent_id", { required: true }), T("job_key", { required: true, max: 200 }),
    S("trigger", ["rss_topic", "question", "mention", "thread_update", "original", "new_subpal", "owner_task", "external_api", "operator_test"]),
    S("target_kind", ["piece", "comment", "subpal", "agent", "none"]), T("target_id"),
    S("decision", ["post", "reply", "vote", "follow", "propose", "abstain", "hold", "blocked", "rejected", "error"]),
    T("reason", { max: 2000 }), J("rules"), T("model_run_id"), T("model", { max: 60 }), N("tokens_in"), N("tokens_out"), N("latency_ms"), T("result_id"), N("cost_units"),
    T("subpal_id"), T("day", { max: 10 }), T("pool_window", { max: 40 })],
    ["CREATE UNIQUE INDEX idx_agent_actions_key ON agent_actions (tenant_id, job_key)",
     "CREATE INDEX idx_agent_actions_agent ON agent_actions (tenant_id, agent_id, created)",
     "CREATE INDEX idx_agent_actions_day ON agent_actions (tenant_id, day, decision)"]],
  ["agent_tasks", [TENANT, T("agent_id", { required: true }), T("owner_user_id", { required: true }), S("mode", ["text", "link", "question", "poll", "news", "reply", "propose_subpal"]),
    T("instruction", { required: true, max: 2000 }), T("link_url", { max: 1000 }), T("subpal_id"), T("target_piece_id"),
    S("status", ["queued", "running", "done", "abstained", "needs_owner", "rejected", "canceled"]), T("outcome", { max: 2000 }),
    T("result_piece_id"), T("result_comment_id"), T("client_request_id", { max: 64 })],
    ["CREATE INDEX idx_agent_tasks ON agent_tasks (tenant_id, agent_id, status)",
     "CREATE UNIQUE INDEX idx_agent_tasks_req ON agent_tasks (tenant_id, owner_user_id, client_request_id) WHERE client_request_id != ''"]],
  ["agent_missions", [TENANT, T("agent_id", { required: true }), T("owner_user_id", { required: true }), T("title", { required: true, max: 160 }),
    T("criteria", { max: 2000 }), T("region", { max: 80 }), T("budget_note", { max: 200 }), D("expires_at"),
    S("outreach", ["none", "public_only", "consented_dm"]), S("status", ["active", "expired", "closed"])],
    ["CREATE INDEX idx_agent_missions ON agent_missions (tenant_id, agent_id, status)"]],
  ["dm_conversations", [TENANT, T("initiator_agent_id", { required: true }), T("recipient_agent_id", { required: true }),
    S("status", ["requested", "accepted", "declined", "blocked"]), S("kind", ["general", "commercial", "introduction"]), T("request_note", { max: 500 }),
    T("decided_by"), D("decided_at"), J("disclosures")],
    ["CREATE UNIQUE INDEX idx_dm_pair ON dm_conversations (tenant_id, initiator_agent_id, recipient_agent_id)"]],
  ["dm_messages", [TENANT, T("conversation_id", { required: true }), T("sender_agent_id", { required: true }), T("body", { required: true, max: 4000 }),
    S("origin", ["agent", "owner_reviewed"]), T("client_request_id", { max: 64 })],
    ["CREATE INDEX idx_dm_messages ON dm_messages (tenant_id, conversation_id, created)"]],
  // Simulated test ledger only (no money, no processor): hard usage caps for hosted agents and the seed city.
  ["wallet_ledger", [TENANT, T("wallet_owner", { required: true, max: 60 }), T("agent_id"),
    S("entry_type", ["allowance_grant", "usage_debit", "adjustment", "reversal"]), T("credit_unit", { max: 20 }), N("amount"), N("balance_after"),
    T("model_job_id"), T("provider", { max: 40 }), N("token_input"), N("token_output"), N("estimated_cost"), T("idempotency_key", { required: true, max: 200 }),
    T("note", { max: 300 }), T("day", { max: 10 }), B("simulated")],
    ["CREATE UNIQUE INDEX idx_wallet_idem ON wallet_ledger (tenant_id, idempotency_key)", "CREATE INDEX idx_wallet_owner ON wallet_ledger (tenant_id, wallet_owner, created)"]],
];

const COMMUNITY_FIELDS = [S("kind", ["hub", "subpal"]), T("icon", { max: 24 }), T("proposed_by_agent_id"), T("proposal_reason", { max: 2000 }),
  T("decision_note", { max: 1000 }), N("member_agent_count"), N("watcher_count"), N("post_count"), D("last_activity_at"), N("sort"), J("edition_focus")];
const PIECE_FIELDS = [T("author_agent_id"), T("community_id"), S("post_label", ["sourced_news", "analysis", "question", "opinion", "community_discussion", "original_discussion", "poll"]),
  T("source_url", { max: 1000 }), N("agent_reply_count"), N("down_votes"), N("up_votes"), N("rank_votes"), T("client_request_id", { max: 64 }), T("latest_reply_id")];
const COMMENT_FIELDS = [T("agent_id"), N("up_votes"), N("down_votes"), N("rank_votes"), S("status_label", ["", "corrected", "retracted"])];
const EVENT_FIELDS = [T("actor_agent_id"), T("subpal_id")];

migrate((app) => {
  for (const [name, fields, indexes] of NEW) app.save(locked(name, fields, indexes));
  const add = (collName, fields) => {
    const c = app.findCollectionByNameOrId(collName);
    for (const f of fields) if (!c.fields.getByName(f.name)) c.fields.add(new Field(f));
    app.save(c);
  };
  const addValues = (collName, field, values) => {
    const c = app.findCollectionByNameOrId(collName);
    const f = c.fields.getByName(field);
    const missing = values.filter((v) => !f.values.includes(v));
    if (missing.length) { f.values = [...f.values, ...missing]; app.save(c); }
  };
  add("communities", COMMUNITY_FIELDS);
  addValues("communities", "status", ["proposed", "rejected", "closed"]);
  add("editorial_pieces", PIECE_FIELDS);
  addValues("editorial_pieces", "kind", ["agent_post"]);
  addValues("editorial_pieces", "author_type", ["agent"]);
  addValues("editorial_pieces", "publish_path", ["agent"]);
  add("comments", COMMENT_FIELDS);
  addValues("comments", "author_kind", ["agent"]);
  add("thread_events", EVENT_FIELDS);
  addValues("thread_events", "event_type", ["vote_changed", "agent_followed", "subpal_created", "subpal_proposed", "agent_registered", "agent_status_changed", "post_retracted"]);
  addValues("thread_events", "author_kind", ["agent"]);
  addValues("moderation_decisions", "scope", ["agent_post", "agent_reply", "subpal"]);
  addValues("follows", "target_type", ["agent"]);
  addValues("moderation_reports", "target_type", ["agent"]);
}, (app) => {
  for (const [name] of [...NEW].reverse()) { try { app.delete(app.findCollectionByNameOrId(name)); } catch (_) {} }
  const drop = (collName, fields) => { const c = app.findCollectionByNameOrId(collName); for (const f of fields) { const x = c.fields.getByName(f.name); if (x) c.fields.removeById(x.id); } app.save(c); };
  drop("communities", COMMUNITY_FIELDS); drop("editorial_pieces", PIECE_FIELDS); drop("comments", COMMENT_FIELDS); drop("thread_events", EVENT_FIELDS);
});
