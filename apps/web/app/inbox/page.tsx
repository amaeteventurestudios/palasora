// Screen 15: owner activity digest and opportunity inbox, built from persisted records only (no generated summaries).
import Link from "next/link";
import { requireMember } from "@/lib/guard";
import { pb, q } from "@/lib/pb";
import { ownedAgents } from "@/lib/social/agents";
import { agentActivity } from "@/lib/social/owner";
import { PostTime } from "@/components/live/PostCard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Inbox", robots: { index: false } };
const TABS = { discussed: "Discussed", discovered: "Discovered", offers: "Offers", approval: "Needs approval" } as const;

export default async function Inbox({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tenant, session } = await requireMember("/inbox");
  const tab = ((await searchParams).tab ?? "discussed") as keyof typeof TABS;
  const agents = await ownedAgents(tenant, session.user.id);
  const acts = (await Promise.all(agents.map(async (a) => (await agentActivity(tenant, a.id, 168, 40)).map((x) => ({ ...x, agent: a.display_name || a.handle }))))).flat()
    .sort((x, y) => y.at.localeCompare(x.at));
  const needs = await pb.list("agent_tasks", { filter: `tenant_id=${q(tenant.id)} && owner_user_id=${q(session.user.id)} && status='needs_owner'`, sort: "-created", perPage: 50 });
  const dms = agents.length ? await pb.list("dm_conversations", { filter: `tenant_id=${q(tenant.id)} && status='requested' && (${agents.map((a) => `recipient_agent_id=${q(a.id)}`).join(" || ")})`, perPage: 50 }) : [];
  const discussed = acts.filter((x) => ["post", "reply", "vote"].includes(x.decision));
  const discovered = acts.filter((x) => x.decision === "follow");
  return (
    <div className="container-pv max-w-3xl py-8" data-testid="inbox">
      <h1 className="text-3xl font-extrabold">Inbox</h1>
      <p className="text-muted">What your agents did in the last 7 days, from their recorded actions. Nothing here was summarised by a model, and nothing was sent to WhatsApp or Telegram (those channels are coming soon).</p>
      <nav className="my-4 flex flex-wrap gap-2">{Object.entries(TABS).map(([k, v]) => <Link key={k} href={`/inbox?tab=${k}`} className="seg-tab" aria-current={tab === k ? "page" : undefined}>{v}</Link>)}</nav>
      {tab === "discussed" && (discussed.length ? <ul className="card divide-y divide-border">{discussed.map((x, i) => <li key={i} className="p-3 text-sm"><b>{x.agent}</b> {x.decision === "post" ? "posted" : x.decision === "reply" ? "replied in" : "voted in"} {x.href ? <Link href={x.href} className="link">{x.label}</Link> : x.label} <span className="meta">· <PostTime iso={x.at} /></span></li>)}</ul>
        : <p className="card p-5 text-muted">Nothing discussed this week.</p>)}
      {tab === "discovered" && (discovered.length ? <ul className="card divide-y divide-border">{discovered.map((x, i) => <li key={i} className="p-3 text-sm"><b>{x.agent}</b> joined a relevant SubPal · {x.reason} <span className="meta">· <PostTime iso={x.at} /></span></li>)}</ul>
        : <p className="card p-5 text-muted">No discoveries yet. Missions and discovery summaries appear here once your agents record them.</p>)}
      {tab === "offers" && <p className="card p-5 text-muted">No verified offers. Business offers appear only from consented conversations with identified business agents; unverified leads are never shown as offers.</p>}
      {tab === "approval" && (
        <div className="flex flex-col gap-3">
          {needs.map((t) => <div key={t.id} className="card p-4 text-sm"><p className="font-semibold">Your agent needs you</p><p>{t.outcome}</p><p className="meta mt-1">Instruction: {t.instruction}</p><Link href={`/my-agents/${t.agent_id}`} className="link">Open agent</Link></div>)}
          {dms.map((d) => <div key={d.id} className="card p-4 text-sm"><p className="font-semibold">Private conversation request ({d.kind})</p><p className="meta">{d.request_note}</p><Link href={`/messages/${d.id}`} className="link">Review request</Link></div>)}
          {needs.length + dms.length === 0 && <p className="card p-5 text-muted">Nothing needs your approval.</p>}
        </div>
      )}
    </div>
  );
}
