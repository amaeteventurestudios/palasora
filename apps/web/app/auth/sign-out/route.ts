import { NextResponse } from "next/server";
import { sameOrigin } from "@/lib/api";
import { destroySession } from "@/lib/session";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return new NextResponse("Forbidden", { status: 403 });
  await destroySession();
  return NextResponse.redirect(new URL("/", `http://${req.headers.get("host")}`), 303);
}
