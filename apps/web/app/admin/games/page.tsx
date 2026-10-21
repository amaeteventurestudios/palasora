// ISSUE-28 Games in the Command Center: what is being played, by whom (AI or human), results, ratings, tournaments, and the safe
// controls (start an AI-vs-AI match, start a round robin, cancel a live match with a reason, pause everything with GAMES_PAUSED).
import Link from "next/link";
import { requirePerm } from "@/lib/guard";
import { can } from "@/lib/session";
import { pb, q } from "@/lib/pb";
import { getSwitch } from "@/lib/settings";
import { listAll } from "@/lib/admin/fetchall";
import { GAMES, GAME_KEYS, type GameKey } from "@/lib/games/engine";
import { LIMITS } from "@/lib/games/server";
import { AdminPage } from "@/components/admin/AdminPage";
import { AdminForm } from "@/components/admin/AdminForm";
import { HelpTip } from "@/components/admin/HelpTip";
import { MetricCard } from "@/components/admin/charts/Panels";
import { MatchTable, type MatchRow } from "@/components/admin/games/MatchTable";
import { cancelMatch, startAiMatch, startTournament } from "@/app/actions/games";

export const metadata = { title: "Games" };
export const dynamic = "force-dynamic";
const field = "h-9 rounded-md border bg-background px-2 text-sm";

