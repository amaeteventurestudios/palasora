// ISSUE-28 server side of Palavva Games: matches, moves, challenges, agent turns, ratings, tournaments and result posts.
//
// * Deterministic and replayable: every move is appended to game_moves with a UNIQUE (match, ply) index, and the stored state is
//   always the result of applying those moves from the match's seed, so a restart loses nothing and a replay is exact.
// * No background daemon: agent turns are played "on the clock" when a match is read (page, poll or API). In AI vs AI matches each
//   agent ply is due AGENT_PACE_MS after the previous one, so spectators can watch; against a human the agent answers at once.
// * No model calls for moves. Commentary is template banter chosen by each agent's communication DNA and states only facts from the
//   committed match (score, opponent). No wagering, prizes or Pals anywhere.
// * Humans may play games; posting, replying and voting go through the people write service (lib/social/human.ts).
import { createHash, randomInt } from "node:crypto";
import { pb, pbDate, q, PBError, type Rec } from "../pb";
import { audit } from "../audit";
import { getSwitch } from "../settings";
import { editorialFetch } from "../editorial-client";
import type { Tenant } from "../tenant";
import { GAMES, ELO_START, RULESET, apply, banter, botMove, elo, initial, waitingOn, type AgentLike, type AnyState, type Dna, type GameKey, type Side } from "./engine";

export const AGENT_PACE_MS = 3_000;
export const LIMITS = { aiAiPerDay: 48, liveAiAiTarget: 2, resultPostsPerDay: 6, openChallengesPerUser: 10, agentGamesPerDay: 20, humanMovesPerMinute: 60 };
export type Player = { kind: "agent" | "human"; id: string; name: string; handle: string; href: string; label: string; country: string };

const hash = (s: unknown) => createHash("sha256").update(JSON.stringify(s)).digest("hex").slice(0, 32);
const startOfDay = () => `${new Date().toISOString().slice(0, 10)} 00:00:00.000Z`;
const sideKey = (s: Side) => (s === 0 ? "a" : "b");

export class GameError extends Error { constructor(public code: "NOT_FOUND" | "FORBIDDEN" | "ILLEGAL_MOVE" | "NOT_YOUR_TURN" | "CONFLICT" | "PAUSED" | "RATE_LIMITED" | "INVALID", msg: string) { super(msg); } }

// ---------------------------------------------------------------- personality (communication DNA from the editorial service)
const dnaCache = new Map<string, { at: number; d: Dna | null }>();
export async function dnaFor(t: Tenant, ids: string[]): Promise<Record<string, Dna | null>> {
  const out: Record<string, Dna | null> = {}, need: string[] = [];
  for (const id of ids) { const h = dnaCache.get(id); if (h && Date.now() - h.at < 600_000) out[id] = h.d; else need.push(id); }
  if (need.length) {
    const r = await editorialFetch<{ agents: Record<string, Dna> }>(`/voice/dna?tenant_id=${encodeURIComponent(t.id)}&ids=${need.join(",")}`, {}, 2500);
    for (const id of need) { const d = r?.agents?.[id] ?? null; out[id] = d; if (r) dnaCache.set(id, { at: Date.now(), d }); } // service down: neutral voice, not cached
  }
  return out;
}

// ---------------------------------------------------------------- players
export async function players(t: Tenant, m: Rec): Promise<[Player, Player]> {
  const one = async (kind: string, id: string): Promise<Player> => {
    if (kind === "agent") {
      const a = await pb.get("agents", id);
      return { kind: "agent", id, name: String(a?.display_name ?? "Unknown agent"), handle: String(a?.handle ?? ""), href: a ? `/agents/${a.handle}` : "#",
        label: a?.kind === "palavva_ai" ? "AI agent · run by Palavva" : a?.verification_level && a.verification_level !== "none" ? "AI agent · owner-verified" : "AI agent", country: String((a?.country_affinities as string[] | undefined)?.[0] ?? "") };
    }
    const u = await pb.get("users", id);
    return { kind: "human", id, name: String(u?.display_name ?? "A person"), handle: String(u?.handle ?? ""), href: u ? `/profile/${u.handle}` : "#", label: "Human player", country: String(u?.home_edition ?? "") };
  };
  return Promise.all([one(m.a_kind, m.a_id), one(m.b_kind, m.b_id)]) as Promise<[Player, Player]>;
}

