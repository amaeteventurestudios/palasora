// v1.8+ Wave B: ISSUE-02 write path accepts natural short agent replies (the v1.7 20/60-character floors rejected every
// quick reaction) while still refusing empty text and policy violations.
import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { BASE, noConsentBanner, pbAdmin, signIn } from "./helpers";

const TOKEN = /^EDITORIAL_SERVICE_TOKEN=(.*)$/m.exec(readFileSync(path.resolve(__dirname, "../../../../.env.test"), "utf8"))![1].trim();
const H = (agent: string) => ({ "content-type": "application/json", "x-palavva-service-token": TOKEN, "x-palavva-agent-id": agent, host: new URL(BASE).host });

/** A published agent post to work on. A fresh stack has none until other suites run, so create one through the real
 *  agent API (an agent still under its daily cap). */
let last = "";
const tag = () => (last = Array.from({ length: 8 }, () => "abcdefghijklmnopqrstuvwxyz"[Math.floor(Math.random() * 26)]).join("")); // letters only: numbers must be grounded
async function agentPost(): Promise<Record<string, any>> {
  const pb = await pbAdmin();
  const have = (await pb.list("editorial_pieces", "review_status='published' && kind='agent_post'"))[0];
  if (have) return have;
  for (const a of await pb.list("agents", "kind='palavva_ai' && status='active' && hosting='palavva'")) {
    const r = await fetch(`${BASE}/api/v1/agent/posts`, { method: "POST", headers: H(a.id), body: JSON.stringify({ subpal: "africanbusiness", title: `Who keeps shared cold rooms running in ${tag()}?`,
      body: "Shared cold rooms help small traders, but who pays for repairs after the first year?", label: "question", client_request_id: `e2e-wb-${Date.now()}`,
      grounding: `shared cold rooms small traders repairs year Africa ${last}` }) });
    if (r.status < 300) { const id = (await r.json()).data.id; return (await pb.list("editorial_pieces", `id='${id}'`))[0]; }
  }
  throw new Error("could not create an agent post");
}

test("ISSUE-02 a quick reaction from an agent is published; empty or abusive text is still refused", async () => {
  const pb = await pbAdmin();
  const piece = await agentPost();
  const agents = (await pb.list("agents", "kind='palavva_ai' && status='active' && hosting='palavva'")).filter((a) => a.id !== piece.author_agent_id);
  const post = (agent: string, body: string, crid: string) => fetch(`${BASE}/api/v1/agent/replies`, { method: "POST", headers: H(agent),
    body: JSON.stringify({ piece_id: piece.id, parent_id: "", body, language: "en", client_request_id: crid }) });
  const stamp = Date.now();
  let ok: Response | null = null;
  let i = 0;
  for (; i < agents.length; i++) { // re-runnable: skip agents that already used today's contribution cap on a reused stack
    ok = await post(agents[i].id, "That sounds expensive.", `e2e-quick-${stamp}-${i}`);
    if (ok.status !== 429) break;
  }
  expect(ok!.status, await ok!.clone().text()).toBeLessThan(300);
  expect((await ok!.json()).data.status).toBe("published");
  // Refusals must come from validation/policy, not from the cap: use agents still under their cap.
  const refused = async (body: string, tag: string) => {
    for (let j = i + 1; j < agents.length; j++) { const r = await post(agents[j].id, body, `e2e-${tag}-${stamp}-${j}`); if (r.status !== 429) return r.status; }
    return -1;
  };
  expect([400, 422]).toContain(await refused("  ", "empty"));
  expect([400, 422]).toContain(await refused("You are an idiot.", "abuse"));
});

test("ISSUE-03 Nigeria copy is 36 states + FCT, and a committed reply lights its region once, links to the thread, then fades", async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem("pv_consent", "denied"); } catch { /* */ } });
  await page.goto(`${BASE}/local-pulse?country=NG&layer=agents`);
  await expect(page.locator("main, body").first()).toContainText("36 states + FCT (37 administrative units)");
  await expect(page.locator("body")).not.toContainText("37 states");
  await expect(page.getByTestId("live-pulses")).toHaveAttribute("data-seconds", "8");
  await page.waitForTimeout(1500); // stream connected at the current watermark: no replayed history
  await expect(page.getByTestId("pulse-dot")).toHaveCount(0);
  const pb = await pbAdmin();
  const piece = await agentPost();
  let r: Response | null = null;
  for (const agent of (await pb.list("agents", "kind='palavva_ai' && status='active' && hosting='palavva'")).filter((a) => a.id !== piece.author_agent_id)) {
    await pb.update("agents", agent.id, { adm1_code: "NG-LA", edition: "NG", country_affinities: ["NG"] }); // test stack fixture: a Lagos-affiliated resident
    r = await fetch(`${BASE}/api/v1/agent/replies`, { method: "POST", headers: H(agent.id),
      body: JSON.stringify({ piece_id: piece.id, parent_id: "", body: "Who maintains it after the pilot?", language: "en", client_request_id: `e2e-pulse-${Date.now()}` }) });
    if (r.status !== 429) break; // re-runnable: skip agents that used today's contribution cap
  }
  expect(r!.status, await r!.clone().text()).toBeLessThan(300);
  const dot = page.locator('[data-testid="pulse-dot"][data-area="NG-LA"]');
  await expect(dot).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("pulse-dot")).toHaveCount(1);
  await expect(dot).toHaveAttribute("href", `/posts/${piece.slug}`);
  await expect(dot).toHaveAttribute("aria-label", /fictional affiliation/);
  await expect(page.getByTestId("pulse-dot")).toHaveCount(0, { timeout: 12_000 }); // fades after ~8 s
});

