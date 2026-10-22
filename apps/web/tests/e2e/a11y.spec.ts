import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { BASE, noConsentBanner, signIn } from "./helpers";

// Palasora Phase 1: news story, discussion and Time Lens pages are retired (404); thread pages are checked on agent originals.
const PAGES = ["/", "/feed/trending", "/posts/e2e-original-ng-0", "/posts/e2e-original-gh-2", "/discover", "/search?q=cold",
  "/countries", "/country/nigeria", "/topic/fintech", "/founders", "/business/demo-solar-repair-collective",
  "/advertise", "/corrections", "/about", "/auth/sign-in", "/auth/sign-up", "/profile/ai-economist",
  // v1.4 social surfaces
  "/explore", "/subpals", "/p/football", "/agents", "/agents/PitchReader", "/live", "/businesses", "/guidelines", "/developers", "/help", "/agents/new", "/developers/connect-agent"];
const report: Record<string, unknown> = {};

for (const theme of ["light", "dark"] as const) {
  test(`T-040 axe WCAG 2.2 AA (incl. contrast), ${theme} theme, public pages`, async ({ browser }) => {
    test.setTimeout(300_000); // 30 pages incl. the v1.4 social surfaces
    const ctx = await browser.newContext({ colorScheme: theme });
    const page = await ctx.newPage();
    await noConsentBanner(page);
    const failures: string[] = [];
    for (const p of PAGES) {
      await page.goto(BASE + p);
      const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
      report[`${theme} ${p}`] = r.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, sample: v.nodes[0]?.target }));
      for (const v of r.violations) failures.push(`${p}: ${v.id} (${v.impact}) ×${v.nodes.length} e.g. ${JSON.stringify(v.nodes[0]?.target)}`);
    }
    writeFileSync(path.resolve(__dirname, `../../../../docs/evidence/e2e/axe-${theme}.json`), JSON.stringify(report, null, 1));
    expect(failures, failures.join("\n")).toEqual([]);
  });
}

test("T-040 axe on Command Center (light)", async ({ page }) => {
  await noConsentBanner(page);
  await signIn(page, "editor@palavva.local", BASE, "/admin");
  const failures: string[] = [];
  for (const p of ["/admin", "/admin/editorial", "/admin/sources", "/admin/ai", "/admin/analytics", "/admin/settings"]) {
    await page.goto(BASE + p);
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag22aa"]).analyze();
    for (const v of r.violations) failures.push(`${p}: ${v.id} (${v.impact}) ×${v.nodes.length} e.g. ${JSON.stringify(v.nodes[0]?.target)}`);
  }
  expect(failures, failures.join("\n")).toEqual([]);
});

test("T-040 keyboard: skip link, focus visible, dialog traps and returns focus, Esc closes", async ({ page }) => {
  await noConsentBanner(page);
  await page.goto(BASE + "/posts/e2e-original-ng-0"); // Palasora Phase 1: news threads are retired; an agent original instead
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main")).toBeFocused();
  const save = page.getByRole("button", { name: "Save" });
  await save.focus();
  const outline = await save.evaluate((el) => getComputedStyle(el).outlineStyle);
  expect(outline).not.toBe("none");
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Sign in to Palasora." }); // Palasora Phase 1 copy (people post, reply and vote)
  await expect(dialog).toBeVisible();
  for (let i = 0; i < 12; i++) await page.keyboard.press("Tab");
  expect(await page.evaluate(() => !!document.activeElement?.closest("dialog"))).toBe(true); // focus stays inside
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(save).toBeFocused(); // focus returned to the opener
});

test("T-040 reduced motion honored", async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.goto(BASE + "/feed");
  const d = await page.getByTestId("story-card").first().evaluate((el) => getComputedStyle(el.querySelector("a")!).transitionDuration);
  expect(["0s", "1e-05s", "0.00001s"]).toContain(d);
});
