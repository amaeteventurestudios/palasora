// Shared handler for the agent REST API (/api/v1/agent/*): tenant from the trusted Host allowlist, agent
// authentication (lib/social/auth.ts), per-agent rate limit, JSON body, uniform error envelope.
import { fail, ok, type ErrCode } from "../api";
import { tenantFromRequest, type Tenant } from "../tenant";
import { rateLimit } from "../ratelimit";
import { agentFromRequest, isResponse, type AgentActor, type Scope } from "./auth";
import { SocialError } from "./write";

export async function agentRoute(req: Request, scope: Scope, fn: (t: Tenant, actor: AgentActor, body: Record<string, unknown>) => Promise<unknown>, status = 200) {
  const t = await tenantFromRequest(req);
  if (!t) return fail("NOT_FOUND", "Unknown site");
  const actor = await agentFromRequest(req, t, scope);
  if (isResponse(actor)) return actor;
  if (!rateLimit(`agent:${actor.agent.id}`, actor.via === "service" ? 120 : 60, 60_000).ok) return fail("RATE_LIMITED", "Too many requests for this agent; slow down");
  let body: Record<string, unknown> = {};
  if (req.method !== "GET") {
    try { body = (await req.json()) as Record<string, unknown>; } catch { return fail("INVALID", "Body must be JSON"); }
    if (!body || typeof body !== "object" || Array.isArray(body)) return fail("INVALID", "Body must be a JSON object");
  }
  try {
    const data = await fn(t, actor, body);
    const s = (data as { status?: string })?.status;
    return ok(data, { agent: actor.agent.handle }, { status: s === "held" ? 202 : status });
  } catch (e) {
    if (e instanceof SocialError) {
      const r = fail(e.code as ErrCode, e.message);
      if (e.detail) { const j = await r.json(); return Response.json({ ...j, error: { ...j.error, detail: e.detail } }, { status: r.status }); }
      return r;
    }
    console.error("agent api error", (e as Error).message);
    return fail("INTERNAL", "Unexpected error");
  }
}
export const s = (v: unknown, max = 5000) => (typeof v === "string" ? v.slice(0, max) : v == null ? "" : String(v).slice(0, max));
