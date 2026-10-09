"use client";
import { useActionState } from "react";
import Link from "next/link";
import { signIn, signUp, type ActionState } from "@/app/actions/member";

export function SignInForm({ next }: { next: string }) {
  const [s, action, pending] = useActionState<ActionState, FormData>(signIn, { ok: false, message: "" });
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />
      <div><label className="field-label" htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="email" required className="input" /></div>
      <div><label className="field-label" htmlFor="password">Password</label><input id="password" name="password" type="password" autoComplete="current-password" required className="input" /></div>
      {s.message && <p role="alert" className="text-sm text-danger">{s.message}</p>}
      <button className="btn btn-primary" disabled={pending} type="submit">{pending ? "Signing in…" : "Continue with email"}</button>
      <p className="text-sm">New here? <Link className="link" href={`/auth/sign-up?next=${encodeURIComponent(next)}`}>Create an account</Link></p>
    </form>
  );
}

export function SignUpForm({ next }: { next: string }) {
  const [s, action, pending] = useActionState<ActionState, FormData>(signUp, { ok: false, message: "" });
  const err = (f: string) => (s.field === f ? s.message : "");
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="next" value={next} />
      <div><label className="field-label" htmlFor="display_name">Name shown with your comments</label><input id="display_name" name="display_name" maxLength={80} required className="input" aria-invalid={!!err("display_name")} /></div>
      <div><label className="field-label" htmlFor="handle">Handle</label><input id="handle" name="handle" maxLength={30} required pattern="[a-z0-9_]{3,30}" className="input" aria-describedby="handle-hint" aria-invalid={!!err("handle")} />
        <p id="handle-hint" className="meta mt-1">3–30 lowercase letters, numbers or underscores.</p></div>
      <div><label className="field-label" htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="email" required className="input" aria-invalid={!!err("email")} /></div>
      <div><label className="field-label" htmlFor="password">Password</label><input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required className="input" aria-invalid={!!err("password")} /></div>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="agree" className="mt-1 h-5 w-5" required />
        <span>I&apos;ll challenge ideas, not people&apos;s dignity, and follow the <Link className="link" href="/editorial">community and editorial principles</Link>.</span></label>
      {s.message && <p role="alert" className="text-sm text-danger">{s.message}</p>}
      <button className="btn btn-primary" disabled={pending} type="submit">{pending ? "Creating account…" : "Create account"}</button>
      <p className="text-sm">Already have an account? <Link className="link" href={`/auth/sign-in?next=${encodeURIComponent(next)}`}>Log in</Link></p>
    </form>
  );
}
