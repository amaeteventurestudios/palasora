import Link from "next/link";
import { getTenant } from "@/lib/tenant";
import { pb, q } from "@/lib/pb";
import { H1, Table, Pill, Ago } from "@/components/admin/ui";

export const metadata = { title: "Editorial Queue" };
const TABS = [["review", "Needs review"], ["held", "Held"], ["published", "Published"], ["closed", "Rejected / retracted"]] as const;

export default async function Queue({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const t = await getTenant();
  const tab = (await searchParams).tab ?? "review";
  const filter = { review: "(review_status='needs_review' || review_status='changes_requested')", held: "review_status='held'", published: "review_status='published'",
    closed: "(review_status='rejected' || review_status='retracted')" }[tab] ?? "review_status='needs_review'";
  const rows = await pb.list("editorial_pieces", { filter: `tenant_id=${q(t.id)} && ${filter}`, sort: tab === "published" ? "-published_at" : "created", perPage: 100 });
  const clusters = rows.length ? await pb.list("cluster_sources", { filter: `tenant_id=${q(t.id)} && (${rows.filter((r) => r.cluster_id).map((r) => `cluster_id=${q(r.cluster_id)}`).join(" || ") || "id=''"})`, perPage: 500 }) : [];
  return (
    <div>
      <H1 sub="Every AI-assisted draft waits here. Nothing reaches readers without a recorded human approval.">Editorial Queue</H1>
      <nav aria-label="Queue filter" className="scroll-row mb-4">{TABS.map(([k, l]) => <Link key={k} className="chip" aria-current={tab === k ? "true" : undefined} href={`/admin/editorial?tab=${k}`}>{l}</Link>)}</nav>
      <Table caption={`${rows.length} items`} head={["Item", "Source / time", "Country / topic", "Risk", "Evidence", "Cluster sources", "Model", "Status"]} empty="Nothing in this view.">
        {rows.map((r) => (
          <tr key={r.id}>
            <td className="px-3 py-2"><Link className="link font-semibold" href={`/admin/editorial/${r.id}`}>{r.headline}</Link>{r.is_demo && <span className="meta"> · demo</span>}</td>
            <td className="px-3 py-2">{(r.sources_json ?? [])[0]?.name ?? "–"}<br /><span className="meta"><Ago v={r.created} /></span></td>
            <td className="px-3 py-2">{(r.country_codes ?? []).join(", ")}<br /><span className="meta">{(r.topic_slugs ?? []).join(", ")}</span></td>
            <td className="px-3 py-2"><Pill tone={r.risk_tier === "high" ? "bad" : r.risk_tier === "medium" ? "warn" : "neutral"}>{r.risk_tier}</Pill></td>
            <td className="px-3 py-2"><Pill tone={r.claim_check_status === "PASS" ? "good" : r.claim_check_status === "FAIL" ? "bad" : "warn"}>{r.claim_check_status || "–"}</Pill></td>
            <td className="px-3 py-2">{clusters.filter((c) => c.cluster_id === r.cluster_id).length}</td>
            <td className="px-3 py-2">{r.author_type === "fixture" ? "fixture" : "Qwen"}</td>
            <td className="px-3 py-2">{r.review_status.replace("_", " ")}</td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
