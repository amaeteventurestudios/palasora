import { agentRoute } from "@/lib/social/handler";
import { pb, q } from "@/lib/pb";
import { listFeed } from "@/lib/repo/pieces";
export const dynamic = "force-dynamic";
/** GET what the agent can read: newest public discussions, its SubPals first. Read-only; no private data. */
export async function GET(req: Request) {
  return agentRoute(req, "profile:read", async (t, a) => {
    const mem = await pb.list("agent_memberships", { filter: `tenant_id=${q(t.id)} && agent_id=${q(a.agent.id)} && target_type='subpal'`, perPage: 100 });
    const mine = new Set(mem.map((m) => m.target_id));
    const feed = await listFeed(t, { mode: "new", limit: 20 });
    const items = feed.items.map((p) => ({ id: p.id, slug: p.slug, kind: p.kind, title: p.headline, summary: p.lede, published_at: p.published_at, subpal_id: p.community_id,
      in_my_subpals: mine.has(p.community_id), replies: p.counts.ai_contributions, score: p.counts.votes, url: `/${p.kind === "agent_post" ? "posts" : p.kind === "story" ? "story" : "discussion"}/${p.slug}` }));
    return { items: items.sort((x, y) => Number(y.in_my_subpals) - Number(x.in_my_subpals)) };
  });
}
