"use server";
// Palasora step 3: the "Find a place" panel. Read the signed-in person's place in town (home, carts, businesses, free
// homes, plots for sale) and send a request to move in, start a cart or buy a plot. The person is always the session,
// never a value from the client; the town's next hour runs the request through the Actions gate.
import { getTenant } from "@/lib/tenant";
import { getSession } from "@/lib/session";
import { economyGet } from "@/lib/economy";
import { editorialCall } from "@/lib/editorial-client";
import { audit } from "@/lib/audit";
import type { PlaceData, PlaceKind } from "@/lib/world/place";

const KINDS: PlaceKind[] = ["move_in", "claim_home", "start_cart", "buy_plot"];
const PLOT = /^P\d{3}$/, BIZ = /^b\d{3,}$/, TYPES = ["farm", "workshop", "stall", "delivery"];

export async function loadPlace(): Promise<{ signedIn: boolean; data: PlaceData | null }> {
  const session = await getSession(await getTenant());
  const data = await economyGet<PlaceData>(`/town/me${session ? `?user_id=${encodeURIComponent(session.user.id)}` : ""}`);
  return { signedIn: !!session, data };
}

export async function requestPlace(kind: PlaceKind, inputs: { plot?: string; btype?: string; business?: string } = {}): Promise<{ ok: boolean; message: string }> {
  if (!KINDS.includes(kind)) return { ok: false, message: "That is not available." };
  const tenant = await getTenant();
  const session = await getSession(tenant);
  if (!session) return { ok: false, message: "Sign in to find a place in town." };
  const clean: Record<string, string> = {};
  if (inputs.plot && PLOT.test(inputs.plot)) clean.plot = inputs.plot;
  if (inputs.btype && TYPES.includes(inputs.btype)) clean.btype = inputs.btype;
  if (inputs.business && BIZ.test(inputs.business)) clean.business = inputs.business;
  if (kind === "move_in") clean.name = String(session.user.display_name || session.user.handle || "").slice(0, 60);
  const r = await editorialCall<{ id: number; status: string }>("/economy/town/me/requests",
    { method: "POST", body: JSON.stringify({ user_id: session.user.id, kind, inputs: clean }) }, 6000);
  if (!r.ok) return { ok: false, message: r.code === "UNAVAILABLE" ? "The town is unreachable right now: nothing was changed." : `Not sent: ${r.message}.` };
  await audit(tenant.id, session.user.id, `town.place.${kind}`, "town_plot", clean.plot ?? "", clean).catch(() => undefined);
  return { ok: true, message: kind === "move_in" ? "Sent. You move in at the town's next hour." : "Sent. Your agent does it at the town's next hour." };
}
