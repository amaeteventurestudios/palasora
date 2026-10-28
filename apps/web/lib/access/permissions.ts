// ISSUE-23 Users & Access: one permission vocabulary for the whole Command Center. Pure module (no I/O) so the same rules run in
// middleware, server actions, API routes, the matrix editor and unit tests.
//
//   permission = `${module}.${action}`   e.g. "content.approve", "revenue.view"
//   role       = a named template of permissions; a tenant may override a role's checkboxes (stored in access_roles)
//
// Deny by default: a permission that is not in the role's list is refused. Super Administrator is the only role that holds every
// permission, and its list cannot be edited. Sensitive permissions (see isSensitive: every real-money permission, changing settings,
// switches or secrets, exporting the audit trail, and changing the permission matrix) are in no template except Super Administrator's
// and Finance's own revenue module; anyone else gets them only when a Super Administrator ticks them explicitly.

export const ACTIONS = ["view", "create", "edit", "approve", "delete", "export", "administer"] as const;
export type Action = (typeof ACTIONS)[number];

export const ACTION_HELP: Record<Action, string> = {
  view: "Open the pages and read the records.",
  create: "Add new records (for example invite a person or add a source).",
  edit: "Change existing records and settings that are not approvals.",
  approve: "Make decisions that publish, verify, release or reject something.",
  delete: "Remove, unpublish or suspend records (history is always kept).",
  export: "Download records as files.",
  administer: "Change switches, limits and rules that affect the whole module.",
};

export type ModuleDef = { key: string; label: string; group: string; sensitive?: "finance" | "security" | "secrets"; routes: string[]; help: string };

// Route prefixes are matched longest-first; "/admin" alone is the Overview. API prefixes under /api/admin/* map the same way.
export const MODULES: ModuleDef[] = [
  { key: "overview", label: "Overview & reports", group: "Overview", routes: ["/admin", "/admin/reports"], help: "The front page of the Command Center and the evidence reports." },
  { key: "audience", label: "Audience & analytics", group: "Audience", routes: ["/admin/audience", "/admin/geography", "/admin/analytics"], help: "Human visitor numbers, countries and the event pipeline. Personal details are never shown here." },
  { key: "agents", label: "Agents & AI engine", group: "Agents & AI", routes: ["/admin/engine", "/admin/agent-city", "/admin/city", "/admin/conversations", "/admin/ai", "/admin/models",
    "/api/admin/engine-config", "/api/admin/agent-population"], help: "The AI resident agents, their conversations, the engine controls and model usage." },
  { key: "content", label: "Social & regions", group: "Content & Regions", routes: ["/admin/social", "/admin/translations", "/admin/regions", "/admin/trends",
    "/api/admin/region-priority"], help: "SubPals, translations, regional priorities and trends." },
  { key: "moderation", label: "Moderation", group: "Content & Regions", routes: ["/admin/moderation"], help: "Reports, held replies, quarantine and appeals." },
  { key: "economy", label: "Sora & Exchange", group: "Economy", routes: ["/admin/sora", "/admin/pals", "/admin/exchange", "/admin/town", "/api/admin/pals-policy"], help: "The fictional Sora coins and the simulated Exchange. No real money." },
  { key: "revenue", label: "Revenue & payments", group: "Commerce", sensitive: "finance", routes: ["/admin/revenue"], help: "Real-money records: payments, credits, refunds and invoices. Sensitive." },
  { key: "advertising", label: "Advertising & sponsors", group: "Commerce", routes: ["/admin/sponsors", "/admin/advertising"], help: "Sponsor inquiries, the CRM pipeline and ad placements (Revive)." },
  { key: "businesses", label: "Businesses & founders", group: "Commerce", routes: ["/admin/businesses"], help: "Real business profiles and their verification." },
  { key: "games", label: "Games", group: "Community", routes: ["/admin/games", "/admin/grand-prix"], help: "Palavva Games and Agent Grand Prix: matches, tournaments, sign-ups, passes and prizes." },
  { key: "operations", label: "Operations & health", group: "Operations", routes: ["/admin/ops", "/admin/infrastructure", "/admin/health"], help: "Services, backups, jobs and system health." },
  { key: "settings", label: "Settings, switches & audit", group: "Operations", sensitive: "secrets", routes: ["/admin/settings", "/admin/tenants"], help: "Emergency switches, platform configuration, email status and the audit history. Sensitive." },
  { key: "users", label: "Users & access", group: "Operations", sensitive: "security", routes: ["/admin/users"], help: "People, roles, invitations, sessions and the permission matrix. Sensitive." },
];
export const MODULE_KEYS = MODULES.map((m) => m.key);
export type Perm = `${string}.${Action}`;
export const ALL_PERMS: Perm[] = MODULES.flatMap((m) => ACTIONS.map((a) => `${m.key}.${a}` as Perm));

