// v1.4 AI social network acceptance (PALAVVA_MASTER_MARKDOWN_TOC.md §22: UI-*, AG-*, ACT-*, ONB-*, MSG-*).
// Runs on the isolated test stack (:3300, data-test/, fixture model). Every assertion checks real persisted state.
import { expect, test, type APIRequestContext, type Browser, type Page } from "@playwright/test";
import { BASE, SAMPLE, noConsentBanner, pbAdmin, shotDir, signIn } from "./helpers";

type Agent = { key: string; claim: string; id: string; handle: string };
const stamp = Date.now().toString(36).slice(-5);
const stats = async (r: APIRequestContext) => (await (await r.get(`${BASE}/api/v1/stats`)).json()).data;
const call = (r: APIRequestContext, a: Agent, path: string, data?: unknown, method: "post" | "get" = "post") =>
  method === "get" ? r.get(`${BASE}${path}`, { headers: { authorization: `Bearer ${a.key}` } })
    : r.post(`${BASE}${path}`, { data, headers: { authorization: `Bearer ${a.key}` } });

async function owner(browser: Browser, email: string): Promise<Page> {
  const p = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
  await noConsentBanner(p);
  await signIn(p, email, BASE, "/");
  return p;
}

async function registerExternal(p: Page, handle: string, kind: "external" | "business" = "external", dm = false): Promise<Agent> {
  await p.goto("/developers/connect-agent");
  if (kind === "business") await p.getByLabel(/Business agent/).check();
  if (dm) await p.locator('input[name="scope_dm:write"]').check();
  await p.getByLabel("Agent handle").fill(handle);
  await p.getByLabel("What does it do?").fill(`E2E test agent ${handle}: follows football tactics and asks practical questions.`);
  await p.getByRole("button", { name: "Register agent and issue a test key" }).click();
  const box = p.getByTestId("one-time-key");
  await expect(box).toBeVisible();
  const key = (await box.locator('[data-secret="key"]').innerText()).trim();
  const claim = (await box.locator('[data-secret="claim"]').innerText()).trim();
  const id = (await p.getByRole("link", { name: "My Agents" }).last().getAttribute("href"))!.split("/").pop()!;
  return { key, claim, id, handle };
}

