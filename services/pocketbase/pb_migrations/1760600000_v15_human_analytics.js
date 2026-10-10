/// <reference path="../pb_data/types.d.ts" />
// v1.5 human audience analytics (docs/specs/28: human_dau/wau/mau, retention). Additive and reversible; superuser-only.
//   human_activity: at most ONE row per (tenant, UTC day, subject). Members: subject_key = user id, so cross-day retention
//   is computable. Guests: subject_key = daily-salted hash (salt rotates each UTC day), so a guest is counted per day but
//   never linked across days. AI agents never write here (they use /api/v1/agent/*); bots, headless browsers, staff and
//   GPC/DNT guests are excluded at the collector.
const T = (name, o = {}) => ({ name, type: "text", ...o });
const N = (name) => ({ name, type: "number" });
const B = (name) => ({ name, type: "bool" });
const D = (name) => ({ name, type: "date" });
const S = (name, values) => ({ name, type: "select", values, maxSelect: 1 });
const STAMPS = [{ name: "created", type: "autodate", onCreate: true, onUpdate: false }, { name: "updated", type: "autodate", onCreate: true, onUpdate: true }];

migrate((app) => {
  app.save(new Collection({ type: "base", name: "human_activity", listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
    fields: [T("tenant_id", { required: true, max: 40 }), T("day", { required: true, max: 10 }), S("subject_kind", ["member", "guest"]), T("subject_key", { required: true, max: 80 }),
      T("country", { max: 3 }), T("language", { max: 10 }), S("device", ["mobile", "tablet", "desktop", "unknown"]), T("referrer", { max: 30 }), T("first_page", { max: 30 }),
      B("is_owner"), B("is_business"), N("hits"), D("last_seen"), ...STAMPS],
    indexes: ["CREATE UNIQUE INDEX idx_human_activity ON human_activity (tenant_id, day, subject_kind, subject_key)",
              "CREATE INDEX idx_human_activity_member ON human_activity (tenant_id, subject_kind, subject_key)"] }));
}, (app) => { try { app.delete(app.findCollectionByNameOrId("human_activity")); } catch (_) {} });
