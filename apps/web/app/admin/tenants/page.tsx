import { requirePerm } from "@/lib/guard";
import { can } from "@/lib/session";
import { pb, q } from "@/lib/pb";
import { env } from "@/lib/env";
import { updateBranding } from "@/app/actions/admin";
import { AdminForm } from "@/components/admin/AdminForm";
import { H1, Table, Pill } from "@/components/admin/ui";

export const metadata = { title: "Tenants" };

export default async function Tenants() {
  // ISSUE-23: a tenant's staff with Settings → view see their own tenant; the platform list is Super Administrator only;
  // changing branding needs Settings → administer (checked again in the action).
  const { tenant: t, session } = await requirePerm("settings", "view");
  const platform = session.access.roleKey === "super_admin" && can(session, "settings", "administer");
  // Tenant admins only ever see their own tenant; platform admins see the list (read-only here, audited switches are host-based).
  const rows = platform ? await pb.list("tenants", { perPage: 50 }) : await pb.list("tenants", { filter: `id=${q(t.id)}`, perPage: 1 });
  const own = rows.find((r) => r.id === t.id)!;
  const b = own.branding_json ?? {};
  const ent = await pb.first("tenant_entitlements", `tenant_id=${q(t.id)}`);
  return (
    <div>
      <H1 sub="Each tenant is resolved from a trusted host allowlist; there is no in-app tenant switch. Platform admins administer a tenant by visiting its host.">Tenants</H1>
      <Table caption={platform ? "All tenants (platform admin)" : "Your tenant"} head={["Tenant", "Hosts", "Status", "Features enabled", "Quota (AI/day)", "Billing"]}>
        {rows.map((r) => <tr key={r.id}><td className="px-3 py-2 font-semibold">{r.name}{r.is_demo ? " (demo)" : ""}</td>
          <td className="px-3 py-2">{Object.entries(env.tenantHosts).filter(([, s]) => s === r.slug).map(([h]) => <a key={h} className="link me-2" href={`http://${h}/admin/tenants`}>{h}</a>)}</td>
          <td className="px-3 py-2"><Pill tone="good">{r.status}</Pill></td><td className="px-3 py-2 text-xs">{Object.entries(r.enabled_features ?? {}).filter(([, v]) => v).map(([k]) => k).join(", ")}</td>
          <td className="px-3 py-2">{r.quotas_json?.daily_ai_requests ?? "–"}</td><td className="px-3 py-2">Not enabled</td></tr>)}
      </Table>
      {can(session, "settings", "administer") && (
        <section className="card mt-6 max-w-xl p-5" aria-labelledby="br">
          <h2 id="br" className="text-lg font-bold">Branding for {t.name}</h2>
          <p className="meta">Only plain hex colors are accepted; the masthead must keep white text at 4.5:1 contrast.</p>
          <AdminForm action={updateBranding} submit="Save branding" className="mt-3">
            <label className="field-label" htmlFor="wm">Wordmark text</label><input id="wm" name="wordmark_text" defaultValue={b.wordmark_text} className="input" />
            {[["masthead_color", "Masthead"], ["accent_color", "Accent"], ["primary_color", "Primary button"]].map(([k, l]) => (
              <div key={k}><label className="field-label" htmlFor={k}>{l} color</label><input id={k} name={k} defaultValue={b[k]} pattern="#[0-9a-fA-F]{6}" className="input max-w-[10rem] font-mono" /></div>))}
          </AdminForm>
          <p className="meta mt-3">Plan: {ent?.plan_key ?? "–"} · Billing cycle field: {ent?.cycle ?? "–"} · Billing status: Not enabled</p>
        </section>
      )}
    </div>
  );
}
