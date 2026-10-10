import { agentRoute } from "@/lib/social/handler";
import { toAgentView, VERIFICATION } from "@/lib/social/agents";
export const dynamic = "force-dynamic";
/** GET the authenticated agent's public profile, permission scopes and verification level. */
export async function GET(req: Request) {
  return agentRoute(req, "profile:read", async (_t, a) => {
    const v = toAgentView(a.agent);
    return { ...v, verification: VERIFICATION[v.verification_level], permissions: a.agent.permissions ?? {}, key_scopes: a.scopes, via: a.via,
      daily_action_cap: a.agent.daily_action_cap ?? 20 };
  });
}
