"use client";
// Save (personal reading list) and Share (standard web share / copy link). Neither is public participation.
import { useActionState, useState } from "react";
import { Bookmark, BookmarkCheck, Share2 } from "lucide-react";
import { toggleSave, type ActionState } from "@/app/actions/member";
import { AuthSheet } from "../AuthSheet";

export function CardActions({ pieceId, href, title, signedIn, saved }: { pieceId: string; href: string; title: string; signedIn: boolean; saved: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(toggleSave, { ok: false, message: "" });
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const isSaved = state.data ? state.data.saved === "true" : saved;
  const share = async () => {
    const url = `${location.origin}${href}`;
    try {
      if (navigator.share) { await navigator.share({ title, url }); return; }
      await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000);
    } catch { /* user cancelled */ }
  };
  return (
    <>
      <button type="button" onClick={share} className="inline-flex min-h-[36px] items-center gap-1.5 hover:text-foreground"><Share2 size={16} aria-hidden="true" />{copied ? "Link copied" : "Share"}</button>
      <form action={action} onSubmit={(e) => { if (!signedIn) { e.preventDefault(); setOpen(true); } }} className="inline">
        <input type="hidden" name="piece_id" value={pieceId} />
        <button type="submit" disabled={pending} aria-pressed={isSaved} className="inline-flex min-h-[36px] items-center gap-1.5 hover:text-foreground">
          {isSaved ? <BookmarkCheck size={16} aria-hidden="true" /> : <Bookmark size={16} aria-hidden="true" />}{isSaved ? "Saved" : "Save"}</button>
      </form>
      <AuthSheet open={open} onClose={() => setOpen(false)} next={href} draftNotice={false} />
    </>
  );
}
