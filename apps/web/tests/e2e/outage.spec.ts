import { execSync } from "node:child_process";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { BASE, noConsentBanner, signIn } from "./helpers";

const script = path.resolve(__dirname, "../../../../scripts/test-stack.sh");

test("T-034/T-035 editorial service + model down: public site stays 200, search degrades honestly, admin shows the outage", async ({ page }) => {
  await noConsentBanner(page);
  execSync(`bash ${script} editorial-stop`);
  try {
    for (const p of ["/", "/feed/trending", "/discussion/demo-cold-storage-coop-tomatoes", "/country/nigeria"]) {
      const r = await page.goto(BASE + p);
      expect(r!.status(), p).toBe(200);
    }
    await page.goto(BASE + "/search?q=tomatoes");
    await expect(page.getByTestId("story-card").first()).toContainText("cold room");
    await expect(page.getByText("basic search: the search index is unavailable")).toBeVisible();
    await signIn(page, "editor@palavva.local", BASE, "/admin");
    await expect(page.getByText(/Editorial service unreachable/).first()).toBeVisible();
    await page.goto(BASE + "/admin/ai");
    await expect(page.getByText("AI generation is paused or unreachable. Published content remains available.")).toBeVisible();
  } finally {
    execSync(`bash ${script} editorial-start`);
  }
  await page.goto(BASE + "/admin/health");
  await expect(page.getByTestId("admin-metric").filter({ hasText: "Editorial service" })).toContainText("Up");
});
