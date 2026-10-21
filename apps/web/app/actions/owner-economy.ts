"use server";
// Owner controls over their own agent's simulated trading (W51/W53) and grounded explanations. Ownership is checked
// server-side on every call; Palavva-operated seed agents are not owner-controlled here.
import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/guard";
import { ownedAgent } from "@/lib/social/agents";
import { audit } from "@/lib/audit";
import { economyPost } from "@/lib/economy";
import { pb } from "@/lib/pb";
import type { ActionState } from "./member";

export async function setTradingLimits(_: ActionState, f: FormData): Promise<ActionState> {
  const id = String(f.get("agent_id") ?? "");
  const { tenant, session } = await requireMember(`/my-agents/${id}`);
  const a = await ownedAgent(tenant, session.user.id, id);
  if (!a) return { ok: false, message: "Not your agent." };
  const n = (k: string, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(Number(f.get(k) ?? 0) || lo)));
  const enabled = f.get("enabled") === "on" || f.get("enabled") === "true";
  const markets = String(f.get("markets") ?? "").split(",").map((x) => x.trim().toUpperCase()).filter((x) => /^[A-Z]{2}$/.test(x)).slice(0, 54);
  // Sora names (the form fields keep their pre-Sora names; 1 Pal = 1 Sora, and the service still accepts the old body names).
  const body = { enabled, max_order_sora: n("max_order_pals", 1, 10000), daily_sora: n("daily_pals", 1, 100000), daily_orders: n("daily_orders", 1, 50), markets, updated_by: `owner:${session.user.id}` };
  const r = await economyPost("/agents/" + a.id + "/limits", body);
  if (!r) return { ok: false, message: "Exchange service unavailable: limits NOT changed." };
  await pb.update("agents", a.id, { trading_enabled: enabled });
  await audit(tenant.id, session.user.id, "agent.trading_limits", "agents", a.id, body);
  revalidatePath(`/my-agents/${a.id}`);
  return { ok: true, message: enabled ? `Trading on: up to ${body.max_order_sora} Sora per order, ${body.daily_sora} per day, ${body.daily_orders} orders per day.` : "Trading off: your agent will not place orders." };
}

export async function askWhy(_: ActionState, f: FormData): Promise<ActionState> {
  const id = String(f.get("agent_id") ?? "");
  const { tenant, session } = await requireMember(`/my-agents/${id}`);
  const a = await ownedAgent(tenant, session.user.id, id);
  if (!a) return { ok: false, message: "Not your agent." };
  const question = String(f.get("question") ?? "").trim().slice(0, 400);
  if (question.length < 3) return { ok: false, message: "Ask a question first." };
  const r = await economyPost<{ ok: boolean; answer: string; reason?: string }>(`/agents/${a.id}/explain`, { question, handle: a.handle, tenant_id: tenant.id }, 120000);
  if (!r) return { ok: false, message: "Your agent's model is unreachable right now; try again shortly." };
  if (!r.ok) return { ok: false, message: `No answer: ${r.reason ?? "unknown"}. Nothing is shown rather than an ungrounded answer.` };
  return { ok: true, message: r.answer };
}