/** Which side the signed-in person plays in this match, if any. */
export const humanSide = (m: Rec, userId: string | undefined): Side | null =>
  !userId ? null : m.a_kind === "human" && m.a_id === userId ? 0 : m.b_kind === "human" && m.b_id === userId ? 1 : null;

// ---------------------------------------------------------------- create
export async function createMatch(t: Tenant, o: { game: GameKey; a: { kind: "agent" | "human"; id: string }; b: { kind: "agent" | "human"; id: string }; by: string;
  rated?: boolean; isPublic?: boolean; tournamentId?: string; challengeId?: string; startAt?: Date }): Promise<Rec> {
  if (await getSwitch(t.id, "GAMES_PAUSED")) throw new GameError("PAUSED", "Games are paused by Palavva operators right now.");
  if (!GAMES[o.game]) throw new GameError("INVALID", "Unknown game");
  if (o.a.kind === o.b.kind && o.a.id === o.b.id) throw new GameError("INVALID", "A player cannot play itself");
  for (const p of [o.a, o.b]) if (p.kind === "agent") {
    const ag = await pb.get("agents", p.id);
    if (!ag || ag.tenant_id !== t.id || ag.status !== "active") throw new GameError("INVALID", "That agent is not available to play.");
    const today = await pb.count("game_matches", `tenant_id=${q(t.id)} && created >= ${q(startOfDay())} && ((a_kind='agent' && a_id=${q(p.id)}) || (b_kind='agent' && b_id=${q(p.id)}))`);
    if (today >= LIMITS.agentGamesPerDay) throw new GameError("RATE_LIMITED", `@${ag.handle} has played its ${LIMITS.agentGamesPerDay} games for today. Try another agent or come back tomorrow.`);
  }
  const mode = o.a.kind === "agent" && o.b.kind === "agent" ? "ai_ai" : o.a.kind === "human" && o.b.kind === "human" ? "human_human" : "human_ai";
  const seed = randomInt(1, 2 ** 31 - 1);
  const state = initial(o.game, seed);
  const start = o.startAt ?? new Date();
  const m = await pb.create("game_matches", { tenant_id: t.id, game: o.game, mode, status: "active", a_kind: o.a.kind, a_id: o.a.id, b_kind: o.b.kind, b_id: o.b.id, seed,
    ruleset: RULESET[o.game], state, moves_count: 0, winner: "", started_at: pbDate(start), last_move_at: pbDate(start), next_bot_at: pbDate(new Date(start.getTime() + (mode === "ai_ai" ? AGENT_PACE_MS : 0))),
    tournament_id: o.tournamentId ?? "", challenge_id: o.challengeId ?? "", rated: o.rated !== false, public: o.isPublic !== false, ratings: {}, commentary: [], created_by: o.by });
  // Opening lines from agent players (persona banter, no model call).
  const agentIds = [o.a, o.b].filter((p) => p.kind === "agent").map((p) => p.id);
  if (agentIds.length) {
    const [pa, pbb] = await players(t, m);
    const dna = await dnaFor(t, agentIds);
    const lines = ([[o.a, pbb], [o.b, pa]] as const).filter(([p]) => p.kind === "agent").map(([p, opp]) => ({ ply: 0, agent_id: p.id, kind: "pre",
      text: banter("pre", { id: p.id, handle: "" }, dna[p.id], opp.kind === "agent" ? `@${opp.handle}` : opp.name.split(" ")[0], "", m.id) }));
    await pb.update("game_matches", m.id, { commentary: lines });
  }
  await audit(t.id, o.by || "system", "game.match_created", "game_matches", m.id, { game: o.game, mode, a: `${o.a.kind}:${o.a.id}`, b: `${o.b.kind}:${o.b.id}` }, 0, o.by ? "user" : "system");
  return (await pb.get("game_matches", m.id))!;
}

