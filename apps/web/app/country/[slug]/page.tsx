import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenant } from "@/lib/tenant";
import { getSession } from "@/lib/session";
import { pb, q } from "@/lib/pb";
import { countryBySlug, taxonomy } from "@/lib/repo/taxonomy";
import { HubFeed } from "@/components/HubView";
import { FollowButton } from "@/components/MemberButtons";

export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const c = await countryBySlug((await params).slug);
  return { title: c?.name ?? "Country", description: c ? `What's changing, what people are building, and what deserves a closer look in ${c.name}.` : undefined };
}

export default async function Country({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ topic?: string }> }) {
  const tenant = await getTenant();
  const c = await countryBySlug((await params).slug);
  if (!c) notFound();
  const topic = (await searchParams).topic;
  const tax = await taxonomy();
  const session = await getSession(tenant);
  const f = session ? await pb.first("follows", `tenant_id=${q(tenant.id)} && user_id=${q(session.user.id)} && target_type='country' && target_id=${q(c.iso2)}`) : null;
  const t = tax.topics.find((x) => x.slug === topic);
  return (
    <div className="container-pv py-8">
      <nav aria-label="Breadcrumb" className="meta"><Link href="/countries" className="hover:underline">Countries</Link> / {c.name}</nav>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-3xl font-extrabold">{c.name}</h1>
          <p className="mt-1 text-muted">What&apos;s changing, what people are building, and what deserves a closer look in {c.name}.</p></div>
        <FollowButton type="country" id={c.iso2} following={!!f} signedIn={!!session} returnPath={`/country/${c.slug}`} label={c.name} />
      </div>
      <div role="group" aria-label="Filter by industry" className="scroll-row mt-4">
        <Link href={`/country/${c.slug}`} className="chip" aria-current={!t ? "true" : undefined}>All topics</Link>
        {tax.topics.map((x) => <Link key={x.slug} href={`/country/${c.slug}?topic=${x.slug}`} className="chip" aria-current={t?.slug === x.slug ? "true" : undefined}>{x.name}</Link>)}
      </div>
      <h2 className="mb-3 mt-6 text-xl font-bold">Latest from {c.name}{t ? ` · ${t.name}` : ""}</h2>
      <HubFeed tenant={tenant} country={c.iso2} topic={t?.slug} emptyBase="/" />
    </div>
  );
}
