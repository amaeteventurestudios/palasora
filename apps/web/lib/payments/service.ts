// ISSUE-17 payment service: create orders, apply verified webhook events exactly once, grant/revoke AI credits.
import { createHash, randomUUID } from "node:crypto";
import { pb, q, type Rec } from "../pb";
import type { Tenant } from "../tenant";
import { audit } from "../audit";
import { PROVIDERS, hmacHex, nextStatus, sandboxSecret, type OrderStatus } from "./core";
import { CREDIT_PACKS } from "./packs";

export class PaymentError extends Error { constructor(public code: string, message: string) { super(message); } }

export async function createCreditOrder(t: Tenant, userId: string, currency: string, packIndex: number, providerId: string, idem: string) {
  const pack = CREDIT_PACKS[currency]?.[packIndex];
  if (!pack) throw new PaymentError("INVALID", "Unknown credit pack");
  const provider = PROVIDERS[providerId];
  if (!provider || !provider.configured()) throw new PaymentError("UNAVAILABLE", provider?.live ? "Live payments are not enabled: no authorised, configured provider." : "Unknown provider");
  const key = `${userId}:${idem}`.slice(0, 120);
  const existing = await pb.first("payment_orders", `tenant_id=${q(t.id)} && idempotency_key=${q(key)}`);
  if (existing) return existing; // a retried checkout returns the same order
  const order = await pb.create("payment_orders", { tenant_id: t.id, user_id: userId, product: "ai_credits", amount_minor: pack.amount_minor, currency, credits: pack.credits,
    provider: provider.id, provider_ref: `${provider.id}_${randomUUID().replace(/-/g, "").slice(0, 16)}`, sandbox: !provider.live, status: "pending", idempotency_key: key, failure_reason: "" });
  await audit(t.id, userId, "payment.order_created", "payment_orders", order.id, { product: "ai_credits", currency, amount_minor: pack.amount_minor, sandbox: !provider.live });
  return order;
}

/** Verify, de-duplicate and apply one provider webhook. Returns a short outcome string (never throws for duplicates). */
export async function handleWebhook(providerId: string, raw: string, headers: Headers): Promise<{ status: number; outcome: string }> {
  const provider = PROVIDERS[providerId];
  if (!provider) return { status: 404, outcome: "unknown provider" };
  if (provider.live && !provider.configured()) return { status: 503, outcome: "live payments not enabled" };
  if (!provider.verify(raw, headers)) return { status: 401, outcome: "bad signature" };
  const ev = provider.parse(raw);
  if (!ev) return { status: 400, outcome: "unrecognised event" };
  const order = await pb.first("payment_orders", `provider_ref=${q(ev.orderRef)} || id=${q(ev.orderRef)}`);
  const hash = createHash("sha256").update(raw).digest("hex");
  try {
    await pb.create("payment_events", { tenant_id: order?.tenant_id ?? "unknown", provider: provider.id, event_id: ev.eventId, event_type: ev.type, order_id: order?.id ?? "", payload_hash: hash, sandbox: !provider.live, outcome: "received" });
  } catch { return { status: 200, outcome: "duplicate event ignored" }; } // unique (provider, event_id): replays are no-ops
  if (!order) return { status: 200, outcome: "no matching order (recorded)" };
  const to = nextStatus(order.status as OrderStatus, ev.type);
  if (!to) return { status: 200, outcome: `ignored: ${ev.type} on a ${order.status} order` };
  await pb.update("payment_orders", order.id, { status: to, failure_reason: to === "failed" ? "provider reported failure" : "" });
  if (to === "paid") await grant(order, "purchase", Number(order.credits));
  if (to === "refunded") await grant(order, "refund_reversal", -Number(order.credits));
  await audit(order.tenant_id, "system:payments", `payment.${to}`, "payment_orders", order.id, { provider: provider.id, sandbox: !!order.sandbox }, 0, "system");
  return { status: 200, outcome: `order ${to}` };
}

async function grant(order: Rec, reason: "purchase" | "refund_reversal", delta: number) {
  try { await pb.create("credit_ledger", { tenant_id: order.tenant_id, user_id: order.user_id, delta, reason, order_id: order.id, sandbox: !!order.sandbox, note: reason === "purchase" ? "credit pack" : "refund" }); }
  catch { /* unique (order_id, reason): already applied */ }
}

export async function creditBalance(t: Tenant, userId: string): Promise<{ balance: number; sandbox: number; rows: Rec[] }> {
  const rows = await pb.list("credit_ledger", { filter: `tenant_id=${q(t.id)} && user_id=${q(userId)}`, sort: "-created", perPage: 200 });
  return { balance: rows.filter((r) => !r.sandbox).reduce((a, r) => a + Number(r.delta), 0), sandbox: rows.filter((r) => r.sandbox).reduce((a, r) => a + Number(r.delta), 0), rows };
}

/** Build a signed sandbox webhook exactly as an external provider would send it (used by the sandbox checkout page). */
export function signedSandboxEvent(orderRef: string, type: "payment.succeeded" | "payment.failed" | "refund.succeeded", id = randomUUID()) {
  const body = JSON.stringify({ id, type, order_ref: orderRef, ref: orderRef });
  return { body, signature: hmacHex("sha256", sandboxSecret(), body) };
}
