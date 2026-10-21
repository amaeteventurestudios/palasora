// ISSUE-17 real-money payments, provider-neutral. Pure parts (prices, state transitions, signatures) are unit-tested.
// Sora is never sold or bought here. LIVE payments are impossible unless PAYMENTS_LIVE_AUTHORIZED=true AND a provider is
// configured; until then only the local SANDBOX provider works, and everything it creates is labelled sandbox.
import { createHmac, timingSafeEqual } from "node:crypto";

export type Product = "ai_credits" | "ad_package" | "subpal_sponsorship" | "pro" | "invoice";
export type OrderStatus = "created" | "pending" | "paid" | "failed" | "refunded" | "cancelled";
export type EventType = "payment.succeeded" | "payment.failed" | "refund.succeeded";

export { CREDIT_PACKS } from "./packs";

/** Allowed transitions. Anything else is ignored (and recorded), so replays and out-of-order events cannot corrupt state. */
export function nextStatus(cur: OrderStatus, ev: EventType): OrderStatus | null {
  if (ev === "payment.succeeded") return cur === "created" || cur === "pending" ? "paid" : null;
  if (ev === "payment.failed") return cur === "created" || cur === "pending" ? "failed" : null;
  if (ev === "refund.succeeded") return cur === "paid" ? "refunded" : null;
  return null;
}

export const hmacHex = (algo: "sha256" | "sha512", secret: string, body: string) => createHmac(algo, secret).update(body, "utf8").digest("hex");
export function safeEqualHex(a: string, b: string): boolean {
  const x = Buffer.from(a || "", "hex"), y = Buffer.from(b || "", "hex");
  return x.length > 0 && x.length === y.length && timingSafeEqual(x, y);
}

export type ProviderEvent = { eventId: string; type: EventType; providerRef: string; orderRef: string };
export interface Provider {
  id: string; live: boolean;
  configured(): boolean;
  verify(rawBody: string, headers: Headers): boolean;
  parse(rawBody: string): ProviderEvent | null;
}

export function sandboxSecret(): string {
  if (process.env.PAYMENTS_SANDBOX_SECRET) return process.env.PAYMENTS_SANDBOX_SECRET;
  // Development/test only: a stable secret derived from the local service token (never used for live money).
  return hmacHex("sha256", "palavva-sandbox", process.env.EDITORIAL_SERVICE_TOKEN || "local-dev");
}

export const sandbox: Provider = {
  id: "sandbox", live: false, configured: () => true,
  verify: (raw, h) => safeEqualHex(h.get("x-palavva-sandbox-signature") ?? "", hmacHex("sha256", sandboxSecret(), raw)),
  parse: (raw) => { try { const j = JSON.parse(raw); return j && j.id && j.type && j.order_ref ? { eventId: String(j.id), type: j.type, providerRef: String(j.ref ?? ""), orderRef: String(j.order_ref) } : null; } catch { return null; } },
};

/** Paystack: HMAC-SHA512 of the raw body with the secret key in `x-paystack-signature` (Paystack's documented scheme).
 *  Disabled unless live payments are authorised and a secret key is configured. */
export const paystack: Provider = {
  id: "paystack", live: true, configured: () => process.env.PAYMENTS_LIVE_AUTHORIZED === "true" && !!process.env.PAYSTACK_SECRET_KEY,
  verify: (raw, h) => !!process.env.PAYSTACK_SECRET_KEY && safeEqualHex(h.get("x-paystack-signature") ?? "", hmacHex("sha512", process.env.PAYSTACK_SECRET_KEY, raw)),
  parse: (raw) => {
    try {
      const j = JSON.parse(raw); const d = j?.data ?? {};
      const type: EventType | null = j?.event === "charge.success" ? "payment.succeeded" : j?.event === "charge.failed" ? "payment.failed" : j?.event === "refund.processed" ? "refund.succeeded" : null;
      return type && d.reference ? { eventId: `${j.event}:${d.id ?? d.reference}`, type, providerRef: String(d.reference), orderRef: String(d.metadata?.order_ref ?? d.reference) } : null;
    } catch { return null; }
  },
};

export const PROVIDERS: Record<string, Provider> = { sandbox, paystack };
export const liveAuthorized = () => process.env.PAYMENTS_LIVE_AUTHORIZED === "true";
