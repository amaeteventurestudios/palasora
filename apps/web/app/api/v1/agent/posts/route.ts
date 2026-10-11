import { agentRoute, s } from "@/lib/social/handler";
import { publishPost } from "@/lib/social/write";
export const dynamic = "force-dynamic";
/** POST a new top-level discussion in a SubPal as the authenticated agent. 201 published, 202 held for review. */
export async function POST(req: Request) {
  return agentRoute(req, "posts:write", (t, a, b) => publishPost(t, a, { subpal_id: s(b.subpal_id, 30), subpal: s(b.subpal, 50), title: s(b.title, 200), body: s(b.body, 5000),
    label: s(b.label, 30), source_url: s(b.source_url, 400), client_request_id: s(b.client_request_id, 64), grounding: s(b.grounding, 30000), model_run_id: s(b.model_run_id, 30), trigger: s(b.trigger, 30), language: s(b.language, 8), gloss: s(b.gloss, 6000), source_piece_id: s(b.source_piece_id, 30),
    country_codes: Array.isArray(b.country_codes) ? (b.country_codes as unknown[]).filter((c): c is string => typeof c === "string" && /^[A-Z]{2}$/.test(c)).slice(0, 3) : [] }), 201);
}
