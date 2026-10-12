"use client";
// ISSUE-10 Translations workspace: one compact searchable table instead of one big edit box per translation. Clicking a
// row opens the original and the translation side by side (RTL-aware), with Save correction / Approve / Block.
// Readers never lose the original: blocked or failed translations are not shown; readers get the original text.
import { useState } from "react";
import Link from "next/link";
import { DataTable, type Column } from "../DataTable";
import { AdminForm } from "../AdminForm";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { translationDecision } from "@/app/actions/admin";
import type { TranslationRow, FieldPair } from "@/lib/admin/translations";

const RTL = new Set(["ar"]);
const STATUS: Record<string, { label: string; tone: "default" | "secondary" | "destructive" | "outline" }> = {
  machine_unreviewed: { label: "Machine, not reviewed", tone: "secondary" }, reviewed: { label: "Reviewed by editor", tone: "default" },
  blocked: { label: "Blocked (original shown)", tone: "destructive" }, failed: { label: "Failed checks (original shown)", tone: "destructive" },
};
const ago = (iso: string) => { const h = (Date.now() - Date.parse(iso.replace(" ", "T"))) / 3600_000; return h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} d`; };

function Pairs({ row, pairs, editable }: { row: TranslationRow; pairs: FieldPair[]; editable: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      {pairs.map((p) => (
        <div key={p.key} className="grid gap-2 md:grid-cols-2" data-testid="pair">
          <div className="rounded-lg border p-2"><p className="text-[11px] font-semibold uppercase text-muted-foreground">{p.key} · original ({row.source})</p>
            <p dir={RTL.has(row.source) ? "rtl" : "ltr"} className="mt-1 text-sm">{p.original || <span className="text-muted-foreground">(not available)</span>}</p></div>
          <div className="rounded-lg border p-2"><label htmlFor={`f-${row.id}-${p.key}`} className="text-[11px] font-semibold uppercase text-muted-foreground">{p.key} · translation ({row.target})</label>
            {editable ? <textarea id={`f-${row.id}-${p.key}`} name={`field_${p.key}`} defaultValue={p.translated} rows={3} dir={RTL.has(row.target) ? "rtl" : "ltr"} className="input mt-1 w-full text-sm" />
              : <p dir={RTL.has(row.target) ? "rtl" : "ltr"} className="mt-1 text-sm">{p.translated}</p>}</div>
        </div>))}
    </div>
  );
}

export function TranslationsWorkspace({ rows }: { rows: TranslationRow[] }) {
  const [open, setOpen] = useState<TranslationRow | null>(null);
  const columns: Column<TranslationRow>[] = [
    { key: "headline", header: "Original headline", cell: (r) => <span dir="auto" className="line-clamp-2 max-w-[42ch] font-medium">{r.headline}</span>, sort: (r) => r.headline },
    { key: "pair", header: "Languages", cell: (r) => <span className="whitespace-nowrap">{r.source} → {r.target}</span>, sort: (r) => `${r.source}${r.target}` },
    { key: "status", header: "Human review", cell: (r) => <Badge variant={STATUS[r.status]?.tone ?? "outline"}>{STATUS[r.status]?.label ?? r.status}</Badge>, sort: (r) => r.status },
    { key: "checks", header: "Automatic checks", cell: (r) => r.flags.length ? <span className="text-xs text-danger">{r.flags.join(" · ")}</span> : <span className="text-xs text-success">passed</span>,
      sort: (r) => r.flags.length },
    { key: "model", header: "Model", cell: (r) => <span className="text-xs text-muted-foreground">{r.model}</span>, sort: (r) => r.model },
    { key: "age", header: "Age", cell: (r) => <span className="whitespace-nowrap text-xs">{ago(r.created)}</span>, sort: (r) => r.created, align: "end" },
  ];
  const langs = [...new Set(rows.map((r) => `${r.source}→${r.target}`))].sort();
  return (
    <>
      <DataTable caption="Recent translations" testid="translations" rows={rows} columns={columns} rowKey={(r) => r.id} onRowClick={setOpen}
        search={(r) => `${r.headline} ${r.fields.map((f) => f.translated).join(" ")} ${r.model}`} initialSort={{ key: "age", dir: "desc" }}
        filters={[{ key: "status", label: "Review", options: Object.entries(STATUS).map(([value, v]) => ({ value, label: v.label })), get: (r) => r.status },
          { key: "pair", label: "Languages", options: langs.map((l) => ({ value: l, label: l })), get: (r) => `${r.source}→${r.target}` },
          { key: "flag", label: "Checks", options: [{ value: "flagged", label: "Needs a look" }, { value: "ok", label: "Passed" }], get: (r) => (r.flags.length ? "flagged" : "ok") }]}
        empty="No translations yet. Translations are created when a reader asks for a story in another language." />
      <Sheet open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-3xl" data-testid="translation-detail">
          {open && (<>
            <SheetHeader><SheetTitle dir="auto">{open.headline}</SheetTitle>
              <SheetDescription>{open.source} → {open.target} · {open.model} · {open.prompt} · {ago(open.created)} ago · {open.reports} reader report(s){open.href && <> · <Link className="link" href={open.href}>open story</Link></>}</SheetDescription></SheetHeader>
            <div className="flex flex-col gap-4 p-4">
              <p className="text-sm"><Badge variant={STATUS[open.status]?.tone ?? "outline"}>{STATUS[open.status]?.label ?? open.status}</Badge>
                {open.flags.length > 0 && <span className="ms-2 text-danger">{open.flags.join(" · ")}</span>}
                {open.qaFails.length > 0 && <span className="ms-2 text-xs text-muted-foreground">(failed checks: {open.qaFails.join(", ")})</span>}</p>
              {open.status === "failed" && <p className="text-sm text-muted-foreground">This machine output failed the automatic checks, so readers see the original. You can correct it below; saving marks it reviewed.</p>}
              <AdminForm action={translationDecision} submit="Save correction (marks reviewed)" key={open.id}>
                <input type="hidden" name="id" value={open.id} /><input type="hidden" name="action" value="correct" />
                <Pairs row={open} pairs={open.status === "failed" ? open.rejected : open.fields} editable />
              </AdminForm>
              <div className="flex flex-wrap gap-2">
                {open.status !== "reviewed" && open.status !== "failed" && <AdminForm action={translationDecision} submit="Approve as reviewed"><input type="hidden" name="id" value={open.id} /><input type="hidden" name="action" value="approve" /></AdminForm>}
                {open.status !== "blocked" && <AdminForm action={translationDecision} submit="Block (readers see the original)" confirm="Block this translation? Readers will see the original text."><input type="hidden" name="id" value={open.id} /><input type="hidden" name="action" value="block" /></AdminForm>}
              </div>
            </div></>)}
        </SheetContent>
      </Sheet>
    </>
  );
}
