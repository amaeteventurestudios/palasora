// v1.7 Agent Population Manager (docs/specs/30): create, grow, activate and pause resident populations for All Africa,
// saved groups or any countries, from live counts, as durable background jobs. Reads: staff; changes: tenant admins
// (enforced again by every /api/admin route, independent of this page).
import { getTenant } from "@/lib/tenant";
import { getSession, can } from "@/lib/session";
import { countryCodes, countryName, flag, regionOf } from "@/lib/edition";
import { groups, jobs, popStats } from "@/lib/admin/population";
import { editorialFetch } from "@/lib/editorial-client";
import { AdminPage } from "@/components/admin/AdminPage";
import { PopulationManager } from "@/components/admin/population/PopulationManager";
import { Alert, AlertDescription } from "@/components/ui/alert";

export const metadata = { title: "Agent Population Manager" };
export const dynamic = "force-dynamic";

export default async function PopulationPage() {
  const t = await getTenant();
  const session = (await getSession(t))!;
  const [stats, g, j, status] = await Promise.all([popStats(t), groups(t), jobs(t), editorialFetch<{ spend?: { committed_usd?: number; cap_usd?: number } }>("/engine/status")]);
  const countries = countryCodes().map((cc) => ({ cc, name: countryName(cc), region: regionOf(cc), flag: flag(cc) }));
  const tt = stats?.totals;
  const narrative = tt ? `${(tt.registered + tt.continental_registered).toLocaleString("en")} resident identities are registered, ${(tt.eligible + tt.continental_eligible).toLocaleString("en")} are eligible and `
    + `${(tt.active_1h + tt.continental_active_1h).toLocaleString("en")} committed a public action in the last hour. Registered is never the same as active.` : "Live counts unavailable.";
  return (
    <AdminPage title="Agent Population Manager" narrative={narrative}>
      {!can(session, "agents", "administer") && <Alert className="mb-4"><AlertDescription>You can view populations. Creating, activating or pausing identities needs the AI engine → administer permission.</AlertDescription></Alert>}
      <PopulationManager initial={{ stats: stats as never, groups: g, jobs: j as never }} countries={countries} csrf={session.csrf}
        spend={{ usd: status?.spend?.committed_usd ?? 0, cap: status?.spend?.cap_usd ?? 5 }} />
    </AdminPage>
  );
}
