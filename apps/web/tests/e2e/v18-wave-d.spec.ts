// v1.8+ Wave D: ISSUE-17 sandbox payments (no real money): idempotent webhooks, credit grant/reversal, safe refusals.
// ISSUE-14 Pals: explained denials, previewed/audited/restorable reward-rule changes, integrity review, role checks.
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

test("ISSUE-14 Pals: plain definitions, denials explained, a previewed + reasoned rule change applies to future rewards, is audited and can be restored; integrity review; roles enforced", async ({ page, browser }) => {
  await noConsentBanner(page);
  await signIn(page, "admin@palavva.local", BASE, "/admin/pals");
  await expect(page.getByTestId("pals-definitions")).toContainText("It is not a sign of wrongdoing");
  await expect(page.getByTestId("pals-definitions")).toContainText("Pals never convert to money or credits");
  await expect(page.getByTestId("pals-today")).toContainText("Pals daily budget issued");
  await page.getByTestId("pals-tabs").getByRole("link", { name: "Rewards & denials" }).click();
  await expect(page.getByTestId("denied-agents")).toContainText("it is not a finding against the agent");
  // Rules: edit -> preview -> reason -> apply.
  await page.getByTestId("pals-tabs").getByRole("link", { name: "Reward rules" }).click();
  const amount = page.getByTestId("amount-accepted_reply");
  const before = Number(await amount.inputValue());
  const next = before === 6 ? 7 : 6;
  await amount.fill(String(next));
  await page.getByTestId("policy-preview").click();
  await expect(page.getByTestId("policy-preview-result")).toContainText("does not change any past reward or balance");
  await page.getByTestId("policy-reason").fill("e2e: try a slightly higher reply reward");
  await page.getByTestId("policy-apply").click();
  await expect(page.getByTestId("policy-msg")).toContainText("past rewards and balances are unchanged");
  await expect(page.getByTestId("amount-accepted_reply")).toHaveValue(String(next));
  const first = page.getByTestId("policy-changes").locator("li").first();
  await expect(first).toContainText(`Accepted reply: Pals ${before} → ${next}`);
  await expect(first).toContainText("e2e: try a slightly higher reply reward");
  // Restore the previous value (prompt asks for a reason).
  page.once("dialog", (d) => d.accept("e2e: restore the reviewed launch value"));
  await first.getByRole("button", { name: "Restore previous value" }).click();
  await expect(page.getByTestId("policy-msg")).toContainText("Previous value restored");
  await expect(page.getByTestId("amount-accepted_reply")).toHaveValue(String(before));
  await expect(page.getByTestId("policy-changes").locator("li").first()).toContainText(`(restored after change #`);
  // A large change needs an explicit confirmation.
  await page.getByTestId("budget-input").fill("90000");
  await page.getByTestId("policy-preview").click();
  await page.getByTestId("policy-reason").fill("e2e: large budget change must be confirmed");
  await page.getByTestId("policy-apply").click();
  await expect(page.getByTestId("policy-msg")).toContainText("large change needs explicit confirmation");
  await expect(page.getByTestId("policy-confirm-large")).toBeVisible();
  await page.getByRole("button", { name: "Discard edits" }).click();
  // Integrity: every check is listed; a review is recorded.
  await page.getByTestId("pals-tabs").getByRole("link", { name: "Integrity" }).click();
  await expect(page.getByTestId("integrity-note")).toContainText("not proof of wrongdoing");
  const dbl = page.locator('[data-signal="double_issuance"]');
  await expect(dbl).toContainText("Each reward can be paid once");
  await expect(dbl).toHaveAttribute("data-severity", "ok");
  await expect(page.locator('[data-signal="transfers"]')).toContainText("Agents cannot send Pals to each other");
  await page.getByTestId("review-double_issuance").click();
  await dbl.getByRole("radio", { name: "Looked at: fine" }).check();
  await dbl.getByRole("textbox").fill("e2e: idempotency check reviewed, zero duplicates");
  await dbl.getByRole("button", { name: "Save review" }).click();
  await expect(dbl).toContainText("Looked at: fine");
  // Roles: a moderator can preview and review but not change rules; a reader gets nothing.
  const mctx = await browser.newContext();
  const mod = await mctx.newPage();
  await signIn(mod, "moderator@palavva.local", BASE, "/admin/pals?tab=rules");
  await expect(mod.getByTestId("policy-editor")).toContainText("Only tenant admins can change reward rules");
  await expect(mod.getByTestId("amount-accepted_reply")).toBeDisabled();
  // The role check comes before anything else, so the moderator is refused even with a well-formed request.
  const r = await mod.request.post(`${BASE}/api/admin/pals-policy`, { data: { action: "apply", budget: 21000, reason: "moderator must not be able to do this", expected_revision: 0 }, headers: { origin: BASE } });
  expect(r.status()).toBe(403);
  await mctx.close();
  const rctx = await browser.newContext();
  const reader = await rctx.newPage();
  await signIn(reader, "reader@palavva.local", BASE, "/credits");
  expect((await reader.request.post(`${BASE}/api/admin/pals-policy`, { data: { action: "preview", budget: 21000 } })).status()).toBe(403);
  await rctx.close();
});
