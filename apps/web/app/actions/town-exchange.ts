"use server";
// Company shares: read the Town Exchange and send a person's order. The person is always the signed-in session; the town's
// next hour runs the order through the Actions gate with their agent's limits (reservation first, no self-trade).
import { getTenant } from "@/lib/tenant";
import { getSession } from "@/lib/session";
import { economyGet } from "@/lib/economy";
import { editorialCall } from "@/lib/editorial-client";
import { audit } from "@/lib/audit";
import type { Board, Listing, ShareKind } from "@/lib/world/exchange";

const BIZ = /^b\d{3,}$/;
const KINDS: ShareKind[] = ["buy_shares", "sell_shares", "cancel_share_order"];

async function user(): Promise<string> {
  const session = await getSession(await getTenant());
  return session ? session.user.id : "";
}

export async function loadExchange(): Promise<{ signedIn: boolean; data: Board | null }> {
  const u = await user();
  return { signedIn: !!u, data: await economyGet<Board>(`/town/exchange${u ? `?user_id=${encodeURIComponent(u)}` : ""}`) };
}

export async function loadListing(bid: string): Promise<{ signedIn: boolean; data: Listing | null }> {
  if (!BIZ.test(bid)) return { signedIn: false, data: null };
  const u = await user();
  return { signedIn: !!u, data: await economyGet<Listing>(`/town/exchange/${bid}${u ? `?user_id=${encodeURIComponent(u)}` : ""}`) };
}

export async function requestShares(kind: ShareKind, inputs: { business?: string; price?: number; qty?: number; order?: number }): Promise<{ ok: boolean; message: string }> {
  if (!KINDS.includes(kind)) return { ok: false, message: "That is not available." };
  const tenant = await getTenant();
  const session = await getSession(tenant);
  if (!session) return { ok: false, message: "Sign in to trade shares." };
  const clean: Record<string, string | number> = {};
  if (kind === "cancel_share_order") {
    const order = Math.trunc(Number(inputs.order));
    if (!(order > 0)) return { ok: false, message: "No such order." };
    clean.order = order;
  } else {
    const price = Math.round(Number(inputs.price) * 100) / 100, qty = Math.trunc(Number(inputs.qty));
    if (!inputs.business || !BIZ.test(inputs.business) || !(price > 0) || !(qty >= 1 && qty <= 500)) return { ok: false, message: "That order is not valid." };
    Object.assign(clean, { business: inputs.business, price, qty });
  }
  const r = await editorialCall<{ id: number; status: string }>("/economy/town/me/requests",
    { method: "POST", body: JSON.stringify({ user_id: session.user.id, kind, inputs: clean }) }, 6000);
  if (!r.ok) return { ok: false, message: r.code === "UNAVAILABLE" ? "The town is unreachable right now: nothing was changed." : `Not sent: ${r.message}.` };
  await audit(tenant.id, session.user.id, `town.shares.${kind}`, "town_business", String(clean.business ?? clean.order), clean).catch(() => undefined);
  return { ok: true, message: kind === "cancel_share_order" ? "Sent. The order is cancelled at the town's next hour." : "Sent. Your order goes in at the town's next hour; the Sora or shares are held until it fills or expires." };
}
