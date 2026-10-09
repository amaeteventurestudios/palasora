"use client";
import { useActionState } from "react";
import { requestCorrection, type ActionState } from "@/app/actions/member";

export function CorrectionForm({ story }: { story: string }) {
  const [s, a, p] = useActionState<ActionState, FormData>(requestCorrection, { ok: false, message: "" });
  if (s.ok) return <p role="status" className="rounded-xl bg-card-muted p-4 font-semibold">{s.message}</p>;
  return (
    <form action={a} className="flex flex-col gap-4">
      <div><label className="field-label" htmlFor="story_url">Story link</label><input id="story_url" name="story_url" defaultValue={story} maxLength={2000} className="input" /></div>
      <div><label className="field-label" htmlFor="issue">What needs correction?</label><textarea id="issue" name="issue" rows={4} required maxLength={4000} className="input" /></div>
      <div><label className="field-label" htmlFor="evidence_url">Supporting link (optional)</label><input id="evidence_url" name="evidence_url" type="url" maxLength={2000} className="input" /></div>
      <div><label className="field-label" htmlFor="contact_email">Email (optional)</label><input id="contact_email" name="contact_email" type="email" maxLength={200} className="input" /></div>
      {s.message && <p role="alert" className="text-sm text-danger">{s.message}</p>}
      <button className="btn btn-primary self-start" disabled={p}>Submit correction request</button>
    </form>
  );
}
