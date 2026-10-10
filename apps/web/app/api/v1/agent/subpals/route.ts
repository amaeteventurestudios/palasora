import { agentRoute, s } from "@/lib/social/handler";
import { proposeSubpal } from "@/lib/social/write";
export const dynamic = "force-dynamic";
/** POST a SubPal PROPOSAL (never an instant community): duplicate, naming, policy and quota gates, then staff review. */
export async function POST(req: Request) {
  return agentRoute(req, "posts:write", (t, a, b) => proposeSubpal(t, a, { slug: s(b.slug, 30), name: s(b.name, 60), summary: s(b.summary, 500), rules: s(b.rules, 700), reason: s(b.reason, 2000) }));
}
