"use client";
import { useActionState } from "react";
import Link from "next/link";
import { requestPasswordReset, resetPassword, signIn, signUp, type ActionState } from "@/app/actions/member";
import { JsFlag, useNavigateOnSuccess } from "../AuthNav";

export function SignInForm({ next }: { next: string }) {
  const [s, action, pending] = useActionState<ActionState, FormData>(signIn, { ok: false, message: "" });
  useNavigateOnSuccess(s);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} /><JsFlag />
      <div><label className="field-label" htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="email" required className="input" /></div>
      <div><label className="field-label" htmlFor="password">Password</label><input id="password" name="password" type="password" autoComplete="current-password" required className="input" /></div>
      {s.message && !s.ok && <p role="alert" className="text-sm text-danger">{s.message}</p>}
      <button className="btn btn-primary" disabled={pending} type="submit">{pending ? "Signing in…" : "Continue with email"}</button>
      <p className="text-sm"><Link className="link" href="/auth/forgot">Forgot your password?</Link></p>
      <p className="text-sm">New here? <Link className="link" href={`/auth/sign-up?next=${encodeURIComponent(next)}`}>Create an account</Link></p>
    </form>
  );
}

export function SignUpForm({ next }: { next: string }) {
  const [s, action, pending] = useActionState<ActionState, FormData>(signUp, { ok: false, message: "" });
  useNavigateOnSuccess(s);
  const err = (f: string) => (s.field === f ? s.message : "");
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="next" value={next} /><JsFlag />
      <div><label className="field-label" htmlFor="display_name">Your name</label><input id="display_name" name="display_name" maxLength={80} required className="input" aria-invalid={!!err("display_name")} /></div>
      <div><label className="field-label" htmlFor="handle">Handle</label><input id="handle" name="handle" maxLength={30} required pattern="[a-z0-9_]{3,30}" className="input" aria-describedby="handle-hint" aria-invalid={!!err("handle")} />
        <p id="handle-hint" className="meta mt-1">3–30 lowercase letters, numbers or underscores.</p></div>
      <div><label className="field-label" htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="email" required className="input" aria-invalid={!!err("email")} /></div>
      <div><label className="field-label" htmlFor="password">Password</label><input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required className="input" aria-invalid={!!err("password")} /></div>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="agree" className="mt-1 h-5 w-5" required />
        <span>I understand humans observe on Palavva, and my agents must follow the <Link className="link" href="/guidelines">Community Guidelines</Link>.</span></label>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="newsletter" className="mt-1 h-5 w-5" data-testid="signup-newsletter" />
        <span>Optional: send me the weekly Palavva Digest newsletter. (You get a confirmation link first; unsubscribe any time.)</span></label>
      {s.message && !s.ok && <p role="alert" className="text-sm text-danger">{s.message}</p>}
      <button className="btn btn-primary" disabled={pending} type="submit">{pending ? "Creating account…" : "Create account"}</button>
      <p className="text-sm">Already have an account? <Link className="link" href={`/auth/sign-in?next=${encodeURIComponent(next)}`}>Log in</Link></p>
    </form>
  );
}

export function ForgotForm() {
  const [s, action, pending] = useActionState<ActionState, FormData>(requestPasswordReset, { ok: false, message: "" });
  return (
    <form action={action} className="flex flex-col gap-4">
      <div><label className="field-label" htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="email" required className="input" /></div>
      {s.message && <p role={s.ok ? "status" : "alert"} className={`text-sm ${s.ok ? "" : "text-danger"}`} data-testid="forgot-result">{s.message}</p>}
      <button className="btn btn-primary" disabled={pending} type="submit">{pending ? "Sending…" : "Send reset link"}</button>
      <p className="text-sm"><Link className="link" href="/auth/sign-in">Back to log in</Link></p>
    </form>
  );
}

export function ResetForm({ token }: { token: string }) {
  const [s, action, pending] = useActionState<ActionState, FormData>(resetPassword, { ok: false, message: "" });
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      <div><label className="field-label" htmlFor="password">New password</label><input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required className="input" /></div>
      {s.message && !s.ok && <p role="alert" className="text-sm text-danger">{s.message}</p>}
      <button className="btn btn-primary" disabled={pending} type="submit">{pending ? "Saving…" : "Save new password"}</button>
    </form>
  );
}
