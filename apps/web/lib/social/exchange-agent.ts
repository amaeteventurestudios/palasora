// Exchange access for an authenticated agent (key or Palavva service). The economy service enforces owner limits, bands,
// reservations and same-owner wash prevention; this layer only resolves identity and the owner key.
import { economyGet, economyPost } from "../economy";
import type { Tenant } from "../tenant";
import type { AgentActor } from "./auth";
import { SocialError } from "./write";

export const ownerKeyOf = (a: Record<string, any>) => (a.owner_type === "user" && a.owner_user_id ? `user:${a.owner_user_id}` : `seed:${a.id}`);

export async function agentExchange(_t: Tenant, actor: AgentActor, market: string) {
  const [summary, companies, portfolio] = await Promise.all([economyGet(`/summary?market=${market}`), economyGet(`/companies?market=${market}`), economyGet(`/agents/${actor.agent.id}/portfolio`)]);
  if (!summary) throw new SocialError("UNAVAILABLE", "Exchange service unavailable");
  return { summary, companies, portfolio, disclosure: "Virtual currency (Sora) and simulated companies only. No real money or securities." };
}

export async function agentOrder(_t: Tenant, actor: AgentActor, b: { company?: string; side?: string; price?: number; qty?: number; client_request_id?: string; reason?: string }) {
  if (actor.agent.status !== "active") throw new SocialError("FORBIDDEN", "Agent is not active");
  if ((actor.agent.permissions ?? {}).trade === false) throw new SocialError("FORBIDDEN", "Agent lacks the trade permission");
  const co = await economyGet<{ company: { id: string } }>(`/companies/${encodeURIComponent(String(b.company ?? ""))}`);
  if (!co) throw new SocialError("NOT_FOUND", "Unknown company or ticker");
  const crid = String(b.client_request_id ?? "").replace(/[^A-Za-z0-9:_-]/g, "").slice(0, 60);
  if (crid.length < 6) throw new SocialError("INVALID", "client_request_id (6-60 chars) is required for idempotency");
  const r = await fetchOrder({ agent_id: actor.agent.id, owner_key: ownerKeyOf(actor.agent), company_id: co.company.id, side: b.side, price: Number(b.price), qty: Number(b.qty),
    idem_key: `api:${actor.agent.id}:${crid}`, reason: String(b.reason ?? "").slice(0, 400), decision_ref: actor.origin });
  return r;
}

async function fetchOrder(body: Record<string, unknown>) {
  const { env } = await import("../env");
  const r = await fetch(`${env.editorialUrl}/economy/orders`, { method: "POST", cache: "no-store", headers: { "x-service-token": env.editorialToken, "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(8000) }).catch(() => null);
  if (!r) throw new SocialError("UNAVAILABLE", "Exchange service unavailable");
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new SocialError(r.status === 404 ? "NOT_FOUND" : "INVALID", j?.detail?.message ?? "Order refused", { code: j?.detail?.code });
  return j;
}
void economyPost;
