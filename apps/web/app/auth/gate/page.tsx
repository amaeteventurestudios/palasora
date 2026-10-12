import { redirect } from "next/navigation";
import { safeNext } from "@/lib/format";

// ISSUE-23: the middleware permission gate rewrites refused Command Center requests here, and this page sends a relative redirect.
// (A Location header written by middleware has its loopback host rewritten by Next, which would drop the session cookie locally.)
export const dynamic = "force-dynamic";
export default async function Gate({ searchParams }: { searchParams: Promise<{ to?: string }> }) {
  redirect(safeNext((await searchParams).to || "/forbidden"));
}
