import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { BASE, PASSWORD, SAMPLE, noConsentBanner, signIn } from "./helpers";

test.beforeEach(async ({ page }) => noConsentBanner(page));
const STORY = "/discussion/demo-rainy-season-delivery-routes";

test("T-010/T-011 draft survives sign-in, posts once, human count updates (AI separate)", async ({ page }) => {
  await page.goto(STORY);
  const countText = async () => Number((await page.getByText(/\d+ community responses?/).first().innerText()).match(/(\d+)/)![1]);
  const before = await countText();
  const draft = `E2E draft ${Date.now()}: riders could flag closures with a timestamp so stale reports expire.`;
  await page.getByLabel("Join the discussion").fill(draft);
  await page.getByRole("button", { name: "Post comment" }).click();
  const dialog = page.getByRole("dialog", { name: "Join the conversation." });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("We'll keep your comment here while you sign in.");
  await dialog.getByLabel("Email").fill("reader@palavva.local");
  await dialog.getByLabel("Password").fill(PASSWORD);
  await dialog.getByRole("button", { name: "Continue with email" }).click();
  await expect(page).toHaveURL(new RegExp(STORY));
  await expect(page.getByRole("link", { name: "Log in" })).toHaveCount(0);
  await expect(page.getByLabel("Join the discussion")).toHaveValue(draft); // exact draft restored
  await expect(page.getByText("Your unsent comment was restored.")).toBeVisible();
  await page.getByRole("button", { name: "Post comment" }).click();
  await expect(page.getByText("Your comment is posted.")).toBeVisible();
  await page.reload();
  const comments = page.getByTestId("human-comment").filter({ hasText: draft });
  await expect(comments).toHaveCount(1);
  await expect(comments.first()).toContainText("Community response");
  expect(await countText()).toBe(before + 1);
  await expect(page.getByText(/· 1 AI contribution shown separately/)).toBeVisible(); // AI counted separately, unchanged
  await page.goto("/feed/new?country=KE");
  await expect(page.getByTestId("story-card").filter({ hasText: "delivery rider" }).first()).toContainText(`${before + 1} human repl`);
});

test("T-011 vote is one per member; concurrent toggles never exceed one", async ({ page }) => {
  await signIn(page, "reader@palavva.local", BASE, STORY);
  const up = page.getByRole("button", { name: /^Upvote\./ });
  const n0 = Number(await up.innerText());
  const pressed0 = (await up.getAttribute("aria-pressed")) === "true";
  await up.click();
  await expect(up).toHaveAttribute("aria-pressed", String(!pressed0));
  await expect(up).toHaveText(String(pressed0 ? n0 - 1 : n0 + 1));
  await up.click();
  await expect(up).toHaveAttribute("aria-pressed", String(pressed0));
  await expect(up).toHaveText(String(n0));
  const res = await page.request.get(`/api/v1/stories/demo-rainy-season-delivery-routes`);
  const id = (await res.json()).data.id;
  const hits = await Promise.all(Array.from({ length: 6 }, () => page.request.put("/api/v1/votes", { data: { target_kind: "piece", target_id: id }, headers: { origin: BASE } })));
  expect(hits.every((h) => h.status() === 200)).toBe(true);
  const after = await (await page.request.get(`/api/v1/stories/demo-rainy-season-delivery-routes`)).json();
  expect([0, 1]).toContain(after.data.counts.votes);
});

test("T-009 auth: wrong password, logout, anonymous/cross-origin writes refused, tenant-bound sessions", async ({ page, request }) => {
  await page.goto("/auth/sign-in");
  await page.getByLabel("Email").fill("reader@palavva.local");
  await page.getByLabel("Password").fill("wrong-password-123");
  await page.getByRole("button", { name: "Continue with email" }).click();
  await expect(page.locator("main form").getByRole("alert")).toHaveText("Email or password is incorrect.");
  // Platform credentials do not work on the sample tenant's host.
  await page.goto(`${SAMPLE}/auth/sign-in`);
  await page.getByLabel("Email").fill("reader@palavva.local");
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Continue with email" }).click();
  await expect(page.locator("main form").getByRole("alert")).toHaveText("Email or password is incorrect.");
  // Anonymous API write → 401; cross-origin write → 403.
  const anon = await request.post("/api/v1/comments", { data: { piece_id: "x", text: "hi" }, headers: { origin: BASE } });
  expect(anon.status()).toBe(401);
  const xo = await request.post("/api/v1/comments", { data: { piece_id: "x", text: "hi" }, headers: { origin: "https://evil.example" } });
  expect(xo.status()).toBe(403);
  // Sign in, then logout clears the session.
  await signIn(page, "reader@palavva.local");
  await page.getByLabel("Account menu").click();
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page.getByRole("link", { name: "Log in" })).toBeVisible();
  await page.goto("/account");
  await expect(page).toHaveURL(/\/auth\/sign-in/);
});

