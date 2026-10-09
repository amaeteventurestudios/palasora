"use client";
import { useActionState, useState } from "react";
import { ArrowUp, Bookmark, BookmarkCheck, Plus, Check } from "lucide-react";
import { toggleFollow, toggleSave, toggleVote, type ActionState } from "@/app/actions/member";
import { AuthSheet } from "./AuthSheet";

function useGate(signedIn: boolean) {
  const [open, setOpen] = useState(false);
  const guard = (e: React.FormEvent) => { if (!signedIn) { e.preventDefault(); setOpen(true); } };
  return { open, setOpen, guard };
}

export function VoteButton({ kind, id, score, voted, signedIn, returnPath, label = "Upvote" }: {
  kind: "piece" | "comment"; id: string; score: number; voted: boolean; signedIn: boolean; returnPath: string; label?: string;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(toggleVote, { ok: false, message: "" });
  const g = useGate(signedIn);
  const isVoted = state.data ? state.data.voted === "true" : voted;
  const n = state.data ? Number(state.data.score) : score;
  return (
    <>
      <form action={action} onSubmit={g.guard} className="inline">
        <input type="hidden" name="target_kind" value={kind} /><input type="hidden" name="target_id" value={id} />
        <button type="submit" disabled={pending} aria-pressed={isVoted} className="btn btn-secondary !min-h-[40px] !px-3 text-sm aria-pressed:!border-[var(--primary)]"
          aria-label={`${label}. ${n} human ${n === 1 ? "vote" : "votes"}`}>
          <ArrowUp size={16} aria-hidden="true" /><span>{n}</span>
        </button>
        {state.message && !state.ok && <span role="alert" className="ms-2 text-sm text-danger">{state.message}</span>}
      </form>
      <AuthSheet open={g.open} onClose={() => g.setOpen(false)} next={returnPath} draftNotice={false} />
    </>
  );
}

export function SaveButton({ id, saved, signedIn, returnPath }: { id: string; saved: boolean; signedIn: boolean; returnPath: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(toggleSave, { ok: false, message: "" });
  const g = useGate(signedIn);
  const isSaved = state.data ? state.data.saved === "true" : saved;
  return (
    <>
      <form action={action} onSubmit={g.guard} className="inline">
        <input type="hidden" name="piece_id" value={id} />
        <button type="submit" disabled={pending} aria-pressed={isSaved} className="btn btn-secondary !min-h-[40px] !px-3 text-sm">
          {isSaved ? <BookmarkCheck size={16} aria-hidden="true" /> : <Bookmark size={16} aria-hidden="true" />}{isSaved ? "Saved" : "Save"}
        </button>
      </form>
      <AuthSheet open={g.open} onClose={() => g.setOpen(false)} next={returnPath} draftNotice={false} />
    </>
  );
}

export function FollowButton({ type, id, following, signedIn, returnPath, label }: {
  type: "country" | "topic" | "member" | "community" | "area"; id: string; following: boolean; signedIn: boolean; returnPath: string; label: string;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(toggleFollow, { ok: false, message: "" });
  const g = useGate(signedIn);
  const isF = state.data ? state.data.following === "true" : following;
  return (
    <>
      <form action={action} onSubmit={g.guard} className="inline">
        <input type="hidden" name="target_type" value={type} /><input type="hidden" name="target_id" value={id} />
        <button type="submit" disabled={pending} aria-pressed={isF} className="btn btn-secondary !min-h-[40px] text-sm">
          {isF ? <Check size={16} aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}{isF ? `Following ${label}` : `Follow ${label}`}
        </button>
      </form>
      <AuthSheet open={g.open} onClose={() => g.setOpen(false)} next={returnPath} draftNotice={false} />
    </>
  );
}
