import Link from "next/link";
import { Rocket } from "lucide-react";
import { listFeed } from "@/lib/repo/pieces";
import { priorityCountries, taxonomy } from "@/lib/repo/taxonomy";
import { type FeedMode } from "@/lib/feed";
import type { Tenant } from "@/lib/tenant";
import { FeedTabs } from "./FeedTabs";
import { FilterBar } from "./FilterBar";
import { StoryCard, pieceHref } from "./StoryCard";
import { SponsoredSlot } from "./SponsoredSlot";
import { PLACEMENTS, slotsFor } from "@/lib/ads/inventory";
import { Time } from "./Time";
import { LiveEventsProvider } from "./live/LiveEvents";
import { LiveActivity, NewDiscussionsBanner } from "./live/FeedLive";
import { latestSeq, recentActivity, roleLabels } from "@/lib/repo/thread";
import { getT } from "@/lib/i18n/context";
import { countryInfo, subdivisionLabel } from "@/lib/i18n/context";
import { localizeSummaries } from "@/lib/repo/localize";
import { computeTrending } from "@/lib/repo/trending";
import { getPulse } from "@/lib/repo/pulse";
import { PulseMap } from "./discovery/PulseMap";
import { TrendingAfrica, TrendingNow } from "./discovery/TrendPanels";

export type FeedParams = { country?: string; topic?: string; lang?: string; cursor?: string };

export function cleanParams(sp: Record<string, string | string[] | undefined>): FeedParams {
  const one = (v: unknown) => (typeof v === "string" ? v : undefined);
  const country = one(sp.country)?.toUpperCase();
  const topic = one(sp.topic)?.toLowerCase();
  return {
    country: country && /^[A-Z]{2}$/.test(country) ? country : undefined,
    topic: topic && /^[a-z0-9-]{1,60}$/.test(topic) ? topic : undefined,
    lang: one(sp.lang) && /^[a-z]{2,3}$/.test(one(sp.lang)!) ? one(sp.lang) : undefined,
    cursor: one(sp.cursor)?.slice(0, 40),
  };
}

