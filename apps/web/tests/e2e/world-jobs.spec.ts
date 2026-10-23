// Hiring and job boards. The test stack (e2e_fixtures, _seed_jobs) has the food factory b009 hiring 2 at 22.00 Sora a
// day (h013 already works there), workshop b003 hiring 1 at 16.00, and h011 and h012 on the civic job. The reader's agent
// p001 runs stall b001 with h010 at 15.00. Requests wait for the town's next hour (the test stack never ticks).
import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { BASE, noConsentBanner, signIn } from "./helpers";

const shots = path.resolve(__dirname, "../../../../docs/evidence/world-jobs");
mkdirSync(shots, { recursive: true });
const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 };

test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

async function openWorld(page: Page, url = "/?hour=11") {
  await noConsentBanner(page);
  await page.goto(`${BASE}${url}`);
  await page.waitForFunction(() => window.__world?.ready === true, null, { timeout: 60_000 });
}

test("J-01 the job board lists open positions with their wages, the civic job and recent hires", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openWorld(page);
  await page.getByTestId("main-menu-button").click();
  await page.getByTestId("menu-jobs").click();
  const card = page.getByTestId("world-card");
  await expect(card).toHaveAttribute("data-card", "jobs");
  await expect(card.getByTestId("jobs-summary")).toContainText("3 open positions · 2 people work in businesses for 18.50 Sora a day on average");
  const rows = card.getByTestId("jobs-row");
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText("Food factory b009");
  await expect(rows.first()).toContainText("22.00 Sora a day");
  await expect(rows.first()).toContainText("2 places open · team 1 of 4");
  await expect(rows.nth(1)).toContainText("no more than the civic wage");
  await expect(card.getByTestId("jobs-civic")).toContainText("20.00 Sora a day");
  await expect(card.getByTestId("jobs-civic")).toContainText("2 at work");
  await expect(card.getByTestId("jobs-hires").locator("li").first()).toContainText("→ b009");
  await expect(card.getByTestId("jobs-sign-in")).toBeVisible();
  await expect(card.getByTestId("jobs-apply")).toHaveCount(0);
  await page.screenshot({ path: path.join(shots, "jobs-desktop.png") });
});

test("J-02 phone: a resident applies for a job and an owner posts one; both wait for the next hour", async ({ browser }) => {
  const ctx = await browser.newContext(PHONE);
  const page = await ctx.newPage();
  await signIn(page, "reader@palavva.local", BASE, "/feed");
  await openWorld(page);
  await page.getByTestId("main-menu-button").click();
  await page.getByTestId("menu-jobs").click();
  const card = page.getByTestId("world-card");
  const mine = card.getByTestId("jobs-mine");
  await expect(mine.getByTestId("jobs-my-job")).toHaveText("You work in your own business (b001).");
  await card.locator('[data-testid="jobs-row"][data-biz="b009"]').getByTestId("jobs-apply").click();
  await expect(mine.getByTestId("jobs-msg")).toContainText("You start at the town's next hour");
  await expect(mine.getByTestId("jobs-requests").locator("li").first()).toContainText("Apply to b009: waiting for the next hour");
  await expect(card.locator('[data-testid="jobs-row"][data-biz="b009"]').getByTestId("jobs-apply")).toHaveCount(0);
  await page.screenshot({ path: path.join(shots, "jobs-phone.png") });
  const team = card.locator('[data-testid="jobs-team"][data-biz="b001"]');
  await expect(team).toContainText("1 of 2 at 15.00 Sora a day");
  await team.getByTestId("jobs-post-wage").fill("18");
  await team.getByTestId("jobs-post").click();
  await expect(team.getByTestId("jobs-team-msg")).toContainText("Your agent applies it at the town's next hour");
  const box = (await card.boundingBox())!;
  expect(box.width).toBeLessThanOrEqual(390);
  await team.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(shots, "team-phone.png") });
  await ctx.close();
});

test("J-03 the Town Hall's card opens the job board", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openWorld(page, "/?at=P505&hour=11");
  const card = page.getByTestId("world-card");
  await card.getByTestId("card-open-jobs").click({ timeout: 20_000 });
  await expect(card).toHaveAttribute("data-card", "jobs");
});
