// v1.3.1: real human engagement (reads/shares) for trending, with anti-inflation guarantees.
import { expect, test, type Page } from "@playwright/test";
import { BASE, noConsentBanner, signIn } from "./helpers";

const CHROME = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

async function summary(page: Page) {
  await page.goto("/admin/trends");
  const cards = page.getByTestId("engagement-summary").locator(".card");
  const val = async (i: number) => Number(await cards.nth(i).locator("p").nth(1).innerText());
  return { reads: await val(0), shares: await val(1), bot: await val(2), dup: await val(3) };
}

test("v1.3.1 reads count after 5 s visible, once per visitor per day; shares count; headless and staff never count", async ({ browser }) => {
  test.setTimeout(120_000);
  const admin = await (await browser.newContext()).newPage();
  await signIn(admin, "editor@palavva.local", BASE, "/admin/trends");
  const before = await summary(admin);

  // A real (non-headless) browser user agent, anonymous visitor.
  // A distinct (but ordinary) browser build per run = a fresh visitor for the daily dedupe.
  const ctx = await browser.newContext({ userAgent: CHROME.replace("141.0.0.0", `141.0.${Date.now() % 10000}.0`) });
  await ctx.addInitScript(() => { try { localStorage.setItem("pv_consent", "denied"); } catch { /* */ } });
  const p = await ctx.newPage();
  await p.goto("/feed/new");
  const href = (await p.locator('a[href^="/discussion/"]').first().getAttribute("href"))!;
  // sendBeacon bodies are not exposed to Playwright, so assert on the endpoint's answers instead.
  const eng = (pg: Page) => pg.waitForResponse((r) => r.url().endsWith("/api/v1/engagement"), { timeout: 15_000 }).then((r) => r.json());
  const first = eng(p);
  await p.goto(href);
  expect(await first).toEqual({ counted: true, reason: "counted" }); // fired only after ~5 s of visibility
  const again = eng(p);
  await p.reload();
  expect(await again).toEqual({ counted: false, reason: "duplicate" }); // same visitor, same day
  const share = eng(p);
  await p.getByRole("button", { name: "Copy link" }).click();
  expect(await share).toEqual({ counted: true, reason: "counted" });

  // The default Playwright browser is headless: its read is refused as automated.
  const bot = await (await browser.newContext()).newPage();
  const botAnswer = eng(bot);
  await bot.goto(href);
  expect(await botAnswer).toEqual({ counted: false, reason: "bot" });

  // Staff reading a story never count.
  const pieceId = await p.getByTestId("live-thread").getAttribute("data-piece-id");
  const r = await admin.request.post("/api/v1/engagement", { data: { piece_id: pieceId, kind: "view" }, headers: { origin: BASE, "user-agent": CHROME } });
  expect(await r.json()).toEqual({ counted: false, reason: "staff" });

  await expect.poll(async () => (await summary(admin)).reads, { timeout: 10_000 }).toBe(before.reads + 1);
  const after = await summary(admin);
  expect(after.shares).toBe(before.shares + 1);
  expect(after.dup).toBeGreaterThanOrEqual(before.dup + 1);   // the reload was not double-counted
  expect(after.bot).toBeGreaterThanOrEqual(before.bot + 1);   // the headless read was refused
  await expect(admin.getByRole("columnheader", { name: "Human reads" })).toBeVisible();
});

test("v1.3.1 engagement endpoint refuses cross-origin, invalid and unpublished targets", async ({ request }) => {
  const x = await request.post("/api/v1/engagement", { data: { piece_id: "abcdefghij12345", kind: "view" }, headers: { origin: "https://evil.example", "user-agent": CHROME } });
  expect(x.status()).toBe(403);
  const bad = await request.post("/api/v1/engagement", { data: { piece_id: "x", kind: "teleport" }, headers: { origin: BASE, "user-agent": CHROME } });
  expect(bad.status()).toBe(422);
  const missing = await request.post("/api/v1/engagement", { data: { piece_id: "abcdefghij12345", kind: "view" }, headers: { origin: BASE, "user-agent": CHROME } });
  expect(missing.status()).toBe(404);
});

test("T-009 an expired session is refused even with a valid cookie (time-travel on expires_at)", async ({ page }) => {
  const { pbAdmin } = await import("./helpers");
  await signIn(page, "reader@palavva.local", BASE, "/");
  await expect(page.getByLabel("Account menu")).toBeVisible();
  const pb = await pbAdmin();
  const users = await pb.list("users", "email='reader@palavva.local'");
  const sessions = await pb.list("sessions", `user_id='${users[0].id}'`);
  for (const s of sessions) await pb.update("sessions", s.id, { expires_at: "2020-01-01 00:00:00.000Z" });
  await page.reload();
  await expect(page.getByLabel("Account menu")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Log in" })).toBeVisible();
  const r = await page.request.put("/api/v1/votes", { data: { target_kind: "piece", target_id: "abcdefghij12345" }, headers: { origin: BASE } });
  expect([401, 403]).toContain(r.status()); // writes refused with the stale cookie
});

test("T-012 (v1.4) public corrections are agent-only: the human edit path is closed (agent corrections: v14.spec.ts)", async ({ page }) => {
  await signIn(page, "reader@palavva.local", BASE, "/discussion/demo-data-bundle-expiry-explainer");
  await expect(page.getByRole("button", { name: "Edit" })).toHaveCount(0);
  const r = await page.request.post("/api/v1/comments", { data: { piece_id: "x", text: "edit attempt" }, headers: { origin: BASE } });
  expect(r.status()).toBe(403);
});
