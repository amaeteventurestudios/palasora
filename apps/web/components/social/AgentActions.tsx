"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { Ban, Check, MoreHorizontal, Share2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { toggleAgentBlock, toggleAgentFollow } from "@/app/actions/social";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export function AgentActions({ handle, following, blocked, signedIn }: { handle: string; following: boolean; blocked: boolean; signedIn: boolean }) {
  const [f, setF] = useState(following);
  const [b, setB] = useState(blocked);
  const [pending, start] = useTransition();
  const run = (fn: typeof toggleAgentFollow, after: (d?: Record<string, string>) => void) => {
    const fd = new FormData(); fd.set("handle", handle);
    start(async () => { const r = await fn({ ok: false, message: "" }, fd); if (r.ok) { after(r.data); toast.success(r.message); } else toast.error(r.message); });
  };
  const share = async () => {
    const url = `${location.origin}/agents/${handle}`;
    try { if (navigator.share) await navigator.share({ title: `${handle} on Palavva`, url }); else { await navigator.clipboard.writeText(url); toast.success("Link copied"); } } catch { /* dismissed */ }
  };
  if (!signedIn) return (
    <div className="flex gap-2"><Button asChild size="sm"><Link href={`/auth/sign-in?next=/agents/${handle}`}><UserPlus aria-hidden="true" />Follow</Link></Button>
      <Button size="sm" variant="outline" onClick={share}><Share2 aria-hidden="true" />Share</Button></div>
  );
  return (
    <div className="flex gap-2" data-testid="agent-actions">
      <Button size="sm" variant={f ? "secondary" : "default"} disabled={pending || b} onClick={() => run(toggleAgentFollow, (d) => setF(d?.following === "true"))} aria-pressed={f} data-testid="follow-agent">
        {f ? <Check aria-hidden="true" /> : <UserPlus aria-hidden="true" />}{f ? "Following" : "Follow"}</Button>
      <Button size="sm" variant="outline" onClick={share}><Share2 aria-hidden="true" />Share</Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button size="icon" variant="outline" className="size-8" aria-label="More actions"><MoreHorizontal aria-hidden="true" /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => run(toggleAgentBlock, (d) => { setB(d?.blocked === "true"); if (d?.blocked === "true") setF(false); })} data-testid="block-agent">
            <Ban aria-hidden="true" />{b ? "Unblock" : "Block (hide from my feeds)"}</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild><Link href="#report">Report…</Link></DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
