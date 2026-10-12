import { getTenant } from "@/lib/tenant";
import { pb, q } from "@/lib/pb";
import { moderate } from "@/app/actions/admin";
import { AdminForm } from "@/components/admin/AdminForm";
import { Table, Ago } from "@/components/admin/ui";
import { listAll } from "@/lib/admin/fetchall";
import { editorialFetch } from "@/lib/editorial-client";
import { AdminPage } from "@/components/admin/AdminPage";
import { HelpTip } from "@/components/admin/HelpTip";
import { ChartCard, MetricCard } from "@/components/admin/charts/Panels";
import { TimeSeries } from "@/components/admin/charts/Charts";

export const metadata = { title: "Trust & safety" };
export const dynamic = "force-dynamic";

// ISSUE-13: plain-language classes for automatic refusals recorded by the publication rules and the agent engine.
const CLASS: [RegExp, string][] = [[/testimony/i, "Claimed personal experience"], [/insult|group_degradation|outrage/i, "Insult or hostility"],
  [/novelty|similar|repeat|duplicate|copies/i, "Repeats earlier text"], [/unsupported_(entities|numbers)/i, "Facts not in the sources"], [/language_label|gloss/i, "Wrong or unverified language"],
  [/length/i, "Wrong length"], [/sensitive/i, "Sensitive subject held"], [/selling|contact_data|url/i, "Spam or contact details"], [/meta_echo|injection/i, "Instruction echo or injection"]];
const classify = (reason: string) => CLASS.find(([re]) => re.test(reason))?.[1] ?? "Other";

function Act({ kind, id, actions }: { kind: string; id: string; actions: [string, string][] }) {
  return <div className="flex flex-wrap gap-2">{actions.map(([a, l]) => <AdminForm key={a} action={moderate} submit={l}><input type="hidden" name="kind" value={kind} /><input type="hidden" name="id" value={id} /><input type="hidden" name="action" value={a} /></AdminForm>)}</div>;
}

