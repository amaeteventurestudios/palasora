// The player market: the Market Hall. The test stack (e2e_fixtures, _seed_market) has farm b007 offering 40 crops at 1.40
// Sora and farm b002 10 at 1.55, workshop b008 6 tools at 21.00, and workshop b003 wanting 10 materials at 7.60; the last
// crops trade was 5 at 1.55. The reader's agent p001 runs stall b001 with 14 crops in store. Orders are owner requests
// that the town's next hour applies (the test stack never ticks, so they wait).
import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { BASE, noConsentBanner, signIn } from "./helpers";

const shots = path.resolve(__dirname, "../../../../docs/evidence/world-market");
mkdirSync(shots, { recursive: true });
const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 };

test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

async function openWorld(page: Page, url = "/?hour=11") {
  await noConsentBanner(page);
  await page.goto(`${BASE}${url}`);
  await page.waitForFunction(() => window.__world?.ready === true, null, { timeout: 60_000 });
}

test("M-01 the Market Hall shows each good's price, its stalls and the order book", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openWorld(page);
  await page.getByTestId("main-menu-button").click();
  await page.getByTestId("menu-market").click();
  const card = page.getByTestId("world-card");
  await expect(card).toHaveAttribute("data-card", "market");
  const crops = card.locator('[data-testid="market-row"][data-good="crops"]');
  await expect(crops).toContainText("1.55 Sora");
  await expect(crops).toContainText("50 for sale from 2 stalls, from 1.40 Sora");
  await expect(crops).toContainText("25 sold in the last day");
  await expect(card.locator('[data-testid="market-row"][data-good="materials"]')).toContainText("10 wanted up to 7.60 Sora");
  await expect(card.locator('[data-testid="market-row"][data-good="tools"]')).toContainText("6 for sale from 1 stall, from 21.00 Sora");
  await expect(card.getByTestId("market-stalls").locator("li").first()).toContainText("40 crops at 1.40 Sora");
  await expect(card.getByTestId("market-sign-in")).toBeVisible();
  await page.screenshot({ path: path.join(shots, "market-desktop.png") });
  await crops.click();
  await expect(card).toHaveAttribute("data-card", "good");
  await expect(card.locator("#world-card-h")).toHaveText("Crops at the Market Hall");
  const g = card.getByTestId("good");
  await expect(g.getByTestId("good-price")).toContainText("1.55 Sora");
  await expect(g.getByTestId("good-book")).toContainText("1.40 Sora40");
  await expect(g.getByTestId("good-stalls")).toContainText("Farm b007");
  await expect(g.getByTestId("good-trades").locator("li").first()).toContainText("5 at 1.55 Sora");
  await expect(g.getByTestId("good-join")).toHaveText("Sign in to open a stall for your business.");
  await page.screenshot({ path: path.join(shots, "crops-desktop.png") });
  await g.getByTestId("good-back").click();
  await expect(card).toHaveAttribute("data-card", "market");
});

test("M-02 phone: from the Market Hall a stall owner offers their crops at their own price; the offer waits for the next hour", async ({ browser }) => {
  const ctx = await browser.newContext(PHONE);
  const page = await ctx.newPage();
  await signIn(page, "reader@palavva.local", BASE, "/feed");
  await openWorld(page, "/?at=P506&hour=11");
  const card = page.getByTestId("world-card");
  await card.getByTestId("card-open-market").click({ timeout: 20_000 });
  await expect(card).toHaveAttribute("data-card", "market");
  const mine = card.getByTestId("market-mine");
  await expect(mine).toContainText("Food stall b001");
  await mine.getByRole("button", { name: "14 crops" }).click();
  await expect(card).toHaveAttribute("data-card", "good");
  const trade = card.getByTestId("good-trade");
  await expect(trade.getByTestId("good-have")).toContainText("14 crops in store · 417.00 Sora to spend");
  await expect(trade.getByTestId("good-order-price")).toHaveValue("1.4");
  await trade.getByTestId("good-order-price").fill("1.45");
  await trade.getByTestId("good-order-qty").fill("10");
  await trade.getByTestId("good-order-go").click();
  await expect(trade.getByTestId("good-msg")).toContainText("Your stall opens at the town's next hour");
  await expect(trade.getByTestId("good-requests").locator("li").first()).toContainText("Offer 10 crops at 1.45 Sora: waiting for the next hour");
  for (const t of await trade.getByRole("tab").all()) expect((await t.boundingBox())!.height).toBeGreaterThanOrEqual(36);
  const box = (await card.boundingBox())!;
  expect(box.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: path.join(shots, "crops-phone.png") });
  // a price far from the usual one is stopped before it is sent (the service refuses it too: test_player_market)
  await trade.getByTestId("good-side-buy").click();
  await trade.getByTestId("good-order-price").fill("9");
  await trade.getByTestId("good-order-go").click();
  expect(await trade.getByTestId("good-order-price").evaluate((e) => (e as HTMLInputElement).validity.rangeOverflow)).toBe(true);
  await expect(trade.getByTestId("good-requests").locator("li")).toHaveCount(1);
  await ctx.close();
});

test("M-03 the owner's business card links its stock to the Market Hall", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await signIn(page, "reader@palavva.local", BASE, "/feed");
  await openWorld(page, "/?at=P405&hour=11");
  const card = page.getByTestId("world-card");
  await card.getByTestId("biz-sell-market").click({ timeout: 20_000 });
  await expect(card).toHaveAttribute("data-card", "good");
  await expect(card.locator("#world-card-h")).toHaveText("Crops at the Market Hall");
  await expect(card.getByTestId("good-have")).toContainText("14 crops in store");
});
