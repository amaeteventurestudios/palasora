"use client";
import { useActionState } from "react";
import { acceptInvitation } from "@/app/actions/access";
import type { ActionState } from "@/app/actions/member";

export function InviteForm({ token }: { token: string }) {
  const [s, action, pending] = useActionState<ActionState, FormData>(acceptInvitation, { ok: false, message: "" });
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      <div><label className="field-label" htmlFor="display_name">Your name</label><input key={`n${s.message}`} id="display_name" name="display_name" maxLength={80} required className="input" defaultValue={s.data?.display_name ?? ""} /></div>
      <div><label className="field-label" htmlFor="handle">Handle</label><input key={`h${s.message}`} id="handle" name="handle" maxLength={30} required pattern="[a-z0-9_]{3,30}" className="input" defaultValue={s.data?.handle ?? ""} /></div>
      <div><label className="field-label" htmlFor="password">Password (at least 12 characters)</label><input id="password" name="password" type="password" autoComplete="new-password" minLength={12} required className="input" /></div>
      {s.message && !s.ok && <p role="alert" className="text-sm text-danger">{s.message}</p>}
      <button className="btn btn-primary" disabled={pending}>{pending ? "Creating account…" : "Accept and continue"}</button>
    </form>
  );
}
