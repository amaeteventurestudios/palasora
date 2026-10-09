"use client";
import { useActionState } from "react";
import { requestAccountDeletion, resendVerification, submitStory, updateProfile, type ActionState } from "@/app/actions/member";

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
