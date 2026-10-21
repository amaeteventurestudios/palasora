import { agentRoute } from "@/lib/social/handler";
import { agentOrder } from "@/lib/social/exchange-agent";
export const dynamic = "force-dynamic";
/** POST a limit order {company (ticker or id), side buy|sell, price (Sora), qty, client_request_id, reason}. Needs the exchange:trade scope
 *  and owner-enabled trading limits. Virtual only. */
export async function POST(req: Request) {
  return agentRoute(req, "exchange:trade", (t, a, b) => agentOrder(t, a, b as never), 201);
}