test("ISSUE-03 Regional priorities: 37 Nigerian units, founder list at 2x, a reasoned change is saved and audited; readers are refused", async ({ page }) => {
  await noConsentBanner(page);
  await signIn(page, "admin@palavva.local", BASE, "/admin/regions");
  await expect(page.getByTestId("admin-page")).toContainText("36 states + FCT (37 administrative units)");
  await expect(page.getByTestId("region-table").locator("tbody tr")).toHaveCount(37);
  await expect(page.getByTestId("weight-NG-LA")).toHaveValue("2");
  const start = await page.getByTestId("weight-NG-BE").inputValue(); // 1 on a fresh stack
  const target = start === "1.5" ? "1.25" : "1.5";
  await expect(page.getByTestId("region-save")).toBeDisabled();
  await page.getByTestId("weight-NG-BE").fill(target);
  await page.getByLabel("Reason for the change").fill("e2e: test Benue priority");
  await page.getByTestId("region-save").click();
  await expect(page.getByTestId("region-save-bar")).toContainText("Saved 1 change(s)");
  await page.reload();
  await expect(page.getByTestId("weight-NG-BE")).toHaveValue(target);
  const pb = await pbAdmin();
  const a = (await pb.list("audit_events", "action='regions.priority_saved'"))[0];
  expect(a.meta?.diff ?? a.payload?.diff ?? JSON.stringify(a)).toBeTruthy();
  expect(JSON.stringify(a)).toContain("NG-BE");
  // restore for re-runs
  await page.getByTestId("weight-NG-BE").fill("1");
  await page.getByLabel("Reason for the change").fill("e2e: restore the default");
  await page.getByTestId("region-save").click();
  await expect(page.getByTestId("region-save-bar")).toContainText("Saved 1 change(s)");
  const reader = await page.context().browser()!.newPage();
  await signIn(reader, "reader@palavva.local");
  expect((await reader.request.get(`${BASE}/api/admin/region-priority`)).status()).toBe(403);
  await reader.close();
});

test("ISSUE-10 an English reader sees a stored Arabic->English translation, clearly labelled, and can switch to the original in one click", async ({ page }) => {
  await noConsentBanner(page);
  const pb = await pbAdmin();
  const piece = await agentPost();
  const original = "هل يمكن للطاقة الشمسية أن تخدم الأسواق الريفية؟";
  const now = new Date().toISOString().replace("T", " ");
  await pb.update("editorial_pieces", piece.id, { headline: original, language: "ar", original_language: "ar", published_at: now }); // test-stack fixture: a fresh Arabic post
  const rec = { tenant_id: piece.tenant_id, target_type: "piece", target_id: piece.id, piece_id: piece.id, locale: "en", source_locale: "ar", source_version: piece.revision || 1,
    status: "machine_unreviewed", model: "fixture", prompt_version: "e2e", fields: { headline: "Can solar power serve rural markets?" } };
  const old = await pb.list("localizations", `target_id='${piece.id}' && locale='en'`);
  for (const o of old) await pb.update("localizations", o.id, rec); // deterministic on a reused stack
  if (!old.length) await pb.create("localizations", rec);
  await page.goto(`${BASE}/explore?sort=new`);
  const card = page.locator(`[data-piece-id="${piece.id}"]`);
  await expect(card.getByTestId("translation-note")).toHaveAttribute("data-translation", "machine");
  await expect(card.getByRole("heading")).toHaveText("Can solar power serve rural markets?");
  await expect(card.getByTestId("translation-note")).toContainText("Machine translation, not reviewed from العربية");
  await card.getByTestId("translation-toggle").click();
  await expect(card.getByRole("heading")).toHaveText(original);
  await expect(card.getByRole("heading").locator("a")).toHaveAttribute("dir", "rtl");
  await card.getByTestId("translation-toggle").click();
  await expect(card.getByRole("heading")).toHaveText("Can solar power serve rural markets?");
  await pb.update("editorial_pieces", piece.id, { headline: piece.headline, language: piece.language, original_language: piece.original_language, published_at: piece.published_at }); // leave the stack as found
});

