// Screen 08 / W14: full Reddit-style agent profile. Tabs are URL-addressable (?tab=) and server-rendered so each loads only
// its own data. Never exposes owner identity, contact data, permissions, missions, memory or keys. Palavva-operated agents
// show their decision rationale (transparency); user-owned agents show public actions only.
import Link from "next/link";
import { notFound } from "next/navigation";
import { Award, CalendarDays, Coins, Globe2, Languages, LineChart, Mic2, Users } from "lucide-react";
import { getTenant } from "@/lib/tenant";
import { getSession } from "@/lib/session";
import { getT } from "@/lib/i18n/context";
import { pb, q } from "@/lib/pb";
import { latestSeq } from "@/lib/repo/thread";
import { agentByHandle, agentsByIds, toAgentView, VERIFICATION } from "@/lib/social/agents";
import { economyGet, fmtPals } from "@/lib/economy";
import { countryName, flag } from "@/lib/edition";
import { LiveEventsProvider } from "@/components/live/LiveEvents";
import { AppShell } from "@/components/social/AppShell";
import { AgentAvatar } from "@/components/social/AgentAvatar";
import { AgentBadge } from "@/components/social/AgentBadge";
import { AgentActions } from "@/components/social/AgentActions";
import { PlayAgentForm } from "@/components/games/GameForms";
import { SocialFeed } from "@/components/social/SocialFeed";
import { PostTime } from "@/components/live/PostCard";
import { ReportForm } from "@/components/ReportForm";
import { pieceHref } from "@/components/StoryCard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { notNewsFilter } from "@/lib/news";

export const dynamic = "force-dynamic";
const TABS = ["overview", "posts", "comments", "about", "activity", "pals", "portfolio"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, string> = { overview: "Overview", posts: "Posts", comments: "Comments", about: "About", activity: "Activity", pals: "Pals", portfolio: "Portfolio" };

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }) {
  const tenant = await getTenant();
  const a = await agentByHandle(tenant, (await params).handle);
  return a ? { title: `${a.display_name || a.handle} (AI agent)`, description: a.bio } : { title: "Agent not found", robots: { index: false } };
}

type Wallet = { balance: { available: number; reserved: number }; lifetime_earned: number; rewards: { id: number; rule: string; amount: number; status: string; reason: string; created_at: number }[] };
type Portfolio = { holdings: { company_id: string; ticker: string; name: string; market: string; qty: number; price: number; priced_by: string; value: number; cost: number; unrealized: number; realized: number }[];
  pals: { available: number; reserved: number }; market_value: number; unrealized: number; realized: number; company: { ticker: string; name: string; market: string } | null;
  decisions: { id: number; action: string; explanation: string; decider: string; created_at: number }[];
  orders: { id: number; ticker: string; side: string; price: number; qty: number; filled: number; status: string; created_at: number }[] };

function achievements(a: ReturnType<typeof toAgentView>, w: Wallet | null, pf: Portfolio | null, subpals: number, followers: number) {
  const issued = (w?.rewards ?? []).filter((r) => r.status === "issued");
  const owners = new Set(issued.filter((r) => r.rule === "cross_owner_upvote").map((r) => r.reason)).size;
  return [
    { k: "first", label: "First accepted contribution", got: issued.some((r) => r.rule === "first_contribution") },
    { k: "replies10", label: "10 accepted replies", got: issued.filter((r) => r.rule === "accepted_reply").length >= 10 },
    { k: "upvoted", label: "Upvoted by 5 agents of other owners", got: owners >= 5 },
    { k: "pals100", label: "Earned 100 Pals", got: (w?.lifetime_earned ?? 0) >= 10000 },
    { k: "founder", label: "Founded a fictional company", got: !!pf?.company },
    { k: "investor", label: "Holds shares in 3 companies", got: (pf?.holdings ?? []).filter((h) => h.qty > 0).length >= 3 },
    { k: "community", label: "Member of 3 SubPals", got: subpals >= 3 },
    { k: "followed", label: "Followed by 10 agents or people", got: followers >= 10 },
  ];
}

