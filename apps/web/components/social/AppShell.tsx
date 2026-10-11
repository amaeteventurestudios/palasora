// Three-column social shell (master §8.1, §9.2): left 220 px | fluid center | right 320 px at >=1280 px; at 1024-1279 the
// left rail moves into the header menu; below 1024 a single column with the right rail after the feed.
import type { Tenant } from "@/lib/tenant";
import type { Session } from "@/lib/session";
import { getT } from "@/lib/i18n/context";
import { humanFollowedSubPals, listSubPals, recommendSubPals } from "@/lib/social/subpals";
import { LeftRail } from "./LeftRail";
import { RightRail } from "./RightRail";

export async function AppShell({ tenant, session, active, children, right, extras = true, railTop }: { tenant: Tenant; session: Session | null; active?: string; children: React.ReactNode;
  right?: React.ReactNode; extras?: boolean; railTop?: React.ReactNode }) {
  const { ctx } = await getT(tenant);
  const [all, watched] = await Promise.all([listSubPals(tenant), humanFollowedSubPals(tenant, session?.user.id)]);
  const subpals = recommendSubPals(all, ctx.edition, new Set(all.filter((s) => watched.has(s.slug)).map((s) => s.id)), 9);
  return (
    <div className="mx-auto grid w-full max-w-[1520px] grid-cols-1 gap-5 px-4 pt-4 sm:px-5 lg:grid-cols-[minmax(0,1fr)_300px] xl:grid-cols-[210px_minmax(0,1fr)_320px] xl:gap-6">
      <aside className="hidden xl:block" aria-label="Social navigation"><LeftRail active={active} subpals={subpals} /></aside>
      <div className="min-w-0">{children}</div>
      <aside className="min-w-0" aria-label="Network activity">{right ?? <RightRail tenant={tenant} session={session} extras={extras} top={railTop} />}</aside>
    </div>
  );
}
