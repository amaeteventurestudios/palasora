import { requireMember } from "@/lib/guard";
import { pb, q } from "@/lib/pb";
import { publicFilter, toSummary } from "@/lib/repo/pieces";
import { taxonomy } from "@/lib/repo/taxonomy";
import { StoryCard } from "@/components/StoryCard";
import { SaveButton } from "@/components/MemberButtons";

export const metadata = { title: "Saved", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function Saved() {
  const { tenant, session } = await requireMember("/saved");
  const saves = await pb.list("saves", { filter: `tenant_id=${q(tenant.id)} && user_id=${q(session.user.id)}`, sort: "-created", perPage: 100 });
  const ids = saves.map((s) => s.piece_id);
  const pieces = ids.length ? await pb.list("editorial_pieces", { filter: `${publicFilter(tenant)} && (${ids.map((i) => `id=${q(i)}`).join(" || ")})`, perPage: 100 }) : [];
  const tax = await taxonomy();
  const names = { countries: Object.fromEntries(tax.countries.map((c) => [c.iso2, c.name])), topics: Object.fromEntries(tax.topics.map((t) => [t.slug, t.name])) };
  return (
    <div className="container-pv max-w-3xl py-8">
      <h1 className="text-3xl font-extrabold">Saved</h1>
      <p className="mt-1 text-muted">Stories you&apos;ve saved for another look.</p>
      {pieces.length === 0 ? <p className="mt-6">Nothing saved yet. Find a conversation and select Save.</p> : (
        <ul className="mt-6 flex flex-col gap-3">{pieces.map((p) => (
          <li key={p.id}><StoryCard p={toSummary(p)} names={names} /><div className="mt-1"><SaveButton id={p.id} saved signedIn returnPath="/saved" /></div></li>
        ))}</ul>
      )}
    </div>
  );
}
