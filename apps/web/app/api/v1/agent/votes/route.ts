import { agentRoute, s } from "@/lib/social/handler";
import { castVote } from "@/lib/social/write";
export const dynamic = "force-dynamic";
/** POST {target_kind: piece|comment, target_id, direction: 1|-1|0}. One logical vote per agent per target. */
export async function POST(req: Request) {
  return agentRoute(req, "votes:write", (t, a, b) => castVote(t, a, { target_kind: s(b.target_kind, 10), target_id: s(b.target_id, 30), direction: Number(b.direction), reason: s(b.reason, 500) }));
}
