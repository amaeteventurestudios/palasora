"use client";
// ISSUE-03 editor for founder-configured regional participation priority. Weights 0-3 in steps of 0.25; save needs a
// reason and is audited; nothing changes until "Save".
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { adminFetch } from "@/lib/admin/client";

export function RegionWeight({ code, name, value, onChange, disabled }: { code: string; name: string; value: number; onChange: (code: string, v: number) => void; disabled: boolean }) {
  return <Input type="number" min={0} max={3} step={0.25} value={value} disabled={disabled} onChange={(e) => onChange(code, Number(e.target.value))}
    className="h-8 w-20 tabular-nums" aria-label={`Priority weight for ${name}`} data-testid={`weight-${code}`} />;
}

export type RegionRow = { code: string; name: string; weight: number; prioritized: boolean; registered: number; eligible: number; active: number; posts: number; replies: number;
  diagnosis: "none" | "silent" | "active" };
const DIAG = { none: { label: "No residents", tone: "text-muted-foreground" }, silent: { label: "Residents, no activity", tone: "text-[var(--warning,#b45309)]" },
  active: { label: "Active", tone: "text-success" } } as const;

export function RegionPriorityEditor({ rows, revision, csrf, canEdit }: { rows: RegionRow[]; revision: number; csrf: string; canEdit: boolean }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Record<string, number>>({});
  const [reason, setReason] = useState("");
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const base = Object.fromEntries(rows.map((r) => [r.code, r.weight]));
  const changed = Object.entries(draft).filter(([c, v]) => v !== base[c]);
  const set = (code: string, v: number) => setDraft((d) => ({ ...d, [code]: v }));
  const shown = rows.filter((r) => !q || `${r.name} ${r.code}`.toLowerCase().includes(q.toLowerCase()));
  const save = async () => {
    setBusy(true); setMsg(null);
    const r = await adminFetch<{ changed: number }>("/api/admin/region-priority", csrf, { weights: Object.fromEntries(changed), reason, base_revision: revision });
    setBusy(false);
    if (r.ok) { setMsg({ ok: true, text: `Saved ${r.data.changed} change(s). The engine uses them within about 30 seconds.` }); setDraft({}); setReason(""); router.refresh(); }
    else setMsg({ ok: false, text: r.message });
  };
  return (
    <div className="flex flex-col gap-3">
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search regions…" className="h-9 max-w-xs" aria-label="Search regions" />
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[760px] text-sm" data-testid="region-table">
          <thead className="sticky top-0 bg-card text-left text-xs text-muted-foreground"><tr>
            <th className="px-3 py-2">Region</th><th className="px-3 py-2">Priority weight</th><th className="px-3 py-2 text-right">Residents</th><th className="px-3 py-2 text-right">Eligible</th>
            <th className="px-3 py-2 text-right">Active (7 d)</th><th className="px-3 py-2 text-right">Posts + replies (7 d)</th><th className="px-3 py-2">Coverage</th></tr></thead>
          <tbody className="divide-y">
            {shown.map((r) => (
              <tr key={r.code} data-region={r.code}>
                <td className="px-3 py-2"><span className="font-medium">{r.name}</span> <span className="text-xs text-muted-foreground">{r.code}</span>
                  {r.prioritized && <span className="ms-2 rounded-full border px-1.5 text-[11px] font-semibold">founder priority</span>}</td>
                <td className="px-3 py-2"><RegionWeight code={r.code} name={r.name} value={draft[r.code] ?? r.weight} onChange={set} disabled={!canEdit} /></td>
                <td className="px-3 py-2 text-right tabular-nums">{r.registered.toLocaleString("en")}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.eligible.toLocaleString("en")}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.active.toLocaleString("en")}</td>
                <td className="px-3 py-2 text-right tabular-nums">{(r.posts + r.replies).toLocaleString("en")}</td>
                <td className={`px-3 py-2 font-medium ${DIAG[r.diagnosis].tone}`}>{DIAG[r.diagnosis].label}</td>
              </tr>))}
          </tbody>
        </table>
      </div>
      {canEdit && (
        <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-2 rounded-lg border bg-background/95 p-3 backdrop-blur" data-testid="region-save-bar">
          <p className="text-sm"><b>{changed.length}</b> unsaved {changed.length === 1 ? "change" : "changes"}</p>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why are you changing this? (required)" className="h-9 min-w-0 flex-1 sm:max-w-md" aria-label="Reason for the change" />
          <Button onClick={save} disabled={busy || !changed.length || reason.trim().length < 3} data-testid="region-save">Save priorities</Button>
          <Button variant="outline" onClick={() => setDraft({})} disabled={!changed.length}>Discard</Button>
          {msg && <p role="status" className={msg.ok ? "text-sm text-success" : "text-sm text-danger"}>{msg.text}</p>}
        </div>)}
      {!canEdit && <p className="text-sm text-muted-foreground">Read-only: changing priorities needs the tenant admin role.</p>}
    </div>
  );
}
