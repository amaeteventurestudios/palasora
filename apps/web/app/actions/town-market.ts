"use server";
// The player market: read the Market Hall and send an owner's order for one of their businesses. The person is always the
// signed-in session; the service checks they own the business, and the town's next hour runs the order through the
// Actions gate (reservation first, the price band, no self-trade).
import { getTenant } from "@/lib/tenant";
import { getSession } from "@/lib/session";
import { economyGet } from "@/lib/economy";
import { editorialCall } from "@/lib/editorial-client";
import { audit } from "@/lib/audit";
import { GOODS, type Good, type GoodView, type Hall, type MarketKind } from "@/lib/world/market";

const BIZ = /^b\d{3,}$/;

async function user(): Promise<string> {
  const session = await getSession(await getTenant());
  return session ? session.user.id : "";
}

export async function loadMarket(): Promise<Hall | null> {
  const u = await user();
  return economyGet<Hall>(`/town/market${u ? `?user_id=${encodeURIComponent(u)}` : ""}`);
}

export async function loadGood(good: Good): Promise<GoodView | null> {
  if (!GOODS.includes(good)) return null;
  const u = await user();
  return economyGet<GoodView>(`/town/market/${good}${u ? `?user_id=${encodeURIComponent(u)}` : ""}`);
}

export async function requestMarket(bid: string, kind: MarketKind, inputs: { good?: string; side?: string; price?: number; qty?: number; order?: number }): Promise<{ ok: boolean; message: string }> {
  if (!BIZ.test(bid) || (kind !== "place_order" && kind !== "cancel_order")) return { ok: false, message: "That is not available." };
  const tenant = await getTenant();
  const session = await getSession(tenant);
  if (!session) return { ok: false, message: "Sign in to trade at the Market Hall." };
  const clean: Record<string, string | number> = {};
  if (kind === "cancel_order") {
    const order = Math.trunc(Number(inputs.order));
    if (!(order > 0)) return { ok: false, message: "No such order." };
    clean.order = order;
  } else {
    const price = Math.round(Number(inputs.price) * 100) / 100, qty = Math.trunc(Number(inputs.qty));
    if (!GOODS.includes(inputs.good as Good) || (inputs.side !== "buy" && inputs.side !== "sell") || !(price > 0) || !(qty >= 1 && qty <= 500))
      return { ok: false, message: "That order is not valid." };
    Object.assign(clean, { good: inputs.good!, side: inputs.side, price, qty });
  }
  const r = await editorialCall<{ id: number; status: string }>(`/economy/town/businesses/${bid}/requests`,
    { method: "POST", body: JSON.stringify({ user_id: session.user.id, kind, inputs: clean }) }, 6000);
  if (!r.ok) return { ok: false, message: r.code === "UNAVAILABLE" ? "The town is unreachable right now: nothing was changed." : `Not sent: ${r.message}.` };
  await audit(tenant.id, session.user.id, `town.market.${kind}`, "town_business", bid, clean).catch(() => undefined);
  return { ok: true, message: kind === "cancel_order" ? "Sent. The order is cancelled at the town's next hour." : "Sent. Your stall opens at the town's next hour; the goods or Sora are held until it sells or expires." };
}
