// Palasora bigger businesses: the food factory. The test stack stores factory b009 on harbourside plot P102, with crops
// from farm b002 coming in, 20 packed meals a day going out to stall b006, and stock in its store (e2e_fixtures).
import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { BASE, noConsentBanner, signIn } from "./helpers";

const shots = path.resolve(__dirname, "../../../../docs/evidence/world-factory");
mkdirSync(shots, { recursive: true });
const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 };

test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

async function openWorld(page: Page, url: string) {
  await noConsentBanner(page);
  await page.goto(`${BASE}${url}`);
  await page.waitForFunction(() => window.__world?.ready === true, null, { timeout: 60_000 });
}

test("F-01 the food factory's card reads its line: crops in, meals out to a stall; Look inside shows the belt", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openWorld(page, "/?at=P102&hour=11");
  const card = page.getByTestId("world-card");
  const biz = card.getByTestId("biz-card");
  await expect(biz).toBeVisible({ timeout: 20_000 });
  await expect(biz).toHaveAttribute("data-biz", "b009");
  await expect(card.locator("#world-card-h")).toHaveText("Food factory");
  await expect(card.getByTestId("card-business")).toContainText("Food factory · level 1");
  await expect(card.getByTestId("card-business")).toContainText("1.75 Sora");
  await expect(biz.getByTestId("biz-stock")).toContainText("40 meals");
  await expect(biz.getByTestId("biz-contracts")).toContainText("Sells 20 meals a day to b006");
  await expect(biz.getByTestId("biz-contracts")).toContainText("Buys 25 crops a day from b002");
  await page.screenshot({ path: path.join(shots, "factory-desktop.png") });
  await biz.getByTestId("biz-look-inside").click();
  const room = biz.getByTestId("biz-interior");
  await expect(room).toBeVisible();
  await expect(room).toHaveAttribute("aria-label", /food factory/);
  await page.waitForTimeout(1200); // the belt runs
  await room.screenshot({ path: path.join(shots, "factory-line.png") });
  // the Goods layer names the meals route
  await page.keyboard.press("Escape");
  await page.getByTestId("map-goods").click();
  await expect(page.getByTestId("goods-label").filter({ hasText: "20 meals a day" })).toHaveCount(1);
});

test("F-02 phone: a resident sees food factories on harbourside plots; the factory card and line fit the screen", async ({ browser }) => {
  const ctx = await browser.newContext(PHONE);
  const page = await ctx.newPage();
  await signIn(page, "reader@palavva.local", BASE, "/feed");
  await openWorld(page, "/?at=P102&hour=11");
  const card = page.getByTestId("world-card");
  await expect(card.getByTestId("biz-card")).toBeVisible({ timeout: 20_000 });
  await card.getByTestId("biz-look-inside").click();
  const box = await card.getByTestId("biz-interior").boundingBox();
  expect(box!.width).toBeLessThanOrEqual(390);
  expect(box!.height).toBeGreaterThan(150);
  await page.screenshot({ path: path.join(shots, "factory-phone.png") });
  await page.keyboard.press("Escape");
  await page.getByTestId("main-menu-button").click();
  await page.getByTestId("menu-place").click();
  await expect(card.getByTestId("place-loading")).toHaveCount(0, { timeout: 20_000 });
  await card.getByTestId("place-zone-harbourside").click();
  const plot = card.getByTestId("place-plot").first();
  await expect(plot).toContainText("takes workshops, food factories and delivery depots");
  await expect(plot.getByTestId("place-build-factory")).toBeVisible();
  await page.screenshot({ path: path.join(shots, "factory-place-phone.png") });
  await ctx.close();
});