test("ISSUE-10 Translations admin: four separate coverage columns incl. Fante, compact searchable table, side-by-side review", async ({ page }) => {
  await noConsentBanner(page);
  await signIn(page, "editor@palavva.local", BASE, "/admin/translations");
  const reg = page.getByTestId("language-registry");
  await expect(reg.locator('[data-lang="fat"]')).toContainText("Mfantse");
  await expect(reg.locator('[data-lang="fat"]')).toContainText("No (no reliable check yet)");
  await expect(reg.locator('[data-lang="sw"]')).toContainText("Yes, checked automatically");
  await expect(reg.locator('[data-lang="pcm"]')).toContainText("Not yet");
  await expect(page.getByTestId("translations")).toBeVisible();
  await page.getByTestId("translations-size-100").click();
  await expect(page.getByTestId("translations-size-100")).toHaveAttribute("aria-pressed", "true");
  const first = page.getByTestId("translations").locator("tbody tr[data-row]").first();
  if (await first.count()) {
    await first.press("Enter"); // keyboard drill-down
    await expect(page.getByTestId("translation-detail").getByTestId("pair").first()).toContainText("original");
  }
});

test("ISSUE-12 Trend audit separates humans from agents, explains the score, and history is de-duplicated", async ({ page }) => {
  await noConsentBanner(page);
  await page.goto(`${BASE}/`); // computes and snapshots trending
  await page.goto(`${BASE}/`); // same ranking again: must not be stored twice
  await signIn(page, "editor@palavva.local", BASE, "/admin/trends");
  await expect(page.locator('[data-metric="Agent posts + replies"]')).toBeVisible();
  await expect(page.getByTestId("trend-current")).toBeVisible();
  await page.getByRole("button", { name: "What is How trending is calculated?" }).click();
  await expect(page.getByTestId("help-tip-body")).toContainText("Only real people make something");
  const pb = await pbAdmin();
  const rows = await pb.list("trending_snapshots", "scope='home' && country='ALL'");
  const times = rows.map((r) => r.computed_at);
  const sigs = new Map<string, string>();
  for (const t of new Set(times)) sigs.set(t, rows.filter((r) => r.computed_at === t).sort((a, b) => a.rank - b.rank).map((r) => `${r.piece_id}:${r.human_views}:${r.ai_posts}`).join("|"));
  const ordered = [...sigs.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, v]) => v);
  for (let i = 1; i < ordered.length; i++) expect(ordered[i], "consecutive snapshots must differ").not.toBe(ordered[i - 1]);
});

test("ISSUE-11 Geography & coverage: publisher location never counts as the story's place; evidence opens with review actions", async ({ page }) => {
  await noConsentBanner(page);
  await signIn(page, "editor@palavva.local", BASE, "/admin/geo?country=NG");
  await expect(page.getByTestId("narrative")).toContainText("36 states + FCT (37 administrative units)");
  await expect(page.locator('[data-metric="Accuracy of reviewed links"]')).toBeVisible();
  await expect(page.getByTestId("geo-regions").locator("tbody tr")).toHaveCount(37);
  const first = page.getByTestId("geo-evidence").locator("tbody tr[data-row]").first();
  if (await first.count()) {
    await first.click();
    await expect(page.getByTestId("geo-detail")).toContainText("Why this link exists");
    await expect(page.getByTestId("geo-detail").getByRole("button", { name: "Confirm the link" })).toBeVisible();
  }
});

test("ISSUE-26 owner performance is owner-only (empty state, own agent analytics, no cross-owner view) and the leaderboard explains its anti-gaming rules", async ({ browser, request }) => {
  const ownerEmail = "reader@palavva.local";
  const p = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
  await noConsentBanner(p);
  await signIn(p, ownerEmail, BASE, "/my-agents");
  const pb = await pbAdmin();
  const uid = (await pb.list("users", `email='${ownerEmail}'`))[0].id;
  const mine = await pb.list("agents", `owner_user_id='${uid}' && status!='retired' && status!='draft'`);
  if (!mine.length) {
    await expect(p.getByTestId("my-agents")).toContainText("how many real people read its posts"); // helpful empty state
    await p.goto(`${BASE}/developers/connect-agent`);
    await p.getByLabel("Agent handle").fill(`perf${Math.random().toString(36).replace(/[^a-z]/g, "").slice(0, 8)}`);
    await p.getByLabel("What does it do?").fill("E2E owner analytics agent: asks practical questions about small traders.");
    await p.getByRole("button", { name: "Register agent and issue a test key" }).click();
    await expect(p.getByTestId("one-time-key")).toBeVisible();
    await p.goto(`${BASE}/my-agents`);
  }
  await expect(p.getByTestId("owner-performance")).toBeVisible();
  await expect(p.getByTestId("owner-perf-table")).toContainText("Read by people");
  await p.getByRole("link", { name: "30 days" }).click();
  await expect(p).toHaveURL(/period=30/);
  // Another user's agent detail is not reachable.
  const other = (await pb.list("agents", `owner_user_id!='' && owner_user_id!='${uid}'`))[0];
  if (other) expect((await p.goto(`${BASE}/my-agents/${other.id}`))!.status()).toBe(404);
  const board = await request.get(`${BASE}/agents/leaderboard?period=30`);
  expect(board.status()).toBe(200);
  expect(await board.text()).toContain("Only the first 3 replies an agent makes in one thread count");
});
