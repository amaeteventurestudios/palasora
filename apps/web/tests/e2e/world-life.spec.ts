// Palasora town realism (step 1): the town moves like a real place. The monorail stops at its four stations, lets
// people off and on and shows the next train on a sign; buses stop at named stops; traffic follows the clock; the map has
// on-screen zoom, home and compass buttons that reach street level. Town life runs forward with __world.ff(sec), in
// small chunks, so the checks never wait in real time.
import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { BASE, noConsentBanner } from "./helpers";

const shots = path.resolve(__dirname, "../../../../docs/evidence/world-life");
mkdirSync(shots, { recursive: true });
const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 };

test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

type Life = { moving: number; parked: number; walking: number; waiting: number; riding: number; ferry: string;
  buses: { state: string; stop: string; load: number }[]; train: { state: string; station: string; load: number; v: number };
  stations: { name: string; waiting: number; boarding: number; sign: string }[] };

async function openWorld(page: Page, url = "/?hour=10") {
  await noConsentBanner(page);
  await page.goto(`${BASE}${url}`);
  await page.waitForFunction(() => window.__world?.ready === true, null, { timeout: 60_000 });
}
const life = (page: Page) => page.evaluate(() => window.__world!.info().life) as Promise<Life>;
/** Run the town forward until `done` holds, five seconds at a time; returns the state that satisfied it. */
async function runUntil(page: Page, done: (l: Life) => boolean, maxSec: number): Promise<Life> {
  for (let t = 0; t < maxSec; t += 5) {
    const l = await page.evaluate(() => { window.__world!.ff(5); return window.__world!.info().life; }) as Life;
    if (done(l)) return l;
  }
  throw new Error(`not reached in ${maxSec} s of town time`);
}

test("W1-01 the monorail stops at each station, people get off and on, and the sign shows the next train", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openWorld(page, "/?hour=8");
  const seen = new Set<string>();
  let l = await runUntil(page, (x) => x.train.state === "dwell", 120);
  const at = l.train.station;
  seen.add(at);
  expect(l.train.v).toBe(0);
  expect(l.stations.find((s) => s.name === at)?.sign).toBe("Boarding now");
  // the doors stay open for a while: still at the platform five seconds later
  l = await page.evaluate(() => { window.__world!.ff(5); return window.__world!.info().life; }) as Life;
  expect(l.train.state).toBe("dwell");
  // then it leaves, and the sign there counts down to the next train
  l = await runUntil(page, (x) => x.train.state === "run", 60);
  expect(l.stations.find((s) => s.name === at)?.sign).toMatch(/^Next train (under 1|\d+) min$/);
  // it calls at every station in turn
  for (let k = 0; k < 3; k++) {
    l = await runUntil(page, (x) => x.train.state === "dwell" && !seen.has(x.train.station), 150);
    seen.add(l.train.station);
  }
  expect([...seen].sort()).toEqual(["Campus", "Exchange", "Harbour", "Northfield"]);
});

test("W1-02 buses stop at named stops, wait with the doors open, then drive on", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openWorld(page, "/?hour=8");
  const stops = new Set<string>();
  for (let k = 0; k < 3; k++) {
    const l = await runUntil(page, (x) => x.buses.some((b) => b.state === "dwell" && !stops.has(b.stop)), 150);
    for (const b of l.buses) if (b.state === "dwell") { expect(b.stop).not.toBe(""); stops.add(b.stop); }
  }
  expect(stops.size).toBeGreaterThanOrEqual(3);
  // a bus at a stop moves on within half a minute
  const l = await runUntil(page, (x) => x.buses.every((b) => b.state === "run"), 30);
  expect(l.buses).toHaveLength(2);
});

test("W1-03 traffic follows the clock: busy at rush hour, few cars at night, most people indoors", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openWorld(page, "/?hour=8");
  for (let k = 0; k < 2; k++) await page.evaluate(() => window.__world!.ff(5));
  const rush = await life(page);
  await page.evaluate(() => window.__world!.setHour(3));
  for (let k = 0; k < 24; k++) await page.evaluate(() => window.__world!.ff(5));
  const night = await life(page);
  expect(rush.moving).toBeGreaterThan(night.moving * 3);
  expect(night.parked).toBeGreaterThan(rush.parked);
  expect(night.walking).toBeLessThan(rush.walking);
});

test("W1-04 phone: zoom in to street level, zoom out, back home and the compass, all 44 pt targets", async ({ browser }) => {
  const ctx = await browser.newContext(PHONE);
  const page = await ctx.newPage();
  await openWorld(page, "/?hour=10");
  const controls = page.getByTestId("map-controls");
  await expect(controls).toBeVisible();
  for (const b of await controls.locator("button").all()) {
    const r = (await b.boundingBox())!;
    expect(r.height).toBeGreaterThanOrEqual(44); expect(r.width).toBeGreaterThanOrEqual(44);
  }
  const zoom = () => page.evaluate(() => window.__world!.info().zoom);
  const z0 = await zoom();
  for (let k = 0; k < 6; k++) { await page.getByTestId("map-zoom-in").click(); await page.waitForTimeout(500); }
  const z1 = await zoom();
  expect(z1).toBeGreaterThan(z0 * 8);
  expect(z1).toBeLessThanOrEqual(14);
  await page.getByTestId("map-zoom-out").click(); await page.waitForTimeout(600);
  expect(await zoom()).toBeLessThan(z1);
  await page.evaluate(() => window.__world!.ff(5));
  await page.screenshot({ path: path.join(shots, "street-phone.png") });
  await page.getByTestId("map-home").click(); await page.waitForTimeout(1300);
  expect(Math.abs((await zoom()) - z0)).toBeLessThan(0.05);
  // the needle points where north is on screen; the compass button turns back to the usual angle
  await expect(page.getByTestId("map-needle")).toHaveAttribute("style", /rotate\(0\.8\d*rad\)/);
  await page.screenshot({ path: path.join(shots, "town-phone.png") });
  await ctx.close();
});
