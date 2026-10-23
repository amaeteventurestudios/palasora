// Palasora open world (step 2): the town no longer sits on a block with an edge. The land carries on in every direction,
// built in chunks around the camera: a ring of named districts (residential, commercial, industrial, farmland), then
// countryside. The Districts button tints the zones and names them; tapping a district opens its card with when it opens.
import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { BASE, noConsentBanner } from "./helpers";

const shots = path.resolve(__dirname, "../../../../docs/evidence/world-open");
mkdirSync(shots, { recursive: true });
const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 };

test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

async function openWorld(page: Page, url = "/?hour=11") {
  await noConsentBanner(page);
  await page.goto(`${BASE}${url}`);
  await page.waitForFunction(() => window.__world?.ready === true, null, { timeout: 60_000 });
}
/** Fly the camera and wait until the land in view is built. */
async function goTo(page: Page, x: number, z: number, zoom: number) {
  await page.evaluate(([a, b, c]) => window.__world!.lookAt(a, b, c), [x, z, zoom]);
  let last = -1;
  for (let k = 0; k < 60; k++) {
    await page.waitForTimeout(500);
    const n = await page.evaluate(() => window.__world!.info().chunks);
    if (n === last && k > 3) break;
    last = n;
  }
}

test("W2-01 the land carries on past the town in every direction, within the draw-call budget", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openWorld(page);
  await goTo(page, 10, 0, 0.55);
  const far = await page.evaluate(() => window.__world!.info());
  expect(far.chunks).toBeGreaterThan(20);
  expect(far.calls).toBeLessThan(150);
  expect(far.outerCars).toBeGreaterThan(0);
  await page.screenshot({ path: path.join(shots, "zoomed-out-desktop.png") });
  // far out in the countryside there is still land, roads and traffic
  await goTo(page, 260, -220, 1.2);
  const country = await page.evaluate(() => window.__world!.info());
  expect(country.chunks).toBeGreaterThan(0);
  await page.screenshot({ path: path.join(shots, "countryside-desktop.png") });
});

test("W2-02 Districts names and tints the zones; a district's card says when it opens", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openWorld(page);
  await goTo(page, 30, 0, 0.6);
  await page.getByTestId("map-districts").click();
  await expect(page.getByTestId("map-districts")).toHaveAttribute("aria-pressed", "true");
  const labels = page.getByTestId("district-label");
  await expect(labels.filter({ hasText: "Old Town · open" })).toHaveCount(1);
  await expect(labels.filter({ hasText: "Mill District" })).toHaveCount(1);
  await page.screenshot({ path: path.join(shots, "districts-desktop.png") });
  // tap the middle of the Mill District
  await goTo(page, 60, -28, 1.6);
  await page.mouse.click(640, 400);
  const card = page.getByTestId("world-card");
  await expect(card).toContainText("Mill District");
  await expect(card).toContainText("Industrial district");
  await expect(card).toContainText(/Opens when the town reaches 800 residents \(\d+ now\)/);
  await page.keyboard.press("Escape");
  await expect(card).toHaveCount(0);
  await page.getByTestId("map-districts").click();
  await expect(labels).toHaveCount(0);
});

test("W2-03 phone: pan out of town into a district, the controls stay 44 pt, and home flies back", async ({ browser }) => {
  const ctx = await browser.newContext(PHONE);
  const page = await ctx.newPage();
  await openWorld(page);
  for (const b of await page.getByTestId("map-controls").locator("button").all()) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await goTo(page, 20, 55, 1.3);
  await page.screenshot({ path: path.join(shots, "southgate-phone.png") });
  await page.getByTestId("map-home").click();
  await page.waitForTimeout(1500);
  const cam = await page.evaluate(() => window.__world!.camera());
  expect(Math.hypot(cam.tx - 3.5, cam.tz - 1.5)).toBeLessThan(0.5);
  await ctx.close();
});
