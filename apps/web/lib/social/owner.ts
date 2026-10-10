// Owner-only reads (cross-owner isolation by owner_user_id in every filter).
import { pb, q, type Rec } from "../pb";
import type { Tenant } from "../tenant";
import { publicFilter } from "../repo/pieces";

export type DigestItem = { at: string; kind: string; decision: string; reason: string; href: string | null; label: string; tokens: number; trigger: string };

export async function agentActivity(t: Tenant, agentId: string, sinceHours = 168, limit = 60): Promise<DigestItem[]> {
  const since = new Date(Date.now() - sinceHours * 3600_000).toISOString().replace("T", " ");
  const rows = await pb.list("agent_actions", { filter: `tenant_id=${q(t.id)} && agent_id=${q(agentId)} && created >= ${q(since)}`, sort: "-created", perPage: limit });
  const pieceIds = new Set<string>();
  for (const r of rows) if (r.target_kind === "piece" && r.target_id) pieceIds.add(r.target_id);
  const comments = rows.filter((r) => r.target_kind === "comment" && r.target_id).map((r) => r.target_id);
  const cm = comments.length ? await pb.list("comments", { filter: `tenant_id=${q(t.id)} && (${comments.slice(0, 50).map((i) => `id=${q(i)}`).join(" || ")})`, fields: "id,piece_id", perPage: 60 }) : [];
  for (const c of cm) pieceIds.add(c.piece_id);
  for (const r of rows) if (r.decision === "post" && r.result_id) pieceIds.add(r.result_id);
  const pieces = pieceIds.size ? await pb.list("editorial_pieces", { filter: `${publicFilter(t)} && (${[...pieceIds].slice(0, 60).map((i) => `id=${q(i)}`).join(" || ")})`, perPage: 80 }) : [];
  const pm = new Map(pieces.map((p) => [p.id, p]));
  const cmap = new Map(cm.map((c) => [c.id, c.piece_id]));
  const href = (p: Rec | undefined, post?: string) => (p ? `/${p.kind === "agent_post" ? "posts" : p.kind === "story" ? "story" : "discussion"}/${p.slug}${post ? `#post-${post}` : ""}` : null);
  return rows.map((r) => {
    const pieceId = r.decision === "post" ? r.result_id : r.target_kind === "piece" ? r.target_id : cmap.get(r.target_id);
    const p = pieceId ? pm.get(pieceId) : undefined;
    return { at: r.created, kind: r.target_kind, decision: r.reason === "in progress" ? "in progress" : r.decision, reason: r.reason, href: href(p, r.decision === "reply" ? r.result_id : undefined),
      label: p?.headline ?? (r.target_kind === "subpal" ? "a SubPal" : r.trigger === "owner_task" ? "your instruction" : ""), tokens: (r.tokens_in ?? 0) + (r.tokens_out ?? 0), trigger: r.trigger };
  });
}

export async function ownerUsageToday(t: Tenant, ownerId: string): Promise<{ used: number; allowance: number; rows: Rec[] }> {
  const day = new Date().toISOString().slice(0, 10);
  const rows = await pb.list("wallet_ledger", { filter: `tenant_id=${q(t.id)} && wallet_owner=${q(ownerId)} && day=${q(day)}`, sort: "-created", perPage: 100 });
  return { used: rows.filter((r) => r.entry_type === "usage_debit").length, allowance: Number(process.env.OWNER_FREE_DAILY_AI_ACTIONS ?? 10), rows };
}
