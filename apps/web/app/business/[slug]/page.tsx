import { safeExternalUrl } from "@/lib/url-safety";
import { notFound } from "next/navigation";
import { getTenant } from "@/lib/tenant";
import { pb, q } from "@/lib/pb";
import { env } from "@/lib/env";
import { taxonomy } from "@/lib/repo/taxonomy";
import { DemoBadge } from "@/components/Labels";
import { ReportForm } from "@/components/ReportForm";

export const dynamic = "force-dynamic";


export default async function Business({ params }: { params: Promise<{ slug: string }> }) {
  const tenant = await getTenant();
  const slug = (await params).slug;
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) notFound();
  let f = `tenant_id=${q(tenant.id)} && slug=${q(slug)} && profile_status='published'`;
  if (!tenant.isDemo && !env.showDemo) f += " && is_demo=false";
  const b = await pb.first("businesses", f);
  if (!b || b.verification_state === "suspended") notFound(); // ISSUE-19: a suspended profile is withdrawn from public view
  const spot = await pb.first("spotlights", `tenant_id=${q(tenant.id)} && business_id=${q(b.id)} && approval_status='approved'`);
  const tax = await taxonomy();
  const p = (b.profile_json ?? {}) as Record<string, string>;
  const site = b.website ? safeExternalUrl(b.website) : null;
  const fixture = site?.includes("example.invalid");
  return (
    <div className="container-pv max-w-3xl py-8">
      <div className="flex flex-wrap gap-2">{b.is_demo && <DemoBadge />}
        {spot && <span className={`label-pill ${spot.placement_type === "sponsored" ? "label-sponsored" : "label-human"}`}>{spot.placement_type === "sponsored" ? "Sponsored Spotlight. This placement was paid for." : "Independent editorial spotlight"}</span>}</div>
      <h1 className="mt-2 text-3xl font-extrabold">{b.name}</h1>
      <p className="meta">{tax.countries.find((c) => c.iso2 === b.country_code)?.name}{(b.topic_slugs ?? []).map((t: string) => ` · ${tax.topics.find((x) => x.slug === t)?.name ?? t}`)}</p>
      {b.verification_state === "verified" ? <p className="mt-3"><span className="label-pill label-human" data-testid="biz-verified">Verified by Palavva staff{b.verified_at ? ` · ${String(b.verified_at).slice(0, 10)}` : ""}</span></p>
        : <p className="mt-4 rounded-lg bg-card-muted p-3 text-sm" role="note" data-testid="biz-unverified">{b.is_demo ? "Demo example: not a real business and never verified." : b.verification_state === "rejected" ? "Not verified: Palavva could not confirm the information on this profile." : b.verification_state === "needs_info" ? "Information provided by the organization. Palavva has asked for more evidence before verifying." : "Information provided by the organization. Our review is still underway."}</p>}
      <p className="mt-4">{b.about}</p>
      {[["What they're building", p.building], ["Who it's for", p.for_whom], ["Why they started", p.why_started], ["What they've learned", p.learned]].filter(([, v]) => v).map(([h, v]) => (
        <section key={h} className="mt-5"><h2 className="text-xl font-bold">{h}</h2><p className="mt-1">{v}</p></section>
      ))}
      {b.founder_bio && <section className="mt-5"><h2 className="text-xl font-bold">About the founder</h2><p className="mt-1">{b.founder_bio}</p></section>}
      {Array.isArray(b.products) && b.products.length > 0 && <section className="mt-5"><h2 className="text-xl font-bold">Products and services</h2><ul className="mt-1 list-disc ps-5">{(b.products as string[]).map((x) => <li key={x}>{x}</li>)}</ul></section>}
      <section className="mt-5"><h2 className="text-xl font-bold">Where to find them</h2>
        {site && !fixture ? <a href={site} target="_blank" rel="noopener noreferrer nofollow ugc" className="btn btn-secondary mt-2">Visit website</a>
          : <p className="mt-1 text-muted-foreground">{fixture ? "Fixture link (not clickable)." : "No website listed."}</p>}</section>
      <div className="mt-6"><ReportForm type="business" id={b.id} /></div>
    </div>
  );
}