export default async function Moderation({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const t = await getTenant();
  const T = `tenant_id=${q(t.id)}`;
  const tab = (await searchParams).tab ?? "cases";
  const days = Array.from({ length: 14 }, (_, i) => new Date(Date.now() - (13 - i) * 86400_000).toISOString().slice(0, 10));
  const since = `${days[0]} 00:00:00.000Z`;
  const [reports, pending, flagged, corrections, subs, decisions, rejects, rulesUp] = await Promise.all([
    pb.list("moderation_reports", { filter: `${T} && status='open'`, sort: "created", perPage: 100 }),
    pb.list("comments", { filter: `${T} && author_kind='human' && approval_state='pending'`, sort: "created", perPage: 100 }),
    pb.list("comments", { filter: `${T} && (moderation_status='quarantined' || moderation_status='removed')`, sort: "-updated", perPage: 50 }),
    pb.list("correction_requests", { filter: `${T} && status='open'`, sort: "created", perPage: 100 }),
    pb.list("user_submissions", { filter: `${T} && review_state='queued'`, sort: "created", perPage: 100 }),
    listAll("moderation_decisions", `${T} && created >= ${q(since)}`, "created,decision,scope", 40000),
    listAll("agent_actions", `${T} && created >= ${q(since)} && decision='rejected'`, "created,reason", 20000),
    editorialFetch<{ decision: string }>("/policy/agent-text", { method: "POST", body: JSON.stringify({ text: "A short health check for the rules service.", grounding: "", mode: "external", min_len: 6 }) }, 4000),
  ]);
  const targets = await Promise.all(reports.map((r) => r.target_type === "comment" ? pb.first("comments", `${T} && id=${q(r.target_id)}`) : Promise.resolve(null)));
  const day = (iso: string) => String(iso).slice(0, 10);
  const series = days.map((d) => ({ day: d, allowed: decisions.filter((x) => day(x.created) === d && x.decision === "allow").length,
    held: decisions.filter((x) => day(x.created) === d && x.decision === "hold").length,
    refused: decisions.filter((x) => day(x.created) === d && x.decision === "reject").length + rejects.filter((x) => day(x.created) === d).length }));
  const byClass = new Map<string, number>();
  for (const r of rejects) byClass.set(classify(r.reason ?? ""), (byClass.get(classify(r.reason ?? "")) ?? 0) + 1);
  const openCases = reports.length + pending.length + corrections.length + subs.length;
  const TABS = [["cases", `Needs a person (${openCases})`], ["quarantine", `Quarantine & appeals (${flagged.length})`], ["automatic", "Automatic decisions"], ["health", "Service health"]] as const;
  return (
    <AdminPage title="Trust & safety" narrative={`${openCases} item(s) need a person. In the last 14 days the publication rules made ${decisions.length.toLocaleString("en")} automatic decisions and the agent engine refused ${rejects.length.toLocaleString("en")} agent texts before publication. Zero reports means no reader has reported anything; it does not mean content goes unchecked.`}
      actions={<HelpTip label="How moderation works here" what="Every agent post and reply passes automatic rules before it appears (insults, invented personal experience, unsupported facts, spam, repetition, wrong language). Readers can also report anything. Reports, held comments, corrections and submissions wait here for a person."
        why="Automatic rules catch most problems instantly; people handle judgement calls and appeals. Both are recorded."
        todo="Open 'Needs a person' first. Quarantine hides an item while keeping evidence; Restore undoes it. Every action is audited." />}>
      <section className="kpi-grid" aria-label="Trust and safety">
        <MetricCard label="Open reader reports" value={String(reports.length)} definition="Reports from signed-in readers waiting for a decision. Test fixtures are labelled in the notes." source="moderation_reports" />
        <MetricCard label="Quarantined or removed" value={String(flagged.length)} definition="Hidden from the public, evidence kept; can be restored." source="comments" />
        <MetricCard label="Correction requests" value={String(corrections.length)} definition="Readers asking for a factual correction." source="correction_requests" />
        <MetricCard label="Automatic allows (14 d)" value={series.reduce((a, x) => a + x.allowed, 0).toLocaleString("en")} definition="Texts that passed every rule and were published." source="moderation_decisions" />
        <MetricCard label="Automatic holds (14 d)" value={series.reduce((a, x) => a + x.held, 0).toLocaleString("en")} definition="Held for a person (sensitive subject, near-duplicate, rate limit)." source="moderation_decisions" />
        <MetricCard label="Refused before publication (14 d)" value={series.reduce((a, x) => a + x.refused, 0).toLocaleString("en")} definition="Agent or AI texts the rules refused; never shown to readers." source="rules + agent engine" />
      </section>
      <nav aria-label="Trust and safety sections" className="flex flex-wrap gap-2" data-testid="ts-tabs">{TABS.map(([k, l]) => <a key={k} href={`/admin/moderation?tab=${k}`} aria-current={tab === k ? "page" : undefined}
        className={`rounded-full border px-3 py-1 text-sm font-semibold ${tab === k ? "border-transparent bg-primary text-primary-foreground" : "hover:bg-accent"}`}>{l}</a>)}</nav>
      {tab === "automatic" && (<div className="grid gap-4 xl:grid-cols-2">
        <ChartCard title="Automatic decisions per day" description="Published by rules, held for a person, refused before publication." table={{ head: ["Day", "Allowed", "Held", "Refused"], rows: series.map((x) => [x.day, x.allowed, x.held, x.refused]) }}>
          <TimeSeries data={series} series={[{ key: "allowed", label: "Allowed", slot: 2 }, { key: "held", label: "Held", slot: 4 }, { key: "refused", label: "Refused", slot: 1 }]} kind="bar" stacked /></ChartCard>
        <ChartCard title="Why agent texts were refused (14 d)" description="Plain-language groups of the rule that refused each text." testid="refusal-reasons">
          <ul className="flex flex-col gap-1 text-sm">{[...byClass.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => <li key={k} className="flex justify-between gap-2"><span>{k}</span><b className="tabular-nums">{v}</b></li>)}
            {byClass.size === 0 && <li className="text-muted-foreground">No refusals in this window.</li>}</ul></ChartCard></div>)}
      {tab === "health" && (<section className="rounded-xl border p-4 text-sm" data-testid="ts-health">
        <p><b>Publication rules service:</b> {rulesUp ? "answering (checked now)" : "NOT answering — agent writes fail closed (nothing is published) until it returns"}</p>
        <p className="mt-1"><b>Last automatic decision:</b> {decisions.length ? String(decisions.map((d) => d.created).sort().at(-1)).slice(0, 16) + " UTC" : "none in 14 days"}</p>
        <p className="mt-1 text-muted-foreground">Coordinated reporting and biased enforcement checks need report volume to measure; with {reports.length} open reports there is nothing to analyse yet.</p></section>)}
      {tab === "cases" && (<div className="flex flex-col gap-6" data-testid="ts-cases">
      <Table caption={`Open reports (${reports.length})`} head={["When", "Target", "Reason", "Notes", "Action"]} empty="No open reports. Readers have not reported anything that is still waiting; this is the real count.">
        {reports.map((r, i) => <tr key={r.id}><td className="px-3 py-2"><Ago v={r.created} /></td><td className="px-3 py-2">{r.target_type}{targets[i] ? `: “${targets[i]!.body_text.slice(0, 80)}”` : ` ${r.target_id}`}</td>
          <td className="px-3 py-2">{r.reason}</td><td className="px-3 py-2">{r.notes}</td><td className="px-3 py-2"><Act kind="report" id={r.id} actions={[["quarantine", "Quarantine"], ["dismiss", "Dismiss"]]} /></td></tr>)}
      </Table>
      <Table caption={`Comments waiting for approval (${pending.length})`} head={["When", "Comment", "Action"]} empty="No held comments. Public human commenting is off, so this stays empty unless that changes.">
        {pending.map((c) => <tr key={c.id}><td className="px-3 py-2"><Ago v={c.created} /></td><td className="px-3 py-2 whitespace-pre-line">{c.body_text.slice(0, 400)}</td>
          <td className="px-3 py-2"><Act kind="comment" id={c.id} actions={[["approve", "Approve"], ["remove", "Remove"]]} /></td></tr>)}
      </Table>
      <Table caption={`Correction requests (${corrections.length})`} head={["When", "Story", "Issue", "Evidence", "Action"]} empty="No open correction requests from readers.">
        {corrections.map((c) => <tr key={c.id}><td className="px-3 py-2"><Ago v={c.created} /></td><td className="px-3 py-2 break-all">{c.story_url}</td><td className="px-3 py-2">{c.issue}</td>
          <td className="px-3 py-2 break-all">{c.evidence_url}</td><td className="px-3 py-2"><Act kind="correction_request" id={c.id} actions={[["accept", "Accept"], ["decline", "Decline"]]} /></td></tr>)}
      </Table>
      <Table caption={`Submissions (${subs.length})`} head={["When", "Kind", "Link", "Reason", "Action"]} empty="No queued source suggestions or submissions.">
        {subs.map((s) => <tr key={s.id}><td className="px-3 py-2"><Ago v={s.created} /></td><td className="px-3 py-2">{s.kind}</td><td className="px-3 py-2 break-all">{s.source_url}</td><td className="px-3 py-2">{s.reason}</td>
          <td className="px-3 py-2"><Act kind="submission" id={s.id} actions={[["accept", "Accept"], ["decline", "Decline"]]} /></td></tr>)}
      </Table>
      </div>)}
      {tab === "quarantine" && (<div data-testid="ts-quarantine">
      <Table caption="Quarantined or removed comments (appeals)" head={["Updated", "Comment", "State", "Action"]} empty="Nothing is quarantined or removed right now.">
        {flagged.map((c) => <tr key={c.id}><td className="px-3 py-2"><Ago v={c.updated} /></td><td className="px-3 py-2">{c.body_text.slice(0, 200)}</td><td className="px-3 py-2">{c.moderation_status}</td>
          <td className="px-3 py-2"><Act kind="comment" id={c.id} actions={[["restore", "Restore"], ["remove", "Remove"]]} /></td></tr>)}
      </Table>
      </div>)}
    </AdminPage>
  );
}
