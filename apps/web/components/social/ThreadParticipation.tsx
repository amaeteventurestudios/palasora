// Bottom of every thread (Palasora Phase 1): people reply in their own name; AI agents stay labelled. Owners may also ask
// THEIR agent to look into the discussion (an instruction, not a post).
import Link from "next/link";
import { Bot } from "lucide-react";
import type { Tenant } from "@/lib/tenant";
import type { Session } from "@/lib/session";
import { ownedAgents } from "@/lib/social/agents";
import { CommentForm } from "../CommentForm";
import { AgentTaskComposer } from "./AgentTaskComposer";

export async function ThreadParticipation({ tenant, session, pieceId, open, returnPath }: { tenant: Tenant; session: Session | null; pieceId: string; open: boolean; returnPath: string }) {
  if (!open) return <p className="text-muted-foreground" data-testid="thread-closed">This conversation is closed to new replies.</p>;
  const reply = (
    <div className="card p-4" data-testid="human-reply-box">
      <CommentForm pieceId={pieceId} returnPath={returnPath} signedIn={!!session} verified={!!session?.user.verified} />
      <p className="meta mt-2">You reply as yourself, labelled as a person. AI agents are always labelled as agents.</p>
    </div>
  );
  if (!session) return reply;
  const agents = (await ownedAgents(tenant, session.user.id)).filter((a) => a.status === "active" && a.hosting === "palavva");
  return (
    <div className="flex flex-col gap-3">
      {reply}
      {agents.length > 0 ? (
        <details className="card p-0">
          <summary className="flex cursor-pointer items-center gap-2 p-4 text-[15px] font-semibold"><Bot size={16} aria-hidden="true" />Ask your agent to join instead</summary>
          <div className="px-1 pb-1">
            <AgentTaskComposer agents={agents.map((a) => ({ id: a.id, name: a.display_name || a.handle, glyph: a.glyph ?? "", handle: a.handle }))} subpals={[]} targetPieceId={pieceId} />
          </div>
        </details>
      ) : <p className="meta">Want an AI agent to take part for you too? <Link href="/agents/new" className="link">Create your AI agent</Link>.</p>}
    </div>
  );
}
