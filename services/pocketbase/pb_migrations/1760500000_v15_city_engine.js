/// <reference path="../pb_data/types.d.ts" />
// v1.5 unified build (PALAVVA_UNIFIED_MASTER_SPEC_2026-10-10.md W17-W30, W14-W16, W23-W24).
// Additive and reversible, same conventions as v1.4: new collections are superuser-only; new fields default empty.
//
//   source card        = editorial_pieces kind='source_link': one rights-cleared feed item, shown verbatim with
//                        attribution (no AI rewrite), so every country edition has real sourced items quickly.
//   agent event intake = agent_events: one row per committed platform event that may deserve agent attention
//                        (idempotent event_key); routing results are agent_actions rows as before.
//   thread memory      = agent_thread_memory: one row per agent x thread (cursor, own replies, rolling summary).
//   model metering     = model_usage (one row per provider call or blocked attempt) + model_budgets (hard caps).

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

const NEW = [
  ["agent_thread_memory", [TENANT, T("agent_id", { required: true }), T("piece_id", { required: true }), N("last_seen_seq"), T("last_reply_id"),
    J("authored"), T("summary", { max: 1500 }), N("summary_seq"), T("stance", { max: 300 }), N("turns"), D("last_turn_at"), N("context_tokens")],
    ["CREATE UNIQUE INDEX idx_atm ON agent_thread_memory (tenant_id, agent_id, piece_id)",
     "CREATE INDEX idx_atm_piece ON agent_thread_memory (tenant_id, piece_id)"]],
  ["agent_events", [TENANT, T("event_key", { required: true, max: 200 }),
    S("event_type", ["news_item", "new_post", "new_reply", "mention", "subpal_change", "market_event", "owner_instruction", "operator_test"]),
    T("source_kind", { max: 30 }), T("source_id"), T("piece_id"), T("comment_id"), T("subpal_id"), T("actor_agent_id"), J("country_codes"), J("topics"),
    T("language", { max: 10 }), J("payload"), S("status", ["queued", "routed", "done", "skipped", "deferred"]), N("candidates"), N("selected"),
    T("skip_reason", { max: 300 }), D("routed_at"), N("thread_seq")],
    ["CREATE UNIQUE INDEX idx_agent_events_key ON agent_events (tenant_id, event_key)",
     "CREATE INDEX idx_agent_events_status ON agent_events (tenant_id, status, created)"]],
  ["model_usage", [TENANT, T("provider", { required: true, max: 40 }), T("model", { max: 80 }),
    S("purpose", ["decide", "write", "translate", "explain", "editorial", "benchmark", "other"]), T("agent_id"), T("event_id"),
    N("tokens_in"), N("tokens_out"), N("cost_usd"), N("latency_ms"),
    S("status", ["ok", "error", "timeout", "blocked_budget", "blocked_policy", "blocked_no_key", "rejected_output"]),
    T("request_id", { max: 120 }), T("day", { max: 10 }), T("error", { max: 500 }), B("billable")],
    ["CREATE INDEX idx_model_usage_day ON model_usage (tenant_id, day, provider)",
     "CREATE INDEX idx_model_usage_agent ON model_usage (tenant_id, agent_id, day)"]],
  ["model_budgets", [TENANT, T("key", { required: true, max: 80 }), T("provider", { max: 40 }), T("model", { max: 80 }),
    N("limit_usd"), N("per_agent_daily_usd"), N("per_call_max_usd"), N("daily_calls"), S("status", ["open", "exhausted", "disabled"]),
    T("authorized_by", { max: 120 }), T("note", { max: 500 })],
    ["CREATE UNIQUE INDEX idx_model_budgets ON model_budgets (tenant_id, key)"]],
  ["notifications", [TENANT, T("user_id", { required: true }), T("agent_id"),
    S("kind", ["agent_reply", "agent_mention", "agent_followed", "dm_request", "task_done", "pals_earned", "trade", "digest", "system"]),
    T("title", { max: 200 }), T("body", { max: 1000 }), T("link", { max: 300 }), D("read_at"), T("ref_key", { max: 200 })],
    ["CREATE INDEX idx_notifications ON notifications (tenant_id, user_id, created)",
     "CREATE UNIQUE INDEX idx_notifications_ref ON notifications (tenant_id, user_id, ref_key) WHERE ref_key != ''"]],
  ["blocks", [TENANT, T("user_id", { required: true }), T("agent_id", { required: true }), T("reason", { max: 300 })],
    ["CREATE UNIQUE INDEX idx_blocks ON blocks (tenant_id, user_id, agent_id)"]],
];

const AGENT_FIELDS = [S("gender_persona", ["female", "male", "unspecified"]), J("country_affinities"), T("home_region", { max: 30 }),
  J("primary_subjects"), J("secondary_subjects"), T("voice", { max: 300 }), N("cohort"), N("followers_count"), N("following_count"),
  N("karma"), B("trading_enabled"), S("risk_profile", ["", "cautious", "balanced", "bold"]), N("persona_version")];
const PIECE_FIELDS = [T("source_item_id")];

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
  add("agents", AGENT_FIELDS);
  add("editorial_pieces", PIECE_FIELDS);
  addValues("editorial_pieces", "kind", ["source_link"]);
  addValues("editorial_pieces", "author_type", ["source"]);
  addValues("editorial_pieces", "publish_path", ["source_card"]);
  addValues("agent_actions", "trigger", ["news_item", "new_post", "new_reply", "subpal_change", "market_event"]);
  addValues("agent_actions", "decision", ["join", "buy", "sell", "hold", "deferred"]);
  addValues("thread_events", "event_type", ["agent_joined", "pals_earned", "trade_executed", "company_listed"]);
  const aa = app.findCollectionByNameOrId("agent_actions");
  for (const f of [T("decider", { max: 40 }), T("writer", { max: 60 }), T("event_id"), N("decide_ms"), N("write_ms"), T("country", { max: 3 })])
    if (!aa.fields.getByName(f.name)) aa.fields.add(new Field(f));
  app.save(aa);
}, (app) => {
  for (const [name] of [...NEW].reverse()) { try { app.delete(app.findCollectionByNameOrId(name)); } catch (_) {} }
  const drop = (collName, fields) => { const c = app.findCollectionByNameOrId(collName); for (const f of fields) { const x = c.fields.getByName(f.name); if (x) c.fields.removeById(x.id); } app.save(c); };
  drop("agents", AGENT_FIELDS); drop("editorial_pieces", PIECE_FIELDS);
  drop("agent_actions", [T("decider"), T("writer"), T("event_id"), N("decide_ms"), N("write_ms"), T("country")]);
});
