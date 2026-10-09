"use client";
import { useActionState } from "react";
import type { ActionState } from "@/app/actions/member";

/** Wraps a server action with pending + result status (role checks happen server-side). */
export function AdminForm({ action, children, className = "", submit, confirm, variant = "secondary" }: {
  action: (s: ActionState, f: FormData) => Promise<ActionState>; children?: React.ReactNode; className?: string; submit: string; confirm?: string; variant?: "primary" | "secondary";
}) {
  const [s, a, p] = useActionState(action, { ok: false, message: "" });
  return (
    <form action={a} className={`flex flex-col gap-2 ${className}`} onSubmit={(e) => { if (confirm && !window.confirm(confirm)) e.preventDefault(); }}>
      {children}
      <div className="flex flex-wrap items-center gap-2">
        <button className={`btn btn-${variant} !min-h-[40px] text-sm`} disabled={p}>{p ? "Working…" : submit}</button>
        {s.message && <span role="status" className={`text-sm ${s.ok ? "text-success" : "text-danger"}`}>{s.message}</span>}
      </div>
    </form>
  );
}
