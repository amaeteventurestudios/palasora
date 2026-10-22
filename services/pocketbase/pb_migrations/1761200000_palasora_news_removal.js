/// <reference path="../pb_data/types.d.ts" />
// Palasora Phase 5 (architecture doc 06, section 17.1, news stages 3 to 5): news is removed for good.
// Reversible: everything removed is first copied into the new `news_archive` collection, and the down migration puts it
// back exactly (collections from their stored definitions, rows column by column).
//   whole collections  sources, source_items, archive_sources, story_clusters, cluster_sources, evidence_claims,
//                      time_lens_entries, story_geo_evidence, discovery_runs (definition + every row), then dropped
//   news pieces        editorial_pieces of kind source_link, short, discussion, story or spotlight, and agent posts with
//                      post_label sourced_news; plus the rows that hang off them (discussions, replies, votes, saves,
//                      reviews, revisions, corrections, thread events, moderation, translations, trending, memory)
//   news switches      tenant_settings INGEST_PAUSED, LINK_POLICY_V2, SOURCE_CARDS_PAUSED, LINK_SIGNALS_PAUSED
// Kept on purpose: editorial_reviews, piece_revisions and corrections (staff retractions and corrections of any post use
// them), ai_runs (the model-spend audit trail) and the old select values (harmless; the down migration needs them).
// Rows are copied and deleted with SQL so record hooks (the publish gate, append-only guards) neither block the cleanup
// nor fire on restore.
const DROP = ["sources", "source_items", "archive_sources", "story_clusters", "cluster_sources", "evidence_claims",
  "time_lens_entries", "story_geo_evidence", "discovery_runs"];
const NEWS_KINDS = ["source_link", "short", "discussion", "story", "spotlight"];
const BY_PIECE = ["discussions", "comments", "saves", "piece_revisions", "editorial_reviews", "correction_requests", "corrections",
  "thread_events", "moderation_decisions", "localizations", "translation_reports", "trending_snapshots", "engagement_daily",
  "agent_thread_memory", "agent_events"];
const BY_TARGET = ["votes", "agent_votes", "agent_actions", "moderation_reports", "moderation_decisions", "localizations"];
const SWITCHES = ["INGEST_PAUSED", "LINK_POLICY_V2", "SOURCE_CARDS_PAUSED", "LINK_SIGNALS_PAUSED"];

