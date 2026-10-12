/// <reference path="../pb_data/types.d.ts" />
// v1.8+ ISSUE-16 advertising inventory + ISSUE-18 sponsor pipeline. Additive and reversible; new collections are superuser-only.
//   sponsor_inquiries  + pipeline_stage (new → contacted → qualified → proposal → won | lost), owner, country, target audience, package,
//                        follow-up date, notes (append-only list), duplicate_of, EspoCRM record ids (lead/account/contact/opportunity),
//                        last_synced_at; forward_state also allows DUPLICATE (an earlier inquiry from the same address is linked instead)
//   sponsor_placements + label, page_types, density, targeting (continent/region/country/admin region/language/SubPal/topic/device)
//   ad_test_creatives    NON-BILLABLE test creatives used while Revive is not live; always labelled as a test placement
//   ad_events            served/click events per placement with the audience class (human | bot | staff); agents never browse, so
//                        they can never produce one; billable is always false until paid advertising is authorised
const T = (name, o = {}) => ({ name, type: "text", ...o });
const D = (name) => ({ name, type: "date" });
const J = (name) => ({ name, type: "json", maxSize: 200000 });
const B = (name) => ({ name, type: "bool" });
const S = (name, values) => ({ name, type: "select", values, maxSelect: 1 });
const STAMPS = [{ name: "created", type: "autodate", onCreate: true, onUpdate: false }, { name: "updated", type: "autodate", onCreate: true, onUpdate: true }];
const TENANT = T("tenant_id", { required: true, max: 40 });
const locked = (name, fields, indexes) => new Collection({ type: "base", name, listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null, fields: [...fields, ...STAMPS], indexes });
const ADD = {
  sponsor_inquiries: [S("pipeline_stage", ["new", "contacted", "qualified", "proposal", "won", "lost"]), T("owner_user_id", { max: 40 }), T("country", { max: 3 }),
    T("target_audience", { max: 300 }), T("package", { max: 120 }), D("follow_up_at"), J("notes"), T("duplicate_of", { max: 40 }), T("crm_lead_id", { max: 40 }),
    T("crm_account_id", { max: 40 }), T("crm_contact_id", { max: 40 }), T("crm_opportunity_id", { max: 40 }), D("last_synced_at"), T("sync_note", { max: 300 })],
  sponsor_placements: [T("label", { max: 120 }), J("page_types"), J("density"), J("targeting")],
};
const NEW = [
  ["ad_test_creatives", [TENANT, T("title", { required: true, max: 90 }), T("body", { max: 200 }), T("advertiser_label", { required: true, max: 80 }), T("click_url", { max: 500 }),
    J("placement_keys"), J("targeting"), S("status", ["draft", "active", "paused"]), T("created_by", { max: 40 })],
    ["CREATE INDEX idx_ad_test_creatives_t ON ad_test_creatives (tenant_id, status)"]],
  ["ad_events", [TENANT, T("placement_key", { required: true, max: 40 }), T("creative_ref", { max: 80 }), S("source", ["revive", "test"]), S("event", ["served", "click"]),
    S("audience", ["human", "bot", "staff"]), T("edition", { max: 3 }), T("language", { max: 10 }), T("page", { max: 200 }), B("billable")],
    ["CREATE INDEX idx_ad_events_t ON ad_events (tenant_id, created)", "CREATE INDEX idx_ad_events_p ON ad_events (tenant_id, placement_key, event)"]],
];
migrate((app) => {
  for (const [coll, fields] of Object.entries(ADD)) {
    const c = app.findCollectionByNameOrId(coll);
    for (const f of fields) if (!c.fields.getByName(f.name)) c.fields.add(new Field(f));
    if (coll === "sponsor_inquiries") { const fs = c.fields.getByName("forward_state"); fs.values = [...new Set([...fs.values, "DUPLICATE"])]; }
    app.save(c);
  }
  for (const [name, fields, idx] of NEW) { try { app.findCollectionByNameOrId(name); } catch (_) { app.save(locked(name, fields, idx)); } }
}, (app) => {
  for (const [name] of [...NEW].reverse()) { try { app.delete(app.findCollectionByNameOrId(name)); } catch (_) {} }
  for (const [coll, fields] of Object.entries(ADD)) {
    const c = app.findCollectionByNameOrId(coll);
    for (const f of fields) { const x = c.fields.getByName(f.name); if (x) c.fields.removeById(x.id); }
    if (coll === "sponsor_inquiries") { const fs = c.fields.getByName("forward_state"); fs.values = fs.values.filter((v) => v !== "DUPLICATE"); }
    app.save(c);
  }
});
