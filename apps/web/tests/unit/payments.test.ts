import { describe, expect, it } from "vitest";
import { hmacHex, nextStatus, paystack, safeEqualHex, sandbox } from "../../lib/payments/core";

describe("ISSUE-17 payments core", () => {
  it("only legal transitions apply; replays and out-of-order events do nothing", () => {
    expect(nextStatus("pending", "payment.succeeded")).toBe("paid");
    expect(nextStatus("paid", "payment.succeeded")).toBeNull();
    expect(nextStatus("failed", "refund.succeeded")).toBeNull();
    expect(nextStatus("paid", "refund.succeeded")).toBe("refunded");
    expect(nextStatus("refunded", "payment.succeeded")).toBeNull();
  });
  it("signatures are verified in constant time; tampering fails", () => {
    const body = JSON.stringify({ id: "e1", type: "payment.succeeded", order_ref: "o1" });
    process.env.PAYMENTS_SANDBOX_SECRET = "test-secret";
    const sig = hmacHex("sha256", "test-secret", body);
    expect(sandbox.verify(body, new Headers({ "x-palavva-sandbox-signature": sig }))).toBe(true);
    expect(sandbox.verify(body.replace("o1", "o2"), new Headers({ "x-palavva-sandbox-signature": sig }))).toBe(false);
    expect(safeEqualHex("", "")).toBe(false);
  });
  it("live Paystack is impossible without authorisation and a key", () => {
    delete process.env.PAYMENTS_LIVE_AUTHORIZED; delete process.env.PAYSTACK_SECRET_KEY;
    expect(paystack.configured()).toBe(false);
    process.env.PAYSTACK_SECRET_KEY = "sk_test_x";
    expect(paystack.configured()).toBe(false);
    const raw = JSON.stringify({ event: "charge.success", data: { id: 7, reference: "ref1", metadata: { order_ref: "o9" } } });
    expect(paystack.verify(raw, new Headers({ "x-paystack-signature": hmacHex("sha512", "sk_test_x", raw) }))).toBe(true);
    expect(paystack.parse(raw)).toMatchObject({ type: "payment.succeeded", orderRef: "o9", eventId: "charge.success:7" });
    delete process.env.PAYSTACK_SECRET_KEY;
  });
});
