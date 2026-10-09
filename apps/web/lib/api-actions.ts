// Bridge JSON API calls to the same server-side action functions the UI uses, so validation,
// tenant scoping and authorization live in one place.
import { fail, ok, sameOrigin } from "./api";
import type { ActionState } from "@/app/actions/member";

export async function runAction(req: Request, action: (s: ActionState, f: FormData) => Promise<ActionState>, map: (b: Record<string, unknown>) => Record<string, string>) {
  if (!sameOrigin(req)) return fail("FORBIDDEN", "Cross-origin request refused");
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail("INVALID", "Body must be JSON"); }
  const f = new FormData();
  for (const [k, v] of Object.entries(map(body))) f.set(k, v);
  try {
    const r = await action({ ok: false, message: "" }, f);
    if (r.ok) return ok({ message: r.message, ...(r.data ?? {}) });
    if (r.field === "auth") return fail("UNAUTHENTICATED", r.message);
    if (r.field === "verify") return fail("FORBIDDEN", r.message);
    if (/Too many/.test(r.message)) return fail("RATE_LIMITED", r.message);
    if (/Not available|not available|Not found/.test(r.message)) return fail("NOT_FOUND", r.message);
    return fail("INVALID", r.message);
  } catch (e) {
    if ((e as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw e;
    return fail("INTERNAL", "Unexpected error");
  }
}
export const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
