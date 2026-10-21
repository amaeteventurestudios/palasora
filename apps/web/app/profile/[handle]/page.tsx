import Link from "next/link";
import { notFound } from "next/navigation";
import { Bot, User } from "lucide-react";
import { getTenant } from "@/lib/tenant";
import { getSession } from "@/lib/session";
import { pb, q } from "@/lib/pb";
import { publicFilter } from "@/lib/repo/pieces";
import { pieceHref } from "@/components/StoryCard";
import { FollowButton } from "@/components/MemberButtons";
import { ReportForm } from "@/components/ReportForm";
import { Time } from "@/components/Time";

export const dynamic = "force-dynamic";

export default async function Profile({ params }: { params: Promise<{ handle: string }> }) {
  const tenant = await getTenant();
  const handle = (await params).handle;
  if (!/^[a-z0-9_-]{2,40}$/.test(handle)) notFound();
  if (handle.startsWith("ai-")) {
    const role = await pb.first("ai_roles", `tenant_id=${q(tenant.id)} && key=${q(handle.slice(3))}`);
    if (!role) notFound();
    const runs = await pb.list("ai_runs", { filter: `tenant_id=${q(tenant.id)} && role_id=${q(role.key)} && status='succeeded'`, sort: "-created", perPage: 1 });
    return (
      <div className="container-pv max-w-3xl py-8">
        <span className="label-pill label-ai"><Bot size={12} aria-hidden="true" />Editorial AI</span>
        <h1 className="mt-2 text-3xl font-extrabold">{role.label}</h1>
        <p className="mt-3">An editorial AI role, not a person. It answers one kind of question: <em>{role.purpose}</em></p>
        <p className="mt-2 text-muted-foreground">Used only when: {role.use_when}. It runs on a local open model (Qwen via Ollama) through a reviewed workflow, cites claim IDs from source evidence, and can abstain. Human editors approve what is published.</p>
        <p className="meta mt-3">Prompt version: {role.prompt_version}{runs[0] ? <> · Last active <Time value={runs[0].created} /></> : " · Not yet active"}</p>
        <Link className="link mt-4 inline-block" href="/ai-transparency">How our AI works</Link>
      </div>
    );
  }
  const u = await pb.first("users", `tenant_id=${q(tenant.id)} && handle=${q(handle)} && account_status='active'`);
  if (!u) notFound();
  const session = await getSession(tenant);
  const following = session ? await pb.first("follows", `tenant_id=${q(tenant.id)} && user_id=${q(session.user.id)} && target_type='member' && target_id=${q(handle)}`) : null;
  const comments = await pb.list("comments", { filter: `tenant_id=${q(tenant.id)} && author_id=${q(u.id)} && approval_state='approved' && moderation_status='visible'`, sort: "-created", perPage: 20 });
  const pieceIds = [...new Set(comments.map((c) => c.piece_id).filter(Boolean))];
  // publicFilter hides retired news threads (and their replies) and demo fixtures, as on every other public surface.
  const pf = `${publicFilter(tenant)} && (${pieceIds.map((i) => `id=${q(i)}`).join(" || ") || "id=''"})`;
  const [pieces, posts] = await Promise.all([pieceIds.length ? pb.list("editorial_pieces", { filter: pf, perPage: 50 }) : Promise.resolve([]),
    pb.list("editorial_pieces", { filter: `${publicFilter(tenant)} && kind='human_post' && author_user_id=${q(u.id)}`, sort: "-published_at", perPage: 20 })]);
  const pm = new Map(pieces.map((p) => [p.id, p]));
  return (
    <div className="container-pv max-w-3xl py-8">
      <span className="label-pill label-human"><User size={12} aria-hidden="true" />{u.profile_kind === "organization" ? "Verified organization" : "Person"}</span>
      <h1 className="mt-2 text-3xl font-extrabold">{u.display_name}</h1>
      <p className="meta">@{u.handle}</p>
      {u.bio && <p className="mt-3">{u.bio}</p>}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {session?.user.id !== u.id && <FollowButton type="member" id={u.handle} following={!!following} signedIn={!!session} returnPath={`/profile/${u.handle}`} label="" />}
        <ReportForm type="profile" id={u.id} />
      </div>
      <h2 className="mt-8 text-xl font-bold">Posts</h2>
      {posts.length === 0 ? <p className="mt-2 text-muted-foreground">No posts yet.</p> : (
        <ul className="mt-2 divide-y divide-border" data-testid="profile-posts">{posts.map((p) => (
          <li key={p.id} className="py-3"><Link className="font-semibold link" href={pieceHref(p)}>{p.headline}</Link>
            <p className="meta"><Time value={p.published_at} /> · {p.human_comment_count + (p.ai_post_count || p.ai_contribution_count || 0)} replies</p></li>))}</ul>
      )}
      <h2 className="mt-8 text-xl font-bold">Replies</h2>
      {comments.filter((c) => pm.has(c.piece_id)).length === 0 ? <p className="mt-2 text-muted-foreground">No public contributions yet.</p> : (
        <ul className="mt-2 divide-y divide-border">{comments.filter((c) => pm.has(c.piece_id)).map((c) => { const p = pm.get(c.piece_id)!; return (
          <li key={c.id} className="py-3"><p className="line-clamp-3">{c.body_text}</p>
            <p className="meta">On <Link className="link" href={`${pieceHref(p)}#post-${c.id}`}>{p.headline}</Link> · <Time value={c.created} /></p></li>); })}</ul>
      )}
    </div>
  );
}
