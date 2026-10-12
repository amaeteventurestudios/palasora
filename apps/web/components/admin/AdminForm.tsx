"use client";
import { startTransition, useActionState } from "react";
import type { ActionState } from "@/app/actions/member";

/** Wraps a server action with pending + result status (role checks happen server-side).
 *  With JavaScript, submission goes through the action dispatcher instead of the form's own action so React does not reset the
 *  form: a refused decision keeps the chosen options and the typed reason for the retry (a reset could silently submit defaults).
 *  Without JavaScript the plain form action still works. */
export function AdminForm({ action, children, className = "", submit, confirm, variant = "secondary" }: {
  action: (s: ActionState, f: FormData) => Promise<ActionState>; children?: React.ReactNode; className?: string; submit: string; confirm?: string; variant?: "primary" | "secondary";
}) {
  const [s, a, p] = useActionState(action, { ok: false, message: "" });
  return (
    <form action={a} className={`flex flex-col gap-2 ${className}`} onSubmit={(e) => {
      e.preventDefault();
      if (confirm && !window.confirm(confirm)) return;
      const fd = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
      startTransition(() => a(fd));
    }}>
      {children}
      <div className="flex flex-wrap items-center gap-2">
        <button className={`btn btn-${variant} !min-h-[40px] text-sm`} disabled={p}>{p ? "Working…" : submit}</button>
        {s.message && <span role="status" className={`text-sm ${s.ok ? "text-success" : "text-danger"}`}>{s.message}</span>}
      </div>
    </form>
  );
}
