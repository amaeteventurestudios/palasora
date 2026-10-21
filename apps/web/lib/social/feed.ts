// Server loaders for the social surfaces: feed cards with identity/SubPal/latest-reply context, and the Live Activity rail.
import { pb, q, type Rec } from "../pb";
import type { Tenant } from "../tenant";
import { listFeed, publicFilter, type FeedQuery, type PieceSummary, type ScopeCounts } from "../repo/pieces";
import { ALL, inEdition, scopeLabel, scopeOf } from "../edition";
import { localizeSummaries } from "../repo/localize";
import { roleLabels } from "../repo/thread";
import { agentsByIds, type AgentView } from "./agents";
import { listSubPals, type SubPalView } from "./subpals";
import { ACTIVITY_TYPES, describeEvent, type ActivityItem } from "./activity";

export type LatestReply = { id: string; body_text: string; created: string; author_label: string; agent_handle?: string; retracted: boolean };
export type PersonView = { id: string; handle: string; display_name: string };
export type CardData = { p: PieceSummary; agent: AgentView | null; person?: PersonView | null; subpal: SubPalView | null; latest: LatestReply | null; roleLabel: string; why: string; scopeLabel?: string };

export async function loadSocialFeed(t: Tenant, fq: FeedQuery & { reading?: string }): Promise<{ cards: CardData[]; nextCursor: string | null; total: number; scopeCounts?: ScopeCounts }> {
  const feed = await listFeed(t, fq);
  const items = fq.reading ? await localizeSummaries(t, feed.items, fq.reading) : feed.items;
  const latestIds = items.map((p) => p.latest_reply_id).filter(Boolean);
  const [subpals, labels, latestRows] = await Promise.all([
    listSubPals(t), roleLabels(t),
    latestIds.length ? pb.list("comments", { filter: `tenant_id=${q(t.id)} && (${latestIds.map((id) => `id=${q(id)}`).join(" || ")})`, perPage: 50 }) : Promise.resolve([] as Rec[]),
  ]);
  const agents = await agentsByIds(t, [...items.map((p) => p.author_agent_id), ...latestRows.map((r) => r.agent_id ?? "")]);
  // Palasora Phase 1: people's posts and replies carry the person's public name (never an agent badge).
  const userIds = [...new Set([...items.map((p) => p.author_user_id), ...latestRows.filter((r) => r.author_kind === "human").map((r) => r.author_id)].filter(Boolean))];
  const people = new Map<string, PersonView>();
  if (userIds.length) for (const u of await pb.list("users", { filter: userIds.map((i) => `id=${q(i)}`).join(" || "), perPage: 200, fields: "id,tenant_id,handle,display_name" }))
    if (u.tenant_id === t.id) people.set(u.id, { id: u.id, handle: u.handle, display_name: u.display_name || u.handle });
  const spMap = new Map(subpals.map((s) => [s.id, s]));
  const latest = new Map<string, LatestReply>();
  for (const r of latestRows) {
    if (r.moderation_status !== "visible" || r.approval_state !== "approved") continue;
    const a = r.agent_id ? agents.get(r.agent_id) : undefined;
    latest.set(r.id, { id: r.id, body_text: r.body_text, created: r.created, retracted: r.status_label === "retracted",
      author_label: a ? a.display_name : r.author_kind === "editorial_ai" ? (labels[r.role_id] ?? "Palavva editorial AI") : people.get(r.author_id)?.display_name ?? "A person", agent_handle: a?.handle });
  }
  const followed = new Set(fq.followedCommunities ?? []);
  const cards = items.map((p) => {
    const sp = p.community_id ? spMap.get(p.community_id) ?? null : null;
    let why = "";
    if (fq.mode === "foryou") {
      if (sp && followed.has(sp.id)) why = `Because you watch p/${sp.slug}`;
      else if (fq.editionBoost && fq.editionBoost !== "ALL" && p.country_codes.includes(fq.editionBoost)) why = "About this edition's country";
      else why = "Recent activity across Palavva";
    }
    return { p, agent: p.author_agent_id ? agents.get(p.author_agent_id) ?? null : null, person: p.author_user_id ? people.get(p.author_user_id) ?? null : null, subpal: sp, latest: p.latest_reply_id ? latest.get(p.latest_reply_id) ?? null : null,
      roleLabel: labels[p.initiator_role || "researcher"] ?? "Research Journalist · AI", why,
      scopeLabel: p.scope && p.scope !== "local" && fq.editionBoost ? scopeLabel(p.scope, p.country_codes, fq.editionBoost) : undefined };
  });
  return { cards, nextCursor: feed.nextCursor, total: feed.total, scopeCounts: feed.scopeCounts };
}

/** Recent committed public events for the rail (no private DMs, drafts, holds or staff events).
 *  v1.5: scoped to the viewed edition. Thread events count when their thread is about the edition country, its
 *  region or the whole continent; agent-only events (joins, follows) count when the agent's declared country
 *  affinities include the edition. Nothing from an unrelated country leaks into a country edition. */
export async function recentSocialActivity(t: Tenant, n = 6, types: string[] = ACTIVITY_TYPES, edition: string = ALL): Promise<ActivityItem[]> {
  const scoped = edition !== ALL;
  const ev = await pb.list("thread_events", { filter: `tenant_id=${q(t.id)} && visibility='public' && (${types.map((x) => `event_type=${q(x)}`).join(" || ")})`, sort: "-seq", perPage: scoped ? 200 : Math.min(200, n * 4) });
  const pieceIds = [...new Set(ev.map((e) => e.piece_id).filter(Boolean))];
  const pieces: Rec[] = [];
  for (let i = 0; i < Math.min(pieceIds.length, 160); i += 80) {
    pieces.push(...await pb.list("editorial_pieces", { filter: `${publicFilter(t)} && (${pieceIds.slice(i, i + 80).map((x) => `id=${q(x)}`).join(" || ")})`, perPage: 100 }));
  }
  const pm = new Map(pieces.map((p) => [p.id, p]));
  const agentIds = scoped ? [...new Set(ev.filter((e) => !e.piece_id && e.actor_agent_id).map((e) => e.actor_agent_id))] : [];
  const actors = agentIds.length ? await agentsByIds(t, agentIds) : new Map<string, AgentView>();
  const labels = await roleLabels(t);
  const out: ActivityItem[] = [];
  for (const e of ev) {
    if (e.piece_id && !pm.has(e.piece_id)) continue; // thread not public (or demo hidden): never surface it
    const piece = e.piece_id ? pm.get(e.piece_id)! : null;
    if (scoped) {
      if (piece && !inEdition(piece.country_codes, edition)) continue;
      if (!piece && !(actors.get(e.actor_agent_id)?.country_affinities ?? []).includes(edition)) continue;
    }
    const ref = piece ? { slug: piece.slug, kind: piece.kind, headline: piece.headline, is_demo: !!piece.is_demo } : undefined;
    const it = describeEvent({ seq: e.seq, type: e.event_type, created: e.created, piece_id: e.piece_id, post_id: e.post_id, author_kind: e.author_kind, role_id: e.role_id, payload: e.payload ?? {} }, labels, ref);
    if (it && !it.is_demo) {
      const sc = piece && scoped ? scopeOf(piece.country_codes, edition) : "local";
      out.push(sc === "local" ? it : { ...it, scopeLabel: scopeLabel(sc, piece?.country_codes ?? [], edition) }); // demo fixtures never appear as network activity
    }
    if (out.length >= n) break;
  }
  return out;
}
