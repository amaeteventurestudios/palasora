"use client";
// ISSUE-09 source registry: compact cards (3-5 per row by width) instead of one long column, grouped by what an
// operator can do: Actionable (active, needs a rights decision, inactive), Link-only discoveries that produce headlines,
// and Archived discoveries (kept, never deleted, hidden by default). Details and rights evidence open in a drawer.
import { useMemo, useState } from "react";
import { AdminForm } from "../AdminForm";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { sourceAction } from "@/app/actions/admin";

export type SourceCard = { id: string; name: string; group: "active" | "review" | "inactive" | "linkonly" | "archived"; rights: string; usage: string; health: string; healthy: boolean;
  enabled: boolean; endpoint: string; endpointType: string; cls: string; trust: string; countries: string[]; lastSuccess: string; lastError: string; items30: number; itemsTotal: number;
  notes: string; licenseUrl: string; fixture: boolean };
const GROUP: Record<SourceCard["group"], { label: string; help: string }> = {
  active: { label: "Active", help: "Rights approved and fetching." }, review: { label: "Needs a rights decision", help: "A real feed exists but rights are not confirmed, so nothing is fetched." },
  inactive: { label: "Inactive", help: "Approved but not producing: paused, failing or silent for 30 days." },
  linkonly: { label: "Link-only discovery", help: "Found through news discovery. Only the publisher's headline and a link are shown." },
  archived: { label: "Archived discovery", help: "Discovered, but nothing usable in 30 days (often a radio or TV station with no article feed). Kept for history; never shown publicly." } };
const VIEWS = [["actionable", "Actionable"], ["linkonly", "Link-only discoveries"], ["archived", "Archived discoveries"], ["all", "All"]] as const;
const ACTIONS = (s: SourceCard): [string, string][] => [["test", "Test fetch"], ...(s.rights === "approved" ? [["ingest", "Fetch now"], [s.enabled ? "pause" : "resume", s.enabled ? "Pause" : "Enable"], ["revoke", "Revoke rights"]] as [string, string][] : [])];

