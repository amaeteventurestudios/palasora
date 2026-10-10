import Link from "next/link";
import { getTenant } from "@/lib/tenant";
import { pb, q } from "@/lib/pb";
import { env } from "@/lib/env";
import { DemoBadge } from "@/components/Labels";

export const metadata = { title: "Founder Spotlight (archive)" };
export const dynamic = "force-dynamic";

export default async function Founders() {
  const tenant = await getTenant();
  let f = `tenant_id=${q(tenant.id)} && profile_status='published'`;
  if (!tenant.isDemo && !env.showDemo) f += " && is_demo=false";
  const [biz, spots] = await Promise.all([pb.list("businesses", { filter: f, sort: "-created", perPage: 50 }),
    pb.list("spotlights", { filter: `tenant_id=${q(tenant.id)} && approval_status='approved'`, perPage: 100 })]);
  const spotFor = (id: string) => spots.find((s) => s.business_id === id);
  // Unverified businesses are listed but never featured ahead of verified ones.
  biz.sort((a, b) => Number(b.verification_state === "verified") - Number(a.verification_state === "verified"));
  return (
    <div className="container-pv py-8">
      <h1 className="text-3xl font-extrabold">The people building Africa&apos;s next chapter.</h1>
      <p className="mt-1 max-w-3xl text-muted-foreground">Discover real products, practical ideas, and the founders behind them. We ask what they do, who they serve, and what they&apos;ve learned.</p>
      <div className="mt-4 flex flex-wrap gap-2"><Link href="/submit" className="btn btn-primary">Submit your business</Link></div>
      <p className="meta mt-3 max-w-3xl">Submitting a business doesn&apos;t guarantee a feature. Paid placements are always labeled, and sponsors do not control independent editorial analysis.</p>
      {biz.length === 0 ? <p className="mt-6">No spotlights yet.</p> : (
        <ul className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {biz.map((b) => { const s = spotFor(b.id); return (
            <li key={b.id} className="card p-5" data-testid="founder-card">
              <div className="flex flex-wrap gap-2">{b.is_demo && <DemoBadge />}
                {s && <span className={`label-pill ${s.placement_type === "sponsored" ? "label-sponsored" : "label-human"}`}>{s.placement_type === "sponsored" ? "Sponsored Spotlight" : "Independent editorial spotlight"}</span>}
                {b.verification_state !== "verified" && <span className="label-pill label-human">Not yet verified</span>}</div>
              <h2 className="mt-2 text-lg font-bold"><Link className="hover:underline" href={`/business/${b.slug}`}>{b.name}</Link></h2>
              <p className="text-sm text-muted-foreground line-clamp-3">{b.about}</p>
            </li>); })}
        </ul>
      )}
    </div>
  );
}
