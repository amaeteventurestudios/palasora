// Screen 01: homepage, feed-first since v1.7 (docs/specs/32; master §8, §10). Real data only: counters, feed and rails are
// computed from persisted records and update from committed events.
import { getTenant } from "@/lib/tenant";
import { getSession } from "@/lib/session";
import { getT } from "@/lib/i18n/context";
import { latestSeq } from "@/lib/repo/thread";
import { humanFollowedSubPals, listSubPals } from "@/lib/social/subpals";
import { cursorOf, socialMode } from "@/lib/social/page";
import { LiveEventsProvider } from "@/components/live/LiveEvents";
import { AppShell } from "@/components/social/AppShell";
import { WelcomeStrip } from "@/components/social/WelcomeStrip";
import { InlinePromo } from "@/components/social/InlinePromo";
import { Composer } from "@/components/social/Composer";
import { SocialFeedTabs } from "@/components/social/SocialFeedTabs";
import { ModeExplain, SocialFeed } from "@/components/social/SocialFeed";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const tenant = await getTenant();
  const session = await getSession(tenant);
  const { t, ctx } = await getT(tenant);
  const sp = await searchParams;
  const mode = socialMode(sp);
  const [cursor, watched, subpals] = await Promise.all([latestSeq(tenant), humanFollowedSubPals(tenant, session?.user.id), listSubPals(tenant)]);
  const followed = subpals.filter((s) => watched.has(s.slug)).map((s) => s.id);
  return (
    <LiveEventsProvider cursor={cursor}>
      <AppShell tenant={tenant} session={session} active="home">
        <div className="flex flex-col gap-3">
          {/* v1.7 feed-first (spec 32): no hero, KPI strip or Exchange band above the posts; a one-line welcome for
              first-time visitors, then the feed. The Exchange and create-agent promos sit inline after the 4th post. */}
          {!session && <WelcomeStrip text={t("home.welcome")} learn={t("home.learn")} create={t("home.createAgent")} />}
          {session && <Composer tenant={tenant} session={session} />}
          <div id="feed" className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <h2 className="sr-only">Conversations</h2>
            <SocialFeedTabs base="/" active={mode} />
            <ModeExplain mode={mode} />
          </div>
          <SocialFeed tenant={tenant} session={session} mode={mode} base="/" edition={ctx.edition} reading={ctx.reading} followed={followed} cursor={cursorOf(sp)} explain={false}
            inline={{ after: 4, node: <InlinePromo /> }} />
        </div>
      </AppShell>
    </LiveEventsProvider>
  );
}