// ---------------------------------------------------------------- moves
async function commit(t: Tenant, m: Rec, side: Side, actorKind: "agent" | "human", actorId: string, move: unknown): Promise<Rec> {
  const game = m.game as GameKey;
  const next = apply(game, m.state as AnyState, side, move); // throws ILLEGAL_MOVE / NOT_YOUR_TURN / GAME_OVER
  const ply = Number(m.moves_count ?? 0);
  try {
    await pb.create("game_moves", { tenant_id: t.id, match_id: m.id, ply, side, actor_kind: actorKind, actor_id: actorId, move, state_hash: hash(next) });
  } catch (e) {
    if (e instanceof PBError && e.status === 400) throw new GameError("CONFLICT", "That move was already played (another tab or a double click). The board has been refreshed.");
    throw e;
  }
  const now = new Date();
  const upd: Record<string, unknown> = { state: next, moves_count: ply + 1, last_move_at: pbDate(now) };
  // Virtual clock: each agent ply is due one pace after the previous one was due, so a match nobody watched catches up on its
  // schedule the next time it is read (instead of restarting the clock from "now").
  if (m.mode === "ai_ai") upd.next_bot_at = pbDate(new Date(new Date(String(m.next_bot_at).replace(" ", "T")).getTime() + AGENT_PACE_MS));
  const saved = await pb.update("game_matches", m.id, upd);
  return next.over ? finish(t, saved) : saved;
}

export async function humanMove(t: Tenant, matchId: string, userId: string, move: unknown, expectedPly: number): Promise<Rec> {
  if (await getSwitch(t.id, "GAMES_PAUSED")) throw new GameError("PAUSED", "Games are paused by Palavva operators right now. Your match is saved.");
  const m = await pb.first("game_matches", `tenant_id=${q(t.id)} && id=${q(matchId)}`);
  if (!m) throw new GameError("NOT_FOUND", "Match not found");
  if (m.status !== "active") throw new GameError("CONFLICT", "This match is over.");
  const side = humanSide(m, userId);
  if (side === null) throw new GameError("FORBIDDEN", "You are not a player in this match. Watching is fine; playing is for the two players.");
  if (Number(m.moves_count) !== expectedPly) throw new GameError("CONFLICT", "The board changed since you looked. It has been refreshed.");
  if (!waitingOn(m.game as GameKey, m.state as AnyState).includes(side)) throw new GameError("NOT_YOUR_TURN", "It is not your turn.");
  let saved: Rec;
  try { saved = await commit(t, m, side, "human", userId, move); }
  catch (e) { if (e instanceof Error && ["ILLEGAL_MOVE", "NOT_YOUR_TURN", "GAME_OVER"].includes(e.message)) throw new GameError(e.message === "NOT_YOUR_TURN" ? "NOT_YOUR_TURN" : "ILLEGAL_MOVE", e.message === "ILLEGAL_MOVE" ? "That move is not allowed by the rules." : "That move cannot be played now."); throw e; }
  return advance(t, saved);
}

/** Plays every agent turn that is due. AI vs AI: one ply per AGENT_PACE_MS of real time (catching up if nobody watched). Against a
 *  human: the agent answers immediately. Bounded per call so a request never runs long. */
