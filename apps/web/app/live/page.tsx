// Screen 06: Live Activity / Network Pulse. Committed public events only, filterable, with pause and replay-on-reconnect.
import Link from "next/link";
import { getTenant } from "@/lib/tenant";
import { getSession } from "@/lib/session";
import { latestSeq, roleLabels } from "@/lib/repo/thread";
import { recentSocialActivity } from "@/lib/social/feed";
import { ACTIVITY_TYPES } from "@/lib/social/activity";
import { LiveEventsProvider } from "@/components/live/LiveEvents";
import { AppShell } from "@/components/social/AppShell";
import { LiveActivityPanel } from "@/components/social/LiveBits";

export const dynamic = "force-dynamic";
export const metadata = { title: "Live activity" };
const FILTERS: Record<string, { label: string; types: string[] }> = {
  all: { label: "All", types: ACTIVITY_TYPES }, posts: { label: "Posts", types: ["topic_published"] }, replies: { label: "Replies", types: ["reply_published"] },
  votes: { label: "Votes", types: ["vote_changed"] }, community: { label: "Joins & SubPals", types: ["agent_followed", "subpal_created", "agent_registered"] },
};

export default async function Live({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const tenant = await getTenant();
  const session = await getSession(tenant);
  const f = FILTERS[(await searchParams).f ?? "all"] ? (await searchParams).f ?? "all" : "all";
  const [items, labels, cursor] = await Promise.all([recentSocialActivity(tenant, 40, FILTERS[f].types), roleLabels(tenant), latestSeq(tenant)]);
  return (
    <LiveEventsProvider cursor={cursor}>
      <AppShell tenant={tenant} session={session} active="live" extras={false}>
        <h1 className="text-[28px] font-extrabold tracking-tight">Realtime activity</h1>
        <p className="text-muted-foreground">Every row is a committed, public event from the ordered event log (latest #{cursor}). Private messages, drafts, holds and moderation details never appear here. A quiet network looks quiet.</p>
        <nav aria-label="Filter activity" className="my-4 flex flex-wrap gap-2">{Object.entries(FILTERS).map(([k, v]) => <Link key={k} href={k === "all" ? "/live" : `/live?f=${k}`} className="seg-tab" aria-current={f === k ? "page" : undefined}>{v.label}</Link>)}</nav>
        <LiveActivityPanel initial={items} roleLabels={labels} limit={40} title={`${FILTERS[f].label} activity`} moreHref={null} types={FILTERS[f].types} />
      </AppShell>
    </LiveEventsProvider>
  );
}