const all = (mod: string, acts: readonly Action[] = ACTIONS) => acts.map((a) => `${mod}.${a}` as Perm);
const VIEW_EXPORT = ["view", "export"] as const;

export type LegacyRole = "member" | "reviewer" | "editor" | "moderator" | "tenant_admin" | "platform_admin";
export type RoleTemplate = { key: string; name: string; kind: "staff" | "public"; summary: string; legacy: LegacyRole; mfa: boolean; perms: Perm[]; locked?: boolean; derived?: string };

const NON_SENSITIVE = MODULES.filter((m) => !m.sensitive).map((m) => m.key);

export const ROLE_TEMPLATES: RoleTemplate[] = [
  { key: "super_admin", name: "Super Administrator", kind: "staff", legacy: "platform_admin", mfa: true, locked: true, perms: [...ALL_PERMS],
    summary: "Complete authority over the platform, including money, secrets, security and who can do what. Needs a second sign-in step (MFA)." },
  { key: "admin", name: "Administrator", kind: "staff", legacy: "tenant_admin", mfa: true,
    perms: [...NON_SENSITIVE.flatMap((m) => all(m)), ...all("users", ["view", "create", "edit"]), "settings.view"],
    summary: "Runs every everyday module. Does not see money, secrets or security settings, and cannot change role permissions, unless a Super Administrator ticks them." },
  { key: "operations_admin", name: "Operations Administrator", kind: "staff", legacy: "reviewer", mfa: false,
    perms: [...all("operations", ["view", "edit", "export", "administer"]), ...all("agents", ["view", "edit", "administer"]), "overview.view", "audience.view", "content.view", "games.view", "settings.view"],
    summary: "Keeps services, jobs and the AI engine running. No access to revenue, secrets or role grants." },
  { key: "editorial_manager", name: "Editorial Manager", kind: "staff", legacy: "editor", mfa: false,
    perms: [...all("content", ["view", "create", "edit", "approve", "delete", "export"]), ...all("moderation", ["view", "approve", "delete"]), "overview.view", "agents.view", "agents.edit", "businesses.view", "businesses.edit"],
    summary: "Approves, holds and corrects editorial content and sources; pauses or unpublishes conversations; helps with moderation." },
  { key: "moderator", name: "Moderator", kind: "staff", legacy: "moderator", mfa: false,
    perms: [...all("moderation", ["view", "edit", "approve", "delete"]), "content.view", "agents.view", "agents.edit", "games.view", "games.delete", "overview.view", "economy.view", "economy.approve"],
    summary: "Handles reports, held replies, quarantine and appeals, can pause a misbehaving agent or thread, and reviews Sora/Exchange integrity warnings (cannot change economy rules)." },
  { key: "finance_manager", name: "Finance / Revenue Manager", kind: "staff", legacy: "reviewer", mfa: true,
    perms: [...all("revenue", ["view", "edit", "approve", "export"]), ...all("economy", VIEW_EXPORT), "advertising.view", "overview.view"],
    summary: "Sees and reconciles real-money records. Refunds and payment settings are approvals. Needs MFA." },
  { key: "ad_manager", name: "Advertising / Sponsorship Manager", kind: "staff", legacy: "reviewer", mfa: false,
    perms: [...all("advertising", ["view", "create", "edit", "approve", "export"]), "businesses.view", "overview.view"],
    summary: "Works sponsor inquiries, the CRM pipeline and non-billable ad placements. Cannot activate billing." },
  { key: "support_staff", name: "Support Staff", kind: "staff", legacy: "reviewer", mfa: false,
    perms: ["users.view", "businesses.view", "moderation.view", "overview.view", "agents.view", "games.view"],
    summary: "Looks people up to help them. Can send a password-reset link but cannot change roles or see money." },
  { key: "registered_user", name: "Registered Human User", kind: "public", legacy: "member", mfa: false, perms: [],
    summary: "Reads, posts, replies and votes (Palasora), follows, saves and shares; creates and manages their own agents; plays games. No Command Center access." },
  { key: "verified_agent_owner", name: "Verified Agent Owner", kind: "public", legacy: "member", mfa: false, perms: [], derived: "owns at least one agent whose runtime completed the ownership claim",
    summary: "A registered user whose external agent proved it holds the key issued to them. This proves control of the agent, not the person's identity." },
  { key: "business_owner", name: "Business Account Owner", kind: "public", legacy: "member", mfa: false, perms: [], derived: "manages at least one business profile",
    summary: "A registered user who manages a business profile. Verification of the business is a separate, evidence-based staff decision." },
];

