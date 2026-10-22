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

test("ISSUE-21 Infrastructure & services: all 7 processes, running vs healthy, packages with licences, impact view, jobs without [object Object]", async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem("pv_consent", "denied"); } catch { /* */ } });
  const { signIn } = await import("./helpers");
  await signIn(page, "admin@palavva.local", BASE, "/admin/infrastructure");
  const svc = page.getByTestId("infra-services");
  for (const n of ["pocketbase", "editorial", "worker", "fast", "writers", "population", "web"]) await expect(svc.locator(`[data-row="${n}"]`)).toBeVisible();
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

test("ISSUE-13 Trust & safety: honest zero states, automatic decisions charted, refusal reasons in plain words, rules service health", async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem("pv_consent", "denied"); } catch { /* */ } });
  const { signIn } = await import("./helpers");
  await signIn(page, "moderator@palavva.local", BASE, "/admin/moderation");
  await expect(page.getByTestId("narrative")).toContainText("does not mean content goes unchecked");
  await expect(page.locator('[data-metric="Refused before publication (14 d)"]')).toBeVisible();
  await page.getByTestId("ts-tabs").getByRole("link", { name: "Automatic decisions" }).click();
  await expect(page.getByTestId("refusal-reasons")).toBeVisible();
  await page.getByTestId("ts-tabs").getByRole("link", { name: "Service health" }).click();
  await expect(page.getByTestId("ts-health")).toContainText("Publication rules service: answering");
});

test("ISSUE-06 a clearly new, rule-passing SubPal proposal opens automatically; a near-duplicate waits with a stated reason", async () => {
  const { readFileSync } = await import("node:fs");
  const path = await import("node:path");
  const TOKEN = /^EDITORIAL_SERVICE_TOKEN=(.*)$/m.exec(readFileSync(path.resolve(__dirname, "../../../../.env.test"), "utf8"))![1].trim();
  const pb = await pbAdmin();
  // Proposing a SubPal needs an explicit owner grant (permissions.propose_subpal === true); only those agents can try.
  const agents = (await pb.list("agents", "kind='palavva_ai' && status='active' && hosting='palavva' && permissions~'\"propose_subpal\":true'"))
    .filter((a: { permissions?: Record<string, boolean> }) => a.permissions?.propose_subpal === true);
  expect(agents.length, "fixture needs at least one agent allowed to propose SubPals").toBeGreaterThan(0);
  const tag = Array.from({ length: 6 }, () => "abcdefghijklmnopqrstuvwxyz"[Math.floor(Math.random() * 26)]).join("");
  const propose = async (body: Record<string, string>) => {
    for (const a of agents) {
      const r = await fetch(`${BASE}/api/v1/agent/subpals`, { method: "POST", headers: { "content-type": "application/json", "x-palavva-service-token": TOKEN, "x-palavva-agent-id": a.id, host: new URL(BASE).host }, body: JSON.stringify(body) });
      if (r.status !== 429) return { status: r.status, j: await r.json() };
    }
    throw new Error("no agent under its daily proposal limit");
  };
  const fresh = await propose({ slug: `beekeep${tag}`, name: `Beekeeping ${tag}`, summary: `Hive care, honey markets and pollination questions for beekeepers, group ${tag}.`, reason: "e2e" });
  expect(fresh.status, JSON.stringify(fresh.j)).toBeLessThan(300);
  expect(fresh.j.data.status).toBe("published");
  const dup = await propose({ slug: `beekeepx${tag}`, name: `Beekeeping ${tag} too`, summary: `Hive care, honey markets and pollination questions for beekeepers, group ${tag}.`, reason: "e2e" });
  expect([200, 201, 202, 409]).toContain(dup.status); // either refused as overlapping or held for a person, never opened
  if (dup.status < 300) expect(dup.j.data.status).toBe("held");
  const audits = await pb.list("audit_events", "action='subpal.auto_opened'");
  expect(audits.length).toBeGreaterThan(0);
});

test("ISSUE-08 AI operations: status cards, roles explained as writing perspectives, every run shows what happened next, filters narrow the table", async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem("pv_consent", "denied"); } catch { /* */ } });
  const { signIn } = await import("./helpers");
  await signIn(page, "admin@palavva.local", BASE, "/admin/ai");
  await expect(page.getByRole("heading", { level: 1, name: "AI operations" })).toBeVisible();
  for (const m of ["Local Qwen", "Paid writer calls (24 h)", "Published from paid calls", "Paid spend (total)"]) await expect(page.locator(`[data-metric="${m}"]`)).toBeVisible();
  await expect(page.getByText(/Spend so far: \$[0-9.]+ of the \$[0-9.]+ ceiling/)).toBeVisible(); // ceiling comes from the environment ($5 live)
  await expect(page.getByRole("button", { name: "Check Qwen now" })).toBeVisible();
  const runs = page.getByTestId("ai-runs");
  await expect(runs).toBeVisible();
  const total = Number((await page.getByTestId("ai-runs-count").innerText()).split(" of ")[1].replace(/,/g, ""));
  if (total > 0) {
    // Every row says what happened (published / held / refused / abstained / failed / used / no outcome) — never blank.
    for (const row of await runs.locator("[data-row]").all()) await expect(row).toContainText(/Published|Held for a person|Refused by rules|Chose not to write|Model call failed|Used internally|No outcome recorded/);
    await page.getByTestId("ai-runs-filter-paid-local").click();
    const local = Number((await page.getByTestId("ai-runs-count").innerText()).split(" of ")[0].replace(/,/g, ""));
    expect(local).toBeLessThanOrEqual(total);
  }
});
