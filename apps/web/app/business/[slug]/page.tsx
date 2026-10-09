import { notFound } from "next/navigation";
import { getTenant } from "@/lib/tenant";
import { pb, q } from "@/lib/pb";
import { env } from "@/lib/env";
import { taxonomy } from "@/lib/repo/taxonomy";
import { DemoBadge } from "@/components/Labels";
import { ReportForm } from "@/components/ReportForm";

export const dynamic = "force-dynamic";

function safeUrl(u: string): string | null {
  try { const x = new URL(u); return x.protocol === "https:" || x.protocol === "http:" ? x.toString() : null; } catch { return null; }
}

export default async function Business({ params }: { params: Promise<{ slug: string }> }) {
  const tenant = await getTenant();
  const slug = (await params).slug;
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) notFound();
  let f = `tenant_id=${q(tenant.id)} && slug=${q(slug)} && profile_status='published'`;
  if (!tenant.isDemo && !env.showDemo) f += " && is_demo=false";
  const b = await pb.first("businesses", f);
  if (!b) notFound();
  const spot = await pb.first("spotlights", `tenant_id=${q(tenant.id)} && business_id=${q(b.id)} && approval_status='approved'`);
  const tax = await taxonomy();
  const p = (b.profile_json ?? {}) as Record<string, string>;
  const site = b.website ? safeUrl(b.website) : null;
  const fixture = site?.includes("example.invalid");
  return (
    <div className="container-pv max-w-3xl py-8">
      <div className="flex flex-wrap gap-2">{b.is_demo && <DemoBadge />}
        {spot && <span className={`label-pill ${spot.placement_type === "sponsored" ? "label-sponsored" : "label-human"}`}>{spot.placement_type === "sponsored" ? "Sponsored Spotlight. This placement was paid for." : "Independent editorial spotlight"}</span>}</div>
      <h1 className="mt-2 text-3xl font-extrabold">{b.name}</h1>
      <p className="meta">{tax.countries.find((c) => c.iso2 === b.country_code)?.name}{(b.topic_slugs ?? []).map((t: string) => ` · ${tax.topics.find((x) => x.slug === t)?.name ?? t}`)}</p>
      {b.verification_state !== "verified" && <p className="mt-4 rounded-lg bg-card-muted p-3 text-sm" role="note">Information provided by the organization. Our review is still underway.</p>}
      <p className="mt-4">{b.about}</p>
      {[["What they're building", p.building], ["Who it's for", p.for_whom], ["Why they started", p.why_started], ["What they've learned", p.learned]].filter(([, v]) => v).map(([h, v]) => (
        <section key={h} className="mt-5"><h2 className="text-xl font-bold">{h}</h2><p className="mt-1">{v}</p></section>
      ))}
      <section className="mt-5"><h2 className="text-xl font-bold">Where to find them</h2>
        {site && !fixture ? <a href={site} target="_blank" rel="noopener noreferrer nofollow ugc" className="btn btn-secondary mt-2">Visit website</a>
          : <p className="mt-1 text-muted">{fixture ? "Fixture link (not clickable)." : "No website listed."}</p>}</section>
      <div className="mt-6"><ReportForm type="business" id={b.id} /></div>
    </div>
  );
}
