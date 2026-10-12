// ISSUE-19 business verification and public ranking rules (pure; unit-tested in tests/unit/business.test.ts).
// Verification is evidence-based and done by a person: a link to an official record plus notes. Demo businesses are examples and can
// never be verified. Public ranking: verified first; a paid (sponsored) placement never lifts an unverified business above verified ones.
export type BizState = "unverified" | "pending" | "needs_info" | "verified" | "rejected" | "suspended";
export type BizAction = "verify" | "request_info" | "reject" | "suspend" | "reopen";
export type Evidence = { url: string; note: string };

export const STATE_LABEL: Record<BizState, string> = { unverified: "Not yet reviewed", pending: "Review requested", needs_info: "Information requested", verified: "Verified by Palavva staff",
  rejected: "Not verified", suspended: "Suspended" };
export const ACTION_LABEL: Record<BizAction, string> = { verify: "Verify", request_info: "Request information", reject: "Reject", suspend: "Suspend", reopen: "Reopen review" };
const RULES: Record<BizAction, { to: BizState; from: BizState[]; role: "editor" | "tenant_admin"; minNote: number; evidence: boolean }> = {
  verify: { to: "verified", from: ["unverified", "pending", "needs_info"], role: "tenant_admin", minNote: 20, evidence: true },
  request_info: { to: "needs_info", from: ["unverified", "pending", "needs_info"], role: "editor", minNote: 10, evidence: false },
  reject: { to: "rejected", from: ["unverified", "pending", "needs_info"], role: "tenant_admin", minNote: 20, evidence: false },
  suspend: { to: "suspended", from: ["verified"], role: "tenant_admin", minNote: 20, evidence: false },
  reopen: { to: "unverified", from: ["rejected", "suspended"], role: "tenant_admin", minNote: 10, evidence: false },
};
export const actionRule = (a: BizAction) => RULES[a];
export const actionsFor = (state: BizState, isDemo: boolean): BizAction[] =>
  (Object.keys(RULES) as BizAction[]).filter((a) => RULES[a].from.includes(state) && !(a === "verify" && isDemo));

export function checkDecision(input: { action: string; state: string; isDemo: boolean; note: string; evidence: Evidence[]; can: (role: "editor" | "tenant_admin") => boolean }):
  { ok: true; to: BizState } | { ok: false; message: string } {
  const r = RULES[input.action as BizAction];
  if (!r) return { ok: false, message: "Unknown action." };
  if (!input.can(r.role)) return { ok: false, message: `${ACTION_LABEL[input.action as BizAction]} needs the ${r.role === "tenant_admin" ? "tenant admin" : "editor"} role.` };
  if (!r.from.includes(input.state as BizState)) return { ok: false, message: `A business that is "${STATE_LABEL[input.state as BizState] ?? input.state}" cannot be changed with ${ACTION_LABEL[input.action as BizAction]}.` };
  if (input.action === "verify" && input.isDemo) return { ok: false, message: "Demo businesses are examples and can never be verified." };
  if (input.note.trim().length < r.minNote) return { ok: false, message: `Write a note of at least ${r.minNote} characters; it is kept in the verification history.` };
  if (r.evidence) {
    const good = input.evidence.filter((e) => /^https:\/\/[^\s]+\.[^\s]+/.test(e.url) && !/example\.(invalid|com|org)/.test(e.url));
    if (!good.length) return { ok: false, message: "Add at least one https link to the evidence you checked (for example an official registry entry or the business's own site)." };
  }
  return { ok: true, to: r.to };
}

export type DirRow = { id: string; name: string; state: BizState; isDemo: boolean; created: string; sponsored: boolean; editorial: boolean };
/** Organic directory order + the labelled sponsored strip. Rejected/suspended never listed; demo rows last and labelled. */
export function rankDirectory<T extends DirRow>(rows: T[]): { organic: T[]; sponsored: T[] } {
  const visible = rows.filter((r) => r.state !== "rejected" && r.state !== "suspended");
  const tier = (r: T) => (r.isDemo ? 3 : r.state === "verified" ? 0 : r.editorial ? 1 : 2);
  const organic = [...visible].sort((a, b) => tier(a) - tier(b) || b.created.localeCompare(a.created) || a.name.localeCompare(b.name));
  // A paid placement is shown in its own labelled strip only for verified businesses; an unverified payer gets no extra prominence.
  const sponsored = visible.filter((r) => r.sponsored && r.state === "verified" && !r.isDemo);
  return { organic, sponsored };
}
