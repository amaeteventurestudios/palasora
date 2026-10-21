// Palasora Phase 1 acceptance (architecture doc 06, sections 5 and 17): people post, reply and vote in their own name (the
// observer rule is gone), agents stay labelled and answer people, and news is hidden from every public surface.
// Runs on the isolated test stack. People are created fresh per test (always younger than 24 hours, so the stricter
// new-account limits apply: 1 post per 10 minutes, no links).
import { expect, test, type Browser, type Page } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { BASE, PASSWORD, noConsentBanner, pbAdmin, signIn } from "./helpers";

const envText = readFileSync(path.resolve(__dirname, "../../../../.env.test"), "utf8");
const TOKEN = /^EDITORIAL_SERVICE_TOKEN=(.*)$/m.exec(envText)![1].trim();
const EVIDENCE = path.resolve(__dirname, "../../../../docs/evidence/phase-1");
mkdirSync(EVIDENCE, { recursive: true });
const run = Date.now().toString(36);
let n = 0;

async function person(name: string): Promise<{ id: string; email: string; handle: string }> {
  const pb = await pbAdmin();
  const t = (await pb.list("tenants", "slug='palavva'"))[0];
  const handle = `p1_${run}_${++n}`;
  const email = `${handle}@phase1.test`;
  const u = await pb.create("users", { tenant_id: t.id, email, password: PASSWORD, passwordConfirm: PASSWORD, handle, display_name: name, verified: true,
    account_status: "active", profile_kind: "human", locale: "en", emailVisibility: false });
  expect(u.id, JSON.stringify(u)).toBeTruthy();
  await pb.create("memberships", { tenant_id: t.id, user_id: u.id, role: "member", status: "active" }); // as sign-up does
  return { id: u.id, email, handle };
}
async function signedIn(browser: Browser, email: string, opts: Parameters<Browser["newContext"]>[0] = {}): Promise<Page> {
  const ctx = await browser.newContext(opts);
  const p = await ctx.newPage();
  await noConsentBanner(p);
  await signIn(p, email, BASE, "/");
  return p;
}
const api = (p: Page, route: string, data: unknown) => p.request.post(route, { data, headers: { origin: BASE } });
const agentReply = (agentId: string, pieceId: string, body: string, parentId = "") => fetch(`${BASE}/api/v1/agent/replies`, { method: "POST",
  headers: { "content-type": "application/json", "x-palavva-service-token": TOKEN, "x-palavva-agent-id": agentId, host: new URL(BASE).host },
  body: JSON.stringify({ piece_id: pieceId, parent_id: parentId, body, client_request_id: `p1-${run}-${pieceId}-${parentId}`, grounding: body }) });
async function anAgent(): Promise<Record<string, any>> {
  const pb = await pbAdmin();
  const rows = await pb.list("agents", "is_seed=true && hosting='palavva' && status='active'");
  return rows[Math.floor(Math.random() * rows.length)];
}

test.describe.configure({ mode: "serial" });

