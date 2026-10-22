// Palasora Phase 7 acceptance (Doc 06 sections 10 and 11.3): a business card's numbers match the ledger; a full profile
// opens from the card; only the owner gets the controls, and an owner's change goes out as a request that the town's next
// hour runs through the Actions gate. The test stack gives stall b001 a day of real ledger entries (e2e_fixtures._seed_books):
// 40,000 centi-Sora of capital (not revenue), 14 meals at 2.50, one wage of 15.00 and 3.00 of plot upkeep.
import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { BASE, noConsentBanner, signIn } from "./helpers";

const shots = path.resolve(__dirname, "../../../../docs/evidence/phase-7");
mkdirSync(shots, { recursive: true });
const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 };

test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);

async function openStall(page: Page) {
  await noConsentBanner(page);
  await page.goto(`${BASE}/town/first-town?at=P405&hour=11`);
  await page.waitForFunction(() => window.__world?.ready === true, null, { timeout: 60_000 }).catch(() => {}); // the 2D map has no __world
  const card = page.getByTestId("world-card");
  await expect(card.getByTestId("biz-card")).toBeVisible({ timeout: 20_000 });
  return card;
}

test("P7-01 the card's money comes from the ledger: revenue, costs, profit and balance for each period", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const card = await openStall(page);
  await expect(card.getByTestId("biz-revenue")).toHaveText("35.00 Sora");
  await expect(card.getByTestId("biz-costs")).toHaveText("18.00 Sora");
  await expect(card.getByTestId("biz-profit")).toHaveText("17.00 Sora");
  await expect(card.getByTestId("biz-ledger")).toContainText("Balance 417.00 Sora");
  await expect(card.getByTestId("biz-ledger")).toContainText("from the ledger, 16 entries");
  await expect(card.getByTestId("biz-ledger")).toContainText("balance checks out");
  for (const k of ["day", "month"]) {
    await card.getByTestId(`biz-period-${k}`).click();
    await expect(card.getByTestId("biz-revenue")).toHaveText("35.00 Sora");
  }
  await expect(card.getByTestId("biz-staff")).toContainText("h010");
  await expect(card.getByTestId("biz-stock")).toContainText("6 meals");
  await expect(card.getByTestId("biz-sales")).toContainText("Meals sold");
  // a visitor sees no owner controls
  await expect(card.getByTestId("biz-manage")).toHaveCount(0);
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(shots, "card-desktop.png") });
});

test("P7-02 Open profile shows the full business page with the same numbers and recent events", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const card = await openStall(page);
  await card.getByTestId("biz-open-profile").click();
  await expect(page).toHaveURL(/\/town\/business\/b001$/, { timeout: 30_000 });
  const prof = page.getByTestId("biz-profile");
  await expect(prof).toContainText("Food stall");
  await expect(prof.getByTestId("biz-price")).toContainText("meals at 2.50 Sora each");
  await expect(prof.getByTestId("biz-revenue")).toHaveText("35.00 Sora");
  await expect(prof).toContainText("Recent events");
  await page.screenshot({ path: path.join(shots, "profile-desktop.png"), fullPage: true });
  expect((await page.request.get(`${BASE}/town/business/b999`)).status()).toBe(404);
  expect((await page.request.get(`${BASE}/town/business/nope`)).status()).toBe(404);
});

test("P7-03 the owner manages through requests: price and upgrade are queued for the next hour, with a cost preview", async ({ browser }) => {
  const ctx = await browser.newContext(PHONE);
  const page = await ctx.newPage();
  await signIn(page, "reader@palavva.local", BASE, "/feed");
  const card = await openStall(page);
  const manage = card.getByTestId("biz-manage");
  await expect(manage).toBeVisible();
  await expect(manage).toContainText("Staff 1 of 2");
  await manage.getByTestId("biz-set-price").fill("3.5");
  await manage.getByTestId("biz-set-price-go").click();
  await expect(manage.getByTestId("biz-msg")).toContainText("next hour");
  await expect(manage.getByTestId("biz-requests").locator("li").first()).toContainText("Change price to 3.50 Sora: waiting for the next hour");
  await manage.getByTestId("biz-upgrade").click();
  await expect(manage.getByTestId("biz-confirm")).toContainText("Upgrade to level 2 for 200.00 Sora");
  await manage.getByTestId("biz-confirm-go").click();
  await expect(manage.getByTestId("biz-requests").locator("li").first()).toContainText("Upgrade: waiting for the next hour");
  // every control is a 44 pt target on a phone
  const heights = await manage.locator("button, input").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
  for (const h of heights) expect(h).toBeGreaterThanOrEqual(44);
  await expect(manage.getByTestId("biz-set-price-go")).toBeEnabled();
  await manage.scrollIntoViewIfNeeded();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(shots, "owner-phone.png") });
  await page.goto(`${BASE}/town/business/b001`);
  await page.screenshot({ path: path.join(shots, "profile-owner-phone.png"), fullPage: true });
  await ctx.close();
});

test("P7-04 another signed-in person sees the numbers but no controls", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await signIn(page, "editor@palavva.local", BASE, "/feed");
  const card = await openStall(page);
  await expect(card.getByTestId("biz-revenue")).toHaveText("35.00 Sora");
  await expect(card.getByTestId("biz-manage")).toHaveCount(0);
});
