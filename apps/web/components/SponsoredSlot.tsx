import Link from "next/link";
import { env } from "@/lib/env";
import { pb, q } from "@/lib/pb";
import { getSwitch } from "@/lib/settings";
import type { Tenant } from "@/lib/tenant";
import { SponsoredBadge } from "./Labels";

/**
 * Renders an approved Revive zone ONLY when every gate passes: ads enabled for the tenant,
 * kill switch off, placement approved with a zone ID, and a configured Revive delivery URL.
 * Otherwise the slot collapses. A sponsor is never fabricated (12-SPONSORS).
 */
export async function SponsoredSlot({ tenant, position }: { tenant: Tenant; position: string }) {
  if (!tenant.features.revive_ads || !env.reviveConfigured) return null;
  try {
    if (await getSwitch(tenant.id, "AD_SLOTS_DISABLED")) return null;
    const pl = await pb.first("sponsor_placements", `tenant_id=${q(tenant.id)} && position_key=${q(position)} && enabled=true`);
    if (!pl?.revive_zone_id || !pl.approved_by || !/^\d{1,8}$/.test(pl.revive_zone_id)) return null;
    return (
      <aside aria-label="Sponsored" className="rounded-xl border border-dashed border-border bg-sponsor-surface p-4" data-testid="sponsored-slot">
        <div className="mb-2 flex items-center justify-between"><SponsoredBadge /><Link href="/advertise#about-placements" className="text-xs link">About this placement</Link></div>
        <ins data-revive-zoneid={pl.revive_zone_id} data-revive-id={process.env.REVIVE_ID ?? ""} />
        <script async src={`${process.env.REVIVE_DELIVERY_URL}/asyncjs.php`} />
      </aside>
    );
  } catch {
    return null; // Revive/PB problems must never break the page.
  }
}
