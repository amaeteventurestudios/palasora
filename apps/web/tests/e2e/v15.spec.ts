// v1.5 acceptance (unified master W03-W06, W10, W17, W28-W30, W36, W44-W53, W55-W57; docs/specs/25, 27, 28).
// Runs on the isolated test stack. Content is created through the REAL write paths (agent write service, economy API).
import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { BASE, noConsentBanner, pbAdmin, signIn } from "./helpers";

const envText = readFileSync(path.resolve(__dirname, "../../../../.env.test"), "utf8");
const TOKEN = /^EDITORIAL_SERVICE_TOKEN=(.*)$/m.exec(envText)![1].trim();
const ECON = "http://127.0.0.1:8400/economy";
const run = Date.now().toString(36);

async function agentWith(country: string) {
  const pb = await pbAdmin();
  const rows = await pb.list("agents", `country_affinities~'"${country}"' && is_seed=true && hosting='palavva'`);
  const a = rows[Math.floor(Math.random() * rows.length)]; // daily contribution caps apply per agent, so vary the author across runs
  if (a.status !== "active") await pb.update("agents", a.id, { status: "active", status_reason: "activated by e2e" });
  return a as Record<string, any>;
}
async function postAs(agent: Record<string, any>, title: string, country: string) {
  const r = await fetch(`${BASE}/api/v1/agent/posts`, { method: "POST", headers: { "content-type": "application/json", "x-palavva-service-token": TOKEN, "x-palavva-agent-id": agent.id, host: new URL(BASE).host },
    body: JSON.stringify({ subpal: "africanbusiness", title, body: "What would make small traders in this market trust a shared cold room enough to pay a monthly fee for it, and who should run it?", label: "question",
      client_request_id: `e2e-${run}-${country}`, grounding: `${title} small traders cold room shared monthly fee market Africa`, country_codes: [country] }) });
  const j = await r.json();
  expect(r.status, JSON.stringify(j)).toBeLessThan(300);
  expect(j.data.status, `post by ${agent.handle} (${JSON.stringify(agent.country_affinities)}): ${JSON.stringify(j)}`).toBe("published");
  return j.data as { id: string; slug: string; status: string };
}
const econ = async (p: string, body?: unknown) => {
  const r = await fetch(`${ECON}${p}`, { method: body ? "POST" : "GET", headers: { "x-service-token": TOKEN, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, json: await r.json() };
};

test.describe.configure({ mode: "serial" });
let lr: { id: string; slug: string }, za: { id: string; slug: string };
const LR_TITLE = `Liberia traders and a shared cold room ${run}?`;
const ZA_TITLE = `South African traders and a shared cold room ${run}?`;

test("V15-01 country edition scopes feed, banner and API (Liberia never shows South African items)", async ({ page }) => {
  lr = await postAs(await agentWith("LR"), LR_TITLE, "LR");
  za = await postAs(await agentWith("ZA"), ZA_TITLE, "ZA");
  await noConsentBanner(page);
  await page.goto("/?edition=LR&sort=new");
  await expect(page.getByTestId("edition-banner")).toHaveAttribute("data-edition", "LR");
  await expect(page.getByTestId("feed-list").getByText(LR_TITLE)).toBeVisible();
  await expect(page.getByText(ZA_TITLE)).toHaveCount(0);
  const api = await (await page.request.get(`/api/v1/feed?mode=new&edition=LR`)).json();
  expect(api.meta.edition).toBe("LR");
  expect(api.data.map((p: { headline: string }) => p.headline)).toContain(LR_TITLE);
  expect(api.data.every((p: { scope: string }) => p.scope !== "other")).toBe(true);
  expect(api.data.find((p: { headline: string }) => p.headline === LR_TITLE).scope).toBe("local");
  const all = await (await page.request.get(`/api/v1/feed?mode=new&edition=ALL`)).json();
  expect(all.data.map((p: { headline: string }) => p.headline)).toEqual(expect.arrayContaining([LR_TITLE, ZA_TITLE]));
  await page.goto("/?edition=ZA&sort=new");
  await expect(page.getByTestId("feed-list").getByText(ZA_TITLE)).toBeVisible();
  await expect(page.getByText(LR_TITLE)).toHaveCount(0); // Liberia is West Africa, South Africa is Southern Africa: excluded, not "regional"
});

test("V15-02 Senegal → Liberia → Cameroon switching through the UI; rails follow the edition", async ({ page }) => {
  await noConsentBanner(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/?edition=SN");
  for (const [code, name] of [["LR", "Liberia"], ["CM", "Cameroon"]] as const) {
    await page.getByTestId("edition-menu").click();
    await page.getByPlaceholder("Search 54 countries…").fill(name);
    await page.getByTestId(`edition-opt-${code}`).click();
    await expect(page.getByTestId("edition-banner")).toHaveAttribute("data-edition", code, { timeout: 15000 });
    await expect(page.locator("html")).toHaveAttribute("data-edition", code);
    await expect(page.getByTestId("exchange-teaser")).toHaveAttribute("data-market", code);
  }
  await page.reload();
  await expect(page.getByTestId("edition-banner")).toHaveAttribute("data-edition", "CM"); // the viewed edition persists in this session
});

test("V15-03 'Save as my home edition' persists to the account; viewing never overwrites it", async ({ page }) => {
  await noConsentBanner(page);
  await signIn(page, "reader@palavva.local", BASE, "/");
  await page.getByTestId("edition-menu").click();
  await page.getByTestId("edition-save").click();
  await page.getByPlaceholder("Search 54 countries…").fill("Kenya");
  await page.getByTestId("edition-opt-KE").click();
  await expect(page.locator("html")).toHaveAttribute("data-edition", "KE", { timeout: 15000 });
  const pb = await pbAdmin();
  const u = (await pb.list("users", "email='reader@palavva.local'"))[0];
  expect(u.home_edition).toBe("KE");
  await page.getByTestId("edition-menu").click();
  await page.getByPlaceholder("Search 54 countries…").fill("Ghana");
  await page.getByTestId("edition-opt-GH").click(); // view only
  await expect(page.locator("html")).toHaveAttribute("data-edition", "GH", { timeout: 15000 });
  expect((await pb.list("users", "email='reader@palavva.local'"))[0].home_edition).toBe("KE");
});

test("V15-04 SSE stream bound to an edition never delivers another region's events", async ({ request }) => {
  const res = await request.get(`/api/v1/events?cursor=0&edition=LR`, { timeout: 8000 }).catch(() => null);
  // Playwright's request API buffers; use fetch with an abort to read the first seconds of the stream instead.
  void res;
  const ctl = new AbortController();
  setTimeout(() => ctl.abort(), 4000);
  let text = "";
  try {
    const r = await fetch(`${BASE}/api/v1/events?cursor=0&edition=LR`, { signal: ctl.signal });
    const reader = r.body!.getReader();
    for (;;) { const { value, done } = await reader.read(); if (done) break; text += new TextDecoder().decode(value); }
  } catch { /* aborted after 4 s */ }
  expect(text).toContain("edition=LR");
  const events = text.split("\n").filter((l) => l.startsWith("data: ")).map((l) => JSON.parse(l.slice(6)));
  expect(events.some((e) => e.piece_id === lr.id)).toBe(true);
  expect(events.some((e) => e.piece_id === za.id)).toBe(false);
  for (const e of events) if (e.piece_id) expect(["local", "regional", "pan"]).toContain(e.scope);
});

for (const w of [320, 375, 390, 428, 768]) {
  test(`V15-05 mobile shell at ${w}px: no sideways scroll, five-item bottom nav, drawer`, async ({ page }) => {
    await noConsentBanner(page);
    await page.setViewportSize({ width: w, height: 844 });
    await page.goto("/?edition=ALL");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    const nav = page.getByTestId("bottom-nav");
    if (w < 768) {
      await expect(nav).toBeVisible();
      await expect(nav.getByRole("link")).toHaveText(["Home", "SubPals", "Activity", "Exchange", "My Agent"]);
      await expect(page.getByText("Create post", { exact: false })).toHaveCount(0); // no human public-create shortcut
    } else await expect(nav).toBeHidden();
    await page.getByTestId("drawer-trigger").click();
    const drawer = page.getByTestId("mobile-menu");
    for (const l of ["Popular", "Live", "Palavva Exchange", "Businesses", "About", "Guidelines", "Help", "Developer Platform / API", "Privacy", "Advertise", "Best of Palavva"]) await expect(drawer.getByRole("link", { name: l, exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
  });
}

test("V15-06 Exchange: earned eligibility → listing → matched trade → portfolio → reconciliation", async ({ page }) => {
  const pb = await pbAdmin();
  const agents = await pb.list("agents", "is_seed=true && hosting='palavva'");
  const founders = new Set(((await econ("/companies?market=ALL")).json as { founder_agent_id: string }[]).map((c) => c.founder_agent_id));
  const free = agents.filter((a) => !founders.has(a.id)); // one company per founder: pick agents that have not founded one
  const [founder, buyer] = [free[0], free[1]];
  for (const a of [founder, buyer]) {
    if (a.status !== "active") await pb.update("agents", a.id, { status: "active" });
    await econ("/rewards", { agent_id: a.id, rule: "first_contribution", ref_type: "mission", ref_id: `welcome-${run}`, owner_key: `seed:${a.id}` });
    await econ(`/agents/${a.id}/limits`, { enabled: true, max_order_pals: 500, daily_pals: 2000, daily_orders: 20, markets: [], updated_by: "e2e" });
  }
  const ticker = "E" + Array.from({ length: 4 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ"[Math.floor(Math.random() * 24)]).join(""); // unique per run
  const co = await econ("/companies", { founder_agent_id: founder.id, owner_key: `seed:${founder.id}`, name: `Test Harvest Co-op ${ticker}`, ticker, market: "GH", sector: "agriculture",
    description: "A fictional agricultural co-op created by the end-to-end test.", ipo_price: 1.0, fictional_ack: true });
  expect(co.status, JSON.stringify(co.json)).toBe(200);
  const order = await econ("/orders", { agent_id: buyer.id, owner_key: `seed:${buyer.id}`, company_id: co.json.id, side: "buy", price: 1.0, qty: 12, idem_key: `e2e-${run}-buy` });
  expect(order.json.trades).toHaveLength(1);
  const rec = await econ("/reconcile", {});
  expect(rec.json.ok).toBe(true);
  await noConsentBanner(page);
  await page.goto("/exchange?market=GH");
  await expect(page.getByText("Simulated, Pals-only")).toBeVisible();
  await expect(page.getByTestId("listings").getByRole("link", { name: ticker, exact: true })).toBeVisible();
  await page.goto(`/exchange/${ticker}`);
  await expect(page.getByTestId("company-page")).toContainText("Simulated company and shares");
  await expect(page.getByTestId("order-book")).toBeVisible();
  await page.goto(`/agents/${buyer.handle}?tab=portfolio`);
  await expect(page.getByTestId("agent-portfolio")).toContainText(ticker);
  await expect(page.getByTestId("agent-portfolio")).toContainText(/bought|buy|holding|12/i);
});

test("V15-07 Command Center: all 12 workspaces render a chart or map and a scope narrative", async ({ page }) => {
  await signIn(page, "admin@palavva.local", BASE, "/admin");
  for (const p of ["/admin", "/admin/audience", "/admin/geography", "/admin/agent-city", "/admin/social", "/admin/sources", "/admin/pals", "/admin/exchange", "/admin/revenue", "/admin/models", "/admin/ops", "/admin/reports"]) {
    await page.goto(`${p}?range=7d`);
    await expect(page.getByTestId("admin-page"), p).toBeVisible();
    await expect(page.getByTestId("narrative"), p).not.toBeEmpty();
    const visuals = await page.locator(".recharts-wrapper, [data-testid=africa-map], [data-testid=heatmap], [data-testid=cohort-heatmap], [data-testid=funnel], svg[role=img], [role=img]").count();
    expect(visuals, `${p} has no chart/map`).toBeGreaterThan(0);
    await expect(page.getByText("Application error")).toHaveCount(0);
  }
  await page.goto("/admin/geography?country=LR");
  await expect(page.getByText("Liberia").first()).toBeVisible();
  const csv = await page.request.get("/api/v1/admin/report?range=7d&country=ALL");
  expect(csv.status()).toBe(200);
  expect(await csv.text()).toMatch(/^day,signed_in_humans/);
});

test("V15-08 human DAU is not moved by agents, bots, headless QA or staff", async ({ page, request }) => {
  const pb = await pbAdmin();
  const before = (await pb.list("human_activity", "id!=''")).length;
  await noConsentBanner(page);
  await page.goto("/"); await page.waitForTimeout(2600); await page.goto("/exchange"); await page.waitForTimeout(2600); // headless browser: excluded
  const bot = await request.post("/api/v1/activity", { headers: { origin: BASE, "user-agent": "Googlebot/2.1 (+http://www.google.com/bot.html)", "content-type": "application/json" }, data: { page: "home" } });
  expect((await bot.json()).reason).toBe("bot");
  const human = await request.post("/api/v1/activity", { headers: { origin: BASE, "user-agent": `Mozilla/5.0 (Linux; Android 13; TECNO KJ5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36 run/${run}`, "content-type": "application/json" }, data: { page: "home", edition: "NG", lang: "en" } });
  expect((await human.json()).counted).toBe(true);
  expect((await pb.list("human_activity", "id!=''")).length).toBe(before + 1); // only the one real-browser guest
  const again = await request.post("/api/v1/activity", { headers: { origin: BASE, "user-agent": `Mozilla/5.0 (Linux; Android 13; TECNO KJ5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36 run/${run}`, "content-type": "application/json" }, data: { page: "home" } });
  expect((await again.json()).reason).toBe("updated"); // same visitor, same day: still one row
});

test("V15-09 developer surfaces: OpenAPI, MCP (auth required, observer rule), A2A card", async ({ request, page }) => {
  const spec = await (await request.get("/api/v1/openapi.json")).json();
  expect(spec.openapi).toBe("3.1.0");
  expect(Object.keys(spec.paths)).toEqual(expect.arrayContaining(["/agent/posts", "/agent/orders", "/mcp"]));
  const list = await (await request.post("/api/v1/mcp", { data: { jsonrpc: "2.0", id: 1, method: "tools/list" } })).json();
  expect(list.result.tools.map((t: { name: string }) => t.name)).toEqual(expect.arrayContaining(["palavva_feed", "palavva_post", "palavva_order"]));
  const anon = await (await request.post("/api/v1/mcp", { data: { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "palavva_post", arguments: { subpal: "money", title: "A human trying to post", body: "x".repeat(60) } } } })).json();
  expect(anon.error.code).toBe(-32001);
  await signIn(page, "reader@palavva.local", BASE, "/");
  const human = await (await page.request.post("/api/v1/mcp", { data: { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "palavva_post", arguments: { subpal: "money", title: "A human trying to post", body: "x".repeat(60) } } } })).json();
  expect(human.error.message).toMatch(/observe|agent/i); // humans observe; only agents post
  const card = await (await request.get("/.well-known/agent.json")).json();
  expect(card.interfaces.mcp).toContain("/api/v1/mcp");
});

test("V15-10 agent directory shows registered vs active honestly and filters by country", async ({ page }) => {
  await noConsentBanner(page);
  await page.goto("/agents?country=LR");
  await expect(page.getByTestId("agent-count")).toContainText(/\d+ agents? match/);
  const handles = await page.getByTestId("agent-list").locator("[data-agent]").count();
  expect(handles).toBeGreaterThan(0);
  await page.goto("/agents?status=waiting");
  await expect(page.getByTestId("agent-list").getByText("not yet active").first()).toBeVisible();
});

async function _unused(_p: Page) { /* keep Page import for helpers */ }
