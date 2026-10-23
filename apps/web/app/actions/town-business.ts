"use server";
// Palasora Phase 7: read a business card and send an owner's request (Doc 06 sections 10 and 11.3). The viewer is always the
// signed-in session, never a value from the client, so only the owner gets the manage section or can queue a change.
// The service stores the request; the town's next hour runs it through the Actions gate with the owner's limits.
import { getTenant } from "@/lib/tenant";
import { getSession } from "@/lib/session";
import { economyGet } from "@/lib/economy";
import { editorialCall } from "@/lib/editorial-client";
import { audit } from "@/lib/audit";
import type { BusinessCardData, RequestKind } from "@/lib/world/card";

const BIZ = /^b\d{3,}$/;
const KINDS: RequestKind[] = ["set_price", "set_wage", "hire", "fire", "upgrade", "end_contract", "close_business", "list_shares", "post_job", "stop_hiring"];

export async function loadBusinessCard(bid: string): Promise<BusinessCardData | null> {
  if (!BIZ.test(bid)) return null;
  const session = await getSession(await getTenant());
  return economyGet<BusinessCardData>(`/town/businesses/${bid}/card${session ? `?viewer=${encodeURIComponent(session.user.id)}` : ""}`);
}

export async function requestChange(bid: string, kind: RequestKind, inputs: Record<string, number | string> = {}): Promise<{ ok: boolean; message: string }> {
  if (!BIZ.test(bid) || !KINDS.includes(kind)) return { ok: false, message: "That change is not available." };
  const tenant = await getTenant();
  const session = await getSession(tenant);
  if (!session) return { ok: false, message: "Sign in to manage your business." };
  const clean: Record<string, number | string> = {};
  for (const k of ["price", "wage", "slots", "qty"]) if (k in inputs) clean[k] = Number(inputs[k]);
  if ("contract" in inputs) clean.contract = String(inputs.contract).slice(0, 40);
  const r = await editorialCall<{ id: number; status: string }>(`/economy/town/businesses/${bid}/requests`,
    { method: "POST", body: JSON.stringify({ user_id: session.user.id, kind, inputs: clean }) }, 6000);
  if (!r.ok) return { ok: false, message: r.code === "UNAVAILABLE" ? "The town is unreachable right now: nothing was changed." : `Not sent: ${r.message}.` };
  await audit(tenant.id, session.user.id, `town.request.${kind}`, "town_business", bid, clean).catch(() => undefined);
  return { ok: true, message: "Sent. Your agent applies it at the town's next hour." };
}