export async function advance(t: Tenant, m: Rec, budget = 400): Promise<Rec> {
  if (m.status !== "active" || (await getSwitch(t.id, "GAMES_PAUSED"))) return m;
  const game = m.game as GameKey;
  let cur = m, steps = 0;
  const agents: Record<string, AgentLike> = {};
  for (const [k, id] of [[m.a_kind, m.a_id], [m.b_kind, m.b_id]]) if (k === "agent") { const a = await pb.get("agents", id); if (a) agents[id] = a as unknown as AgentLike; }
  const dna = await dnaFor(t, Object.keys(agents));
  while (cur.status === "active" && steps < budget) {
    const due = cur.mode !== "ai_ai" || new Date(String(cur.next_bot_at).replace(" ", "T")).getTime() <= Date.now();
    if (!due) break;
    const sides = waitingOn(game, cur.state as AnyState).filter((s) => (s === 0 ? cur.a_kind : cur.b_kind) === "agent");
    if (!sides.length) break;
    const side = sides[0], id = side === 0 ? cur.a_id : cur.b_id;
    const mv = botMove(game, cur.state as AnyState, side, agents[id] ?? { id, handle: "" }, dna[id] ?? null);
    try { cur = await commit(t, cur, side, "agent", id, mv); }
    catch (e) { if (e instanceof GameError && e.code === "CONFLICT") { cur = (await pb.get("game_matches", cur.id))!; continue; } throw e; }
    steps++;
  }
  return cur;
}

// ---------------------------------------------------------------- finish: ratings, banter, tournament, result post
async function rating(t: Tenant, game: string, kind: string, id: string): Promise<Rec> {
  const r = await pb.first("game_ratings", `tenant_id=${q(t.id)} && game=${q(game)} && player_kind=${q(kind)} && player_id=${q(id)}`);
  if (r) return r;
  try { return await pb.create("game_ratings", { tenant_id: t.id, game, player_kind: kind, player_id: id, rating: ELO_START, games: 0, wins: 0, losses: 0, draws: 0, country: "" }); }
  catch { return (await pb.first("game_ratings", `tenant_id=${q(t.id)} && game=${q(game)} && player_kind=${q(kind)} && player_id=${q(id)}`))!; }
}

async function finish(t: Tenant, m: Rec): Promise<Rec> {
  const s = m.state as AnyState;
  const winner = s.winner === 0 ? "a" : s.winner === 1 ? "b" : "draw";
  // Only the commit that wrote the final ply reaches here (UNIQUE match_id+ply), so ratings are applied exactly once.
  const claimed = await pb.update("game_matches", m.id, { status: "finished", winner, result_reason: s.reason.slice(0, 300), finished_at: pbDate() }).catch(() => null);
  if (!claimed) return m;
  const [pa, pbp] = await players(t, m);
  const score = scoreLine(m.game as GameKey, s);
  const commentary = Array.isArray(m.commentary) ? [...m.commentary] : [];
  const ratings: Record<string, unknown> = {};
  // Agents and humans have separate leaderboards. Same-kind matches update both players. In a human-vs-agent match only the human's
  // rating moves (the agent's rating is used as the opponent's strength), so people cannot farm or sink an agent's ranking.
  if (m.rated) {
    const [ra, rb] = await Promise.all([rating(t, m.game, m.a_kind, m.a_id), rating(t, m.game, m.b_kind, m.b_id)]);
    const sa = winner === "a" ? 1 : winner === "draw" ? 0.5 : 0;
    const [na, nb] = elo(ra.rating, rb.rating, sa as 1 | 0.5 | 0, [ra.games, rb.games]);
    const mixed = m.a_kind !== m.b_kind;
    const bump = (r: Rec, next: number, won: number, country: string) => pb.update("game_ratings", r.id, { rating: next, games: r.games + 1, wins: r.wins + (won === 1 ? 1 : 0),
      losses: r.losses + (won === 0 ? 1 : 0), draws: r.draws + (won === 0.5 ? 1 : 0), country: country.slice(0, 3) });
    if (!mixed || m.a_kind === "human") { await bump(ra, na, sa, pa.country); ratings.a = { before: ra.rating, after: na }; }
    if (!mixed || m.b_kind === "human") { await bump(rb, nb, 1 - sa, pbp.country); ratings.b = { before: rb.rating, after: nb }; }
  }
  const agentIds = [pa, pbp].filter((p) => p.kind === "agent").map((p) => p.id);
  const dna = await dnaFor(t, agentIds);
  for (const [me, opp, side] of [[pa, pbp, "a"], [pbp, pa, "b"]] as const) if (me.kind === "agent") {
    const kind = winner === "draw" ? "draw" : winner === side ? "win" : "lose";
    commentary.push({ ply: s.ply, agent_id: me.id, kind: "post", text: banter(kind, { id: me.id, handle: me.handle }, dna[me.id], opp.kind === "agent" ? `@${opp.handle}` : opp.name.split(" ")[0], score, m.id) });
  }
  let saved = await pb.update("game_matches", m.id, { ratings, commentary });
  if (m.tournament_id) await updateStandings(t, m.tournament_id);
  if (m.mode === "ai_ai" && m.public) { const postId = await resultPost(t, saved, pa, pbp, score).catch(() => ""); if (postId) saved = await pb.update("game_matches", m.id, { result_post_id: postId }); }
  await audit(t.id, "system", "game.match_finished", "game_matches", m.id, { game: m.game, winner, reason: s.reason, rated: !!Object.keys(ratings).length }, 0, "system");
  return saved;
}

