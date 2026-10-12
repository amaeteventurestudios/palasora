/// <reference path="../pb_data/types.d.ts" />
// v1.8+ ISSUE-24 account lifecycle, email and newsletter consent. Additive and reversible; new collections are superuser-only.
//   users                     + email_pending, email_change_token_hash, email_change_expires_at (change-email: verify the NEW address first)
//                             + password_changed_at, welcome_sent_at
//   email_events              one row per message the platform tried to send: kind, category (transactional | marketing), transport
//                             (sink | smtp), status (captured | refused | failed | sent). The recipient is stored only as a hash.
//   newsletter_subscriptions  double opt-in consent per (tenant, email, list): pending -> confirmed -> unsubscribed, with when/how consent
//                             was given. Transactional mail never depends on this; marketing mail always does.
const T = (name, o = {}) => ({ name, type: "text", ...o });
const D = (name) => ({ name, type: "date" });
const S = (name, values) => ({ name, type: "select", values, maxSelect: 1 });
const STAMPS = [{ name: "created", type: "autodate", onCreate: true, onUpdate: false }, { name: "updated", type: "autodate", onCreate: true, onUpdate: true }];
const TENANT = T("tenant_id", { required: true, max: 40 });
const locked = (name, fields, indexes) => new Collection({ type: "base", name, listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null, fields: [...fields, ...STAMPS], indexes });
const USER_FIELDS = [T("email_pending", { max: 200 }), T("email_change_token_hash", { max: 64 }), D("email_change_expires_at"), D("password_changed_at"), D("welcome_sent_at")];
const NEW = [
  ["email_events", [TENANT, T("user_id", { max: 40 }), T("to_hash", { max: 64 }), T("kind", { required: true, max: 40 }), S("category", ["transactional", "marketing"]),
    S("transport", ["sink", "smtp", "listmonk"]), S("status", ["captured", "refused", "failed", "sent"]), T("subject", { max: 200 }), T("detail", { max: 300 })],
    ["CREATE INDEX idx_email_events_t ON email_events (tenant_id, created)", "CREATE INDEX idx_email_events_user ON email_events (tenant_id, user_id, created)"]],
  ["newsletter_subscriptions", [TENANT, T("email", { required: true, max: 200 }), T("user_id", { max: 40 }), T("list_key", { required: true, max: 40 }),
    S("status", ["pending", "confirmed", "unsubscribed"]), T("confirm_token_hash", { max: 64 }), D("confirm_expires_at"), T("unsub_token_hash", { max: 64 }),
    D("consent_at"), T("consent_source", { max: 60 }), D("unsubscribed_at")],
    ["CREATE UNIQUE INDEX idx_newsletter_once ON newsletter_subscriptions (tenant_id, email, list_key)", "CREATE INDEX idx_newsletter_unsub ON newsletter_subscriptions (unsub_token_hash)"]],
];
migrate((app) => {
  const u = app.findCollectionByNameOrId("users");
  for (const f of USER_FIELDS) if (!u.fields.getByName(f.name)) u.fields.add(new Field(f));
  app.save(u);
  for (const [name, fields, idx] of NEW) { try { app.findCollectionByNameOrId(name); } catch (_) { app.save(locked(name, fields, idx)); } }
}, (app) => {
  for (const [name] of [...NEW].reverse()) { try { app.delete(app.findCollectionByNameOrId(name)); } catch (_) {} }
  const u = app.findCollectionByNameOrId("users");
  for (const f of USER_FIELDS) { const x = u.fields.getByName(f.name); if (x) u.fields.removeById(x.id); }
  app.save(u);
});
