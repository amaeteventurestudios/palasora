// ISSUE-28 one match: the board (live or replay), both players with a clear AI/human label, persona commentary, the move list and,
// when it is over, the result, rating changes and (AI vs AI) the agent's feed post about it.
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenant } from "@/lib/tenant";
import { can, getSession } from "@/lib/session";
import { getMatch, moves } from "@/lib/games/server";
import { canSee, matchView } from "@/lib/games/view";
import { playStyle } from "@/lib/games/engine";
import { pb } from "@/lib/pb";
import { GameBoard } from "@/components/games/GameBoard";

export const dynamic = "force-dynamic";
export async function generateMetadata() { return { title: "Match · Palavva Games", robots: { index: false } }; }

export default async function Match({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ply?: string }> }) {
  const t = await getTenant();
  const session = await getSession(t);
  const m = await getMatch(t, (await params).id);
  if (!m || (!canSee(m, session?.user.id) && !can(session, "games", "view"))) notFound();
  const sp = await searchParams;
  const mv = await moves(t, m.id);
  const ply = sp.ply !== undefined ? Math.max(0, Math.min(Number(sp.ply) || 0, mv.length)) : undefined;
  const v = await matchView(t, m, session?.user.id, { ply, moves: mv });
  const styles = await Promise.all(v.players.map(async (p) => (p.kind === "agent" ? playStyle((await pb.get("agents", p.id)) as never, null).label : "")));
  const nameOf = (id: string) => v.players.find((p) => p.id === id);
  const post = v.resultPostId ? await pb.get("editorial_pieces", v.resultPostId).catch(() => null) : null;
  return (
    <div className="container-pv py-8" data-testid="match-page">
      <p className="text-sm"><Link className="link" href="/games">← Palavva Games</Link>{v.tournamentId && <> · <Link className="link" href={`/games/tournaments/${v.tournamentId}`}>Tournament</Link></>}</p>
      <h1 className="mt-2 text-2xl font-extrabold sm:text-3xl">{v.gameName}: {v.players[0].name} vs {v.players[1].name}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{v.mode === "ai_ai" ? "AI vs AI" : v.mode === "human_ai" ? "Human vs AI" : "Human vs Human"} · {v.isPublic ? "public match" : "private match (only the players can see it)"} · started {v.startedAt.slice(0, 16)} UTC · no stakes, no prizes</p>
      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-3">
          <GameBoard key={`${v.id}:${v.replaying ? v.ply : "live"}`} initial={v} />
          <nav className="flex flex-wrap items-center gap-2 text-sm" aria-label="Replay">
            <span className="text-muted-foreground">Replay:</span>
            <Link className="rounded border px-2" href={`/games/${v.id}?ply=0`}>Start</Link>
            {v.ply > 0 && <Link className="rounded border px-2" href={`/games/${v.id}?ply=${v.ply - 1}`} data-testid="replay-prev">◀ Move {v.ply - 1}</Link>}
            {v.ply < v.movesCount && <Link className="rounded border px-2" href={`/games/${v.id}?ply=${v.ply + 1}`} data-testid="replay-next">Move {v.ply + 1} ▶</Link>}
            {v.replaying && <Link className="rounded border px-2" href={`/games/${v.id}`}>Back to now</Link>}
            <span className="text-xs text-muted-foreground">{v.movesCount} moves recorded</span>
          </nav>
        </div>
        <aside className="flex flex-col gap-3">
          <section className="card p-4" aria-label="Players">{v.players.map((p, i) => (
            <div key={p.id} className="flex flex-col py-1" data-testid={`player-${i}`}>
              <Link className="font-bold" href={p.href}>{p.kind === "agent" ? `@${p.handle}` : p.name}</Link>
              <span className="text-xs"><span className={`rounded border px-1 ${p.kind === "agent" ? "border-[var(--brand-tangerine)]" : "border-[var(--brand-gold)]"}`}>{p.label}</span> {styles[i] && `· ${styles[i]}`}</span>
              {v.ratings[i ? "b" : "a"] && <span className="text-xs text-muted-foreground">Rating {v.ratings[i ? "b" : "a"].before} → {v.ratings[i ? "b" : "a"].after}</span>}
            </div>))}
            {v.mode === "human_ai" && <p className="mt-2 text-xs text-muted-foreground">Against people, only the person's rating moves; an agent's ranking is set by agent-vs-agent games.</p>}</section>
          <section className="card p-4" aria-labelledby="talk-h"><h2 id="talk-h" className="font-bold">Table talk</h2>
            <p className="text-xs text-muted-foreground">Short lines picked to fit each agent's personality. They only repeat facts from this match (score, opponent); no AI model writes them.</p>
            {v.commentary.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">Nothing yet.</p> : <ul className="mt-2 flex flex-col gap-1.5 text-sm" data-testid="commentary">{v.commentary.map((c, i) => <li key={i}><b>@{nameOf(c.agent_id)?.handle ?? "agent"}:</b> {c.text}</li>)}</ul>}
            {post?.review_status === "published" && <p className="mt-2 text-sm"><Link className="link" href={`/posts/${post.slug}`} data-testid="result-post">The result post in Palavva Games →</Link></p>}</section>
          <section className="card p-4 text-xs text-muted-foreground"><p><b>Fair play:</b> moves are checked by the server against the rules; a move can be recorded only once; agents and people are ranked separately. Report a problem through Help.</p></section>
        </aside>
      </div>
    </div>
  );
}
