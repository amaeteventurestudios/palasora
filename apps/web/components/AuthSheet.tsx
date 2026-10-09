"use client";
import { useActionState, useEffect, useId, useRef } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { signIn, type ActionState } from "@/app/actions/member";
import { JsFlag, useNavigateOnSuccess } from "./AuthNav";

/** Accessible sign-in dialog (S09). Native <dialog> gives focus trapping and Esc; focus returns to the opener. */
export function AuthSheet({ open, onClose, next, draftNotice }: { open: boolean; onClose: () => void; next: string; draftNotice: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const uid = useId();
  const opener = useRef<Element | null>(null);
  const [state, action, pending] = useActionState<ActionState, FormData>(signIn, { ok: false, message: "" });
  useNavigateOnSuccess(state);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) { opener.current = document.activeElement; d.showModal(); }
    if (!open && d.open) { d.close(); (opener.current as HTMLElement | null)?.focus?.(); }
  }, [open]);
  return (
    <dialog ref={ref} onClose={onClose} aria-labelledby={`${uid}-title`} className="m-auto w-[min(92vw,440px)] rounded-2xl border border-border bg-card p-0 text-foreground backdrop:bg-black/50">
      <div className="p-6">
        <div className="flex items-start justify-between gap-4">
          <h2 id={`${uid}-title`} className="text-xl font-bold">Join the conversation.</h2>
          <button type="button" onClick={onClose} className="btn btn-ghost !min-h-[40px] !px-2" aria-label="Close"><X size={20} aria-hidden="true" /></button>
        </div>
        <p className="mt-1 text-sm text-muted">You can read and share freely. Sign in to comment, vote, follow, and save across devices.</p>
        {draftNotice && <p className="mt-3 rounded-lg bg-card-muted p-3 text-sm" role="note">We&apos;ll keep your comment here while you sign in.</p>}
        <form action={action} className="mt-4 flex flex-col gap-3">
          <input type="hidden" name="next" value={next} /><JsFlag />
          <div><label className="field-label" htmlFor={`${uid}-email`}>Email</label><input id={`${uid}-email`} name="email" type="email" autoComplete="email" required className="input" /></div>
          <div><label className="field-label" htmlFor={`${uid}-pw`}>Password</label><input id={`${uid}-pw`} name="password" type="password" autoComplete="current-password" required className="input" /></div>
          {state.message && !state.ok && <p role="alert" className="text-sm text-danger">{state.message}</p>}
          <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "Signing in…" : "Continue with email"}</button>
        </form>
        <p className="mt-4 text-sm">New here? <Link className="link" href={`/auth/sign-up?next=${encodeURIComponent(next)}`}>Create an account</Link></p>
        <button type="button" onClick={onClose} className="mt-2 text-sm link">Return to story</button>
      </div>
    </dialog>
  );
}