export async function FeedView({ tenant, mode, params, base, showHero = true }: { tenant: Tenant; mode: FeedMode; params: FeedParams; base: string; showHero?: boolean }) {
  const { t, ctx } = await getT(tenant);
  const edition = ctx.edition;
  // (ISSUE-16 sponsored cards are placed by density below; see adAt.)
  const mapCountry = edition !== "ALL" && countryInfo(edition)?.map ? edition : null;
  const [tax, prio, feed, fresh, cursor, activity, labels, trendHome, trendAfrica, pulse] = await Promise.all([
    taxonomy(), priorityCountries(),
    listFeed(tenant, { mode, ...params, seed: `${new Date().toISOString().slice(0, 10)}:${params.cursor ?? ""}`, editionBoost: edition }),
    listFeed(tenant, { mode: "new", limit: 5 }), latestSeq(tenant), recentActivity(tenant, 6), roleLabels(tenant),
    computeTrending(tenant, "home", edition), computeTrending(tenant, "africa", edition), mapCountry ? getPulse(tenant, mapCountry) : Promise.resolve(null),
  ]);
  const [items, africaItems] = await Promise.all([localizeSummaries(tenant, feed.items, ctx.reading), localizeSummaries(tenant, trendAfrica.items, ctx.reading)]);
  const names = {
    countries: Object.fromEntries(tax.countries.map((c) => [c.iso2, c.name])),
    topics: Object.fromEntries(tax.topics.map((x) => [x.slug, x.name])),
  };
  const nextHref = feed.nextCursor ? `${base}?${new URLSearchParams({ ...(params.country && { country: params.country }), ...(params.topic && { topic: params.topic }), cursor: feed.nextCursor })}` : null;
  const filtered = Boolean(params.country || params.topic || params.lang);
  const africaWithTranslation = trendAfrica.items.map((it, i) => ({ ...it, translation: africaItems[i].translation, headline: africaItems[i].headline }));
  const adAt = new Set(slotsFor(PLACEMENTS.find((p) => p.key === "feed_inline")!, items.length));
  return (
    <LiveEventsProvider cursor={cursor}>
      <section className="container-pv pt-3 pb-2 sm:pt-6 sm:pb-3">
        {!showHero && <h1 className="mb-3 text-[24px] font-extrabold tracking-tight sm:text-[30px]">{t("feed.conversations", { mode: t(`tab.${mode}` as never) })}</h1>}
        {showHero && (
          <div className="mb-3 sm:mb-4">
            <h1 className="text-[23px] font-extrabold leading-tight tracking-tight sm:text-[38px]">{t("home.h1")}</h1>
            <p className="mt-1 hidden text-[17px] text-muted-foreground sm:block">{t("home.sub")}</p>
          </div>
        )}
        <FilterBar base={base} countries={prio} allCountries={tax.countries} topics={tax.topics} country={params.country} topic={params.topic} lang={params.lang} t={t} />
        <div className="mt-2 sm:mt-3"><FeedTabs active={mode} params={params} t={t} /></div>
      </section>
      <NewDiscussionsBanner />
      <div className="container-pv grid grid-cols-1 gap-6 lg:grid-cols-12">
        <section aria-label="Fresh conversations" className="lg:col-span-8">
          <h2 className="sr-only">Fresh conversations</h2>
          {items.length === 0 ? (
            <div className="card p-6">
              <p className="text-lg font-semibold">{filtered ? t("feed.filteredEmptyTitle") : t("feed.emptyTitle")}</p>
              <p className="mt-1 text-muted-foreground">{filtered ? t("feed.filteredEmptyBody") : t("feed.emptyBody")}</p>
              {filtered && <Link href={base} className="btn btn-secondary mt-4">{t("feed.exploreAll")}</Link>}
            </div>
          ) : (
            <ol className="flex flex-col gap-3" data-testid="feed-list">
              {items.map((p, i) => [
                <li key={p.id}><StoryCard p={p} names={names} featured={i === 0 && !params.cursor} headingLevel={2} roleLabels={labels} t={t} /></li>,
                adAt.has(i) ? <SponsoredSlot key={`ad-${i}`} tenant={tenant} position="feed_inline" wrap="li" /> : null])}
            </ol>
          )}
          {nextHref && <div className="mt-4"><Link href={nextHref} className="btn btn-secondary" rel="next">{t("feed.more")}</Link></div>}
        </section>
        <aside aria-label="Discover" className="flex flex-col gap-4 lg:col-span-4">
          {pulse && (
            <section className="card p-5" aria-labelledby="pulse-h" data-testid="local-pulse-card">
              <div className="flex items-baseline justify-between gap-2">
                <h2 id="pulse-h" className="text-lg font-bold">{t("pulse.title", { country: countryInfo(pulse.country)?.name ?? pulse.country })}</h2>
                <Link href={`/local-pulse?country=${pulse.country}`} className="text-sm link">{t("pulse.open")}</Link>
              </div>
              <p className="meta mb-2">{t("pulse.sub", { unit: subdivisionLabel(pulse.country, ctx.ui) })}</p>
              <PulseMap pulse={pulse} t={t} ui={ctx.ui} compact hrefFor={(code) => `/local-pulse?country=${pulse.country}&area=${code}`} />
            </section>
          )}
          <TrendingNow r={trendHome} t={t} edition={edition} />
          <TrendingAfrica r={{ ...trendAfrica, items: africaWithTranslation }} t={t} />
          <LiveActivity initial={activity} labels={labels} />
          <div className="card p-5">
            <h2 className="text-lg font-bold">{t("rail.discover")}</h2>
            <ul className="mt-2 divide-y divide-border">
              <li className="py-3"><Link href="/founders" className="inline-flex items-center gap-2 font-semibold hover:underline"><Rocket size={16} aria-hidden="true" />{t("rail.foundersTitle")}</Link>
                <p className="text-sm text-muted-foreground">{t("rail.foundersSub")}</p></li>
            </ul>
          </div>
          <div className="card p-5">
            <h2 className="text-lg font-bold">{t("rail.newPubs")}</h2>
            {fresh.items.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">{t("rail.nothing")}</p> : (
              <ul className="mt-2 divide-y divide-border">
                {fresh.items.map((p) => (
                  <li key={p.id} className="py-2.5">
                    <Link href={pieceHref(p)} className="font-semibold leading-snug hover:underline" dir="auto">{p.headline}</Link>
                    <p className="meta"><Time value={p.published_at} />{p.is_demo ? ` · ${t("card.demo")}` : ""}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="card p-5">
            <h2 className="text-lg font-bold">{t("rail.exploreTopics")}</h2>
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
