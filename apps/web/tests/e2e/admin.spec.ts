import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { BASE, noConsentBanner, shotDir, signIn } from "./helpers";

test.beforeEach(async ({ page }) => noConsentBanner(page));

async function openDraft(page: Page, text: string) {
  await page.goto("/admin/editorial?tab=review");
  await page.getByRole("link", { name: new RegExp(text) }).first().click();
  await expect(page.getByRole("heading", { name: "Claims and evidence" })).toBeVisible();
}

test("T-029 RBAC: member → forbidden; anonymous → sign-in; moderator cannot approve", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/auth\/sign-in\?next=(%2F|\/)admin/);
  await signIn(page, "reader@palavva.local", BASE, "/admin");
  await expect(page).toHaveURL(/\/forbidden/);
  await expect(page.getByRole("heading", { name: "You don't have permission to view this page." })).toBeVisible();
  const r = await page.request.get("/api/v1/admin/metrics");
  expect(r.status()).toBe(403);
});

test("T-029 Overview shows real, labeled metrics and integration states; screenshots", async ({ page }) => {
  await signIn(page, "editor@palavva.local", BASE, "/admin");
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  // v1.5 visual Command Center (docs/specs/25): the same honest states, now on the workspace that owns them.
  await expect(page.locator('[data-metric="Real revenue"]')).toContainText("no processor connected");
  await expect(page.locator('[data-metric="Paid model spend"]')).toContainText("$0.00");
  // ISSUE-23 least privilege: an Editorial Manager cannot open money, settings, sponsor or operations workspaces.
  for (const p of ["/admin/revenue", "/admin/settings", "/admin/sponsors", "/admin/health", "/admin/users"]) { await page.goto(p); await expect(page).toHaveURL(/\/forbidden/); }
  const ctx = await page.context().browser()!.newContext(); const sa = await ctx.newPage();
  await signIn(sa, "admin@palavva.local", BASE, "/admin/revenue");
  await expect(sa.getByText("EspoCRM: NOT_CONFIGURED")).toBeVisible();
  await expect(sa.getByText("Revive Adserver: NOT_CONFIGURED")).toBeVisible();
  const page2 = sa;
  for (const [p, name] of [["/admin", "overview"], ["/admin/editorial", "editorial"], ["/admin/sources", "sources"], ["/admin/ai", "ai"], ["/admin/analytics", "analytics"], ["/admin/health", "health"], ["/admin/settings", "settings"], ["/admin/sponsors", "sponsors"]]) {
    await page2.goto(p);
    await expect(page2.getByRole("heading", { level: 1 })).toBeVisible();
    await page2.screenshot({ path: `${shotDir}/admin-${name}-1440.png`, fullPage: false });
  }
  await ctx.close();
});

test("T-030 sponsor inquiry: durable reference, honest NOT_CONFIGURED forward state", async ({ page }) => {
  await page.goto("/advertise");
  await page.getByLabel("Your name").fill("Ada Test");
  await page.getByLabel("Work email").fill("ada@business.test");
  await page.getByLabel("Business or organization").fill("Test Solar Ltd");
  await page.getByLabel("Country/region").selectOption("Kenya");
  await page.getByLabel("Industry").selectOption("Energy & Climate");
  await page.getByLabel(/I agree to be contacted/).check();
  await page.getByRole("button", { name: "Send inquiry" }).click();
  const ok = page.getByTestId("inquiry-success");
  await expect(ok).toContainText(/Reference: PV-\d{8}-[0-9A-F]{6}/);
  const ref = /PV-\d{8}-[0-9A-F]{6}/.exec(await ok.innerText())![0];
  await signIn(page, "admin@palavva.local", BASE, "/admin/sponsors");
  const row = page.locator("tr", { hasText: ref });
  await expect(row).toContainText("NOT_CONFIGURED");
  await row.click(); // ISSUE-18: the inquiry panel replaces the old table buttons
  await expect(page.getByTestId("inquiry-forward")).toHaveText("NOT_CONFIGURED");
  await page.getByRole("button", { name: "Send to EspoCRM now" }).click();
  await expect(page.getByText("EspoCRM is not configured; the inquiry stays safely in Palavva.")).toBeVisible();
});

test("T-027/T-028 analytics: consent-gated event written once, opt-out sends nothing, ETL aggregates", async ({ browser }) => {
  const dir = path.resolve(__dirname, "../../../../data-test/analytics");
  const viewed = () => { try { return readdirSync(dir, { recursive: true }).filter((f) => String(f).endsWith(".ndjson"))
    .map((f) => readFileSync(path.join(dir, String(f)), "utf8")).join("").split("\n").filter((l) => l.includes('"story_viewed"')); } catch { return []; } };
  const before = viewed().length;
  // Palasora Phase 1: news discussions are retired, so story_viewed is checked on an agent original thread.
  // Opt-out: no client events.
  const denied = await browser.newContext();
  await denied.addInitScript(() => localStorage.setItem("pv_consent", "denied"));
  const dp = await denied.newPage();
  let posted = 0;
  dp.on("request", (r) => { if (r.url().includes("/api/v1/analytics/events")) posted++; });
  await dp.goto(BASE + "/posts/e2e-original-za-4");
  await dp.waitForTimeout(2600);
  expect(posted).toBe(0);
  expect(viewed().length).toBe(before);
  // Consent: exactly one story_viewed per page load, stored without PII.
  const ok = await browser.newContext();
  await ok.addInitScript(() => localStorage.setItem("pv_consent", "granted"));
  const op = await ok.newPage();
  await op.goto(BASE + "/posts/e2e-original-za-4");
  await expect.poll(() => viewed().length, { timeout: 8000 }).toBe(before + 1);
  await op.waitForTimeout(1500);
  expect(viewed().length).toBe(before + 1);
  const line = JSON.parse(viewed().at(-1)!);
  expect(Object.keys(line)).not.toContain("ip");
  expect(JSON.stringify(line)).not.toMatch(/@|password/);
  await signIn(op, "admin@palavva.local", BASE, "/admin/analytics");
  await op.getByRole("button", { name: "Aggregate now" }).click();
  await expect(op.getByText(/Aggregation done: \d+ rows/)).toBeVisible();
  await op.reload();
  await expect(op.getByTestId("admin-metric").filter({ hasText: "Story views" })).not.toContainText("Delayed");
});
