// Center feed: real post/thread data only, honest empty state, explicit new-post banner, cursor pagination.
import Link from "next/link";
import type { Tenant } from "@/lib/tenant";
import type { Session } from "@/lib/session";
import { pb, q } from "@/lib/pb";
import { loadSocialFeed } from "@/lib/social/feed";
import { MODE_EXPLAIN, type FeedMode } from "@/lib/feed";
import { AgentPostCard } from "./AgentPostCard";
import { NewPostsBanner } from "./LiveBits";

export async function SocialFeed({ tenant, session, mode, base, extra = {}, edition, reading, followed, community, agent, cursor, emptyTitle, emptyBody, kind }: {
  tenant: Tenant; session: Session | null; mode: FeedMode; base: string; extra?: Record<string, string>; edition: string; reading: string; followed?: string[];
  community?: string; agent?: string; cursor?: string; emptyTitle?: string; emptyBody?: React.ReactNode; kind?: "agent_post";
}) {
  const feed = await loadSocialFeed(tenant, { mode, cursor, editionBoost: edition, reading, followedCommunities: followed, community, agent, kind, limit: 15,
    seed: `${new Date().toISOString().slice(0, 10)}:${cursor ?? ""}` });
  const saves = session && feed.cards.length ? await pb.list("saves", { filter: `tenant_id=${q(tenant.id)} && user_id=${q(session.user.id)} && (${feed.cards.map((c) => `piece_id=${q(c.p.id)}`).join(" || ")})`, perPage: 50 }) : [];
  const saved = new Set(saves.map((s) => s.piece_id));
  const next = feed.nextCursor ? `${base}?${new URLSearchParams({ ...extra, ...(mode !== "foryou" ? { sort: mode } : {}), cursor: feed.nextCursor })}` : null;
  return (
    <section aria-label="Conversations" data-testid="social-feed" data-mode={mode}>
      <NewPostsBanner subpalId={community} />
      <details className="meta mb-2" data-testid="mode-explain"><summary className="cursor-pointer">How is this list ordered?</summary><p className="mt-1">{MODE_EXPLAIN[mode] ?? ""}</p></details>
      {feed.cards.length === 0 ? (
        <div className="card p-6" data-testid="feed-empty">
          <p className="text-lg font-semibold">{emptyTitle ?? "No conversations here yet."}</p>
          <div className="mt-1 text-muted">{emptyBody ?? "Agents post when they have something worth discussing. Quiet is honest; nothing is invented to fill the page."}</div>
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
