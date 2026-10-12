/// <reference path="../pb_data/types.d.ts" />
// v1.8+ ISSUE-17 real-money payments (sandbox first). Additive and reversible; superuser-only collections read and written
// server-side. Real money never touches Pals. Idempotency is enforced by unique indexes, not by application code alone:
//   payment_orders   one row per checkout (product, amount in minor units, currency, provider, status, sandbox flag)
//   payment_events   one row per provider webhook event id (a replayed event cannot be applied twice)
//   credit_ledger    AI-credit entries; one grant and at most one reversal per order (unique order_id + reason)
const T = (name, o = {}) => ({ name, type: "text", ...o });
const N = (name) => ({ name, type: "number" });
const J = (name) => ({ name, type: "json", maxSize: 200000 });
const B = (name) => ({ name, type: "bool" });
const S = (name, values) => ({ name, type: "select", values, maxSelect: 1 });
const STAMPS = [{ name: "created", type: "autodate", onCreate: true, onUpdate: false }, { name: "updated", type: "autodate", onCreate: true, onUpdate: true }];
const TENANT = T("tenant_id", { required: true, max: 40 });
const locked = (name, fields, indexes) => new Collection({ type: "base", name, listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null, fields: [...fields, ...STAMPS], indexes });
const NEW = [
  ["payment_orders", [TENANT, T("user_id", { required: true, max: 40 }), S("product", ["ai_credits", "ad_package", "subpal_sponsorship", "pro", "invoice"]),
    N("amount_minor"), T("currency", { max: 3 }), N("credits"), T("provider", { max: 30 }), T("provider_ref", { max: 120 }), B("sandbox"),
    S("status", ["created", "pending", "paid", "failed", "refunded", "cancelled"]), T("idempotency_key", { required: true, max: 120 }), T("failure_reason", { max: 300 })],
    ["CREATE UNIQUE INDEX idx_payment_orders_idem ON payment_orders (tenant_id, idempotency_key)", "CREATE INDEX idx_payment_orders_user ON payment_orders (tenant_id, user_id, created)"]],
  ["payment_events", [TENANT, T("provider", { required: true, max: 30 }), T("event_id", { required: true, max: 120 }), T("event_type", { max: 60 }), T("order_id", { max: 40 }),
    T("payload_hash", { max: 64 }), B("sandbox"), T("outcome", { max: 200 })],
    ["CREATE UNIQUE INDEX idx_payment_events_once ON payment_events (provider, event_id)"]],
  ["credit_ledger", [TENANT, T("user_id", { required: true, max: 40 }), N("delta"), S("reason", ["purchase", "refund_reversal", "usage", "adjustment"]), T("order_id", { max: 40 }),
    B("sandbox"), T("note", { max: 300 })],
    ["CREATE UNIQUE INDEX idx_credit_ledger_order ON credit_ledger (order_id, reason) WHERE order_id != ''", "CREATE INDEX idx_credit_ledger_user ON credit_ledger (tenant_id, user_id, created)"]],
];
migrate((app) => {
  for (const [name, fields, idx] of NEW) { try { app.findCollectionByNameOrId(name); } catch (_) { app.save(locked(name, fields, idx)); } }
}, (app) => {
  for (const [name] of [...NEW].reverse()) { try { app.delete(app.findCollectionByNameOrId(name)); } catch (_) {} }
});
