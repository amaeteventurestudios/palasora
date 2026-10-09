"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { postComment, type ActionState } from "@/app/actions/member";
import { AuthSheet } from "./AuthSheet";

const KEY = (id: string, parent = "") => `pv_draft:${id}${parent ? `:${parent}` : ""}`;
const MAX = 4000;

/**
 * Comment editor with draft preservation (T-010): the unsent text lives in sessionStorage,
 * never in a URL, and is restored after sign-in returns the reader here.
 */
export function CommentForm({ pieceId, returnPath, signedIn, verified, parentId = "", label = "Join the discussion" }: {
  pieceId: string; returnPath: string; signedIn: boolean; verified: boolean; parentId?: string; label?: string;
}) {
  const [text, setText] = useState("");
  const [restored, setRestored] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [reqId, setReqId] = useState("");
  const [state, action, pending] = useActionState<ActionState, FormData>(postComment, { ok: false, message: "" });
  const area = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setReqId(crypto.randomUUID());
    try {
      const d = sessionStorage.getItem(KEY(pieceId, parentId));
      if (d) {
        setText(d); setRestored(true);
        // Bring the reader back to their draft after the sign-in round trip.
        requestAnimationFrame(() => { area.current?.scrollIntoView({ block: "center" }); area.current?.focus(); });
      }
    } catch { /* storage blocked */ }
  }, [pieceId, parentId]);
  useEffect(() => {
    try { if (text) sessionStorage.setItem(KEY(pieceId, parentId), text); } catch { /* ignore */ }
  }, [text, pieceId]);
  useEffect(() => {
    if (state.ok) {
      try { sessionStorage.removeItem(KEY(pieceId, parentId)); } catch { /* ignore */ }
      setText(""); setRestored(false); setReqId(crypto.randomUUID());
    }
  }, [state, pieceId]);

  const onSubmit = (e: React.FormEvent) => {
    if (!signedIn) { e.preventDefault(); setSheet(true); }
  };

  return (
    <div>
      <form action={action} onSubmit={onSubmit} className="flex flex-col gap-2" aria-label="Add a comment">
        <input type="hidden" name="piece_id" value={pieceId} />
        <input type="hidden" name="parent_id" value={parentId} />
        <input type="hidden" name="client_request_id" value={reqId} />
        <label htmlFor={`c-${pieceId}-${parentId}`} className="field-label">{label}</label>
        {restored && <p className="text-sm text-muted" role="status">Your unsent comment was restored.</p>}
        <textarea id={`c-${pieceId}-${parentId}`} ref={area} name="text" rows={4} maxLength={MAX} value={text} onChange={(e) => setText(e.target.value)}
          placeholder="Add something helpful to the conversation..." className="input min-h-[110px] resize-y" aria-describedby={`c-hint-${pieceId}-${parentId}`} />
        <div id={`c-hint-${pieceId}-${parentId}`} className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
          <span>Challenge ideas, not people&apos;s dignity. Source factual claims when you can.</span>
          <span aria-live="polite">{text.length}/{MAX}</span>
        </div>
        {signedIn && !verified && <p className="text-sm text-danger" role="note">Confirm your email address to post. Your draft is saved in this tab.</p>}
        <div className="flex items-center gap-3">
          <button type="submit" className="btn btn-primary" disabled={pending || (signedIn && text.trim().length < 2)}>{pending ? "Posting…" : "Post comment"}</button>
          <p role="status" aria-live="polite" className={`text-sm ${state.ok ? "text-success" : "text-danger"}`}>{state.message}</p>
        </div>
      </form>
      <AuthSheet open={sheet} onClose={() => setSheet(false)} next={returnPath} draftNotice={text.trim().length > 0} />
    </div>
  );
}
