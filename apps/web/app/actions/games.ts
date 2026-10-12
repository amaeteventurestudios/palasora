"use server";
// ISSUE-28 Games actions. People: play an agent (picked by them or matched by rating), challenge another person, answer challenges.
// Staff (Games permission): start an AI-vs-AI match, run a round robin, cancel a match with a reason. Everything audited.
import { randomInt } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getTenant } from "@/lib/tenant";
import { can, getSession } from "@/lib/session";
import { pb, pbDate, q } from "@/lib/pb";
import { audit } from "@/lib/audit";
import { rateLimit } from "@/lib/ratelimit";
import { GAMES, type GameKey } from "@/lib/games/engine";
import { GameError, answerChallenge, challenge, createMatch, createTournament, randomAgents } from "@/lib/games/server";
import type { ActionState } from "./member";

const fail = (message: string): ActionState => ({ ok: false, message });
const str = (f: FormData, k: string, max = 200) => String(f.get(k) ?? "").slice(0, max).trim();
const gameOf = (f: FormData): GameKey | null => (str(f, "game", 20) in GAMES ? (str(f, "game", 20) as GameKey) : null);

async function me() {
  const tenant = await getTenant();
  const session = await getSession(tenant);
  return { tenant, session };
}

/** Play an agent: a named one (from its profile) or one matched near your rating from active Palavva-run residents. */
export async function playAgent(_: ActionState, f: FormData): Promise<ActionState> {
  const { tenant, session } = await me();
  if (!session) redirect(`/auth/sign-in?next=${encodeURIComponent("/games")}`);
  const game = gameOf(f);
  if (!game) return fail("Choose a game.");
  if (!rateLimit(`gamestart:${session.user.id}`, 10, 600_000).ok) return fail("You have started a lot of games just now. Try again in a few minutes.");
  let agent = null;
  const handle = str(f, "agent", 40).replace(/^@/, "").toLowerCase();
  if (handle) agent = await pb.first("agents", `tenant_id=${q(tenant.id)} && handle_key=${q(handle)} && status='active'`) ?? await pb.first("agents", `tenant_id=${q(tenant.id)} && handle=${q(handle)} && status='active'`);
  else {
    // Matchmaking: prefer rated agents within ±150 of your rating for this game; otherwise any active resident.
    const mine = await pb.first("game_ratings", `tenant_id=${q(tenant.id)} && game=${q(game)} && player_kind='human' && player_id=${q(session.user.id)}`);
    const r = Number(mine?.rating ?? 1200);
    const near = await pb.list("game_ratings", { filter: `tenant_id=${q(tenant.id)} && game=${q(game)} && player_kind='agent' && rating >= ${r - 150} && rating <= ${r + 150}`, perPage: 20 });
    const pickId = near.length ? near[randomInt(0, near.length)].player_id : "";
    agent = pickId ? await pb.get("agents", pickId) : (await randomAgents(tenant, 1))[0];
  }
  if (!agent) return fail("That agent was not found or is not active.");
  let matchId = "";
  try { matchId = (await challenge(tenant, { kind: "human", id: session.user.id }, { kind: "agent", id: agent.id }, game, f.get("public") !== "off")).match!.id; }
  catch (e) { if (e instanceof GameError) return fail(e.message); throw e; }
  redirect(`/games/${matchId}`);
}

export async function challengePerson(_: ActionState, f: FormData): Promise<ActionState> {
  const { tenant, session } = await me();
  if (!session) redirect("/auth/sign-in?next=/games");
  const game = gameOf(f);
  if (!game) return fail("Choose a game.");
  const handle = str(f, "handle", 40).replace(/^@/, "").toLowerCase();
  const other = handle ? await pb.first("users", `tenant_id=${q(tenant.id)} && handle=${q(handle)} && account_status='active'`) : null;
  if (!other) return fail("No active person has that handle. (Agents are challenged from their profile or with “Play an agent”.)");
  if (other.id === session.user.id) return fail("You cannot challenge yourself.");
  if (!rateLimit(`gamechallenge:${session.user.id}`, 10, 3600_000).ok) return fail("Too many challenges for now.");
  try { await challenge(tenant, { kind: "human", id: session.user.id }, { kind: "human", id: other.id }, game, f.get("public") !== "off"); }
  catch (e) { if (e instanceof GameError) return fail(e.message); throw e; }
  revalidatePath("/games");
  return { ok: true, message: `Challenge sent to @${other.handle}. It stays open for 48 hours.` };
}

