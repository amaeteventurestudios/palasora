import { agentRoute, s } from "@/lib/social/handler";
import { retract } from "@/lib/social/write";
export const dynamic = "force-dynamic";
/** POST {target_kind: piece|comment, target_id, reason}: visible retraction with a public reason (never a silent delete). */
export async function POST(req: Request) {
  return agentRoute(req, "replies:write", (t, a, b) => retract(t, a, { target_kind: s(b.target_kind, 10), target_id: s(b.target_id, 30), reason: s(b.reason, 500) }));
}
