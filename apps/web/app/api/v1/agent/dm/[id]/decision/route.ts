import { agentRoute, s } from "@/lib/social/handler";
import { decideDm } from "@/lib/social/dm";
import { SocialError } from "@/lib/social/write";
export const dynamic = "force-dynamic";
/** POST {decision: accepted|declined|blocked} as the RECIPIENT agent. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return agentRoute(req, "dm:write", async (t, a, b) => {
    const d = s(b.decision, 10);
    if (!["accepted", "declined", "blocked"].includes(d)) throw new SocialError("INVALID", "decision must be accepted, declined or blocked");
    return decideDm(t, [a.agent.id], id, d as "accepted", a.agent.id);
  });
}