export function SourceGrid({ rows }: { rows: SourceCard[] }) {
  const [view, setView] = useState<(typeof VIEWS)[number][0]>("actionable");
  const [q, setQ] = useState("");
  const [cc, setCc] = useState("");
  const [size, setSize] = useState(50);
  const [open, setOpen] = useState<SourceCard | null>(null);
  const inView = (s: SourceCard) => view === "all" || (view === "actionable" ? ["active", "review", "inactive"].includes(s.group) : s.group === view);
  const shown = useMemo(() => rows.filter((s) => inView(s) && (!cc || s.countries.includes(cc)) && (!q || `${s.name} ${s.endpoint} ${s.countries.join(" ")}`.toLowerCase().includes(q.toLowerCase()))), [rows, view, q, cc]); // eslint-disable-line react-hooks/exhaustive-deps
  const countries = [...new Set(rows.flatMap((s) => s.countries))].sort();
  const count = (g: string) => rows.filter((s) => (g === "actionable" ? ["active", "review", "inactive"].includes(s.group) : g === "all" || s.group === g)).length;
  return (
    <div className="flex flex-col gap-3" data-testid="source-grid">
      <nav aria-label="Source views" className="flex flex-wrap gap-2">{VIEWS.map(([k, l]) => <button key={k} type="button" onClick={() => setView(k)} aria-pressed={view === k} data-testid={`source-view-${k}`}
        className={`rounded-full border px-3 py-1 text-sm font-semibold ${view === k ? "border-transparent bg-primary text-primary-foreground" : "hover:bg-accent"}`}>{l} ({count(k).toLocaleString("en")})</button>)}</nav>
      <div className="flex flex-wrap items-center gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search publisher, URL or country…" className="h-9 w-72 max-w-full" aria-label="Search sources" data-testid="source-search" />
        <select value={cc} onChange={(e) => setCc(e.target.value)} className="input h-9 w-40" aria-label="Country"><option value="">All countries</option>{countries.map((c) => <option key={c} value={c}>{c}</option>)}</select>
        <span className="ms-auto text-xs text-muted-foreground">{shown.length.toLocaleString("en")} shown</span>
      </div>
      <ul className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(100%,17rem),1fr))]">
        {(size ? shown.slice(0, size) : shown).map((s) => (
          <li key={s.id} className="card flex flex-col gap-2 p-3" aria-label={s.name} data-testid="source-row" data-group={s.group}>
            <div className="flex items-start justify-between gap-2"><p className="font-semibold leading-tight">{s.name}</p>{s.fixture && <Badge variant="outline">fixture</Badge>}</div>
            <div className="flex flex-wrap gap-1 text-xs">
              <Badge variant={s.rights === "approved" ? "default" : s.rights === "revoked" || s.rights === "restricted" ? "destructive" : "secondary"}>Rights: {s.rights}</Badge>
              <Badge variant={s.healthy ? "default" : "outline"}>{s.health}</Badge></div>
            <p className="text-xs text-muted-foreground">{GROUP[s.group].label} · {s.countries.join(", ") || "no country"} · {s.items30} items in 30 d</p>
            <div className="mt-auto flex flex-wrap gap-2">
              {ACTIONS(s).map(([a, l]) => <AdminForm key={a} action={sourceAction} submit={l} confirm={a === "revoke" ? "Revoke rights? Fetching stops, stored excerpts are cleared and drafts are held." : undefined}>
                <input type="hidden" name="source_id" value={s.id} /><input type="hidden" name="action" value={a} /></AdminForm>)}
              <button type="button" className="btn btn-secondary !min-h-[40px] text-sm" onClick={() => setOpen(s)}>View details</button>
            </div>
          </li>))}
      </ul>
      {shown.length > 50 && <div className="flex flex-wrap items-center gap-2 text-xs"><span className="text-muted-foreground">Show:</span>{[50, 100, 250, 0].map((n) => <button key={n} type="button" onClick={() => setSize(n)} aria-pressed={size === n}
        className={`rounded border px-2 py-0.5 ${size === n ? "border-transparent bg-primary text-primary-foreground" : ""}`}>{n || "All"}</button>)}</div>}
      <Sheet open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl" data-testid="source-detail">
          {open && (<><SheetHeader><SheetTitle>{open.name}</SheetTitle><SheetDescription>{GROUP[open.group].label}: {GROUP[open.group].help}</SheetDescription></SheetHeader>
            <dl className="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-1 p-4 text-sm">
              <dt className="text-muted-foreground">Endpoint</dt><dd className="break-all">{open.endpoint || "none"} ({open.endpointType})</dd>
              <dt className="text-muted-foreground">Rights</dt><dd>{open.rights} · {open.usage}</dd>
              <dt className="text-muted-foreground">Evidence</dt><dd>{open.notes || "none recorded"}{open.licenseUrl && <> · <a className="link" href={open.licenseUrl} target="_blank" rel="noopener noreferrer">terms</a></>}</dd>
              <dt className="text-muted-foreground">Class / trust</dt><dd>{open.cls} / {open.trust}</dd>
              <dt className="text-muted-foreground">Last success</dt><dd>{open.lastSuccess || "never"}</dd>
              <dt className="text-muted-foreground">Last error</dt><dd>{open.lastError || "none"}</dd>
              <dt className="text-muted-foreground">Items</dt><dd>{open.items30} in 30 days · {open.itemsTotal} total</dd></dl>
            <p className="px-4 text-xs text-muted-foreground">Rights are never inferred from directory data (for example Wikidata). Approving rights needs the publisher's terms or a licence.</p>
            {open.rights !== "approved" && <div className="p-4"><AdminForm action={sourceAction} submit="Approve rights" className="max-w-xl">
              <input type="hidden" name="source_id" value={open.id} /><input type="hidden" name="action" value="approve_rights" />
              <label className="field-label" htmlFor={`lu-${open.id}`}>License / terms URL</label><input id={`lu-${open.id}`} name="license_url" className="input" placeholder="https://" />
              <label className="field-label" htmlFor={`up-${open.id}`}>Usage policy</label>
              <select id={`up-${open.id}`} name="usage_policy" className="input"><option value="link_only">Link only</option><option value="metadata_only">Metadata only</option><option value="permitted_excerpt">Permitted excerpt</option><option value="licensed_full">Licensed full text</option></select>
              <label className="field-label" htmlFor={`rn-${open.id}`}>Evidence notes</label><textarea id={`rn-${open.id}`} name="notes" rows={3} className="input" /></AdminForm></div>}</>)}
        </SheetContent>
      </Sheet>
    </div>
  );
}
