// Company shares: the Town Exchange. The test stack lists house stall b005 on P406 (e2e_fixtures): 300 of its 1,000 shares
// offered at 4.20 Sora, 25 bought by p002 (Tariq Sesay), 275 still for sale, and a dividend of 0.30 Sora a share last
// Sunday. The reader's agent p001 runs stall b001, too young to list. Orders are requests the town's next hour applies.
import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { BASE, noConsentBanner, signIn } from "./helpers";

const shots = path.resolve(__dirname, "../../../../docs/evidence/world-exchange");
mkdirSync(shots, { recursive: true });
const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 };

test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

async function openWorld(page: Page, url = "/?hour=11") {
  await noConsentBanner(page);
  await page.goto(`${BASE}${url}`);
  await page.waitForFunction(() => window.__world?.ready === true, null, { timeout: 60_000 });
}

test("X-01 the Town Exchange lists a business with its price, dividend, order book and shareholders", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openWorld(page);
  await page.getByTestId("main-menu-button").click();
  await page.getByTestId("menu-exchange").click();
  const card = page.getByTestId("world-card");
  await expect(card).toHaveAttribute("data-card", "exchange");
  await expect(card.getByTestId("exchange-summary")).toContainText("1 business of First Town listed · 300.00 Sora paid out in dividends");
  const row = card.getByTestId("exchange-row");
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("Food stall on P406");
  await expect(row).toContainText("4.20 Sora");
  await expect(row).toContainText("Dividend 0.30 Sora a share (7.1% a week)");
  await expect(row).toContainText("2 shareholders");
  await page.screenshot({ path: path.join(shots, "exchange-desktop.png") });
  await row.click();
  await expect(card).toHaveAttribute("data-card", "listing");
  await expect(card.locator("#world-card-h")).toHaveText("Food stall on P406");
  const l = card.getByTestId("listing");
  await expect(l.getByTestId("listing-price")).toContainText("4.20 Sora");
  await expect(l.getByTestId("listing-book")).toContainText("4.20 Sora275");
  await expect(l.getByTestId("listing-holders").locator("li").first()).toContainText("owner975");
  await expect(l.getByTestId("listing-holders")).toContainText("Tariq Sesay25");
  await expect(l.getByTestId("listing-trades")).toContainText("25 at 4.20 Sora");
  await expect(l.getByTestId("listing-dividends")).toContainText("0.30 Sora a share · 300.00 Sora to 2");
  await expect(l.getByTestId("listing-join")).toHaveText("Sign in and move in to buy shares.");
  await page.screenshot({ path: path.join(shots, "listing-desktop.png") });
  await l.getByTestId("listing-back").click();
  await expect(card).toHaveAttribute("data-card", "exchange");
});

test("X-02 phone: from the stall's card a resident orders shares; the order waits for the town's next hour", async ({ browser }) => {
  const ctx = await browser.newContext(PHONE);
  const page = await ctx.newPage();
  await signIn(page, "reader@palavva.local", BASE, "/feed");
  await openWorld(page, "/?at=P406&hour=11");
  const card = page.getByTestId("world-card");
  const shares = card.getByTestId("biz-shares");
  await expect(shares).toBeVisible({ timeout: 20_000 });
  await expect(shares).toContainText("Shares on the Town Exchange4.20 Sora");
  await shares.getByTestId("biz-open-shares").click();
  await expect(card).toHaveAttribute("data-card", "listing");
  const trade = card.getByTestId("listing-trade");
  await expect(trade.getByTestId("listing-order-price")).toHaveValue("4.2");
  await trade.getByTestId("listing-order-qty").fill("10");
  await trade.getByTestId("listing-order-go").click();
  await expect(trade.getByTestId("listing-msg")).toContainText("Your order goes in at the town's next hour");
  await expect(trade.getByTestId("listing-requests").locator("li").first()).toContainText("Buy shares · 10 at 4.20 Sora: waiting for the next hour");
  for (const t of await trade.getByRole("tab").all()) expect((await t.boundingBox())!.height).toBeGreaterThanOrEqual(36);
  await page.screenshot({ path: path.join(shots, "listing-phone.png") });
  await ctx.close();
});

test("X-03 an owner sees when their business can list", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await signIn(page, "reader@palavva.local", BASE, "/feed");
  await openWorld(page, "/?at=P405&hour=11");
  const card = page.getByTestId("world-card");
  await expect(card.getByTestId("biz-manage")).toBeVisible({ timeout: 20_000 });
  await expect(card.getByTestId("biz-list-why")).toContainText("Not yet: a business lists after 14 days of trading");
  await expect(card.getByTestId("biz-shares")).toHaveCount(0);
});
