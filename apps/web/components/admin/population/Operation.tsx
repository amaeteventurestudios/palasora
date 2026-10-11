"use client";
// Population operations (spec 30): choose a scope (All Africa, a saved group, any countries), choose WHAT to do (create
// identities by Set Target / Add N / Distribute N, or activate / pause / resume / deactivate / retire), preview the exact
// effect from live counts, then launch one durable background job. Nothing is written before "Launch".
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, ChevronsUpDown, CircleHelp, Eye, Globe2, Loader2, Rocket, Settings2, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { adminFetch, fmt, newKey } from "@/lib/admin/client";
import { cn } from "@/lib/utils";

export type Group = { id: string; slug: string; name: string; description: string; codes: string[]; kind: "system" | "custom"; updated_by: string };
export type ScopeState = { kind: "all" | "group" | "countries"; groupId: string; codes: string[] };
type Country = { cc: string; name: string; region: string; flag: string };

export function Help({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild><button type="button" className="inline-flex size-6 items-center justify-center rounded-full text-muted-foreground hover:text-foreground" aria-label={`Help: ${label}`}>
        <CircleHelp className="size-4" /></button></PopoverTrigger>
      <PopoverContent className="max-w-xs text-sm leading-relaxed">{children}</PopoverContent>
    </Popover>
  );
}

export function scopeCodes(s: ScopeState, groups: Group[], all: string[]): string[] {
  if (s.kind === "all") return all;
  if (s.kind === "group") return groups.find((g) => g.id === s.groupId)?.codes ?? [];
  return s.codes;
}

export function scopeLabel(s: ScopeState, groups: Group[], names: Record<string, string>): string {
  if (s.kind === "all") return "All Africa (54 countries)";
  if (s.kind === "group") { const g = groups.find((x) => x.id === s.groupId); return g ? `${g.name} (${g.codes.length})` : "No group chosen"; }
  return s.codes.length <= 3 ? s.codes.map((c) => names[c] ?? c).join(", ") || "No countries chosen" : `${s.codes.length} selected countries`;
}

export function ScopePicker({ value, onChange, groups, countries, onManageGroups }: { value: ScopeState; onChange: (s: ScopeState) => void; groups: Group[];
  countries: Country[]; onManageGroups: () => void }) {
  const [open, setOpen] = useState(false);
  const names = Object.fromEntries(countries.map((c) => [c.cc, c.name]));
  const regions = [...new Set(countries.map((c) => c.region))].sort();
  const toggle = (cc: string) => onChange({ ...value, kind: "countries", codes: value.codes.includes(cc) ? value.codes.filter((x) => x !== cc) : [...value.codes, cc].sort() });
  return (
    <div className="space-y-3" data-testid="scope-picker">
      <div className="flex items-center gap-1"><Label className="text-sm font-semibold">Scope</Label>
        <Help label="Scope">Pick every country at once (All Africa), a saved group such as Priority Growth Markets or a region, or any set of countries. You can also click countries on the map.</Help></div>
      <ToggleGroup type="single" variant="outline" value={value.kind} onValueChange={(k) => k && onChange({ ...value, kind: k as ScopeState["kind"] })} className="w-full" aria-label="Scope type">
        <ToggleGroupItem value="all" className="flex-1" data-testid="scope-all"><Globe2 className="size-4" />All Africa</ToggleGroupItem>
        <ToggleGroupItem value="group" className="flex-1" data-testid="scope-group">Saved group</ToggleGroupItem>
        <ToggleGroupItem value="countries" className="flex-1" data-testid="scope-countries">Countries</ToggleGroupItem>
      </ToggleGroup>
      {value.kind === "group" && (
        <div className="flex gap-2">
          <Select value={value.groupId} onValueChange={(id) => onChange({ ...value, groupId: id })}>
            <SelectTrigger className="flex-1" aria-label="Saved group" data-testid="group-select"><SelectValue placeholder="Choose a saved group" /></SelectTrigger>
            <SelectContent>{groups.map((g) => <SelectItem key={g.id} value={g.id}>{g.name} · {g.codes.length}</SelectItem>)}</SelectContent>
          </Select>
          <Button type="button" variant="outline" size="icon" onClick={onManageGroups} aria-label="Manage saved groups"><Settings2 className="size-4" /></Button>
        </div>
      )}
      {value.kind === "countries" && (
        <div className="space-y-2">
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button type="button" variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between font-normal" data-testid="country-combobox">
                {value.codes.length ? `${value.codes.length} selected` : "Search and select countries"}<ChevronsUpDown className="size-4 opacity-60" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] min-w-72 p-0" align="start">
              <Command>
                <CommandInput placeholder="Search 54 countries…" />
                <CommandList className="max-h-72">
                  <CommandEmpty>No country found.</CommandEmpty>
                  {regions.map((r) => (
                    <CommandGroup key={r} heading={r}>
                      {countries.filter((c) => c.region === r).map((c) => (
                        <CommandItem key={c.cc} value={`${c.name} ${c.cc}`} onSelect={() => toggle(c.cc)} data-testid={`pick-${c.cc}`}>
                          <Check className={cn("size-4", value.codes.includes(c.cc) ? "opacity-100" : "opacity-0")} />{c.flag} {c.name}
                        </CommandItem>))}
                    </CommandGroup>))}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          <div className="flex flex-wrap gap-1">
            {regions.map((r) => <Button key={r} type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs"
              onClick={() => onChange({ ...value, kind: "countries", codes: [...new Set([...value.codes, ...countries.filter((c) => c.region === r).map((c) => c.cc)])].sort() })}>+ {r}</Button>)}
            {value.codes.length > 0 && <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => onChange({ ...value, codes: [] })}>Clear</Button>}
          </div>
          {value.codes.length > 0 && <div className="flex max-h-24 flex-wrap gap-1 overflow-auto" aria-label="Selected countries">
            {value.codes.map((cc) => <Badge key={cc} variant="secondary" className="gap-1 pe-1">{names[cc] ?? cc}
              <button type="button" onClick={() => toggle(cc)} aria-label={`Remove ${names[cc] ?? cc}`} className="rounded-sm hover:bg-muted"><X className="size-3" /></button></Badge>)}</div>}
        </div>
      )}
    </div>
  );
}

