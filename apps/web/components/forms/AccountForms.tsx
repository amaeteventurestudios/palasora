"use client";
import { useActionState } from "react";
import { requestAccountDeletion, resendVerification, submitStory, updateProfile, type ActionState } from "@/app/actions/member";
import { cancelEmailChange, changePassword, requestEmailChange, saveNewsletterPrefs, signOutOtherSessions } from "@/app/actions/account";

const init: ActionState = { ok: false, message: "" };
const Status = ({ s }: { s: ActionState }) => s.message ? <p role="status" className={`text-sm ${s.ok ? "text-success" : "text-danger"}`}>{s.message}</p> : null;

export function ProfileForm({ name, bio }: { name: string; bio: string }) {
  const [s, a, p] = useActionState(updateProfile, init);
  return (
    <form action={a} className="flex flex-col gap-3">
      <div><label className="field-label" htmlFor="dn">Display name</label><input id="dn" name="display_name" defaultValue={name} maxLength={80} className="input" /></div>
      <div><label className="field-label" htmlFor="bio">Public bio</label><textarea id="bio" name="bio" defaultValue={bio} maxLength={500} rows={3} className="input" /></div>
      <Status s={s} /><button className="btn btn-primary self-start" disabled={p}>Save profile</button>
    </form>
  );
}
export function ResendVerification() {
  const [s, a, p] = useActionState(async () => resendVerification(), init);
  return <form action={a} className="flex items-center gap-3"><button className="btn btn-secondary" disabled={p}>Send a new confirmation link</button><Status s={s} /></form>;
}
export function DeleteAccountForm() {
  const [s, a, p] = useActionState(requestAccountDeletion, init);
  return (
    <form action={a} className="flex flex-col gap-3">
      <label className="field-label" htmlFor="confirm">Type DELETE to deactivate your account</label>
      <input id="confirm" name="confirm" className="input max-w-xs" autoComplete="off" />
      <Status s={s} /><button className="btn btn-secondary self-start" disabled={p}>Delete my account</button>
    </form>
  );
}
export function SubmitForm() {
  const [s, a, p] = useActionState(submitStory, init);
  return (
    <form action={a} className="flex flex-col gap-4">
      <fieldset className="flex gap-4"><legend className="field-label">What are you sending?</legend>
        <label className="flex items-center gap-2"><input type="radio" name="kind" value="story" defaultChecked />A story or source</label>
        <label className="flex items-center gap-2"><input type="radio" name="kind" value="business" />A business or product</label></fieldset>
      <div><label className="field-label" htmlFor="su">Original link</label><input id="su" name="source_url" type="url" required placeholder="https://" className="input" /></div>
      <div><label className="field-label" htmlFor="sr">Why does it matter?</label><textarea id="sr" name="reason" rows={3} maxLength={3000} className="input" /></div>
      <div><label className="field-label" htmlFor="sc">Claims we should check (optional)</label><textarea id="sc" name="claim_notes" rows={2} maxLength={3000} className="input" /></div>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="rights_attestation" className="mt-1 h-5 w-5" />
        <span>I&apos;m sharing a public link or material I have the right to share. Submitting doesn&apos;t guarantee a feature.</span></label>
      <Status s={s} /><button className="btn btn-primary self-start" disabled={p}>Send for review</button>
    </form>
  );
}

// ---- ISSUE-24 account security and preferences

export function ChangePasswordForm() {
  const [s, a, p] = useActionState(changePassword, init);
  return (
    <form action={a} className="flex flex-col gap-3" data-testid="change-password">
      <div><label className="field-label" htmlFor="cpw">Current password</label><input id="cpw" name="current_password" type="password" autoComplete="current-password" required className="input max-w-sm" /></div>
      <div><label className="field-label" htmlFor="npw">New password (at least 10 characters)</label><input id="npw" name="new_password" type="password" autoComplete="new-password" minLength={10} required className="input max-w-sm" /></div>
      <div><label className="field-label" htmlFor="npw2">Type the new password again</label><input id="npw2" name="confirm_password" type="password" autoComplete="new-password" minLength={10} required className="input max-w-sm" /></div>
      <Status s={s} /><button className="btn btn-primary self-start" disabled={p}>{p ? "Saving…" : "Change password"}</button>
    </form>
  );
}
export function ChangeEmailForm({ pending }: { pending: string }) {
  const [s, a, p] = useActionState(requestEmailChange, init);
  const [c, ca, cp] = useActionState(async () => cancelEmailChange(), init);
  return (
    <div className="flex flex-col gap-3" data-testid="change-email">
      {pending && <form action={ca} className="rounded-lg border p-3 text-sm">Waiting for <b>{pending}</b> to be confirmed. Nothing changes until the link in that inbox is used.
        <button className="link ms-2" disabled={cp}>Cancel the change</button><Status s={c} /></form>}
      <form action={a} className="flex flex-col gap-3">
        <div><label className="field-label" htmlFor="nem">New email address</label><input id="nem" name="new_email" type="email" autoComplete="email" required className="input max-w-sm" /></div>
        <div><label className="field-label" htmlFor="epw">Your password</label><input id="epw" name="password" type="password" autoComplete="current-password" required className="input max-w-sm" /></div>
        <Status s={s} /><button className="btn btn-secondary self-start" disabled={p}>{p ? "Sending…" : "Send confirmation to the new address"}</button>
      </form>
    </div>
  );
}
export function SignOutOthers() {
  const [s, a, p] = useActionState(async () => signOutOtherSessions(), init);
  return <form action={a} className="flex flex-wrap items-center gap-3"><button className="btn btn-secondary" disabled={p}>Sign out all other devices</button><Status s={s} /></form>;
}
export function NewsletterForm({ lists }: { lists: { key: string; name: string; status: string }[] }) {
  const [s, a, p] = useActionState(saveNewsletterPrefs, init);
  return (
    <form action={a} className="flex flex-col gap-3" data-testid="newsletter-prefs">
      {lists.map((l) => <label key={l.key} className="flex items-center gap-2 text-sm"><input type="checkbox" name={`list_${l.key}`} defaultChecked={l.status === "confirmed" || l.status === "pending"} className="h-5 w-5" />
        <span>{l.name} <span className="text-xs text-muted-foreground">({l.status === "confirmed" ? "subscribed" : l.status === "pending" ? "waiting for you to confirm by email" : "not subscribed"})</span></span></label>)}
      <Status s={s} /><button className="btn btn-secondary self-start" disabled={p}>Save newsletter choices</button>
    </form>
  );
}
