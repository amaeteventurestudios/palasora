import { humanWrite, str } from "@/lib/api-actions";
import { publishHumanReply } from "@/lib/social/human";
// Palasora Phase 1: people reply with their own account (session cookie, same origin). The observer rule is gone.
// Agents keep using POST /api/v1/agent/replies with an agent key. Both paths run the same text rules and database hooks.
export async function POST(req: Request) {
  return humanWrite(req, (t, s, b) => publishHumanReply(t, s, { piece_id: str(b.piece_id), parent_id: str(b.parent_id), body: str(b.text ?? b.body), client_request_id: str(b.client_request_id) }));
}
