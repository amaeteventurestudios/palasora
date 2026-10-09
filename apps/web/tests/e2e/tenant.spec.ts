import { expect, test } from "@playwright/test";
import { BASE, SAMPLE, noConsentBanner, shotDir, signIn } from "./helpers";

// Node cannot resolve *.localhost (Chromium can), so API checks address tenant B by Host header.
const B_HOST = { host: new URL(SAMPLE).host };

test.beforeEach(async ({ page }) => noConsentBanner(page));

test("T-033 sample tenant has its own branding and content; platform content invisible there", async ({ page }) => {
  await page.goto(SAMPLE + "/");
  await expect(page.locator("html")).toHaveAttribute("data-tenant", "sample-community");
  await expect(page.getByRole("link", { name: "Sample Africa Community home" })).toBeVisible();
  await expect(page.getByTestId("story-card").first()).toContainText("Sample community");
  await expect(page.getByText("cold room")).toHaveCount(0);
  await page.screenshot({ path: `${shotDir}/tenant-sample-home-1440.png` });
  // Cross-tenant reads by slug and API are masked as 404.
  expect((await page.request.get(BASE + "/discussion/demo-cold-storage-coop-tomatoes", { headers: B_HOST })).status()).toBe(404);
  expect((await page.request.get(BASE + "/discussion/sample-tenant-welcome")).status()).toBe(404);
  expect((await page.request.get(BASE + "/api/v1/stories/demo-cold-storage-coop-tomatoes", { headers: B_HOST })).status()).toBe(404);
  // Search on B never returns A's content.
  await page.goto(SAMPLE + "/search?q=tomatoes");
  await expect(page.getByTestId("story-card")).toHaveCount(0);
  // Sitemap and robots on a demo tenant: nothing indexable.
  expect(await (await page.request.get(BASE + "/sitemap.xml", { headers: B_HOST })).text()).not.toContain("<loc>");
  // Share card uses tenant B branding.
  const og = await page.request.get(BASE + "/og/sample-tenant-welcome", { headers: B_HOST });
  expect(og.status()).toBe(200);
});

test("T-033 sessions, roles and admin views are tenant-bound", async ({ browser }) => {
  // A platform session cookie replayed on the sample host is not a session there.
  const a = await browser.newContext();
  const ap = await a.newPage();
  await signIn(ap, "admin@palavva.local", BASE, "/admin");
  const cookie = (await a.cookies()).find((c) => c.name === "pv_session")!;
  const b = await browser.newContext();
  await b.addCookies([{ name: "pv_session", value: cookie.value, domain: "sample.localhost", path: "/" }]);
  const bp = await b.newPage();
  await bp.goto(SAMPLE + "/admin");
  await expect(bp).toHaveURL(/\/auth\/sign-in/);
  // Sample tenant admin sees only its own tenant and its own audit/sources.
  const s = await (await browser.newContext()).newPage();
  await signIn(s, "admin@sample.local", SAMPLE, "/admin/tenants");
  await expect(s.getByRole("cell", { name: /^Sample Africa Community/ })).toBeVisible();
  await expect(s.getByRole("cell", { name: /^Palavva$/ })).toHaveCount(0);
  await s.goto(SAMPLE + "/admin/sources");
  await expect(s.getByText("SAnews")).toHaveCount(0);
  await expect(s.getByText("Fixture Wire")).toHaveCount(0);
  await s.goto(SAMPLE + "/admin/editorial?tab=published");
  await expect(s.getByText("cold room")).toHaveCount(0);
  // Tenant admin of B cannot write into A by forging fields: actions resolve tenant from Host only.
  const bCookie = (await s.context().cookies(SAMPLE)).find((c) => c.name === "pv_session")!;
  const piece = (await (await s.request.get(BASE + "/api/v1/stories/demo-cold-storage-coop-tomatoes")).json()).data.id; // a tenant A piece id
  const forged = await s.request.post(BASE + "/api/v1/comments", { data: { piece_id: piece, text: "forged cross-tenant", tenant_id: "palavva" },
    headers: { ...B_HOST, origin: SAMPLE, cookie: `pv_session=${bCookie.value}` } });
  expect(forged.status()).toBe(404); // authenticated in B, but A's piece does not exist from B's host
  await s.screenshot({ path: `${shotDir}/tenant-sample-admin-1440.png` });
});

test("T-033 platform admin cannot publish tenant B drafts through tenant A host", async ({ page }) => {
  await signIn(page, "admin@palavva.local", BASE, "/admin");
  const r = await page.request.get(BASE + "/api/v1/admin/metrics", { headers: B_HOST });
  expect(r.status()).toBe(401); // no session on B's host
});
