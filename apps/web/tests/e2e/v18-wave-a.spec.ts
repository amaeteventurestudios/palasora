// v1.8+ Wave A public checks: ISSUE-27 Resources (rail + drawer, honest stage labels, no Careers/Press, every link resolves)
// and Best of Palavva driven by the real Top ranking with period/SubPal filters.
import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { BASE, noConsentBanner, pbAdmin } from "./helpers";

const TOKEN = /^EDITORIAL_SERVICE_TOKEN=(.*)$/m.exec(readFileSync(path.resolve(__dirname, "../../../../.env.test"), "utf8"))![1].trim();

const RES = [["About", "/about"], ["Advertise", "/advertise"], ["Developer Platform / API", "/developers"], ["Palavva Pro", "/pro"], ["Help", "/help"], ["Blog", "/blog"], ["Best of Palavva", "/best"]] as const;

test("ISSUE-27 desktop rail Resources: all seven links, stage labels, no Careers/Press, all resolve", async ({ page, request }) => {
  await noConsentBanner(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${BASE}/feed`);
  const res = page.getByTestId("rail-resources");
  await expect(res).toBeVisible();
  for (const [label, href] of RES) await expect(res.getByRole("link", { name: new RegExp(`^${label.replace(/[/]/g, "\\/")}`) })).toHaveAttribute("href", href);
  await expect(res.getByRole("link", { name: /Palavva Pro/ })).toContainText("Proposed");
  await expect(res.getByRole("link", { name: /Blog/ })).toContainText("Soon");
  await expect(page.getByRole("link", { name: /Careers|Press/ })).toHaveCount(0);
  for (const [, href] of RES) expect((await request.get(`${BASE}${href}`)).status(), href).toBe(200);
  await res.locator("summary").click(); // collapsible
  await expect(res.getByRole("link", { name: "About", exact: true })).toBeHidden();
});

test("ISSUE-27 mobile drawer has the same Resources group", async ({ page }) => {
  await noConsentBanner(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/feed`);
  await page.getByTestId("drawer-trigger").click();
  const drawer = page.getByTestId("mobile-menu");
  await expect(drawer.getByText("Resources", { exact: true })).toBeVisible();
  for (const [label, href] of RES) await expect(drawer.getByRole("link", { name: new RegExp(`^${label.replace(/[/]/g, "\\/")}`) })).toHaveAttribute("href", href);
});

test("ISSUE-27 staged pages say so; Best of Palavva filters by period and SubPal", async ({ page }) => {
  await noConsentBanner(page);
  await page.goto(`${BASE}/pro`);
  await expect(page.getByTestId("pro-status")).toHaveText("Proposed · not available");
  await page.goto(`${BASE}/blog`);
  await expect(page.getByTestId("blog-status")).toContainText("no posts yet");
  await page.goto(`${BASE}/best`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Best of Palavva");
  await expect(page.getByTestId("social-feed")).toHaveAttribute("data-mode", "top");
  await page.getByTestId("best-periods").getByRole("link", { name: "This month" }).click();
  await expect(page).toHaveURL(/period=30/);
  await expect(page.getByTestId("best-periods").getByRole("link", { name: "This month" })).toHaveAttribute("aria-current", "page");
  const sub = page.getByTestId("best-subpals").getByRole("link").nth(1);
  const slug = (await sub.textContent())!.replace("p/", "");
  await sub.click();
  await expect(page).toHaveURL(new RegExp(`p=${slug}`));
  await expect(page).toHaveURL(/period=30/);
});

test("ISSUE-25 tabs: Realtime (with connection dot), Hot, Random are real distinct sorts; live status is honest", async ({ page }) => {
  await noConsentBanner(page);
  await page.goto(`${BASE}/feed`);
  const tabs = page.getByTestId("feed-tabs");
  for (const l of ["For You", "Realtime", "Hot", "New", "Top", "Discussed", "Random"]) await expect(tabs.getByRole("link", { name: l, exact: true })).toBeVisible();
  await expect(tabs.getByRole("link", { name: "Live", exact: true })).toHaveCount(0);
  await expect(page.getByTestId("realtime-status")).toHaveAttribute("data-status", "live", { timeout: 15_000 });
  await expect(tabs.getByTestId("realtime-dot")).toHaveAttribute("data-status", "live");
  for (const [l, m] of [["Realtime", "live"], ["Random", "random"]] as const) {
    await tabs.getByRole("link", { name: l, exact: true }).click();
    await expect(page.getByTestId("social-feed")).toHaveAttribute("data-mode", m);
    await expect(tabs.getByRole("link", { name: l, exact: true })).toHaveAttribute("aria-current", "page");
  }
});

test("ISSUE-25 a failed live connection is shown as not live (no fake heartbeat)", async ({ page }) => {
  await noConsentBanner(page);
  await page.route("**/api/v1/events**", (r) => r.abort());
  await page.goto(`${BASE}/feed`);
  await expect(page.getByTestId("realtime-status")).toHaveAttribute("data-status", /reconnecting|offline/, { timeout: 15_000 });
  await expect(page.getByTestId("feed-tabs").getByTestId("realtime-dot")).not.toHaveAttribute("data-status", "live");
  await expect(page.getByTestId("realtime-status")).not.toContainText("LIVE");
});

test("ISSUE-25 Hot right now reacts to genuine committed agent votes from different agents, without reload", async ({ page }) => {
  await noConsentBanner(page);
  await page.goto(`${BASE}/feed`);
  await expect(page.getByTestId("hot-now")).toBeVisible();
  await expect(page.getByTestId("realtime-status")).toHaveAttribute("data-status", "live", { timeout: 15_000 });
  const card = page.getByTestId("story-card").first();
  const pieceId = (await card.getAttribute("data-piece-id"))!;
  const pb = await pbAdmin();
  const already = new Set((await pb.list("agent_votes", `target_id='${pieceId}'`)).map((v) => v.agent_id));
  const voters = (await pb.list("agents", "kind='palavva_ai' && status='active' && hosting='palavva'")).filter((v) => !already.has(v.id));
  let n = 0;
  for (const v of voters) {
    const r = await fetch(`${BASE}/api/v1/agent/votes`, { method: "POST", headers: { "content-type": "application/json", "x-palavva-service-token": TOKEN,
      "x-palavva-agent-id": v.id, host: new URL(BASE).host }, body: JSON.stringify({ target_kind: "piece", target_id: pieceId, direction: 1, reason: "e2e hot-now check" }) });
    if (r.ok && ++n >= 6) break;
  }
  expect(n, "distinct agents that voted").toBeGreaterThanOrEqual(2);
  type Hot = { piece_id: string; href: string; agents: number };
  let mine: Hot | undefined;
  await expect.poll(async () => {
    const api = await (await fetch(`${BASE}/api/v1/hot-now`, { headers: { host: new URL(BASE).host } })).json();
    mine = (api.data.items as Hot[]).find((i) => i.piece_id === pieceId);
    return !!mine;
  }, { message: "voted thread is hot", timeout: 10_000 }).toBe(true);
  if (!mine) throw new Error("unreachable");
  expect(mine.agents).toBeGreaterThanOrEqual(2);
  await expect(page.getByTestId("hot-now").locator(`a[href="${mine.href}"]`)).toBeVisible({ timeout: 15_000 }); // pushed by SSE, no reload
});
