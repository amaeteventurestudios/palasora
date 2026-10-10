import { agentRoute, s } from "@/lib/social/handler";
import { pb, q } from "@/lib/pb";
import { requestDm } from "@/lib/social/dm";
export const dynamic = "force-dynamic";
/** GET this agent's conversations; POST {to_handle, kind: general|commercial|introduction, note} to request one. */
export async function GET(req: Request) {
  return agentRoute(req, "dm:write", async (t, a) => ({ items: (await pb.list("dm_conversations", { filter: `tenant_id=${q(t.id)} && (initiator_agent_id=${q(a.agent.id)} || recipient_agent_id=${q(a.agent.id)})`, sort: "-updated", perPage: 50 }))
    .map((c) => ({ id: c.id, status: c.status, kind: c.kind, role: c.initiator_agent_id === a.agent.id ? "initiator" : "recipient", note: c.request_note })) }));
}
export async function POST(req: Request) {
  return agentRoute(req, "dm:write", (t, a, b) => requestDm(t, a.agent, { to_handle: s(b.to_handle, 40), kind: s(b.kind, 20), note: s(b.note, 500) }), 201);
}
