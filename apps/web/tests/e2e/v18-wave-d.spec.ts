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

test("ISSUE-14 Pals: plain definitions, denials explained, a previewed + reasoned rule change applies to future rewards, is audited and can be restored; integrity review; roles enforced", async ({ page, browser, request }) => {
  // Today must have reward events so the "by reward" table renders (it is empty on a fresh stack).
  const [ag] = await (await pbAdmin()).list("agents", "kind='palavva_ai' && status='active'");
  await request.post("http://127.0.0.1:8400/economy/rewards", { headers: { "x-service-token": val("EDITORIAL_SERVICE_TOKEN"), "content-type": "application/json" },
    data: { agent_id: ag.id, rule: "accepted_reply", ref_type: "comment", ref_id: `e2e-14-${Date.now()}`, owner_key: `seed:${ag.id}` } });
  await noConsentBanner(page);
  await signIn(page, "admin@palavva.local", BASE, "/admin/pals");
  await expect(page.getByTestId("pals-definitions")).toContainText("It is not a sign of wrongdoing");
  await expect(page.getByTestId("pals-definitions")).toContainText("Pals never convert to money or credits");
  await expect(page.getByTestId("pals-today")).toContainText("Pals daily budget issued");
  await page.getByTestId("pals-tabs").getByRole("link", { name: "Rewards & denials" }).click();
  await expect(page.getByTestId("denied-agents")).toContainText("it is not a finding against the agent");
  await expect(page.getByTestId("rewards-by-rule")).toContainText("Accepted reply");
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

test("ISSUE-15 Exchange: all 54 markets and a full listings directory, IPO-only prices explained, one trade's trail with settlement, halt with a pending order, market halt with a reason", async ({ page, request }) => {
  test.setTimeout(120_000);
  const ED = "http://127.0.0.1:8400/economy";
  const H = { "x-service-token": val("EDITORIAL_SERVICE_TOKEN"), "content-type": "application/json" };
  const pb = await pbAdmin();
  // Re-runnable: one company per founder, so use agents that do not already found one.
  const founders = new Set(((await (await request.get(`${ED}/companies?market=ALL`, { headers: H })).json()) as { founder_agent_id: string }[]).map((c) => c.founder_agent_id));
  const [f, b] = (await pb.list("agents", "kind='palavva_ai' && status='active'")).filter((a) => !founders.has(a.id)).slice(0, 2);
  const tag = Array.from({ length: 4 }, () => "ABCDEFGHIJKLMNOPQRSTUVWXYZ"[Math.floor(Math.random() * 26)]).join("");
  for (const a of [f, b]) for (const [rule, ref] of [["first_contribution", "welcome"], ["accepted_post", `e2e-${tag}-1`], ["accepted_post", `e2e-${tag}-2`]] as const)
    await request.post(`${ED}/rewards`, { headers: H, data: { agent_id: a.id, rule, ref_type: rule === "first_contribution" ? "mission" : "piece", ref_id: ref, owner_key: `seed:${a.id}` } });
  await request.post(`${ED}/agents/${b.id}/limits`, { headers: H, data: { enabled: true, max_order_pals: 500, daily_pals: 5000, daily_orders: 50, markets: [], updated_by: "e2e" } });
  const co = await request.post(`${ED}/companies`, { headers: H, data: { founder_agent_id: f.id, owner_key: `seed:${f.id}`, name: `Volta ${tag} Haulage`, ticker: `V${tag}`, market: "GH", sector: "logistics",
    description: "A fictional haulage co-operative used by the end-to-end test.", ipo_price: 1, fictional_ack: true } });
  expect(co.status(), await co.text()).toBe(200);
  const company = await co.json();
  const ticker = `V${tag}`;
  const buy = await request.post(`${ED}/orders`, { headers: H, data: { agent_id: b.id, owner_key: `seed:${b.id}`, company_id: company.id, side: "buy", price: 1, qty: 5, idem_key: `e2e-${tag}-buy` } });
  expect((await buy.json()).trades).toHaveLength(1);
  // Public directory: 54 markets, the listing is searchable, its page labels the trade as an IPO allocation.
  await noConsentBanner(page);
  await page.goto(`${BASE}/exchange`);
  await page.getByTestId("view-all-listings").click();
  await expect(page.getByTestId("markets-list").locator("[data-market]")).toHaveCount(54);
  await page.getByTestId("listings-directory-search").fill(ticker);
  await expect(page.getByTestId("listings-directory").locator("[data-row]")).toHaveCount(1);
  await page.getByTestId("listings-directory").getByRole("link", { name: ticker }).click();
  await expect(page.locator('[data-trade-kind="ipo"]').first()).toContainText("IPO allocation");
  await expect(page.getByTestId("ipo-only-note")).toBeVisible();
  // Admin: audit verdict, trade trail with settlement.
  await signIn(page, "admin@palavva.local", BASE, "/admin/exchange");
  await expect(page.getByTestId("price-audit")).toContainText("IPO allocations");
  await page.getByTestId("ex-tabs").getByRole("link", { name: "Trades & orders" }).click();
  await page.getByTestId("ex-trades-search").fill(ticker);
  await page.getByTestId("ex-trades").locator("[data-row]").first().click();
  await expect(page.getByTestId("trail-settled")).toContainText("Settled");
  await expect(page.getByTestId("trail-journal")).toContainText("trade shares");
  await expect(page.getByTestId("trail-buy")).toContainText("buy 5 at 1.00");
  // Halt with a pending order: the resting bid keeps its reservation; new orders are refused; resume restores trading.
  const rest = await (await request.post(`${ED}/orders`, { headers: H, data: { agent_id: b.id, owner_key: `seed:${b.id}`, company_id: company.id, side: "buy", price: 0.9, qty: 2, idem_key: `e2e-${tag}-rest` } })).json();
  expect(rest.order.status).toBe("open");
  await page.goto(`${BASE}/admin/exchange?tab=settings`);
  await expect(page.getByTestId("ex-settings").locator('[data-control="pause"]')).toContainText("an owner's own agent can still place orders");
  await page.goto(`${BASE}/admin/exchange`);
  try {
    await page.getByTestId("halt-exchange").click();
    await page.getByRole("button", { name: "Confirm" }).click();
    await expect(page.getByText("EXCHANGE_HALTED is now ON")).toBeVisible();
    const refused = await request.post(`${ED}/orders`, { headers: H, data: { agent_id: b.id, owner_key: `seed:${b.id}`, company_id: company.id, side: "buy", price: 1, qty: 1, idem_key: `e2e-${tag}-halted` } });
    expect(refused.status()).toBe(409);
    const pf = await (await request.get(`${ED}/agents/${b.id}/portfolio`, { headers: H })).json();
    expect(pf.orders.find((o: { id: number }) => o.id === rest.order.id).status).toBe("open");
  } finally {
    await request.post(`${ED}/switches`, { headers: H, data: { key: "EXCHANGE_HALTED", on: false, by: "e2e" } });
  }
  // One market halted with a reason; others unaffected; reopened.
  await page.goto(`${BASE}/admin/exchange?tab=settings`);
  await page.getByTestId("market-select").selectOption("GH");
  await page.getByLabel("Reason (shown on the Exchange)").fill("e2e: Ghana market halted for a test");
  await page.getByRole("button", { name: "Apply to this market" }).click();
  await expect(page.getByText("GH market is now halted")).toBeVisible();
  expect((await request.post(`${ED}/orders`, { headers: H, data: { agent_id: b.id, owner_key: `seed:${b.id}`, company_id: company.id, side: "buy", price: 1, qty: 1, idem_key: `e2e-${tag}-gh` } })).status()).toBe(409);
  await request.post(`${ED}/markets/GH/halt`, { headers: H, data: { halted: false, reason: "" } });
  expect((await request.post(`${ED}/reconcile`, { headers: H, data: {} }).then((r) => r.json())).ok).toBe(true);
});

test("ISSUE-19 Businesses: demo never verifiable, evidence-based verify by a tenant admin, editor can only request information, verified ranks first, paid placement never lifts an unverified business, suspend withdraws the profile", async ({ page, browser }) => {
  test.setTimeout(120_000);
  const pb = await pbAdmin();
  const tag = Math.random().toString(36).slice(2, 7);
  const tid = (await pb.list("tenants", "slug='palavva'"))[0]?.id ?? (await pb.list("businesses", "is_demo=true"))[0].tenant_id;
  const mk = (name: string) => pb.create("businesses", { tenant_id: tid, name, slug: `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, country_code: "KE", sector: "agriculture", about: "A test business created by the end-to-end suite.",
    profile_status: "published", is_demo: false, verification_state: "unverified", founder_bio: "Founded by the test suite.", products: ["Seed storage", "Training"] });
  const real = await mk(`Fixture Co-op ${tag}`);
  const payer = await mk(`Aaa Paid Fixture ${tag}`); // alphabetically and newest: would come first if payment or recency could lift it
  await pb.create("spotlights", { tenant_id: tid, business_id: payer.id, placement_type: "sponsored", disclosure_text: "Paid", approval_status: "approved" });
  await noConsentBanner(page);
  // Editor: can request information, cannot verify.
  const ectx = await browser.newContext(); const ed = await ectx.newPage();
  await signIn(ed, "editor@palavva.local", BASE, `/admin/businesses?id=${real.id}`);
  await expect(ed.getByTestId("biz-actions").locator('[data-action="verify"]')).toContainText("(not your role)");
  await ed.getByTestId("biz-actions").locator('[data-action="request_info"] summary').click();
  await ed.getByLabel("Request information note").fill("Please send your county registration number");
  await ed.getByRole("button", { name: "Request information" }).click();
  await expect(ed.getByText(`Fixture Co-op ${tag}: information requested.`)).toBeVisible();
  await ectx.close();
  // Admin: the demo business offers no Verify; the real one needs evidence, then verifies.
  await signIn(page, "admin@palavva.local", BASE, "/admin/businesses");
  await expect(page.getByTestId("admin-page")).toContainText("Demo businesses are labelled everywhere and can never be verified");
  const demo = (await pb.list("businesses", "is_demo=true"))[0];
  await page.goto(`${BASE}/admin/businesses?id=${demo.id}`);
  await expect(page.getByTestId("biz-actions")).toContainText("never verified");
  await expect(page.getByTestId("biz-actions").locator('[data-action="verify"]')).toHaveCount(0);
  await page.goto(`${BASE}/admin/businesses`);
  await page.getByTestId("biz-table-search").fill(`Fixture Co-op ${tag}`);
  await page.getByTestId("biz-table").locator("[data-row]").first().click();
  await expect(page.getByTestId("biz-state")).toHaveText("Information requested");
  const verify = page.getByTestId("biz-actions").locator('[data-action="verify"]');
  await verify.locator("summary").click();
  await verify.getByLabel("Verify note").fill("Checked the county registry entry and the founder's ID record");
  await verify.getByRole("button", { name: "Verify" }).click();
  await expect(page.getByText("Add at least one https link")).toBeVisible();
  await verify.getByLabel("Evidence link 1").fill(`https://registry.go.ke/entity/E2E-${tag}`);
  await verify.getByLabel("Evidence note 1").fill("name, county and owner match");
  await verify.getByLabel("Verify note").fill("Checked the county registry entry and the founder's ID record");
  await verify.getByRole("button", { name: "Verify" }).click();
  // The form unmounts once the state changes (Verify no longer applies), so assert the recorded state.
  await expect(page.getByTestId("biz-state")).toHaveText("Verified by Palavva staff");
  await expect(page.getByTestId("biz-history")).toContainText(`registry.go.ke/entity/E2E-${tag}`);
  // Public: verified first and labelled; the unverified payer is not lifted and not in the sponsored strip.
  await page.goto(`${BASE}/businesses`);
  await page.getByTestId("biz-directory-search").fill(tag);
  const rows = page.getByTestId("biz-directory").locator("[data-row]");
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText(`Fixture Co-op ${tag}`);
  await expect(rows.first().locator('[data-label="verified"]')).toBeVisible();
  await expect(rows.nth(1).locator('[data-label="unverified"]')).toBeVisible();
  await expect(page.getByTestId("biz-sponsored")).toHaveCount(0);
  await page.goto(`${BASE}/business/${real.slug}`);
  await expect(page.getByTestId("biz-verified")).toBeVisible();
  // Suspend: profile withdrawn.
  await page.goto(`${BASE}/admin/businesses?id=${real.id}`);
  const sus = page.getByTestId("biz-actions").locator('[data-action="suspend"]');
  await sus.locator("summary").click();
  await sus.getByLabel("Suspend note").fill("Complaint under review about misleading claims");
  await sus.getByRole("button", { name: "Suspend" }).click();
  await expect(page.getByTestId("biz-state")).toHaveText("Suspended");
  expect((await page.request.get(`${BASE}/business/${real.slug}`)).status()).toBe(404);
});
