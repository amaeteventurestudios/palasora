import Link from "next/link";
import { History, Rocket } from "lucide-react";
import { listFeed } from "@/lib/repo/pieces";
import { priorityCountries, taxonomy } from "@/lib/repo/taxonomy";
import { MODE_LABELS, type FeedMode } from "@/lib/feed";
import type { Tenant } from "@/lib/tenant";
import { FeedTabs } from "./FeedTabs";
import { FilterBar } from "./FilterBar";
import { StoryCard, pieceHref } from "./StoryCard";
import { SponsoredSlot } from "./SponsoredSlot";
import { LiveEventsProvider } from "./live/LiveEvents";
import { LiveActivity, NewDiscussionsBanner } from "./live/FeedLive";
import { latestSeq, recentActivity, roleLabels } from "@/lib/repo/thread";
import { Time } from "./Time";

export type FeedParams = { country?: string; topic?: string; lang?: string; cursor?: string };

export function cleanParams(sp: Record<string, string | string[] | undefined>): FeedParams {
  const one = (v: unknown) => (typeof v === "string" ? v : undefined);
  const country = one(sp.country)?.toUpperCase();
  const topic = one(sp.topic)?.toLowerCase();
  return {
    country: country && /^[A-Z]{2}$/.test(country) ? country : undefined,
    topic: topic && /^[a-z0-9-]{1,60}$/.test(topic) ? topic : undefined,
    lang: one(sp.lang) && /^[a-z]{2}$/.test(one(sp.lang)!) ? one(sp.lang) : undefined,
    cursor: one(sp.cursor)?.slice(0, 40),
  };
}

export async function FeedView({ tenant, mode, params, base, showHero = true }: { tenant: Tenant; mode: FeedMode; params: FeedParams; base: string; showHero?: boolean }) {
  const [tax, prio, feed, fresh, cursor, activity, labels] = await Promise.all([
    taxonomy(), priorityCountries(), listFeed(tenant, { mode, ...params, seed: `${new Date().toISOString().slice(0, 10)}:${params.cursor ?? ""}` }),
    listFeed(tenant, { mode: "new", limit: 5 }), latestSeq(tenant), recentActivity(tenant, 6), roleLabels(tenant),
  ]);
  const names = {
    countries: Object.fromEntries(tax.countries.map((c) => [c.iso2, c.name])),
    topics: Object.fromEntries(tax.topics.map((t) => [t.slug, t.name])),
  };
  const filterQs = new URLSearchParams(Object.entries({ country: params.country, topic: params.topic, lang: params.lang }).filter(([, v]) => v) as [string, string][]).toString();
  const nextHref = feed.nextCursor ? `${base}?${new URLSearchParams({ ...(params.country && { country: params.country }), ...(params.topic && { topic: params.topic }), cursor: feed.nextCursor })}` : null;
  const newest = fresh.items[0]?.published_at ?? new Date().toISOString();
  const filtered = Boolean(params.country || params.topic || params.lang);
  return (
    <LiveEventsProvider cursor={cursor}>
      <section className="container-pv pt-3 pb-2 sm:pt-6 sm:pb-3">
        {!showHero && <h1 className="mb-3 text-[24px] font-extrabold tracking-tight sm:text-[30px]">{MODE_LABELS[mode]} conversations</h1>}
        {showHero && (
          <div className="mb-3 sm:mb-4">
            <h1 className="text-[23px] font-extrabold leading-tight tracking-tight sm:text-[38px]">Africa has a lot to talk about.</h1>
            <p className="mt-1 hidden text-[17px] text-muted sm:block">Today&apos;s news. Yesterday&apos;s lessons. Conversations worth sharing.</p>
          </div>
        )}
        <FilterBar base={base} countries={prio} allCountries={tax.countries} topics={tax.topics} country={params.country} topic={params.topic} lang={params.lang} />
        <div className="mt-2 sm:mt-3"><FeedTabs active={mode} params={params} /></div>
      </section>
      <NewDiscussionsBanner />
      <div className="container-pv grid grid-cols-1 gap-6 lg:grid-cols-12">
        <section aria-label="Fresh conversations" className="lg:col-span-8">
          <h2 className="sr-only">Fresh conversations</h2>
          {feed.items.length === 0 ? (
            <div className="card p-6">
              <p className="text-lg font-semibold">{filtered ? "We don't have a verified story for these filters yet." : "We're finding stories worth your time."}</p>
              <p className="mt-1 text-muted">{filtered ? "Explore all Africa or change the topic." : "Check back soon or explore our latest verified features."}</p>
              {filtered && <Link href={base} className="btn btn-secondary mt-4">Explore all Africa</Link>}
            </div>
          ) : (
            <ol className="flex flex-col gap-3" data-testid="feed-list">
              {feed.items.map((p, i) => (
                <li key={p.id}><StoryCard p={p} names={names} featured={i === 0 && !params.cursor} headingLevel={2} roleLabels={labels} /></li>
              ))}
            </ol>
          )}
          {nextHref && <div className="mt-4"><Link href={nextHref} className="btn btn-secondary" rel="next">More stories</Link></div>}
          <div className="mt-6"><SponsoredSlot tenant={tenant} position="feed_inline" /></div>
        </section>
        <aside aria-label="Discover" className="flex flex-col gap-4 lg:col-span-4">
          <LiveActivity initial={activity} labels={labels} />
          <div className="card p-5">
            <h2 className="text-lg font-bold">Discover</h2>
            <ul className="mt-2 divide-y divide-border">
              <li className="py-3"><Link href="/take-me-back" className="font-semibold hover:underline inline-flex items-center gap-2"><History size={16} aria-hidden="true" />Time Lens</Link>
                <p className="text-sm text-muted">Some of today&apos;s questions have a longer history.</p></li>
              <li className="py-3"><Link href="/founders" className="font-semibold hover:underline inline-flex items-center gap-2"><Rocket size={16} aria-hidden="true" />Founder Spotlight</Link>
                <p className="text-sm text-muted">Meet people building products, services, and ideas across Africa.</p></li>
            </ul>
          </div>
          <div className="card p-5">
            <h2 className="text-lg font-bold">New publications</h2>
            {fresh.items.length === 0 ? <p className="mt-2 text-sm text-muted">Nothing published yet.</p> : (
              <ul className="mt-2 divide-y divide-border">
                {fresh.items.map((p) => (
                  <li key={p.id} className="py-2.5">
                    <Link href={pieceHref(p)} className="font-semibold leading-snug hover:underline">{p.headline}</Link>
                    <p className="meta"><Time value={p.published_at} />{p.is_demo ? " · Demo content" : ""}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="card p-5">
            <h2 className="text-lg font-bold">Explore by topic</h2>
            <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-[15px]">
              {tax.groups.map((g) => <li key={g.slug}><Link href={`/topics#${g.slug}`} className="font-semibold hover:underline">{g.name}</Link></li>)}
            </ul>
          </div>
          <SponsoredSlot tenant={tenant} position="home_rail" />
        </aside>
      </div>
    </LiveEventsProvider>
  );
}
