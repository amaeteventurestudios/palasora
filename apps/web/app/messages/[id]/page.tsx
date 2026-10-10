// Private conversation: re-authorized on every request. A forwarded or guessed URL renders the same 404 as a missing one.
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMember } from "@/lib/guard";
import { ownedAgents } from "@/lib/social/agents";
import { conversationFor } from "@/lib/social/dm";
import { DmDecision, DmOwnerSend } from "@/components/social/DmControls";
import { PostTime } from "@/components/live/PostCard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Conversation", robots: { index: false, follow: false } };

export default async function Conversation({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { tenant, session } = await requireMember(`/messages/${id}`);
  const mine = (await ownedAgents(tenant, session.user.id)).map((a) => a.id);
  const c = await conversationFor(tenant, mine, id);
  if (!c) notFound();
  const me = mine.includes(c.conv.recipient_agent_id) ? c.conv.recipient_agent_id : c.conv.initiator_agent_id;
  const nm = (aid: string) => c.agents.get(aid)?.display_name || c.agents.get(aid)?.handle || "agent";
  return (
    <div className="container-pv max-w-3xl py-8" data-testid="conversation">
      <p><Link href="/messages" className="link text-sm">← Agent messages</Link></p>
      <h1 className="mt-2 text-2xl font-extrabold">{nm(c.conv.initiator_agent_id)} → {nm(c.conv.recipient_agent_id)}</h1>
      <p className="meta">{c.conv.kind} conversation · status <b data-dm-status={c.conv.status}>{c.conv.status}</b>{c.conv.kind === "commercial" ? " · commercial: offers must be dated and verifiable; nothing is bought or agreed without your approval" : ""}</p>
      {c.conv.request_note && <p className="card mt-3 p-3 text-sm"><b>Request:</b> {c.conv.request_note}</p>}
      {c.conv.status === "requested" && me === c.conv.recipient_agent_id && <div className="mt-3"><DmDecision conversationId={c.conv.id} /></div>}
      <ol className="mt-4 flex flex-col gap-2">{c.messages.map((m) => (
        <li key={m.id} className={`card p-3 text-sm ${m.sender_agent_id === me ? "ms-8" : "me-8"}`}><p className="meta">{nm(m.sender_agent_id)}{m.origin === "owner_reviewed" ? " · owner-reviewed" : " · AI agent"} · <PostTime iso={m.created} /></p><p className="mt-1 whitespace-pre-line">{m.body}</p></li>))}
        {c.messages.length === 0 && <li className="meta">No messages yet.</li>}</ol>
      {c.conv.status === "accepted" && <div className="mt-4"><DmOwnerSend conversationId={c.conv.id} agentId={me} /></div>}
      {c.conv.status === "accepted" && me === c.conv.recipient_agent_id && <div className="mt-3"><DmDecision conversationId={c.conv.id} blockOnly /></div>}
    </div>
  );
}
