/// <reference path="../pb_data/types.d.ts" />
// Palasora Phase 4 (architecture doc 06, sections 5 and 13): town events reach the feed, notifications and live updates.
// Additive only: one new collection, new select values and empty-by-default fields. Nothing is dropped or rewritten.
//   town event record = town_events row, one per economy event id (the relay's applied-once key on this side)
//   town event post   = editorial_pieces row with kind='town_event', author_type='town', publish_path='town_event',
//                       town_event_id, community_id = the town's SubPal; feed_scope 'main' or 'place' (SubPal only)
//   place SubPal      = communities row with kind='subpal', place_kind='town', town_id
//   plot join         = follows row (person) or agent_memberships row (agent) with source='plot'
// Numbers are never stored here: the town record page reads them live from the economy service.
const T = (name, o = {}) => ({ name, type: "text", ...o });
const N = (name) => ({ name, type: "number" });
const J = (name) => ({ name, type: "json", maxSize: 20000 });
const S = (name, values) => ({ name, type: "select", values, maxSelect: 1 });
const STAMPS = [
  { name: "created", type: "autodate", onCreate: true, onUpdate: false },
  { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
];
const TENANT = T("tenant_id", { required: true, max: 40 });

migrate((app) => {
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
  const addIndex = (collName, name, sql) => {
    const c = app.findCollectionByNameOrId(collName);
    if (!c.indexes.some((i) => i.includes(name))) { c.indexes = [...c.indexes, sql]; app.save(c); }
  };

  app.save(new Collection({
    type: "base", name: "town_events", listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
    fields: [TENANT, T("event_id", { required: true, max: 40 }), T("town_id", { max: 40 }), T("kind", { max: 40 }),
      S("visibility", ["public", "town", "owner", "staff"]), T("text", { max: 400 }), J("refs"), N("seq"), N("tick"),
      S("status", ["live", "withdrawn"]), T("withdrawn_reason", { max: 300 }), T("piece_id"), ...STAMPS],
    indexes: ["CREATE UNIQUE INDEX idx_town_events_id ON town_events (tenant_id, event_id)",
      "CREATE INDEX idx_town_events_town ON town_events (tenant_id, town_id, seq)"],
  }));

  add("editorial_pieces", [T("town_event_id", { max: 40 }), T("feed_scope", { max: 10 })]);
  addValues("editorial_pieces", "kind", ["town_event"]);
  addValues("editorial_pieces", "author_type", ["town"]);
  addValues("editorial_pieces", "publish_path", ["town_event"]);
  addIndex("editorial_pieces", "idx_pieces_town_event", "CREATE UNIQUE INDEX idx_pieces_town_event ON editorial_pieces (tenant_id, town_event_id) WHERE town_event_id != ''");
  addValues("moderation_decisions", "scope", ["town_event"]);

  add("notifications", [T("town_event_id", { max: 40 })]);
  addValues("notifications", "kind", ["town_event"]);

  add("thread_events", [T("town_event_id", { max: 40 })]);
  addValues("thread_events", "event_type", ["town_event", "town_event_withdrawn"]);
  addIndex("thread_events", "idx_thread_events_town", "CREATE UNIQUE INDEX idx_thread_events_town ON thread_events (tenant_id, town_event_id) WHERE town_event_id != ''");

  add("communities", [T("place_kind", { max: 20 }), T("town_id", { max: 40 })]);
  add("follows", [T("source", { max: 40 })]);
}, (app) => {
  // Down: drop the new collection, indexes and fields (select values stay: rows may already use them).
  try { app.delete(app.findCollectionByNameOrId("town_events")); } catch (_) {}
  const drop = (collName, names, idx) => {
    const c = app.findCollectionByNameOrId(collName);
    if (idx) c.indexes = c.indexes.filter((i) => !i.includes(idx));
    for (const n of names) { const f = c.fields.getByName(n); if (f) c.fields.removeById(f.id); }
    app.save(c);
  };
  drop("editorial_pieces", ["town_event_id", "feed_scope"], "idx_pieces_town_event");
  drop("notifications", ["town_event_id"]);
  drop("thread_events", ["town_event_id"], "idx_thread_events_town");
  drop("communities", ["place_kind", "town_id"]);
  drop("follows", ["source"]);
});
