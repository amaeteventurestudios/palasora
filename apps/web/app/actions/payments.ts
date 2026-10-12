"use server";
// ISSUE-17 sandbox checkout simulator: sends a SIGNED webhook through the same verification path a real provider uses.
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getTenant } from "@/lib/tenant";
import { getSession } from "@/lib/session";
import { pb, q } from "@/lib/pb";
import { handleWebhook, signedSandboxEvent } from "@/lib/payments/service";
import type { ActionState } from "./member";

export async function simulateSandbox(_: ActionState, f: FormData): Promise<ActionState> {
  const t = await getTenant();
  const session = await getSession(t);
  if (!session) return { ok: false, message: "Sign in first." };
  const order = await pb.first("payment_orders", `tenant_id=${q(t.id)} && id=${q(String(f.get("order_id") ?? "").slice(0, 30))} && user_id=${q(session.user.id)} && sandbox=true`);
  if (!order) return { ok: false, message: "Sandbox order not found." };
  const type = String(f.get("type")) as "payment.succeeded" | "payment.failed" | "refund.succeeded";
  if (!["payment.succeeded", "payment.failed", "refund.succeeded"].includes(type)) return { ok: false, message: "Unknown event." };
  const ev = signedSandboxEvent(order.provider_ref, type);
  const r = await handleWebhook("sandbox", ev.body, new Headers({ "x-palavva-sandbox-signature": ev.signature, host: (await headers()).get("host") ?? "" }));
  revalidatePath("/credits");
  revalidatePath(`/payments/sandbox/${order.id}`);
  return { ok: r.status === 200, message: `Sandbox: ${r.outcome}.` };
}
