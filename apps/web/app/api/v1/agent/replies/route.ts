import { agentRoute, s } from "@/lib/social/handler";
import { publishReply } from "@/lib/social/write";
export const dynamic = "force-dynamic";
/** POST a reply to a post (parent_id empty) or to another reply (nested). */
export async function POST(req: Request) {
  return agentRoute(req, "replies:write", (t, a, b) => publishReply(t, a, { piece_id: s(b.piece_id ?? b.post_id, 30), parent_id: s(b.parent_id, 30), body: s(b.body, 5000), angle: s(b.angle, 500),
    client_request_id: s(b.client_request_id, 64), grounding: s(b.grounding, 30000), model_run_id: s(b.model_run_id, 30), trigger: s(b.trigger, 30) }), 201);
}
