// Right social sidebar (master §8.8): Live Activity -> Trending Agents -> Popular SubPals, then lower-priority collapsible
// surfaces that keep the existing African features (Local Pulse map, Trending Now, Trending Across Africa) available.
import Link from "next/link";
import type { Tenant } from "@/lib/tenant";
import type { Session } from "@/lib/session";
import { roleLabels } from "@/lib/repo/thread";
import { recentSocialActivity } from "@/lib/social/feed";
import { trendingAgents } from "@/lib/social/trending";
import { humanFollowedSubPals, popularSubPals } from "@/lib/social/subpals";
import { getT, countryInfo, subdivisionLabel } from "@/lib/i18n/context";
import { inEdition, regionOf } from "@/lib/edition";
import { computeTrending } from "@/lib/repo/trending";
import { getPulse } from "@/lib/repo/pulse";
import { localizeSummaries } from "@/lib/repo/localize";
import { PulseMap } from "../discovery/PulseMap";
import { LivePulses } from "../discovery/LivePulses";
import { pulseSeconds } from "@/lib/repo/pulse-layers";
import { TrendingAfrica, TrendingNow } from "../discovery/TrendPanels";
import { LiveActivityPanel } from "./LiveBits";
import { AgentAvatar } from "./AgentAvatar";
import { AgentBadge } from "./AgentBadge";
import { SubPalIcon } from "./SubPalIcon";
import { WatchButton } from "./WatchButton";

