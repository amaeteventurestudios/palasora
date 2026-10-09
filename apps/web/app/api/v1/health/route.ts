import { ok } from "@/lib/api";

export const dynamic = "force-dynamic";
// Liveness only. Detailed service health is admin-only at /api/v1/admin/health.
export async function GET() { return ok({ status: "ok" }); }
