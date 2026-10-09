/// <reference path="../pb_data/types.d.ts" />
// v1.3 AI-first conversation engine (22-AI-FIRST-CONVERSATION-ENGINE.md).
// Additive and reversible: new fields default empty, new collections are superuser-only.
// Topics reuse `editorial_pieces`; thread posts reuse `comments` (parent_id already exists).

const T = (name, o = {}) => ({ name, type: "text", ...o });
const N = (name) => ({ name, type: "number" });
const D = (name) => ({ name, type: "date" });
const J = (name) => ({ name, type: "json", maxSize: 2000000 });
const B = (name) => ({ name, type: "bool" });
const S = (name, values) => ({ name, type: "select", values, maxSelect: 1 });
const STAMPS = [
  { name: "created", type: "autodate", onCreate: true, onUpdate: false },
  { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
];
const TENANT = T("tenant_id", { required: true, max: 40 });

const PIECE_FIELDS = [
  S("thread_state", ["candidate", "topic_started", "active", "resting", "closed", "held"]),
  S("publish_path", ["human_review", "auto_low_risk", "demo"]),
  T("initiator_role"), T("auto_decision_id"), N("ai_post_count"), D("last_activity_at"),
  J("area_ids"), T("original_language"), T("origin_country"), T("risk_basis", { max: 2000 }),
];
const COMMENT_FIELDS = [
  N("depth"), T("language"), J("evidence_ids"), T("new_angle", { max: 500 }), J("provenance"), T("moderation_decision_id"),
];
const ROLE_FIELDS = [T("expertise", { max: 1000 }), T("refusal_rules", { max: 1000 }), N("daily_quota"), N("novelty_threshold"), T("short_label")];

migrate((app) => {
  const add = (collName, fields) => {
    const c = app.findCollectionByNameOrId(collName);
    for (const f of fields) if (!c.fields.getByName(f.name)) c.fields.add(new Field(f));
    app.save(c);
  };
  add("editorial_pieces", PIECE_FIELDS);
  add("comments", COMMENT_FIELDS);
  add("ai_roles", ROLE_FIELDS);

  // Allow the automated, non-authoring validator as a review decision.
  const reviews = app.findCollectionByNameOrId("editorial_reviews");
  const dec = reviews.fields.getByName("decision");
  if (!dec.values.includes("auto_publish")) { dec.values = [...dec.values, "auto_publish"]; app.save(reviews); }

  const events = new Collection({
    type: "base", name: "thread_events", listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
    fields: [TENANT, N("seq"), S("event_type", ["topic_published", "reply_published", "post_corrected", "post_removed", "thread_paused", "thread_resumed"]),
      T("piece_id"), T("post_id"), T("parent_id"), S("author_kind", ["human", "editorial_ai", "org_agent", "system"]), T("role_id"),
      S("visibility", ["public", "staff"]), J("payload"), ...STAMPS],
    indexes: ["CREATE UNIQUE INDEX idx_thread_events_seq ON thread_events (tenant_id, seq)", "CREATE INDEX idx_thread_events_piece ON thread_events (tenant_id, piece_id, seq)"],
  });
  app.save(events);

  const decisions = new Collection({
    type: "base", name: "moderation_decisions", listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
    fields: [TENANT, S("scope", ["topic", "reply", "translation", "geo", "human_comment"]), T("target_id"), T("piece_id"),
      S("decision", ["allow", "hold", "reject"]), S("tier", ["low", "uncertain", "sensitive", "demo"]), T("ruleset_version"), J("rules"),
      T("trace_id"), T("text_hash"), T("actor"), T("reasons", { max: 3000 }), B("overridden"), T("override_by"), ...STAMPS],
    indexes: ["CREATE INDEX idx_mod_decisions ON moderation_decisions (tenant_id, scope, decision, created)"],
  });
  app.save(decisions);
}, (app) => {
  for (const n of ["moderation_decisions", "thread_events"]) { try { app.delete(app.findCollectionByNameOrId(n)); } catch (_) {} }
  const drop = (collName, fields) => {
    const c = app.findCollectionByNameOrId(collName);
    for (const f of fields) { const x = c.fields.getByName(f.name); if (x) c.fields.removeById(x.id); }
    app.save(c);
  };
  drop("editorial_pieces", PIECE_FIELDS);
  drop("comments", COMMENT_FIELDS);
  drop("ai_roles", ROLE_FIELDS);
});
