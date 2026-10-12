"use client";
// ISSUE-23 access history: sign-ins, MFA, invitations, role and matrix changes, suspensions, refused attempts (append-only audit).
import { DataTable, type Column } from "../DataTable";

export type HistoryRow = { id: string; at: string; actor: string; action: string; target: string; detail: string };
const PLAIN: Record<string, string> = {
  "auth.sign_in": "Signed in", "auth.locked": "Locked after 10 wrong passwords", "auth.mfa_enabled": "Turned on MFA", "auth.mfa_passed": "Passed MFA", "auth.mfa_failed": "Wrong MFA code",
  "auth.mfa_recovery_used": "Used a recovery code", "auth.password_reset": "Reset password by email link", "auth.password_reset_requested": "Asked for a reset link", "auth.email_verified": "Confirmed email",
  "account.password_changed": "Changed password", "account.email_change_requested": "Asked to change email", "account.email_changed": "Changed email", "account.sessions_revoked": "Signed out other devices",
  "access.invited": "Invited", "access.invitation_accepted": "Accepted invitation", "access.invitation_revoked": "Revoked invitation", "access.role_changed": "Changed role",
  "access.role_change_refused": "Role change refused", "access.account_suspended": "Suspended account", "access.account_reactivated": "Reactivated account", "access.recovery_link_sent": "Sent reset link",
  "access.sessions_revoked": "Signed out everywhere", "access.mfa_reset": "Reset MFA", "access.matrix_changed": "Changed permissions", "access.matrix_reset": "Restored default permissions",
  "access.matrix_change_refused": "Permission change refused", "newsletter.confirmed": "Confirmed newsletter", "newsletter.unsubscribed": "Unsubscribed",
};
export function AccessHistory({ rows, compact = false }: { rows: HistoryRow[]; compact?: boolean }) {
  const cols: Column<HistoryRow>[] = [
    { key: "at", header: "When (UTC)", cell: (r) => <span className="whitespace-nowrap text-xs">{r.at.slice(0, 16)}</span>, sort: (r) => r.at },
    { key: "actor", header: "Who", cell: (r) => r.actor, sort: (r) => r.actor },
    { key: "action", header: "What", cell: (r) => <span className={/refused|failed|locked/.test(r.action) ? "font-semibold text-danger" : ""}>{PLAIN[r.action] ?? r.action}</span>, sort: (r) => r.action },
    ...(compact ? [] : [{ key: "target", header: "Affecting", cell: (r: HistoryRow) => r.target }]),
    { key: "detail", header: "Details", cell: (r) => <span className="text-xs">{r.detail || "—"}</span> },
  ];
  return <DataTable caption="Access history" testid={compact ? "user-history" : "access-history"} rows={rows} columns={cols} rowKey={(r) => r.id} initialSort={{ key: "at", dir: "desc" }}
    initialPageSize={compact ? 25 : 50} search={(r) => `${r.actor} ${PLAIN[r.action] ?? r.action} ${r.target} ${r.detail}`}
    filters={compact ? [] : [{ key: "type", label: "Type", options: [{ value: "auth", label: "Sign-in & MFA" }, { value: "access", label: "Access changes" }, { value: "account", label: "Self-service" }, { value: "newsletter", label: "Newsletter" }], get: (r) => r.action.split(".")[0] }]}
    empty="No access events recorded yet." />;
}
