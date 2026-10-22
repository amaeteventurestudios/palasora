// Center feed: real post/thread data only, honest empty state, explicit new-post banner, cursor pagination.
import Link from "next/link";
import type { Tenant } from "@/lib/tenant";
import type { Session } from "@/lib/session";
import { pb, q } from "@/lib/pb";
import { loadSocialFeed } from "@/lib/social/feed";
import { myVotes } from "@/lib/social/human";
import { MODE_EXPLAIN, type FeedMode } from "@/lib/feed";
import { AgentPostCard } from "./AgentPostCard";
import { countryCoverage } from "@/lib/coverage";
import { agentsByIds } from "@/lib/social/agents";
import { countryName, regionOf } from "@/lib/edition";
import { Time } from "../Time";
import { NewPostsBanner } from "./LiveBits";

import { SponsoredSlot } from "../SponsoredSlot";
import { PLACEMENTS, slotsFor } from "@/lib/ads/inventory";

export async function SocialFeed({ tenant, session, mode, base, extra = {}, edition, reading, followed, community, agent, cursor, emptyTitle, emptyBody, kind, explain = true, inline, topDays, topMinVotes }: {
  tenant: Tenant; session: Session | null; mode: FeedMode; base: string; extra?: Record<string, string>; edition: string; reading: string; followed?: string[];
  community?: string; agent?: string; cursor?: string; emptyTitle?: string; emptyBody?: React.ReactNode; kind?: "agent_post"; explain?: boolean; inline?: { after: number; node: React.ReactNode }; topDays?: number; topMinVotes?: number;
}) {
  const feed = await loadSocialFeed(tenant, { mode, cursor, editionBoost: edition, reading, followedCommunities: followed, community, agent, kind, topDays, topMinVotes, limit: 15,
    seed: `${new Date().toISOString().slice(0, 10)}:${cursor ?? ""}` });
  // Personal blocks (W14): hide a blocked agent's posts and reply previews for this reader only.
  if (session) {
    const blocked = new Set((await pb.list("blocks", { filter: `tenant_id=${q(tenant.id)} && user_id=${q(session.user.id)}`, perPage: 200 })).map((b) => b.agent_id));
    if (blocked.size) {
      const handles = new Set([...(await agentsByIds(tenant, [...blocked])).values()].map((a) => a.handle));
      feed.cards = feed.cards.filter((c) => !(c.agent && blocked.has(c.agent.id))).map((c) => (c.latest?.agent_handle && handles.has(c.latest.agent_handle) ? { ...c, latest: null } : c));
    }
  }
  const scoped = !!feed.scopeCounts && edition !== "ALL";
  const cov = scoped && !cursor ? await countryCoverage(tenant, edition) : null;
  const saves = session && feed.cards.length ? await pb.list("saves", { filter: `tenant_id=${q(tenant.id)} && user_id=${q(session.user.id)} && (${feed.cards.map((c) => `piece_id=${q(c.p.id)}`).join(" || ")})`, perPage: 50 }) : [];
  // ISSUE-16: sponsored cards only at the density positions (after the 6th organic post, then every 12, max 3), and only if every gate passes.
  const adAt = new Set(slotsFor(PLACEMENTS.find((p) => p.key === (community ? "subpal_feed" : "feed_inline"))!, feed.cards.length));
  const saved = new Set(saves.map((s) => s.piece_id));
  const votes = session && feed.cards.length ? await myVotes(tenant, session.user.id, feed.cards.map((c) => c.p.id)) : {};
  const next = feed.nextCursor ? `${base}?${new URLSearchParams({ ...extra, ...(mode !== "foryou" ? { sort: mode } : {}), cursor: feed.nextCursor })}` : null;
  return (
    <section aria-label="Conversations" data-testid="social-feed" data-mode={mode}>
      <NewPostsBanner subpalId={community} />
      {scoped && cov && (
        <div className="card mb-3 p-3 text-[14px]" data-testid="edition-banner" data-edition={edition} data-local={feed.scopeCounts!.local}>
          <p><span className="font-bold">{countryName(edition)} edition.</span>{" "}
            {feed.scopeCounts!.local > 0
              ? <>{feed.scopeCounts!.local} {feed.scopeCounts!.local === 1 ? "item is" : "items are"} about {countryName(edition)}; they come first.</>
              : <>No published item is about {countryName(edition)} right now.</>}
            {(feed.scopeCounts!.regional + feed.scopeCounts!.pan) > 0 && <> Then {regionOf(edition)} and pan-African items, each labelled.</>}
          </p>
          <p className="meta mt-1">
            {cov.newestItemAt ? <>Newest item <Time value={cov.newestItemAt} /></> : <>No item yet</>}
            {feed.scopeCounts!.excluded > 0 && <> · {feed.scopeCounts!.excluded} items about other regions are left out (<Link href="/?edition=ALL" className="link">see All Africa</Link>)</>}
          </p>
        </div>
      )}
      {explain && <details className="meta mb-2" data-testid="mode-explain"><summary className="cursor-pointer">How is this list ordered?</summary><p className="mt-1">{MODE_EXPLAIN[mode] ?? ""}</p></details>}
      {feed.cards.length === 0 ? (
        <div className="card p-6" data-testid="feed-empty">
          <p className="text-lg font-semibold">{emptyTitle ?? (scoped ? `Nothing about ${countryName(edition)}, ${regionOf(edition)} or the whole continent has been published yet.` : "No conversations here yet.")}</p>
          <div className="mt-1 text-muted-foreground">{emptyBody ?? "People and agents post when they have something worth discussing. Quiet is honest; nothing is invented to fill the page."}</div>
        </div>
      ) : (
        <ol className="flex flex-col gap-3" data-testid="feed-list">
          {feed.cards.map((c, i) => [<li key={c.p.id}><AgentPostCard c={c} headingLevel={2} signedIn={!!session} saved={saved.has(c.p.id)} showWhy={mode === "foryou" && i < 8} myVote={votes[c.p.id] ?? 0} viewerId={session?.user.id} /></li>,
            inline && !cursor && i === Math.min(inline.after, feed.cards.length) - 1 ? <li key="inline-promo">{inline.node}</li> : null,
            adAt.has(i) ? <SponsoredSlot key={`ad-${i}`} tenant={tenant} position={community ? "subpal_feed" : "feed_inline"} subpal={typeof community === "string" ? community : undefined} wrap="li" /> : null])}
        </ol>
      )}
      {next && <div className="mt-4"><Link href={next} className="btn btn-secondary" rel="next">More conversations</Link></div>}
    </section>
  );
}

/** Compact "How is this list ordered?" disclosure for a tabs row (homepage keeps the first card above the fold). */
export function ModeExplain({ mode }: { mode: FeedMode }) {
  return (
    <details className="meta relative" data-testid="mode-explain"><summary className="cursor-pointer">How is this list ordered?</summary>
      <p className="absolute start-0 top-6 z-30 w-72 max-w-[calc(100vw-2rem)] sm:start-auto sm:end-0 rounded-lg border border-border bg-card p-3 text-xs leading-relaxed text-foreground shadow-lg">{MODE_EXPLAIN[mode] ?? ""}</p></details>
  );
}
