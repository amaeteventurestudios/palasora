import Link from "next/link";
import { getTenant } from "@/lib/tenant";
import { pb, pbDate, q } from "@/lib/pb";
import { env } from "@/lib/env";
import { backupStatus, editorialStatus } from "@/lib/ops";
import { H1, Metric, Ago } from "@/components/admin/ui";

export const metadata = { title: "Overview" };

export default async function Overview() {
  const t = await getTenant();
  const T = `tenant_id=${q(t.id)}`;
  const week = pbDate(new Date(Date.now() - 7 * 86400_000));
  const [published, publishedDemo, pending, held, comments7, sources, reports, inquiries, status, backup, metrics, oldest] = await Promise.all([
    pb.count("editorial_pieces", `${T} && review_status='published' && is_demo=false`),
    pb.count("editorial_pieces", `${T} && review_status='published' && is_demo=true`),
    pb.count("editorial_pieces", `${T} && (review_status='needs_review' || review_status='changes_requested')`),
    pb.count("editorial_pieces", `${T} && review_status='held'`),
    pb.count("comments", `${T} && author_kind='human' && approval_state='approved' && created >= ${q(week)}`),
    pb.list("sources", { filter: T, perPage: 200 }),
    pb.count("moderation_reports", `${T} && status='open'`),
    pb.list("sponsor_inquiries", { filter: T, perPage: 200, fields: "id,forward_state" }),
    editorialStatus(t.id), backupStatus(),
    pb.list("aggregated_metrics", { filter: `${T} && date_bucket >= ${q(week.slice(0, 10))}`, perPage: 500 }),
    pb.first("editorial_pieces", `${T} && review_status='needs_review'`, "created"),
  ]);
  const enabled = sources.filter((s) => s.enabled && s.rights_status === "approved");
  const failing = sources.filter((s) => s.enabled && (s.consecutive_failures ?? 0) > 0);
  const sum = (ev: string) => metrics.filter((m) => m.event === ev).reduce((a, m) => a + (m.count ?? 0), 0);
  const reach = sum("story_viewed:sessions");
  const lastAgg = metrics.map((m) => m.asof).sort().at(-1);
  const pendingFwd = inquiries.filter((i) => i.forward_state !== "FORWARDED").length;
  const q7 = status?.queue.by_state ?? {};
  return (
    <div>
      <H1 sub={`Tenant: ${t.name}. Every figure shows its period and source. Demo fixtures are counted separately.`}>Overview</H1>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Published (real)" value={published} period="All time" source="PocketBase editorial_pieces" state={published ? "ok" : "zero"} hint={`${publishedDemo} demo fixtures published (excluded)`} />
        <Metric label="Pending review" value={pending} period="Now" source="Editorial queue" hint={`${held} held`} />
        <Metric label="Human comments" value={comments7} period="Last 7 days" source="Approved human comments only (AI excluded)" />
        <Metric label="Estimated browser reach" value={reach || null} period="Last 7 days" source="Consent-based pseudonymous sessions (not people)"
          state={metrics.length ? (reach ? "ok" : "zero") : "delayed"} hint={metrics.length ? `Aggregated ${lastAgg?.slice(0, 16) ?? ""} UTC` : "Not enough data to compare periods"} />
        <Metric label="Sources healthy / enabled" value={`${enabled.length - failing.length} / ${enabled.length}`} period="Now" source="Source registry" hint={`${sources.length - enabled.length} candidates not approved`} />
        <Metric label="AI queue" value={status ? (q7.queued ?? 0) + (q7.running ?? 0) : null} period="Now" source="Editorial job queue" state={status ? "ok" : "unknown"}
          hint={status ? `${q7.dead ?? 0} dead letters · Qwen ${status.provider.reachable ? `reachable (${status.provider.latency_ms} ms)` : "UNREACHABLE"}` : "Editorial service unreachable"} />
        <Metric label="Inference budget used" value={status?.budget_used_today ?? null} unit={`/ ${status?.budget_limit ?? "?"} requests`} period="Today (UTC)" source="Worker quota counter" state={status ? "ok" : "unknown"} hint="Local Qwen; paid cloud providers disabled" />
        <Metric label="Backup age" value={backup.ageHours != null ? backup.ageHours.toFixed(1) : null} unit="hours" period="Latest local backup" source="backups/ directory" state={backup.latest ? "ok" : "unknown"}
          hint={backup.latest ? `${backup.count} archives · restore drill ${backup.restoreDrill ? "verified" : "not yet run"}` : "No backup found. Run scripts/backup.sh"} />
        <Metric label="EspoCRM bridge" value={null} period="Now" source="Environment config" state={env.espoConfigured ? "ok" : "not_connected"} hint={`${inquiries.length} inquiries stored · ${pendingFwd} not forwarded`} />
        <Metric label="Revive ad server" value={null} period="Now" source="Environment config" state={env.reviveConfigured ? "ok" : "not_connected"} hint="No sponsored slot renders without an approved zone" />
        <Metric label="Open reports" value={reports} period="Now" source="Moderation queue" />
        <Metric label="Revenue" value={null} period="n/a" source="No billing system" state="not_connected" hint="No payments are built in this MVP" />
      </div>
      <section className="card mt-6 p-5" aria-labelledby="tasks">
        <h2 id="tasks" className="text-lg font-bold">Needs attention</h2>
        <ul className="mt-2 flex flex-col gap-2 text-sm">
          {oldest ? <li>Oldest draft waiting for review: <Link className="link" href={`/admin/editorial/${oldest.id}`}>{oldest.headline}</Link> (<Ago v={oldest.created} />)</li> : <li>No drafts waiting for review.</li>}
          {failing.map((s) => <li key={s.id}>Source failing: <Link className="link" href="/admin/sources">{s.publisher_name}</Link> ({s.last_error_code}, {s.consecutive_failures}×). Source check failed. No unverified content was published.</li>)}
          {reports > 0 && <li><Link className="link" href="/admin/moderation">{reports} open moderation reports</Link></li>}
          {(q7.dead ?? 0) > 0 && <li><Link className="link" href="/admin/health">{q7.dead} jobs in the dead-letter queue</Link></li>}
          {status && !status.provider.reachable && <li className="text-danger">AI generation is paused or unreachable. Published content remains available.</li>}
          {!status && <li className="text-danger">Editorial service unreachable: ingestion and AI drafting are stopped; public pages are unaffected.</li>}
        </ul>
      </section>
    </div>
  );
}
