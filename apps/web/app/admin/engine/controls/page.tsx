// v1.7 Palavva AI Engine Control Room (docs/specs/31): persisted, audited, revisioned settings for discovery, news and
// original-discussion cadence, replies, votes/follows, the fictional Exchange, activation capacity and model spend,
// with global defaults and country overrides. Reads: staff; changes: tenant admins (re-checked by /api/admin/engine-config).
import { getTenant } from "@/lib/tenant";
import { getSession, hasRole } from "@/lib/session";
import { countryCodes, countryName, flag, regionOf } from "@/lib/edition";
import { editorial, groups } from "@/lib/admin/population";
import { AdminPage } from "@/components/admin/AdminPage";
import { ControlRoom, type View } from "@/components/admin/engine/ControlRoom";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "Engine Control Room" };
export const dynamic = "force-dynamic";

export default async function ControlsPage() {
  const t = await getTenant();
  const session = (await getSession(t))!;
  const [r, g] = await Promise.all([editorial(`/engine-config?tenant_id=${encodeURIComponent(t.id)}`), groups(t)]);
  const countries = countryCodes().map((cc) => ({ cc, name: countryName(cc), region: regionOf(cc), flag: flag(cc) }));
  const view = r.status === 200 ? (r.body as View) : null;
  return (
    <AdminPage title="Engine Control Room" narrative={view ? `Revision ${view.config.revision ?? 0}. One engine for all 54 countries: global defaults, country overrides, and caps that no country can exceed. Saved settings apply within about ${view.applies_within_s} seconds, with no rebuild or restart.` : "Settings unavailable."}>
      {view ? <ControlRoom initial={view} countries={countries} groups={g} csrf={session.csrf} canEdit={hasRole(session, "tenant_admin")} />
        : <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">The editorial service is not answering; settings cannot be shown or changed right now.</CardContent></Card>}
    </AdminPage>
  );
}
