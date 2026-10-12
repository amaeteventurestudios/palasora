"use client";
// ISSUE-22 searchable, append-only audit history. Raw details are redacted before they reach the browser.
import { useState } from "react";
import { DataTable, type Column } from "../DataTable";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

export type AuditRow = { id: string; at: string; actor: string; actorType: string; action: string; system: string; object: string; summary: string; raw: string };

export function AuditTable({ rows }: { rows: AuditRow[] }) {
  const [open, setOpen] = useState<AuditRow | null>(null);
  const cols: Column<AuditRow>[] = [
    { key: "at", header: "When (UTC)", cell: (r) => <span className="whitespace-nowrap text-xs">{r.at.slice(0, 16)}</span>, sort: (r) => r.at },
    { key: "who", header: "Who", cell: (r) => <span className="text-xs">{r.actor}</span>, sort: (r) => r.actor },
    { key: "what", header: "What happened", cell: (r) => <span className="text-xs">{r.summary}</span>, sort: (r) => r.action },
    { key: "sys", header: "Area", cell: (r) => <span className="text-xs">{r.system}</span>, sort: (r) => r.system },
    { key: "obj", header: "Object", cell: (r) => <span className="font-mono text-[11px] text-muted-foreground">{r.object}</span> },
  ];
  return (<>
    <DataTable caption="Audit history" testid="audit" rows={rows} columns={cols} rowKey={(r) => r.id} onRowClick={setOpen} search={(r) => `${r.action} ${r.summary} ${r.actor} ${r.object}`}
      initialSort={{ key: "at", dir: "desc" }} initialPageSize={50}
      filters={[{ key: "type", label: "Who", options: [...new Set(rows.map((r) => r.actorType))].map((v) => ({ value: v, label: v === "user" ? "People" : v === "system" ? "Automatic" : v })), get: (r) => r.actorType },
        { key: "sys", label: "Area", options: [...new Set(rows.map((r) => r.system))].sort().map((v) => ({ value: v, label: v })), get: (r) => r.system }]}
      empty="No audit events yet." />
    <Sheet open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl" data-testid="audit-detail">
        {open && (<><SheetHeader><SheetTitle>{open.summary}</SheetTitle><SheetDescription>{open.at.slice(0, 19)} UTC · {open.actor} · {open.action}</SheetDescription></SheetHeader>
          <div className="p-4"><p className="text-xs text-muted-foreground">Raw event (secrets, tokens and long identifiers are removed before display)</p>
            <pre className="mt-1 overflow-x-auto whitespace-pre-wrap rounded-lg bg-card-muted p-3 text-xs" data-testid="audit-raw">{open.raw}</pre></div></>)}
      </SheetContent>
    </Sheet>
  </>);
}
