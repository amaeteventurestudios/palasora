/// <reference path="../pb_data/types.d.ts" />
// v1.3.1 real human engagement for trending (23 §5): per-story daily view/share aggregates plus short-lived,
// salted dedupe keys. No IP, user agent or cookie identifier is stored; keys are one-way hashes with a salt that
// rotates daily and rows are purged after 48 h. Additive and reversible. Superuser-only (server writes).

const T = (name, o = {}) => ({ name, type: "text", ...o });
const N = (name) => ({ name, type: "number" });
const STAMPS = [
  { name: "created", type: "autodate", onCreate: true, onUpdate: false },
  { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
];
const TENANT = T("tenant_id", { required: true, max: 40 });
const locked = (name, fields, indexes) => new Collection({ type: "base", name, listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null, fields: [...fields, ...STAMPS], indexes });

migrate((app) => {
  app.save(locked("engagement_daily", [TENANT, T("piece_id", { required: true }), T("day", { required: true, max: 10 }), N("views"), N("shares"), N("share_whatsapp"),
    N("share_x"), N("share_facebook"), N("share_copy"), N("share_native"), N("rejected_bot"), N("rejected_duplicate")],
    ["CREATE UNIQUE INDEX idx_engagement_daily ON engagement_daily (tenant_id, piece_id, day)", "CREATE INDEX idx_engagement_day ON engagement_daily (tenant_id, day)"]));
  app.save(locked("engagement_keys", [TENANT, T("key_hash", { required: true, max: 64 }), T("day", { required: true, max: 10 })],
    ["CREATE UNIQUE INDEX idx_engagement_keys ON engagement_keys (tenant_id, key_hash)", "CREATE INDEX idx_engagement_keys_day ON engagement_keys (day)"]));
}, (app) => {
  for (const n of ["engagement_keys", "engagement_daily"]) { try { app.delete(app.findCollectionByNameOrId(n)); } catch (_) {} }
});
