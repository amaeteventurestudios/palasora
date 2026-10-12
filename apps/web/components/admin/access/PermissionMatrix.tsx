"use client";
// ISSUE-23 role × permission checkbox matrix. One role at a time: tick what the role may do, give a reason, save. The server re-checks
// everything (you can only grant what you hold, never Super Administrator's row, never your own role's row, revision check).
import { startTransition, useActionState, useEffect, useMemo, useState } from "react";
import { Lock } from "lucide-react";
import { saveRolePermissions } from "@/app/actions/access";
import type { ActionState } from "@/app/actions/member";
import { HelpTip } from "../HelpTip";
import { cn } from "@/lib/utils";

type RoleView = { key: string; name: string; kind: string; summary: string; locked: boolean; derived: string; mfa: boolean; perms: string[]; template: string[]; customised: boolean; holders: number };
const ACTION_HELP: Record<string, string> = { view: "Open the pages and read the records.", create: "Add new records (for example invite a person or add a source).", edit: "Change existing records and non-approval settings.",
  approve: "Make decisions that publish, verify, release or reject something.", delete: "Remove, unpublish or suspend records (history is always kept).", export: "Download records as files.",
  administer: "Change switches, limits and rules that affect the whole module." };

export function PermissionMatrix({ modules, actions, roles, revisions, actorPerms, actorRole, canAdminister, sensitive }: { modules: { key: string; label: string; help: string }[]; actions: string[];
  roles: RoleView[]; revisions: Record<string, number>; actorPerms: string[]; actorRole: string; canAdminister: boolean; sensitive: string[] }) {
  const [roleKey, setRoleKey] = useState(roles.find((r) => r.kind === "staff" && !r.locked)?.key ?? roles[0].key);
  const role = roles.find((r) => r.key === roleKey)!;
  const [ticked, setTicked] = useState<Record<string, Set<string>>>(() => Object.fromEntries(roles.map((r) => [r.key, new Set(r.perms)])));
  const [state, action, pending] = useActionState<ActionState, FormData>(saveRolePermissions, { ok: false, message: "" });
  const [reason, setReason] = useState(""); // controlled: a refused save keeps what was typed (React resets uncontrolled fields)
  useEffect(() => { if (state.ok) setReason(""); }, [state]);
  const mine = useMemo(() => new Set(actorPerms), [actorPerms]);
  const sens = useMemo(() => new Set(sensitive), [sensitive]);
  const editable = canAdminister && role.kind === "staff" && !role.locked && role.key !== actorRole;
  const cur = ticked[roleKey];
  const why = !canAdminister ? "Your role can look at the matrix but not change it." : role.locked ? "Super Administrator always has every permission." : role.kind !== "staff" ? "Public roles never open the Command Center." : role.key === actorRole ? "You cannot change your own role's permissions." : "";
  const toggle = (p: string) => setTicked((t) => { const n = new Set(t[roleKey]); if (n.has(p)) n.delete(p); else n.add(p); return { ...t, [roleKey]: n }; });
  const changed = [...cur].filter((p) => !role.perms.includes(p)).length + role.perms.filter((p) => !cur.has(p)).length;
  return (
    <div className="flex flex-col gap-3" data-testid="permission-matrix">
      <div className="flex flex-wrap gap-1" role="tablist" aria-label="Roles">{roles.map((r) => (
        <button key={r.key} type="button" role="tab" aria-selected={r.key === roleKey} onClick={() => setRoleKey(r.key)} data-testid={`matrix-role-${r.key}`}
          className={cn("rounded-full border px-3 py-1 text-xs font-medium", r.key === roleKey ? "border-transparent bg-primary text-primary-foreground" : "hover:bg-accent", r.kind === "public" && "border-dashed")}>
          {r.name}{r.customised ? " •" : ""} <span className="opacity-70">({r.holders})</span></button>))}</div>
      <div className="rounded-xl border p-3 text-sm"><p><b>{role.name}</b> — {role.summary}</p>
        <p className="mt-1 text-xs text-muted-foreground">{role.holders} active {role.holders === 1 ? "person has" : "people have"} this role · {role.mfa ? "needs MFA" : "MFA needed only if given sensitive permissions"}{role.customised ? " · customised from the default template" : " · default template"}{role.derived ? ` · earned when the person ${role.derived}` : ""}</p>
        {why && <p className="mt-1 text-xs font-semibold" data-testid="matrix-readonly">{why}</p>}</div>
      <form action={action} className="flex flex-col gap-3" onSubmit={(e) => { // dispatch without React's automatic form reset (keeps the reason on refusal)
        e.preventDefault(); const fd = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter); startTransition(() => action(fd)); }}>
        <input type="hidden" name="role" value={roleKey} /><input type="hidden" name="revision" value={revisions[roleKey] ?? 0} />
        {[...cur].map((p) => <input key={p} type="hidden" name="perm" value={p} />)}
        <div className="overflow-x-auto rounded-xl border" role="region" aria-label={`Permissions for ${role.name}`} tabIndex={0}>
          <table className="w-full min-w-[760px] text-sm">
            <thead className="sticky top-0 bg-card text-xs text-muted-foreground"><tr><th scope="col" className="px-3 py-2 text-start">Part of the Command Center</th>
              {actions.map((a) => <th key={a} scope="col" className="px-2 py-2 text-center capitalize"><span className="inline-flex items-center gap-0.5">{a}<HelpTip label={`“${a}” permission`} what={ACTION_HELP[a]} /></span></th>)}</tr></thead>
            <tbody className="divide-y">{modules.map((m) => (
              <tr key={m.key}><th scope="row" className="px-3 py-2 text-start font-medium"><span className="inline-flex items-center gap-1">{m.label}<HelpTip label={m.label} what={m.help} /></span></th>
                {actions.map((a) => { const p = `${m.key}.${a}`, on = cur.has(p), canGrant = mine.has(p) || !on;
                  const disabled = !editable || (!mine.has(p) && !on);
                  return <td key={a} className={cn("px-2 py-2 text-center", sens.has(p) && "bg-[color-mix(in_oklab,var(--danger)_8%,transparent)]")}>
                    <label className="inline-flex items-center gap-1"><input type="checkbox" checked={on} disabled={disabled || !canGrant} onChange={() => toggle(p)} className="h-4 w-4 accent-[var(--brand-tangerine)]"
                      aria-label={`${role.name}: ${m.label} — ${a}${sens.has(p) ? " (sensitive)" : ""}`} data-testid={`perm-${p}`} />{sens.has(p) && <Lock className="size-3 text-danger" aria-hidden="true" />}</label></td>; })}</tr>))}</tbody>
          </table>
        </div>
        {editable && <div className="flex flex-col gap-2 rounded-xl border p-3">
          <p className="text-sm">{changed ? `${changed} unsaved ${changed === 1 ? "change" : "changes"}.` : "No changes yet."} Greyed-out boxes are permissions you do not hold yourself, so you cannot give them.</p>
          <textarea name="reason" value={reason} onChange={(e) => setReason(e.target.value)} className="min-h-16 rounded-md border bg-background p-2 text-sm" placeholder="Reason for this change (at least 10 characters; kept in the access history)" aria-label="Reason for the permission change" data-testid="matrix-reason" />
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-primary !min-h-[40px] text-sm" disabled={pending || !changed} data-testid="matrix-save">{pending ? "Saving…" : "Save permissions"}</button>
            {role.customised && <button className="btn btn-secondary !min-h-[40px] text-sm" name="reset" value="1" disabled={pending}>Restore the default template</button>}
          </div>
          {state.message && <p role="status" className={`text-sm ${state.ok ? "text-success" : "text-danger"}`} data-testid="matrix-result">{state.message}</p>}
          <p className="text-xs text-muted-foreground">People with this role must pass MFA again before their changed powers apply.</p>
        </div>}
      </form>
    </div>
  );
}
