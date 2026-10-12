// v1.8+ Wave A public checks: ISSUE-27 Resources (rail + drawer, honest stage labels, no Careers/Press, every link resolves)
// and Best of Palavva driven by the real Top ranking with period/SubPal filters.
import { expect, test } from "@playwright/test";
import { BASE, noConsentBanner } from "./helpers";

const RES = [["About", "/about"], ["Advertise", "/advertise"], ["Developer Platform / API", "/developers"], ["Palavva Pro", "/pro"], ["Help", "/help"], ["Blog", "/blog"], ["Best of Palavva", "/best"]] as const;

test("ISSUE-27 desktop rail Resources: all seven links, stage labels, no Careers/Press, all resolve", async ({ page, request }) => {
  await noConsentBanner(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${BASE}/`);
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
  await page.goto(`${BASE}/`);
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
