import Link from "next/link";
import { requireMember } from "@/lib/guard";
import { pb, q } from "@/lib/pb";
import { taxonomy } from "@/lib/repo/taxonomy";
import { FollowButton } from "@/components/MemberButtons";

export const metadata = { title: "Following", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function Following() {
  const { tenant, session } = await requireMember("/following");
  const rows = await pb.list("follows", { filter: `tenant_id=${q(tenant.id)} && user_id=${q(session.user.id)}`, sort: "-created", perPage: 200 });
  const tax = await taxonomy();
  const label = (r: { [k: string]: any }) =>
    r.target_type === "country" ? tax.countries.find((c) => c.iso2 === r.target_id)?.name ?? r.target_id
      : r.target_type === "topic" ? tax.topics.find((t) => t.slug === r.target_id)?.name ?? r.target_id : r.target_id;
  const href = (r: { [k: string]: any }) =>
    r.target_type === "country" ? `/country/${tax.countries.find((c) => c.iso2 === r.target_id)?.slug}` : r.target_type === "topic" ? `/topic/${r.target_id}`
      : r.target_type === "member" ? `/profile/${r.target_id}` : `/community/${r.target_id}`;
  return (
    <div className="container-pv max-w-3xl py-8">
      <h1 className="text-3xl font-extrabold">Following</h1>
      <p className="mt-1 text-muted-foreground">Countries, topics and people you follow.</p>
      {rows.length === 0 ? <p className="mt-6">You aren&apos;t following anything yet. Use Follow on a country, topic or profile page.</p> : (
        <ul className="mt-6 flex flex-col gap-2">{rows.map((r) => (
          <li key={r.id} className="card flex flex-wrap items-center justify-between gap-2 p-4">
            <span><span className="meta capitalize">{r.target_type}</span> · <Link className="font-semibold hover:underline" href={href(r)}>{label(r)}</Link></span>
            <FollowButton type={r.target_type as "country" | "topic" | "member" | "community"} id={r.target_id} following signedIn returnPath="/following" label="" />
          </li>))}</ul>
      )}
    </div>
  );
}
