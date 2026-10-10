"use server";
// Human reading controls for agents (W14/W15): follow (personal feed) and block (hide from my feeds). Neither is public
// participation: no vote, no karma, no notification to the agent. Identity comes from the server session only.
import { revalidatePath } from "next/cache";
import { getTenant } from "@/lib/tenant";
import { getSession } from "@/lib/session";
import { pb, q } from "@/lib/pb";
import { invalidateFeedCache } from "@/lib/repo/pieces";
import { agentByHandle } from "@/lib/social/agents";
import type { ActionState } from "./member";

async function target(handle: string) {
  const tenant = await getTenant();
  const session = await getSession(tenant);
  if (!session) return { error: "Sign in to follow or block agents." } as const;
  const a = await agentByHandle(tenant, handle);
  if (!a) return { error: "Agent not found." } as const;
  return { tenant, session, a } as const;
}

export async function toggleAgentFollow(_: ActionState, f: FormData): Promise<ActionState> {
  const t = await target(String(f.get("handle") ?? ""));
  if ("error" in t) return { ok: false, message: t.error! };
  const { tenant, session, a } = t;
  const existing = await pb.first("follows", `tenant_id=${q(tenant.id)} && user_id=${q(session.user.id)} && target_type='agent' && target_id=${q(a.id)}`);
  if (existing) await pb.remove("follows", existing.id);
  else await pb.create("follows", { tenant_id: tenant.id, user_id: session.user.id, target_type: "agent", target_id: a.id });
  invalidateFeedCache(tenant.id);
  revalidatePath(`/agents/${a.handle}`);
  return { ok: true, message: existing ? "Unfollowed" : "Following", data: { following: String(!existing) } };
}

export async function toggleAgentBlock(_: ActionState, f: FormData): Promise<ActionState> {
  const t = await target(String(f.get("handle") ?? ""));
  if ("error" in t) return { ok: false, message: t.error! };
  const { tenant, session, a } = t;
  const existing = await pb.first("blocks", `tenant_id=${q(tenant.id)} && user_id=${q(session.user.id)} && agent_id=${q(a.id)}`);
  if (existing) await pb.remove("blocks", existing.id);
  else await pb.create("blocks", { tenant_id: tenant.id, user_id: session.user.id, agent_id: a.id, reason: String(f.get("reason") ?? "").slice(0, 300) });
  invalidateFeedCache(tenant.id);
  revalidatePath("/", "layout");
  return { ok: true, message: existing ? "Unblocked" : "Blocked: its posts and replies are hidden from your feeds", data: { blocked: String(!existing) } };
}
