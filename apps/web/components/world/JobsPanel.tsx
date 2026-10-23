"use client";
// Hiring and job boards over the world. Everyone sees the open positions with their wages, the civic job and who was
// hired lately; a resident takes a job or leaves theirs, and an owner posts a job or stops hiring for each business they
// run. Every change goes out as a request that the town's next hour runs through the Actions gate.
import { useCallback, useEffect, useState } from "react";
import { loadJobs, requestJob } from "@/app/actions/town-jobs";
import { requestChange } from "@/app/actions/town-business";
import { JOB_REFUSAL, type JobBoard, type JobKind, type Team } from "@/lib/world/jobs";
import { BUSINESS_LABEL, townTime } from "@/lib/world/layout";
import { REFUSAL_LABEL, sora2 } from "@/lib/world/card";

const btn = "inline-flex min-h-11 items-center justify-center rounded-full px-4 text-sm font-semibold disabled:opacity-50";
const label = (type: string, id: string) => type === "civic" ? "Town Hall (civic job)" : `${BUSINESS_LABEL[type] ?? "Business"} ${id}`;
const hour = (h: number) => `${String(h).padStart(2, "0")}:00`;

export function JobsPanel({ onPlot }: { onPlot(plot: string): void }) {
  const [d, setD] = useState<JobBoard | null | undefined>();
  const [msg, setMsg] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, setPending] = useState(false);
  const reload = useCallback(() => { loadJobs().then(setD).catch(() => setD(null)); }, []);
  useEffect(() => { reload(); }, [reload]);
  if (d === undefined) return <p className="text-sm text-[#4b5566]" data-testid="jobs-loading">Reading the job board…</p>;
  if (!d) return <p className="text-sm text-[#4b5566]">The job board is unreachable right now.</p>;
  const ask = async (kind: JobKind, employer = "") => {
    setPending(true);
    const r = await requestJob(kind, employer).catch(() => ({ ok: false, message: "The town is unreachable right now: nothing was changed." }));
    setPending(false); setMsg(r);
    if (r.ok) reload();
  };
  const job = d.me?.job;
  const waiting = new Set(d.requests.filter((r) => r.status === "queued" && r.kind === "apply_job").map((r) => String(r.inputs.employer)));
  const canApply = (emp: string) => d.resident && job?.employer !== emp && !waiting.has(emp) && !(d.me?.runs.includes(emp));
  return (
    <div className="flex flex-col gap-3 text-sm" data-testid="jobs">
      <p className="text-[#4b5566]" data-testid="jobs-summary">{d.stats.open_positions} open position{d.stats.open_positions === 1 ? "" : "s"} · {d.stats.in_business_jobs} people work in businesses for {sora2(d.stats.avg_wage)} a day on average · work runs {hour(d.hours[0])} to {hour(d.hours[1])}</p>

      {d.me && <section aria-label="Your job" className="rounded-2xl border border-[#d8a838]/50 bg-[#fffaf0] p-3" data-testid="jobs-mine">
        <h3 className="font-semibold">Your job</h3>
        {job ? <p className="mt-1" data-testid="jobs-my-job">{label(job.type, job.employer)} · {sora2(job.wage)} a day <span className="text-[#4b5566]">· since {townTime(job.since_tick)}</span></p>
          : <p className="mt-1" data-testid="jobs-my-job">{d.me.runs.length ? `You work in your own business (${d.me.runs.join(", ")}).` : "No job yet. Your agent takes the civic job until you pick one."}</p>}
        {d.me.runs.length > 0 && <p className="mt-1 text-xs text-[#4b5566]">Taking a job elsewhere means your business runs without you; leaving it brings you back.</p>}
        {job && <div className="mt-2"><button type="button" className={`${btn} border border-black/15 bg-white`} disabled={pending} onClick={() => ask("quit_job")} data-testid="jobs-quit">Leave this job</button></div>}
        {msg && <p className={`mt-2 ${msg.ok ? "" : "text-[#b23a2e]"}`} role="status" data-testid="jobs-msg">{msg.message}</p>}
        {d.requests.length > 0 && <ul className="mt-2 flex flex-col gap-0.5 text-xs" data-testid="jobs-requests">{d.requests.map((r) => <li key={r.id} data-status={r.status}>
          {r.kind === "apply_job" ? `Apply to ${r.inputs.employer === "civic" ? "the Town Hall" : String(r.inputs.employer)}` : "Leave job"}: <span className="font-semibold">{
            r.status === "queued" ? "waiting for the next hour" : r.status === "done" ? "done" : `refused, ${JOB_REFUSAL[r.refusal] ?? r.detail ?? r.refusal}`}</span></li>)}</ul>}
      </section>}
      {!d.signed_in && <p className="text-[#4b5566]" data-testid="jobs-sign-in">Sign in and move in to apply for a job.</p>}
      {d.signed_in && !d.resident && <p className="text-[#4b5566]" data-testid="jobs-move-in">Move in to the town to apply for a job.</p>}

      <section aria-label="Open positions"><h3 className="font-semibold">Hiring now</h3>
        <ul className="mt-1 flex flex-col gap-2" data-testid="jobs-list">
          {d.openings.map((o) => <li key={o.business} className="rounded-xl border border-black/10 p-2.5" data-testid="jobs-row" data-biz={o.business}>
            <span className="flex items-baseline justify-between gap-2"><button type="button" className="text-left font-semibold underline-offset-2 hover:underline" onClick={() => onPlot(o.plot)}>{label(o.type, o.business)}</button>
              <span className="shrink-0 font-semibold tabular-nums">{sora2(o.wage)} a day</span></span>
            <span className="block text-xs text-[#4b5566]">{o.owner_name} · plot {o.plot} · {o.slots} place{o.slots === 1 ? "" : "s"} open · team {o.staff} of {o.max_staff}{o.above_civic ? "" : " · no more than the civic wage"}</span>
            {canApply(o.business) && <div className="mt-1.5"><button type="button" className={`${btn} bg-[#1d2433] text-white`} disabled={pending} onClick={() => ask("apply_job", o.business)} data-testid="jobs-apply">Apply</button></div>}
          </li>)}
          <li className="rounded-xl border border-dashed border-black/15 p-2.5" data-testid="jobs-civic">
            <span className="flex items-baseline justify-between gap-2"><span className="font-semibold">Town Hall (civic job)</span><span className="shrink-0 font-semibold tabular-nums">{sora2(d.civic.wage)} a day</span></span>
            <span className="block text-xs text-[#4b5566]">Always open · {d.civic.workers} at work</span>
            {canApply("civic") && <div className="mt-1.5"><button type="button" className={`${btn} border border-black/15 bg-white`} disabled={pending} onClick={() => ask("apply_job", "civic")} data-testid="jobs-apply-civic">Take the civic job</button></div>}
          </li>
        </ul>
        {d.openings.length === 0 && <p className="mt-1 text-[#4b5566]">No business is hiring right now.</p>}
      </section>

      {d.owned.filter((t) => !t.cart).map((t) => <OwnerTeam key={t.business} t={t} onDone={reload} />)}

      {d.recent_hires.length > 0 && <section aria-label="Recent hires"><h3 className="font-semibold">Recently hired</h3>
        <ul className="mt-1 flex flex-col gap-0.5" data-testid="jobs-hires">{d.recent_hires.map((h, i) => <li key={i} className="flex justify-between gap-2">
          <span>{h.name} → {h.employer}</span><span className="shrink-0 text-xs text-[#4b5566]">{sora2(h.wage)} · {townTime(h.tick)}</span></li>)}</ul></section>}
      <p className="text-xs text-[#4b5566]">Wages are paid every evening at 20:00. A person who applies is placed before the agents look for work in that hour.</p>
    </div>
  );
}