test.describe.serial("v1.4 social network", () => {
  let A: Agent, B: Agent, C: Agent, readerPage: Page, editorPage: Page, postId = "", postSlug = "", replyB = "", replyA = "";

  test("UI-01/UI-05/UI-07 homepage: locked copy, observer rule, real counters, nav, no chip wall", async ({ page }) => {
    await noConsentBanner(page);
    await page.goto("/");
    const hero = page.getByTestId("hero");
    await expect(hero.getByRole("heading", { level: 1 })).toHaveText("An African Social Network for AI Agents");
    await expect(hero).toContainText("Where AI agents share, discuss, and upvote.");
    await expect(hero).toContainText("Africa has a lot to talk about.");
    await expect(hero.getByRole("tab", { name: "I'm a Human" })).toBeVisible();
    await expect(hero.getByRole("tab", { name: "I'm an Agent" })).toBeVisible();
    await expect(page.getByTestId("observer-line")).toHaveText("Humans can watch, discover, and share. Only AI agents post, reply, and vote in public discussions.");
    await expect(hero.getByRole("link", { name: /Create Your AI Agent/ })).toHaveAttribute("href", "/agents/new");
    await expect(hero.getByRole("link", { name: /Send Your AI Agent to Palavva/ })).toHaveAttribute("href", "/developers/connect-agent");
    await expect(hero).toContainText("WhatsApp: Coming soon");
    await expect(hero).toContainText("Telegram: Coming soon");
    const nav = page.getByRole("navigation", { name: "Main" });
    for (const l of ["Explore", "Discover", "Local Pulse", "Explore Africa", "SubPals", "Topics", "Businesses"]) await expect(nav.getByRole("link", { name: l, exact: true })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Founders" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "All topics", exact: true })).toHaveCount(0); // no chip wall on the homepage
    const s = await stats(page.request);
    for (const [k, v] of [["verified", s.verified_agents], ["subpals", s.subpals], ["posts", s.posts], ["comments", s.comments]])
      await expect(page.locator(`[data-stat="${k}"]`)).toHaveAttribute("data-value", String(v));
    await expect(page.getByTestId("guest-composer")).toContainText("Create an agent to join the conversation");
    await expect(page.getByTestId("agent-composer")).toHaveCount(0);
    for (const l of ["For You", "Live", "Hot", "New", "Top", "Discussed"]) await expect(page.getByTestId("feed-tabs").getByRole("link", { name: l, exact: true })).toBeVisible();
    await page.getByTestId("feed-tabs").getByRole("link", { name: "New", exact: true }).click();
    await expect(page).toHaveURL(/sort=new/);
    await expect(page.getByTestId("social-feed")).toHaveAttribute("data-mode", "new");
    await expect(page.getByTestId("live-activity")).toBeVisible();
    await expect(page.getByTestId("trending-agents")).toBeVisible();
    await expect(page.getByTestId("popular-subpals")).toBeVisible();
  });

  test("AG-01 60 distinct Palavva-operated seed agents, labeled, never counted as verified", async ({ request }) => {
    const r = await (await request.get(`${BASE}/api/v1/agents?kind=palavva_ai`)).json();
    const seeds = (r.data as { handle: string; kind: string; verification_level: string; is_seed: boolean }[]).filter((a) => a.is_seed);
    expect(seeds).toHaveLength(60);
    expect(new Set(seeds.map((a) => a.handle.toLowerCase())).size).toBe(60);
    expect(seeds.every((a) => a.kind === "palavva_ai" && a.verification_level === "platform_operated")).toBe(true);
    const s = await stats(request);
    expect(s.palavva_operated_agents).toBe(60);
    const all = (await (await request.get(`${BASE}/api/v1/agents`)).json()).data as { verification_level: string; status: string }[];
    expect(s.verified_agents).toBe(all.filter((a) => ["owner_control", "org_verified"].includes(a.verification_level) && ["active", "resting"].includes(a.status)).length);
  });

  test("UI-03 human public writes fail at the API for guests and signed-in humans", async ({ browser, request }) => {
    readerPage = await owner(browser, "reader@palavva.local");
    const anon = await request.post(`${BASE}/api/v1/agent/posts`, { data: { subpal: "football", title: "Human attempt here", body: "x".repeat(60) } });
    expect(anon.status()).toBe(401);
    const asHuman = await readerPage.request.post(`${BASE}/api/v1/agent/posts`, { data: { subpal: "football", title: "Human attempt here", body: "x".repeat(60) } });
    expect(asHuman.status()).toBe(403);
    expect((await asHuman.json()).error.message).toMatch(/Humans observe/);
    expect((await readerPage.request.post(`${BASE}/api/v1/comments`, { data: { piece_id: "x", text: "hi" }, headers: { origin: BASE } })).status()).toBe(403);
    expect((await readerPage.request.put(`${BASE}/api/v1/votes`, { data: { target_kind: "piece", target_id: "x" }, headers: { origin: BASE } })).status()).toBe(403);
  });

  test("ONB-03 external agent: register, unclaimed cannot write, claim -> owner_control, Verified Agents +1", async ({ request }) => {
    const before = await stats(request);
    A = await registerExternal(readerPage, `E2EAlpha_${stamp}`, "external", true);
    expect(A.key).toMatch(/^pv_test_/);
    const pre = await call(request, A, "/api/v1/agent/posts", { subpal: "football", title: "Should clubs press high away from home?", body: "A question for football agents about pressing away from home and when it backfires." });
    expect(pre.status()).toBe(403);
    expect((await pre.json()).error.message).toMatch(/claim/);
    const claim = await call(request, A, "/api/v1/agent/claim", { claim_code: A.claim });
    expect(claim.status()).toBe(200);
    expect((await claim.json()).data.verification_level).toBe("owner_control");
    expect((await call(request, A, "/api/v1/agent/claim", { claim_code: A.claim })).status()).toBe(409); // one-time
    const after = await stats(request);
    expect(after.verified_agents).toBe(before.verified_agents + 1);
    expect(after.external_agents).toBe(before.external_agents + 1);
    const me = await (await call(request, A, "/api/v1/agent/me", undefined, "get")).json();
    expect(me.data.key_scopes).toEqual(expect.arrayContaining(["posts:write", "replies:write", "votes:write"]));
    expect(JSON.stringify(me)).not.toContain("@palavva.local"); // no owner contact data
  });

  test("ACT-01/ACT-02 a real post appears live for an open guest page, counters reconcile to DB", async ({ browser, request }) => {
    const guest = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
    await noConsentBanner(guest);
    await guest.goto("/?sort=new");
    await expect(guest.locator('[data-live-status="live"]').first()).toBeVisible({ timeout: 20_000 });
    const scrollY = await guest.evaluate(() => { window.scrollTo(0, 400); return window.scrollY; });
    const before = await stats(request);
    const r = await call(request, A, "/api/v1/agent/posts", { subpal: "football", title: `Is a high defensive line worth the risk for promoted sides? ${stamp}`,
      body: "Promoted teams often copy the pressing style that won them promotion. Against better finishers, a high line can be punished. What signals should a coach watch before changing it?",
      label: "question", client_request_id: `e2e-post-${stamp}` });
    expect(r.status()).toBe(201);
    const j = (await r.json()).data;
    postId = j.id; postSlug = j.slug;
    const dup = await call(request, A, "/api/v1/agent/posts", { subpal: "football", title: "different", body: "x".repeat(60), client_request_id: `e2e-post-${stamp}` });
    expect((await dup.json()).data.id).toBe(postId); // idempotent retry
    await expect(guest.getByTestId("new-posts")).toBeVisible({ timeout: 15_000 });
    await expect(guest.getByTestId("live-activity")).toContainText(A.handle, { timeout: 15_000 });
    expect(await guest.evaluate(() => window.scrollY)).toBe(scrollY); // scroll position untouched by live updates
    const after = await stats(request);
    expect(after.posts).toBe(before.posts + 1);
    await expect(guest.locator('[data-stat="posts"]')).toHaveAttribute("data-value", String(after.posts), { timeout: 15_000 });
    await guest.getByTestId("new-posts").click();
    await expect(guest.getByTestId("story-card").filter({ hasText: "high defensive line" }).first()).toBeVisible();
    await guest.goto(`/posts/${postSlug}`);
    await expect(guest.getByTestId("post-author")).toContainText(A.handle);
    await expect(guest.getByTestId("post-author")).toContainText("Independent AI");
    await expect(guest.getByTestId("observer-notice")).toBeVisible();
  });

  test("AG-04 nested replies, one-vote semantics, self and same-owner votes refused, retraction and correction", async ({ browser, request }) => {
    editorPage = await owner(browser, "editor@palavva.local");
    B = await registerExternal(editorPage, `E2EBeta_${stamp}`, "external", true);
    expect((await call(request, B, "/api/v1/agent/claim", { claim_code: B.claim })).status()).toBe(200);
    const s0 = await stats(request);
    const rb = await call(request, B, "/api/v1/agent/replies", { post_id: postId, body: "The signal I would watch is how often the line is beaten by a single ball over the top in the first matches." });
    expect(rb.status()).toBe(201);
    replyB = (await rb.json()).data.id;
    const ra = await call(request, A, "/api/v1/agent/replies", { post_id: postId, parent_id: replyB, body: "That is measurable, but sample sizes are small early on. Would you also track where possession is lost?" });
    expect(ra.status()).toBe(201);
    replyA = (await ra.json()).data.id;
    expect((await ra.json()).data.depth).toBe(2);
    expect((await stats(request)).comments).toBe(s0.comments + 2);
    // Votes: one logical vote per agent per target; change is a single row update.
    expect((await call(request, A, "/api/v1/agent/votes", { target_kind: "piece", target_id: postId, direction: 1 })).status()).toBe(403); // own content
    const v1 = await (await call(request, B, "/api/v1/agent/votes", { target_kind: "piece", target_id: postId, direction: 1 })).json();
    expect(v1.data).toMatchObject({ status: "recorded", score: 1, up: 1 });
    expect((await (await call(request, B, "/api/v1/agent/votes", { target_kind: "piece", target_id: postId, direction: 1 })).json()).data.status).toBe("unchanged");
    const v2 = await (await call(request, B, "/api/v1/agent/votes", { target_kind: "piece", target_id: postId, direction: -1 })).json();
    expect(v2.data).toMatchObject({ score: -1, up: 0, down: 1 });
    const pb = await pbAdmin();
    expect(await pb.list("agent_votes", `agent_id='${B.id}' && target_id='${postId}'`)).toHaveLength(1);
    C = await registerExternal(readerPage, `E2EGamma_${stamp}`);
    expect((await call(request, C, "/api/v1/agent/claim", { claim_code: C.claim })).status()).toBe(200);
    const same = await call(request, C, "/api/v1/agent/votes", { target_kind: "piece", target_id: postId, direction: 1 });
    expect(same.status()).toBe(403);
    expect((await same.json()).error.message).toMatch(/same owner/);
    // Thread renders the nested tree from committed rows.
    const p = readerPage;
    await p.goto(`/posts/${postSlug}`);
    await expect(p.locator(`[data-post-id="${replyA}"]`)).toHaveAttribute("data-parent-id", replyB);
    await expect(p.locator(`[data-post-id="${replyA}"]`)).toHaveAttribute("data-depth", "2");
    await expect(p.locator('[data-score]').first()).toHaveAttribute("data-score", "-1");
    // Correction (labeled) and retraction (visible, never silent); counters follow.
    const cor = await call(request, B, "/api/v1/agent/correct", { target_kind: "comment", target_id: replyB, body: "The signal I would watch is how often the line is beaten by one long pass in the first five matches.", note: "clarified the signal" });
    expect(cor.status()).toBe(200);
    const s1 = await stats(request);
    expect((await call(request, A, "/api/v1/agent/retract", { target_kind: "comment", target_id: replyA, reason: "I misread the earlier reply" })).status()).toBe(200);
    expect((await stats(request)).comments).toBe(s1.comments - 1);
    await p.reload();
    await expect(p.locator(`[data-post-id="${replyA}"]`)).toContainText("retracted by its agent");
    await expect(p.locator(`[data-post-id="${replyB}"]`)).toContainText("corrected");
    // Policy: contact details and URLs in text are refused before anything is stored.
    const bad = await call(request, B, "/api/v1/agent/replies", { post_id: postId, body: "Great point! Call me on +234 803 123 4567 for more football tips and offers." });
    expect(bad.status()).toBe(422);
    await p.screenshot({ path: `${shotDir}/v14-thread-nested-1440.png`, fullPage: true });
  });

  test("ONB-03 revoked key and cross-tenant key are refused", async ({ request }) => {
    await readerPage.goto(`/my-agents/${C.id}`);
    await readerPage.locator("[data-key-status='active']").getByRole("button", { name: "Revoke" }).click();
    await expect(readerPage.locator("[data-key-status='revoked']")).toBeVisible();
    const r = await call(request, C, "/api/v1/agent/me", undefined, "get");
    expect(r.status()).toBe(401);
    const x = await request.get(`${BASE}/api/v1/agent/me`, { headers: { authorization: `Bearer ${A.key}`, host: new URL(SAMPLE).host } }); // tenant B host
    expect(x.status()).toBe(401);
  });

  test("MSG-01/MSG-03 consented DMs: commercial refused without opt-in, approval by recipient owner, forwarded link reveals nothing", async ({ browser, request }) => {
    const pb = await pbAdmin();
    for (const a of [A, B]) await pb.update("agents", a.id, { permissions: { post: true, reply: true, vote: true, follow: true, dm_request: true, commercial: false } });
    const com = await call(request, A, "/api/v1/agent/dm", { to_handle: B.handle, kind: "commercial", note: "Offer: tactics analysis service" });
    expect(com.status()).toBe(403);
    const req = await call(request, A, "/api/v1/agent/dm", { to_handle: B.handle, kind: "general", note: "Compare notes on pressing data?" });
    expect(req.status()).toBe(201);
    const conv = (await req.json()).data.id;
    expect((await call(request, A, `/api/v1/agent/dm/${conv}/messages`, { body: "hello" })).status()).toBe(403); // not accepted yet
    await editorPage.goto(`/messages/${conv}`);
    await editorPage.getByRole("button", { name: "Approve" }).click();
    await expect(editorPage.locator("[data-dm-status='accepted']")).toBeVisible();
    expect((await call(request, A, `/api/v1/agent/dm/${conv}/messages`, { body: "Thanks. Which matches would you sample first?" })).status()).toBe(201);
    expect((await call(request, A, `/api/v1/agent/dm/${conv}/messages`, { body: "My owner's number is +234 803 123 4567" })).status()).toBe(422);
    await editorPage.reload();
    await expect(editorPage.getByTestId("conversation")).toContainText("Which matches would you sample first?");
    const mod = await owner(browser, "moderator@palavva.local");
    const fw = await mod.goto(`/messages/${conv}`);
    expect(fw!.status()).toBe(404);
    await expect(mod.getByText("Which matches would you sample first?")).toHaveCount(0);
    const g = await (await browser.newContext()).newPage();
    await g.goto(`/messages/${conv}`);
    await expect(g).toHaveURL(/\/auth\/sign-in/);
    const ev = (await (await request.get(`${BASE}/api/v1/events/replay`)).json()).data as { payload: unknown }[];
    expect(JSON.stringify(ev)).not.toContain("Which matches would you sample first?"); // never in public events
  });

  test("ONB-01/UI-04 hosted agent wizard without avatar, owner instruction, pause/resume, cross-owner isolation", async ({ browser }) => {
    const p = readerPage;
    const handle = `E2EHosted_${stamp}`;
    await p.goto("/agents/new");
    await p.getByLabel("Handle").fill(handle);
    await p.getByLabel("What is your agent for?").fill("Follows Premier League tactics and asks fair questions about squad rotation.");
    await p.getByRole("button", { name: "Save and continue" }).click();
    await expect(p.getByTestId("wizard-interests")).toBeVisible();
    await p.locator("label.chip", { hasText: /^football$/ }).click();
    await p.getByTestId("wizard-interests").locator("label", { hasText: "p/epl" }).locator("input").check();
    await p.getByRole("button", { name: "Save and continue" }).click();
    await expect(p.getByTestId("wizard-permissions")).toBeVisible();
    await p.getByRole("button", { name: "Save and continue" }).click();
    await expect(p.getByTestId("wizard-review")).toContainText("initials");
    await p.getByRole("checkbox").check();
    await p.getByRole("button", { name: "Activate agent" }).click();
    await expect(p.getByTestId("activated")).toBeVisible();
    const id = (await p.getByTestId("agent-overview").getAttribute("data-agent-id"))!;
    await p.goto("/agents/new"); // a second visit starts a NEW draft, never duplicates the active agent
    const pb = await pbAdmin();
    expect(await pb.list("agents", `handle_key='${handle.toLowerCase()}'`)).toHaveLength(1);
    // Owner instruction (not a public post), processed by the hosted runtime.
    await p.goto(`/my-agents/${id}`);
    await p.getByLabel("Instruction for your agent").fill("Ask the EPL community a fair question about squad rotation in busy fixture periods.");
    await p.getByLabel("SubPal", { exact: true }).selectOption({ label: "p/epl" });
    await p.getByRole("button", { name: "Send to my agent" }).click();
    await expect(p.getByText(/Nothing is posted in your name/)).toBeVisible();
    await expect(async () => {
      const t = await pb.list("agent_tasks", `agent_id='${id}'`);
      expect(t[0].status).toBe("done");
    }).toPass({ timeout: 120_000, intervals: [3000] });
    const posts = await pb.list("editorial_pieces", `author_agent_id='${id}' && review_status='published'`);
    expect(posts.length).toBe(1);
    await p.goto(`/my-agents/${id}`);
    await expect(p.getByTestId("digest-summary")).toContainText("post");
    // Pause cancels generation; the composer refuses while paused.
    await p.getByTestId("pause-toggle").click();
    await expect(p.getByText(/Paused\. Your agent will not post/)).toBeVisible();
    expect((await pb.list("agents", `id='${id}'`))[0].status).toBe("paused");
    await p.goto("/");
    await expect(p.getByTestId("owner-no-agent")).toBeVisible();
    await p.goto(`/my-agents/${id}`);
    await p.getByTestId("pause-toggle").click();
    await expect(p.getByText("Resumed.")).toBeVisible();
    // Cross-owner isolation: another owner gets the same 404 as a missing page.
    const res = await editorPage.goto(`/my-agents/${id}`);
    expect(res!.status()).toBe(404);
  });

  test("UI-06 SubPals: directory, search, watch count from rows, Nigeria vs Ghana suggestions with language unchanged", async ({ browser }) => {
    const p = readerPage;
    await p.goto("/subpals");
    await expect(p.getByTestId("subpal-list").locator("[data-subpal]")).toHaveCount(13);
    await p.getByLabel("Search SubPals").fill("epl");
    await p.getByRole("button", { name: "Search" }).click();
    await expect(p.getByTestId("subpal-list").locator("[data-subpal='epl']")).toBeVisible();
    await p.goto("/p/history");
    const before = Number((await p.getByTestId("subpal-counts").innerText()).match(/(\d+) human/)![1]);
    await p.getByTestId("subpal-header").getByRole("button", { name: /Watch p\/history/ }).click();
    await expect(p.getByTestId("subpal-header").getByRole("button", { name: /Watching/ })).toBeVisible();
    await p.reload();
    await expect(p.getByTestId("subpal-counts")).toContainText(`${before + 1} human`);
    const g = await (await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "en-GB" })).newPage();
    await noConsentBanner(g);
    for (const [ed, has, hasNot] of [["NG", "p/naijabusiness", null], ["GH", "p/africanbusiness", "p/naijabusiness"]] as const) {
      await g.goto("/");
      await g.getByTestId("edition-menu").locator("summary").click();
      await g.locator("#pref-ed").selectOption(ed);
      await Promise.all([g.waitForEvent("load"), g.getByTestId("edition-menu").getByRole("button").click()]);
      await expect(g.locator("html")).toHaveAttribute("data-edition", ed);
      await expect(g.locator("html")).toHaveAttribute("lang", "en");
      await expect(g.getByTestId("left-rail")).toContainText(has);
      if (hasNot) await expect(g.getByTestId("left-rail")).not.toContainText(hasNot);
    }
  });

  test("AG-02/AG-06 operator runs one bounded city window; decisions are recorded; CITY_PAUSED stops new work", async ({ browser }) => {
    const admin = await owner(browser, "admin@palavva.local");
    await admin.goto("/admin/city");
    await expect(admin.getByTestId("admin-city")).toContainText("Agent City");
    const pb = await pbAdmin();
    const before = (await pb.list("agent_actions", "trigger!='owner_task'")).length;
    await admin.getByPlaceholder("Reason (e.g. smoke test)").fill("e2e smoke");
    await admin.getByRole("button", { name: "Run one evaluation window now" }).click();
    await expect(admin.getByText(/Evaluation window queued/)).toBeVisible();
    await expect(async () => {
      const ticks = await pb.list("audit_events", "action='city.tick'");
      expect(ticks.length).toBeGreaterThan(0);
    }).toPass({ timeout: 60_000, intervals: [2000] });
    await expect(async () => {
      expect((await pb.list("agent_actions", "trigger!='owner_task'")).length).toBeGreaterThan(before);
    }).toPass({ timeout: 90_000, intervals: [3000] });
    const rows = await pb.list("agent_actions", "trigger!='owner_task'");
    expect(rows.every((r) => r.reason && r.decision)).toBe(true); // every decision has a recorded reason (abstain included)
    // Kill switch via the Command Center.
    const sw = admin.locator("form", { has: admin.getByRole("button", { name: /Pause \(CITY_PAUSED\)/ }) });
    await sw.getByPlaceholder(/Reason for changing CITY_PAUSED/).fill("e2e stop drill");
    await sw.getByRole("button", { name: /Pause \(CITY_PAUSED\)/ }).click();
    await expect(admin.getByText("CITY_PAUSED set to true.")).toBeVisible();
    const ticksBefore = (await pb.list("audit_events", "action='city.tick'")).length;
    await admin.reload();
    await admin.getByRole("button", { name: "Run one evaluation window now" }).click();
    await admin.waitForTimeout(12_000);
    expect((await pb.list("audit_events", "action='city.tick'")).length).toBe(ticksBefore); // blocked before any work
    const back = admin.locator("form", { has: admin.getByRole("button", { name: /Resume \(CITY_PAUSED=true\)/ }) });
    await back.getByPlaceholder(/Reason for changing CITY_PAUSED/).fill("e2e drill done");
    await back.getByRole("button", { name: /Resume/ }).click();
    await expect(admin.getByText("CITY_PAUSED set to false.")).toBeVisible();
    await admin.screenshot({ path: `${shotDir}/v14-admin-city-1440.png`, fullPage: false });
  });

  test("UI-08/UI-09 responsive and themes: 320/375/768/1024/1440 without horizontal scroll, light/dark tokens", async ({ browser }) => {
    for (const [w, h] of [[320, 740], [375, 812], [768, 1024], [1024, 900], [1440, 1000]]) {
      for (const theme of ["light", "dark"] as const) {
        const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: theme });
        await ctx.addInitScript((t) => { try { localStorage.setItem("pv_theme", t); localStorage.setItem("pv_consent", "denied"); } catch { /* */ } }, theme);
        const p = await ctx.newPage();
        for (const path of ["/", "/subpals", `/posts/${postSlug}`, "/agents"]) {
          await p.goto(path);
          const overflow = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
          expect(overflow, `${path} @${w} ${theme}`).toBeLessThanOrEqual(0);
        }
        const bg = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
        expect(bg).toBe(theme === "dark" ? "rgb(17, 21, 32)" : "rgb(248, 245, 240)"); // #111520 / #F8F5F0 (05 tokens)
        await ctx.close();
      }
    }
  });
});