test("P1-01 a person posts from the feed composer, replies in a thread and votes; agents answer and keep their badge", async ({ browser }) => {
  const ada = await person("Ada Okafor");
  const page = await signedIn(browser, ada.email);
  await page.goto("/");
  await page.getByTestId("composer-open").click();
  await page.getByTestId("human-composer").getByLabel("SubPal").selectOption("everydayafrica");
  await page.getByTestId("human-composer").getByLabel("Title").fill(`Is the Lagos ferry worth it for a daily commute? (${run})`);
  await page.getByTestId("human-composer").getByLabel("Post", { exact: true }).fill("I am thinking of switching from the bus. People who ride the ferry every day: how reliable is it in the rainy season?");
  await page.getByTestId("composer-submit").click();
  await page.waitForURL(/\/posts\//);
  const slug = new URL(page.url()).pathname.split("/").pop()!;
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Lagos ferry");
  await expect(page.getByTestId("post-author")).toContainText("Ada Okafor");
  await expect(page.getByTestId("post-author").getByTestId("person-label")).toHaveText("Person");
  await expect(page.getByTestId("post-author").locator("[data-agent-badge], .label-ai")).toHaveCount(0); // a person is never labelled as an agent
  const pb = await pbAdmin();
  const post = (await pb.list("editorial_pieces", `slug='${slug}'`))[0];
  expect(post).toMatchObject({ kind: "human_post", author_type: "human", author_user_id: ada.id, review_status: "published", publish_path: "human", reviewer_id: "system:human-validator" });
  // an agent answers the person's post through the normal agent write path, and stays labelled
  const agent = await anAgent();
  const ar = await agentReply(agent.id, post.id, "From what riders describe, the ferry is quicker on dry days but the queue at the jetty is the real cost in the rains.");
  expect(ar.status, await ar.clone().text()).toBe(201);
  const agentReplyId = (await ar.json()).data.id;
  // another person replies to the agent, from the thread UI
  const bola = await person("Bola Mensah");
  const b = await signedIn(browser, bola.email);
  await b.goto(`/posts/${slug}`);
  const agentPost = b.getByTestId("agent-post").filter({ hasText: "queue at the jetty" });
  await expect(agentPost).toBeVisible();
  await expect(agentPost.locator("header")).toContainText(agent.display_name || agent.handle);
  await agentPost.getByTestId("reply-button").click();
  await b.getByTestId("inline-reply").getByRole("textbox").fill("I ride it on Mondays and Thursdays. The early boat is fine; after eight the queue doubles.");
  await b.getByTestId("inline-reply").getByRole("button", { name: "Post reply" }).click();
  const mine = b.getByTestId("human-post").filter({ hasText: "after eight the queue doubles" });
  await expect(mine).toBeVisible({ timeout: 15000 });
  await expect(mine.getByTestId("person-label")).toHaveText("Person");
  const reply = (await pb.list("comments", `piece_id='${post.id}' && author_kind='human'`))[0];
  expect(reply).toMatchObject({ author_id: bola.id, parent_id: agentReplyId, approval_state: "approved" });
  // votes: Bola up-votes Ada's post (score moves), Ada cannot vote on her own post, and votes on the agent reply
  const score = b.locator("header [data-score]").first();
  await b.locator("header").getByTestId("vote-up").first().click();
  await expect(score).toHaveAttribute("data-my-vote", "1");
  await expect(score).toHaveAttribute("data-score", "1");
  const own = await api(page, "/api/v1/votes", { target_kind: "piece", target_id: post.id, direction: 1 });
  expect(own.status()).toBe(403);
  expect((await own.json()).error.message).toMatch(/own post/);
  const onAgent = await api(page, "/api/v1/votes", { target_kind: "comment", target_id: agentReplyId, direction: 1 });
  expect(onAgent.status()).toBe(200);
  expect((await onAgent.json()).data).toMatchObject({ status: "recorded", direction: 1, up: 1 });
  expect((await pb.list("votes", `target_id='${post.id}'`)).map((v) => v.user_id)).toEqual([bola.id]);
  // evidence: the thread with a person's reply under a badged agent reply, desktop and phone
  await b.getByTestId("human-post").filter({ hasText: "after eight" }).scrollIntoViewIfNeeded();
  await b.setViewportSize({ width: 1280, height: 800 });
  await agentPost.scrollIntoViewIfNeeded();
  await b.screenshot({ path: path.join(EVIDENCE, "human-reply-with-agent-badge-1280.png") });
  const phone = await signedIn(browser, bola.email, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await phone.goto(`/posts/${slug}#post-${reply.id}`);
  await phone.getByTestId("agent-post").filter({ hasText: "queue at the jetty" }).scrollIntoViewIfNeeded();
  await phone.screenshot({ path: path.join(EVIDENCE, "human-reply-with-agent-badge-390.png") });
  for (const p of [page, b, phone]) await p.context().close();
});

test("P1-02 composer on phone and desktop (evidence), and the observer rule is gone from the API", async ({ browser }) => {
  const c = await person("Chidi Eze");
  const phone = await signedIn(browser, c.email, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await phone.goto("/p/football");
  await phone.getByTestId("composer-open").click();
  await expect(phone.getByTestId("human-composer").getByLabel("SubPal")).toHaveValue("football");
  await phone.getByTestId("human-composer").getByLabel("Title").fill("Why do promoted clubs keep a high line?");
  await phone.getByTestId("human-composer").getByLabel("Post", { exact: true }).fill("Every season a newly promoted side tries to press high and gets caught on the break. Is it pride, or does it work more than we think?");
  await phone.getByTestId("human-composer").scrollIntoViewIfNeeded();
  await phone.screenshot({ path: path.join(EVIDENCE, "human-creating-post-390.png") });
  await phone.getByTestId("composer-submit").tap();
  await phone.waitForURL(/\/posts\//);
  await expect(phone.getByTestId("post-author").getByTestId("person-label")).toBeVisible();
  const d = await person("Dami Bello");
  const desk = await signedIn(browser, d.email, { viewport: { width: 1280, height: 800 } });
  await desk.goto("/");
  await desk.getByTestId("composer-open").click();
  await desk.getByTestId("human-composer").getByLabel("Title").fill("What do you cook when the power is out all evening?");
  await desk.getByTestId("human-composer").getByLabel("Post", { exact: true }).fill("Gas is expensive and charcoal is smoky. What do you make that needs little fuel and still feeds a family?");
  await desk.getByTestId("human-composer").scrollIntoViewIfNeeded();
  await desk.screenshot({ path: path.join(EVIDENCE, "human-creating-post-1280.png") });
  // the v1.4 observer refusal no longer exists: a signed-in person's reply through the API is accepted (201)
  const pb = await pbAdmin();
  const target = (await pb.list("editorial_pieces", "kind='agent_post' && review_status='published' && post_label!='sourced_news'"))[0];
  const r = await api(desk, "/api/v1/comments", { piece_id: target.id, text: "A person replying through the API, which v1.4 refused." });
  expect(r.status(), await r.text()).toBe(201);
  expect(JSON.stringify(await r.json())).not.toMatch(/observe/i);
  for (const p of [phone, desk]) await p.context().close();
});

test("P1-03 abuse controls: moderation blocks a bad post, rate limits trigger, links wait 24 hours, suspended people are blocked", async ({ browser, request }) => {
  const e = await person("Efe Johnson");
  const p = await signedIn(browser, e.email);
  const pb = await pbAdmin();
  const count = async () => (await pb.list("editorial_pieces", `author_user_id='${e.id}'`)).length;
  // shared text rules: an insult is refused, nothing is stored
  const bad = await api(p, "/api/v1/posts", { subpal: "football", title: "Promoted clubs and their fans", body: "You idiot, anyone who supports a promoted club is stupid." });
  expect(bad.status()).toBe(422);
  expect((await bad.json()).error.message).toMatch(/community guidelines/);
  expect(await count()).toBe(0);
  // new accounts cannot post links
  const link = await api(p, "/api/v1/posts", { subpal: "football", title: "Promoted clubs: a match report to read", body: "Read this report https://example.org/report and tell me what you think." });
  expect(link.status()).toBe(422);
  expect((await link.json()).error.message).toMatch(/24 hours/);
  // first post is fine; the second within 10 minutes is over the new-account limit (429)
  const ok = await api(p, "/api/v1/posts", { subpal: "football", title: "Should promoted clubs sell their best player?", body: "A big offer arrives in the first window. Keep the player or invest the money in three squad players?" });
  expect(ok.status(), await ok.text()).toBe(201);
  const again = await api(p, "/api/v1/posts", { subpal: "football", title: "Should promoted clubs change the coach?", body: "If results are poor by Christmas, is a new coach ever the answer for a promoted side?" });
  expect(again.status()).toBe(429);
  expect((await again.json()).error.message).toMatch(/10 minutes|limit/i);
  expect(await count()).toBe(1);
  // duplicate replies are refused
  const id = (await ok.json()).data.id;
  const r1 = await api(p, "/api/v1/comments", { piece_id: id, text: "Keep the player for one season at least." });
  expect(r1.status()).toBe(201);
  const r2 = await api(p, "/api/v1/comments", { piece_id: id, text: "keep the player, for one season at least!" });
  expect(r2.status()).toBe(409);
  // anonymous and cross-origin writes are refused
  expect((await request.post("/api/v1/posts", { data: { subpal: "football", title: "x".repeat(10), body: "y".repeat(20) }, headers: { origin: BASE } })).status()).toBe(401);
  expect((await p.request.post("/api/v1/comments", { data: { piece_id: id, text: "hi there" }, headers: { origin: "https://evil.example" } })).status()).toBe(403);
  // a suspended person cannot post, reply or vote
  await pb.update("users", e.id, { account_status: "suspended" });
  const s1 = await api(p, "/api/v1/comments", { piece_id: id, text: "Writing while suspended should fail." });
  const s2 = await api(p, "/api/v1/votes", { target_kind: "piece", target_id: id, direction: 1 });
  expect([401, 403]).toContain(s1.status());
  expect([401, 403]).toContain(s2.status());
  expect((await pb.list("comments", `author_id='${e.id}'`)).length).toBe(1);
  await p.context().close();
});

test("P1-04 news is hidden from every public surface; agent originals and people's posts remain", async ({ page, request }) => {
  await noConsentBanner(page);
  const pb = await pbAdmin();
  const news = await pb.list("editorial_pieces", "review_status='published' && (kind='source_link' || kind='story' || kind='discussion' || kind='short' || post_label='sourced_news')");
  expect(news.length).toBeGreaterThan(0); // the archived news is still stored (nothing deleted)
  const original = (await pb.list("editorial_pieces", "review_status='published' && kind='agent_post' && post_label!='sourced_news'"))[0];
  const human = (await pb.list("editorial_pieces", "review_status='published' && kind='human_post'"))[0];
  // feed (every sort), Hot right now, SubPal and country pages carry no news card
  for (const p of ["/", "/feed/new", "/feed/top", "/feed/trending", "/explore", "/p/africanbusiness", "/country/nigeria", "/local-pulse"]) {
    const res = await page.goto(p);
    expect(res!.status(), p).toBe(200);
    for (const k of ["source_link", "story", "discussion", "short"]) await expect(page.locator(`[data-kind="${k}"]`), `${p} ${k}`).toHaveCount(0);
    for (const x of news.slice(0, 12)) await expect(page.locator(`a[href$="/${x.slug}"]`), `${p} links ${x.slug}`).toHaveCount(0);
  }
  await page.goto("/");
  await expect(page.locator('[data-card="post"]').first()).toBeVisible(); // the feed is not empty: agent originals and people's posts
  await expect(page.locator(`[data-piece-id="${original.id}"]`).or(page.locator(`[data-piece-id="${human.id}"]`)).first()).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.locator("#feed").scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(EVIDENCE, "feed-no-news-1280.png") });
  // story and discussion pages, the stories index and /md are gone (404)
  for (const x of news.slice(0, 6)) {
    const prefix = x.kind === "story" ? "/story/" : x.kind === "source_link" || x.kind === "agent_post" ? "/posts/" : "/discussion/";
    expect((await request.get(`${prefix}${x.slug}`)).status(), x.slug).toBe(404);
    expect((await request.get(`/md/${x.slug}`)).status(), `md ${x.slug}`).toBe(404);
    expect((await request.get(`/api/v1/stories/${x.slug}`)).status(), `api ${x.slug}`).toBe(404);
  }
  expect((await request.get("/stories")).status()).toBe(404);
  // search (page and API) never returns news
  for (const term of ["cold", "market", "Accra", "traders"]) {
    const j = await (await request.get(`/api/v1/search?q=${term}`)).json();
    const kinds = (j.data ?? []).map((x: { kind: string }) => x.kind);
    expect(kinds.filter((k: string) => ["source_link", "story", "discussion", "short"].includes(k)), term).toEqual([]);
  }
  // sitemap and llms files
  const sitemap = await (await request.get("/sitemap.xml")).text();
  for (const x of news) expect(sitemap, x.slug).not.toContain(`/${x.slug}<`);
  expect(sitemap).toContain(`/posts/${original.slug}`);
  const llms = await (await request.get("/llms.txt")).text();
  expect(llms).toMatch(/News is retired/);
  expect(llms).toMatch(/People post, reply and vote/);
  const full = await (await request.get("/llms-full.txt")).text();
  expect(full).not.toMatch(/\*\*Publishers\*\*/);
  // profiles: an agent profile lists no news post; a person's profile lists their post
  const newsAgentPost = news.find((x) => x.kind === "agent_post" || x.post_label === "sourced_news");
  if (newsAgentPost?.author_agent_id) {
    const a = (await pb.list("agents", `id='${newsAgentPost.author_agent_id}'`))[0];
    if (a) { await page.goto(`/agents/${a.handle}`); await expect(page.locator(`a[href$="/${newsAgentPost.slug}"]`)).toHaveCount(0); }
  }
  // (a person suspended by P1-03 has no public profile, so check a post whose author is active)
  let mine: Record<string, any> | undefined, author: Record<string, any> | undefined;
  for (const x of await pb.list("editorial_pieces", "review_status='published' && kind='human_post'")) {
    author = (await pb.list("users", `id='${x.author_user_id}' && account_status='active'`))[0];
    if (author) { mine = x; break; }
  }
  expect(mine, "a published post by an active person").toBeTruthy();
  await page.goto(`/profile/${author!.handle}`);
  await expect(page.getByTestId("profile-posts")).toContainText(mine!.headline);
  // phone evidence of the feed without news
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.locator("#feed").scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(EVIDENCE, "feed-no-news-390-viewport.png") });
});

test("P1-05 feed without news on a phone (isMobile, hasTouch)", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await noConsentBanner(page);
  await page.goto("/");
  await expect(page.locator('[data-card="post"]').first()).toBeVisible();
  for (const k of ["source_link", "story", "discussion", "short"]) await expect(page.locator(`[data-kind="${k}"]`)).toHaveCount(0);
  await page.locator("#feed").scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(EVIDENCE, "feed-no-news-390.png") });
  await ctx.close();
});
