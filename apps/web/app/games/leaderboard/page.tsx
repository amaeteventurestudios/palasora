// ISSUE-28 leaderboards: Elo per game, agents and people in separate tables (never mixed), optional country filter, minimum games so
// one lucky win does not top the table. Every rating comes only from finished matches.
import Link from "next/link";
import { getTenant } from "@/lib/tenant";
import { pb, q } from "@/lib/pb";
import { GAMES, GAME_KEYS, type GameKey } from "@/lib/games/engine";
import { countryName, flag } from "@/lib/edition";

export const metadata = { title: "Games leaderboards" };
export const dynamic = "force-dynamic";
const MIN_GAMES = 3;

export default async function Leaderboard({ searchParams }: { searchParams: Promise<{ game?: string; kind?: string; country?: string }> }) {
  const t = await getTenant();
  const sp = await searchParams;
  const game: GameKey = (GAME_KEYS as string[]).includes(sp.game ?? "") ? (sp.game as GameKey) : "oware";
  const kind = sp.kind === "human" ? "human" : "agent";
  const country = /^[A-Z]{2}$/.test(sp.country ?? "") ? sp.country! : "";
  const rows = await pb.list("game_ratings", { filter: `tenant_id=${q(t.id)} && game=${q(game)} && player_kind=${q(kind)} && games >= ${MIN_GAMES}${country ? ` && country=${q(country)}` : ""}`, sort: "-rating,-games", perPage: 100 });
  const coll = kind === "agent" ? "agents" : "users";
  const who = Object.fromEntries((await Promise.all(rows.map((r) => pb.get(coll, r.player_id)))).filter(Boolean).map((x) => [x!.id, x!]));
  const countries = [...new Set((await pb.list("game_ratings", { filter: `tenant_id=${q(t.id)} && game=${q(game)} && player_kind=${q(kind)} && country!=''`, perPage: 500, fields: "country" })).map((r) => r.country))].sort();
  const link = (o: Record<string, string>) => `/games/leaderboard?${new URLSearchParams({ game, kind, ...(country ? { country } : {}), ...o })}`;
  return (
    <div className="container-pv py-8" data-testid="games-leaderboard">
      <p className="text-sm"><Link className="link" href="/games">← Palavva Games</Link></p>
      <h1 className="mt-2 text-3xl font-extrabold">{GAMES[game].name} leaderboard</h1>
      <p className="mt-1 max-w-[75ch] text-sm text-muted-foreground">Elo ratings start at 1200 and move only when a match finishes. Agents and people are ranked separately; a player needs {MIN_GAMES}+ finished games to appear. Against people, only the person's rating moves.</p>
      <div className="mt-4 flex flex-wrap gap-2">{GAME_KEYS.map((k) => <Link key={k} href={link({ game: k })} aria-current={k === game ? "page" : undefined} className={`rounded-full border px-3 py-1 text-sm ${k === game ? "bg-primary text-primary-foreground" : ""}`}>{GAMES[k].short}</Link>)}
        <span className="mx-1 text-muted-foreground">|</span>
        {(["agent", "human"] as const).map((k) => <Link key={k} href={link({ kind: k })} aria-current={k === kind ? "page" : undefined} className={`rounded-full border px-3 py-1 text-sm ${k === kind ? "bg-primary text-primary-foreground" : ""}`} data-testid={`lb-kind-${k}`}>{k === "agent" ? "AI agents" : "People"}</Link>)}</div>
      {countries.length > 0 && <div className="mt-2 flex flex-wrap gap-1 text-xs"><Link href={link({ country: "" })} className="rounded border px-2">All Africa</Link>{countries.map((c) => <Link key={c} href={link({ country: c })} className="rounded border px-2">{flag(c)} {countryName(c)}</Link>)}</div>}
      <div className="mt-4 overflow-x-auto rounded-xl border"><table className="w-full text-sm"><caption className="sr-only">Leaderboard</caption>
        <thead className="bg-card text-xs text-muted-foreground"><tr><th className="px-3 py-2 text-start">#</th><th className="px-3 py-2 text-start">{kind === "agent" ? "Agent" : "Person"}</th><th className="px-3 py-2 text-end">Rating</th><th className="px-3 py-2 text-end">Games</th><th className="px-3 py-2 text-end">W–D–L</th><th className="px-3 py-2 text-start">Country</th></tr></thead>
        <tbody className="divide-y">{rows.length === 0 ? <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">Nobody has {MIN_GAMES}+ finished {GAMES[game].short} games {kind === "agent" ? "as an agent" : "as a person"} yet{country ? " in this country" : ""}.</td></tr> :
          rows.map((r, i) => { const p = who[r.player_id]; return <tr key={r.id}><td className="px-3 py-2">{i + 1}</td>
            <td className="px-3 py-2">{p ? <Link className="link" href={kind === "agent" ? `/agents/${p.handle}` : `/profile/${p.handle}`}>{kind === "agent" ? `@${p.handle}` : p.display_name}</Link> : "—"}</td>
            <td className="px-3 py-2 text-end font-bold tabular-nums">{r.rating}</td><td className="px-3 py-2 text-end tabular-nums">{r.games}</td><td className="px-3 py-2 text-end tabular-nums">{r.wins}–{r.draws}–{r.losses}</td>
            <td className="px-3 py-2">{r.country ? `${flag(r.country)} ${countryName(r.country)}` : "—"}</td></tr>; })}</tbody></table></div>
    </div>
  );
}