export function scoreLine(game: GameKey, s: AnyState): string {
  if (game === "oware") { const st = (s as unknown as { store: number[] }).store; return `${st[0]}–${st[1]} seeds`; }
  if (game === "trivia") { const sc = (s as unknown as { score: number[] }).score; return `${sc[0]}–${sc[1]}`; }
  const b = (s as unknown as { board: number[] }).board;
  return `${b.filter((v) => v > 0).length}–${b.filter((v) => v < 0).length} pieces left`;
}

/** An AI vs AI result becomes a short feed post by the winner (or player A on a draw) in the Palavva Games SubPal, through the
 *  normal agent publishing rules. Facts come only from the committed match; at most LIMITS.resultPostsPerDay per day. */
async function resultPost(t: Tenant, m: Rec, pa: Player, pbp: Player, score: string): Promise<string> {
  const today = await pb.count("game_matches", `tenant_id=${q(t.id)} && result_post_id!='' && finished_at >= ${q(startOfDay())}`);
  if (today >= LIMITS.resultPostsPerDay) return "";
  const [author, other] = m.winner === "b" ? [pbp, pa] : [pa, pbp];
  const agent = await pb.get("agents", author.id);
  if (!agent) return "";
  const sp = await gamesSubpal(t);
  const { publishPost } = await import("../social/write");
  const g = GAMES[m.game as GameKey];
  const verb = m.winner === "draw" ? `drew with @${other.handle}` : `beat @${other.handle}`;
  const r = await publishPost(t, { agent, via: "service", key: null, scopes: ["posts:write"], origin: "games" }, {
    subpal_id: sp.id, title: `${g.short}: I ${verb} (${score})`.slice(0, 160),
    body: `${g.name} result: ${m.winner === "draw" ? "a draw" : `a win over @${other.handle}`}, ${score}. ${String(m.result_reason)}. Full replay: /games/${m.id}`,
    label: "community_discussion", client_request_id: `game:${m.id}`, trigger: "game_result",
    grounding: `${g.name} match ${m.id}: ${pa.handle} vs ${pbp.handle}. Result ${m.winner}. ${score}. ${m.result_reason}.` });
  return r.status === "published" ? r.id : "";
}
async function gamesSubpal(t: Tenant): Promise<Rec> {
  const sp = await pb.first("communities", `tenant_id=${q(t.id)} && slug='games'`);
  if (sp) return sp;
  return pb.create("communities", { tenant_id: t.id, slug: "games", name: "Palavva Games", summary: "Agents talk about their real Oware, checkers and trivia matches. Every result links to its replay.",
    country_codes: [], topic_slugs: [], moderation_rules: "Talk about the game, not the person. Results come from the match record, never from memory.", status: "published", kind: "", icon: "", sort: 0 });
}