export async function answer(_: ActionState, f: FormData): Promise<ActionState> {
  const { tenant, session } = await me();
  if (!session) redirect("/auth/sign-in?next=/games");
  let m = null;
  try { m = await answerChallenge(tenant, str(f, "id", 30), session.user.id, f.get("accept") === "1"); }
  catch (e) { if (e instanceof GameError) return fail(e.message); throw e; }
  if (m) redirect(`/games/${m.id}`);
  revalidatePath("/games");
  return { ok: true, message: "Done." };
}

// ---------------------------------------------------------------- staff
async function staff(action: "create" | "delete" | "administer") {
  const { tenant, session } = await me();
  if (!session || !can(session, "games", action)) throw new Error("FORBIDDEN");
  return { tenant, session };
}

export async function startAiMatch(_: ActionState, f: FormData): Promise<ActionState> {
  const { tenant, session } = await staff("create");
  const game = gameOf(f);
  const [a, b] = [str(f, "a", 40), str(f, "b", 40)].map((h) => h.replace(/^@/, "").toLowerCase());
  if (!game || !a || !b) return fail("Choose a game and two agent handles.");
  const [ga, gb] = await Promise.all([a, b].map((h) => pb.first("agents", `tenant_id=${q(tenant.id)} && handle=${q(h)}`)));
  if (!ga || !gb) return fail("Both agents must exist.");
  try { const m = await createMatch(tenant, { game, a: { kind: "agent", id: ga.id }, b: { kind: "agent", id: gb.id }, by: session.user.id }); revalidatePath("/admin/games"); return { ok: true, message: `Match started: /games/${m.id}` }; }
  catch (e) { if (e instanceof GameError) return fail(e.message); throw e; }
}

export async function startTournament(_: ActionState, f: FormData): Promise<ActionState> {
  const { tenant, session } = await staff("create");
  const game = gameOf(f), name = str(f, "name", 120);
  const handles = str(f, "agents", 600).split(/[\s,]+/).map((h) => h.replace(/^@/, "").toLowerCase()).filter(Boolean);
  if (!game || name.length < 4) return fail("Give the tournament a name and choose a game.");
  const agents = (await Promise.all(handles.map((h) => pb.first("agents", `tenant_id=${q(tenant.id)} && handle=${q(h)} && status='active'`)))).filter(Boolean);
  if (agents.length !== handles.length) return fail("Every handle must be an active agent.");
  try { const t = await createTournament(tenant, { name, game, agentIds: agents.map((a) => a!.id), by: session.user.id }); revalidatePath("/admin/games"); return { ok: true, message: `Round robin started: /games/tournaments/${t.id}` }; }
  catch (e) { if (e instanceof GameError) return fail(e.message); throw e; }
}

export async function cancelMatch(_: ActionState, f: FormData): Promise<ActionState> {
  const { tenant, session } = await staff("delete");
  const id = str(f, "id", 30), reason = str(f, "reason", 300);
  if (reason.length < 10) return fail("Write a reason of at least 10 characters (it is shown on the match page).");
  const m = await pb.first("game_matches", `tenant_id=${q(tenant.id)} && id=${q(id)}`);
  if (!m || m.status !== "active") return fail("Only a live match can be cancelled.");
  await pb.update("game_matches", m.id, { status: "cancelled", cancel_reason: reason, finished_at: pbDate() });
  await audit(tenant.id, session.user.id, "game.match_cancelled", "game_matches", m.id, { reason });
  revalidatePath("/admin/games");
  return { ok: true, message: "Match cancelled. Its moves are kept; no ratings changed." };
}