// Palasora Phase 1: public participation. Separate from the Command Center modules above (public roles never enter the Command
// Center): what a signed-in person may create in the public network. Deny by default; "Registered Human User" and every role built
// on it (agent owners, business owners) and every staff role may create posts, replies and votes. Abuse limits, suspensions and the
// HUMAN_WRITES_PAUSED switch still apply on top (lib/social/human.ts).
export const SOCIAL_MODULES = ["posts", "replies", "votes"] as const;
export type SocialModule = (typeof SOCIAL_MODULES)[number];
export type SocialPerm = `${SocialModule}.create`;
const SOCIAL_ALL: SocialPerm[] = SOCIAL_MODULES.map((m) => `${m}.create` as SocialPerm);
export const SOCIAL_PERMS: Record<string, SocialPerm[]> = {
  registered_user: SOCIAL_ALL, verified_agent_owner: SOCIAL_ALL, business_owner: SOCIAL_ALL,
  super_admin: SOCIAL_ALL, admin: SOCIAL_ALL, operations_admin: SOCIAL_ALL, editorial_manager: SOCIAL_ALL, moderator: SOCIAL_ALL,
  finance_manager: SOCIAL_ALL, ad_manager: SOCIAL_ALL, support_staff: SOCIAL_ALL,
};
export const canParticipate = (roleKey: string, module: SocialModule): boolean => (SOCIAL_PERMS[roleKey] ?? []).includes(`${module}.create` as SocialPerm);

export const TEMPLATE = Object.fromEntries(ROLE_TEMPLATES.map((r) => [r.key, r])) as Record<string, RoleTemplate>;
export const STAFF_ROLE_KEYS = ROLE_TEMPLATES.filter((r) => r.kind === "staff").map((r) => r.key);

/** Existing memberships carry only the legacy role; map it to a template until someone assigns a new role. */
export const FROM_LEGACY: Record<LegacyRole, string> = {
  platform_admin: "super_admin", tenant_admin: "admin", editor: "editorial_manager", moderator: "moderator", reviewer: "support_staff", member: "registered_user",
};

export function effectiveRoleKey(m: { role?: string; access_role?: string } | null | undefined): string {
  if (!m) return "registered_user";
  if (m.access_role && TEMPLATE[m.access_role]) return m.access_role;
  return FROM_LEGACY[(m.role ?? "member") as LegacyRole] ?? "registered_user";
}

/** Clean a stored override: only known permissions survive; super_admin can never be narrowed. */
export function sanitizePerms(roleKey: string, perms: unknown): Perm[] {
  if (roleKey === "super_admin") return [...ALL_PERMS];
  const known = new Set<string>(ALL_PERMS);
  return [...new Set((Array.isArray(perms) ? perms : []).filter((p): p is Perm => typeof p === "string" && known.has(p)))].sort() as Perm[];
}

export function permsFor(roleKey: string, override?: unknown): Set<Perm> {
  const t = TEMPLATE[roleKey];
  if (!t) return new Set();
  if (t.locked) return new Set(t.perms);
  if (t.kind === "public") return new Set(); // public roles never reach the Command Center
  return new Set(override !== undefined && override !== null ? sanitizePerms(roleKey, override) : t.perms);
}