// ---------------------------------------------------------------- reads used by pages and the poll API
export async function getMatch(t: Tenant, id: string, opts: { advance?: boolean } = {}): Promise<Rec | null> {
  if (!/^[a-z0-9]{10,20}$/.test(id)) return null;
  const m = await pb.first("game_matches", `tenant_id=${q(t.id)} && id=${q(id)}`);
  return m && opts.advance !== false ? advance(t, m, 60) : m;
}
export async function moves(t: Tenant, matchId: string): Promise<Rec[]> {
  return pb.list("game_moves", { filter: `tenant_id=${q(t.id)} && match_id=${q(matchId)}`, sort: "ply", perPage: 500 });
}

/** `n` distinct active Palavva-run agents picked at random (page bounded by the real count). */
export async function randomAgents(t: Tenant, n: number): Promise<Rec[]> {
  const F = `tenant_id=${q(t.id)} && status='active' && kind='palavva_ai'`;
  const total = await pb.count("agents", F);
  if (total < n) return [];
  return pb.list("agents", { filter: F, perPage: n, page: 1 + randomInt(0, Math.max(1, Math.floor(total / n))), fields: "id,handle" });
}

/** Keeps a couple of AI vs AI matches live (bounded per day) so there is always something real to watch. Called by the Games page. */
export async function ensureLiveAiMatches(t: Tenant): Promise<void> {
  if (await getSwitch(t.id, "GAMES_PAUSED")) return;
  const live = await pb.list("game_matches", { filter: `tenant_id=${q(t.id)} && status='active' && mode='ai_ai'`, perPage: 20 });
  for (const m of live) await advance(t, m, 400);
  const still = live.length ? (await pb.count("game_matches", `tenant_id=${q(t.id)} && status='active' && mode='ai_ai'`)) : 0;
  const today = await pb.count("game_matches", `tenant_id=${q(t.id)} && mode='ai_ai' && created >= ${q(startOfDay())} && tournament_id=''`);
  for (let i = still; i < LIMITS.liveAiAiTarget && today + (i - still) < LIMITS.aiAiPerDay; i++) {
    const pool = await randomAgents(t, 2);
    if (pool.length < 2) return;
    const game = (["oware", "checkers", "trivia"] as GameKey[])[randomInt(0, 3)];
    await createMatch(t, { game, a: { kind: "agent", id: pool[0].id }, b: { kind: "agent", id: pool[1].id }, by: "" }).catch(() => null);
  }
}

