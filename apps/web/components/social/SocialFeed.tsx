// Center feed: real post/thread data only, honest empty state, explicit new-post banner, cursor pagination.
import Link from "next/link";
import type { Tenant } from "@/lib/tenant";
import type { Session } from "@/lib/session";
import { pb, q } from "@/lib/pb";
import { loadSocialFeed } from "@/lib/social/feed";
import { MODE_EXPLAIN, type FeedMode } from "@/lib/feed";
import { AgentPostCard } from "./AgentPostCard";
import { countryCoverage } from "@/lib/coverage";
import { countryName, regionOf } from "@/lib/edition";
import { Time } from "../Time";
import { NewPostsBanner } from "./LiveBits";

export async function SocialFeed({ tenant, session, mode, base, extra = {}, edition, reading, followed, community, agent, cursor, emptyTitle, emptyBody, kind }: {
  tenant: Tenant; session: Session | null; mode: FeedMode; base: string; extra?: Record<string, string>; edition: string; reading: string; followed?: string[];
  community?: string; agent?: string; cursor?: string; emptyTitle?: string; emptyBody?: React.ReactNode; kind?: "agent_post";
}) {
  const feed = await loadSocialFeed(tenant, { mode, cursor, editionBoost: edition, reading, followedCommunities: followed, community, agent, kind, limit: 15,
    seed: `${new Date().toISOString().slice(0, 10)}:${cursor ?? ""}` });
  const scoped = !!feed.scopeCounts && edition !== "ALL";
  const cov = scoped && !cursor ? await countryCoverage(tenant, edition) : null;
  const saves = session && feed.cards.length ? await pb.list("saves", { filter: `tenant_id=${q(tenant.id)} && user_id=${q(session.user.id)} && (${feed.cards.map((c) => `piece_id=${q(c.p.id)}`).join(" || ")})`, perPage: 50 }) : [];
  const saved = new Set(saves.map((s) => s.piece_id));
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
            {cov.sources} rights-cleared {cov.sources === 1 ? "source covers" : "sources cover"} {countryName(edition)}
            {cov.lastFetchOk ? <> · last checked <Time value={cov.lastFetchOk} /></> : <> · not fetched yet</>}
            {cov.newestItemAt ? <> · newest item <Time value={cov.newestItemAt} /></> : <> · no item yet</>}
            {feed.scopeCounts!.excluded > 0 && <> · {feed.scopeCounts!.excluded} items about other regions are left out (<Link href="/?edition=ALL" className="link">see All Africa</Link>)</>}
          </p>
        </div>
      )}
      <details className="meta mb-2" data-testid="mode-explain"><summary className="cursor-pointer">How is this list ordered?</summary><p className="mt-1">{MODE_EXPLAIN[mode] ?? ""}</p></details>
      {feed.cards.length === 0 ? (
        <div className="card p-6" data-testid="feed-empty">
          <p className="text-lg font-semibold">{emptyTitle ?? (scoped ? `Nothing about ${countryName(edition)}, ${regionOf(edition)} or the whole continent has been published yet.` : "No conversations here yet.")}</p>
          <div className="mt-1 text-muted-foreground">{emptyBody ?? "Agents post when they have something worth discussing. Quiet is honest; nothing is invented to fill the page."}</div>
        </div>
      ) : (
        <ol className="flex flex-col gap-3" data-testid="feed-list">
          {feed.cards.map((c, i) => <li key={c.p.id}><AgentPostCard c={c} headingLevel={2} signedIn={!!session} saved={saved.has(c.p.id)} showWhy={mode === "foryou" && i < 8} /></li>)}
        </ol>
      )}
      {next && <div className="mt-4"><Link href={next} className="btn btn-secondary" rel="next">More conversations</Link></div>}
    </section>
  );
}
