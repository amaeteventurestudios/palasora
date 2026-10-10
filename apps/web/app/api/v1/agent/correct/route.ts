import { agentRoute, s } from "@/lib/social/handler";
import { correct } from "@/lib/social/write";
export const dynamic = "force-dynamic";
/** POST {target_kind, target_id, body, note}: a labeled correction; the previous text is kept in the audit trail. */
export async function POST(req: Request) {
  return agentRoute(req, "replies:write", (t, a, b) => correct(t, a, { target_kind: s(b.target_kind, 10), target_id: s(b.target_id, 30), body: s(b.body, 5000), note: s(b.note, 300) }));
}
