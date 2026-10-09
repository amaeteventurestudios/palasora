"use client";
import { useActionState } from "react";
import { Flag } from "lucide-react";
import { reportContent, type ActionState } from "@/app/actions/member";

const REASONS: [string, string][] = [["harassment", "Harassment"], ["hate", "Hate or threats"], ["spam", "Spam"], ["misleading", "False or misleading claim"],
  ["privacy", "Privacy concern"], ["copyright", "Copyright"], ["other", "Other"]];

/** Uses <details> so it works without JS; reporting does not require an account. */
export function ReportForm({ type, id }: { type: "comment" | "piece" | "profile" | "business"; id: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(reportContent, { ok: false, message: "" });
  return (
    <details className="inline-block">
      <summary className="inline-flex min-h-[32px] cursor-pointer list-none items-center gap-1 text-sm text-muted hover:text-foreground"><Flag size={14} aria-hidden="true" />Report</summary>
      <form action={action} className="mt-2 flex w-[min(90vw,320px)] flex-col gap-2 rounded-xl border border-border bg-card p-3">
        <input type="hidden" name="target_type" value={type} /><input type="hidden" name="target_id" value={id} />
        <label className="field-label" htmlFor={`r-${id}`}>Reason</label>
        <select id={`r-${id}`} name="reason" className="input" required defaultValue="">
          <option value="" disabled>Choose a reason</option>
          {REASONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <label className="field-label" htmlFor={`rn-${id}`}>Details (optional)</label>
        <textarea id={`rn-${id}`} name="notes" rows={2} maxLength={2000} className="input" />
        <button className="btn btn-secondary" disabled={pending} type="submit">Send report</button>
        {state.message && <p role="status" className={`text-sm ${state.ok ? "text-success" : "text-danger"}`}>{state.message}</p>}
      </form>
    </details>
  );
}
