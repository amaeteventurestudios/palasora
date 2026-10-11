"use client";
// Background job monitor (spec 30 "Job UX"): phase, completed / remaining / duplicate / skipped / failed, start and finish,
// an estimate derived ONLY from observed throughput, pause / resume / cancel, rollback of never-used identities, per-country
// detail and a downloadable non-secret result. Jobs run in the population runner; closing the browser changes nothing.
import { useState } from "react";
import { toast } from "sonner";
import { Download, Loader2, Pause, Play, RotateCcw, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { adminFetch, fmt, newKey } from "@/lib/admin/client";

export type Job = { id: string; created: string; op: string; mode: string; scope_label: string; countries: string[]; status: string; phase: string; total_planned: number;
  done_count: number; skipped_count: number; duplicate_count: number; failed_count: number; per_minute: number; actor_name: string; reason: string;
  started_at: string; finished_at: string; heartbeat_at: string; restarts: number; rollback_of: string; params: Record<string, unknown>;
  country_progress: Record<string, Record<string, number | string>>; errors: { at: string; message: string }[]; plan?: Record<string, unknown> };

const OP: Record<string, string> = { create: "Create", activate: "Activate", pause: "Pause", resume: "Resume", deactivate: "Deactivate", retire: "Retire", rollback: "Rollback" };
const MODE: Record<string, string> = { set_target: "set target", add_n: "add N", distribute_n: "distribute N" };
const TONE: Record<string, "default" | "secondary" | "destructive" | "outline"> = { running: "default", queued: "secondary", paused: "outline", completed: "outline", failed: "destructive", canceled: "outline" };
const ts = (s: string) => (s ? new Date(s.replace(" ", "T").replace(/Z?$/, "Z")) : null);
const when = (s: string) => { const d = ts(s); return d ? d.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "–"; };

function eta(j: Job): string {
  if (j.status !== "running" || !j.per_minute) return j.status === "running" ? "measuring throughput…" : "";
  const left = Math.max(0, j.total_planned - j.done_count - j.duplicate_count - j.skipped_count - j.failed_count);
  const m = left / j.per_minute;
  return m < 1 ? "under a minute left (observed rate)" : `about ${fmt(m, m < 10 ? 1 : 0)} min left at ${fmt(j.per_minute)}/min (observed)`;
}

function csv(j: Job, names: Record<string, string>) {
  const rows = [["country", "code", "planned", "done", "already_existed", "skipped", "failed", "female_done", "male_done", "note"]];
  for (const [cc, p] of Object.entries(j.country_progress ?? {}).sort()) rows.push([names[cc] ?? cc, cc, String(p.planned ?? ""), String(p.done ?? ""), String(p.dup ?? ""),
    String(p.skipped ?? ""), String(p.failed ?? ""), String(p.done_f ?? ""), String(p.done_m ?? ""), String(p.closed ?? "")]);
  const blob = new Blob([rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n")], { type: "text/csv" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `palavva-population-job-${j.id}.csv`; a.click(); URL.revokeObjectURL(a.href);
}

export function JobsPanel({ jobs, csrf, names, onChanged }: { jobs: Job[]; csrf: string; names: Record<string, string>; onChanged: () => void }) {
  const [detail, setDetail] = useState<Job | null>(null);
  const [rb, setRb] = useState<Job | null>(null);
  const [phrase, setPhrase] = useState("");
  const [busy, setBusy] = useState("");
  async function act(j: Job, action: string) {
    setBusy(j.id + action);
    const r = await adminFetch(`/api/admin/agent-population/jobs/${j.id}/${action}`, csrf, {});
    setBusy("");
    if (r.ok) { toast.success(`Job ${j.id}: ${action} requested`); onChanged(); } else toast.error(r.message);
  }
  async function rollback() {
    if (!rb) return;
    setBusy("rb");
    const r = await adminFetch<{ job: { id: string } }>("/api/admin/agent-population/jobs", csrf, { op: "rollback", rollback_of: rb.id, confirm: phrase, idempotency_key: newKey(), reason: "rollback from Command Center" });
    setBusy("");
    if (r.ok) { toast.success(`Rollback job ${r.data.job.id} launched`); setRb(null); setPhrase(""); onChanged(); } else toast.error(r.message);
  }
  const live = detail ? jobs.find((x) => x.id === detail.id) ?? detail : null;
  return (
    <Card data-testid="jobs-panel">
      <CardHeader><CardTitle className="text-base">Background jobs</CardTitle>
        <CardDescription>Jobs keep running with the browser closed and resume after a restart from their saved position. Live: refreshes every 2 seconds while a job is active.</CardDescription></CardHeader>
      <CardContent className="space-y-3">
        {!jobs.length && <p className="py-6 text-center text-sm text-muted-foreground">No population jobs yet. Preview an operation above to start one.</p>}
        {jobs.map((j) => {
          const finished = j.done_count + j.duplicate_count + j.skipped_count + j.failed_count;
          const pct = j.total_planned ? Math.min(100, (finished / j.total_planned) * 100) : 0;
          const remaining = Math.max(0, j.total_planned - finished);
          return (
            <div key={j.id} className="rounded-lg border p-3" data-testid="job-row" data-job={j.id} data-status={j.status}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold">{OP[j.op] ?? j.op}{j.mode && MODE[j.mode] ? ` · ${MODE[j.mode]}` : ""}{j.params?.target ? ` ${j.params.target}` : j.params?.add ? ` ${j.params.add}` : j.params?.total ? ` ${j.params.total}` : ""}
                    <span className="ms-2 font-normal text-muted-foreground">{j.scope_label || `${j.countries?.length ?? 0} countries`}</span></p>
                  <p className="text-xs text-muted-foreground">Job {j.id} · by {j.actor_name || "system"} · started {when(j.started_at || j.created)}{j.finished_at ? ` · finished ${when(j.finished_at)}` : ""}{j.restarts ? ` · resumed ${j.restarts}×` : ""}</p>
                </div>
                <Badge variant={TONE[j.status] ?? "outline"} data-testid="job-status">{j.status}</Badge>
              </div>
              <Progress value={pct} className="mt-3" aria-label={`Job ${j.id} progress`} />
              <dl className="mt-2 grid grid-cols-3 gap-x-3 gap-y-1 text-sm sm:grid-cols-6" data-testid="job-counts">
                {([["Done", j.done_count], ["Remaining", remaining], ["Already existed", j.duplicate_count], ["Skipped", j.skipped_count], ["Failed", j.failed_count], ["Planned", j.total_planned]] as [string, number][]).map(([k, v]) => (
                  <div key={k}><dt className="text-xs text-muted-foreground">{k}</dt><dd className="font-semibold tabular-nums" data-k={k}>{fmt(v)}</dd></div>))}
              </dl>
              <p className="mt-1 text-xs text-muted-foreground" data-testid="job-phase">{j.phase}{eta(j) ? ` · ${eta(j)}` : ""}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {["queued", "running"].includes(j.status) && <Button size="sm" variant="outline" onClick={() => act(j, "pause")} disabled={!!busy} data-testid="btn-pause"><Pause className="size-4" />Pause</Button>}
                {j.status === "paused" && <Button size="sm" variant="outline" onClick={() => act(j, "resume")} disabled={!!busy} data-testid="btn-resume"><Play className="size-4" />Resume</Button>}
                {["queued", "running", "paused"].includes(j.status) && <Button size="sm" variant="ghost" onClick={() => act(j, "cancel")} disabled={!!busy}><Square className="size-4" />Cancel</Button>}
                {j.op === "create" && ["completed", "canceled", "failed", "paused"].includes(j.status) && j.done_count > 0 &&
                  <Button size="sm" variant="ghost" onClick={() => { setRb(j); setPhrase(""); }}><RotateCcw className="size-4" />Roll back…</Button>}
                <Button size="sm" variant="ghost" onClick={() => setDetail(j)} data-testid="btn-details">Details</Button>
                <Button size="sm" variant="ghost" onClick={() => csv(j, names)}><Download className="size-4" />CSV</Button>
                {busy.startsWith(j.id) && <Loader2 className="size-4 animate-spin self-center" />}
              </div>
            </div>);
        })}
      </CardContent>

      <Sheet open={!!live} onOpenChange={(o) => !o && setDetail(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          {live && <>
            <SheetHeader><SheetTitle>Job {live.id}</SheetTitle>
              <SheetDescription>{OP[live.op]} {live.mode ? `· ${MODE[live.mode] ?? live.mode}` : ""} · {live.status} · {live.reason || "no reason given"}</SheetDescription></SheetHeader>
            <div className="space-y-4 px-4 pb-6">
              <Table><TableHeader><TableRow><TableHead>Country</TableHead><TableHead className="text-right">Planned</TableHead><TableHead className="text-right">Done</TableHead>
                <TableHead className="text-right">Existed</TableHead><TableHead className="text-right">Skipped</TableHead><TableHead className="text-right">Failed</TableHead></TableRow></TableHeader>
                <TableBody>{Object.entries(live.country_progress ?? {}).sort().map(([cc, p]) => (
                  <TableRow key={cc}><TableCell>{names[cc] ?? cc}{p.closed ? <span className="block text-xs text-muted-foreground">{String(p.closed)}</span> : null}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(Number(p.planned ?? 0))}</TableCell><TableCell className="text-right tabular-nums">{fmt(Number(p.done ?? 0))}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(Number(p.dup ?? 0))}</TableCell><TableCell className="text-right tabular-nums">{fmt(Number(p.skipped ?? 0))}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(Number(p.failed ?? 0))}</TableCell></TableRow>))}</TableBody></Table>
              <div><p className="mb-1 text-sm font-semibold">Errors ({live.errors?.length ?? 0})</p>
                {live.errors?.length ? <ul className="space-y-1 text-xs">{live.errors.slice(-20).reverse().map((e, i) => <li key={i} className="rounded border p-2"><span className="text-muted-foreground">{when(e.at)}</span> {e.message}</li>)}</ul>
                  : <p className="text-xs text-muted-foreground">None.</p>}</div>
            </div>
          </>}
        </SheetContent>
      </Sheet>

      <Dialog open={!!rb} onOpenChange={(o) => !o && setRb(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Roll back job {rb?.id}?</DialogTitle>
            <DialogDescription>Identities this job created that never did anything (no post, reply, vote, follow, Pals or order) are deleted. Any identity with history is retired instead, so nothing that happened on Palavva disappears.</DialogDescription></DialogHeader>
          <div className="space-y-1.5"><Label htmlFor="rb-phrase">Type <code className="rounded bg-muted px-1">ROLLBACK {rb?.id}</code> to confirm</Label>
            <Input id="rb-phrase" value={phrase} onChange={(e) => setPhrase(e.target.value)} autoComplete="off" /></div>
          <DialogFooter><Button variant="outline" onClick={() => setRb(null)}>Cancel</Button>
            <Button variant="destructive" onClick={rollback} disabled={busy === "rb" || phrase.trim().toUpperCase() !== `ROLLBACK ${rb?.id}`.toUpperCase()}>Roll back</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
