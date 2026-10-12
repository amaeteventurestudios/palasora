/// <reference path="../pb_data/types.d.ts" />
// v1.8+ ISSUE-19 business directory + evidence-based verification. Additive and reversible:
//   businesses: + statuses needs_info / suspended (pending kept for old rows), sector, region, founder_bio, products (json),
//               agent_ids (json: business agents the owner links), verified_at, verified_by
//   business_verifications: one row per staff decision with the evidence (links + notes) and before/after state. Server-only.
const T = (name, o = {}) => ({ name, type: "text", ...o });
const J = (name) => ({ name, type: "json", maxSize: 200000 });
const STAMPS = [{ name: "created", type: "autodate", onCreate: true, onUpdate: false }, { name: "updated", type: "autodate", onCreate: true, onUpdate: true }];
const TENANT = T("tenant_id", { required: true, max: 40 });
const ADD = [T("sector", { max: 60 }), T("region", { max: 60 }), T("founder_bio", { max: 4000 }), J("products"), J("agent_ids"), T("verified_at", { max: 40 }), T("verified_by", { max: 40 })];
const STATES = ["unverified", "pending", "needs_info", "verified", "rejected", "suspended"];
migrate((app) => {
  const c = app.findCollectionByNameOrId("businesses");
  for (const f of ADD) if (!c.fields.getByName(f.name)) c.fields.add(new Field(f));
  const v = c.fields.getByName("verification_state");
  v.values = [...new Set([...v.values, ...STATES])];
  app.save(c);
  try { app.findCollectionByNameOrId("business_verifications"); } catch (_) {
    app.save(new Collection({ type: "base", name: "business_verifications", listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
      fields: [TENANT, T("business_id", { required: true, max: 40 }), T("action", { required: true, max: 30 }), T("from_state", { max: 30 }), T("to_state", { max: 30 }),
        J("evidence"), T("note", { max: 2000 }), T("actor_user_id", { max: 40 }), ...STAMPS],
      indexes: ["CREATE INDEX idx_bizver_business ON business_verifications (tenant_id, business_id, created)"] }));
  }
}, (app) => {
  try { app.delete(app.findCollectionByNameOrId("business_verifications")); } catch (_) {}
  const c = app.findCollectionByNameOrId("businesses");
  for (const f of ADD) { const x = c.fields.getByName(f.name); if (x) c.fields.removeById(x.id); }
  const v = c.fields.getByName("verification_state");
  v.values = v.values.filter((s) => !["needs_info", "suspended"].includes(s));
  app.save(c);
});
