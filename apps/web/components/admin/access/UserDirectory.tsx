"use client";
// ISSUE-23 people directory: search, role/kind/status/MFA filters, sort, 25/50/100/250/All; a row opens the person panel.
import { useRouter } from "next/navigation";
import { DataTable, type Column } from "../DataTable";
import { Badge } from "@/components/ui/badge";

export type UserRow = { id: string; name: string; handle: string; email: string; roleKey: string; roleName: string; staff: boolean; status: string; verified: boolean; mfa: string;
  lastLogin: string; created: string; agents: number; verifiedAgents: number; badges: string[]; sessions: number; isLocal: boolean };

export function UserDirectory({ rows, selected }: { rows: UserRow[]; selected?: string }) {
  const router = useRouter();
  const cols: Column<UserRow>[] = [
    { key: "name", header: "Person", cell: (r) => <span className={r.id === selected ? "font-bold" : "font-medium"}>{r.name} <span className="text-xs text-muted-foreground">@{r.handle}</span>{r.isLocal && <Badge variant="secondary" className="ms-2">local dev</Badge>}</span>, sort: (r) => r.name.toLowerCase() },
    { key: "email", header: "Email", cell: (r) => <span className="text-xs">{r.email} {r.verified ? <span className="text-success">✓</span> : <span className="text-muted-foreground">(not confirmed)</span>}</span>, sort: (r) => r.email },
    { key: "role", header: "Role", cell: (r) => <Badge variant={r.staff ? "default" : "outline"}>{r.roleName}</Badge>, sort: (r) => r.roleName },
    { key: "earned", header: "Earned", cell: (r) => r.badges.length ? <span className="text-xs">{r.badges.join(", ")}</span> : "—" },
    { key: "status", header: "Account", cell: (r) => <Badge variant={r.status === "active" ? "outline" : "destructive"}>{r.status}</Badge>, sort: (r) => r.status },
    { key: "mfa", header: "MFA", cell: (r) => (r.mfa === "on" ? "on" : r.mfa === "needed" ? <span className="text-danger">needed</span> : "—"), sort: (r) => r.mfa },
    { key: "agents", header: "Agents", cell: (r) => `${r.agents}${r.verifiedAgents ? ` (${r.verifiedAgents} verified)` : ""}`, sort: (r) => r.agents, align: "end" },
    { key: "login", header: "Last sign-in", cell: (r) => <span className="text-xs">{r.lastLogin ? r.lastLogin.slice(0, 16) : "—"}</span>, sort: (r) => r.lastLogin },
    { key: "created", header: "Joined", cell: (r) => <span className="text-xs">{r.created.slice(0, 10)}</span>, sort: (r) => r.created },
  ];
  const roles = [...new Map(rows.map((r) => [r.roleKey, r.roleName])).entries()].map(([value, label]) => ({ value, label }));
  return <DataTable caption="People" testid="user-table" rows={rows} columns={cols} rowKey={(r) => r.id} initialSort={{ key: "created", dir: "desc" }} initialPageSize={50}
    search={(r) => `${r.name} ${r.handle} ${r.email} ${r.roleName} ${r.badges.join(" ")}`} onRowClick={(r) => router.push(`/admin/users?id=${r.id}#person`)}
    filters={[{ key: "kind", label: "Kind", options: [{ value: "staff", label: "Staff" }, { value: "public", label: "Public" }], get: (r) => (r.staff ? "staff" : "public") },
      { key: "role", label: "Role", options: roles, get: (r) => r.roleKey },
      { key: "status", label: "Account", options: [...new Set(rows.map((r) => r.status))].map((v) => ({ value: v, label: v })), get: (r) => r.status }]}
    empty="No accounts yet." />;
}
