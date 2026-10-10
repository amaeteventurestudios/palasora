import { pb, q } from "./pb";

export const SWITCHES = ["INGEST_PAUSED", "AI_PAUSED", "AUTO_PUBLISH_DISABLED", "AD_SLOTS_DISABLED", "PUBLISHING_PAUSED", "ANALYTICS_ENABLED", "CITY_PAUSED", "AGENT_POSTING_PAUSED", "AGENT_TASKS_PAUSED"] as const;
export type SwitchKey = (typeof SWITCHES)[number];

export async function getSettings(tenantId: string): Promise<Record<string, unknown>> {
  const rows = await pb.list("tenant_settings", { filter: `tenant_id=${q(tenantId)}`, perPage: 100 });
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export async function getSwitch(tenantId: string, key: SwitchKey): Promise<boolean> {
  const r = await pb.first("tenant_settings", `tenant_id=${q(tenantId)} && key=${q(key)}`);
  return r?.value === true;
}
