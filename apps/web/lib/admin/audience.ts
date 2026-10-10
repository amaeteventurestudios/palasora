// A02 audience metrics (docs/specs/28). Source of truth: PocketBase human_activity (one row per human per UTC day),
// users (signups) and agents (owner activation). Seed agents, bots, headless QA and staff never appear in human_activity.
import { pb, q } from "../pb";
import type { Tenant } from "../tenant";
import { delta, perDay, type Scope } from "./scope";

export type Act = { day: string; subject_kind: string; subject_key: string; country: string; language: string; device: string; referrer: string; is_owner: boolean };

export async function activityRows(t: Tenant, fromDay: string, country: string): Promise<Act[]> {
  let f = `tenant_id=${q(t.id)} && day >= ${q(fromDay)}`;
  if (country !== "ALL") f += ` && country=${q(country)}`;
  const out: Act[] = [];
  for (let page = 1; page < 40; page++) {
    const rows = await pb.list("human_activity", { filter: f, perPage: 500, page, fields: "day,subject_kind,subject_key,country,language,device,referrer,is_owner" });
    out.push(...(rows as unknown as Act[]));
    if (rows.length < 500) break;
  }
  return out;
}

const distinctOn = (rows: Act[], days: Set<string>, kind = "member") => new Set(rows.filter((r) => r.subject_kind === kind && days.has(r.day)).map((r) => r.subject_key)).size;

export async function audience(t: Tenant, s: Scope) {
  const lookback = new Date(s.since.getTime() - Math.max(30, s.days) * 86400_000).toISOString().slice(0, 10);
  const rows = await activityRows(t, lookback, s.country);
  const today = s.dayList.at(-1)!;
  const trailing = (end: string, n: number) => new Set(Array.from({ length: n }, (_, i) => new Date(new Date(end).getTime() - i * 86400_000).toISOString().slice(0, 10)));
  const members = rows.filter((r) => r.subject_kind === "member");
  const guests = rows.filter((r) => r.subject_kind === "guest");
  const dau = distinctOn(rows, new Set([today]));
  const wau = distinctOn(rows, trailing(today, 7));
  const mau = distinctOn(rows, trailing(today, 30));
  const prevDayEnd = new Date(new Date(today).getTime() - s.days * 86400_000).toISOString().slice(0, 10);
  const series = s.dayList.map((d) => ({
    day: d,
    members: new Set(members.filter((r) => r.day === d).map((r) => r.subject_key)).size,
    guests: guests.filter((r) => r.day === d).length,
    owners: new Set(members.filter((r) => r.day === d && r.is_owner).map((r) => r.subject_key)).size,
  }));
  const prevSeries = s.dayList.map((d) => {
    const pd = new Date(new Date(d).getTime() - s.days * 86400_000).toISOString().slice(0, 10);
    return new Set(members.filter((r) => r.day === pd).map((r) => r.subject_key)).size;
  });
  const cur = series.reduce((a, b) => a + b.members, 0), prev = prevSeries.reduce((a, b) => a + b, 0);
  // Cohorts: authenticated humans by first active day (in all stored history), returning on exactly day N.
  const first = new Map<string, string>();
  for (const r of members.sort((a, b) => a.day.localeCompare(b.day))) if (!first.has(r.subject_key)) first.set(r.subject_key, r.day);
  const activeOn = new Map<string, Set<string>>();
  for (const r of members) { if (!activeOn.has(r.subject_key)) activeOn.set(r.subject_key, new Set()); activeOn.get(r.subject_key)!.add(r.day); }
  const PERIODS = [1, 7, 30, 90];
  const cohorts = new Map<string, string[]>();
  for (const [k, d] of first) if (d >= s.dayList[0]) { if (!cohorts.has(d)) cohorts.set(d, []); cohorts.get(d)!.push(k); }
  const cohortRows = [...cohorts.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 14).map(([d, ks]) => ({
    cohort: d, size: ks.length,
    cells: PERIODS.map((n) => {
      const target = new Date(new Date(d).getTime() + n * 86400_000).toISOString().slice(0, 10);
      if (target > today) return null;
      return { n: ks.filter((k) => activeOn.get(k)?.has(target)).length, d: ks.length };
    }),
  }));
  const group = (key: keyof Act, set: Act[]) => { const m = new Map<string, number>(); for (const r of set) { const v = String(r[key] || "unknown"); m.set(v, (m.get(v) ?? 0) + 1); } return [...m.entries()].sort((a, b) => b[1] - a[1]); };
  const inWindow = rows.filter((r) => r.day >= s.dayList[0]);
  // Funnel (window): signups -> owners who created an agent -> agent with a validated action -> returned on a later day.
  const since = s.since.toISOString().replace("T", " ");
  const signups = await pb.list("users", { filter: `tenant_id=${q(t.id)} && created >= ${q(since)}`, fields: "id,created,email", perPage: 500 });
  // Seeded local accounts (staff, demo readers, test users on *.local / *.test) are not human signups.
  const staff = new Set((await pb.list("memberships", { filter: `tenant_id=${q(t.id)} && status='active' && role!='member'`, fields: "user_id", perPage: 500 })).map((m) => m.user_id));
  const ids = new Set(signups.filter((u) => !staff.has(u.id) && !/@[^@]+\.(local|test)$/i.test(String(u.email ?? ""))).map((u) => u.id));
  const agents = ids.size ? await pb.list("agents", { filter: `tenant_id=${q(t.id)} && owner_type='user' && created >= ${q(since)}`, fields: "id,owner_user_id", perPage: 500 }) : [];
  const ownersWithAgent = new Set(agents.filter((a) => ids.has(a.owner_user_id)).map((a) => a.owner_user_id));
  const acted = agents.length ? await pb.list("agent_actions", { filter: `tenant_id=${q(t.id)} && created >= ${q(since)} && (decision='post' || decision='reply' || decision='vote')`, fields: "agent_id", perPage: 500 }) : [];
  const actedAgents = new Set(acted.map((x) => x.agent_id));
  const activated = new Set(agents.filter((a) => actedAgents.has(a.id) && ids.has(a.owner_user_id)).map((a) => a.owner_user_id));
  const returned = [...ids].filter((u) => (activeOn.get(u)?.size ?? 0) >= 2).length;
  return {
    dau, wau, mau, stickiness: mau ? dau / mau : null, guestsToday: guests.filter((r) => r.day === today).length,
    deltaMembers: delta(cur, prev), series, prevSeries, sparkDau: series.map((x) => x.members),
    cohortRows, periods: PERIODS.map((n) => `D${n}`),
    byCountry: group("country", inWindow).slice(0, 12), byLanguage: group("language", inWindow), byDevice: group("device", inWindow), byReferrer: group("referrer", inWindow),
    funnel: [{ label: "Signed up (owner accounts)", n: ids.size }, { label: "Created an agent", n: ownersWithAgent.size }, { label: "Agent made a validated public action", n: activated.size },
      { label: "Owner returned on another day", n: returned }],
    totalRows: inWindow.length,
  };
}
