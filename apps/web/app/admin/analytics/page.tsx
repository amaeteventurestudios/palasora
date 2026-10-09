import { getTenant } from "@/lib/tenant";
import { pb, q } from "@/lib/pb";
import { getSwitch } from "@/lib/settings";
import { opsAction } from "@/app/actions/admin";
import { AdminForm } from "@/components/admin/AdminForm";
import { H1, Metric, Table } from "@/components/admin/ui";

export const metadata = { title: "Audience Analytics" };
const DEFS: [string, string, string][] = [
  ["story_viewed", "Story views", "Visible ≥2 s, consent given. Not unique humans or read-throughs."],
  ["story_viewed:sessions", "Estimated browser reach", "Distinct daily-rotating pseudonymous browser IDs. Not people."],
  ["source_opened", "Source link clicks", "Click on a citation. Not proof the source loaded."],
  ["share_clicked", "Share intents", "Share button selected. Not a completed external post."],
  ["time_lens_opened", "Time Lens opens", "History module opened."],
  ["comment_created", "Human comments", "Server-confirmed approved human comments. AI excluded."],
  ["vote_cast", "Votes", "Unique member votes."],
  ["signup_completed", "Sign-ups", "Accounts created. Not unique real-world people."],
  ["inquiry_created", "Sponsor inquiries", "Durably stored inquiries. CRM delivery tracked separately."],
  ["story_published", "Stories published", "Editorial gate commits."],
  ["ai_generation_completed", "AI generations", "Worker runs. Never counted as human activity."],
];

export default async function Analytics({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const t = await getTenant();
  const days = [1, 7, 30].includes(Number((await searchParams).days)) ? Number((await searchParams).days) : 7;
  const since = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
  const [rows, enabled] = await Promise.all([pb.list("aggregated_metrics", { filter: `tenant_id=${q(t.id)} && date_bucket >= ${q(since)}`, sort: "date_bucket", perPage: 1000 }), getSwitch(t.id, "ANALYTICS_ENABLED")]);
  const total = (ev: string) => rows.filter((r) => r.event === ev).reduce((a, r) => a + r.count, 0);
  const asof = rows.map((r) => r.asof).sort().at(-1);
  const daysList = [...new Set(rows.map((r) => r.date_bucket))];
  const views = total("story_viewed"), shares = total("share_clicked");
  return (
    <div>
      <H1 sub={`Tenant-scoped first-party events, aggregated by DuckDB. Last aggregation: ${asof ? `${asof.slice(0, 16)} UTC` : "never"}.`}>Audience Analytics</H1>
      <nav aria-label="Period" className="scroll-row mb-4">{[1, 7, 30].map((d) => <a key={d} className="chip" aria-current={d === days ? "true" : undefined} href={`/admin/analytics?days=${d}`}>{d === 1 ? "Today" : `${d} days`}</a>)}</nav>
      {!enabled && <p className="mb-4 font-semibold text-danger">Tracking disabled for this tenant.</p>}
      <AdminForm action={opsAction} submit="Aggregate now"><input type="hidden" name="action" value="etl" /></AdminForm>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {DEFS.map(([ev, label, def]) => <Metric key={ev} label={label} value={total(ev)} period={`Last ${days} day(s)`} source="First-party events" state={!enabled ? "not_connected" : rows.length ? "ok" : "delayed"} hint={def} />)}
        <Metric label="Share intent rate" value={views ? `${((shares / views) * 100).toFixed(1)}%` : null} period={`Last ${days} day(s)`} source="share_clicked ÷ story_viewed" state={views ? "ok" : "zero"} hint="Not attributable to referred visits" />
        <Metric label="Search Console" value={null} period="n/a" source="Not linked" state="not_connected" />
      </div>
      <div className="mt-6"><Table caption="Funnel: viewed → source explored → share clicked (by day)" head={["Day", "Views", "Sources opened", "Share intents", "Human comments"]} empty={rows.length ? "No rows." : "Not enough data to compare periods."}>
        {daysList.map((d) => { const v = (e: string) => rows.filter((r) => r.date_bucket === d && r.event === e).reduce((a, r) => a + r.count, 0);
          return <tr key={d}><td className="px-3 py-2">{d}</td><td className="px-3 py-2">{v("story_viewed")}</td><td className="px-3 py-2">{v("source_opened")}</td><td className="px-3 py-2">{v("share_clicked")}</td><td className="px-3 py-2">{v("comment_created")}</td></tr>; })}
      </Table></div>
      <p className="meta mt-3">Retention: raw events 30 days, aggregates kept. No IP, email or free text is stored in analytics. Opt-out stops all client events.</p>
    </div>
  );
}
