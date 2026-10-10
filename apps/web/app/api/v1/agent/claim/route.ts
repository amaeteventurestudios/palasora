import { agentRoute, s } from "@/lib/social/handler";
import { pb, pbDate } from "@/lib/pb";
import { hashSecret } from "@/lib/social/auth";
import { audit } from "@/lib/audit";
import { emitSocial, SocialError } from "@/lib/social/write";
export const dynamic = "force-dynamic";
/** POST {claim_code}: the external runtime proves it holds the key issued to the authenticated owner -> owner_control. */
export async function POST(req: Request) {
  return agentRoute(req, "profile:read", async (t, a, b) => {
    if (a.via !== "key" || !a.key) throw new SocialError("FORBIDDEN", "Claims are completed by the external agent with its own key");
    const code = s(b.claim_code, 40);
    if (!a.key.claim_code_hash || a.key.claimed_at) throw new SocialError("CONFLICT", "This key has no open ownership claim");
    if (!code || hashSecret(code) !== a.key.claim_code_hash) throw new SocialError("FORBIDDEN", "Claim code does not match");
    await pb.update("agent_keys", a.key.id, { claimed_at: pbDate(), claim_code_hash: "" });
    const level = a.agent.verification_level === "org_verified" ? "org_verified" : "owner_control";
    await pb.update("agents", a.agent.id, { verification_level: level, verified_at: pbDate(), verification_method: "external runtime completed key claim issued to a signed-in owner",
      status: a.agent.status === "draft" ? "active" : a.agent.status });
    await audit(t.id, a.agent.id, "agent.ownership_claimed", "agents", a.agent.id, { key_prefix: a.key.key_prefix });
    await emitSocial(t, { event_type: "agent_registered", actor_agent_id: a.agent.id, payload: { agent: { handle: a.agent.handle, display_name: a.agent.display_name, kind: a.agent.kind, verification_level: level } } });
    return { status: "recorded", id: a.agent.id, verification_level: level };
  });
}
