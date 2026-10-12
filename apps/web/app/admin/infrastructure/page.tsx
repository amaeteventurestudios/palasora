// ISSUE-21 Operations -> Infrastructure & Services: everything installed, running and depended on for Palavva on this
// host, plus configured integrations by name. Read-only; restarts stay in System health with their audit trail.
import { inventory } from "@/lib/admin/inventory";
import { AdminPage } from "@/components/admin/AdminPage";
import { HelpTip } from "@/components/admin/HelpTip";
import { MetricCard } from "@/components/admin/charts/Panels";
import { InfraWorkspace } from "@/components/admin/infra/InfraWorkspace";

export const metadata = { title: "Infrastructure & services" };
export const dynamic = "force-dynamic";

export default async function Infrastructure() {
  const inv = await inventory();
  const n = (st: string) => inv.services.filter((s) => s.status === st).length;
  const procs = inv.services.filter((s) => s.kind === "process");
  return (
    <AdminPage title="Infrastructure & services" narrative={`Last scan ${inv.at.slice(11, 16)} UTC on ${inv.host.name}. ${procs.filter((p) => p.status !== "down").length} of ${procs.length} Palavva processes are up; ${inv.packages.length} installed packages; ${inv.alerts.length} alert(s). Remote hosts are shown only as configured or not configured.`}
      actions={<HelpTip label="Running vs healthy" what="Running means the program is alive. Healthy means it also answered its health check. Not configured means Palavva has no address or credentials for it here."
        why="A service can be running but broken; the difference tells you whether to restart it or look deeper."
        todo="Use Dependencies to see what breaks if something fails, and Alerts for what needs attention. Restarts are on System health, where they are recorded." />}>
      <section className="kpi-grid" aria-label="Summary">
        <MetricCard label="Healthy" value={String(n("healthy"))} definition="Answered a health check in this scan." source="health endpoints" />
        <MetricCard label="Running, no health check" value={String(n("running"))} definition="Process alive; it has no health endpoint to ask." source="pid files + ps" />
        <MetricCard label="Down or degraded" value={String(n("down") + n("degraded"))} definition="Not running, or running but failing its check." source="this scan" />
        <MetricCard label="Not configured" value={String(n("not_configured"))} definition="Integrations without an address or credentials here (for example EspoCRM and Revive)." source="configuration (names only)" />
        <MetricCard label="Installed packages" value={String(inv.packages.length)} definition="Web (npm) and Python packages with versions and licences, read from what is installed." source="package files" />
        <MetricCard label="Alerts" value={String(inv.alerts.length)} definition="Down services, disk over 90 %, old backups, failed jobs." source="this scan" />
      </section>
      <InfraWorkspace inv={inv} />
    </AdminPage>
  );
}
