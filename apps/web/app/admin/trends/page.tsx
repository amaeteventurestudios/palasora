import { getTenant } from "@/lib/tenant";
import { pb, q } from "@/lib/pb";
import { FORMULA_VERSION } from "@/lib/repo/trending";
import { H1, Table, Ago, Pill } from "@/components/admin/ui";

export const metadata = { title: "Trend audit" };

export default async function Trends() {
  const t = await getTenant();
  const since = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);
  const eng = await pb.list("engagement_daily", { filter: `tenant_id=${q(t.id)} && day >= ${q(since)}`, perPage: 500 }).catch(() => []);
  const tot = eng.reduce((a, r) => ({ views: a.views + (r.views ?? 0), shares: a.shares + (r.shares ?? 0), bot: a.bot + (r.rejected_bot ?? 0), dup: a.dup + (r.rejected_duplicate ?? 0) }), { views: 0, shares: 0, bot: 0, dup: 0 });
  const snaps = await pb.list("trending_snapshots", { filter: `tenant_id=${q(t.id)}`, sort: "-computed_at", perPage: 120 });
  const pieces = snaps.length ? await pb.list("editorial_pieces", { filter: `tenant_id=${q(t.id)} && (${[...new Set(snaps.map((s) => s.piece_id))].slice(0, 80).map((i) => `id=${q(i)}`).join(" || ")})`, perPage: 100 }) : [];
  const pm = new Map(pieces.map((p) => [p.id, p]));
  return (
    <div>
      <H1 sub={`Every trend ranking is stored with its components. Formula: ${FORMULA_VERSION}. Human reads count after 5 s visible; reads and shares are deduplicated per visitor per day (salted daily hash, no cookie), and bots, headless browsers, staff and GPC/DNT requests are never counted.`}>Trend audit</H1>
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="engagement-summary">
        {[["Human reads (7 d)", tot.views], ["Human shares (7 d)", tot.shares], ["Rejected as bot/headless", tot.bot], ["Rejected as duplicate", tot.dup]].map(([l, v]) => (
          <div key={String(l)} className="card p-3"><p className="meta">{l}</p><p className="text-xl font-bold">{v}</p></div>))}
      </div>
      <Table caption="Snapshots (latest first)" head={["Computed", "Scope", "Edition", "Rank", "Topic", "Human comments", "Human votes", "Human reads", "Human shares", "Sources", "AI posts (excluded)", "Basis", "Confidence"]} empty="No snapshots yet: visit the homepage to compute trends.">
        {snaps.map((s) => <tr key={s.id}><td className="px-3 py-2"><Ago v={s.computed_at} /></td><td className="px-3 py-2">{s.scope}</td><td className="px-3 py-2">{s.country}</td><td className="px-3 py-2">{s.rank}</td>
          <td className="px-3 py-2">{pm.get(s.piece_id)?.headline?.slice(0, 50) ?? s.piece_id}</td><td className="px-3 py-2">{s.human_comments}</td><td className="px-3 py-2">{s.human_votes}</td><td className="px-3 py-2">{s.human_views ?? 0}</td><td className="px-3 py-2">{s.human_shares ?? 0}</td>
          <td className="px-3 py-2">{s.source_count}</td><td className="px-3 py-2">{s.ai_posts}</td><td className="px-3 py-2 text-xs">{(s.basis ?? []).join(", ")}</td>
          <td className="px-3 py-2"><Pill tone={s.confidence === "measured" ? "good" : "warn"}>{s.confidence}</Pill></td></tr>)}
      </Table>
    </div>
  );
}
