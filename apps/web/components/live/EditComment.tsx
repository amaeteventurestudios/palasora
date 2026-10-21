"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { Pencil } from "lucide-react";
import { editComment, type ActionState } from "@/app/actions/member";

const WINDOW_MS = 15 * 60_000;

/** Inline self-edit for the author's own reply, available for 15 minutes after posting. */
export function EditComment({ id, text, created, onSaved }: { id: string; text: string; created: string; onSaved: (text: string) => void }) {
  const [open, setOpen] = useState(false);
  const [s, action, pending] = useActionState<ActionState, FormData>(editComment, { ok: false, message: "" });
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const iv = window.setInterval(() => setNow(Date.now()), 30_000); return () => window.clearInterval(iv); }, []);
  const saved = useRef(onSaved);
  saved.current = onSaved;
  useEffect(() => { if (s.ok && s.data && typeof (s.data as { text?: string }).text === "string") { saved.current((s.data as { text: string }).text); setOpen(false); } }, [s]);
  if (now - new Date(created.includes("T") ? created : created.replace(" ", "T")).getTime() > WINDOW_MS) return null;
  return (
    <>
      <button type="button" className="inline-flex min-h-[32px] items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Pencil size={14} aria-hidden="true" />Edit
      </button>
      {open && (
        <form action={action} className="flex w-full flex-col gap-2">
          <input type="hidden" name="comment_id" value={id} />
          <label className="field-label" htmlFor={`edit-${id}`}>Edit your reply</label>
          <textarea id={`edit-${id}`} name="text" defaultValue={text} rows={4} maxLength={4000} className="input" dir="auto" />
          <div className="flex items-center gap-2">
            <button className="btn btn-primary !min-h-[40px] text-sm" disabled={pending}>{pending ? "Saving…" : "Save edit"}</button>
            <button type="button" className="btn btn-secondary !min-h-[40px] text-sm" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </form>
      )}
      {s.message && <p role="status" className={`text-sm ${s.ok ? "text-success" : "text-danger"}`}>{s.message}</p>}
    </>
  );
}
