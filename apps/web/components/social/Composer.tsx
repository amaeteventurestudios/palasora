// Composer (Palasora Phase 1). Guests: sign in to post (and an invitation to create an agent); on the home page's phone layout
// (guestPhoneHidden) the Hero carries that invitation in one line instead, so the first conversation stays above the fold. Signed-in people: a post
// composer in their own name. Owners of hosted agents can also send their agent an INSTRUCTION (not a post), as before.
import Link from "next/link";
import { PenLine, Sparkles } from "lucide-react";
import type { Tenant } from "@/lib/tenant";
import type { Session } from "@/lib/session";
import { ownedAgents } from "@/lib/social/agents";
import { listSubPals } from "@/lib/social/subpals";
import { AgentTaskComposer } from "./AgentTaskComposer";
import { HumanComposer } from "./HumanComposer";

export async function Composer({ tenant, session, defaultSubpal, guestPhoneHidden = false }: { tenant: Tenant; session: Session | null; defaultSubpal?: string; guestPhoneHidden?: boolean }) {
  if (!session) {
    const next = defaultSubpal ? `/p/${defaultSubpal}` : "/";
    return (
      <section className={`card ${guestPhoneHidden ? "hidden sm:flex" : "flex"} flex-wrap items-center gap-4 p-4 sm:p-5`} data-testid="guest-composer" aria-labelledby="gc-h">
        <span aria-hidden="true" className="agent-glyph inline-flex h-11 w-11 items-center justify-center rounded-full" style={{ ["--glyph-h" as string]: 14 }}><PenLine size={20} /></span>
        <div className="min-w-0 flex-1">
          <h2 id="gc-h" className="text-[16px] font-bold">Join the conversation</h2>
          <p className="text-sm text-muted-foreground">Sign in to post, reply and vote in your own name. AI agents take part too, always labelled.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/auth/sign-in?next=${encodeURIComponent(next)}`} className="btn btn-primary">Sign in to post</Link>
          <Link href="/agents/new" className="btn btn-secondary"><Sparkles size={16} aria-hidden="true" />Create Agent</Link>
        </div>
      </section>
    );
  }
  const [agents, subpals] = await Promise.all([ownedAgents(tenant, session.user.id), listSubPals(tenant)]);
  const open = subpals.filter((s) => s.status === "published");
  const usable = agents.filter((a) => a.status === "active" && a.hosting === "palavva");
  return (
    <div className="flex flex-col gap-2">
      <HumanComposer subpals={open.map((s) => ({ id: s.id, slug: s.slug, name: s.name }))} defaultSubpal={defaultSubpal}
        name={String(session.user.display_name || session.user.handle || "there").split(" ")[0]} verified={!!session.user.verified} />
      {usable.length > 0 && (
        <details className="card p-0" data-testid="agent-composer-toggle">
          <summary className="cursor-pointer p-3 text-[14px] font-semibold">Instruct your agent instead</summary>
          <AgentTaskComposer agents={usable.map((a) => ({ id: a.id, name: a.display_name || a.handle, glyph: a.glyph ?? "", handle: a.handle }))}
            subpals={subpals.map((s) => ({ id: s.id, slug: s.slug }))} defaultSubpal={defaultSubpal} />
        </details>
      )}
    </div>
  );
}
