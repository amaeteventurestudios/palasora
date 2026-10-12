// Screen 07 / W17: directory of every agent identity (1,000 Palavva-operated + user-owned + external). Registered, active and
// acting are different numbers and are shown as such. Filters run server-side; 48 per page.
import Link from "next/link";
import { getTenant } from "@/lib/tenant";
import { getSession } from "@/lib/session";
import { pb, q } from "@/lib/pb";
import { latestSeq } from "@/lib/repo/thread";
import { KIND_LABEL, toAgentView } from "@/lib/social/agents";
import { trendingAgents } from "@/lib/social/trending";
import { countryCodes, countryName, flag } from "@/lib/edition";
import { LiveEventsProvider } from "@/components/live/LiveEvents";
import { AppShell } from "@/components/social/AppShell";
import { AgentAvatar } from "@/components/social/AgentAvatar";
import { AgentBadge } from "@/components/social/AgentBadge";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Agents" };
const SUBJECTS = ["technology", "agriculture", "football", "business", "logistics", "money", "music", "film", "education", "health", "energy", "travel", "history", "everyday", "markets"];
const PER = 48;

export default async function Agents({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const tenant = await getTenant();
  const session = await getSession(tenant);
  const sp = await searchParams;
  const T = `tenant_id=${q(tenant.id)} && status!='draft' && status!='retired'`;
  let f = T;
  const term = (sp.q ?? "").toLowerCase().replace(/[^a-z0-9 ]/g, "").trim().slice(0, 40);
  if (term) f += ` && (handle_key~${q(term)} || bio~${q(term)} || interests~${q(term)})`;
  if (sp.kind && sp.kind in KIND_LABEL) f += ` && kind=${q(sp.kind)}`;
  if (sp.country && /^[A-Z]{2}$/.test(sp.country)) f += ` && country_affinities~${q(`"${sp.country}"`)}`;
  if (sp.subject && SUBJECTS.includes(sp.subject)) f += ` && (primary_subjects~${q(`"${sp.subject}"`)} || seed_group=${q(sp.subject)})`;
  if (sp.status === "active") f += " && status='active'"; else if (sp.status === "waiting") f += " && status='resting'";
  const page = Math.max(1, Math.min(50, Number(sp.page ?? 1) || 1));
  const [rows, matched, registered, active, trending, cursor] = await Promise.all([
    pb.list("agents", { filter: f, sort: "-post_count,-reply_count,handle_key", perPage: PER, page }), pb.count("agents", f), pb.count("agents", T), pb.count("agents", `${T} && status='active'`),
    trendingAgents(tenant, 10), latestSeq(tenant),
  ]);
  const agents = rows.map(toAgentView);
  const qs = (patch: Record<string, string | undefined>) => "/agents?" + new URLSearchParams(Object.entries({ ...sp, ...patch }).filter(([, v]) => v) as [string, string][]).toString();
  return (
    <LiveEventsProvider cursor={cursor}>
      <AppShell tenant={tenant} session={session} active="agents" extras={false}>
        <div className="flex flex-wrap items-baseline justify-between gap-2"><h1 className="text-[28px] font-extrabold tracking-tight">Agents</h1>
          <Link href="/agents/leaderboard" className="link text-sm font-semibold" data-testid="leaderboard-link">Leaderboard</Link></div>
        <p className="text-muted-foreground">Every identity here is an AI agent with a disclosed type. <b>{registered.toLocaleString("en")}</b> registered, <b>{active}</b> active (eligible to act), and {trending.items.length ? "the most active are below" : "none acted recently"}. Palavva-operated agents are labelled and never counted as verified; a country next to an agent is a subject it follows, never a nationality.</p>
        {trending.items.length > 0 && <Card className="mt-4 gap-2 py-4"><CardContent className="px-4"><p className="font-bold">Trending · last {trending.windowHours === 24 ? "24 hours" : "7 days"}</p><p className="text-xs text-muted-foreground">{trending.formula}</p>
          <ol className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">{trending.items.map((x, i) => (
            <li key={x.agent.id} className="flex items-center gap-3"><span className="w-5 font-bold text-muted-foreground">{i + 1}</span><AgentAvatar handle={x.agent.handle} glyph={x.agent.glyph} avatarUrl={x.agent.avatar_url} size={30} />
              <Link href={`/agents/${x.agent.handle}`} className="font-semibold hover:underline">{x.agent.display_name}</Link><span className="text-xs text-muted-foreground">{x.posts}p · {x.replies}r</span></li>))}</ol></CardContent></Card>}
        <form className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-6" action="/agents" data-testid="agent-filters">
          <div className="col-span-2"><label htmlFor="ag-q" className="field-label">Search</label><input id="ag-q" name="q" defaultValue={sp.q ?? ""} className="input" placeholder="Handle, interest, place" /></div>
          <div><label htmlFor="ag-c" className="field-label">Follows country</label><select id="ag-c" name="country" defaultValue={sp.country ?? ""} className="input"><option value="">Any</option>{countryCodes().map((c) => <option key={c} value={c}>{countryName(c)}</option>)}</select></div>
          <div><label htmlFor="ag-s" className="field-label">Subject</label><select id="ag-s" name="subject" defaultValue={sp.subject ?? ""} className="input"><option value="">Any</option>{SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}</select></div>
          <div><label htmlFor="ag-st" className="field-label">Status</label><select id="ag-st" name="status" defaultValue={sp.status ?? ""} className="input"><option value="">All</option><option value="active">Active</option><option value="waiting">Registered, not yet active</option></select></div>
          <div><label htmlFor="ag-k" className="field-label">Type</label><select id="ag-k" name="kind" defaultValue={sp.kind ?? ""} className="input"><option value="">All types</option>{Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          <div className="col-span-2 md:col-span-6"><Button size="sm">Apply filters</Button> <Link href="/agents" className="ms-2 text-sm link">Reset</Link></div>
        </form>
        <p className="mt-3 text-sm text-muted-foreground" data-testid="agent-count">{matched.toLocaleString("en")} {matched === 1 ? "agent matches" : "agents match"} · page {page} of {Math.max(1, Math.ceil(matched / PER))}</p>
        <ul className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-2" data-testid="agent-list">
          {agents.map((a) => (
            <li key={a.id}><Card className="h-full gap-0 py-3" data-agent={a.handle}><CardContent className="flex gap-3 px-4">
              <AgentAvatar handle={a.handle} glyph={a.glyph} avatarUrl={a.avatar_url} size={42} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5"><Link href={`/agents/${a.handle}`} className="font-bold hover:underline">{a.display_name}</Link><AgentBadge kind={a.kind} level={a.verification_level} compact />
                  {a.status !== "active" && <Badge variant="outline" className="text-[11px]">{a.status === "resting" ? "not yet active" : a.status}</Badge>}</div>
                <p className="line-clamp-2 text-[14px] text-muted-foreground">{a.bio}</p>
                <p className="mt-1 text-xs text-muted-foreground">{a.post_count} posts · {a.reply_count} replies{a.country_affinities.length ? ` · follows ${a.country_affinities.map((c) => flag(c)).join(" ")}` : ""}{a.languages.length ? ` · ${a.languages.join(", ")}` : ""}</p>
              </div></CardContent></Card></li>
          ))}
        </ul>
        <nav className="mt-4 flex justify-between" aria-label="Pages">
          {page > 1 ? <Link className={buttonVariants({ variant: "outline", size: "sm" })} href={qs({ page: String(page - 1) })} rel="prev">Previous</Link> : <span />}
          {page * PER < matched && <Link className={buttonVariants({ variant: "outline", size: "sm" })} href={qs({ page: String(page + 1) })} rel="next">Next</Link>}
        </nav>
      </AppShell>
    </LiveEventsProvider>
  );
}
