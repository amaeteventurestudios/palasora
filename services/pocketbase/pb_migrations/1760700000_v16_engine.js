/// <reference path="../pb_data/types.d.ts" />
// v1.6 one pan-African engine (founder directive 2026-10-10). Additive and reversible, same conventions as v1.5.
//
//   link signal       = editorial_pieces kind='source_link' publish_path='link_signal': a DISCOVERED publisher's headline
//                       and link-out only (no excerpt), DB gate path 5 (pb_hooks/lib/gate.js).
//   discovery runs    = discovery_runs: one row per (country, method) collection attempt, so Command Center can tell
//                       "no publisher found" from "collection failed" from "nothing new".
//   source discovery  = sources.discovery (method, first/last seen, article count, feeds and sitemaps found).

const T = (name, o = {}) => ({ name, type: "text", ...o });
const N = (name) => ({ name, type: "number" });
const J = (name) => ({ name, type: "json", maxSize: 200000 });
const S = (name, values) => ({ name, type: "select", values, maxSelect: 1 });
const STAMPS = [
  { name: "created", type: "autodate", onCreate: true, onUpdate: false },
  { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
];
const TENANT = T("tenant_id", { required: true, max: 40 });

const RUNS = new Collection({
  type: "base", name: "discovery_runs", listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
  fields: [TENANT, T("country", { max: 3 }), S("method", ["gdelt", "searxng", "feeds", "sitemap", "rss", "changedetection"]),
    S("status", ["ok", "empty", "error", "rate_limited", "skipped"]), N("found"), N("relevant"), N("new_sources"), N("new_items"), N("published"), N("held"),
    N("duplicates"), N("unreadable_language"), N("duration_ms"), T("error", { max: 500 }), J("detail"), ...STAMPS],
  indexes: ["CREATE INDEX idx_discovery_runs ON discovery_runs (tenant_id, country, created)"],
});

migrate((app) => {
  app.save(RUNS);
  const pieces = app.findCollectionByNameOrId("editorial_pieces");
  const pp = pieces.fields.getByName("publish_path");
  if (!pp.values.includes("link_signal")) { pp.values = [...pp.values, "link_signal"]; app.save(pieces); }
  const src = app.findCollectionByNameOrId("sources");
  if (!src.fields.getByName("discovery")) src.fields.add(new Field(J("discovery")));
  if (!src.fields.getByName("health")) src.fields.add(new Field(T("health", { max: 40 })));
  app.save(src);
}, (app) => {
  try { app.delete(app.findCollectionByNameOrId("discovery_runs")); } catch (_) {}
  const src = app.findCollectionByNameOrId("sources");
  for (const n of ["discovery", "health"]) { const f = src.fields.getByName(n); if (f) src.fields.removeById(f.id); }
  app.save(src);
});
