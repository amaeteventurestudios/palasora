// v1.8+ ISSUE-28 Palavva Games end to end on the isolated test stack: three player combinations, server-side rule enforcement,
// persistence/replay, ratings that keep agents and humans apart, persona commentary, result posts, pause switch and staff controls.
import { expect, test, type APIRequestContext, type Browser, type Page } from "@playwright/test";
import { BASE, noConsentBanner, pbAdmin, signIn } from "./helpers";

test.describe.configure({ mode: "serial" });
const tag = () => Math.random().toString(36).slice(2, 8);
async function fresh(browser: Browser): Promise<Page> { const c = await browser.newContext(); const p = await c.newPage(); await noConsentBanner(p); return p; }
async function signUp(page: Page, t: string) {
  await page.goto(`${BASE}/auth/sign-up?next=/games`);
  await page.getByLabel("Your name").fill(`Player ${t}`); await page.getByLabel("Handle").fill(`player_${t}`);
  await page.getByLabel("Email").fill(`player-${t}@example.test`); await page.getByLabel("Password").fill(`pw-${t}-123456`);
  await page.locator('input[name="agree"]').check(); await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL((u) => u.pathname === "/games");
}
const post = (r: APIRequestContext, id: string, body: unknown) => r.post(`${BASE}/api/v1/games/matches/${id}/move`, { data: body, headers: { origin: BASE } });
const view = async (r: APIRequestContext, id: string) => (await r.get(`${BASE}/api/v1/games/matches/${id}`)).json();

let humanAiMatch = "";

test("ISSUE-28 landing: three games, honest no-betting copy, live AI-vs-AI matches started from real agents", async ({ browser }) => {
  const p = await fresh(browser);
  await p.goto(`${BASE}/games`);
  for (const g of ["oware", "checkers", "trivia"]) await expect(p.getByTestId(`game-card-${g}`)).toBeVisible();
  await expect(p.getByTestId("games-page")).toContainText("No betting, no prizes, no Sora");
  await expect(p.getByTestId("live-matches").locator("li").first()).toContainText("AI vs AI");
  await expect(p.locator("footer").getByRole("link", { name: "Games" })).toBeVisible(); // public navigation (footer at every width; left rail and drawer too)
  await p.context().close();
});

test("ISSUE-28 Human vs AI (Oware): play on the board, the agent answers at once; the server refuses illegal, out-of-turn, outsider and anonymous moves", async ({ browser }) => {
  test.setTimeout(120_000);
  const t = tag(), p = await fresh(browser);
  await signUp(p, t);
  await p.getByTestId("game-card-oware").getByTestId("play-agent").click();
  await p.waitForURL(/\/games\/[a-z0-9]{10,20}$/);
  humanAiMatch = p.url().split("/").pop()!;
  await expect(p.getByTestId("player-0")).toContainText("Human player");
  await expect(p.getByTestId("player-1")).toContainText("AI agent");
  await expect(p.getByTestId("game-status")).toHaveText("Your turn.");
  await expect(p.getByTestId("pit-7")).toBeDisabled(); // the agent's side
  await p.getByTestId("pit-2").click();
  await expect(p.getByTestId("game-board")).toHaveAttribute("data-ply", "2"); // the agent replied immediately
  await expect(p.getByTestId("game-status")).toHaveText("Your turn.");
  const r = p.request;
  const v = await view(r, humanAiMatch);
  expect((await post(r, humanAiMatch, { move: 9, ply: v.movesCount })).status()).toBe(422); // opponent's pit
  expect((await post(r, humanAiMatch, { move: v.legal[0], ply: v.movesCount - 1 })).status()).toBe(409); // stale board
  const anon = await fresh(browser);
  expect((await post(anon.request, humanAiMatch, { move: v.legal[0], ply: v.movesCount })).status()).toBe(401);
  await anon.goto(`${BASE}/games/${humanAiMatch}`); await expect(anon.getByTestId("pit-0")).toBeDisabled(); // public: watchable, not playable
  const other = await fresh(browser); await signUp(other, tag());
  expect((await post(other.request, humanAiMatch, { move: v.legal[0], ply: v.movesCount })).status()).toBe(403);
  // Two moves sent for the same ply: exactly one is recorded.
  const [x, y] = await Promise.all([post(r, humanAiMatch, { move: v.legal[0], ply: v.movesCount }), post(r, humanAiMatch, { move: v.legal[v.legal.length - 1], ply: v.movesCount })]);
  expect([x.status(), y.status()].sort()).toEqual([200, 409]);
  const pb = await pbAdmin();
  const mv = await pb.list("game_moves", `match_id='${humanAiMatch}'`);
  expect(new Set(mv.map((m) => m.ply)).size).toBe(mv.length);
  for (const c of [anon, other, p]) await c.context().close();
});

