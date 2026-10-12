"use client";
// ISSUE-07 Editorial queue workspace: plain reasons for every hold, what the refined card rules would do, and a small
// human-approved batch release (max 25, reason required, each card individually approved and audited, reversible).
import { useMemo, useState } from "react";
import Link from "next/link";
import { DataTable, type Column } from "../DataTable";
import { AdminForm } from "../AdminForm";
import { Badge } from "@/components/ui/badge";
import { releaseCards } from "@/app/actions/admin";

export type QueueRow = { id: string; headline: string; kind: string; publisher: string; countries: string; age: string; created: string; risk: string;
  check: string; why: string; whyClass: string; preview?: { decision: string; rule: string; reason: string; matched: string[] } };
const KIND: Record<string, string> = { source_link: "Publisher headline", discussion: "AI-written discussion", short: "AI short", agent_post: "Agent post" };
const CHECK: Record<string, string> = { PASS: "Every claim matched its source", NEEDS_REVIEW: "Validator raised questions", FAIL: "Claims not supported",
  NOT_APPLICABLE: "Nothing to check (publisher's own words)" };

export function QueueWorkspace({ rows, canRelease, switchOn }: { rows: QueueRow[]; canRelease: boolean; switchOn: boolean }) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const releasable = useMemo(() => rows.filter((r) => r.preview?.decision === "publish"), [rows]);
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else if (n.size < 25) n.add(id); return n; });
  const cols: Column<QueueRow>[] = [
    ...(canRelease && releasable.length ? [{ key: "sel", header: <span className="sr-only">Select</span>, cell: (r: QueueRow) => r.preview?.decision === "publish"
      ? <input type="checkbox" aria-label={`Select ${r.headline}`} checked={sel.has(r.id)} onChange={() => toggle(r.id)} onClick={(e) => e.stopPropagation()} data-testid="queue-select" /> : null }] : []),
    { key: "headline", header: "Item", cell: (r) => <Link href={`/admin/editorial/${r.id}`} className="line-clamp-2 max-w-[46ch] font-medium hover:underline" dir="auto">{r.headline}</Link>, sort: (r) => r.headline },
    { key: "kind", header: "Type", cell: (r) => <span className="whitespace-nowrap text-xs">{KIND[r.kind] ?? r.kind}</span>, sort: (r) => r.kind },
    { key: "why", header: "Why it is waiting", cell: (r) => <span className="text-xs">{r.why}</span>, sort: (r) => r.whyClass },
    { key: "check", header: "Claim check", cell: (r) => <span className="text-xs" title={r.check}>{CHECK[r.check] ?? r.check}</span>, sort: (r) => r.check },
    { key: "preview", header: "Refined rules would", cell: (r) => r.preview ? <span className="flex flex-col gap-0.5 text-xs"><Badge variant={r.preview.decision === "publish" ? "default" : "outline"} className="w-fit">
      {r.preview.decision === "publish" ? "Publish" : "Keep held"}</Badge><span className="text-muted-foreground">{r.preview.reason}{r.preview.matched.length ? ` (${r.preview.matched.slice(0, 3).join(", ")})` : ""}</span></span>
      : <span className="text-xs text-muted-foreground">n/a (AI text: normal review)</span>, sort: (r) => r.preview?.decision ?? "z" },
    { key: "pub", header: "Source / country", cell: (r) => <span className="text-xs">{r.publisher}<br /><span className="text-muted-foreground">{r.countries}</span></span> },
    { key: "age", header: "Age", cell: (r) => <span className="whitespace-nowrap text-xs">{r.age}</span>, sort: (r) => r.created, align: "end" },
  ];
  return (
    <div className="flex flex-col gap-3">
      {canRelease && (releasable.length > 0 || sel.size > 0) && (
        <div className="rounded-xl border p-3" data-testid="release-panel">
          <p className="text-sm"><b>{releasable.length}</b> held publisher headlines would publish under the refined rules{switchOn ? "" : " (the refined rules are off for new items)"}.
            Select up to 25, check them, give a reason, and release. Each one is approved in your name and can be unpublished from its page.</p>
          <div className="mt-2 flex flex-wrap gap-2"><button type="button" className="btn btn-secondary !min-h-9 text-sm" onClick={() => setSel(new Set(releasable.slice(0, 25).map((r) => r.id)))} data-testid="select-25">Select the first 25</button>
            <button type="button" className="btn btn-secondary !min-h-9 text-sm" onClick={() => setSel(new Set())}>Clear</button></div>
          {sel.size > 0 && <AdminForm action={releaseCards} submit={`Release ${sel.size} selected`} className="mt-2" confirm={`Publish ${sel.size} publisher headline(s) now? Each is recorded as approved by you.`}>
            {[...sel].map((id) => <input key={id} type="hidden" name="id" value={id} />)}
            <label className="text-xs" htmlFor="rel-reason">Reason (required)</label>
            <input id="rel-reason" name="reason" className="input max-w-xl" placeholder="e.g. checked: routine court and election headlines from known publishers" />
          </AdminForm>}
        </div>)}
      <DataTable caption="Editorial queue" testid="queue" rows={rows} columns={cols} rowKey={(r) => r.id} search={(r) => `${r.headline} ${r.publisher} ${r.countries} ${r.why}`}
        initialSort={{ key: "age", dir: "desc" }} initialPageSize={50}
        filters={[{ key: "kind", label: "Type", options: [...new Set(rows.map((r) => r.kind))].map((k) => ({ value: k, label: KIND[k] ?? k })), get: (r) => r.kind },
          { key: "why", label: "Reason", options: [...new Set(rows.map((r) => r.whyClass))].map((k) => ({ value: k, label: k })), get: (r) => r.whyClass },
          ...(rows.some((r) => r.preview) ? [{ key: "pv", label: "Refined rules", options: [{ value: "publish", label: "Would publish" }, { value: "hold", label: "Keep held" }], get: (r: QueueRow) => r.preview?.decision ?? "" }] : [])]}
        empty="Nothing waiting here." />
    </div>
  );
}
