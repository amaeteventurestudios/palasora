// v1.8+ Wave D: ISSUE-17 sandbox payments (no real money): idempotent webhooks, credit grant/reversal, safe refusals.
import { expect, test } from "@playwright/test";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { BASE, noConsentBanner, pbAdmin, signIn } from "./helpers";

const envText = readFileSync(path.resolve(__dirname, "../../../../.env.test"), "utf8");
const val = (k: string) => new RegExp(`^${k}=(.*)$`, "m").exec(envText)?.[1].trim() ?? "";
const secret = () => val("PAYMENTS_SANDBOX_SECRET") || createHmac("sha256", "palavva-sandbox").update(val("EDITORIAL_SERVICE_TOKEN") || "local-dev").digest("hex");
const signed = (body: string) => ({ "content-type": "application/json", "x-palavva-sandbox-signature": createHmac("sha256", secret()).update(body).digest("hex") });

test("ISSUE-17 sandbox purchase grants credits once; replay is ignored; refund reverses; tampering, live provider and anonymous checkout are refused", async ({ page, request }) => {
  await noConsentBanner(page);
  expect((await request.post(`${BASE}/api/v1/payments/checkout`, { data: { currency: "NGN", pack: 0 } })).status()).toBe(401);
  await signIn(page, "reader@palavva.local", BASE, "/credits");
  await expect(page.getByTestId("prepaid-credits")).toContainText("Live payments are not enabled");
  const before = Number(await page.getByTestId("sandbox-balance").innerText());
  await page.getByTestId("buy-credits-go").click();
  await expect(page).toHaveURL(/\/payments\/sandbox\//);
  await expect(page.getByTestId("sandbox-checkout")).toContainText("no real money");
  const orderId = page.url().split("/").pop()!;
  await page.getByRole("button", { name: "Simulate successful payment" }).click();
  await expect(page.getByTestId("order-outcome")).toContainText("Sandbox: order paid");
  const pb = await pbAdmin();
  const order = (await pb.list("payment_orders", `id='${orderId}'`))[0];
  expect(order.status).toBe("paid");
  expect(order.sandbox).toBe(true);
  // Replay: the same provider event id twice -> applied once.
  const body = JSON.stringify({ id: `replay-${orderId}`, type: "payment.succeeded", order_ref: order.provider_ref });
  const r1 = await request.post(`${BASE}/api/v1/payments/webhook/sandbox`, { data: body, headers: signed(body) });
  const r2 = await request.post(`${BASE}/api/v1/payments/webhook/sandbox`, { data: body, headers: signed(body) });
  expect((await r1.json()).outcome).toMatch(/ignored/); // already paid: illegal transition, recorded and ignored
  expect((await r2.json()).outcome).toBe("duplicate event ignored");
  const grants = await pb.list("credit_ledger", `order_id='${orderId}' && reason='purchase'`);
  expect(grants).toHaveLength(1);
  await page.goto(`${BASE}/credits`);
  await expect(page.getByTestId("sandbox-balance")).toHaveText(String(before + 100));
  await expect(page.getByTestId("credit-balance")).toHaveText("0"); // real-money balance untouched
  // Refund reverses exactly once.
  await page.goto(`${BASE}/payments/sandbox/${orderId}`);
  await page.getByRole("button", { name: "Simulate refund" }).click();
  await expect(page.getByTestId("order-outcome")).toContainText("Sandbox: order refunded");
  expect(await pb.list("credit_ledger", `order_id='${orderId}' && reason='refund_reversal'`)).toHaveLength(1);
  // Tampered body, live provider without authorisation, unknown provider.
  expect((await request.post(`${BASE}/api/v1/payments/webhook/sandbox`, { data: body.replace("succeeded", "failed"), headers: signed(body) })).status()).toBe(401);
  expect((await request.post(`${BASE}/api/v1/payments/webhook/paystack`, { data: "{}", headers: { "content-type": "application/json" } })).status()).toBe(503);
  expect((await request.post(`${BASE}/api/v1/payments/webhook/nope`, { data: "{}" })).status()).toBe(404);
});