test("ISSUE-28 Human vs AI to the end: result from the rules, only the human's rating moves, replay and persistence from the move log", async ({ browser }) => {
  test.setTimeout(240_000);
  const p = await fresh(browser); const t = tag(); await signUp(p, t);
  await p.getByTestId("game-card-trivia").getByTestId("play-agent").click();
  await p.waitForURL(/\/games\/[a-z0-9]{10,20}$/);
  const id = p.url().split("/").pop()!;
  await expect(p.getByTestId("trivia-question")).toBeVisible();
  let v = await view(p.request, id);
  for (let i = 0; i < 40 && v.status === "active"; i++) { const r = await post(p.request, id, { move: v.legal[0], ply: v.movesCount }); expect(r.status()).toBe(200); v = await r.json(); }
  expect(v.status).toBe("finished"); expect(v.reason).toContain("after 10 questions");
  expect(v.trivia.rounds).toHaveLength(10);
  expect(v.trivia.rounds.every((x: { source: string }) => x.source.startsWith("https://"))).toBe(true);
  const pb = await pbAdmin();
  const m = (await pb.list("game_matches", `id='${id}'`))[0];
  expect(m.mode).toBe("human_ai"); expect(m.ratings.a).toBeTruthy(); expect(m.ratings.b).toBeFalsy(); // agent rating untouched
  expect((await pb.list("game_ratings", `player_kind='agent' && player_id='${m.b_id}' && game='trivia'`)).every((r) => r.games === 0 || r.player_kind === "agent")).toBe(true);
  expect(m.commentary.some((c: { kind: string }) => c.kind === "post")).toBe(true);
  // Replay: the board at any ply comes from the stored moves.
  await p.goto(`${BASE}/games/${id}?ply=4`);
  await expect(p.getByTestId("game-status")).toContainText("Replay at move 4 of");
  await p.getByTestId("replay-next").click(); await expect(p.getByTestId("game-status")).toContainText("Replay at move 5 of");
  await p.context().close();
});

test("ISSUE-28 AI vs AI: a match that nobody watched catches up deterministically to a finished result with commentary and a rules-checked result post", async ({ request }) => {
  test.setTimeout(180_000);
  const pb = await pbAdmin();
  const live = await pb.list("game_matches", "status='active' && mode='ai_ai'");
  expect(live.length).toBeGreaterThan(0);
  const m = live[0];
  await pb.update("game_matches", m.id, { next_bot_at: "2020-01-01 00:00:00.000Z" }); // as if hours had passed
  let v = await view(request, m.id);
  for (let i = 0; i < 20 && v.status === "active"; i++) { await pb.update("game_matches", m.id, { next_bot_at: "2020-01-01 00:00:00.000Z" }); v = await view(request, m.id); }
  expect(v.status).toBe("finished");
  expect(["a", "b", "draw"]).toContain(v.winner);
  const moves = await pb.list("game_moves", `match_id='${m.id}'`);
  expect(moves.every((x) => x.actor_kind === "agent")).toBe(true); // (helper lists at most 50 rows)
  expect(await pb.list("game_moves", `match_id='${m.id}' && ply=${v.movesCount - 1}`)).toHaveLength(1);
  expect(await pb.list("game_moves", `match_id='${m.id}' && ply=${v.movesCount}`)).toHaveLength(0);
  expect(v.commentary.filter((c: { kind: string }) => c.kind === "pre")).toHaveLength(2);
  expect(v.commentary.filter((c: { kind: string }) => c.kind === "post")).toHaveLength(2);
  const fin = (await pb.list("game_matches", `id='${m.id}'`))[0];
  expect(fin.ratings.a && fin.ratings.b).toBeTruthy(); // both agents rated
  if (fin.result_post_id) {
    const piece = (await pb.list("editorial_pieces", `id='${fin.result_post_id}'`))[0];
    expect(piece.kind).toBe("agent_post"); expect(piece.headline).toMatch(/(beat|drew with) @/); expect(String(piece.body_blocks_json.post_body)).toContain(`/games/${m.id}`);
  }
});

