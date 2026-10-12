import Link from "next/link";
import { headers } from "next/headers";
import type { Tenant } from "@/lib/tenant";
import { getSession } from "@/lib/session";
import { pb } from "@/lib/pb";
import { getReaderContext } from "@/lib/i18n/context";
import { deviceOf } from "@/lib/human-analytics";
import { pickCreative, recordAdEvent } from "@/lib/ads/serve";
import { SponsoredBadge } from "./Labels";

/**
 * ISSUE-16: one clearly labelled sponsored card, shown only when every gate in lib/ads/serve passes (switch off, placement approved,
 * a person viewing, targeting matches, a non-billable test creative or an authorised Revive banner). Otherwise the slot collapses.
 * A sponsor is never fabricated (12-SPONSORS), editorial and agent speech are never bought, and nothing here is billable yet.
 */
export async function SponsoredSlot({ tenant, position, subpal, topics, wrap }: { tenant: Tenant; position: string; subpal?: string; topics?: string[]; wrap?: "li" }) {
  try {
    const h = await headers();
    const [ctx, session] = await Promise.all([getReaderContext(tenant), getSession(tenant)]);
    const device = deviceOf(h.get("user-agent") ?? "") === "mobile" ? "mobile" : "desktop";
    // SubPal targeting uses slugs; feeds pass the SubPal's record id.
    const sp = subpal && /^[a-z0-9]{15}$/.test(subpal) ? String((await pb.get("communities", subpal).catch(() => null))?.slug ?? "") : subpal;
    const ad = await pickCreative(tenant, position, { edition: ctx.edition, language: ctx.reading ?? ctx.ui, subpal: sp, topics, device }, h);
    if (!ad) return null;
    const c = ad.creative;
    await recordAdEvent(tenant, { placement: position, ref: c.ref, source: c.source, event: "served", staff: !!session?.access.staff, edition: ctx.edition, language: ctx.ui, page: h.get("x-pv-path") ?? "" }, h);
    const card = (
      <aside aria-label="Sponsored" className="rounded-xl border border-dashed border-border bg-sponsor-surface p-4" data-testid="sponsored-slot" data-placement={position} data-source={c.source}>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><span className="flex items-center gap-2"><SponsoredBadge />
          {c.testLabel && <span className="rounded border px-1.5 text-[11px] font-semibold" data-testid="sponsored-test-label">Test placement · not a paid ad</span>}</span>
          <Link href="/advertise#about-placements" className="text-xs link">Why am I seeing this?</Link></div>
        <a href={c.clickHref} rel="sponsored noopener" target="_blank" className="block">
          {c.imageUrl && <img src={c.imageUrl} alt="" className="mb-2 max-h-48 rounded" loading="lazy" />}
          <p className="font-bold">{c.title}</p>{c.body && <p className="text-sm text-muted-foreground">{c.body}</p>}
          <p className="mt-1 text-xs text-muted-foreground">by {c.advertiser}</p></a>
        {c.beaconUrl && <img src={c.beaconUrl} alt="" width={0} height={0} className="hidden" />}
      </aside>
    );
    return wrap === "li" ? <li>{card}</li> : card;
  } catch {
    return null; // Revive/PB problems must never break the page.
  }
}
