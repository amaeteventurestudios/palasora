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
  const ctx = await browser.newContext({ userAgent: CHROME });
  await ctx.addInitScript(() => { try { localStorage.setItem("pv_consent", "denied"); } catch { /* */ } });
  const p = await ctx.newPage();
  await p.goto("/feed/new");
  const href = (await p.locator('a[href^="/discussion/"]').first().getAttribute("href"))!;
  const counted = p.waitForRequest((r) => r.url().endsWith("/api/v1/engagement") && (r.postData() ?? "").includes('"view"'), { timeout: 15_000 });
  await p.goto(href);
  await counted; // fired only after ~5 s of visibility
  await p.reload();
  await p.waitForRequest((r) => r.url().endsWith("/api/v1/engagement") && (r.postData() ?? "").includes('"view"'), { timeout: 15_000 }); // same visitor again
  const share = p.waitForRequest((r) => r.url().endsWith("/api/v1/engagement") && (r.postData() ?? "").includes('"share"'));
  await p.getByRole("button", { name: "Copy link" }).click();
  await share;
  await p.waitForTimeout(1000);

  // The default Playwright browser is headless: its read is refused as automated.
  const bot = await (await browser.newContext()).newPage();
  await bot.goto(href);
  await bot.waitForRequest((r) => r.url().endsWith("/api/v1/engagement"), { timeout: 15_000 });
  await bot.waitForTimeout(1000);

  // Staff reading a story never count.
  const r = await admin.request.post("/api/v1/engagement", { data: { piece_id: href.split("/").pop(), kind: "view" }, headers: { origin: BASE, "user-agent": CHROME } });
  expect([200, 404]).toContain(r.status());
  if (r.status() === 200) expect((await r.json()).counted).toBe(false);

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

test("T-012 an author edits their own reply within 15 minutes; others cannot; the edit shows live and is audited", async ({ browser }) => {
  const { pbAdmin } = await import("./helpers");
  const story = "/discussion/demo-data-bundle-expiry-explainer";
  const author = await (await browser.newContext()).newPage();
  await signIn(author, "reader@palavva.local", BASE, story);
  const text = `Edit E2E ${Date.now()}: bundle notices should arrive a day before expiry.`;
  await author.getByLabel("Join the discussion").fill(text);
  await author.getByRole("button", { name: "Post comment" }).click();
  await expect(author.getByText("Your comment is posted.")).toBeVisible();
  await author.reload();
  const watcher = await (await browser.newContext()).newPage();
  await watcher.goto(story);
  await expect(watcher.locator('[data-live-status="live"]')).toBeVisible({ timeout: 20_000 });
  await expect(watcher.getByTestId("human-post").filter({ hasText: text }).getByRole("button", { name: "Edit" })).toHaveCount(0); // not the author
  const mine = author.getByTestId("human-post").filter({ hasText: text });
  await mine.getByRole("button", { name: "Edit" }).click();
  const edited = text.replace("a day", "two days");
  await mine.getByLabel("Edit your reply").fill(edited);
  await mine.getByRole("button", { name: "Save edit" }).click();
  await expect(author.getByTestId("human-post").filter({ hasText: edited })).toContainText("edited");
  await expect(watcher.getByTestId("human-post").filter({ hasText: edited })).toHaveCount(1, { timeout: 15_000 }); // live post_corrected
  const pb = await pbAdmin();
  const c = (await pb.list("comments", `body_text~'${edited.slice(0, 30)}'`))[0];
  const a = await pb.list("audit_events", `action='comment.edit' && object_id='${c.id}'`);
  expect(a[0].metadata_safe.previous_text).toBe(text);
});
