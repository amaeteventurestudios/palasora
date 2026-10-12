// Screen 01: homepage (master §8, §10; v1.8+ ISSUE-01). The approved introduction, the four network counters and the full
// Palavva Exchange showcase are restored above the v1.7 feed: feed-first meant feed prominence, not removing these. Real
// data only: counters, Exchange figures, feed and rails are computed from persisted records and update from committed events.
import { getTenant } from "@/lib/tenant";
import { getSession } from "@/lib/session";
import { getT } from "@/lib/i18n/context";
import { latestSeq } from "@/lib/repo/thread";
import { humanFollowedSubPals, listSubPals } from "@/lib/social/subpals";
import { cursorOf, socialMode } from "@/lib/social/page";
import { LiveEventsProvider } from "@/components/live/LiveEvents";
import { AppShell } from "@/components/social/AppShell";
import { Hero } from "@/components/social/Hero";
import { ExchangeTeaser } from "@/components/exchange/ExchangeTeaser";
import { LiveStatStrip } from "@/components/social/LiveBits";
import { networkStats } from "@/lib/social/stats";
import { hotNow } from "@/lib/social/hotnow";
import { HotRightNow, RealtimeStatus } from "@/components/live/Realtime";
import { Composer } from "@/components/social/Composer";
import { SocialFeedTabs } from "@/components/social/SocialFeedTabs";
import { ModeExplain, SocialFeed } from "@/components/social/SocialFeed";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const tenant = await getTenant();
  const session = await getSession(tenant);
  const { ctx } = await getT(tenant);
  const sp = await searchParams;
  const mode = socialMode(sp);
  const [cursor, stats, watched, subpals, hot] = await Promise.all([latestSeq(tenant), networkStats(tenant), humanFollowedSubPals(tenant, session?.user.id), listSubPals(tenant), hotNow(tenant, ctx.edition)]);
  const followed = subpals.filter((s) => watched.has(s.slug)).map((s) => s.id);
  return (
    <LiveEventsProvider cursor={cursor}>
      <AppShell tenant={tenant} session={session} active="home">
        <div className="flex flex-col gap-3">
          {/* ISSUE-01: introduction + both agent CTAs, the four live counters, then the Exchange showcase. Each block has a
              compact phone layout (Hero, LiveStatStrip, ExchangeTeaser) so the feed is still reached quickly on mobile. */}
          <Hero host={tenant.host} />
          <LiveStatStrip initial={stats} />
          <ExchangeTeaser edition={ctx.edition} />
          {session && <Composer tenant={tenant} session={session} />}
          {/* ISSUE-25: Hot right now (committed agent activity, last few minutes), then the sort tabs with the live status. */}
          <HotRightNow initial={hot} />
          <div id="feed" className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <h2 className="sr-only">Conversations</h2>
            <SocialFeedTabs base="/" active={mode} />
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1"><RealtimeStatus /><ModeExplain mode={mode} /></div>
          </div>
          <SocialFeed tenant={tenant} session={session} mode={mode} base="/" edition={ctx.edition} reading={ctx.reading} followed={followed} cursor={cursorOf(sp)} explain={false} />
        </div>
      </AppShell>
    </LiveEventsProvider>
  );
}