/** Which module guards a pathname (longest matching prefix). null = not a Command Center path. */
export function moduleForPath(pathname: string): string | null {
  const p = pathname.replace(/\/+$/, "") || "/";
  if (!/^\/(admin|api\/admin)(\/|$)/.test(p)) return null;
  let best: { key: string; len: number } | null = null;
  for (const m of MODULES) for (const r of m.routes) {
    if ((r === "/admin" ? p === "/admin" : p === r || p.startsWith(r + "/")) && (!best || r.length > best.len)) best = { key: m.key, len: r.length };
  }
  return best?.key ?? "unmapped";
}

export const can = (perms: Set<Perm> | Perm[], module: string, action: Action): boolean =>
  (perms instanceof Set ? perms : new Set(perms)).has(`${module}.${action}` as Perm);

export const canEnterCommandCenter = (perms: Set<Perm>): boolean => [...perms].some((p) => p.endsWith(".view"));

/** Privilege-escalation guard for every role change. Rules (all must hold):
 *  1. the actor holds users.edit (assign) — and users.administer to change the matrix itself;
 *  2. nobody changes their own role or their own suspension;
 *  3. only a Super Administrator grants, removes or edits Super Administrator;
 *  4. an actor can only hand out permissions they hold themselves (the target role's set must be a subset of the actor's);
 *  5. an actor cannot change someone whose current permissions exceed their own. */
export function checkRoleChange(o: { actorRole: string; actorPerms: Set<Perm>; actorId: string; targetId: string; targetCurrentPerms: Set<Perm>; targetCurrentRole: string;
  newRole: string; newRolePerms: Set<Perm> }): { ok: true } | { ok: false; reason: string } {
  if (!o.actorPerms.has("users.edit")) return { ok: false, reason: "Your role cannot change other people's roles." };
  if (o.actorId === o.targetId) return { ok: false, reason: "You cannot change your own role. Ask another administrator." };
  if (!TEMPLATE[o.newRole]) return { ok: false, reason: "Unknown role." };
  if ((o.newRole === "super_admin" || o.targetCurrentRole === "super_admin") && o.actorRole !== "super_admin")
    return { ok: false, reason: "Only a Super Administrator can grant or remove Super Administrator." };
  const missing = [...o.newRolePerms].filter((p) => !o.actorPerms.has(p));
  if (missing.length) return { ok: false, reason: `That role includes permissions you do not hold (${missing.slice(0, 3).join(", ")}${missing.length > 3 ? "…" : ""}).` };
  const above = [...o.targetCurrentPerms].filter((p) => !o.actorPerms.has(p));
  if (above.length) return { ok: false, reason: "This person currently has permissions you do not hold, so you cannot change their role." };
  return { ok: true };
}

/** Matrix edits: only holders of users.administer; never super_admin's row; never grant what you do not hold; never edit your own role's row. */
export function checkMatrixEdit(o: { actorRole: string; actorPerms: Set<Perm>; roleKey: string; next: Perm[] }): { ok: true } | { ok: false; reason: string } {
  if (!o.actorPerms.has("users.administer")) return { ok: false, reason: "Changing the permission matrix needs the Users & access → administer permission." };
  const t = TEMPLATE[o.roleKey];
  if (!t || t.kind !== "staff") return { ok: false, reason: "Only staff roles have Command Center permissions." };
  if (t.locked) return { ok: false, reason: "Super Administrator always has every permission; it cannot be edited." };
  if (o.roleKey === o.actorRole) return { ok: false, reason: "You cannot change the permissions of your own role." };
  const missing = o.next.filter((p) => !o.actorPerms.has(p));
  if (missing.length) return { ok: false, reason: `You can only grant permissions you hold yourself (${missing.slice(0, 3).join(", ")}).` };
  return { ok: true };
}

/** Money, secrets and security: every revenue permission; settings beyond reading; changing the matrix. */
export function isSensitive(p: Perm): boolean {
  const [mod, act] = p.split(".");
  if (mod === "revenue") return true;
  if (mod === "settings") return act !== "view";
  if (mod === "users") return act === "administer" || act === "export" || act === "delete";
  return false;
}
export const sensitiveGrants = (perms: Iterable<Perm>): Perm[] => [...perms].filter(isSensitive);
