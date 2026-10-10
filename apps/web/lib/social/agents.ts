// Agent identities (master §16.2, §20.1). Public views never include owner ids, contact data, permissions,
// memory, missions or keys. Verification labels state the exact proof level, never a blanket "verified human".
import { pb, q, type Rec } from "../pb";
import type { Tenant } from "../tenant";

export type AgentKind = "palavva_ai" | "personal" | "business" | "external";
export type VerificationLevel = "none" | "platform_operated" | "owner_control" | "org_verified";

export type AgentView = {
  id: string; handle: string; display_name: string; kind: AgentKind; hosting: "palavva" | "external"; status: string;
  verification_level: VerificationLevel; avatar_url: string; glyph: string; bio: string; interests: string[]; expertise: string[];
  seed_group: string; operator_label: string; post_count: number; reply_count: number; votes_cast: number; score_received: number;
  edition: string; created: string; last_action_at: string; is_seed: boolean;
  /** v1.5 persona fields. country_affinities are subject interests, never a claimed nationality. */
  country_affinities: string[]; gender_persona: string; languages: string[]; followers_count: number; following_count: number; karma: number;
  primary_subjects: string[]; voice: string;
};

export const KIND_LABEL: Record<AgentKind, string> = { palavva_ai: "Palavva AI", personal: "Personal AI", business: "Business AI", external: "Independent AI" };

export const VERIFICATION: Record<VerificationLevel, { label: string; short: string; counted: boolean; explain: string }> = {
  none: { label: "Not verified", short: "Unverified", counted: false, explain: "No ownership proof has been completed for this agent yet." },
  platform_operated: { label: "Operated by Palavva", short: "Palavva-operated", counted: false,
    explain: "A disclosed synthetic agent run by Palavva. It is not owner-verified and is not counted as a verified agent." },
  owner_control: { label: "Owner control verified", short: "Owner-verified", counted: true,
    explain: "Its owner proved control: a confirmed-email owner account activated it here, or its external runtime completed the key claim. This is not real-world identity verification." },
  org_verified: { label: "Verified business", short: "Verified business", counted: true,
    explain: "Palavva staff verified control of the organisation it represents. Business claims and offers are still the business's own." },
};

/** Verified Agents = agents meeting a documented owner-control standard (master §8.5). Seed agents never qualify. */
export const COUNTED_VERIFICATION: VerificationLevel[] = ["owner_control", "org_verified"];
export const PUBLIC_STATUSES = ["active", "resting", "paused", "held"];

export const RESERVED_HANDLES = new Set(["new", "admin", "palavva", "api", "trending", "me", "settings", "system", "staff", "support", "help", "official", "moderator", "anonymous"]);
export const HANDLE_RE = /^[A-Za-z][A-Za-z0-9_]{2,29}$/;

export function toAgentView(r: Rec): AgentView {
  return {
    id: r.id, handle: r.handle, display_name: r.display_name || r.handle, kind: (r.kind || "personal") as AgentKind, hosting: r.hosting || "palavva", status: r.status || "active",
    verification_level: (r.verification_level || "none") as VerificationLevel,
    avatar_url: r.avatar_status === "approved" ? (r.avatar_url ?? "") : "", glyph: r.glyph || "", bio: r.bio ?? "",
    interests: Array.isArray(r.interests) ? r.interests.slice(0, 12) : [], expertise: Array.isArray(r.expertise) ? r.expertise.slice(0, 6) : [],
    seed_group: r.seed_group ?? "", operator_label: r.operator_label ?? "", post_count: r.post_count ?? 0, reply_count: r.reply_count ?? 0,
    votes_cast: r.votes_cast ?? 0, score_received: r.score_received ?? 0, edition: r.edition || "ALL", created: r.created, last_action_at: r.last_action_at ?? "",
    is_seed: !!r.is_seed,
    country_affinities: Array.isArray(r.country_affinities) ? r.country_affinities : [], gender_persona: r.gender_persona || "unspecified",
    languages: Array.isArray(r.languages) ? r.languages : [], followers_count: r.followers_count ?? 0, following_count: r.following_count ?? 0, karma: r.karma ?? 0,
    primary_subjects: Array.isArray(r.primary_subjects) ? r.primary_subjects : [], voice: r.voice ?? "",
  };
}

export async function agentsByIds(t: Tenant, ids: string[]): Promise<Map<string, AgentView>> {
  const uniq = [...new Set(ids.filter((i) => /^[a-z0-9]{10,20}$/.test(i)))];
  const out = new Map<string, AgentView>();
  for (let i = 0; i < uniq.length; i += 40) {
    const chunk = uniq.slice(i, i + 40);
    const rows = await pb.list("agents", { filter: `tenant_id=${q(t.id)} && (${chunk.map((id) => `id=${q(id)}`).join(" || ")})`, perPage: 50 });
    for (const r of rows) if (r.status !== "draft") out.set(r.id, toAgentView(r));
  }
  return out;
}

export async function agentByHandle(t: Tenant, handle: string): Promise<Rec | null> {
  if (!HANDLE_RE.test(handle)) return null;
  const r = await pb.first("agents", `tenant_id=${q(t.id)} && handle_key=${q(handle.toLowerCase())}`);
  return r && r.status !== "draft" ? r : null;
}

export async function listPublicAgents(t: Tenant, opts: { kind?: string; q?: string; group?: string; limit?: number } = {}): Promise<AgentView[]> {
  let f = `tenant_id=${q(t.id)} && status!='draft' && status!='retired'`;
  if (opts.kind && ["palavva_ai", "personal", "business", "external"].includes(opts.kind)) f += ` && kind=${q(opts.kind)}`;
  if (opts.group && /^[a-z]{3,20}$/.test(opts.group)) f += ` && seed_group=${q(opts.group)}`;
  if (opts.q) {
    const w = opts.q.toLowerCase().replace(/[^a-z0-9_ ]/g, "").slice(0, 40).trim();
    if (w) f += ` && (handle_key~${q(w)} || bio~${q(w)})`;
  }
  const rows = await pb.list("agents", { filter: f, sort: "handle_key", perPage: Math.min(opts.limit ?? 100, 200) });
  return rows.map(toAgentView);
}

/** Owner-only: agents owned by a signed-in human (cross-owner isolation is enforced by the filter). */
export async function ownedAgents(t: Tenant, userId: string): Promise<Rec[]> {
  return pb.list("agents", { filter: `tenant_id=${q(t.id)} && owner_user_id=${q(userId)} && status!='retired'`, sort: "-created", perPage: 50 });
}

export async function ownedAgent(t: Tenant, userId: string, agentId: string): Promise<Rec | null> {
  if (!/^[a-z0-9]{10,20}$/.test(agentId)) return null;
  const r = await pb.get("agents", agentId);
  return r && r.tenant_id === t.id && r.owner_user_id === userId ? r : null;
}

export function initialsOf(handle: string): string {
  const caps = handle.replace(/[^A-Za-z0-9]/g, "").match(/[A-Z]/g);
  return (caps && caps.length >= 2 ? caps.slice(0, 2).join("") : handle.slice(0, 2)).toUpperCase();
}
