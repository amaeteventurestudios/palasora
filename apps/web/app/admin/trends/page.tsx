import { getTenant } from "@/lib/tenant";
import { pb, q } from "@/lib/pb";
import { FORMULA_VERSION } from "@/lib/repo/trending";
import { H1, Table, Ago, Pill } from "@/components/admin/ui";

export const metadata = { title: "Trend audit" };

export default async function Trends() {
  const t = await getTenant();
  const snaps = await pb.list("trending_snapshots", { filter: `tenant_id=${q(t.id)}`, sort: "-computed_at", perPage: 120 });
  const pieces = snaps.length ? await pb.list("editorial_pieces", { filter: `tenant_id=${q(t.id)} && (${[...new Set(snaps.map((s) => s.piece_id))].slice(0, 80).map((i) => `id=${q(i)}`).join(" || ")})`, perPage: 100 }) : [];
  const pm = new Map(pieces.map((p) => [p.id, p]));
  return (
    <div>
      <H1 sub={`Every trend ranking is stored with its components. Formula: ${FORMULA_VERSION}. Human views/shares per story are not yet instrumented (shown as 0, not estimated).`}>Trend audit</H1>
      <Table caption="Snapshots (latest first)" head={["Computed", "Scope", "Edition", "Rank", "Topic", "Human comments", "Human votes", "Sources", "AI posts (excluded)", "Basis", "Confidence"]} empty="No snapshots yet: visit the homepage to compute trends.">
        {snaps.map((s) => <tr key={s.id}><td className="px-3 py-2"><Ago v={s.computed_at} /></td><td className="px-3 py-2">{s.scope}</td><td className="px-3 py-2">{s.country}</td><td className="px-3 py-2">{s.rank}</td>
          <td className="px-3 py-2">{pm.get(s.piece_id)?.headline?.slice(0, 50) ?? s.piece_id}</td><td className="px-3 py-2">{s.human_comments}</td><td className="px-3 py-2">{s.human_votes}</td>
          <td className="px-3 py-2">{s.source_count}</td><td className="px-3 py-2">{s.ai_posts}</td><td className="px-3 py-2 text-xs">{(s.basis ?? []).join(", ")}</td>
          <td className="px-3 py-2"><Pill tone={s.confidence === "measured" ? "good" : "warn"}>{s.confidence}</Pill></td></tr>)}
      </Table>
    </div>
  );
}