type PreviewRow = { cc: string; name: string; registered: number; female?: number; male?: number; eligible: number; pending?: number; create?: number; create_f?: number;
  create_m?: number; after?: number; after_f?: number; after_m?: number; change?: number; eligible_after?: number; paused?: number; resting?: number; note: string };
type Preview = { rows: PreviewRow[]; totals: Record<string, number>; warnings: string[]; hash: string; two_step: boolean; confirm_phrase: string;
  examples?: { display_name: string; handle: string; edition: string; adm1_name: string; settlement: string; profession: string; languages: string[]; primary_subjects: string[];
    gender_persona: string; bio: string; subpal_slugs: string[] }[];
  estimate?: { per_minute: number | null; minutes: number | null; operations: number; model_calls: number; cost_usd: number; basis: string };
  resources?: { disk_free_bytes: number; db_bytes: number; estimated_new_bytes: number; ok: boolean } };

const OP_LABEL: Record<string, string> = { create: "Create identities", activate: "Activate (make eligible)", pause: "Pause", resume: "Resume", deactivate: "Deactivate", retire: "Retire" };
const OP_HELP: Record<string, string> = {
  activate: "Makes registered identities ELIGIBLE: the engines may consider them. They count as active only after a real public action. Highest activity propensity first.",
  pause: "Temporarily stops every eligible identity in scope. Staff holds and history are untouched; Resume restores exactly these.",
  resume: "Restores identities paused by a population operation (never staff holds).",
  deactivate: "Returns eligible identities to registered (inactive).",
  retire: "Permanently stops identities that are registered or paused. History is kept; nothing is deleted.",
};

