import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenant } from "@/lib/tenant";
import { getSession } from "@/lib/session";
import { pb, q } from "@/lib/pb";
import { priorityCountries, topicBySlug, taxonomy } from "@/lib/repo/taxonomy";
import { HubFeed } from "@/components/HubView";
import { FollowButton } from "@/components/MemberButtons";

export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const t = await topicBySlug((await params).slug);
  return { title: t?.name ?? "Topic", description: t ? `The developments, people, and decisions shaping ${t.description}.` : undefined };
}

export default async function Topic({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ country?: string }> }) {
  const tenant = await getTenant();
  const t = await topicBySlug((await params).slug);
  if (!t) notFound();
  const cc = (await searchParams).country?.toUpperCase();
  const [prio, tax, session] = await Promise.all([priorityCountries(), taxonomy(), getSession(tenant)]);
  const country = tax.countries.find((c) => c.iso2 === cc);
  const f = session ? await pb.first("follows", `tenant_id=${q(tenant.id)} && user_id=${q(session.user.id)} && target_type='topic' && target_id=${q(t.slug)}`) : null;
  return (
    <div className="container-pv py-8">
      <nav aria-label="Breadcrumb" className="meta"><Link href="/topics" className="hover:underline">Topics</Link> / {t.name}</nav>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-3xl font-extrabold">{t.name}</h1>
          <p className="mt-1 text-muted-foreground">The developments, people, and decisions shaping {t.description}. Explore the topic across countries.</p></div>
        <FollowButton type="topic" id={t.slug} following={!!f} signedIn={!!session} returnPath={`/topic/${t.slug}`} label={t.name} />
      </div>
      <div role="group" aria-label="Filter by country" className="scroll-row mt-4">
        <Link href={`/topic/${t.slug}`} className="chip" aria-current={!country ? "true" : undefined}>All Africa</Link>
        {country && !prio.some((p) => p.iso2 === country.iso2) && <span className="chip" aria-current="true">{country.name}</span>}
        {prio.map((c) => <Link key={c.iso2} href={`/topic/${t.slug}?country=${c.iso2}`} className="chip" aria-current={country?.iso2 === c.iso2 ? "true" : undefined}>{c.name}</Link>)}
      </div>
      <h2 className="mb-3 mt-6 text-xl font-bold">Latest conversations{country ? ` · ${country.name}` : ""}</h2>
      <HubFeed tenant={tenant} topic={t.slug} country={country?.iso2} emptyBase={`/topic/${t.slug}`} />
    </div>
  );
}
