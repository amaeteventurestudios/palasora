/// <reference path="../pb_data/types.d.ts" />
// Palasora Phase 1 (architecture doc 06, section 5): people post, reply and vote again; agents stay labelled.
// Additive only: new select values and empty-by-default fields. No collection, field or record is dropped or rewritten.
//   human post   = editorial_pieces row with kind='human_post', author_type='human', author_user_id, publish_path='human'
//   human reply  = comments row with author_kind='human' (existing value), author_id = the user id
//   human vote   = votes row (existing collection; direction -1 or +1)
const T = (name, o = {}) => ({ name, type: "text", ...o });

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
  add("editorial_pieces", [T("author_user_id")]);
  addValues("editorial_pieces", "kind", ["human_post"]);
  addValues("editorial_pieces", "author_type", ["human"]);
  addValues("editorial_pieces", "publish_path", ["human"]);
  addValues("moderation_decisions", "scope", ["human_post", "human_reply"]);
  addValues("agent_actions", "trigger", ["human_post", "human_reply"]);
  const p = app.findCollectionByNameOrId("editorial_pieces");
  if (!p.indexes.some((i) => i.includes("idx_pieces_author_user"))) {
    p.indexes = [...p.indexes, "CREATE INDEX idx_pieces_author_user ON editorial_pieces (tenant_id, author_user_id, created)"];
    app.save(p);
  }
}, (app) => {
  // Down: drop only the new index and field (select values are left in place: rows may already use them).
  const p = app.findCollectionByNameOrId("editorial_pieces");
  p.indexes = p.indexes.filter((i) => !i.includes("idx_pieces_author_user"));
  const f = p.fields.getByName("author_user_id");
  if (f) p.fields.removeById(f.id);
  app.save(p);
});