// ---------------------------------------------------------------- tournaments (round robin)
export async function createTournament(t: Tenant, o: { name: string; game: GameKey; agentIds: string[]; by: string }): Promise<Rec> {
  const ids = [...new Set(o.agentIds)].slice(0, 6);
  if (ids.length < 3) throw new GameError("INVALID", "A round robin needs 3 to 6 agents.");
  const tour = await pb.create("game_tournaments", { tenant_id: t.id, name: o.name.slice(0, 120), game: o.game, status: "running", format: "round_robin", participants: ids, standings: [], created_by: o.by });
  let k = 0;
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++)
    await createMatch(t, { game: o.game, a: { kind: "agent", id: ids[(i + j) % 2 ? i : j] }, b: { kind: "agent", id: ids[(i + j) % 2 ? j : i] }, by: o.by, tournamentId: tour.id, startAt: new Date(Date.now() + k++ * 20_000) });
  await audit(t.id, o.by, "game.tournament_created", "game_tournaments", tour.id, { game: o.game, players: ids.length });
  return tour;
}
export async function updateStandings(t: Tenant, tournamentId: string): Promise<void> {
  const tour = await pb.get("game_tournaments", tournamentId);
  if (!tour) return;
  const ms = await pb.list("game_matches", { filter: `tenant_id=${q(t.id)} && tournament_id=${q(tournamentId)}`, perPage: 100 });
  const pts: Record<string, { id: string; played: number; points: number; wins: number; draws: number; losses: number }> = {};
  for (const id of tour.participants as string[]) pts[id] = { id, played: 0, points: 0, wins: 0, draws: 0, losses: 0 };
  for (const m of ms.filter((x) => x.status === "finished")) {
    const a = pts[m.a_id], b = pts[m.b_id]; if (!a || !b) continue;
    a.played++; b.played++;
    if (m.winner === "a") { a.points += 2; a.wins++; b.losses++; } else if (m.winner === "b") { b.points += 2; b.wins++; a.losses++; } else { a.points++; b.points++; a.draws++; b.draws++; }
  }
  const standings = Object.values(pts).sort((x, y) => y.points - x.points || y.wins - x.wins);
  const done = ms.length > 0 && ms.every((x) => x.status === "finished" || x.status === "cancelled");
  await pb.update("game_tournaments", tournamentId, { standings, ...(done ? { status: "finished", finished_at: pbDate() } : {}) });
}

// ---------------------------------------------------------------- challenges
export async function challenge(t: Tenant, from: { kind: "human"; id: string }, to: { kind: "agent" | "human"; id: string }, game: GameKey, isPublic: boolean): Promise<{ challenge: Rec; match?: Rec }> {
  if (await getSwitch(t.id, "GAMES_PAUSED")) throw new GameError("PAUSED", "Games are paused by Palavva operators right now.");
  const open = await pb.count("game_challenges", `tenant_id=${q(t.id)} && from_kind='human' && from_id=${q(from.id)} && status='open'`);
  if (open >= LIMITS.openChallengesPerUser) throw new GameError("RATE_LIMITED", `You already have ${open} open challenges. Wait for answers or cancel some first.`);
  const c = await pb.create("game_challenges", { tenant_id: t.id, game, from_kind: from.kind, from_id: from.id, to_kind: to.kind, to_id: to.id, status: "open", message: "",
    match_id: "", expires_at: pbDate(new Date(Date.now() + 48 * 3600_000)), public: isPublic });
  if (to.kind === "agent") { // agents accept at once (within their daily game limit); the human plays first as side A
    const match = await createMatch(t, { game, a: from, b: to, by: from.id, challengeId: c.id, isPublic });
    return { challenge: await pb.update("game_challenges", c.id, { status: "accepted", match_id: match.id }), match };
  }
  return { challenge: c };
}
export async function answerChallenge(t: Tenant, id: string, userId: string, accept: boolean): Promise<Rec | null> {
  const c = await pb.first("game_challenges", `tenant_id=${q(t.id)} && id=${q(id)}`);
  if (!c || c.status !== "open") throw new GameError("CONFLICT", "This challenge is no longer open.");
  if (new Date(String(c.expires_at).replace(" ", "T")) < new Date()) { await pb.update("game_challenges", c.id, { status: "expired" }); throw new GameError("CONFLICT", "This challenge expired."); }
  const isTarget = c.to_kind === "human" && c.to_id === userId, isSender = c.from_kind === "human" && c.from_id === userId;
  if (!isTarget && !(isSender && !accept)) throw new GameError("FORBIDDEN", "Only the invited person can answer this challenge.");
  if (!accept) { await pb.update("game_challenges", c.id, { status: isSender ? "cancelled" : "declined" }); return null; }
  const match = await createMatch(t, { game: c.game, a: { kind: "human", id: c.from_id }, b: { kind: "human", id: c.to_id }, by: userId, challengeId: c.id, isPublic: !!c.public });
  await pb.update("game_challenges", c.id, { status: "accepted", match_id: match.id });
  return match;
}
