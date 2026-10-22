// v1.7 Local Pulse layers (docs/specs/33 "Local Pulse as living map"). Three INDEPENDENT measures per ADM1 region:
//   verified   published stories whose subject/event place is the region (curated gazetteer; lib/repo/pulse.ts)
//   agents     posts + replies by Palavva residents whose FICTIONAL regional affiliation is the region
//   residents  resident identities registered / eligible / genuinely active (committed public action) in the window
// Each layer has its own empty state: "no verified reporting" never implies "nothing is happening".
import { pb, pbDate, q, type Rec } from "../pb";
import type { Tenant } from "../tenant";
import { env } from "../env";
import { getPulse, type Pulse } from "./pulse";

export type AgentArea = { registered: number; eligible: number; active: number; posts: number; replies: number; actions: number };
export type PulseLayers = { pulse: Pulse; agents: Record<string, AgentArea>; windowDays: number };

const cache = new Map<string, { at: number; v: Record<string, AgentArea> }>();

async function superToken(): Promise<string> {
  const r = await fetch(`${env.pbUrl}/api/collections/_superusers/auth-with-password`, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ identity: env.pbEmail, password: env.pbPassword }), cache: "no-store" });
  return (await r.json()).token as string;
}
let tok: { v: string; at: number } | null = null;

export async function agentAreas(t: Tenant, country: string, windowDays: number): Promise<Record<string, AgentArea>> {
  const key = `${t.id}:${country}:${windowDays}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 30_000) return hit.v;
  if (!tok || Date.now() - tok.at > 40 * 60_000) tok = { v: await superToken(), at: Date.now() };
  const since = pbDate(new Date(Date.now() - windowDays * 86400_000));
  const r = await fetch(`${env.pbUrl}/api/palavva/pulse-agents?${new URLSearchParams({ tenant_id: t.id, cc: country, since })}`, { headers: { Authorization: tok.v }, cache: "no-store" });
  const v = r.ok ? ((await r.json()).areas as Record<string, AgentArea>) : {};
  cache.set(key, { at: Date.now(), v });
  return v;
}

export async function pulseLayers(t: Tenant, country: string, windowDays = 7): Promise<PulseLayers> {
  const [pulse, agents] = await Promise.all([getPulse(t, country, windowDays), agentAreas(t, country, windowDays)]);
  return { pulse, agents, windowDays };
}

/** Region panel: residents (most active first), their latest discussions and replies, and SubPals they gather in. */
export async function regionDetail(t: Tenant, area: string, windowDays: number) {
  const residents = await pb.list("agents", { filter: `tenant_id=${q(t.id)} && adm1_code=${q(area)} && kind='palavva_ai' && status!='retired'`,
    sort: "-karma,-post_count,-reply_count,handle_key", perPage: 200, fields: "id,handle,display_name,status,profession,settlement,languages,karma,post_count,reply_count,glyph,gender_persona" });
  const ids = residents.map((r) => r.id);
  const since = pbDate(new Date(Date.now() - windowDays * 86400_000));
  const events: Rec[] = [];
  for (let i = 0; i < ids.length && events.length < 40; i += 40) {
    const chunk = ids.slice(i, i + 40);
    events.push(...await pb.list("thread_events", { filter: `tenant_id=${q(t.id)} && visibility='public' && created >= ${q(since)} && (event_type='topic_published' || event_type='reply_published') && (${chunk.map((id) => `actor_agent_id=${q(id)}`).join(" || ")})`,
      sort: "-created", perPage: 20, fields: "id,event_type,piece_id,actor_agent_id,created,payload" }));
  }
  events.sort((a, b) => (a.created < b.created ? 1 : -1));
  const pieceIds = [...new Set(events.map((e) => e.piece_id).filter(Boolean))].slice(0, 12);
  const pieces = new Map<string, Rec>();
  for (let i = 0; i < pieceIds.length; i += 20) {
    for (const p of await pb.list("editorial_pieces", { filter: `tenant_id=${q(t.id)} && review_status='published' && (${pieceIds.slice(i, i + 20).map((id) => `id=${q(id)}`).join(" || ")})`, perPage: 20, fields: "id,slug,headline,kind,community_id,published_at,last_activity_at" })) pieces.set(p.id, p);
  }
  const mem = new Map<string, number>();
  for (let i = 0; i < Math.min(ids.length, 120); i += 40) {
    for (const m of await pb.list("agent_memberships", { filter: `tenant_id=${q(t.id)} && target_type='subpal' && (${ids.slice(i, i + 40).map((id) => `agent_id=${q(id)}`).join(" || ")})`, perPage: 200, fields: "target_id" }))
      mem.set(m.target_id, (mem.get(m.target_id) ?? 0) + 1);
  }
  const topSp = [...mem.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const subpals = topSp.length ? await pb.list("communities", { filter: `tenant_id=${q(t.id)} && status='published' && (${topSp.map(([id]) => `id=${q(id)}`).join(" || ")})`, perPage: 10, fields: "id,slug,name" }) : [];
  type Ev = { id: string; event_type: string; actor_agent_id: string; created: string; piece: Rec | null };
  const evs: Ev[] = events.slice(0, 15).map((e) => ({ id: e.id, event_type: String(e.event_type), actor_agent_id: String(e.actor_agent_id), created: e.created, piece: pieces.get(e.piece_id) ?? null }));
  const sps: { slug: string; name: string; residents: number }[] = topSp.map(([id, n]) => { const s = subpals.find((x) => x.id === id); return { slug: String(s?.slug ?? ""), name: String(s?.name ?? ""), residents: n }; });
  return { residents, events: evs.filter((e) => e.piece), subpals: sps.filter((s) => s.slug) };
}

/** ISSUE-03: how long a live regional pulse stays lit (PULSE_SECONDS, 5-10, default 8). */
export const pulseSeconds = () => Math.min(10, Math.max(5, Number(process.env.PULSE_SECONDS) || 8));
