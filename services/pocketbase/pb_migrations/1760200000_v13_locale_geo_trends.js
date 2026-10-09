/// <reference path="../pb_data/types.d.ts" />
// v1.3 locale intelligence, geography (Local Pulse) and honest trending (23-LOCALE-TRENDING-LOCAL-PULSE-IMPLEMENTATION.md).
// Additive and reversible. Geometry lives in versioned static files (apps/web/public/geo); records hold IDs/hierarchy.

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
const locked = (name, fields, indexes) => new Collection({ type: "base", name, listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null, fields: [...fields, ...STAMPS], indexes });

const USER_FIELDS = [T("home_edition"), T("interface_locale"), T("reading_locale"), J("feed_locales"), J("explicit_prefs")];
const SOURCE_FIELDS = [T("publisher_country"), T("publisher_area"), J("coverage_areas"), J("feed_languages"), T("license_name"), T("license_attribution_rule", { max: 1000 })];
const ITEM_FIELDS = [T("author", { max: 200 })];
const PIECE_FIELDS = [J("source_authors")];

migrate((app) => {
  const add = (collName, fields) => {
    const c = app.findCollectionByNameOrId(collName);
    for (const f of fields) if (!c.fields.getByName(f.name)) c.fields.add(new Field(f));
    app.save(c);
  };
  add("users", USER_FIELDS);
  add("sources", SOURCE_FIELDS);
  add("source_items", ITEM_FIELDS);
  add("editorial_pieces", PIECE_FIELDS);
  const follows = app.findCollectionByNameOrId("follows");
  const tt = follows.fields.getByName("target_type");
  if (!tt.values.includes("area")) { tt.values = [...tt.values, "area"]; app.save(follows); }

  app.save(locked("localizations", [TENANT, S("target_type", ["piece", "comment"]), T("target_id", { required: true }), T("piece_id"), T("locale", { required: true }),
    T("source_locale"), N("source_version"), J("fields"), S("status", ["pending", "machine_unreviewed", "reviewed", "blocked", "failed"]), T("provider"), T("model"),
    T("prompt_version"), J("qa"), T("reviewer_id"), N("report_count"), T("error_code")],
    ["CREATE UNIQUE INDEX idx_localizations ON localizations (tenant_id, target_type, target_id, locale, source_version)",
     "CREATE INDEX idx_localizations_piece ON localizations (tenant_id, piece_id, locale)"]));
  app.save(locked("translation_reports", [TENANT, T("localization_id"), T("piece_id"), T("locale"), T("issue", { max: 2000 }), T("reporter_id"), S("status", ["open", "actioned", "dismissed"])], []));
  app.save(locked("geo_areas", [T("code", { required: true }), T("country", { required: true }), S("level", ["country", "admin1", "city", "district"]), T("kind"),
    T("name", { required: true }), J("names"), J("aliases"), J("ambiguous_aliases"), T("parent_code"), T("capital"), J("centroid"), T("dataset"), T("dataset_version"), B("geometry_available")],
    ["CREATE UNIQUE INDEX idx_geo_areas_code ON geo_areas (code)", "CREATE INDEX idx_geo_areas_country ON geo_areas (country, level)"]));
  app.save(locked("story_geo_evidence", [TENANT, T("piece_id"), T("source_item_id"), T("area_code", { required: true }), S("role", ["subject", "event", "affected", "publisher", "incidental"]),
    S("confidence", ["verified", "high_confidence", "provisional", "unresolved"]), T("evidence_span", { max: 500 }), T("method"), S("status", ["auto", "confirmed", "disputed", "corrected", "rejected"]),
    T("reviewer_id"), T("note", { max: 1000 })],
    ["CREATE INDEX idx_geo_evidence_area ON story_geo_evidence (tenant_id, area_code, status)", "CREATE INDEX idx_geo_evidence_piece ON story_geo_evidence (tenant_id, piece_id)"]));
  app.save(locked("trending_snapshots", [TENANT, S("scope", ["home", "africa", "area"]), T("country"), T("area_code"), T("piece_id"), D("window_start"), D("window_end"), D("computed_at"),
    N("rank"), N("score"), N("source_count"), N("human_views"), N("human_comments"), N("human_shares"), N("human_votes"), N("ai_posts"), J("basis"), T("confidence"), T("display_locale"), T("formula_version")],
    ["CREATE INDEX idx_trending ON trending_snapshots (tenant_id, scope, country, computed_at)"]));
}, (app) => {
  for (const n of ["trending_snapshots", "story_geo_evidence", "geo_areas", "translation_reports", "localizations"]) { try { app.delete(app.findCollectionByNameOrId(n)); } catch (_) {} }
  const drop = (collName, fields) => { const c = app.findCollectionByNameOrId(collName); for (const f of fields) { const x = c.fields.getByName(f.name); if (x) c.fields.removeById(x.id); } app.save(c); };
  drop("users", USER_FIELDS); drop("sources", SOURCE_FIELDS); drop("source_items", ITEM_FIELDS); drop("editorial_pieces", PIECE_FIELDS);
});
