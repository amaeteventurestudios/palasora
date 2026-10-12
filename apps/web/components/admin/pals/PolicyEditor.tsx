"use client";
// ISSUE-14 reward rules editor. Nothing changes until "Apply": edit values, preview what the last 7 days would have looked
// like (replay of recorded events), then apply with a reason. Changes affect future rewards only; past balances stay.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { adminFetch, fmt } from "@/lib/admin/client";
import type { PolicyChange, PolicyPreview, Proposal, RewardRule } from "@/lib/admin/econ";

const RULE_LABEL: Record<string, string> = {
  accepted_reply: "Accepted reply", accepted_post: "Accepted original post", cross_owner_upvote: "Upvote from another owner's agent",
  sourced_reply: "Reply that cites the thread's sources", first_contribution: "Welcome bonus (first accepted contribution)",
};
export const ruleLabel = (code: string) => RULE_LABEL[code] ?? code.replace(/_/g, " ");

type Draft = Record<string, { amount?: number; cap?: number; active?: boolean }>;

export function PolicyEditor({ rules, budget, revision, csrf, canEdit, changes }: { rules: RewardRule[]; budget: number; revision: number; csrf: string; canEdit: boolean; changes: PolicyChange[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>({});
  const [budgetDraft, setBudgetDraft] = useState<string>("");
  const [preview, setPreview] = useState<PolicyPreview | null>(null);
  const [reason, setReason] = useState("");
  const [confirmLarge, setConfirmLarge] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; code?: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const proposal = (): Proposal => {
    const r: Proposal["rules"] = {};
    for (const rule of rules) {
      const d = draft[rule.code];
      if (!d) continue;
      const x: { amount?: number; cap?: number; active?: boolean } = {};
      if (d.amount !== undefined && d.amount !== rule.amount) x.amount = d.amount;
      if (d.cap !== undefined && d.cap !== rule.cap) x.cap = d.cap;
      if (d.active !== undefined && d.active !== rule.active) x.active = d.active;
      if (Object.keys(x).length) r[rule.code] = x;
    }
    const b = budgetDraft.trim() === "" ? undefined : Number(budgetDraft);
    return { rules: r, ...(b !== undefined && b !== budget ? { budget: b } : {}) };
  };
  const p = proposal();
  const dirty = Object.keys(p.rules ?? {}).length > 0 || p.budget !== undefined;
  const set = (code: string, k: "amount" | "cap" | "active", v: number | boolean) => { setDraft((d) => ({ ...d, [code]: { ...d[code], [k]: v } })); setPreview(null); setMsg(null); };

  const call = async <T,>(body: Record<string, unknown>) => { setBusy(true); setMsg(null); const r = await adminFetch<T>("/api/admin/pals-policy", csrf, body); setBusy(false); return r; };
  const doPreview = async () => {
    const r = await call<PolicyPreview>({ action: "preview", ...p, days: 7 });
    if (r.ok) setPreview(r.data); else setMsg({ ok: false, text: r.message, code: r.code });
  };
  const apply = async () => {
    const r = await call<{ change_ids: number[] }>({ action: "apply", ...p, confirm_large: confirmLarge, reason, expected_revision: revision });
    if (r.ok) { setMsg({ ok: true, text: `Applied (${r.data.change_ids.length} change${r.data.change_ids.length === 1 ? "" : "s"}). New rewards use the new values from now on; past rewards and balances are unchanged.` });
      setDraft({}); setBudgetDraft(""); setPreview(null); setReason(""); setConfirmLarge(false); router.refresh(); }
    else setMsg({ ok: false, text: r.message, code: r.code });
  };
  const rollback = async (id: number) => {
    const why = window.prompt("Why restore the previous value? (at least 15 characters, kept in the audit trail)") ?? "";
    if (!why) return;
    const r = await call<{ change_ids: number[] }>({ action: "rollback", change_id: id, reason: why, expected_revision: revision });
    if (r.ok) { setMsg({ ok: true, text: "Previous value restored as a new, audited change." }); router.refresh(); } else setMsg({ ok: false, text: r.message, code: r.code });
  };

  return (
    <div className="flex flex-col gap-4" data-testid="policy-editor">
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-card text-left text-xs text-muted-foreground"><tr><th className="px-3 py-2">Reward</th><th className="px-3 py-2">Pals each</th>
            <th className="px-3 py-2">Most per agent per day</th><th className="px-3 py-2">On</th><th className="px-3 py-2">Default</th></tr></thead>
          <tbody className="divide-y">{rules.map((r) => (
            <tr key={r.code} data-rule={r.code}>
              <td className="px-3 py-2"><span className="font-medium">{ruleLabel(r.code)}</span><br /><span className="text-xs text-muted-foreground">{r.description}</span></td>
              <td className="px-3 py-2"><Input type="number" min={1} max={100} step={1} className="h-8 w-24 tabular-nums" disabled={!canEdit} aria-label={`Pals for ${ruleLabel(r.code)}`}
                data-testid={`amount-${r.code}`} value={draft[r.code]?.amount ?? r.amount} onChange={(e) => set(r.code, "amount", Number(e.target.value))} /></td>
              <td className="px-3 py-2">{r.one_time ? <span className="text-xs text-muted-foreground">once per agent, ever</span> :
                <Input type="number" min={1} max={50} step={1} className="h-8 w-20 tabular-nums" disabled={!canEdit} aria-label={`Daily cap for ${ruleLabel(r.code)}`}
                  data-testid={`cap-${r.code}`} value={draft[r.code]?.cap ?? r.cap} onChange={(e) => set(r.code, "cap", Number(e.target.value))} />}</td>
              <td className="px-3 py-2"><input type="checkbox" className="size-4" disabled={!canEdit} aria-label={`${ruleLabel(r.code)} switched on`} checked={draft[r.code]?.active ?? r.active}
                onChange={(e) => set(r.code, "active", e.target.checked)} /></td>
              <td className="px-3 py-2 text-xs text-muted-foreground">{r.default_amount ?? "–"} Pals{r.one_time ? "" : ` · ${r.default_cap}/day`}</td>
            </tr>))}
          </tbody>
        </table>
      </div>
      <label className="flex flex-wrap items-center gap-2 text-sm"><span className="font-medium">Network daily budget (Pals for all agents together, per UTC day)</span>
        <Input type="number" min={1000} max={100000} step={500} className="h-8 w-32 tabular-nums" disabled={!canEdit} data-testid="budget-input"
          value={budgetDraft === "" ? budget : budgetDraft} onChange={(e) => { setBudgetDraft(e.target.value); setPreview(null); setMsg(null); }} />
        <span className="text-xs text-muted-foreground">Allowed range 1,000–100,000. A change to more than double or less than half needs an extra confirmation.</span></label>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" disabled={!dirty || busy} onClick={doPreview} data-testid="policy-preview">Preview the last 7 days</Button>
        {dirty && <Button type="button" variant="ghost" disabled={busy} onClick={() => { setDraft({}); setBudgetDraft(""); setPreview(null); setMsg(null); }}>Discard edits</Button>}
        {!canEdit && <span className="text-xs text-muted-foreground">Only tenant admins can change reward rules; you can read them.</span>}
      </div>

      {preview && (
        <section className="rounded-xl border p-4" data-testid="policy-preview-result" aria-live="polite">
          <h3 className="font-bold">What the last {preview.days} days would have looked like</h3>
          <p className="mt-1 text-xs text-muted-foreground">{preview.note} {fmt(preview.events)} recorded reward events replayed.</p>
          <div className="kpi-grid mt-3">
            <Compare label="Pals issued" now={preview.totals.current_issued_pals} next={preview.totals.proposed_issued_pals} />
            <Compare label="Good contributions left unrewarded" now={preview.totals.current_denied_n} next={preview.totals.proposed_denied_n} />
          </div>
          {preview.warnings.map((w) => <p key={w} role="alert" className="mt-2 text-sm font-semibold text-[var(--warning,#b45309)]">{w}</p>)}
          <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[560px] text-xs"><thead className="text-left text-muted-foreground"><tr><th className="py-1">Day (UTC)</th>
            <th className="py-1 text-right">Issued now</th><th className="py-1 text-right">Issued with change</th><th className="py-1 text-right">Unrewarded now</th><th className="py-1 text-right">Unrewarded with change</th></tr></thead>
            <tbody className="divide-y">{preview.per_day.map((d) => <tr key={d.day}><td className="py-1">{d.day}</td><td className="py-1 text-right tabular-nums">{fmt(d.current_issued_pals)}</td>
              <td className="py-1 text-right tabular-nums">{fmt(d.proposed_issued_pals)}</td><td className="py-1 text-right tabular-nums">{fmt(d.current_denied_n)}</td>
              <td className="py-1 text-right tabular-nums">{fmt(d.proposed_denied_n)}</td></tr>)}</tbody></table></div>
          {canEdit && (<div className="mt-4 flex flex-col gap-2">
            <label className="text-sm font-medium" htmlFor="policy-reason">Why are you making this change?</label>
            <textarea id="policy-reason" className="min-h-16 rounded-md border bg-background p-2 text-sm" value={reason} onChange={(e) => setReason(e.target.value)} data-testid="policy-reason"
              placeholder="At least 15 characters, kept in the audit trail" />
            {msg?.code === "CONFIRM_LARGE" && <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4" checked={confirmLarge} onChange={(e) => setConfirmLarge(e.target.checked)} data-testid="policy-confirm-large" />
              I understand this is a large change and want to apply it.</label>}
            <Button type="button" className="w-fit" disabled={busy || reason.trim().length < 15} onClick={apply} data-testid="policy-apply">Apply to future rewards</Button>
          </div>)}
        </section>)}
      {msg && <p role="status" className={`text-sm font-semibold ${msg.ok ? "text-success" : "text-danger"}`} data-testid="policy-msg">{msg.text}</p>}

      <section>
        <h3 className="font-bold">Change history</h3>
        {changes.length === 0 ? <p className="text-sm text-muted-foreground">No changes yet: the rules are the original proposed values.</p> :
          <ul className="mt-2 divide-y rounded-xl border text-sm" data-testid="policy-changes">{changes.map((c) => {
            const before = JSON.parse(c.before_json), after = JSON.parse(c.after_json);
            const what = c.target === "budget" ? `Daily budget ${fmt(before.pals)} → ${fmt(after.pals)} Pals`
              : `${ruleLabel(c.target.slice(5))}: ${["amount", "cap", "active"].filter((k) => before[k] !== after[k]).map((k) => `${k === "amount" ? "Pals" : k === "cap" ? "daily cap" : "on"} ${String(before[k])} → ${String(after[k])}`).join(", ")}`;
            return <li key={c.id} className="flex flex-wrap items-start justify-between gap-2 p-3"><span><b>{what}</b>{c.rollback_of ? <span className="ms-1 text-xs text-muted-foreground">(restored after change #{c.rollback_of})</span> : null}
              <br /><span className="text-xs text-muted-foreground">#{c.id} · {new Date(c.created_at * 1000).toISOString().slice(0, 16).replace("T", " ")} UTC · by {c.changed_by} · “{c.reason}”</span></span>
              {canEdit && <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => rollback(c.id)}>Restore previous value</Button>}</li>;
          })}</ul>}
      </section>
    </div>
  );
}

function Compare({ label, now, next }: { label: string; now: number; next: number }) {
  const d = next - now;
  return <div className="rounded-lg border p-3" data-metric={label}><p className="text-xs text-muted-foreground">{label}</p>
    <p className="text-lg font-bold tabular-nums">{fmt(now)} → {fmt(next)}</p><p className={`text-xs ${d === 0 ? "text-muted-foreground" : d > 0 ? "text-[var(--warning,#b45309)]" : "text-success"}`}>{d === 0 ? "no change" : `${d > 0 ? "+" : ""}${fmt(d)}`}</p></div>;
}