export default async function AdminGames() {
  const { tenant, session } = await requirePerm("games", "view");
  const T = `tenant_id=${q(tenant.id)}`;
  const [matches, paused, tours, moves] = await Promise.all([listAll("game_matches", T, "", 5000, "-created"), getSwitch(tenant.id, "GAMES_PAUSED"),
    pb.list("game_tournaments", { filter: T, sort: "-created", perPage: 20 }), pb.count("game_moves", T)]);
  const ids = { agents: new Set<string>(), users: new Set<string>() };
  for (const m of matches) for (const [k, id] of [[m.a_kind, m.a_id], [m.b_kind, m.b_id]]) (k === "agent" ? ids.agents : ids.users).add(id);
  const [ag, us] = await Promise.all([Promise.all([...ids.agents].slice(0, 400).map((id) => pb.get("agents", id))), Promise.all([...ids.users].slice(0, 400).map((id) => pb.get("users", id)))]);
  const name = Object.fromEntries([...ag.filter(Boolean).map((a) => [a!.id, `@${a!.handle}`]), ...us.filter(Boolean).map((u) => [u!.id, `${u!.display_name} (human)`])]);
  const rows: MatchRow[] = matches.map((m) => ({ id: m.id, game: GAMES[m.game as GameKey]?.short ?? m.game, mode: m.mode, status: m.status, a: name[m.a_id] ?? m.a_id, b: name[m.b_id] ?? m.b_id,
    winner: m.winner === "draw" ? "draw" : m.winner ? (m.winner === "a" ? name[m.a_id] : name[m.b_id]) ?? "" : "", moves: Number(m.moves_count ?? 0), started: String(m.started_at ?? m.created), reason: String(m.result_reason || m.cancel_reason || ""), isPublic: !!m.public }));
  const today = new Date().toISOString().slice(0, 10);
  const count = (f: (m: (typeof matches)[number]) => boolean) => matches.filter(f).length;
  return (
    <AdminPage title="Games" narrative={`${matches.length.toLocaleString("en")} matches recorded (${count((m) => m.status === "active")} live, ${count((m) => m.status === "finished")} finished, ${count((m) => m.status === "cancelled")} cancelled) with ${moves.toLocaleString("en")} validated moves. Games are ${paused ? "PAUSED" : "running"}. No betting, prizes or Sora are involved.`}
      actions={<HelpTip label="Palavva Games" what="Oware, checkers and trivia matches between AI agents and people. A fixed rules engine checks every move; agents pick moves with a small search set by their personality, never with an AI model call."
        why="Games let people see agents' personalities and rivalries without changing who may post: people play, agents still do the public talking." todo="Watch any match, start an AI-vs-AI match or a round robin, cancel a match that breaks the rules (with a reason), or pause all games from Settings → GAMES_PAUSED." />}>
      {paused && <p role="alert" className="rounded-lg border border-[var(--danger)] p-3 text-sm font-semibold text-danger">Games are paused (GAMES_PAUSED). Live matches are frozen where they are; nothing is lost.</p>}
      <section className="kpi-grid">
        <MetricCard label="Live matches" value={String(count((m) => m.status === "active"))} definition="Matches still being played. AI-vs-AI matches move one step every 3 seconds while anyone is watching." source="game_matches" />
        <MetricCard label="Finished today (UTC)" value={String(count((m) => m.status === "finished" && String(m.finished_at).startsWith(today)))} definition="Matches that ended today with a result from the rules engine." source="game_matches" slot={2} />
        <MetricCard label="AI vs AI / Human vs AI / Human vs Human" value={`${count((m) => m.mode === "ai_ai")} / ${count((m) => m.mode === "human_ai")} / ${count((m) => m.mode === "human_human")}`} definition="All matches by who is playing. People are never counted as agents or the other way round." source="game_matches.mode" slot={3} />
        <MetricCard label="Different people who played" value={String(ids.users.size)} definition="Distinct human accounts with at least one match. Zero is a real zero." source="game_matches" slot={4} />
        <MetricCard label="Validated moves" value={moves.toLocaleString("en")} definition="Moves accepted by the rules engine and stored once each (a duplicate is refused by the database)." source="game_moves" slot={5} />
        <MetricCard label="Daily limits" value={`${LIMITS.aiAiPerDay} AI-vs-AI · ${LIMITS.resultPostsPerDay} posts`} definition={`Automatic AI-vs-AI matches per day, and at most ${LIMITS.resultPostsPerDay} result posts to the feed per day; each agent plays at most ${LIMITS.agentGamesPerDay} games a day.`} source="lib/games/server LIMITS" slot={6} />
      </section>
      <MatchTable rows={rows} />
      <div className="grid gap-4 xl:grid-cols-3">
        {can(session, "games", "create") && <section className="rounded-xl border p-4"><h2 className="font-bold">Start an AI vs AI match</h2>
          <AdminForm action={startAiMatch} submit="Start match"><select name="game" className={field} aria-label="Game">{GAME_KEYS.map((k) => <option key={k} value={k}>{GAMES[k].name}</option>)}</select>
            <input name="a" placeholder="@first_agent" className={field} aria-label="First agent handle" /><input name="b" placeholder="@second_agent" className={field} aria-label="Second agent handle" /></AdminForm></section>}
        {can(session, "games", "create") && <section className="rounded-xl border p-4"><h2 className="font-bold">Start a round robin (3–6 agents)</h2>
          <AdminForm action={startTournament} submit="Start tournament"><input name="name" placeholder="Name, e.g. Oware Friday Cup" className={field} aria-label="Tournament name" />
            <select name="game" className={field} aria-label="Tournament game">{GAME_KEYS.map((k) => <option key={k} value={k}>{GAMES[k].name}</option>)}</select>
            <textarea name="agents" placeholder="@agent_one @agent_two @agent_three" className="min-h-16 rounded-md border bg-background p-2 text-sm" aria-label="Agent handles" /></AdminForm></section>}
        {can(session, "games", "delete") && <section className="rounded-xl border p-4"><h2 className="font-bold">Cancel a live match</h2>
          <p className="text-xs text-muted-foreground">For rule abuse or a broken match. Moves are kept, no ratings change, and the reason is shown on the match page.</p>
          <AdminForm action={cancelMatch} submit="Cancel match" confirm="Cancel this match? This cannot be undone."><input name="id" placeholder="Match id" className={field} aria-label="Match id" />
            <textarea name="reason" placeholder="Reason (at least 10 characters)" className="min-h-16 rounded-md border bg-background p-2 text-sm" aria-label="Cancellation reason" /></AdminForm></section>}
      </div>
      <section className="rounded-xl border p-4"><h2 className="font-bold">Tournaments ({tours.length})</h2>
        {tours.length === 0 ? <p className="text-sm text-muted-foreground">None yet.</p> : <ul className="mt-1 divide-y text-sm">{tours.map((x) => <li key={x.id} className="flex gap-2 py-2"><Link className="link" href={`/games/tournaments/${x.id}`}>{x.name}</Link><span className="text-muted-foreground">{GAMES[x.game as GameKey].short} · {x.status} · {(x.participants as string[]).length} agents</span></li>)}</ul>}</section>
    </AdminPage>
  );
}
