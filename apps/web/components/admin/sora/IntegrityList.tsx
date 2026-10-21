"use client";
// ISSUE-14 Economy integrity: each check says what it looks for, what it found (with evidence) and lets a person record a
// disposition. A signal is a prompt to look, not proof; nothing here changes balances.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { adminFetch } from "@/lib/admin/client";
import type { IntegritySignal } from "@/lib/admin/econ";

const SEV = { ok: { label: "Nothing found", tone: "secondary" }, watch: { label: "Worth a look", tone: "outline" }, alert: { label: "Needs a person", tone: "destructive" } } as const;
const KIND = { ledger: "Ledger", rewards: "Rewards", voting: "Voting", exchange: "Exchange" } as const;
const DISP = { looks_fine: "Looked at: fine", investigating: "Investigating", action_taken: "Action taken" } as const;

export function IntegrityList({ signals, names, csrf, canReview }: { signals: IntegritySignal[]; names: Record<string, string>; csrf: string; canReview: boolean }) {
  const order = { alert: 0, watch: 1, ok: 2 } as const;
  return <ul className="flex flex-col gap-3" data-testid="integrity-signals">{[...signals].sort((a, b) => order[a.severity] - order[b.severity]).map((s) =>
    <Signal key={s.key} s={s} names={names} csrf={csrf} canReview={canReview} />)}</ul>;
}

function Signal({ s, names, csrf, canReview }: { s: IntegritySignal; names: Record<string, string>; csrf: string; canReview: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [disp, setDisp] = useState<keyof typeof DISP>("looks_fine");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const save = async () => {
    const r = await adminFetch("/api/admin/pals-policy", csrf, { action: "review", signal_key: s.key, disposition: disp, note });
    if (r.ok) { setMsg({ ok: true, text: "Recorded." }); setNote(""); router.refresh(); } else setMsg({ ok: false, text: r.message });
  };
  const show = (v: unknown, k: string) => (typeof v === "string" && /agent|voter|author|buyer|seller/.test(k) && names[v] ? `${names[v]} (${v.slice(0, 6)}…)` : Array.isArray(v) ? v.map((x) => names[x] ?? x).join(" ⇄ ") : String(v));
  return (
    <li className="rounded-xl border p-4" data-signal={s.key} data-severity={s.severity}>
      <div className="flex flex-wrap items-center gap-2"><Badge variant={SEV[s.severity].tone}>{SEV[s.severity].label}</Badge><span className="text-xs text-muted-foreground">{KIND[s.kind]}</span>
        <h3 className="font-bold">{s.title}</h3><span className="ms-auto text-xs text-muted-foreground">checked: {s.checked}</span></div>
      <p className="mt-1 text-sm">{s.plain}</p>
      {s.review && <p className="mt-1 text-xs"><b>{DISP[s.review.disposition as keyof typeof DISP] ?? s.review.disposition}</b> · {s.review.reviewed_by} · {new Date(s.review.created_at * 1000).toISOString().slice(0, 16).replace("T", " ")} UTC · “{s.review.note}”</p>}
      {s.count > 0 && (<details className="mt-2" open={s.severity === "alert"}><summary className="cursor-pointer text-sm font-semibold">Evidence ({s.count.toLocaleString("en")})</summary>
        <div className="mt-2 overflow-x-auto"><table className="w-full min-w-[480px] text-xs"><thead className="text-left text-muted-foreground"><tr>{Object.keys(s.evidence[0] ?? {}).map((k) => <th key={k} className="py-1 pe-3">{k.replace(/_/g, " ")}</th>)}</tr></thead>
          <tbody className="divide-y">{s.evidence.map((e, i) => <tr key={i}>{Object.entries(e).map(([k, v]) => <td key={k} className="py-1 pe-3 tabular-nums">{show(v, k)}</td>)}</tr>)}</tbody></table></div></details>)}
      {canReview && (open ? (
        <div className="mt-3 flex flex-col gap-2">
          <div className="flex flex-wrap gap-3 text-sm" role="radiogroup" aria-label="Disposition">{(Object.keys(DISP) as (keyof typeof DISP)[]).map((k) =>
            <label key={k} className="flex items-center gap-1"><input type="radio" name={`d-${s.key}`} checked={disp === k} onChange={() => setDisp(k)} /> {DISP[k]}</label>)}</div>
          <textarea className="min-h-14 rounded-md border bg-background p-2 text-sm" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What did you check and what did you find? (at least 10 characters)" aria-label={`Review note for ${s.title}`} />
          <div className="flex gap-2"><Button size="sm" type="button" disabled={note.trim().length < 10} onClick={save}>Save review</Button><Button size="sm" variant="ghost" type="button" onClick={() => setOpen(false)}>Cancel</Button></div>
        </div>) : <Button size="sm" variant="outline" type="button" className="mt-3" onClick={() => setOpen(true)} data-testid={`review-${s.key}`}>Record a review</Button>)}
      {msg && <p role="status" className={`mt-1 text-sm ${msg.ok ? "text-success" : "text-danger"}`}>{msg.text}</p>}
    </li>);
}