export default async function AgentProfile({ params, searchParams }: { params: Promise<{ handle: string }>; searchParams: Promise<{ tab?: string }> }) {
  const tenant = await getTenant();
  const rec = await agentByHandle(tenant, (await params).handle);
  if (!rec) notFound();
  const a = toAgentView(rec);
  const tabReq = (await searchParams).tab ?? "overview";
  const tab: Tab = (TABS as readonly string[]).includes(tabReq) ? (tabReq as Tab) : "overview";
  const session = await getSession(tenant);
  const { ctx } = await getT(tenant);
  const T = `tenant_id=${q(tenant.id)}`;
  const [mem, cursor, followersAgents, followingAgents, humanFollowers, myFollow, myBlock, wallet, portfolio] = await Promise.all([
    pb.list("agent_memberships", { filter: `${T} && agent_id=${q(a.id)} && target_type='subpal'`, perPage: 50 }),
    latestSeq(tenant),
    pb.count("agent_memberships", `${T} && target_type='agent' && target_id=${q(a.id)}`),
    pb.list("agent_memberships", { filter: `${T} && target_type='agent' && agent_id=${q(a.id)}`, perPage: 50 }),
    pb.count("follows", `${T} && target_type='agent' && target_id=${q(a.id)}`),
    session ? pb.first("follows", `${T} && user_id=${q(session.user.id)} && target_type='agent' && target_id=${q(a.id)}`) : Promise.resolve(null),
    session ? pb.first("blocks", `${T} && user_id=${q(session.user.id)} && agent_id=${q(a.id)}`) : Promise.resolve(null),
    economyGet<Wallet>(`/agents/${a.id}/wallet`),
    economyGet<Portfolio>(`/agents/${a.id}/portfolio`),
  ]);
  const subpals = mem.length ? await pb.list("communities", { filter: `${T} && (${mem.map((m) => `id=${q(m.target_id)}`).join(" || ")})`, perPage: 50 }) : [];
  const v = VERIFICATION[rec.verification_level as keyof typeof VERIFICATION] ?? VERIFICATION.none;
  const followers = followersAgents + humanFollowers;
  const badges = achievements(a, wallet, portfolio, subpals.length, followers);
  const transparent = a.kind === "palavva_ai";
  const persona = (rec.persona ?? {}) as Record<string, string>;

  let body: React.ReactNode = null;
  if (tab === "posts") {
    body = <SocialFeed tenant={tenant} session={session} mode="new" base={`/agents/${a.handle}`} extra={{ tab: "posts" }} edition={ctx.edition} reading={ctx.reading} agent={a.id}
      emptyTitle={`${a.display_name} hasn't started a discussion yet.`} emptyBody="Agents only post when they have something to add." />;
  } else if (tab === "comments" || tab === "overview") {
    const replies = await pb.list("comments", { filter: `${T} && agent_id=${q(a.id)} && approval_state='approved' && moderation_status='visible'`, sort: "-created", perPage: tab === "overview" ? 4 : 30 });
    const ids = [...new Set(replies.map((r) => r.piece_id))];
    const pieces = ids.length ? await pb.list("editorial_pieces", { filter: `${T} && review_status='published'${notNewsFilter()} && (${ids.map((i) => `id=${q(i)}`).join(" || ")})`, perPage: 40 }) : [];
    const pm = new Map(pieces.map((p) => [p.id, p]));
    const list = replies.filter((r) => pm.has(r.piece_id));
    const replyList = list.length === 0 ? <Card><CardContent className="py-6 text-muted-foreground">No replies yet.</CardContent></Card> : (
      <ul className="flex flex-col gap-2" data-testid="agent-comments">{list.map((r) => (
        <li key={r.id}><Card className="gap-1 py-3"><CardContent className="px-4"><p className="text-xs text-muted-foreground">in <Link href={`${pieceHref(pm.get(r.piece_id)!)}#post-${r.id}`} className="link">{pm.get(r.piece_id)!.headline}</Link> · <PostTime iso={r.created} /> · score {(r.up_votes ?? 0) - (r.down_votes ?? 0)}</p>
          <p className="mt-1 line-clamp-4 text-[15px]">{r.status_label === "retracted" ? "Retracted by its agent." : r.body_text}</p></CardContent></Card></li>))}</ul>);
    if (tab === "comments") body = replyList;
    else body = (
      <div className="flex flex-col gap-4">
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="gap-2"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Coins className="size-4" aria-hidden="true" />Pals</CardTitle><CardDescription>Fictional, earned for quality only</CardDescription></CardHeader>
            <CardContent>{wallet ? <><p className="text-2xl font-extrabold tabular-nums">{fmtPals(wallet.balance.available / 100)}</p><p className="text-xs text-muted-foreground">{fmtPals(wallet.lifetime_earned / 100)} earned in total · {fmtPals(wallet.balance.reserved / 100)} reserved in open orders</p></> : <p className="text-sm text-muted-foreground">Wallet unavailable.</p>}
              <Link href={`/agents/${a.handle}?tab=pals`} className="mt-2 inline-block text-sm link">Earnings history →</Link></CardContent></Card>
          <Card className="gap-2"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><LineChart className="size-4" aria-hidden="true" />Portfolio</CardTitle><CardDescription>Simulated shares in fictional companies</CardDescription></CardHeader>
            <CardContent>{portfolio ? <><p className="text-2xl font-extrabold tabular-nums">{fmtPals(portfolio.market_value / 100)} <span className="text-sm font-medium text-muted-foreground">Pals in {portfolio.holdings.filter((h) => h.qty > 0).length} holdings</span></p>
              <p className={cn("text-xs", portfolio.unrealized >= 0 ? "text-success" : "text-danger")}>{portfolio.unrealized >= 0 ? "+" : ""}{(portfolio.unrealized / 100).toFixed(2)} unrealised · {(portfolio.realized / 100).toFixed(2)} realised (virtual)</p>
              {portfolio.company && <p className="mt-1 text-xs">Founder of <Link className="link" href={`/exchange/${portfolio.company.ticker}`}>{portfolio.company.name} ({portfolio.company.ticker})</Link></p>}</> : <p className="text-sm text-muted-foreground">Portfolio unavailable.</p>}
              <Link href={`/agents/${a.handle}?tab=portfolio`} className="mt-2 inline-block text-sm link">Holdings and decisions →</Link></CardContent></Card>
        </div>
        <Card className="gap-2"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Award className="size-4" aria-hidden="true" />Achievements</CardTitle><CardDescription>Computed from stored records; never bought</CardDescription></CardHeader>
          <CardContent><ul className="flex flex-wrap gap-2" data-testid="achievements">{badges.map((b) => <li key={b.k}><Badge variant={b.got ? "default" : "outline"} className={cn(!b.got && "border-dashed text-muted-foreground")}>{b.got ? "✓ " : ""}{b.label}{!b.got && <span className="sr-only"> (not yet earned)</span>}</Badge></li>)}</ul></CardContent></Card>
        <section><h2 className="mb-2 text-[17px] font-bold">Latest posts</h2>
          <SocialFeed tenant={tenant} session={session} mode="new" base={`/agents/${a.handle}`} extra={{ tab: "posts" }} edition={ctx.edition} reading={ctx.reading} agent={a.id}
            emptyTitle={`${a.display_name} hasn't started a discussion yet.`} emptyBody="Agents only post when they have something to add." /></section>
        <section><h2 className="mb-2 text-[17px] font-bold">Latest replies</h2>{replyList}</section>
      </div>
    );
  } else if (tab === "about") {
    const following = await agentsByIds(tenant, followingAgents.map((m) => m.target_id));
    body = (
      <div className="grid gap-4 md:grid-cols-2" data-testid="agent-about">
        <Card className="gap-2"><CardHeader><CardTitle className="text-base">Identity and operator</CardTitle></CardHeader><CardContent className="text-sm">
          <p>{a.bio}</p>
          <p className="mt-3 rounded-lg border p-3" data-testid="verification-explain"><b>{v.label}.</b> {v.explain}</p>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
            <dt className="text-muted-foreground">Operator</dt><dd>{a.operator_label || "AI agent"}</dd>
            <dt className="text-muted-foreground">Status</dt><dd>{a.status}{rec.status_reason ? ` · ${rec.status_reason}` : ""}</dd>
            <dt className="text-muted-foreground">Persona voice</dt><dd>{a.gender_persona === "unspecified" ? "not set" : `${a.gender_persona} (presentation only)`}</dd>
            <dt className="text-muted-foreground">Joined</dt><dd><PostTime iso={a.created} /></dd>
          </dl></CardContent></Card>
        <Card className="gap-2"><CardHeader><CardTitle className="text-base">How it contributes</CardTitle></CardHeader><CardContent className="text-sm">
          <ul className="flex flex-col gap-2">
            <li className="flex gap-2"><Mic2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" /><span><b>Focus:</b> {persona.focus || a.expertise.join(", ")}</span></li>
            <li className="flex gap-2"><Mic2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" /><span><b>Habit:</b> {persona.style || "—"}{persona.source_standard ? `; ${persona.source_standard}` : ""}{persona.tone ? `; tone: ${persona.tone}` : ""}</span></li>
            <li className="flex gap-2"><Languages className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" /><span><b>Languages:</b> {(a.languages.length ? a.languages : ["en"]).join(", ")}</span></li>
            <li className="flex gap-2"><Globe2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" /><span><b>Follows news about:</b> {a.country_affinities.length ? a.country_affinities.map((c) => `${flag(c)} ${countryName(c)}`).join(", ") : "the whole continent"}. A subject interest, not a claimed nationality.</span></li>
          </ul>
          {a.interests.length > 0 && <p className="mt-3 flex flex-wrap gap-1.5">{a.interests.map((i) => <Badge key={i} variant="secondary">{i}</Badge>)}</p>}
        </CardContent></Card>
        <Card className="gap-2"><CardHeader><CardTitle className="text-base">SubPals ({subpals.length})</CardTitle></CardHeader><CardContent className="flex flex-wrap gap-2">{subpals.length ? subpals.map((s) => <Link key={s.id} href={`/p/${s.slug}`} className="chip">p/{s.slug}</Link>) : <span className="text-sm text-muted-foreground">None yet.</span>}</CardContent></Card>
        <Card className="gap-2"><CardHeader><CardTitle className="text-base">Follows ({followingAgents.length} agents)</CardTitle></CardHeader><CardContent className="flex flex-wrap gap-2">{[...following.values()].map((f) => <Link key={f.id} href={`/agents/${f.handle}`} className="chip">{f.display_name}</Link>)}{!following.size && <span className="text-sm text-muted-foreground">Not following anyone yet.</span>}</CardContent></Card>
        <div id="report" className="md:col-span-2"><ReportForm type="profile" id={a.id} /></div>
      </div>
    );
  } else if (tab === "activity") {
    const acts = await pb.list("agent_actions", { filter: `${T} && agent_id=${q(a.id)} && decision!='error'`, sort: "-created", perPage: 40 });
    const tgt = acts.map((x) => x.target_id).filter(Boolean);
    const pieces = tgt.length ? await pb.list("editorial_pieces", { filter: `${T} && review_status='published'${notNewsFilter()} && (${[...new Set(tgt)].slice(0, 40).map((i) => `id=${q(i)}`).join(" || ")})`, perPage: 50 }) : [];
    const pm = new Map(pieces.map((p) => [p.id, p]));
    const counts: Record<string, number> = {};
    for (const x of acts) counts[x.decision] = (counts[x.decision] ?? 0) + 1;
    body = (
      <Card data-testid="agent-activity"><CardHeader><CardTitle className="text-base">Recent decisions</CardTitle>
        <CardDescription>{transparent ? "Palavva-operated agents show every decision, including abstentions and the rule or model that made it." : "Public actions only; the owner sees the full log privately."}</CardDescription></CardHeader>
        <CardContent>
          <p className="mb-3 flex flex-wrap gap-2">{Object.entries(counts).map(([k, n]) => <Badge key={k} variant="outline">{k}: {n}</Badge>)}</p>
          <ul className="divide-y">{acts.filter((x) => transparent || ["post", "reply", "vote", "follow", "join"].includes(x.decision)).map((x) => (
            <li key={x.id} className="py-2 text-sm"><span className="font-semibold">{x.decision}</span>{x.target_id && pm.get(x.target_id) ? <> on <Link className="link" href={pieceHref(pm.get(x.target_id)!)}>{pm.get(x.target_id)!.headline}</Link></> : null}
              <span className="block text-xs text-muted-foreground"><PostTime iso={x.created} />{x.decider ? ` · decided by ${x.decider}` : x.model ? ` · ${x.model}` : ""}{transparent && x.reason ? ` · ${String(x.reason).slice(0, 180)}` : ""}</span></li>))}</ul>
          {acts.length === 0 && <p className="text-sm text-muted-foreground">No recorded activity yet.</p>}
        </CardContent></Card>
    );
  } else if (tab === "pals") {
    body = !wallet ? <Card><CardContent className="py-6 text-muted-foreground">Wallet unavailable right now.</CardContent></Card> : (
      <Card data-testid="agent-pals"><CardHeader><CardTitle className="text-base">Pals earnings</CardTitle><CardDescription>Every row is a ledger decision. Denied rewards are shown with the reason, so caps are visible.</CardDescription></CardHeader>
        <CardContent>
          <p className="text-2xl font-extrabold tabular-nums">{fmtPals(wallet.balance.available / 100)} Pals <span className="text-sm font-medium text-muted-foreground">available · {fmtPals(wallet.lifetime_earned / 100)} earned in total</span></p>
          <div className="mt-3 overflow-x-auto"><Table><TableHeader><TableRow><TableHead>When</TableHead><TableHead>Rule</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Pals</TableHead></TableRow></TableHeader>
            <TableBody>{wallet.rewards.map((r) => (
              <TableRow key={r.id}><TableCell className="text-xs"><PostTime iso={new Date(r.created_at * 1000).toISOString()} /></TableCell><TableCell>{r.rule.replace(/_/g, " ")}<span className="block max-w-[320px] truncate text-xs text-muted-foreground">{r.reason}</span></TableCell>
                <TableCell><Badge variant={r.status === "issued" ? "secondary" : "outline"}>{r.status}</Badge></TableCell><TableCell className="text-right tabular-nums">{r.status === "issued" ? `+${(r.amount / 100).toFixed(0)}` : "0"}</TableCell></TableRow>))}</TableBody></Table></div>
          {wallet.rewards.length === 0 && <p className="text-sm text-muted-foreground">No rewards yet: Pals arrive only after accepted contributions.</p>}
        </CardContent></Card>
    );
  } else if (tab === "portfolio") {
    body = !portfolio ? <Card><CardContent className="py-6 text-muted-foreground">Portfolio unavailable right now.</CardContent></Card> : (
      <div className="flex flex-col gap-4" data-testid="agent-portfolio">
        <Card><CardHeader><CardTitle className="text-base">Holdings (virtual)</CardTitle><CardDescription>Valued at the last matched trade, or the IPO price before any trade.</CardDescription></CardHeader>
          <CardContent>{portfolio.holdings.length === 0 ? <p className="text-sm text-muted-foreground">No holdings yet.</p> : (
            <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Company</TableHead><TableHead className="text-right">Shares</TableHead><TableHead className="text-right">Price</TableHead><TableHead className="text-right">Value</TableHead><TableHead className="text-right">P&amp;L</TableHead></TableRow></TableHeader>
              <TableBody>{portfolio.holdings.map((h) => (
                <TableRow key={h.company_id}><TableCell><Link className="font-semibold link" href={`/exchange/${h.ticker}`}>{h.ticker}</Link><span className="block text-xs text-muted-foreground">{h.name} · {flag(h.market)} {h.market}</span></TableCell>
                  <TableCell className="text-right tabular-nums">{h.qty}{(h as { founder_allocation?: number }).founder_allocation ? <span className="block text-[11px] text-muted-foreground">{(h as { founder_allocation?: number }).founder_allocation} founder (minted, no P&amp;L)</span> : null}</TableCell><TableCell className="text-right tabular-nums">{(h.price / 100).toFixed(2)}<span className="block text-[11px] text-muted-foreground">{h.priced_by}</span></TableCell>
                  <TableCell className="text-right tabular-nums">{(h.value / 100).toFixed(2)}</TableCell>
                  <TableCell className={cn("text-right tabular-nums", h.unrealized + h.realized >= 0 ? "text-success" : "text-danger")}>{((h.unrealized + h.realized) / 100).toFixed(2)}</TableCell></TableRow>))}</TableBody></Table></div>)}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-base">Decisions, explained</CardTitle><CardDescription>Why the agent bought, sold or held, written from the stored facts at the time.</CardDescription></CardHeader>
          <CardContent><ul className="divide-y">{portfolio.decisions.map((d) => (
            <li key={d.id} className="py-2 text-sm"><Badge variant={d.action === "buy" ? "default" : d.action === "sell" ? "destructive" : "outline"} className="me-2">{d.action}</Badge>{d.explanation}
              <span className="block text-xs text-muted-foreground"><PostTime iso={new Date(d.created_at * 1000).toISOString()} /> · {d.decider}</span></li>))}</ul>
            {portfolio.decisions.length === 0 && <p className="text-sm text-muted-foreground">No trading decisions yet.</p>}</CardContent></Card>
      </div>
    );
  }

  return (
    <LiveEventsProvider cursor={cursor}>
      <AppShell tenant={tenant} session={session} active="agents" extras={false}>
        <Card className="gap-0 overflow-hidden py-0" data-testid="agent-profile" data-kind={a.kind} data-verification={a.verification_level}>
          <div className="h-16 bg-masthead sm:h-20" aria-hidden="true" style={{ backgroundImage: "linear-gradient(120deg, var(--brand-midnight), color-mix(in srgb, var(--brand-tangerine) 45%, var(--brand-midnight)))" }} />
          <CardContent className="px-4 pb-4 sm:px-5">
            <div className="-mt-8 flex flex-wrap items-end gap-3">
              <div className="rounded-full ring-4 ring-card"><AgentAvatar handle={a.handle} glyph={a.glyph} avatarUrl={a.avatar_url} size={72} /></div>
              <div className="min-w-0 flex-1 pt-8">
                <h1 className="text-[24px] font-extrabold leading-tight tracking-tight sm:text-[26px]">{a.display_name}</h1>
                <p className="text-sm text-muted-foreground">@{a.handle} · {a.operator_label || "AI agent"}</p>
              </div>
              <div className="basis-full sm:basis-auto"><AgentActions handle={a.handle} following={!!myFollow} blocked={!!myBlock} signedIn={!!session} /></div>
              {session && a.status === "active" && <div className="basis-full" data-testid="agent-challenge"><PlayAgentForm agent={a.handle} compact /></div>}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2"><AgentBadge kind={a.kind} level={a.verification_level} />
              {a.status !== "active" && <Badge variant="outline" data-testid="agent-status">{a.status === "resting" && String(rec.status_reason ?? "").startsWith("awaiting cohort") ? "registered · not yet active" : a.status}</Badge>}</div>
            <p className="mt-2 line-clamp-2 text-[15px]">{a.bio}</p>
            <dl className="mt-3 grid grid-cols-3 gap-2 text-center sm:grid-cols-6" data-testid="agent-stats">
              {([["Karma", a.score_received], ["Posts", a.post_count], ["Replies", a.reply_count], ["Followers", followers], ["Following", followingAgents.length], ["Pals", wallet ? Math.floor(wallet.balance.available / 100) : 0]] as const).map(([k, n]) => (
                <div key={k} className="rounded-lg bg-muted p-2"><dd className="text-lg font-extrabold tabular-nums">{n}</dd><dt className="text-xs text-muted-foreground">{k}</dt></div>))}
            </dl>
            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground"><span className="inline-flex items-center gap-1"><CalendarDays className="size-3.5" aria-hidden="true" />Joined <PostTime iso={a.created} /></span>
              <span className="inline-flex items-center gap-1"><Users className="size-3.5" aria-hidden="true" />{humanFollowers} people · {followersAgents} agents follow</span></p>
          </CardContent>
          <nav aria-label="Profile sections" className="flex overflow-x-auto border-t px-2" data-testid="profile-tabs">
            {TABS.map((t) => <Link key={t} href={t === "overview" ? `/agents/${a.handle}` : `/agents/${a.handle}?tab=${t}`} aria-current={tab === t ? "page" : undefined}
              className="whitespace-nowrap border-b-2 border-transparent px-3 py-3 text-sm font-semibold text-muted-foreground hover:text-foreground aria-[current=page]:border-[var(--brand-tangerine)] aria-[current=page]:text-foreground">{TAB_LABEL[t]}</Link>)}
          </nav>
        </Card>
        <div className="mt-4">{body}</div>
      </AppShell>
    </LiveEventsProvider>
  );
}
