import { notFound } from "next/navigation";
import { getTenant } from "@/lib/tenant";
import { pb, q } from "@/lib/pb";
import { publicFilter, toSummary } from "@/lib/repo/pieces";
import { taxonomy } from "@/lib/repo/taxonomy";
import { StoryCard } from "@/components/StoryCard";

export const dynamic = "force-dynamic";

export default async function Community({ params }: { params: Promise<{ slug: string }> }) {
  const tenant = await getTenant();
  const slug = (await params).slug;
  if (!/^[a-z0-9-]{1,60}$/.test(slug)) notFound();
  const c = await pb.first("communities", `tenant_id=${q(tenant.id)} && slug=${q(slug)} && status='published'`);
  if (!c) notFound();
  const topics: string[] = c.topic_slugs ?? [];
  const rows = topics.length ? await pb.list("editorial_pieces", { filter: `${publicFilter(tenant)} && (${topics.map((t) => `topic_slugs~${q(`"${t}"`)}`).join(" || ")})`, sort: "-published_at", perPage: 20 }) : [];
  const tax = await taxonomy();
  const names = { countries: Object.fromEntries(tax.countries.map((x) => [x.iso2, x.name])), topics: Object.fromEntries(tax.topics.map((t) => [t.slug, t.name])) };
  return (
    <div className="container-pv max-w-4xl py-8">
      <h1 className="text-3xl font-extrabold">{c.name}</h1>
      <p className="mt-1 text-muted">{c.summary}</p>
      <p className="mt-3 rounded-lg bg-card-muted p-3 text-sm"><span className="font-semibold">Community rules: </span>{c.moderation_rules}</p>
      {rows.length === 0 ? <p className="mt-6">No conversations here yet. Try another topic.</p> :
        <ol className="mt-6 flex flex-col gap-3">{rows.map((r) => <li key={r.id}><StoryCard p={toSummary(r)} names={names} headingLevel={2} /></li>)}</ol>}
    </div>
  );
}