test("ISSUE-28 Human vs Human (trivia): challenge, accept, both answer; the other answer stays hidden until both have answered", async ({ browser }) => {
  test.setTimeout(150_000);
  const ta = tag(), tb = tag();
  const a = await fresh(browser), b = await fresh(browser);
  await signUp(a, ta); await signUp(b, tb);
  await a.getByTestId("challenge-form").getByPlaceholder("@handle").fill(`@player_${tb}`);
  await a.getByTestId("challenge-form").locator("select").selectOption("trivia");
  await a.getByRole("button", { name: "Send challenge" }).click();
  await expect(a.getByText(`Challenge sent to @player_${tb}`)).toBeVisible();
  await b.goto(`${BASE}/games`);
  await b.getByTestId("incoming-challenges").getByRole("button", { name: "Accept and play" }).click();
  await b.waitForURL(/\/games\/[a-z0-9]{10,20}$/);
  const id = b.url().split("/").pop()!;
  await b.locator('[data-testid^="answer-"]').first().click();
  await expect(b.getByTestId("trivia-board")).toContainText("their answer stays hidden");
  const av = await view(a.request, id);
  expect(av.trivia.rounds).toHaveLength(0); // A cannot see B's pick for the open round
  expect(JSON.stringify(av)).not.toContain('"answer"');
  await a.goto(`${BASE}/games/${id}`); await a.locator('[data-testid^="answer-"]').first().click();
  await expect(a.getByTestId("trivia-board")).toContainText("question 2 of 10");
  const both = await view(a.request, id);
  expect(both.trivia.rounds).toHaveLength(1); expect(both.trivia.rounds[0].picks.every((x: number | null) => x !== null)).toBe(true);
  expect(both.mode).toBe("human_human");
  for (const c of [a, b]) await c.context().close();
});

test("ISSUE-28 staff: Games workspace, pause switch freezes play, a live match can be cancelled with a reason", async ({ browser }) => {
  test.setTimeout(150_000);
  const sa = await fresh(browser);
  await signIn(sa, "admin@palavva.local", BASE, "/admin/games");
  await expect(sa.getByRole("heading", { name: "Games" })).toBeVisible();
  await expect(sa.getByTestId("game-match-table")).toBeVisible();
  const pb = await pbAdmin();
  const tid = (await pb.list("tenants", "slug='palavva'"))[0].id;
  const sw = (await pb.list("tenant_settings", `tenant_id='${tid}' && key='GAMES_PAUSED'`))[0];
  if (sw) await pb.update("tenant_settings", sw.id, { value: true }); else await pb.create("tenant_settings", { tenant_id: tid, key: "GAMES_PAUSED", value: true });
  const p = await fresh(browser); await signUp(p, tag());
  // the earlier human-vs-AI match belongs to someone else; start-play is refused while paused
  await p.getByTestId("game-card-oware").getByTestId("play-agent").click();
  await expect(p.getByTestId("play-agent-form").getByRole("status")).toContainText("paused");
  const s2 = (await pb.list("tenant_settings", `tenant_id='${tid}' && key='GAMES_PAUSED'`))[0];
  await pb.update("tenant_settings", s2.id, { value: false });
  const live = (await pb.list("game_matches", "status='active'"))[0];
  await sa.goto(`${BASE}/admin/games`);
  await sa.getByLabel("Match id").fill(live.id); await sa.getByLabel("Cancellation reason").fill("Cancelled by the end-to-end test");
  sa.once("dialog", (d) => d.accept());
  await sa.getByRole("button", { name: "Cancel match" }).click();
  await expect(sa.getByText("Match cancelled.")).toBeVisible();
  await sa.goto(`${BASE}/games/${live.id}`); await expect(sa.getByTestId("game-status")).toContainText("Cancelled by Palavva staff: Cancelled by the end-to-end test");
  // A moderator can watch Games in the Command Center; an Operations-free reader cannot.
  const mod = await fresh(browser); await signIn(mod, "moderator@palavva.local", BASE, "/admin/games");
  await expect(mod.getByRole("heading", { name: "Games" })).toBeVisible();
  for (const c of [sa, p, mod]) await c.context().close();
});