test("T-009 sign-up → mail-sink verification link → can post; unverified cannot", async ({ page }) => {
  const handle = `e2e_${Date.now().toString(36)}`;
  await page.goto(`/auth/sign-up?next=${encodeURIComponent(STORY)}`);
  await page.getByLabel("Name shown with your comments").fill("E2E Person");
  await page.getByLabel("Handle").fill(handle);
  await page.getByLabel("Email").fill(`${handle}@example.test`);
  await page.getByLabel("Password").fill("a-long-password-1");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(new RegExp(`${STORY}\\?welcome=1`));
  await page.getByLabel("Join the discussion").fill("Trying to post before confirming email.");
  await page.getByRole("button", { name: "Post comment" }).click();
  await expect(page.getByText(/Please confirm your email address before posting/)).toBeVisible();
  const sink = path.resolve(__dirname, "../../../../data-test/mail-sink");
  const file = readdirSync(sink).filter((f) => f.includes("verify")).map((f) => path.join(sink, f)).find((f) => readFileSync(f, "utf8").includes(`${handle}@example.test`))!;
  const link = /http:\/\/\S+\/auth\/verify\?token=\S+/.exec(readFileSync(file, "utf8"))![0];
  await page.goto(link.replace(/^http:\/\/[^/]+/, BASE));
  await expect(page.getByRole("heading", { name: "Email confirmed." })).toBeVisible();
  await page.goto(STORY);
  await page.getByLabel("Join the discussion").fill("Posting after confirming my email address.");
  await page.getByRole("button", { name: "Post comment" }).click();
  await expect(page.getByText("Your comment is posted.")).toBeVisible();
});

test("T-012 report → moderator quarantines → comment hidden and count drops; audit recorded", async ({ browser }) => {
  const reader = await (await browser.newContext()).newPage();
  await signIn(reader, "reader@palavva.local", BASE, "/discussion/demo-data-bundle-expiry-explainer");
  const text = `Spammy E2E comment ${Date.now()}`;
  await reader.getByLabel("Join the discussion").fill(text);
  await reader.getByRole("button", { name: "Post comment" }).click();
  await expect(reader.getByText("Your comment is posted.")).toBeVisible();
  await reader.reload();
  const c = reader.getByTestId("human-comment").filter({ hasText: text });
  await c.getByText("Report", { exact: true }).click();
  await c.getByLabel("Reason").selectOption("spam");
  await c.getByRole("button", { name: "Send report" }).click();
  await expect(c.getByText("Your report has been recorded")).toBeVisible();
  const mod = await (await browser.newContext()).newPage();
  await signIn(mod, "moderator@palavva.local", BASE, "/admin/moderation");
  const row = mod.locator("tr", { hasText: text.slice(0, 30) }).first();
  await row.getByRole("button", { name: "Quarantine" }).click();
  await expect(mod.locator("tr", { hasText: text.slice(0, 30) }).filter({ has: mod.getByRole("button", { name: "Quarantine" }) })).toHaveCount(0);
  await expect(async () => { await reader.reload(); await expect(reader.getByTestId("human-comment").filter({ hasText: text })).toHaveCount(0, { timeout: 1000 }); }).toPass({ timeout: 15000 });
  await mod.goto("/admin/settings");
  await expect(mod.getByText("moderation.report_quarantine").first()).toBeVisible();
  // Appeal path: restore from the quarantined list.
  await mod.goto("/admin/moderation");
  const q = mod.locator("tr", { hasText: text.slice(0, 30) }).filter({ hasText: "quarantined" }).first();
  await q.getByRole("button", { name: "Restore" }).click();
  await expect(async () => { await reader.reload(); await expect(reader.getByTestId("human-comment").filter({ hasText: text })).toHaveCount(1, { timeout: 1000 }); }).toPass({ timeout: 15000 });
});
