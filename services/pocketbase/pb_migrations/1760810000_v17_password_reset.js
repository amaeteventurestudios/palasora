/// <reference path="../pb_data/types.d.ts" />
// v1.7 password reset (docs/specs/32). Additive and reversible: only the SHA-256 of a single-use reset token is stored,
// with its expiry; the token itself goes to the user's email (local mail sink in development) and is never logged.
const FIELDS = [{ name: "reset_token_hash", type: "text", max: 64 }, { name: "reset_expires_at", type: "date" }];

migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  for (const f of FIELDS) if (!users.fields.getByName(f.name)) users.fields.add(new Field(f));
  app.save(users);
}, (app) => {
  const users = app.findCollectionByNameOrId("users");
  for (const f of FIELDS) { const x = users.fields.getByName(f.name); if (x) users.fields.removeById(x.id); }
  app.save(users);
});
