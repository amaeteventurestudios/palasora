// Server loaders for the social surfaces: feed cards with identity/SubPal/latest-reply context, and the Live Activity rail.
import { pb, q, type Rec } from "../pb";
import type { Tenant } from "../tenant";
import { listFeed, publicFilter, type FeedQuery, type PieceSummary } from "../repo/pieces";
import { localizeSummaries } from "../repo/localize";
import { roleLabels } from "../repo/thread";
import { agentsByIds, type AgentView } from "./agents";
import { listSubPals, type SubPalView } from "./subpals";
import { ACTIVITY_TYPES, describeEvent, type ActivityItem } from "./activity";

export type LatestReply = { id: string; body_text: string; created: string; author_label: string; agent_handle?: string; retracted: boolean };
export type CardData = { p: PieceSummary; agent: AgentView | null; subpal: SubPalView | null; latest: LatestReply | null; roleLabel: string; why: string };

export async function loadSocialFeed(t: Tenant, fq: FeedQuery & { reading?: string }): Promise<{ cards: CardData[]; nextCursor: string | null; total: number }> {
  const feed = await listFeed(t, fq);
  const items = fq.reading ? await localizeSummaries(t, feed.items, fq.reading) : feed.items;
  const latestIds = items.map((p) => p.latest_reply_id).filter(Boolean);
  const [subpals, labels, latestRows] = await Promise.all([
    listSubPals(t), roleLabels(t),
    latestIds.length ? pb.list("comments", { filter: `tenant_id=${q(t.id)} && (${latestIds.map((id) => `id=${q(id)}`).join(" || ")})`, perPage: 50 }) : Promise.resolve([] as Rec[]),
  ]);
  const agents = await agentsByIds(t, [...items.map((p) => p.author_agent_id), ...latestRows.map((r) => r.agent_id ?? "")]);
  const spMap = new Map(subpals.map((s) => [s.id, s]));
  const latest = new Map<string, LatestReply>();
  for (const r of latestRows) {
    if (r.moderation_status !== "visible" || r.approval_state !== "approved") continue;
    const a = r.agent_id ? agents.get(r.agent_id) : undefined;
    latest.set(r.id, { id: r.id, body_text: r.body_text, created: r.created, retracted: r.status_label === "retracted",
      author_label: a ? a.display_name : r.author_kind === "editorial_ai" ? (labels[r.role_id] ?? "Palavva editorial AI") : "Reader", agent_handle: a?.handle });
  }
  const followed = new Set(fq.followedCommunities ?? []);
  const cards = items.map((p) => {
    const sp = p.community_id ? spMap.get(p.community_id) ?? null : null;
    let why = "";
    if (fq.mode === "foryou") {
      if (sp && followed.has(sp.id)) why = `Because you watch p/${sp.slug}`;
      else if (fq.editionBoost && fq.editionBoost !== "ALL" && p.country_codes.includes(fq.editionBoost)) why = "About your home edition";
      else why = "Recent activity across Palavva";
    }
    return { p, agent: p.author_agent_id ? agents.get(p.author_agent_id) ?? null : null, subpal: sp, latest: p.latest_reply_id ? latest.get(p.latest_reply_id) ?? null : null,
      roleLabel: labels[p.initiator_role || "researcher"] ?? "Research Journalist · AI", why };
  });
  return { cards, nextCursor: feed.nextCursor, total: feed.total };
}

/** Recent committed public events for the rail (no private DMs, drafts, holds or staff events). */
export async function recentSocialActivity(t: Tenant, n = 6, types: string[] = ACTIVITY_TYPES): Promise<ActivityItem[]> {
  const ev = await pb.list("thread_events", { filter: `tenant_id=${q(t.id)} && visibility='public' && (${types.map((x) => `event_type=${q(x)}`).join(" || ")})`, sort: "-seq", perPage: Math.min(200, n * 4) });
  const pieceIds = [...new Set(ev.map((e) => e.piece_id).filter(Boolean))];
  const pieces = pieceIds.length ? await pb.list("editorial_pieces", { filter: `${publicFilter(t)} && (${pieceIds.slice(0, 80).map((i) => `id=${q(i)}`).join(" || ")})`, perPage: 100 }) : [];
  const pm = new Map(pieces.map((p) => [p.id, p]));
  const labels = await roleLabels(t);
  const out: ActivityItem[] = [];
  for (const e of ev) {
    if (e.piece_id && !pm.has(e.piece_id)) continue; // thread not public (or demo hidden): never surface it
    const ref = e.piece_id ? { slug: pm.get(e.piece_id)!.slug, kind: pm.get(e.piece_id)!.kind, headline: pm.get(e.piece_id)!.headline, is_demo: !!pm.get(e.piece_id)!.is_demo } : undefined;
    const it = describeEvent({ seq: e.seq, type: e.event_type, created: e.created, piece_id: e.piece_id, post_id: e.post_id, author_kind: e.author_kind, role_id: e.role_id, payload: e.payload ?? {} }, labels, ref);
    if (it && !it.is_demo) out.push(it); // demo fixtures never appear as network activity
    if (out.length >= n) break;
  }
  return out;
}
