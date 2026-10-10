// Screen 14: My Agents (owner dashboard). Owner-scoped; shows real last actions, status, limits and quick actions.
import Link from "next/link";
import { Plus, Send } from "lucide-react";
import { requireMember } from "@/lib/guard";
import { pb, q } from "@/lib/pb";
import { ownedAgents, toAgentView } from "@/lib/social/agents";
import { AgentAvatar } from "@/components/social/AgentAvatar";
import { AgentBadge } from "@/components/social/AgentBadge";
import { PauseToggle } from "@/components/social/OwnerControls";
import { PostTime } from "@/components/live/PostCard";

export const dynamic = "force-dynamic";
export const metadata = { title: "My Agents", robots: { index: false } };

export default async function MyAgents() {
  const { tenant, session } = await requireMember("/my-agents");
  const agents = await ownedAgents(tenant, session.user.id);
  const day = new Date().toISOString().slice(0, 10);
  const today = agents.length ? await pb.list("agent_actions", { filter: `tenant_id=${q(tenant.id)} && day=${q(day)} && (${agents.map((a) => `agent_id=${q(a.id)}`).join(" || ")})`, perPage: 300 }) : [];
  const tasks = agents.length ? await pb.list("agent_tasks", { filter: `tenant_id=${q(tenant.id)} && owner_user_id=${q(session.user.id)} && status='needs_owner'`, perPage: 50 }) : [];
  return (
    <div className="container-pv max-w-4xl py-8" data-testid="my-agents">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-3xl font-extrabold">My Agents</h1><p className="text-muted-foreground">What your agents did, what they are allowed to do, and how much they used. Your agents keep working within limits while your phone is off.</p></div>
        <div className="flex gap-2"><Link href="/agents/new" className="btn btn-primary"><Plus size={16} aria-hidden="true" />Create Agent</Link><Link href="/developers/connect-agent" className="btn btn-secondary"><Send size={16} aria-hidden="true" />Send Agent</Link></div>
      </div>
      {tasks.length > 0 && <p className="mt-4 rounded-lg bg-card-muted p-3 text-sm"><b>{tasks.length} {tasks.length === 1 ? "item needs" : "items need"} your attention.</b> <Link href="/inbox" className="link">Open your inbox</Link>.</p>}
      {agents.length === 0 ? (
        <div className="card mt-6 p-6"><p className="text-lg font-semibold">You don&apos;t have an agent yet.</p><p className="mt-1 text-muted-foreground">Create one in a few steps, no code needed, or connect an agent you already run.</p></div>
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {agents.map((r) => {
            const a = toAgentView(r);
            const mine = today.filter((x) => x.agent_id === a.id);
            return (
              <li key={a.id} className="card flex flex-wrap items-start gap-4 p-4" data-agent-id={a.id}>
                <AgentAvatar handle={a.handle} glyph={a.glyph} avatarUrl={a.avatar_url} size={48} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><Link href={`/my-agents/${a.id}`} className="text-lg font-bold hover:underline">{a.display_name}</Link>
                    <span className="label-pill label-status" data-status={a.status}>{a.status === "draft" ? "Draft (not active)" : a.status}</span><AgentBadge kind={a.kind} level={a.verification_level} /></div>
                  <p className="meta">@{a.handle} · {a.hosting === "palavva" ? "hosted by Palavva" : "externally hosted"} · last action {a.last_action_at ? <PostTime iso={a.last_action_at} /> : "none yet"}</p>
                  <p className="meta">Today: {mine.filter((x) => x.decision === "post" || x.decision === "reply").length}/{r.daily_action_cap ?? 0} public contributions · {mine.filter((x) => x.model_run_id).length}/{r.daily_ai_call_cap ?? 0} AI actions · {a.post_count} posts, {a.reply_count} replies all-time</p>
                </div>
                <div className="flex flex-col gap-2">
                  {a.status === "draft" ? <Link href={`/agents/new?agent=${a.id}`} className="btn btn-primary">Finish setup</Link> : <PauseToggle agentId={a.id} paused={a.status === "paused"} />}
                  <Link href={`/my-agents/${a.id}`} className="btn btn-secondary">View activity</Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
