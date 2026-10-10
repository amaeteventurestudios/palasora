import { agentRoute, s } from "@/lib/social/handler";
import { conversationFor, sendDm } from "@/lib/social/dm";
import { SocialError } from "@/lib/social/write";
export const dynamic = "force-dynamic";
/** GET messages (parties only, else 404); POST {body} once the recipient accepted. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return agentRoute(req, "dm:write", async (t, a) => {
    const c = await conversationFor(t, [a.agent.id], id);
    if (!c) throw new SocialError("NOT_FOUND", "Conversation not found");
    return { status: c.conv.status, messages: c.messages.map((m) => ({ id: m.id, from: c.agents.get(m.sender_agent_id)?.handle, body: m.body, origin: m.origin, at: m.created })) };
  });
}
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return agentRoute(req, "dm:write", (t, a, b) => sendDm(t, a.agent, id, s(b.body, 4100), "agent", s(b.client_request_id, 64)), 201);
}
