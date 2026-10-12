"use client";
import { useActionState } from "react";
import Link from "next/link";
import { tokenAction } from "@/app/actions/account";
import type { ActionState } from "@/app/actions/member";

export function TokenConfirm({ token, kind, button, done, failed }: { token: string; kind: "email" | "subscribe" | "unsubscribe"; button: string;
  done: [string, string]; failed: Record<string, [string, string]> }) {
  const [s, action, pending] = useActionState<ActionState, FormData>(tokenAction, { ok: false, message: "" });
  if (s.message) {
    const [h, p] = s.ok ? done : failed[s.message] ?? failed.invalid;
    return <div data-testid={`token-${kind}-${s.ok ? "ok" : s.message}`}><h2 className="text-2xl font-extrabold">{h}</h2><p className="mt-2 text-muted-foreground">{p}</p>
      <Link href="/account" className="btn btn-primary mt-6">Your account</Link></div>;
  }
  return <form action={action}><input type="hidden" name="token" value={token} /><input type="hidden" name="kind" value={kind} />
    <button className="btn btn-primary" disabled={pending} data-testid={`token-${kind}-button`}>{pending ? "Working…" : button}</button></form>;
}
