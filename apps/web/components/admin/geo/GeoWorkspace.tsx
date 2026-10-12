"use client";
// ISSUE-11 geography evidence workspace: one row per "this story is linked to this region" claim, explained in plain
// words, searchable and filterable; a row opens the story, the evidence and the review actions.
import { useState } from "react";
import Link from "next/link";
import { DataTable, type Column } from "../DataTable";
import { AdminForm } from "../AdminForm";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { geoDecision } from "@/app/actions/admin";

export type GeoRow = { id: string; story: string; href: string; area: string; areaName: string; country: string; role: string; confidence: string; span: string; method: string;
  status: string; publisher: string; created: string };

export const ROLE: Record<string, { label: string; help: string }> = {
  subject: { label: "Story is about this place", help: "The text says the events happen here. Lights the map when confidence is high or verified." },
  event: { label: "Event happened here", help: "A specific event in the story took place here." },
  affected: { label: "Place affected or mentioned", help: "Mentioned as affected or in passing. Held back from the map until confirmed." },
  publisher: { label: "Publisher is based here", help: "Where the news outlet is, not what the story is about. Never lights the map." },
  incidental: { label: "Passing mention", help: "Named in passing. Never lights the map." },
};
export const CONF: Record<string, { label: string; tone: "default" | "secondary" | "outline" | "destructive" }> = {
  verified: { label: "Verified", tone: "default" }, high_confidence: { label: "High (rule-based)", tone: "default" },
  provisional: { label: "Provisional (held)", tone: "secondary" }, unresolved: { label: "Unresolved", tone: "destructive" },
};

export function GeoWorkspace({ rows }: { rows: GeoRow[] }) {
  const [open, setOpen] = useState<GeoRow | null>(null);
  const cols: Column<GeoRow>[] = [
    { key: "story", header: "Story", cell: (r) => <span className="line-clamp-2 max-w-[44ch] font-medium" dir="auto">{r.story}</span>, sort: (r) => r.story },
    { key: "area", header: "Region", cell: (r) => <span>{r.areaName} <span className="font-mono text-xs text-muted-foreground">{r.area}</span></span>, sort: (r) => r.area },
    { key: "role", header: "What the link means", cell: (r) => ROLE[r.role]?.label ?? r.role, sort: (r) => r.role },
    { key: "conf", header: "Confidence", cell: (r) => <Badge variant={CONF[r.confidence]?.tone ?? "outline"}>{CONF[r.confidence]?.label ?? r.confidence}</Badge>, sort: (r) => r.confidence },
    { key: "status", header: "Review", cell: (r) => (r.status === "auto" ? "Automatic, not reviewed" : r.status), sort: (r) => r.status },
    { key: "publisher", header: "Publisher", cell: (r) => <span className="text-xs text-muted-foreground">{r.publisher}</span> },
  ];
  return (<>
    <DataTable caption="Story geography evidence" testid="geo-evidence" rows={rows} columns={cols} rowKey={(r) => r.id} onRowClick={setOpen}
      search={(r) => `${r.story} ${r.area} ${r.areaName} ${r.span} ${r.publisher}`} initialSort={{ key: "area", dir: "asc" }}
      filters={[{ key: "role", label: "Link", options: Object.entries(ROLE).map(([value, v]) => ({ value, label: v.label })), get: (r) => r.role },
        { key: "conf", label: "Confidence", options: Object.entries(CONF).map(([value, v]) => ({ value, label: v.label })), get: (r) => r.confidence },
        { key: "country", label: "Country", options: [...new Set(rows.map((r) => r.country))].sort().map((c) => ({ value: c, label: c })), get: (r) => r.country }]}
      empty="No geography evidence yet. Stories get region links when their text names a known place." />
    <Sheet open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl" data-testid="geo-detail">
        {open && (<>
          <SheetHeader><SheetTitle dir="auto">{open.story}</SheetTitle>
            <SheetDescription>{open.areaName} ({open.area}) · {ROLE[open.role]?.label ?? open.role} · {CONF[open.confidence]?.label ?? open.confidence}</SheetDescription></SheetHeader>
          <div className="flex flex-col gap-3 p-4 text-sm">
            <p><span className="font-semibold">Why this link exists: </span>{ROLE[open.role]?.help}</p>
            <p><span className="font-semibold">Evidence in the text: </span><q dir="auto">{open.span || "(none recorded)"}</q> <span className="text-xs text-muted-foreground">({open.method})</span></p>
            <p><span className="font-semibold">Publisher: </span>{open.publisher || "unknown"} <span className="text-xs text-muted-foreground">(the publisher&apos;s location is never treated as the story&apos;s location)</span></p>
            {open.href && <Link className="link" href={open.href}>Open the story</Link>}
            <div className="flex flex-wrap gap-2 border-t pt-3">
              <AdminForm action={geoDecision} submit="Confirm the link" key={`c-${open.id}`}><input type="hidden" name="id" value={open.id} /><input type="hidden" name="action" value="confirm" /></AdminForm>
              <AdminForm action={geoDecision} submit="Reject the link" key={`r-${open.id}`}><input type="hidden" name="id" value={open.id} /><input type="hidden" name="action" value="reject" /></AdminForm>
            </div>
            <AdminForm action={geoDecision} submit="Move to another region" key={`m-${open.id}`}><input type="hidden" name="id" value={open.id} /><input type="hidden" name="action" value="correct" />
              <label className="text-xs" htmlFor={`ac-${open.id}`}>Correct region code (for example NG-KN)</label><input id={`ac-${open.id}`} name="area_code" placeholder="NG-KN" className="input w-32 font-mono" /></AdminForm>
          </div></>)}
      </SheetContent>
    </Sheet>
  </>);
}