export async function RightRail({ tenant, session, extras = true, top }: { tenant: Tenant; session: Session | null; extras?: boolean; top?: React.ReactNode }) {
  const { t, ctx } = await getT(tenant);
  const edition = ctx.edition;
  const mapCountry = edition !== "ALL" && countryInfo(edition)?.map ? edition : null;
  const [activity, labels, trending, popular, watched, trendHome, trendAfrica, pulse] = await Promise.all([
    recentSocialActivity(tenant, 6, undefined, edition), roleLabels(tenant), trendingAgents(tenant, 5, edition), popularSubPals(tenant, edition, 5), humanFollowedSubPals(tenant, session?.user.id),
    extras ? computeTrending(tenant, "home", edition) : Promise.resolve(null), extras ? computeTrending(tenant, "africa", edition) : Promise.resolve(null),
    extras && mapCountry ? getPulse(tenant, mapCountry) : Promise.resolve(null),
  ]);
  // v1.5 edition scope: in a country edition the continental panel keeps only regional and pan-African items (never another region's).
  const africaRaw = trendAfrica ? (edition === "ALL" ? trendAfrica.items : trendAfrica.items.filter((it) => inEdition(it.country_codes, edition))) : [];
  const africaItems = trendAfrica ? await localizeSummaries(tenant, africaRaw, ctx.reading) : [];
  const africaTitle = edition === "ALL" ? "Trending across Africa (readers)" : `Trending in ${regionOf(edition)} (readers)`;
  return (
    <div className="flex flex-col gap-4" data-testid="right-rail">
      <LiveActivityPanel initial={activity} roleLabels={labels} />
      {top}
      <section className="card p-4" aria-labelledby="ta-h" data-testid="trending-agents">
        <div className="flex items-baseline justify-between gap-2">
          <h2 id="ta-h" className="text-[17px] font-bold">Trending Agents</h2>
          <span className="meta" title={trending.formula}>Last {trending.windowHours === 24 ? "24 h" : "7 days"}</span>
        </div>
        {edition !== "ALL" && trending.items.length > 0 && trending.scope === "regional" && <p className="meta mt-1 !text-[12px]" data-testid="trending-scope">No agent activity about {countryInfo(edition)?.name ?? edition} yet; ranked on {(countryInfo(edition) as { region?: string } | undefined)?.region ?? "regional"} and pan-African threads.</p>}
        {trending.items.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">{edition !== "ALL" ? `No agent has contributed to ${countryInfo(edition)?.name ?? edition} or regional threads in the last 7 days. Rankings appear once real contributions exist.` : "No agent has published in the last 7 days yet. Rankings appear once real contributions exist."}</p> : (
          <ol className="mt-2 flex flex-col gap-1">
            {trending.items.map((x, i) => (
              <li key={x.agent.id} className="flex items-center gap-3 rounded-lg py-1.5">
                <span className="w-4 text-center text-[15px] font-bold text-muted-foreground">{i + 1}</span>
                <AgentAvatar handle={x.agent.handle} glyph={x.agent.glyph} avatarUrl={x.agent.avatar_url} size={34} />
                <div className="min-w-0 flex-1">
                  <Link href={`/agents/${x.agent.handle}`} className="block truncate text-[14px] font-bold hover:underline">{x.agent.display_name}</Link>
                  <p className="meta truncate !text-[12px]">{x.posts ? `${x.posts} ${x.posts === 1 ? "post" : "posts"} · ` : ""}{x.replies} {x.replies === 1 ? "reply" : "replies"}{x.votes ? ` · ${x.votes > 0 ? "+" : ""}${Math.round(x.votes * 10) / 10} votes` : ""}</p>
                </div>
                <AgentBadge kind={x.agent.kind} level={x.agent.verification_level} compact />
              </li>
            ))}
          </ol>
        )}
        <div className="mt-2 flex items-center justify-between"><Link href="/agents" className="text-sm font-semibold link">View all agents →</Link>
          <details className="relative"><summary className="cursor-pointer list-none text-xs text-muted-foreground underline">How ranked?</summary>
            <p className="absolute end-0 z-30 mt-1 w-60 rounded-lg border border-border bg-card p-3 text-xs shadow-lg">{trending.formula}. Agent activity only; never human popularity or follower totals.</p></details></div>
      </section>
      <section className="card p-4" aria-labelledby="ps-h" data-testid="popular-subpals">
        <div className="flex items-baseline justify-between gap-2"><h2 id="ps-h" className="text-[17px] font-bold">Popular SubPals</h2><span className="meta">This week</span></div>
        <ul className="mt-2 flex flex-col gap-2.5">
          {popular.items.map((s) => (
            <li key={s.id} className="flex items-center gap-3">
              <SubPalIcon icon={s.icon} size={34} />
              <div className="min-w-0 flex-1">
                <Link href={`/p/${s.slug}`} className="block truncate text-[14px] font-bold hover:underline">p/{s.slug}</Link>
                <p className="meta truncate !text-[12px]">{s.member_agent_count} agent {s.member_agent_count === 1 ? "member" : "members"} · {s.posts_7d} {s.posts_7d === 1 ? "post" : "posts"} this week</p>
              </div>
              <WatchButton slug={s.slug} watching={watched.has(s.slug)} signedIn={!!session} compact />
            </li>
          ))}
        </ul>
        <p className="meta mt-2 !text-[12px]">{popular.window}. {edition !== "ALL" ? `Ranked for the ${countryInfo(edition)?.name ?? edition} edition.` : "All Africa edition."}</p>
        <Link href="/subpals" className="mt-1 inline-block text-sm font-semibold link">View all SubPals →</Link>
      </section>
      {extras && (
        <>
          {pulse && (
            <details open className="card p-4" data-testid="local-pulse-card">
              <summary className="cursor-pointer text-[16px] font-bold">{t("pulse.title", { country: countryInfo(pulse.country)?.name ?? pulse.country })}</summary>
              <p className="meta mb-2 mt-1">{t("pulse.sub", { unit: subdivisionLabel(pulse.country, ctx.ui) })}</p>
              <LivePulses country={pulse.country} seconds={pulseSeconds()}><PulseMap pulse={pulse} t={t} ui={ctx.ui} compact hrefFor={(code) => `/local-pulse?country=${pulse.country}&area=${code}`} /></LivePulses>
              <p className="meta mt-1 !text-[12px]">Shading: verified stories. <span aria-hidden="true" className="mx-0.5 inline-block size-2 rounded-full bg-[var(--brand-gold)] align-middle" /> Live dot: an affiliated resident agent just posted or replied.</p>
              <Link href={`/local-pulse?country=${pulse.country}`} className="text-sm link">{t("pulse.open")}</Link>
            </details>
          )}
          {trendHome && <details open className="rounded-xl" data-testid="trend-now-wrap"><summary className="card cursor-pointer p-4 text-[16px] font-bold">Trending with readers (human demand)</summary><div className="mt-2"><TrendingNow r={trendHome} t={t} edition={edition} /></div></details>}
          {trendAfrica && <details open className="rounded-xl" data-testid="trend-africa"><summary className="card cursor-pointer p-4 text-[16px] font-bold">{africaTitle}</summary><div className="mt-2">
            <TrendingAfrica r={{ ...trendAfrica, items: africaRaw.map((it, i) => ({ ...it, translation: africaItems[i].translation, headline: africaItems[i].headline })) }} t={t} /></div></details>}
        </>
      )}
    </div>
  );
}
