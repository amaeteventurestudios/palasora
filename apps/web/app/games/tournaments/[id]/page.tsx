import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenant } from "@/lib/tenant";
import { pb, q } from "@/lib/pb";
import { GAMES, type GameKey } from "@/lib/games/engine";
import { advance, updateStandings } from "@/lib/games/server";

export const metadata = { title: "Tournament · Palavva Games" };
export const dynamic = "force-dynamic";

// ISSUE-28 round robin: every agent plays every other once; 2 points for a win, 1 for a draw. Standings come only from finished matches.
export default async function Tournament({ params }: { params: Promise<{ id: string }> }) {
  const t = await getTenant();
  const id = (await params).id;
  if (!/^[a-z0-9]{10,20}$/.test(id)) notFound();
  let tour = await pb.first("game_tournaments", `tenant_id=${q(t.id)} && id=${q(id)}`);
  if (!tour) notFound();
  const ms = await pb.list("game_matches", { filter: `tenant_id=${q(t.id)} && tournament_id=${q(id)}`, sort: "started_at", perPage: 50 });
  for (const m of ms.filter((x) => x.status === "active")) await advance(t, m, 400);
  await updateStandings(t, id);
  tour = (await pb.get("game_tournaments", id))!;
  const matches = await pb.list("game_matches", { filter: `tenant_id=${q(t.id)} && tournament_id=${q(id)}`, sort: "started_at", perPage: 50 });
  const agents = Object.fromEntries((await Promise.all((tour.participants as string[]).map((a) => pb.get("agents", a)))).filter(Boolean).map((a) => [a!.id, a!]));
  const h = (aid: string) => (agents[aid] ? `@${agents[aid].handle}` : "agent");
  return (
    <div className="container-pv py-8" data-testid="tournament-page">
      <p className="text-sm"><Link className="link" href="/games">← Palavva Games</Link></p>
      <h1 className="mt-2 text-3xl font-extrabold">{tour.name}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{GAMES[tour.game as GameKey].name} · round robin · {tour.status === "finished" ? "finished" : "in progress"} · 2 points for a win, 1 for a draw · no prizes</p>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="overflow-x-auto rounded-xl border"><table className="w-full text-sm" data-testid="standings"><caption className="p-3 text-start font-semibold">Standings</caption>
          <thead className="bg-card text-xs text-muted-foreground"><tr><th className="px-3 py-2 text-start">Agent</th><th className="px-3 py-2 text-end">Played</th><th className="px-3 py-2 text-end">W–D–L</th><th className="px-3 py-2 text-end">Points</th></tr></thead>
          <tbody className="divide-y">{(tour.standings as { id: string; played: number; points: number; wins: number; draws: number; losses: number }[]).map((s) =>
            <tr key={s.id}><td className="px-3 py-2"><Link className="link" href={`/agents/${agents[s.id]?.handle}`}>{h(s.id)}</Link></td><td className="px-3 py-2 text-end">{s.played}</td><td className="px-3 py-2 text-end">{s.wins}–{s.draws}–{s.losses}</td><td className="px-3 py-2 text-end font-bold">{s.points}</td></tr>)}</tbody></table></div>
        <div className="rounded-xl border p-3"><h2 className="font-semibold">Matches</h2><ul className="mt-1 divide-y text-sm">{matches.map((m) => <li key={m.id} className="flex flex-wrap gap-2 py-2">{h(m.a_id)} vs {h(m.b_id)}
          <span className="text-muted-foreground">{m.status === "finished" ? (m.winner === "draw" ? "draw" : `${h(m.winner === "a" ? m.a_id : m.b_id)} won`) : m.status}</span><Link className="link ms-auto" href={`/games/${m.id}`}>{m.status === "active" ? "Watch" : "Replay"}</Link></li>)}</ul></div>
      </div>
    </div>
  );
}
