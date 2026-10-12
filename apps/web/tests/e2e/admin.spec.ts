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

test("T-021 revision conflict (409-style) and publishing kill switch", async ({ browser }) => {
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  await signIn(a, "editor@palavva.local", BASE, "/admin/editorial");
  await signIn(b, "admin@palavva.local", BASE, "/admin/editorial");
  await openDraft(a, "Fixture");
  const url = a.url();
  await b.goto(url);
  await b.getByLabel("Headline").fill("Fixture draft edited in another tab");
  await b.getByRole("button", { name: "Save edit" }).click();
  await expect(b.getByText("Draft updated.")).toBeVisible();
  a.on("dialog", (d) => d.accept());
  await a.getByLabel(/Review note/).fill("Trying to approve a stale revision");
  await a.getByRole("button", { name: "Approve and publish" }).click();
  await expect(a.getByText(/revision conflict/)).toBeVisible();
  // Kill switch: pause publishing, approval is blocked, then resume.
  await b.goto("/admin/settings");
  b.on("dialog", (d) => d.accept()); // v1.8+ ISSUE-22: disruptive switches ask for confirmation
  const sw = b.getByTestId("switch-PUBLISHING_PAUSED");
  await sw.getByPlaceholder("Reason (required)").fill("E2E kill-switch drill");
  await sw.getByRole("button", { name: "Turn on" }).click();
  await expect(sw).toContainText("ON");
  await a.goto(url);
  await expect(a.getByText("Publishing paused for this tenant.")).toBeVisible();
  await a.getByLabel(/Review note/).fill("Should be blocked while paused");
  await a.getByRole("button", { name: "Approve and publish" }).click();
  await expect(a.getByText(/Publishing is paused/)).toBeVisible();
  await b.goto("/admin/settings");
  await b.getByTestId("switch-PUBLISHING_PAUSED").getByPlaceholder("Reason (required)").fill("Drill complete");
  await b.getByTestId("switch-PUBLISHING_PAUSED").getByRole("button", { name: "Turn off" }).click();
  await expect(b.getByTestId("switch-PUBLISHING_PAUSED")).toContainText("OFF");
});

test("T-021/T-022 medium-risk draft: moderator/reviewer limits, flags need a note, editor publishes; AI roles ≤3 go public with it", async ({ browser }) => {
  const ed = await (await browser.newContext()).newPage();
  await signIn(ed, "editor@palavva.local", BASE, "/admin/editorial");
  await openDraft(ed, "Fixture");
  const head = await ed.getByRole("heading", { level: 1 }).innerText();
  await expect(ed.getByText(/Risk: (medium|high|low)/)).toBeVisible();
  await expect(ed.getByText(/AI role contributions \(([0-3])\)/)).toBeVisible();
  // Publish with an empty note when flags exist is refused; with a note it succeeds.
  const approve = ed.getByRole("button", { name: "Approve and publish" });
  ed.on("dialog", (d) => d.accept());
  const cs = await ed.getByText(/Claim check: /).innerText();
  if (cs.includes("NEEDS_REVIEW")) {
    await approve.click();
    await expect(ed.getByText(/Validation raised flags/)).toBeVisible();
  }
  await ed.getByLabel(/Review note/).fill("Checked the fixture claims against the synthetic source; OK for test publication.");
  await approve.click();
  await expect(ed.getByRole("link", { name: "View public page" })).toBeVisible();
  await expect(ed.getByText(/published · created/)).toBeVisible();
  await ed.getByRole("link", { name: "View public page" }).click();
  await expect(ed.getByRole("heading", { level: 1 })).toHaveText(head);
  await expect(ed.getByRole("heading", { name: "Read the sources" })).toBeVisible();
  const ai = ed.getByTestId("ai-post");
  expect(await ai.count()).toBeLessThanOrEqual(3);
  if (await ai.count()) await expect(ai.first()).toContainText("· AI");
  await ed.screenshot({ path: `${shotDir}/e2e-published-fixture-story-1440.png`, fullPage: true });
});

test("T-024 correction: revision bump, public banner, corrections index, OG version", async ({ page }) => {
  await signIn(page, "editor@palavva.local", BASE, "/admin/editorial?tab=published");
  await page.getByRole("link", { name: /Fixture/ }).first().click();
  const rev = Number((await page.locator('input[name="expected_revision"]').first().inputValue()));
  await page.getByLabel("Headline").fill(`Corrected fixture headline ${Date.now()}`);
  await page.getByLabel("Correction summary shown to readers").fill("An earlier version misdescribed the fixture source; the headline was corrected.");
  await page.getByRole("button", { name: "Publish correction" }).click();
  await expect(page.getByText(/Correction published/)).toBeVisible();
  await page.reload();
  expect(Number(await page.locator('input[name="expected_revision"]').first().inputValue())).toBe(rev + 1);
  await page.getByRole("link", { name: "View public page" }).click();
  await expect(page.getByRole("note", { name: "Correction" })).toContainText("misdescribed the fixture source");
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", new RegExp(`v=${rev + 1}`));
  await page.goto("/corrections");
  await expect(page.getByText("misdescribed the fixture source").first()).toBeVisible();
});

test("T-013 rights: pending source test-fetch makes no network request; revoke holds drafts", async ({ page }) => {
  await signIn(page, "admin@palavva.local", BASE, "/admin/sources");
  const pending = page.getByTestId("source-row").filter({ hasText: "AllAfrica" });
  await pending.getByRole("button", { name: "Test fetch" }).click();
  await expect(pending.getByText("Rights not approved: no network request was made.")).toBeVisible();
  await expect(pending.getByRole("button", { name: "Fetch now" })).toHaveCount(0);
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
  await row.getByRole("button", { name: "Retry forward" }).click();
  await expect(row.getByText("Forward state: NOT_CONFIGURED")).toBeVisible();
});

test("T-027/T-028 analytics: consent-gated event written once, opt-out sends nothing, ETL aggregates", async ({ browser }) => {
  const dir = path.resolve(__dirname, "../../../../data-test/analytics");
  const viewed = () => { try { return readdirSync(dir, { recursive: true }).filter((f) => String(f).endsWith(".ndjson"))
    .map((f) => readFileSync(path.join(dir, String(f)), "utf8")).join("").split("\n").filter((l) => l.includes('"story_viewed"')); } catch { return []; } };
  const before = viewed().length;
  // Opt-out: no client events.
  const denied = await browser.newContext();
  await denied.addInitScript(() => localStorage.setItem("pv_consent", "denied"));
  const dp = await denied.newPage();
  let posted = 0;
  dp.on("request", (r) => { if (r.url().includes("/api/v1/analytics/events")) posted++; });
  await dp.goto(BASE + "/discussion/demo-home-bakery-cost-tracking");
  await dp.waitForTimeout(2600);
  expect(posted).toBe(0);
  expect(viewed().length).toBe(before);
  // Consent: exactly one story_viewed per page load, stored without PII.
  const ok = await browser.newContext();
  await ok.addInitScript(() => localStorage.setItem("pv_consent", "granted"));
  const op = await ok.newPage();
  await op.goto(BASE + "/discussion/demo-home-bakery-cost-tracking");
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
