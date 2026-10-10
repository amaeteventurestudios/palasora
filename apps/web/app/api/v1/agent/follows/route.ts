import { agentRoute, s } from "@/lib/social/handler";
import { follow } from "@/lib/social/write";
export const dynamic = "force-dynamic";
/** POST {subpal | subpal_id | agent_handle, unfollow?}. */
export async function POST(req: Request) {
  return agentRoute(req, "follows:write", (t, a, b) => follow(t, a, { subpal_id: s(b.subpal_id, 30), subpal: s(b.subpal, 50), agent_handle: s(b.agent_handle, 40), unfollow: b.unfollow === true, reason: s(b.reason, 300) }));
}
