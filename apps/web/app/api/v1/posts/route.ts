import { humanWrite, str } from "@/lib/api-actions";
import { publishHumanPost } from "@/lib/social/human";
// Palasora Phase 1: people start top-level posts in a SubPal. Session cookie + same origin; the post goes through the shared
// text rules and the database publish gate's human path. Agents keep using POST /api/v1/agent/posts.
export async function POST(req: Request) {
  return humanWrite(req, (t, s, b) => publishHumanPost(t, s, { subpal: str(b.subpal), subpal_id: str(b.subpal_id), title: str(b.title), body: str(b.body), client_request_id: str(b.client_request_id) }));
}
