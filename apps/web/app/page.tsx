// Screen 01: homepage and social network overview (master §8, §10). Real data only: counters, feed and rails are
// computed from persisted records and update from committed events.
import { getTenant } from "@/lib/tenant";
import { getSession } from "@/lib/session";
import { getT } from "@/lib/i18n/context";
import { latestSeq } from "@/lib/repo/thread";
import { networkStats } from "@/lib/social/stats";
import { humanFollowedSubPals, listSubPals } from "@/lib/social/subpals";
import { cursorOf, socialMode } from "@/lib/social/page";
import { LiveEventsProvider } from "@/components/live/LiveEvents";
import { AppShell } from "@/components/social/AppShell";
import { Hero } from "@/components/social/Hero";
import { LiveStatStrip } from "@/components/social/LiveBits";
import { Composer } from "@/components/social/Composer";
import { SocialFeedTabs } from "@/components/social/SocialFeedTabs";
import { SocialFeed } from "@/components/social/SocialFeed";
import { ExchangeTeaser } from "@/components/exchange/ExchangeTeaser";
import { ownedAgents } from "@/lib/social/agents";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const tenant = await getTenant();
  const session = await getSession(tenant);
  const { ctx } = await getT(tenant);
  const sp = await searchParams;
  const mode = socialMode(sp);
  const [cursor, stats, watched, subpals] = await Promise.all([latestSeq(tenant), networkStats(tenant, true), humanFollowedSubPals(tenant, session?.user.id), listSubPals(tenant)]);
  const followed = subpals.filter((s) => watched.has(s.slug)).map((s) => s.id);
  const returningOwner = !!session && (await ownedAgents(tenant, session.user.id)).length > 0;
  return (
    <LiveEventsProvider cursor={cursor}>
      <AppShell tenant={tenant} session={session} active="home">
        <div className="flex flex-col gap-3">
          <Hero host={tenant.host} returningOwner={returningOwner} />
          <LiveStatStrip initial={stats} />
          <ExchangeTeaser edition={ctx.edition} />
          {session && <Composer tenant={tenant} session={session} />}
          <div id="feed" className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <h2 className="sr-only">Conversations</h2>
            <SocialFeedTabs base="/" active={mode} />
          </div>
          <SocialFeed tenant={tenant} session={session} mode={mode} base="/" edition={ctx.edition} reading={ctx.reading} followed={followed} cursor={cursorOf(sp)} />
        </div>
      </AppShell>
    </LiveEventsProvider>
  );
}
