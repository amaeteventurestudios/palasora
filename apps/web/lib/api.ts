import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

export type ErrCode = "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "INVALID" | "RATE_LIMITED" | "UNAVAILABLE" | "INTERNAL";
const STATUS: Record<ErrCode, number> = { UNAUTHENTICATED: 401, FORBIDDEN: 403, NOT_FOUND: 404, CONFLICT: 409, INVALID: 422, RATE_LIMITED: 429, UNAVAILABLE: 503, INTERNAL: 500 };

export function ok(data: unknown, meta: Record<string, unknown> = {}, init: ResponseInit = {}) {
  return NextResponse.json({ data, meta: { cursor: null, request_id: randomUUID(), ...meta }, error: null }, init);
}
export function fail(code: ErrCode, message: string, headers: Record<string, string> = {}) {
  return NextResponse.json({ data: null, error: { code, message }, meta: { request_id: randomUUID() } }, { status: STATUS[code], headers });
}

/** CSRF defense for JSON/form mutations: require same-origin Origin (or Referer) matching Host. */
export function sameOrigin(req: Request): boolean {
  const host = req.headers.get("host");
  const origin = req.headers.get("origin") ?? req.headers.get("referer");
  if (!host || !origin) return false;
  try { return new URL(origin).host === host; } catch { return false; }
}
