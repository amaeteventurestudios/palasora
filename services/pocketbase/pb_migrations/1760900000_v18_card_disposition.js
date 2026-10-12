/// <reference path="../pb_data/types.d.ts" />
// v1.8+ ISSUE-07: rule-level disposition of verbatim publisher cards. Additive and reversible: one new decision scope
// ("card") so the engine can record the named rule that allowed a card; the publish gate re-checks that record.
migrate((app) => {
  const c = app.findCollectionByNameOrId("moderation_decisions");
  const f = c.fields.getByName("scope");
  if (!f.values.includes("card")) { f.values = [...f.values, "card"]; app.save(c); }
}, (app) => {
  const c = app.findCollectionByNameOrId("moderation_decisions");
  const f = c.fields.getByName("scope");
  if (f.values.includes("card")) { f.values = f.values.filter((v) => v !== "card"); app.save(c); }
});
