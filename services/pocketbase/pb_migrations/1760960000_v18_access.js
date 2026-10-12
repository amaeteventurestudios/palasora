/// <reference path="../pb_data/types.d.ts" />
// v1.8+ ISSUE-23 Users & Access. Additive and reversible; new collections are superuser-only (read and written server-side).
//   memberships  + access_role (template key, e.g. "finance_manager"; empty = derived from the legacy role), expires_at, status_reason
//   sessions     + mfa_at (when this session passed the second sign-in step), ip_class (coarse, for the sessions list)
//   users        + last_login_at, failed_logins, locked_until (sign-in lockout)
//   access_roles one row per (tenant, role) only when someone changed that role's checkboxes: the override, its revision and reason
//   staff_mfa    one row per staff user: encrypted TOTP secret, hashed recovery codes, last accepted time step (no replay),
//                hashes + expiry of browsers trusted for 12 hours after a passed second step
//   invitations  staff/user invitations: hashed single-use token, role offered, expiry, who invited, outcome
const T = (name, o = {}) => ({ name, type: "text", ...o });
const N = (name) => ({ name, type: "number" });
const D = (name) => ({ name, type: "date" });
const J = (name) => ({ name, type: "json", maxSize: 200000 });
const S = (name, values) => ({ name, type: "select", values, maxSelect: 1 });
const STAMPS = [{ name: "created", type: "autodate", onCreate: true, onUpdate: false }, { name: "updated", type: "autodate", onCreate: true, onUpdate: true }];
const TENANT = T("tenant_id", { required: true, max: 40 });
const locked = (name, fields, indexes) => new Collection({ type: "base", name, listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null, fields: [...fields, ...STAMPS], indexes });
const ADD = {
  memberships: [T("access_role", { max: 40 }), D("expires_at"), T("status_reason", { max: 300 })],
  sessions: [D("mfa_at"), T("ip_class", { max: 40 })],
  users: [D("last_login_at"), N("failed_logins"), D("locked_until")],
};
const NEW = [
  ["access_roles", [TENANT, T("role_key", { required: true, max: 40 }), J("permissions"), N("revision"), T("reason", { max: 500 }), T("updated_by", { max: 40 })],
    ["CREATE UNIQUE INDEX idx_access_roles_key ON access_roles (tenant_id, role_key)"]],
  ["staff_mfa", [TENANT, T("user_id", { required: true, max: 40 }), T("secret_enc", { max: 400 }), D("enabled_at"), J("recovery_hashes"), N("last_step"), J("trusted")],
    ["CREATE UNIQUE INDEX idx_staff_mfa_user ON staff_mfa (tenant_id, user_id)"]],
  ["invitations", [TENANT, T("email", { required: true, max: 200 }), T("access_role", { required: true, max: 40 }), T("token_hash", { required: true, max: 64 }), D("expires_at"),
    T("invited_by", { max: 40 }), S("status", ["pending", "accepted", "revoked", "expired"]), T("accepted_user_id", { max: 40 }), T("note", { max: 500 })],
    ["CREATE UNIQUE INDEX idx_invitations_token ON invitations (token_hash)", "CREATE INDEX idx_invitations_email ON invitations (tenant_id, email, status)"]],
];
migrate((app) => {
  for (const [coll, fields] of Object.entries(ADD)) {
    const c = app.findCollectionByNameOrId(coll);
    for (const f of fields) if (!c.fields.getByName(f.name)) c.fields.add(new Field(f));
    app.save(c);
  }
  for (const [name, fields, idx] of NEW) { try { app.findCollectionByNameOrId(name); } catch (_) { app.save(locked(name, fields, idx)); } }
}, (app) => {
  for (const [name] of [...NEW].reverse()) { try { app.delete(app.findCollectionByNameOrId(name)); } catch (_) {} }
  for (const [coll, fields] of Object.entries(ADD)) {
    const c = app.findCollectionByNameOrId(coll);
    for (const f of fields) { const x = c.fields.getByName(f.name); if (x) c.fields.removeById(x.id); }
    app.save(c);
  }
});
