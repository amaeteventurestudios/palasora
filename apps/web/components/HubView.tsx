import Link from "next/link";
import { listFeed } from "@/lib/repo/pieces";
import { taxonomy } from "@/lib/repo/taxonomy";
import type { Tenant } from "@/lib/tenant";
import { StoryCard } from "./StoryCard";
import { SponsoredSlot } from "./SponsoredSlot";

/** Shared body for country and topic hubs: latest verified items plus a transparent empty state. */
export async function HubFeed({ tenant, country, topic, emptyBase }: { tenant: Tenant; country?: string; topic?: string; emptyBase: string }) {
  const [tax, feed] = await Promise.all([taxonomy(), listFeed(tenant, { mode: "new", country, topic, limit: 20 })]);
  const names = { countries: Object.fromEntries(tax.countries.map((c) => [c.iso2, c.name])), topics: Object.fromEntries(tax.topics.map((t) => [t.slug, t.name])) };
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      <section className="lg:col-span-8" aria-label="Latest">
        {feed.items.length === 0 ? (
          <div className="card p-6"><p className="font-semibold">We don&apos;t have a verified story for these filters yet.</p>
            <p className="mt-1 text-muted">Explore all Africa or change the topic.</p><Link href={emptyBase} className="btn btn-secondary mt-4">Explore all Africa</Link></div>
        ) : <ol className="flex flex-col gap-3">{feed.items.map((p) => <li key={p.id}><StoryCard p={p} names={names} headingLevel={2} /></li>)}</ol>}
      </section>
      <aside className="lg:col-span-4"><SponsoredSlot tenant={tenant} position={country ? "country_hub" : "topic_hub"} /></aside>
    </div>
  );
}
