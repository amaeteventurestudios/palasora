import Link from "next/link";
import { getTenant } from "@/lib/tenant";
import { pb, q } from "@/lib/pb";
import { H1, Table, Ago, Pill } from "@/components/admin/ui";

export const metadata = { title: "Exceptions" };

/** The founder's exception queue: only items the automated policy refused (19 §2). Routine low-risk topics never land here. */
export default async function Exceptions() {
  const t = await getTenant();
  const T = `tenant_id=${q(t.id)}`;
  const [held, decisions] = await Promise.all([
    pb.list("editorial_pieces", { filter: `${T} && (review_status='needs_review' || review_status='held' || review_status='changes_requested') && is_demo=false`, sort: "-created", perPage: 100 }),
    pb.list("moderation_decisions", { filter: `${T} && scope='topic' && (decision='hold' || decision='reject')`, sort: "-created", perPage: 200 }),
  ]);
  const why = new Map<string, { tier: string; reasons: string; ruleset: string }>();
  for (const d of decisions) if (!why.has(d.piece_id)) why.set(d.piece_id, { tier: d.tier, reasons: d.reasons, ruleset: d.ruleset_version });
  return (
    <div>
      <H1 sub="Topics the automated policy would not publish: sensitive, uncertain, injected or unsupported. Review, edit, approve, or leave held. Nothing here is public.">Exceptions</H1>
      <Table caption={`${held.length} held topics`} head={["Topic", "Tier", "Risk basis / reasons", "Claim check", "Source", "Held"]} empty="No exceptions: every eligible topic met the low-risk policy.">
        {held.map((p) => { const w = why.get(p.id); return (
          <tr key={p.id}>
            <td className="px-3 py-2"><Link className="link" href={`/admin/editorial/${p.id}`}>{p.headline}</Link></td>
            <td className="px-3 py-2"><Pill tone={w?.tier === "sensitive" ? "bad" : "warn"}>{w?.tier ?? p.risk_tier}</Pill></td>
            <td className="px-3 py-2 text-xs">{w?.reasons ?? "Created before v1.3 risk tiers (manual review)"}<br /><span className="meta">{w?.ruleset ?? ""}</span></td>
            <td className="px-3 py-2"><Pill tone={p.claim_check_status === "PASS" ? "good" : "warn"}>{p.claim_check_status || "–"}</Pill></td>
            <td className="px-3 py-2 text-xs">{(p.sources_json ?? [])[0]?.name ?? "–"}</td>
            <td className="px-3 py-2"><Ago v={p.created} /></td>
          </tr>); })}
      </Table>
    </div>
  );
}
