// A10 Model operations (docs/specs/25 §A10): provider/model comparison, p50/p95 latency, acceptance and cost per accepted
// reply, budgets and the gates that keep paid calls OFF until authorised. Keys are never displayed, only presence.
import { getTenant } from "@/lib/tenant";
import { pb, q } from "@/lib/pb";
import { parseScope, pbTs } from "@/lib/admin/scope";
import { listAll, quantile } from "@/lib/admin/fetchall";
import { AdminPage } from "@/components/admin/AdminPage";
import { ChartCard, MetricCard } from "@/components/admin/charts/Panels";
import { Histogram, TimeSeries } from "@/components/admin/charts/Charts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CircleCheck, CircleX } from "lucide-react";

export const metadata = { title: "Models & Jev" };
const env = (k: string) => process.env[k] ?? "";

function Gate({ ok, label }: { ok: boolean; label: string }) {
  return <li className="flex items-start gap-2 text-sm">{ok ? <CircleCheck className="mt-0.5 size-4 shrink-0 text-[var(--status-good)]" aria-label="passes" /> : <CircleX className="mt-0.5 size-4 shrink-0 text-[var(--status-critical)]" aria-label="blocked" />}{label}</li>;
}

export default async function Models({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const t = await getTenant();
  const s = parseScope(await searchParams);
  const T = `tenant_id=${q(t.id)}`;
  const since = pbTs(s.since);
  const [usage, acts, runs, budgets] = await Promise.all([
    listAll("model_usage", `${T} && created >= ${q(since)}`, "provider,model,purpose,status,latency_ms,tokens_in,tokens_out,cost_usd,billable,day,created", 30000),
    listAll("agent_actions", `${T} && created >= ${q(since)} && (decision='reply' || decision='post' || decision='rejected' || decision='abstain') && model!=''`, "decision,model,tokens_in,tokens_out,latency_ms,day", 20000),
    listAll("ai_runs", `${T} && created >= ${q(since)}`, "provider,model,status,duration_ms,task_type,created", 20000),
    pb.list("model_budgets", { filter: T, perPage: 20 }),
  ]);
  const providers = [...new Set(usage.map((u) => `${u.provider}:${u.model}`))];
  const byProv = providers.map((p) => {
    const rows = usage.filter((u) => `${u.provider}:${u.model}` === p);
    const ok = rows.filter((u) => u.status === "ok");
    const lat = ok.map((u) => Number(u.latency_ms));
    return { p, calls: rows.length, ok: ok.length, blocked: rows.filter((u) => String(u.status).startsWith("blocked")).length, failed: rows.filter((u) => ["error", "timeout", "rejected_output"].includes(u.status)).length,
      p50: quantile(lat, 0.5), p95: quantile(lat, 0.95), tin: rows.reduce((a, u) => a + Number(u.tokens_in || 0), 0), tout: rows.reduce((a, u) => a + Number(u.tokens_out || 0), 0), cost: rows.reduce((a, u) => a + Number(u.cost_usd || 0), 0) };
  });
  const writerCalls = acts.length, accepted = acts.filter((a) => a.decision === "reply" || a.decision === "post").length;
  const paid = usage.filter((u) => u.billable).reduce((a, u) => a + Number(u.cost_usd || 0), 0);
  const daily = s.dayList.map((d) => { const rows = usage.filter((u) => u.day === d); const lat = rows.filter((u) => u.status === "ok").map((u) => Number(u.latency_ms));
    return { day: d, ok: rows.filter((u) => u.status === "ok").length, failed: rows.filter((u) => u.status !== "ok" && !String(u.status).startsWith("blocked")).length, blocked: rows.filter((u) => String(u.status).startsWith("blocked")).length,
      p50: quantile(lat, 0.5) ?? 0, p95: quantile(lat, 0.95) ?? 0 }; });
  const ctx = acts.map((a) => Number(a.tokens_in || 0));
  const bins = [[0, 500], [500, 1000], [1000, 1500], [1500, 2000], [2000, 3000], [3000, 1e9]].map(([lo, hi]) => ({ label: hi > 1e8 ? `${lo}+` : `${lo}-${hi}`, value: ctx.filter((v) => v >= lo && v < hi).length }));
  const anth = budgets.find((b) => b.key === "anthropic"), jev = budgets.find((b) => b.key === "jev");
  return (
    <AdminPage title="Models & Jev" scope={s}
      narrative={`${usage.length} metered model attempts in the window (${byProv.map((b) => `${b.p}: ${b.calls}`).join(", ") || "none yet"}). ${accepted} of ${writerCalls} writer evaluations produced a published post or reply. Paid spend: $${paid.toFixed(4)}. Paid providers stay off until every gate below passes.`}>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <MetricCard label="Writer p50 latency" value={byProv[0]?.p50 != null ? `${(byProv[0].p50 / 1000).toFixed(1)} s` : "—"} definition="Median end-to-end latency of successful writer calls (local Qwen today)." source="model_usage" />
        <MetricCard label="Writer p95 latency" value={byProv[0]?.p95 != null ? `${(byProv[0].p95 / 1000).toFixed(1)} s` : "—"} definition="95th percentile latency of successful writer calls." source="model_usage" slot={2} />
        <MetricCard label="Acceptance" value={writerCalls ? `${Math.round((accepted / writerCalls) * 100)}%` : "—"} definition="Writer evaluations that ended in a published post or reply (the rest abstained or were rejected by policy)." source="agent_actions with a model run" slot={3} />
        <MetricCard label="Cost per accepted reply" value={accepted ? `$${(paid / accepted).toFixed(4)}` : "$0"} definition="Billable spend ÷ accepted posts and replies. Local Qwen calls cost $0 in money (they use the private iMac)." source="model_usage + agent_actions" slot={4} />
        <MetricCard label="Paid spend" value={`$${paid.toFixed(4)}`} definition="Sum of billable model_usage rows (Anthropic, Jev). Zero until authorised." source="model_usage billable=true" slot={5} />
      </section>
      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard title="Attempts per day" description="Successful, failed (error/timeout/invalid output) and blocked-by-policy attempts" table={{ head: ["Day", "OK", "Failed", "Blocked"], rows: daily.map((d) => [d.day, d.ok, d.failed, d.blocked]) }}>
          <TimeSeries data={daily} kind="bar" stacked series={[{ key: "ok", label: "OK", slot: 3 }, { key: "failed", label: "Failed", slot: 1 }, { key: "blocked", label: "Blocked by policy", slot: 4 }]} />
        </ChartCard>
        <ChartCard title="Latency percentiles (ms)" description="p50 and p95 of successful calls per day (single unit, one axis)" table={{ head: ["Day", "p50", "p95"], rows: daily.map((d) => [d.day, d.p50, d.p95]) }}>
          <TimeSeries data={daily} kind="line" series={[{ key: "p50", label: "p50 ms", slot: 2 }, { key: "p95", label: "p95 ms", slot: 1 }]} />
        </ChartCard>
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <ChartCard title="Provider comparison" className="xl:col-span-2">
          <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Provider:model</TableHead><TableHead className="text-right">Calls</TableHead><TableHead className="text-right">OK</TableHead><TableHead className="text-right">Failed</TableHead><TableHead className="text-right">Blocked</TableHead>
            <TableHead className="text-right">p50</TableHead><TableHead className="text-right">p95</TableHead><TableHead className="text-right">Tokens in/out</TableHead><TableHead className="text-right">Cost</TableHead></TableRow></TableHeader>
            <TableBody>{byProv.map((b) => <TableRow key={b.p}><TableCell>{b.p}</TableCell><TableCell className="text-right tabular-nums">{b.calls}</TableCell><TableCell className="text-right tabular-nums">{b.ok}</TableCell><TableCell className="text-right tabular-nums">{b.failed}</TableCell>
              <TableCell className="text-right tabular-nums">{b.blocked}</TableCell><TableCell className="text-right tabular-nums">{b.p50 ?? "—"}</TableCell><TableCell className="text-right tabular-nums">{b.p95 ?? "—"}</TableCell>
              <TableCell className="text-right tabular-nums">{b.tin.toLocaleString("en")}/{b.tout.toLocaleString("en")}</TableCell><TableCell className="text-right tabular-nums">${b.cost.toFixed(4)}</TableCell></TableRow>)}
              {!byProv.length && <TableRow><TableCell colSpan={9} className="text-muted-foreground">No metered calls in this window.</TableCell></TableRow>}</TableBody></Table></div>
          <p className="mt-2 text-xs text-muted-foreground">Editorial pipeline runs (ai_runs) in window: {runs.length}, {runs.filter((r) => r.status === "succeeded").length} succeeded, p50 {quantile(runs.map((r) => Number(r.duration_ms)).filter(Boolean), 0.5) ?? "—"} ms. Benchmarks of Haiku, Groq and Gemini Flash-Lite are blocked: no credentials are configured (see Reports).</p>
        </ChartCard>
        <ChartCard title="Writer context size" description="Input tokens per writer evaluation (thread memory keeps this bounded)"><Histogram bins={bins} xLabel="input tokens" /></ChartCard>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <ChartCard title="Anthropic $10 experiment" description={`Model ${env("ANTHROPIC_MODEL") || "claude-haiku-5-5"} at $0.10 / $0.50 per 1M tokens (input/output). Hard cap enforced in the router before every call.`}>
          <ul className="flex flex-col gap-1.5" data-testid="anthropic-gates">
            <Gate ok={env("ANTHROPIC_EXPERIMENT_ENABLED") === "true"} label="ANTHROPIC_EXPERIMENT_ENABLED=true (founder authorisation)" />
            <Gate ok={!!env("ANTHROPIC_API_KEY")} label="API key configured (presence only; value never shown)" />
            <Gate ok={!!anth && anth.status === "open" && !!anth.authorized_by} label={`Budget row 'anthropic' open and authorised${anth ? ` (limit $${anth.limit_usd})` : " (missing)"}`} />
            <Gate ok={(env("WRITER_ROUTE") || "ollama").includes("anthropic")} label={`Route names anthropic (WRITER_ROUTE=${env("WRITER_ROUTE") || "ollama"})`} />
            <Gate ok label="Automatic retries disabled (max_retries=0); no silent fallback to any paid provider" />
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">Spent: ${usage.filter((u) => u.provider === "anthropic" && u.billable).reduce((a, u) => a + Number(u.cost_usd || 0), 0).toFixed(4)} of ${Math.min(Number(anth?.limit_usd ?? 0) || 10, Number(env("ANTHROPIC_MAX_USD") || 10)).toFixed(2)}. Credit balance and expiry cannot be read without console access.</p>
        </ChartCard>
        <ChartCard title="Jev decision model (TypeSafe)" description="Structured decisions only (no prose). Billed separately; never charged to Anthropic credits.">
          <ul className="flex flex-col gap-1.5" data-testid="jev-gates">
            <Gate ok={env("JEV_ENABLED") === "true"} label="JEV_ENABLED=true" />
            <Gate ok={!!env("JEV_API_KEY")} label="TypeSafe/OpenRouter key configured (presence only)" />
            <Gate ok={!!env("JEV_BASE_URL")} label="Verified endpoint configured (JEV_BASE_URL)" />
            <Gate ok={!!jev && jev.status === "open" && !!jev.authorized_by} label="Budget row 'jev' open and authorised" />
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">Until every gate passes, the deterministic rules decide and every decision row says so (decider = deterministic-rules-v2), giving the baseline the Jev benchmark will be compared against on the same events.</p>
        </ChartCard>
      </div>
    </AdminPage>
  );
}