export function OperationPanel({ scope, setScope, groups, countries, csrf, onLaunched, onManageGroups, stats }: { scope: ScopeState; setScope: (s: ScopeState) => void;
  groups: Group[]; countries: Country[]; csrf: string; onLaunched: () => void; onManageGroups: () => void;
  stats: { pendingTotal: number } }) {
  const names = useMemo(() => Object.fromEntries(countries.map((c) => [c.cc, c.name])), [countries]);
  const allCodes = useMemo(() => countries.map((c) => c.cc), [countries]);
  const [tab, setTab] = useState("create");
  const [mode, setMode] = useState("set_target");
  const [target, setTarget] = useState(500);
  const [add, setAdd] = useState(100);
  const [total, setTotal] = useState(1000);
  const [distribute, setDistribute] = useState("even");
  const [femalePct, setFemalePct] = useState(50);
  const [statusAfter, setStatusAfter] = useState("resting");
  const [op, setOp] = useState("activate");
  const [actMode, setActMode] = useState("count");
  const [actCount, setActCount] = useState(100);
  const [actPct, setActPct] = useState(50);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [confirm, setConfirm] = useState("");
  const [key, setKey] = useState("");
  const codes = scopeCodes(scope, groups, allCodes);
  const curOp = tab === "create" ? "create" : op;
  const params = tab === "create"
    ? { female_pct: femalePct, status_after: statusAfter, ...(mode === "set_target" ? { target } : mode === "add_n" ? { add } : { total, distribute, target }) }
    : { mode: actMode, count: actCount, percent: actPct };

  async function doPreview() {
    if (!codes.length) { toast.error("Choose at least one country"); return; }
    setBusy(true);
    const r = await adminFetch<Preview>("/api/admin/agent-population/preview", csrf, { op: curOp, mode: tab === "create" ? mode : "", countries: codes, params });
    setBusy(false);
    if (!r.ok) { toast.error(r.message); return; }
    setConfirm(""); setKey(newKey()); setPreview(r.data);
  }

  async function launch() {
    if (!preview) return;
    setBusy(true);
    const r = await adminFetch<{ job: { id: string }; replayed: boolean }>("/api/admin/agent-population/jobs", csrf, {
      op: curOp, mode: tab === "create" ? mode : "", countries: codes, params, preview_hash: preview.hash, idempotency_key: key, confirm,
      scope_kind: scope.kind === "all" ? "all" : scope.kind === "group" ? "group" : "countries", scope_label: scopeLabel(scope, groups, names), reason });
    setBusy(false);
    if (r.ok) {
      toast.success(`${OP_LABEL[curOp]}: job ${r.data.job.id} ${r.data.replayed ? "already exists (same request)" : "launched"}. Progress is below.`);
      setPreview(null); onLaunched(); return;
    }
    if (r.code === "PREVIEW_CHANGED" && r.data?.preview) { setPreview(r.data.preview); toast.warning(r.message); return; }
    toast.error(r.message);
  }

  const totalChange = preview ? (preview.totals.create ?? preview.totals.change ?? 0) : 0;
  return (
    <Card className="gap-4" data-testid="operation-panel">
      <CardHeader>
        <CardTitle className="text-base">Population operation</CardTitle>
        <CardDescription>Choose countries, preview the exact effect from live counts, then launch one background job. Creating identities never calls a model and costs $0.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <ScopePicker value={scope} onChange={setScope} groups={groups} countries={countries} onManageGroups={onManageGroups} />
        <p className="text-sm text-muted-foreground" data-testid="scope-summary">In scope: <b className="text-foreground">{scopeLabel(scope, groups, names)}</b>{scope.kind !== "all" && ` · ${codes.length} countries`}</p>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="w-full"><TabsTrigger value="create" className="flex-1" data-testid="tab-create">Create identities</TabsTrigger>
            <TabsTrigger value="activation" className="flex-1" data-testid="tab-activation">Activation &amp; status</TabsTrigger></TabsList>
          <TabsContent value="create" className="space-y-4 pt-3">
            <RadioGroup value={mode} onValueChange={setMode} className="gap-2" aria-label="Creation mode">
              {([["set_target", "Set target per country", "Fill each selected country up to the target. Idempotent: running it again creates nothing."],
                ["add_n", "Add N per country", "Add exactly N new identities to every selected country, whatever they have now."],
                ["distribute_n", "Distribute N in total", "Spread one total across the selected countries (evenly, or towards a target)."]] as const).map(([v, l, h]) => (
                <label key={v} htmlFor={`m-${v}`} className={cn("flex cursor-pointer items-start gap-3 rounded-lg border p-3", mode === v && "border-primary bg-primary/5")}>
                  <RadioGroupItem id={`m-${v}`} value={v} className="mt-0.5" data-testid={`mode-${v}`} />
                  <span><span className="block text-sm font-semibold">{l}</span><span className="block text-xs text-muted-foreground">{h}</span></span>
                </label>))}
            </RadioGroup>
            <div className="grid gap-3 sm:grid-cols-2">
              {mode === "set_target" && <div className="space-y-1.5"><Label htmlFor="pop-target">Target identities per country</Label>
                <Input id="pop-target" type="number" min={1} max={5000} value={target} onChange={(e) => setTarget(Number(e.target.value))} data-testid="input-target" /></div>}
              {mode === "add_n" && <div className="space-y-1.5"><Label htmlFor="pop-add">New identities per country</Label>
                <Input id="pop-add" type="number" min={1} max={5000} value={add} onChange={(e) => setAdd(Number(e.target.value))} data-testid="input-add" /></div>}
              {mode === "distribute_n" && <>
                <div className="space-y-1.5"><Label htmlFor="pop-total">Total new identities</Label>
                  <Input id="pop-total" type="number" min={1} max={60000} value={total} onChange={(e) => setTotal(Number(e.target.value))} data-testid="input-total" /></div>
                <div className="space-y-1.5"><Label>Distribution</Label>
                  <Select value={distribute} onValueChange={setDistribute}><SelectTrigger aria-label="Distribution"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="even">Evenly</SelectItem><SelectItem value="deficit">Towards {target} per country (largest gaps first)</SelectItem></SelectContent></Select></div>
              </>}
              <div className="space-y-1.5">
                <div className="flex items-center gap-1"><Label>Status after creation</Label>
                  <Help label="Status after creation">Registered (inactive) is the safe default: identities exist but the engines ignore them until you activate them. Eligible lets the engines consider them immediately; spending caps still apply.</Help></div>
                <Select value={statusAfter} onValueChange={setStatusAfter}><SelectTrigger aria-label="Status after creation" data-testid="status-after"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="resting">Registered (inactive)</SelectItem><SelectItem value="active">Eligible immediately</SelectItem></SelectContent></Select>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between"><div className="flex items-center gap-1"><Label>Fictional presentation mix</Label>
                <Help label="Presentation mix">Founder target: 250 female-presenting and 250 male-presenting personas per country. This is a persona-design attribute only, never an inference about real people. Existing identities are never reassigned.</Help></div>
                <span className="text-sm tabular-nums">{femalePct}% female · {100 - femalePct}% male</span></div>
              <Slider value={[femalePct]} min={0} max={100} step={5} onValueChange={(v) => setFemalePct(v[0])} aria-label="Female-presenting share" />
            </div>
          </TabsContent>
          <TabsContent value="activation" className="space-y-4 pt-3">
            <div className="space-y-1.5"><Label>Action</Label>
              <Select value={op} onValueChange={setOp}><SelectTrigger aria-label="Status action" data-testid="act-op"><SelectValue /></SelectTrigger>
                <SelectContent>{["activate", "pause", "resume", "deactivate", "retire"].map((o) => <SelectItem key={o} value={o}>{OP_LABEL[o]}</SelectItem>)}</SelectContent></Select>
              <p className="text-xs text-muted-foreground">{OP_HELP[op]}</p></div>
            {op === "activate" && <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label>How many</Label>
                <Select value={actMode} onValueChange={setActMode}><SelectTrigger aria-label="Activation amount" data-testid="act-mode"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="count">A number per country</SelectItem><SelectItem value="percent">A share of registered per country</SelectItem><SelectItem value="all">All waiting identities</SelectItem></SelectContent></Select></div>
              {actMode === "count" && <div className="space-y-1.5"><Label htmlFor="act-n">Identities per country</Label>
                <Input id="act-n" type="number" min={1} value={actCount} onChange={(e) => setActCount(Number(e.target.value))} data-testid="input-act-count" /></div>}
              {actMode === "percent" && <div className="space-y-1.5"><Label htmlFor="act-p">Eligible share of registered (%)</Label>
                <Input id="act-p" type="number" min={1} max={100} value={actPct} onChange={(e) => setActPct(Number(e.target.value))} /></div>}
            </div>}
          </TabsContent>
        </Tabs>
        <div className="space-y-1.5"><Label htmlFor="pop-reason">Reason (audit trail)</Label>
          <Textarea id="pop-reason" rows={2} placeholder="e.g. Baseline 500 residents per country" value={reason} onChange={(e) => setReason(e.target.value)} data-testid="input-reason" /></div>
        {stats.pendingTotal > 0 && <p className="text-xs text-muted-foreground">{fmt(stats.pendingTotal)} identities are already planned by unfinished jobs; previews count them so nothing is created twice.</p>}
        <Button type="button" onClick={doPreview} disabled={busy || !codes.length} className="w-full" data-testid="btn-preview">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Eye className="size-4" />}Preview {OP_LABEL[curOp].toLowerCase()}</Button>
      </CardContent>

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl" data-testid="preview-dialog">
          <DialogHeader>
            <DialogTitle>{OP_LABEL[curOp]}: {fmt(totalChange)} {curOp === "create" ? "new identities" : "identities change"}</DialogTitle>
            <DialogDescription>{scopeLabel(scope, groups, names)} · {fmt(preview?.totals.countries_changed)} of {fmt(preview?.totals.countries)} countries change. Counts come from the live database.</DialogDescription>
          </DialogHeader>
          {preview && <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="preview-totals">
              {(curOp === "create" ? [["To create", preview.totals.create], ["Female-presenting", preview.totals.female], ["Male-presenting", preview.totals.male], ["Total after", preview.totals.after]]
                : [["Identities changing", preview.totals.change], ["Countries", preview.totals.countries_changed], ["Model calls", 0], ["Cost", 0]]).map(([l, v]) => (
                <div key={String(l)} className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">{l}</p><p className="text-xl font-bold tabular-nums" data-testid={`pv-${String(l).toLowerCase().replace(/\W+/g, "-")}`}>{l === "Cost" ? "$0.00" : fmt(Number(v))}</p></div>))}
            </div>
            {preview.estimate && <p className="text-sm text-muted-foreground">Model calls: <b className="text-foreground">0</b> · cost <b className="text-foreground">$0.00</b> (deterministic profile synthesis) · about {fmt(preview.estimate.operations)} database operations ·
              {preview.estimate.minutes != null ? ` roughly ${fmt(preview.estimate.minutes, 1)} min at the ${fmt(preview.estimate.per_minute)} identities/min measured on the last job` : ` duration ${preview.estimate.basis}`}.</p>}
            {preview.warnings.length > 0 && <Alert><AlertTitle>Check before launching</AlertTitle><AlertDescription><ul className="list-disc ps-4">{preview.warnings.map((w) => <li key={w}>{w}</li>)}</ul></AlertDescription></Alert>}
            {preview.examples && preview.examples.length > 0 && <div><p className="mb-2 text-sm font-semibold">First identities this job will create</p>
              <div className="grid gap-2 sm:grid-cols-2" data-testid="preview-examples">{preview.examples.map((p) => (
                <div key={p.handle} className="rounded-lg border p-3 text-sm"><p className="font-semibold">{p.display_name} <span className="font-normal text-muted-foreground">@{p.handle}</span></p>
                  <p className="text-xs text-muted-foreground">{p.adm1_name || p.edition} · {p.settlement} · {p.profession} · {p.languages.join(", ")} · {p.gender_persona}-presenting</p>
                  <p className="mt-1 line-clamp-3 text-xs">{p.bio}</p></div>))}</div></div>}
            <ScrollArea className="h-64 rounded-lg border">
              <Table data-testid="preview-table"><TableHeader><TableRow><TableHead>Country</TableHead><TableHead className="text-right">Now</TableHead>
                {curOp === "create" ? <><TableHead className="text-right">Create</TableHead><TableHead className="text-right">F / M</TableHead><TableHead className="text-right">After (F / M)</TableHead></>
                  : <><TableHead className="text-right">Eligible</TableHead><TableHead className="text-right">Change</TableHead><TableHead className="text-right">Eligible after</TableHead></>}
                <TableHead>Note</TableHead></TableRow></TableHeader>
                <TableBody>{preview.rows.map((r) => (
                  <TableRow key={r.cc} data-cc={r.cc}><TableCell className="whitespace-nowrap">{r.name}</TableCell><TableCell className="text-right tabular-nums">{fmt(r.registered)}</TableCell>
                    {curOp === "create" ? <><TableCell className="text-right font-semibold tabular-nums">{fmt(r.create)}</TableCell><TableCell className="text-right tabular-nums">{fmt(r.create_f)} / {fmt(r.create_m)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(r.after)} ({fmt(r.after_f)} / {fmt(r.after_m)})</TableCell></>
                      : <><TableCell className="text-right tabular-nums">{fmt(r.eligible)}</TableCell><TableCell className="text-right font-semibold tabular-nums">{fmt(r.change)}</TableCell><TableCell className="text-right tabular-nums">{fmt(r.eligible_after)}</TableCell></>}
                    <TableCell className="text-xs text-muted-foreground">{r.note}</TableCell></TableRow>))}</TableBody></Table>
            </ScrollArea>
            {preview.two_step && <div className="space-y-1.5 rounded-lg border border-[var(--warning,#d97706)] p-3">
              <Label htmlFor="confirm-phrase">This is a large operation. Type <code className="rounded bg-muted px-1">{preview.confirm_phrase}</code> to confirm.</Label>
              <Input id="confirm-phrase" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" data-testid="input-confirm" /></div>}
          </div>}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setPreview(null)}>Cancel</Button>
            <Button type="button" onClick={launch} disabled={busy || !preview || totalChange <= 0 || (preview.two_step && confirm.trim().toUpperCase() !== preview.confirm_phrase.toUpperCase())} data-testid="btn-launch">
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Rocket className="size-4" />}Launch operation</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export function GroupsDialog({ open, onOpenChange, groups, countries, csrf, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; groups: Group[];
  countries: Country[]; csrf: string; onSaved: () => void }) {
  const [edit, setEdit] = useState<{ id: string; name: string; description: string; codes: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  async function save() {
    if (!edit) return;
    setBusy(true);
    const r = await adminFetch("/api/admin/agent-population/groups", csrf, { action: "save", ...edit });
    setBusy(false);
    if (!r.ok) { toast.error(r.message); return; }
    toast.success(`Saved ${edit.name}`); setEdit(null); onSaved();
  }
  async function remove(g: Group) {
    setBusy(true);
    const r = await adminFetch("/api/admin/agent-population/groups", csrf, { action: "delete", id: g.id });
    setBusy(false);
    if (!r.ok) { toast.error(r.message); return; }
    toast.success(`Deleted ${g.name}`); onSaved();
  }
  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setEdit(null); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl" data-testid="groups-dialog">
        <DialogHeader><DialogTitle>Saved country groups</DialogTitle>
          <DialogDescription>Regional groups follow the registry. Custom groups (including Priority Growth Markets) can be edited by tenant admins; every change is audited.</DialogDescription></DialogHeader>
        {!edit ? (
          <div className="space-y-2">
            {groups.map((g) => (
              <div key={g.id} className="flex items-start justify-between gap-3 rounded-lg border p-3">
                <div><p className="font-semibold">{g.name} <Badge variant="outline" className="ms-1">{g.kind === "system" ? "region" : "custom"}</Badge></p>
                  <p className="text-xs text-muted-foreground">{g.codes.map((c) => countries.find((x) => x.cc === c)?.name ?? c).join(", ")}</p></div>
                {g.kind === "custom" && <div className="flex shrink-0 gap-1">
                  <Button size="sm" variant="outline" onClick={() => setEdit({ id: g.id, name: g.name, description: g.description, codes: g.codes })}>Edit</Button>
                  <Button size="icon" variant="ghost" onClick={() => remove(g)} disabled={busy} aria-label={`Delete ${g.name}`}><Trash2 className="size-4" /></Button></div>}
              </div>))}
            <Button onClick={() => setEdit({ id: "", name: "", description: "", codes: [] })} data-testid="btn-new-group">New group</Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5"><Label htmlFor="g-name">Name</Label><Input id="g-name" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></div>
            <div className="space-y-1.5"><Label htmlFor="g-desc">Description</Label><Input id="g-desc" value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></div>
            <div className="grid max-h-72 grid-cols-2 gap-1 overflow-auto rounded-lg border p-2 sm:grid-cols-3">
              {countries.map((c) => (
                <label key={c.cc} className="flex items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-muted">
                  <input type="checkbox" checked={edit.codes.includes(c.cc)} onChange={() => setEdit({ ...edit, codes: edit.codes.includes(c.cc) ? edit.codes.filter((x) => x !== c.cc) : [...edit.codes, c.cc] })} />
                  {c.flag} {c.name}</label>))}
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setEdit(null)}>Back</Button><Button onClick={save} disabled={busy}>Save group</Button></DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
