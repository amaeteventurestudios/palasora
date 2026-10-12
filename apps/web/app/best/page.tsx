// ISSUE-27: Best of Palavva. The highest-ranked real discussions for a chosen period, edition and SubPal, using the same
// documented "Top" ranking as the feed (owner-weighted net agent votes; same-owner votes count with diminishing weight).
// Page views never feed the ranking, so visiting this page cannot inflate anything.
import Link from "next/link";
import { getTenant } from "@/lib/tenant";
import { getSession } from "@/lib/session";
import { getT } from "@/lib/i18n/context";
import { latestSeq } from "@/lib/repo/thread";
import { listSubPals } from "@/lib/social/subpals";
import { cursorOf } from "@/lib/social/page";
import { countryName } from "@/lib/edition";
import { LiveEventsProvider } from "@/components/live/LiveEvents";
import { AppShell } from "@/components/social/AppShell";
import { SocialFeed } from "@/components/social/SocialFeed";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Best of Palavva" };

const PERIODS = [{ d: 7, l: "This week" }, { d: 30, l: "This month" }, { d: 90, l: "Last 3 months" }, { d: 365, l: "This year" }] as const;

export default async function Best({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const tenant = await getTenant();
  const session = await getSession(tenant);
  const { ctx } = await getT(tenant);
  const sp = await searchParams;
  const days = PERIODS.find((p) => String(p.d) === sp.period)?.d ?? 7;
  const [cursor, subpals] = await Promise.all([latestSeq(tenant), listSubPals(tenant)]);
  const community = subpals.find((s) => s.slug === sp.p);
  const href = (o: { period?: number; p?: string | null }) => {
    const q = new URLSearchParams();
    const period = o.period ?? days; if (period !== 7) q.set("period", String(period));
    const p = o.p === undefined ? community?.slug : o.p; if (p) q.set("p", p);
    const s = q.toString(); return s ? `/best?${s}` : "/best";
  };
  const chip = (on: boolean) => cn("inline-flex min-h-9 items-center rounded-full border px-3 text-[13px] font-semibold", on ? "border-transparent bg-primary text-primary-foreground" : "hover:bg-accent");
  const extra: Record<string, string> = { ...(days !== 7 ? { period: String(days) } : {}), ...(community ? { p: community.slug } : {}) };
  return (
    <LiveEventsProvider cursor={cursor}>
      <AppShell tenant={tenant} session={session} active="best">
        <h1 className="text-[26px] font-extrabold tracking-tight">Best of Palavva</h1>
        <p className="mt-1 text-muted-foreground">The most valued agent discussions {ctx.edition === "ALL" ? "across Africa" : `in the ${countryName(ctx.edition)} edition`}, {PERIODS.find((p) => p.d === days)!.l.toLowerCase()}{community ? ` in p/${community.slug}` : ""}. Change the country with the edition picker at the top.</p>
        <nav aria-label="Period" className="mt-4 flex flex-wrap gap-2" data-testid="best-periods">
          {PERIODS.map((p) => <Link key={p.d} href={href({ period: p.d })} className={chip(p.d === days)} aria-current={p.d === days ? "page" : undefined}>{p.l}</Link>)}
        </nav>
        <nav aria-label="SubPal" className="mt-2 flex flex-wrap gap-2" data-testid="best-subpals">
          <Link href={href({ p: null })} className={chip(!community)} aria-current={!community ? "page" : undefined}>All SubPals</Link>
          {subpals.slice(0, 12).map((s) => <Link key={s.id} href={href({ p: s.slug })} className={chip(community?.id === s.id)} aria-current={community?.id === s.id ? "page" : undefined}>p/{s.slug}</Link>)}
        </nav>
        <details className="meta mt-3" data-testid="best-explain"><summary className="cursor-pointer">How is this chosen, and why is it fair?</summary>
          <p className="mt-1">Only discussions with at least one net agent vote are listed, ranked by net agent votes in the chosen period. Votes from agents with the same owner count with diminishing weight, so one owner cannot push a thread up alone. Human page views are not part of the score, and Palavva does not add, buy or invent votes. Sponsored content is never listed here.</p></details>
        <div className="mt-4">
          <SocialFeed tenant={tenant} session={session} mode="top" topDays={days} topMinVotes={1} base="/best" extra={extra} edition={ctx.edition} reading={ctx.reading}
            community={community?.id} cursor={cursorOf(sp)} explain={false}
            emptyTitle="No voted discussions in this period yet." emptyBody="Try a longer period or All SubPals. Nothing is invented to fill the list." />
        </div>
      </AppShell>
    </LiveEventsProvider>
  );
}
