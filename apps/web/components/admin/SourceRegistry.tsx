// Source registry (v1.3 rights actions kept; tests T-013/A-05). v1.8+ ISSUE-09: every source is classified by what an
// operator can do with it and shown as compact cards; archived discoveries are kept, never deleted, hidden by default.
import { getTenant } from "@/lib/tenant";
import { q } from "@/lib/pb";
import { listAll } from "@/lib/admin/fetchall";
import { SourceGrid, type SourceCard } from "./sources/SourceGrid";

export async function SourceRegistry() {
  const t = await getTenant();
  const [rows, items] = await Promise.all([listAll("sources", `tenant_id=${q(t.id)}`, "", 10000, "publisher_name"),
    listAll("source_items", `tenant_id=${q(t.id)}`, "source_id,created", 200000)]);
  const since = new Date(Date.now() - 30 * 86400_000).toISOString().replace("T", " ");
  const total = new Map<string, number>(), recent = new Map<string, number>();
  for (const i of items) { total.set(i.source_id, (total.get(i.source_id) ?? 0) + 1); if (i.created >= since) recent.set(i.source_id, (recent.get(i.source_id) ?? 0) + 1); }
  const cards: SourceCard[] = rows.map((s) => {
    const n30 = recent.get(s.id) ?? 0;
    const stale = s.enabled && s.last_success_at && Date.now() - new Date(String(s.last_success_at).replace(" ", "T")).getTime() > 3 * (s.fetch_interval_minutes || 60) * 60_000;
    const health = !s.enabled ? (s.source_class === "discovery" && n30 ? "Headlines via discovery" : "Not fetching") : !s.last_success_at ? "Never fetched" : s.consecutive_failures ? `Failing (${s.last_error_code})` : stale ? "Stale" : "Fetched recently";
    const group: SourceCard["group"] = s.rights_status === "approved" ? (s.enabled && n30 ? "active" : "inactive")
      : s.source_class === "discovery" ? (n30 ? "linkonly" : "archived") : "review";
    return { id: s.id, name: s.publisher_name, group, rights: s.rights_status, usage: s.usage_policy, health, healthy: health === "Fetched recently" || health === "Headlines via discovery", enabled: !!s.enabled,
      endpoint: s.endpoint_url ?? "", endpointType: s.endpoint_type ?? "", cls: s.source_class ?? "", trust: s.trust_tier ?? "", countries: [...new Set([...(s.countries ?? []), s.publisher_country].filter(Boolean))] as string[],
      lastSuccess: String(s.last_success_at ?? "").slice(0, 16), lastError: s.last_error_code ?? "", items30: n30, itemsTotal: total.get(s.id) ?? 0, notes: s.rights_notes ?? "", licenseUrl: s.license_url ?? "", fixture: !!s.is_fixture };
  });
  return (
    <section aria-labelledby="registry-h" className="flex flex-col gap-2">
      <h2 id="registry-h" className="text-[20px] font-extrabold tracking-tight">Source registry</h2>
      <p className="text-sm text-muted-foreground">Sources are fetched only when rights are approved. A trusted publisher is evidence of where a story came from, not permission to copy it: rights come from the publisher's terms or a licence, never from directory data. Revoking rights stops fetching and withdraws dependent content.</p>
      <SourceGrid rows={cards} />
    </section>
  );
}
