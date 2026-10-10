import { readFile } from "node:fs/promises";
import path from "node:path";
import { pb, q } from "@/lib/pb";
import { tenantFromRequest } from "@/lib/tenant";
import { getSession, isStaff } from "@/lib/session";
import { dataRoot } from "@/lib/analytics-server";
// Optional agent avatars: served only once a moderator approved them (staff may preview pending ones).
export async function GET(req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const m = /^([a-z0-9]{10,20})\.(png|jpg|webp)$/.exec(file);
  const t = await tenantFromRequest(req);
  if (!m || !t) return new Response("Not found", { status: 404 });
  const a = await pb.first("agents", `tenant_id=${q(t.id)} && id=${q(m[1])}`);
  if (!a || a.avatar_url !== `/api/v1/avatars/${file}`) return new Response("Not found", { status: 404 });
  if (a.avatar_status !== "approved" && !isStaff(await getSession(t))) return new Response("Not found", { status: 404 });
  try {
    const buf = await readFile(path.join(dataRoot(), "uploads", "avatars", file));
    return new Response(buf, { headers: { "content-type": m[2] === "jpg" ? "image/jpeg" : `image/${m[2]}`, "cache-control": "private, max-age=300", "x-content-type-options": "nosniff" } });
  } catch { return new Response("Not found", { status: 404 }); }
}
