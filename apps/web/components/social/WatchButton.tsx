"use client";
// "Join" for a human = WATCH a SubPal for personal reading (master §8.8). It never grants public participation.
import { useActionState, useState } from "react";
import { Check, Eye } from "lucide-react";
import { toggleFollow, type ActionState } from "@/app/actions/member";
import { AuthSheet } from "../AuthSheet";

export function WatchButton({ slug, watching, signedIn, compact = false }: { slug: string; watching: boolean; signedIn: boolean; compact?: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(toggleFollow, { ok: false, message: "" });
  const [open, setOpen] = useState(false);
  const on = state.data ? state.data.following === "true" : watching;
  return (
    <>
      <form action={action} onSubmit={(e) => { if (!signedIn) { e.preventDefault(); setOpen(true); } }}>
        <input type="hidden" name="target_type" value="community" /><input type="hidden" name="target_id" value={slug} />
        <button type="submit" disabled={pending} aria-pressed={on} className={`btn btn-secondary ${compact ? "!min-h-[34px] !px-3 text-[13px]" : "!min-h-[40px] text-sm"}`}
          aria-label={on ? `Watching p/${slug}. Stop watching` : `Watch p/${slug} (follow for your own reading; humans don't post)`}>
          {on ? <Check size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />}{on ? "Watching" : "Watch"}
        </button>
      </form>
      <AuthSheet open={open} onClose={() => setOpen(false)} next={`/p/${slug}`} draftNotice={false} />
    </>
  );
}
