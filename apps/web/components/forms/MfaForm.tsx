"use client";
import { useActionState, useState, useTransition } from "react";
import { startMfaEnrolment, verifyMfa } from "@/app/actions/access";
import type { ActionState } from "@/app/actions/member";

const init: ActionState = { ok: false, message: "" };

export function MfaForm({ enrolled, next }: { enrolled: boolean; next: string }) {
  const [setup, setSetup] = useState<{ secret: string; account: string } | null>(null);
  const [setupMsg, setSetupMsg] = useState("");
  const [starting, start] = useTransition();
  const [s, action, pending] = useActionState(verifyMfa, init);
  const [useRecovery, setUseRecovery] = useState(false);
  if (s.ok && s.data?.codes) {
    return (
      <div className="flex flex-col gap-3" data-testid="mfa-recovery-codes">
        <p role="status" className="font-semibold text-success">{s.message}</p>
        <ul className="grid grid-cols-2 gap-2 font-mono text-sm">{s.data.codes.split(" ").map((c) => <li key={c} className="rounded border p-2 text-center">{c}</li>)}</ul>
        <a className="btn btn-primary self-start" href={s.data.next} data-testid="mfa-continue">I saved them — continue</a>
      </div>
    );
  }
  if (s.ok && s.data?.next && typeof window !== "undefined") window.location.assign(s.data.next);
  if (!enrolled && !setup) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm">Step 1: open your authenticator app and choose <b>Add account → Enter a setup key</b>. Then press the button below to get your key.</p>
        <button className="btn btn-primary self-start" disabled={starting} data-testid="mfa-start" onClick={() => start(async () => {
          const r = await startMfaEnrolment();
          if (r.ok && r.data) setSetup({ secret: r.data.secret, account: r.data.account }); else setSetupMsg(r.message);
        })}>{starting ? "Creating key…" : "Show my setup key"}</button>
        {setupMsg && <p role="alert" className="text-sm text-danger">{setupMsg}</p>}
      </div>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />
      {setup && <div className="rounded-lg border bg-card-muted p-3 text-sm">
        <p>Account name: <b>{setup.account}</b> · Type: <b>time-based</b></p>
        <p className="mt-1">Setup key (shown only now):</p>
        <p className="mt-1 break-all font-mono text-base tracking-wider" data-testid="mfa-secret">{setup.secret}</p>
      </div>}
      {!useRecovery ? <div><label className="field-label" htmlFor="code">6-digit code from your app</label>
        <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required className="input max-w-[12rem] font-mono text-lg tracking-widest" data-testid="mfa-code" /></div>
        : <div><label className="field-label" htmlFor="recovery">Recovery code</label><input id="recovery" name="recovery" autoComplete="off" required className="input max-w-[14rem] font-mono" /></div>}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="trust" className="h-5 w-5" data-testid="mfa-trust" />
        Trust this browser for 12 hours (do not tick on a shared computer)</label>
      {s.message && !s.ok && <p role="alert" className="text-sm text-danger">{s.message}</p>}
      <button className="btn btn-primary self-start" disabled={pending} data-testid="mfa-submit">{pending ? "Checking…" : setup ? "Turn on and continue" : "Continue"}</button>
      {enrolled && <button type="button" className="link self-start text-sm" onClick={() => setUseRecovery((v) => !v)}>{useRecovery ? "Use my authenticator app instead" : "Lost your phone? Use a recovery code"}</button>}
    </form>
  );
}
