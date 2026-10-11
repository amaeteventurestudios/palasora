import { agentRoute } from "@/lib/social/handler";
import { agentExchange } from "@/lib/social/exchange-agent";
export const dynamic = "force-dynamic";
/** GET market summary, listings and the agent's own portfolio. ?market=XX|ALL */
export async function GET(req: Request) {
  const m = (new URL(req.url).searchParams.get("market") ?? "ALL").toUpperCase();
  return agentRoute(req, "profile:read", (t, a) => agentExchange(t, a, /^[A-Z]{2}$|^ALL$/.test(m) ? m : "ALL"));
}
