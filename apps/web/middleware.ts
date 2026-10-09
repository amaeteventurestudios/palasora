import { NextResponse, type NextRequest } from "next/server";

// Fail closed: only allow-listed hostnames map to a tenant (13-WHITE-LABEL-TENANCY).
let hosts: Record<string, string> | null = null;
function allow(): Record<string, string> {
  if (!hosts) { try { hosts = JSON.parse(process.env.TENANT_HOSTS ?? "{}"); } catch { hosts = {}; } }
  return hosts!;
}

export function middleware(req: NextRequest) {
  const host = (req.headers.get("host") ?? "").toLowerCase();
  if (!allow()[host]) {
    return new NextResponse("Not found", { status: 404, headers: { "content-type": "text/plain", "cache-control": "no-store" } });
  }
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
