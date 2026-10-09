// Server-side PocketBase client. Authenticates as the dedicated service superuser;
// the token never leaves the server. All tenant scoping happens in lib/repo/*.
import { env } from "./env";

export class PBError extends Error {
  constructor(public status: number, message: string, public data?: unknown) {
    super(`PocketBase ${status}: ${message}`);
  }
}

export type Rec = { id: string; created: string; updated: string; [k: string]: any };

let token: string | null = null;
let tokenAt = 0;

async function auth(force = false): Promise<string> {
  if (!force && token && Date.now() - tokenAt < 50 * 60 * 1000) return token;
  const r = await fetch(`${env.pbUrl}/api/collections/_superusers/auth-with-password`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ identity: env.pbEmail, password: env.pbPassword }),
    cache: "no-store",
  });
  if (!r.ok) throw new PBError(r.status, "service authentication failed");
  token = (await r.json()).token as string;
  tokenAt = Date.now();
  return token;
}

async function req<T>(method: string, path: string, body?: unknown, retry = true): Promise<T> {
  const t = await auth();
  const r = await fetch(`${env.pbUrl}${path}`, {
    method,
    headers: { Authorization: t, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  if (r.status === 401 && retry) {
    await auth(true);
    return req<T>(method, path, body, false);
  }
  if (!r.ok) {
    let msg = r.statusText;
    let data: unknown;
    try { const j = await r.json(); msg = j.message ?? msg; data = j.data; } catch { /* ignore */ }
    throw new PBError(r.status, msg, data);
  }
  return (r.status === 204 ? undefined : await r.json()) as T;
}

/** Quote a value for a PocketBase filter expression. */
export function q(v: string | number | boolean): string {
  if (typeof v !== "string") return String(v);
  return "'" + v.replace(/\\/g, "\\\\").replace(/'/g, "\\'") + "'";
}

export const pb = {
  async list(coll: string, opts: { filter?: string; sort?: string; perPage?: number; page?: number; fields?: string } = {}): Promise<Rec[]> {
    const p = new URLSearchParams({ perPage: String(opts.perPage ?? 50), page: String(opts.page ?? 1), skipTotal: "1" });
    if (opts.filter) p.set("filter", opts.filter);
    if (opts.sort) p.set("sort", opts.sort);
    if (opts.fields) p.set("fields", opts.fields);
    const res = await req<{ items: Rec[] }>("GET", `/api/collections/${coll}/records?${p}`);
    return res.items;
  },
  async count(coll: string, filter: string): Promise<number> {
    const p = new URLSearchParams({ perPage: "1", page: "1", filter, fields: "id" });
    const res = await req<{ totalItems: number }>("GET", `/api/collections/${coll}/records?${p}`);
    return res.totalItems;
  },
  async first(coll: string, filter: string, sort?: string): Promise<Rec | null> {
    const items = await pb.list(coll, { filter, perPage: 1, sort });
    return items[0] ?? null;
  },
  async get(coll: string, id: string): Promise<Rec | null> {
    try { return await req<Rec>("GET", `/api/collections/${coll}/records/${encodeURIComponent(id)}`); }
    catch (e) { if (e instanceof PBError && e.status === 404) return null; throw e; }
  },
  create: (coll: string, data: Record<string, unknown>) => req<Rec>("POST", `/api/collections/${coll}/records`, data),
  update: (coll: string, id: string, data: Record<string, unknown>) => req<Rec>("PATCH", `/api/collections/${coll}/records/${encodeURIComponent(id)}`, data),
  remove: (coll: string, id: string) => req<void>("DELETE", `/api/collections/${coll}/records/${encodeURIComponent(id)}`),
  async health(): Promise<boolean> {
    try { const r = await fetch(`${env.pbUrl}/api/health`, { cache: "no-store", signal: AbortSignal.timeout(2000) }); return r.ok; }
    catch { return false; }
  },
  /** Password check against the users auth collection (does not create a PB session for the browser). */
  async verifyPassword(email: string, password: string): Promise<Rec | null> {
    const r = await fetch(`${env.pbUrl}/api/collections/users/auth-with-password`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ identity: email, password }), cache: "no-store",
    });
    if (!r.ok) return null;
    return (await r.json()).record as Rec;
  },
};

export function pbDate(d: Date = new Date()): string {
  return d.toISOString().replace("T", " ");
}
