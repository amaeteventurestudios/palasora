import { fail, ok } from "@/lib/api";
import { tenantFromRequest } from "@/lib/tenant";
import { getSession, isStaff } from "@/lib/session";
import { pb } from "@/lib/pb";
import { backupStatus, diskFree, editorialStatus } from "@/lib/ops";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const t = await tenantFromRequest(req);
  if (!t) return fail("NOT_FOUND", "Unknown site");
  const s = await getSession(t);
  if (!s) return fail("UNAUTHENTICATED", "Login needed");
  if (!isStaff(s)) return fail("FORBIDDEN", "Not permitted");
  const [pbOk, ed, backup, disk] = await Promise.all([pb.health(), editorialStatus(t.id), backupStatus(), diskFree()]);
  return ok({ web: "up", pocketbase: pbOk ? "up" : "down", editorial: ed ? "up" : "down", qwen: ed?.provider.reachable ? "reachable" : "unreachable", queue: ed?.queue.by_state ?? null, backup, disk });
}
