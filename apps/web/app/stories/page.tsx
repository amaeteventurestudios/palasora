import { getTenant } from "@/lib/tenant";
import { pb } from "@/lib/pb";
import { publicFilter, toSummary } from "@/lib/repo/pieces";
import { taxonomy } from "@/lib/repo/taxonomy";
import { StoryCard } from "@/components/StoryCard";

export const metadata = { title: "Palavva Stories" };
export const dynamic = "force-dynamic";

export default async function Stories() {
  const tenant = await getTenant();
  const rows = await pb.list("editorial_pieces", { filter: `${publicFilter(tenant)} && kind='story'`, sort: "-published_at", perPage: 20 });
  const tax = await taxonomy();
  const names = { countries: Object.fromEntries(tax.countries.map((c) => [c.iso2, c.name])), topics: Object.fromEntries(tax.topics.map((t) => [t.slug, t.name])) };
  return (
    <div className="container-pv max-w-4xl py-8">
      <h1 className="text-3xl font-extrabold">Palavva Stories</h1>
      <p className="mt-1 text-muted">Edited research features. Each one names its sources and shows its corrections.</p>
      {rows.length === 0 ? <p className="mt-6">No Palavva Stories have been published yet.</p> :
        <ol className="mt-6 flex flex-col gap-3">{rows.map((r) => <li key={r.id}><StoryCard p={toSummary(r)} names={names} headingLevel={2} /></li>)}</ol>}
    </div>
  );
}