migrate((app) => {
  app.save(new Collection({
    type: "base", name: "news_archive", listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
    fields: [
      { name: "kind", type: "select", values: ["collection", "record"], maxSelect: 1, required: true },
      { name: "source_collection", type: "text", max: 80, required: true },
      { name: "record_id", type: "text", max: 40 },
      { name: "tenant_id", type: "text", max: 40 },
      { name: "seq", type: "number" },
      { name: "data", type: "json", maxSize: 10000000 },
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
    indexes: ["CREATE INDEX idx_news_archive_src ON news_archive (source_collection, seq)"],
  }));

  const exists = (t) => { try { app.findCollectionByNameOrId(t); return true; } catch (_) { return false; } };
  const columns = (t) => {
    const rows = arrayOf(new DynamicModel({ name: "" }));
    app.db().newQuery("SELECT name FROM pragma_table_info({:t})").bind({ t }).all(rows);
    return rows.map((r) => r.name);
  };
  const NOW = "strftime('%Y-%m-%d %H:%M:%fZ','now')";
  const NEWID = "substr(lower(hex(randomblob(8))),1,15)";
  let seq = 0;
  // Copy the matching rows of one table, column by column (json_object in chunks: SQLite caps function arguments).
  const archive = (t, where) => {
    if (!exists(t)) return 0;
    const cols = columns(t);
    const chunks = [];
    for (let i = 0; i < cols.length; i += 40) chunks.push("json_object(" + cols.slice(i, i + 40).map((c) => `'${c}', [${c}]`).join(", ") + ")");
    const tenant = cols.includes("tenant_id") ? "[tenant_id]" : "''";
    const before = seq;
    const n = new DynamicModel({ n: 0 });
    app.db().newQuery(`SELECT count(*) AS n FROM [${t}] WHERE ${where}`).one(n);
    if (!n.n) return 0;
    app.db().newQuery(`INSERT INTO news_archive (id, kind, source_collection, record_id, tenant_id, seq, data, created, updated)
      SELECT ${NEWID}, 'record', {:t}, [id], ${tenant}, {:base} + row_number() OVER (ORDER BY rowid), json_array(${chunks.join(", ")}), ${NOW}, ${NOW}
      FROM [${t}] WHERE ${where}`).bind({ t, base: before }).execute();
    seq += n.n;
    app.db().newQuery(`DELETE FROM [${t}] WHERE ${where}`).execute();
    return n.n;
  };

  // 1. The ids of news pieces and their replies, fixed before anything is deleted.
  app.db().newQuery("DROP TABLE IF EXISTS temp.news_ids").execute();
  app.db().newQuery(`CREATE TEMP TABLE news_ids AS SELECT id FROM editorial_pieces
    WHERE kind IN (${NEWS_KINDS.map((k) => `'${k}'`).join(", ")}) OR post_label = 'sourced_news'`).execute();
  app.db().newQuery("DROP TABLE IF EXISTS temp.news_reply_ids").execute();
  app.db().newQuery("CREATE TEMP TABLE news_reply_ids AS SELECT id FROM comments WHERE piece_id IN (SELECT id FROM temp.news_ids)").execute();

  // 2. Rows that hang off news pieces and replies, then the pieces themselves.
  for (const t of BY_TARGET) archive(t, "target_id IN (SELECT id FROM temp.news_ids) OR target_id IN (SELECT id FROM temp.news_reply_ids)");
  for (const t of BY_PIECE) archive(t, "piece_id IN (SELECT id FROM temp.news_ids)");
  archive("editorial_pieces", "id IN (SELECT id FROM temp.news_ids)");
  archive("tenant_settings", `key IN (${SWITCHES.map((k) => `'${k}'`).join(", ")})`);
  app.db().newQuery("DROP TABLE temp.news_ids").execute();
  app.db().newQuery("DROP TABLE temp.news_reply_ids").execute();

  // 3. Whole news collections: definition, rows, then the collection.
  for (const name of DROP) {
    if (!exists(name)) continue;
    const c = app.findCollectionByNameOrId(name);
    app.db().newQuery(`INSERT INTO news_archive (id, kind, source_collection, record_id, tenant_id, seq, data, created, updated)
      VALUES (${NEWID}, 'collection', {:t}, {:id}, '', {:s}, {:d}, ${NOW}, ${NOW})`).bind({ t: name, id: c.id, s: ++seq, d: JSON.stringify(c) }).execute();
    archive(name, "1=1");
    app.delete(c);
  }
}, (app) => {
  // Down: recreate the dropped collections, put every archived row back, then remove the archive.
  let arch = null;
  try { arch = app.findCollectionByNameOrId("news_archive"); } catch (_) { return; }
  const defs = arrayOf(new DynamicModel({ source_collection: "", data: "" }));
  app.db().newQuery("SELECT source_collection, data FROM news_archive WHERE kind = 'collection' ORDER BY seq").all(defs);
  for (const d of defs) {
    try { app.findCollectionByNameOrId(d.source_collection); continue; } catch (_) { /* missing: recreate */ }
    app.save(new Collection(JSON.parse(d.data)));
  }
  const rows = arrayOf(new DynamicModel({ source_collection: "", data: "" }));
  app.db().newQuery("SELECT source_collection, data FROM news_archive WHERE kind = 'record' ORDER BY seq").all(rows);
  for (const r of rows) {
    const row = Object.assign({}, ...JSON.parse(r.data));
    const cols = Object.keys(row);
    const params = {};
    cols.forEach((c, i) => { params["p" + i] = row[c]; });
    app.db().newQuery(`INSERT OR IGNORE INTO [${r.source_collection}] (${cols.map((c) => `[${c}]`).join(", ")})
      VALUES (${cols.map((_, i) => `{:p${i}}`).join(", ")})`).bind(params).execute();
  }
  app.delete(arch);
});
