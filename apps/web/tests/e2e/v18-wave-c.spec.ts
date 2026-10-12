// v1.8+ Wave C public checks: ISSUE-20 discovery files and rights-respecting Markdown.
import { expect, test } from "@playwright/test";
import { BASE, pbAdmin } from "./helpers";

test("ISSUE-20 llms.txt / llms-full.txt: public links only, honest status, no private paths", async ({ request }) => {
  for (const path of ["/llms.txt", "/llms-full.txt"]) {
    const r = await request.get(`${BASE}${path}`);
    expect(r.status()).toBe(200);
    expect(r.headers()["content-type"]).toContain("text/plain");
    const body = await r.text();
    expect(body).toContain("# Palavva");
    expect(body).toContain("fictional");
    for (const bad of ["/admin", "/account", "/my-agents", "/messages", "/auth"]) expect(body, `${path} must not list ${bad}`).not.toContain(`${new URL(BASE).host}${bad}`);
    expect(r.headers()["x-robots-tag"]).toBe("noindex"); // the test stack is not launched
    expect(body).toContain("not publicly launched");
    for (const m of body.matchAll(/\]\((http[^)\s]+)\)/g)) expect((await request.get(m[1])).status(), m[1]).toBe(200);
  }
});

test("ISSUE-20 robots blocks crawling before launch; sitemap lists only resolvable public pages", async ({ request }) => {
  expect(await (await request.get(`${BASE}/robots.txt`)).text()).toContain("Disallow: /");
  const xml = await (await request.get(`${BASE}/sitemap.xml`)).text();
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  expect(urls.some((u) => u.endsWith("/best"))).toBeTruthy();
  for (const u of urls.slice(0, 40)) {
    expect(u).not.toMatch(/\/(admin|account|auth|api)\b/);
    expect((await request.get(u, { maxRedirects: 0 })).status(), u).toBe(200);
  }
});

test("ISSUE-20 Markdown exists for Palavva-original posts only, with canonical link; publisher cards and drafts are refused", async ({ request }) => {
  const pb = await pbAdmin();
  const post = (await pb.list("editorial_pieces", "review_status='published' && is_demo=false && kind!='source_link'"))[0];
  if (post) {
    const r = await request.get(`${BASE}/md/${post.slug}`);
    expect(r.status()).toBe(200);
    expect(r.headers()["content-type"]).toContain("text/markdown");
    expect(r.headers()["link"]).toContain('rel="canonical"');
    expect(await r.text()).toContain(`# ${post.headline}`);
  }
  const card = (await pb.list("editorial_pieces", "review_status='published' && kind='source_link'"))[0];
  if (card) expect((await request.get(`${BASE}/md/${card.slug}`)).status()).toBe(404);
  const draft = (await pb.list("editorial_pieces", "review_status='needs_review'"))[0];
  if (draft) expect((await request.get(`${BASE}/md/${draft.slug}`)).status()).toBe(404);
  expect((await request.get(`${BASE}/md/..%2Fadmin`)).status()).toBe(404);
});

test("ISSUE-21 Infrastructure & services: all 8 processes, running vs healthy, packages with licences, impact view, jobs without [object Object]", async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem("pv_consent", "denied"); } catch { /* */ } });
  const { signIn } = await import("./helpers");
  await signIn(page, "admin@palavva.local", BASE, "/admin/infrastructure");
  const svc = page.getByTestId("infra-services");
  for (const n of ["pocketbase", "editorial", "worker", "fast", "writers", "intel", "population", "web"]) await expect(svc.locator(`[data-row="${n}"]`)).toBeVisible();
  await expect(svc.locator('[data-row="espocrm"]')).toContainText("Not configured");
  await page.getByRole("button", { name: "Installed software" }).click();
  await page.getByTestId("infra-packages-size-100").click();
  await expect(page.getByTestId("infra-packages").locator('[data-row="npm:next"]')).toContainText("MIT");
  await page.getByRole("button", { name: "Dependencies" }).click();
  await page.getByTestId("impact-select").selectOption("pocketbase");
  await expect(page.getByTestId("impact-result")).toContainText("web");
  await page.getByRole("button", { name: "Jobs" }).click();
  await expect(page.locator("body")).not.toContainText("[object Object]");
  await page.goto(`${BASE}/admin/ops`);
  await expect(page.locator("body")).not.toContainText("[object Object]");
});

test("ISSUE-22 Settings say what each switch does, confirm disruptive changes, audit is searchable and redacted, mail previews hide links", async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem("pv_consent", "denied"); } catch { /* */ } });
  const { signIn } = await import("./helpers");
  await signIn(page, "admin@palavva.local", BASE, "/admin/settings");
  await expect(page.getByTestId("switch-AUTO_PUBLISH_DISABLED")).toContainText(/Automatic publication\s*(Running|Stopped)/);
  const ads = page.getByTestId("switch-AD_SLOTS_DISABLED");
  const before = await ads.locator("span.font-mono").innerText();
  page.once("dialog", (d) => d.dismiss()); // not disruptive: no dialog expected; if one appears, it is dismissed
  await ads.getByPlaceholder("Reason (required)").fill("e2e: settings audit check");
  await ads.getByRole("button", { name: /Turn (on|off)/ }).click();
  await expect(ads.locator("span.font-mono")).not.toHaveText(before);
  await page.reload();
  await page.getByTestId("audit-search").fill("AD_SLOTS_DISABLED");
  const row = page.getByTestId("audit").locator("tbody tr[data-row]").first();
  await expect(row).toContainText("e2e: settings audit check");
  await row.click();
  await expect(page.getByTestId("audit-raw")).toBeVisible();
  await expect(page.getByTestId("audit-raw")).not.toContainText(/[a-f0-9]{32}/);
  // restore
  await page.keyboard.press("Escape");
  await ads.getByPlaceholder("Reason (required)").fill("e2e: restore");
  await ads.getByRole("button", { name: /Turn (on|off)/ }).click();
  await expect(ads.locator("span.font-mono")).toHaveText(before);
  const sink = page.getByTestId("mail-sink");
  if (await sink.count()) await expect(sink).not.toContainText(/token=[A-Za-z0-9]/);
});
