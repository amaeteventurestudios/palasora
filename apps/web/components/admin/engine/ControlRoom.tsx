"use client";
// v1.7 Palavva AI Engine Control Room (docs/specs/31). Global defaults inherited by all 54 countries, country overrides
// for any selection (one country, a saved group, a region, many countries), the effective value and where it comes from,
// a validated before/after diff, a reason, optimistic revision checks, audit history and rollback. Engines re-read the
// saved settings within ~10 s: no rebuild or restart.
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { History, Loader2, RotateCcw, Save, Undo2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { adminFetch, fmt } from "@/lib/admin/client";
import { Help, ScopePicker, scopeCodes, scopeLabel, type Group, type ScopeState } from "@/components/admin/population/Operation";
import { cn } from "@/lib/utils";

type Field = { key: string; group: string; type: string; default: unknown; min: number | null; max: number | null; country: boolean; label: string; help: string };
type Rev = { revision: number; diff: { scope: string; key: string; label: string; before: unknown; after: unknown; reset?: boolean }[]; actor_name: string; reason: string; created: string; rolled_back_to: number };
export type View = { schema: Record<string, Field>; groups: Record<string, string>; presets_min: number[]; config: { revision: number; global: Record<string, unknown>; countries: Record<string, Record<string, unknown>>; updated_at: number; updated_by: string };
  global: Record<string, unknown>; countries: Record<string, Record<string, { value: unknown; origin: string }>>; revisions: Rev[]; env: { spend_cap_usd: number };
  measured: Record<string, any>; applies_within_s: number };
type Country = { cc: string; name: string; region: string; flag: string };
type Change = { scope: string; key: string; value?: unknown; reset?: boolean };

const show = (f: Field, v: unknown) => v === null || v === undefined ? (f.type.endsWith("_or_null") ? "no cap" : "–") : f.type === "bool" ? (v ? "On" : "Off")
  : f.type.startsWith("money") ? `$${Number(v).toFixed(2)}` : f.type === "minutes" ? `${v} min` : f.type === "float" ? String(Number(v)) : Number(v).toLocaleString("en");

function SettingInput({ f, value, onChange, presets, disabled }: { f: Field; value: unknown; onChange: (v: unknown) => void; presets: number[]; disabled: boolean }) {
  const id = `set-${f.key}`;
  if (f.type === "bool") return <Switch id={id} checked={!!value} onCheckedChange={(v) => onChange(v)} disabled={disabled} aria-label={f.label} data-testid={id} />;
  if (f.type === "minutes") return (
    <div className="space-y-2">
      <ToggleGroup type="single" variant="outline" size="sm" value={presets.includes(Number(value)) ? String(value) : ""} onValueChange={(v) => v && onChange(Number(v))}
        className="flex flex-wrap justify-start" aria-label={`${f.label} presets`} disabled={disabled}>
        {presets.map((p) => <ToggleGroupItem key={p} value={String(p)} className="min-w-11" data-testid={`${id}-${p}`}>{p < 60 ? `${p}m` : `${p / 60}h`}</ToggleGroupItem>)}
      </ToggleGroup>
      <div className="flex items-center gap-2"><Label htmlFor={id} className="text-xs text-muted-foreground">Custom</Label>
        <Input id={id} type="number" className="h-8 w-24" min={f.min ?? 1} max={f.max ?? 1440} value={String(value ?? "")} onChange={(e) => onChange(Number(e.target.value))} disabled={disabled} data-testid={id} />
        <span className="text-xs text-muted-foreground">minutes</span></div>
    </div>);
  if (f.type === "float") return (
    <div className="flex items-center gap-3"><Slider value={[Number(value ?? 0)]} min={f.min ?? 0} max={f.max ?? 1} step={(f.max ?? 1) > 1 ? 0.25 : 0.05} onValueChange={(v) => onChange(v[0])} disabled={disabled} aria-label={f.label} className="flex-1" />
      <span className="w-12 text-right text-sm tabular-nums">{Number(value ?? 0).toFixed(2)}</span></div>);
  const nullable = f.type.endsWith("_or_null");
  return (
    <div className="flex items-center gap-2">{f.type.startsWith("money") && <span className="text-sm text-muted-foreground">$</span>}
      <Input id={id} type="number" className="h-9 w-32" step={f.type.startsWith("money") ? 0.1 : 1} min={f.min ?? undefined} max={f.max ?? undefined}
        value={value === null || value === undefined ? "" : String(value)} placeholder={nullable ? "no cap" : ""} disabled={disabled} data-testid={id}
        onChange={(e) => onChange(e.target.value === "" && nullable ? null : Number(e.target.value))} />
      {f.min !== null && f.max !== null && <span className="text-xs text-muted-foreground">{f.min}–{f.type.startsWith("money") ? `$${f.max}` : f.max}</span>}</div>);
}

export function ControlRoom({ initial, countries, groups, csrf, canEdit }: { initial: View; countries: Country[]; groups: Group[]; csrf: string; canEdit: boolean }) {
  const [view, setView] = useState<View>(initial);
  const [scope, setScope] = useState<ScopeState>({ kind: "all", groupId: groups.find((g) => g.slug === "priority-growth-markets")?.id ?? "", codes: [] });
  const [draft, setDraft] = useState<Record<string, Change>>({});
  const [review, setReview] = useState<{ diff: Rev["diff"]; revision: number } | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [rollback, setRollback] = useState<Rev | null>(null);
  const names = useMemo(() => Object.fromEntries(countries.map((c) => [c.cc, c.name])), [countries]);
  const allCodes = useMemo(() => countries.map((c) => c.cc), [countries]);
  const isGlobal = scope.kind === "all";
  const codes = isGlobal ? [] : scopeCodes(scope, groups, allCodes);
  const fields = Object.values(view.schema);

  const reload = useCallback(async () => {
    const r = await adminFetch<View>("/api/admin/engine-config", csrf);
    if (r.ok) setView(r.data);
  }, [csrf]);
  useEffect(() => { const t = setInterval(reload, 20000); return () => clearInterval(t); }, [reload]);

  // Effective value for the current scope (draft first), its origin, and whether it varies across a multi-country scope.
  const current = (f: Field): { value: unknown; origin: string; varies: boolean } => {
    if (isGlobal || !f.country) {
      const d = draft[`global|${f.key}`];
      return { value: d && !d.reset ? d.value : view.global[f.key], origin: d ? "edited" : (f.key in (view.config.global ?? {}) ? "global" : "default"), varies: false };
    }
    const vals = codes.map((cc) => { const d = draft[`${cc}|${f.key}`]; return d ? (d.reset ? view.global[f.key] : d.value) : view.countries[cc]?.[f.key]?.value; });
    const origins = new Set(codes.map((cc) => (draft[`${cc}|${f.key}`] ? "edited" : view.countries[cc]?.[f.key]?.origin ?? "default")));
    return { value: vals[0], origin: origins.size === 1 ? [...origins][0] : "mixed", varies: new Set(vals.map((v) => JSON.stringify(v))).size > 1 };
  };
  const set = (f: Field, value: unknown) => setDraft((d) => {
    const n = { ...d };
    if (isGlobal || !f.country) n[`global|${f.key}`] = { scope: "global", key: f.key, value };
    else for (const cc of codes) n[`${cc}|${f.key}`] = { scope: cc, key: f.key, value };
    return n;
  });
  const reset = (f: Field) => setDraft((d) => { const n = { ...d }; for (const cc of codes) n[`${cc}|${f.key}`] = { scope: cc, key: f.key, reset: true }; return n; });
  const changes = Object.values(draft);

  async function doReview() {
    setBusy(true);
    const r = await adminFetch<{ diff: Rev["diff"]; revision: number }>("/api/admin/engine-config/preview", csrf, { changes });
    setBusy(false);
    if (!r.ok) { toast.error(r.message); return; }
    if (!r.data.diff.length) { toast.info("These edits match the current settings; nothing to apply."); setDraft({}); return; }
    setReview(r.data);
  }
  async function apply(rollbackTo = 0) {
    setBusy(true);
    const r = await adminFetch<{ revision: number; diff: Rev["diff"] }>("/api/admin/engine-config", csrf, { changes: rollbackTo ? [] : changes, base_revision: view.config.revision ?? 0, reason, rollback_to: rollbackTo });
    setBusy(false);
    if (r.ok) {
      toast.success(`Saved as revision ${r.data.revision}. Engines apply it within about ${view.applies_within_s} seconds.`);
      setDraft({}); setReview(null); setRollback(null); setReason(""); reload(); return;
    }
    if (r.status === 409) { toast.error("Someone else changed the settings meanwhile. Reloaded: review your edits again."); setReview(null); reload(); return; }
    toast.error(r.message);
  }

  const overrides = Object.entries(view.config.countries ?? {}).filter(([, v]) => Object.keys(v).length).sort();
  const m = view.measured ?? {};
  const byGroup = Object.entries(view.groups).map(([g, label]) => ({ g, label, fields: fields.filter((f) => f.group === g && (isGlobal || f.country)) })).filter((x) => x.fields.length);
  return (
    <div className="space-y-4 pb-24">
      <section className="kpi-grid" data-testid="cr-measured">
        {([["Original discussions (1 h)", m.originals_1h], ["News discussions (1 h)", m.news_1h], ["Agent replies (1 h)", m.replies_1h], ["Votes (1 h)", m.votes_1h],
          ["Trades (1 h)", m.trades_1h], ["News items waiting for a slot", m.news_waiting], ["Spend today", m.spend_today_usd != null ? `$${Number(m.spend_today_usd).toFixed(4)}` : "–"],
          ["Spend total", m.spend_total_usd != null ? `$${Number(m.spend_total_usd).toFixed(4)} / $${view.env.spend_cap_usd.toFixed(2)}` : "–"]] as [string, unknown][]).map(([l, v]) => (
          <Card key={l} className="gap-1 py-3"><CardContent className="px-4"><p className="text-xs text-muted-foreground">{l}</p><p className="mt-1 text-xl font-bold tabular-nums">{typeof v === "number" ? fmt(v) : String(v ?? "–")}</p></CardContent></Card>))}
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[22rem_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card className="gap-3" data-testid="cr-scope">
            <CardHeader><CardTitle className="text-base">Where these settings apply</CardTitle>
              <CardDescription>All Africa edits the global defaults every country inherits. Choose a group or countries to set overrides for just those.</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              <ScopePicker value={scope} onChange={setScope} groups={groups} countries={countries} onManageGroups={() => toast.info("Manage saved groups from the Population page.")} />
              <p className="text-sm">Editing: <b>{isGlobal ? "global defaults (inherited by all 54 countries)" : `overrides for ${scopeLabel(scope, groups, names)}`}</b></p>
              <p className="text-xs text-muted-foreground">Revision {view.config.revision ?? 0}{view.config.updated_by ? ` · last change by ${view.config.updated_by}` : ""}. Country values never bypass a network-wide cap.</p>
            </CardContent>
          </Card>
          <Card className="gap-3" data-testid="cr-overrides">
            <CardHeader><CardTitle className="text-base">Countries with overrides ({overrides.length})</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {!overrides.length && <p className="text-sm text-muted-foreground">None. Every country uses the global defaults.</p>}
              {overrides.map(([cc, o]) => (
                <button key={cc} type="button" onClick={() => setScope({ kind: "countries", groupId: scope.groupId, codes: [cc] })} className="block w-full rounded-lg border p-2 text-start hover:bg-muted">
                  <p className="text-sm font-semibold">{countries.find((c) => c.cc === cc)?.flag} {names[cc] ?? cc}</p>
                  <p className="text-xs text-muted-foreground">{Object.entries(o).map(([k, v]) => `${view.schema[k]?.label ?? k}: ${show(view.schema[k], v)}`).join(" · ")}</p></button>))}
            </CardContent>
          </Card>
          <Card className="gap-3" data-testid="cr-history">
            <CardHeader><CardTitle className="flex items-center gap-2 text-base"><History className="size-4" />Change history</CardTitle></CardHeader>
            <CardContent className="max-h-96 space-y-2 overflow-y-auto">
              {!view.revisions.length && <p className="text-sm text-muted-foreground">No changes yet: defaults in force.</p>}
              {view.revisions.map((r) => (
                <div key={r.revision} className="rounded-lg border p-2 text-xs">
                  <div className="flex items-center justify-between gap-2"><b className="text-sm">Revision {r.revision}</b>
                    {canEdit && r.revision !== view.config.revision && <Button size="sm" variant="ghost" className="h-7" onClick={() => setRollback(r)}><Undo2 className="size-3.5" />Restore</Button>}</div>
                  <p className="text-muted-foreground">{r.actor_name} · {r.created?.slice(0, 16)} UTC · “{r.reason}”</p>
                  <ul className="mt-1 list-disc ps-4">{r.diff.slice(0, 6).map((d, i) => <li key={i}>{d.scope === "global" ? "All Africa" : names[d.scope] ?? d.scope}: {d.label} {String(d.before)} → {String(d.after)}{d.reset ? " (reset)" : ""}</li>)}
                    {r.diff.length > 6 && <li>…and {r.diff.length - 6} more</li>}</ul>
                </div>))}
            </CardContent>
          </Card>
        </div>

        {/* ISSUE-04: on wide screens the setting groups flow into two columns (three with the scope rail) instead of one
            stretched column; `items-start` keeps each card its own height. */}
        <div className="grid grid-cols-1 items-start gap-4 min-[1800px]:grid-cols-2">
          {!canEdit && <Alert className="min-[1800px]:col-span-2"><AlertTitle>Read-only</AlertTitle><AlertDescription>Changing engine settings needs the tenant admin role.</AlertDescription></Alert>}
          {byGroup.map(({ g, label, fields: fs }) => (
            <Card key={g} className="gap-2" data-testid={`cr-group-${g}`}>
              <CardHeader><CardTitle className="text-base">{label}</CardTitle></CardHeader>
              <CardContent className="divide-y">
                {fs.map((f) => {
                  const cur = current(f);
                  return (
                    <div key={f.key} className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] sm:items-center" data-setting={f.key}>
                      <div>
                        <div className="flex items-center gap-1"><Label htmlFor={`set-${f.key}`} className="font-medium">{f.label}</Label><Help label={f.label}>{f.help}</Help></div>
                        <div className="mt-1 flex flex-wrap gap-1 text-xs">
                          <Badge variant={cur.origin === "edited" ? "default" : cur.origin === "country" ? "secondary" : "outline"} data-testid={`origin-${f.key}`}>
                            {cur.origin === "edited" ? "unsaved edit" : cur.origin === "country" ? "country override" : cur.origin === "global" ? (isGlobal ? "set globally" : "inherited from global") : cur.origin === "mixed" ? "mixed" : "default"}</Badge>
                          {cur.varies && <Badge variant="outline">varies across selection</Badge>}
                          {!f.country && !isGlobal && <Badge variant="outline">network-wide only</Badge>}
                          <span className="text-muted-foreground">default {show(f, f.default)}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1"><SettingInput f={f} value={cur.value} onChange={(v) => set(f, v)} presets={view.presets_min} disabled={!canEdit} /></div>
                        {!isGlobal && f.country && (cur.origin === "country" || cur.origin === "mixed" || cur.origin === "edited") && canEdit &&
                          <Button size="icon" variant="ghost" onClick={() => reset(f)} aria-label={`Reset ${f.label} to inherit the global value`} title="Inherit global value"><RotateCcw className="size-4" /></Button>}
                      </div>
                    </div>);
                })}
              </CardContent>
            </Card>))}
        </div>
      </div>

      {changes.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 p-3 backdrop-blur" data-testid="cr-pending">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2">
            <p className="text-sm"><b>{changes.length}</b> unsaved {changes.length === 1 ? "edit" : "edits"} · {isGlobal ? "global defaults" : scopeLabel(scope, groups, names)}</p>
            <div className="flex gap-2"><Button variant="outline" onClick={() => setDraft({})}>Discard</Button>
              <Button onClick={doReview} disabled={busy} data-testid="cr-review">{busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}Review &amp; apply</Button></div>
          </div>
        </div>)}

      <Dialog open={!!review || !!rollback} onOpenChange={(o) => { if (!o) { setReview(null); setRollback(null); } }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl" data-testid="cr-dialog">
          <DialogHeader><DialogTitle>{rollback ? `Restore revision ${rollback.revision}?` : `Apply ${review?.diff.length} change${review?.diff.length === 1 ? "" : "s"}?`}</DialogTitle>
            <DialogDescription>{rollback ? "Creates a new revision equal to that one; history is kept." : "Engines pick this up on their next scheduling turn (about 10 seconds). Nothing restarts."}</DialogDescription></DialogHeader>
          {review && <Table><TableHeader><TableRow><TableHead>Where</TableHead><TableHead>Setting</TableHead><TableHead className="text-right">Before</TableHead><TableHead className="text-right">After</TableHead></TableRow></TableHeader>
            <TableBody>{review.diff.map((d, i) => { const f = view.schema[d.key]; return (
              <TableRow key={i}><TableCell>{d.scope === "global" ? "All Africa" : names[d.scope] ?? d.scope}</TableCell><TableCell>{d.label}{d.reset ? " (inherit global)" : ""}</TableCell>
                <TableCell className="text-right tabular-nums">{f ? show(f, d.before) : String(d.before)}</TableCell><TableCell className={cn("text-right font-semibold tabular-nums")}>{f ? show(f, d.after) : String(d.after)}</TableCell></TableRow>); })}</TableBody></Table>}
          <div className="space-y-1.5"><Label htmlFor="cr-reason">Reason (required, audited)</Label>
            <Textarea id="cr-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. More original discussions in Nigeria this week" data-testid="cr-reason" /></div>
          <DialogFooter><Button variant="outline" onClick={() => { setReview(null); setRollback(null); }}>Cancel</Button>
            <Button onClick={() => apply(rollback ? rollback.revision : 0)} disabled={busy || reason.trim().length < 3} data-testid="cr-apply">{busy && <Loader2 className="size-4 animate-spin" />}{rollback ? "Restore" : "Apply"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
