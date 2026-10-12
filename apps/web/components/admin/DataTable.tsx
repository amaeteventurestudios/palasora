"use client";
// ISSUE-06 shared admin table: search, filter chips, sortable columns, 25/50/100/250/All rows, sticky header, optional
// row drill-down, honest empty state. Used inside client workspaces (column renderers are functions, so the table is
// configured on the client). Keyboard: rows with a drill-down are buttons (Enter/Space).
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type Column<T> = { key: string; header: React.ReactNode; cell: (row: T) => React.ReactNode; sort?: (row: T) => string | number; className?: string; align?: "start" | "end" };
export type Filter<T> = { key: string; label: string; options: { value: string; label: string }[]; get: (row: T) => string };
export const PAGE_SIZES = [25, 50, 100, 250, 0] as const; // 0 = All

export function DataTable<T>({ rows, columns, rowKey, search, filters = [], onRowClick, empty = "Nothing to show.", initialPageSize = 25, caption, testid = "data-table",
  initialSort }: { rows: T[]; columns: Column<T>[]; rowKey: (r: T) => string; search?: (r: T) => string; filters?: Filter<T>[]; onRowClick?: (r: T) => void;
  empty?: string; initialPageSize?: (typeof PAGE_SIZES)[number]; caption: string; testid?: string; initialSort?: { key: string; dir: "asc" | "desc" } }) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState<Record<string, string>>({});
  const [size, setSize] = useState<number>(initialPageSize);
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState(initialSort ?? null);
  const shown = useMemo(() => {
    let out = rows;
    if (q && search) { const needle = q.toLowerCase(); out = out.filter((r) => search(r).toLowerCase().includes(needle)); }
    for (const f of filters) if (active[f.key]) out = out.filter((r) => f.get(r) === active[f.key]);
    const col = sort && columns.find((c) => c.key === sort.key);
    if (col?.sort) { const s = col.sort; out = [...out].sort((a, b) => { const x = s(a), y = s(b); return (x < y ? -1 : x > y ? 1 : 0) * (sort!.dir === "asc" ? 1 : -1); }); }
    return out;
  }, [rows, q, search, filters, active, sort, columns]);
  const pages = size ? Math.max(1, Math.ceil(shown.length / size)) : 1;
  const cur = Math.min(page, pages - 1);
  const slice = size ? shown.slice(cur * size, cur * size + size) : shown;
  const toggleSort = (key: string) => setSort((s) => (s?.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }));
  return (
    <div className="flex min-w-0 flex-col gap-2" data-testid={testid}>
      <div className="flex flex-wrap items-center gap-2">
        {search && <div className="relative"><Search className="pointer-events-none absolute start-2 top-2.5 size-4 text-muted-foreground" aria-hidden="true" />
          <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="Search…" className="h-9 w-64 max-w-full ps-8" aria-label={`Search ${caption}`} data-testid={`${testid}-search`} /></div>}
        {filters.map((f) => (
          <div key={f.key} className="flex flex-wrap items-center gap-1" role="group" aria-label={f.label}>
            <span className="text-xs text-muted-foreground">{f.label}:</span>
            {[{ value: "", label: "All" }, ...f.options].map((o) => (
              <button key={o.value || "all"} type="button" onClick={() => { setActive((a) => ({ ...a, [f.key]: o.value })); setPage(0); }} aria-pressed={(active[f.key] ?? "") === o.value}
                className={cn("rounded-full border px-2.5 py-0.5 text-xs font-medium", (active[f.key] ?? "") === o.value ? "border-transparent bg-primary text-primary-foreground" : "hover:bg-accent")}
                data-testid={`${testid}-filter-${f.key}-${o.value || "all"}`}>{o.label}</button>))}
          </div>))}
        <p className="ms-auto text-xs text-muted-foreground" aria-live="polite" data-testid={`${testid}-count`}>{shown.length.toLocaleString("en")} of {rows.length.toLocaleString("en")}</p>
      </div>
      <div className="overflow-x-auto rounded-xl border" role="region" aria-label={caption} tabIndex={0}>
        <table className="w-full text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead className="sticky top-0 z-10 bg-card text-start text-xs text-muted-foreground">
            <tr>{columns.map((c) => (
              <th key={c.key} scope="col" className={cn("whitespace-nowrap px-3 py-2 font-semibold", c.align === "end" ? "text-end" : "text-start", c.className)}
                aria-sort={sort?.key === c.key ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}>
                {c.sort ? <button type="button" onClick={() => toggleSort(c.key)} className="inline-flex items-center gap-1 hover:text-foreground">{c.header}
                  {sort?.key === c.key ? (sort.dir === "asc" ? <ArrowUp className="size-3" aria-hidden="true" /> : <ArrowDown className="size-3" aria-hidden="true" />) : <ChevronsUpDown className="size-3 opacity-50" aria-hidden="true" />}</button> : c.header}
              </th>))}</tr>
          </thead>
          <tbody className="divide-y">
            {slice.length === 0 ? <tr><td colSpan={columns.length} className="px-3 py-6 text-center text-muted-foreground">{rows.length ? "No rows match these filters." : empty}</td></tr> :
              slice.map((r) => (
                <tr key={rowKey(r)} className={cn(onRowClick && "cursor-pointer hover:bg-accent/60 focus-visible:bg-accent focus-visible:outline-none")} data-row={rowKey(r)}
                  {...(onRowClick ? { tabIndex: 0, role: "button", onClick: () => onRowClick(r), onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onRowClick(r); } } } : {})}>
                  {columns.map((c) => <td key={c.key} className={cn("px-3 py-2 align-top", c.align === "end" && "text-end tabular-nums", c.className)}>{c.cell(r)}</td>)}
                </tr>))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground">Rows per page:</span>
        {PAGE_SIZES.map((n) => <button key={n} type="button" onClick={() => { setSize(n); setPage(0); }} aria-pressed={size === n}
          className={cn("rounded border px-2 py-0.5", size === n ? "border-transparent bg-primary text-primary-foreground" : "hover:bg-accent")} data-testid={`${testid}-size-${n || "all"}`}>{n || "All"}</button>)}
        {size > 0 && pages > 1 && <span className="ms-auto flex items-center gap-2">
          <button type="button" className="rounded border px-2 py-0.5 disabled:opacity-40" onClick={() => setPage(cur - 1)} disabled={cur === 0}>Previous</button>
          <span>Page {cur + 1} of {pages}</span>
          <button type="button" className="rounded border px-2 py-0.5 disabled:opacity-40" onClick={() => setPage(cur + 1)} disabled={cur >= pages - 1}>Next</button></span>}
      </div>
    </div>
  );
}