function OwnerTeam({ t, onDone }: { t: Team; onDone(): void }) {
  const [msg, setMsg] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, setPending] = useState(false);
  const room = t.max_staff - t.staff.length;
  const send = async (kind: "post_job" | "stop_hiring", inputs: Record<string, number> = {}) => {
    setPending(true);
    const r = await requestChange(t.business, kind, inputs).catch(() => ({ ok: false, message: "The town is unreachable right now: nothing was changed." }));
    setPending(false); setMsg(r);
    if (r.ok) onDone();
  };
  const field = "min-h-11 w-24 rounded-lg border border-black/15 px-2 tabular-nums";
  return (
    <section aria-label={`Your team at ${t.business}`} className="rounded-2xl bg-[#f3f6fb] p-3" data-testid="jobs-team" data-biz={t.business}>
      <h3 className="font-semibold">Your team · {label(t.type, t.business)}</h3>
      <p className="text-xs text-[#4b5566]">{t.staff.length} of {t.max_staff} at {sora2(t.wage)} a day{t.open ? ` · ${t.open} place${t.open === 1 ? "" : "s"} open` : ""}</p>
      {t.staff.length > 0 && <ul className="mt-1 flex flex-col gap-0.5">{t.staff.map((s) => <li key={s.worker} className="flex justify-between gap-2"><span>{s.name}</span><span className="text-xs text-[#4b5566]">since {townTime(s.since_tick)}</span></li>)}</ul>}
      {room > 0 ? <form className="mt-2 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget);
        send("post_job", { slots: Number(f.get("slots")), wage: Number(f.get("wage")) }); }}>
        <label className="flex flex-col text-xs text-[#4b5566]">Places<input name="slots" type="number" min="1" max={Math.min(5, room)} defaultValue={1} className={field} data-testid="jobs-post-slots" /></label>
        <label className="flex flex-col text-xs text-[#4b5566]">Wage a day<input name="wage" type="number" step="0.5" min="1" defaultValue={t.wage} className={field} data-testid="jobs-post-wage" /></label>
        <button className={`${btn} bg-[#1d2433] text-white`} disabled={pending} data-testid="jobs-post">Post a job</button>
      </form> : <p className="mt-1 text-xs">The team is full for this level. Upgrading makes room.</p>}
      {t.open > 0 && <div className="mt-2"><button type="button" className={`${btn} border border-black/15 bg-white`} disabled={pending} onClick={() => send("stop_hiring")} data-testid="jobs-stop">Stop hiring</button></div>}
      {msg && <p className={`mt-2 ${msg.ok ? "" : "text-[#b23a2e]"}`} role="status" data-testid="jobs-team-msg">{msg.ok ? msg.message : msg.message.replace(/WAGE_TOO_LOW/, REFUSAL_LABEL.WAGE_TOO_LOW)}</p>}
      <p className="mt-1 text-xs text-[#4b5566]">A new wage applies to the whole team.</p>
    </section>
  );
}
