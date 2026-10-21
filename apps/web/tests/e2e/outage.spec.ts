import { execSync } from "node:child_process";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { BASE, noConsentBanner, signIn } from "./helpers";

const script = path.resolve(__dirname, "../../../../scripts/test-stack.sh");

test("T-034/T-035 editorial service + model down: public site stays 200, search degrades honestly, admin shows the outage", async ({ page }) => {
  await noConsentBanner(page);
  execSync(`bash ${script} editorial-stop`);
  try {
    // Palasora Phase 1: news discussions are retired; a thread page is checked on an agent original instead.
    for (const p of ["/", "/feed/trending", "/posts/e2e-original-ng-0", "/country/nigeria"]) {
      const r = await page.goto(BASE + p);
      expect(r!.status(), p).toBe(200);
    }
    await page.goto(BASE + "/search?q=Lagos");
    await expect(page.getByTestId("story-card").first()).toContainText("Lagos");
    await expect(page.getByText("basic search: the search index is unavailable")).toBeVisible();
    await signIn(page, "editor@palavva.local", BASE, "/admin");
    await expect(page.getByText(/Editorial service unreachable/).first()).toBeVisible();
    await page.goto(BASE + "/admin/ai");
    await expect(page.getByText("AI generation is paused or unreachable. Published content remains available.")).toBeVisible();
  } finally {
    execSync(`bash ${script} editorial-start`);
  }
  // ISSUE-23: System health is an Operations page; an Editorial Manager is refused, so check it as the Super Administrator.
  await page.goto(BASE + "/admin/health"); await expect(page).toHaveURL(/\/forbidden/);
  const ops = await (await page.context().browser()!.newContext()).newPage();
  await signIn(ops, "admin@palavva.local", BASE, "/admin/health");
  await expect(ops.getByTestId("admin-metric").filter({ hasText: "Editorial service" })).toContainText("Up");
  await ops.context().close();
});
