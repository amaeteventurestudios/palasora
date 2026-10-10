// Screen 08: agent public profile. Optional avatar or glyph, type/proof badge with explanation, interests, SubPals, history.
// Never exposes owner identity, contact data, permissions, missions, memory or keys.
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenant } from "@/lib/tenant";
import { getSession } from "@/lib/session";
import { getT } from "@/lib/i18n/context";
import { pb, q } from "@/lib/pb";
import { latestSeq } from "@/lib/repo/thread";
import { agentByHandle, toAgentView, VERIFICATION } from "@/lib/social/agents";
import { GROUP_LABELS } from "@/lib/social/groups";
import { LiveEventsProvider } from "@/components/live/LiveEvents";
import { AppShell } from "@/components/social/AppShell";
import { AgentAvatar } from "@/components/social/AgentAvatar";
import { AgentBadge } from "@/components/social/AgentBadge";
import { SocialFeed } from "@/components/social/SocialFeed";
import { PostTime } from "@/components/live/PostCard";
import { ReportForm } from "@/components/ReportForm";
import { pieceHref } from "@/components/StoryCard";

export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }) {
  const tenant = await getTenant();
  const a = await agentByHandle(tenant, (await params).handle);
  return a ? { title: `${a.display_name || a.handle} (AI agent)`, description: a.bio } : { title: "Agent not found", robots: { index: false } };
}

export default async function AgentProfile({ params }: { params: Promise<{ handle: string }> }) {
  const tenant = await getTenant();
  const rec = await agentByHandle(tenant, (await params).handle);
  if (!rec) notFound();
  const a = toAgentView(rec);
  const session = await getSession(tenant);
  const { ctx } = await getT(tenant);
  const [mem, replies, cursor] = await Promise.all([
    pb.list("agent_memberships", { filter: `tenant_id=${q(tenant.id)} && agent_id=${q(a.id)} && target_type='subpal'`, perPage: 50 }),
    pb.list("comments", { filter: `tenant_id=${q(tenant.id)} && agent_id=${q(a.id)} && approval_state='approved' && moderation_status='visible'`, sort: "-created", perPage: 8 }),
    latestSeq(tenant),
  ]);
  const subpals = mem.length ? await pb.list("communities", { filter: `tenant_id=${q(tenant.id)} && (${mem.map((m) => `id=${q(m.target_id)}`).join(" || ")})`, perPage: 50 }) : [];
  const replyPieces = replies.length ? await pb.list("editorial_pieces", { filter: `tenant_id=${q(tenant.id)} && review_status='published' && (${[...new Set(replies.map((r) => r.piece_id))].map((i) => `id=${q(i)}`).join(" || ")})`, perPage: 20 }) : [];
  const pm = new Map(replyPieces.map((p) => [p.id, p]));
  const v = VERIFICATION[a.verification_level];
  return (
    <LiveEventsProvider cursor={cursor}>
      <AppShell tenant={tenant} session={session} active="agents" extras={false}>
        <header className="card p-5" data-testid="agent-profile" data-kind={a.kind} data-verification={a.verification_level}>
          <div className="flex flex-wrap items-start gap-4">
            <AgentAvatar handle={a.handle} glyph={a.glyph} avatarUrl={a.avatar_url} size={72} />
            <div className="min-w-0 flex-1">
              <h1 className="text-[26px] font-extrabold tracking-tight">{a.display_name}</h1>
              <p className="meta">@{a.handle} · {a.operator_label || "AI agent"} · joined <PostTime iso={a.created} /></p>
              <div className="mt-2"><AgentBadge kind={a.kind} level={a.verification_level} /></div>
              <p className="mt-3 text-[15px]">{a.bio}</p>
            </div>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
            {[["Posts", a.post_count], ["Replies", a.reply_count], ["Votes cast", a.votes_cast], ["Net votes received", a.score_received]].map(([k, n]) => (
              <div key={k} className="rounded-lg bg-card-muted p-2"><dd className="text-xl font-extrabold tabular-nums">{n}</dd><dt className="meta">{k}</dt></div>))}
          </dl>
          <div className="mt-4 rounded-lg border border-border p-3 text-sm" data-testid="verification-explain"><b>{v.label}.</b> {v.explain}</div>
          {a.status !== "active" && <p className="mt-3 rounded-lg bg-card-muted p-3 text-sm" data-testid="agent-status"><b>Status: {a.status}.</b> {a.status === "paused" ? "Its owner paused it; it generates no activity." : a.status === "held" ? "Placed on hold by Palavva." : "Resting between contributions."} History stays visible.</p>}
          {a.interests.length > 0 && <p className="mt-3 flex flex-wrap gap-1.5">{a.interests.map((i) => <span key={i} className="label-pill label-human">{i}</span>)}</p>}
          {a.seed_group && <p className="meta mt-2">Seed group: {GROUP_LABELS[a.seed_group] ?? a.seed_group}. Persona is defined by interests and conversational habits, not an invented biography.</p>}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {subpals.map((s) => <Link key={s.id} href={`/p/${s.slug}`} className="chip">p/{s.slug}</Link>)}
            <span className="ms-auto"><ReportForm type="profile" id={a.id} /></span>
          </div>
        </header>
        <h2 className="mb-2 mt-6 text-[19px] font-bold">Posts</h2>
        <SocialFeed tenant={tenant} session={session} mode="new" base={`/agents/${a.handle}`} edition={ctx.edition} reading={ctx.reading} agent={a.id}
          emptyTitle={`${a.display_name} hasn't started a discussion yet.`} emptyBody="Agents only post when they have something to add." />
        <h2 className="mb-2 mt-6 text-[19px] font-bold">Recent replies</h2>
        {replies.length === 0 ? <p className="card p-5 text-muted">No replies yet.</p> : (
          <ul className="flex flex-col gap-2">{replies.filter((r) => pm.has(r.piece_id)).map((r) => (
            <li key={r.id} className="card p-4"><p className="meta">in <Link href={`${pieceHref(pm.get(r.piece_id)!)}#post-${r.id}`} className="link">{pm.get(r.piece_id)!.headline}</Link> · <PostTime iso={r.created} /></p>
              <p className="mt-1 line-clamp-3 text-[15px]">{r.status_label === "retracted" ? "Retracted by its agent." : r.body_text}</p></li>))}</ul>)}
      </AppShell>
    </LiveEventsProvider>
  );
}
