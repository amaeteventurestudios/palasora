import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { ALL_PERMS, MODULES, ROLE_TEMPLATES, TEMPLATE, checkMatrixEdit, checkRoleChange, effectiveRoleKey, isSensitive, moduleForPath, permsFor, sanitizePerms, type Perm } from "../../lib/access/permissions";
import { base32Decode, base32Encode, hotp, seal, totp, unseal, verifyTotp, hashCode, newRecoveryCodes } from "../../lib/access/totp";

const P = (k: string) => permsFor(k);
const change = (actor: string, target: string, to: string, actorId = "a", targetId = "b") => checkRoleChange({ actorRole: actor, actorPerms: P(actor), actorId, targetId,
  targetCurrentPerms: P(target), targetCurrentRole: target, newRole: to, newRolePerms: P(to) });

describe("ISSUE-23 permission matrix", () => {
  it("has the eleven requested roles and only Super Administrator holds every permission", () => {
    expect(ROLE_TEMPLATES.map((r) => r.name)).toEqual(["Super Administrator", "Administrator", "Operations Administrator", "Editorial Manager", "Moderator", "Finance / Revenue Manager",
      "Advertising / Sponsorship Manager", "Support Staff", "Registered Human User", "Verified Agent Owner", "Business Account Owner"]);
    expect(P("super_admin").size).toBe(ALL_PERMS.length);
    for (const r of ROLE_TEMPLATES.filter((x) => x.key !== "super_admin")) expect(P(r.key).size).toBeLessThan(ALL_PERMS.length);
  });
  it("sensitive money/secrets/security permissions are in no template except Super Admin and Finance's own revenue module", () => {
    for (const r of ROLE_TEMPLATES.filter((x) => x.key !== "super_admin")) {
      const s = [...P(r.key)].filter(isSensitive);
      if (r.key === "finance_manager") expect(s.every((p) => p.startsWith("revenue."))).toBe(true); else expect(s).toEqual([]);
    }
  });
  it("Operations cannot see revenue or secrets and cannot change role grants", () => {
    const ops = P("operations_admin");
    for (const a of ["view", "edit", "export", "administer"]) expect(ops.has(`revenue.${a}` as Perm)).toBe(false);
    expect(ops.has("settings.edit")).toBe(false); expect(ops.has("settings.administer")).toBe(false);
    expect(ops.has("users.edit")).toBe(false); expect(ops.has("users.administer")).toBe(false);
    expect(change("operations_admin", "support_staff", "editorial_manager").ok).toBe(false);
  });
  it("Administrator is broad but gets no finance, secrets or matrix control unless ticked", () => {
    const adm = P("admin");
    expect(adm.has("content.approve") && adm.has("operations.administer") && adm.has("economy.administer")).toBe(true);
    expect([...adm].some((p) => p.startsWith("revenue."))).toBe(false);
    expect(adm.has("settings.administer") || adm.has("users.administer")).toBe(false);
    expect(permsFor("admin", [...TEMPLATE.admin.perms, "revenue.view"]).has("revenue.view")).toBe(true); // explicit override works
  });
  it("public roles never reach the Command Center, even if an override tries", () => {
    for (const k of ["registered_user", "verified_agent_owner", "business_owner"]) { expect(P(k).size).toBe(0); expect(permsFor(k, ["overview.view"]).size).toBe(0); }
  });
  it("legacy memberships map to templates; unknown overrides are dropped; super admin cannot be narrowed", () => {
    expect(effectiveRoleKey({ role: "platform_admin" })).toBe("super_admin");
    expect(effectiveRoleKey({ role: "tenant_admin" })).toBe("admin");
    expect(effectiveRoleKey({ role: "editor" })).toBe("editorial_manager");
    expect(effectiveRoleKey({ role: "member", access_role: "finance_manager" })).toBe("finance_manager");
    expect(effectiveRoleKey({ role: "member", access_role: "made_up" })).toBe("registered_user");
    expect(sanitizePerms("moderator", ["moderation.view", "evil.view", 42])).toEqual(["moderation.view"]);
    expect(permsFor("super_admin", []).size).toBe(ALL_PERMS.length);
  });
  it("maps every admin route to a module (longest prefix) and leaves public paths alone", () => {
    expect(moduleForPath("/admin")).toBe("overview");
    expect(moduleForPath("/admin/engine/controls")).toBe("agents");
    expect(moduleForPath("/admin/revenue")).toBe("revenue");
    expect(moduleForPath("/admin/users/")).toBe("users");
    expect(moduleForPath("/api/admin/pals-policy")).toBe("economy");
    expect(moduleForPath("/admin/brand-new-page")).toBe("unmapped");
    expect(moduleForPath("/exchange")).toBeNull();
    expect(moduleForPath("/administrator")).toBeNull();
    for (const m of MODULES) for (const r of m.routes) expect(moduleForPath(r)).toBe(m.key);
  });
});

describe("ISSUE-23 privilege-escalation guard", () => {
  it("nobody changes their own role", () => expect(change("super_admin", "super_admin", "admin", "x", "x").ok).toBe(false));
  it("only a Super Administrator grants or removes Super Administrator", () => {
    expect(change("admin", "support_staff", "super_admin").ok).toBe(false);
    expect(change("admin", "super_admin", "support_staff").ok).toBe(false);
    expect(change("super_admin", "support_staff", "super_admin").ok).toBe(true);
  });
  it("cannot hand out permissions you do not hold, or change someone above you", () => {
    expect(change("admin", "support_staff", "finance_manager").ok).toBe(false); // finance has revenue.*
    expect(change("admin", "finance_manager", "support_staff").ok).toBe(false);
    expect(change("admin", "support_staff", "editorial_manager").ok).toBe(true);
    expect(change("support_staff", "registered_user", "support_staff").ok).toBe(false); // support has no users.edit
  });
  it("matrix edits: only with users.administer, never Super Admin's row or your own, never beyond your own permissions", () => {
    const sa = { actorRole: "super_admin", actorPerms: P("super_admin") };
    expect(checkMatrixEdit({ ...sa, roleKey: "moderator", next: ["moderation.view"] }).ok).toBe(true);
    expect(checkMatrixEdit({ ...sa, roleKey: "super_admin", next: [] }).ok).toBe(false);
    expect(checkMatrixEdit({ ...sa, roleKey: "registered_user", next: ["overview.view"] }).ok).toBe(false);
    expect(checkMatrixEdit({ actorRole: "admin", actorPerms: P("admin"), roleKey: "moderator", next: ["moderation.view"] }).ok).toBe(false);
    const custom = new Set<Perm>([...P("admin"), "users.administer"]);
    expect(checkMatrixEdit({ actorRole: "admin", actorPerms: custom, roleKey: "admin", next: [] }).ok).toBe(false);
    expect(checkMatrixEdit({ actorRole: "admin", actorPerms: custom, roleKey: "moderator", next: ["revenue.view"] }).ok).toBe(false);
  });
});

describe("ISSUE-23 TOTP (RFC 6238 SHA-1 vectors, 6 digits)", () => {
  const secret = base32Encode(Buffer.from("12345678901234567890"));
  it("matches the published test vectors", () => {
    expect(totp(secret, 59_000)).toBe("287082");
    expect(totp(secret, 1111111109_000)).toBe("081804");
    expect(totp(secret, 1234567890_000)).toBe("005924");
    expect(totp(secret, 2000000000_000)).toBe("279037");
    expect(hotp(Buffer.from("12345678901234567890"), 0)).toBe("755224"); // RFC 4226
  });
  it("base32 round-trips", () => { const b = randomBytes(20); expect(base32Decode(base32Encode(b)).equals(b)).toBe(true); });
  it("accepts ±1 step, refuses replays of an already-used step and junk", () => {
    const t = 1_800_000_000_000, code = totp(secret, t);
    const step = verifyTotp(secret, code, -1, t)!;
    expect(step).toBeGreaterThan(0);
    expect(verifyTotp(secret, totp(secret, t - 30_000), -1, t)).toBe(step - 1);
    expect(verifyTotp(secret, code, step, t)).toBeNull();
    expect(verifyTotp(secret, totp(secret, t - 90_000), -1, t)).toBeNull();
    expect(verifyTotp(secret, "12345", -1, t)).toBeNull();
  });
  it("seals secrets with AES-GCM; a wrong key or tampering fails closed", () => {
    const k = randomBytes(32), s = seal("JBSWY3DPEHPK3PXP", k);
    expect(s).not.toContain("JBSWY3DP");
    expect(unseal(s, k)).toBe("JBSWY3DPEHPK3PXP");
    expect(unseal(s, randomBytes(32))).toBeNull();
    expect(unseal(s.slice(0, -2) + "AA", k)).toBeNull();
  });
  it("recovery codes are unique and hashed case/space-insensitively", () => {
    const c = newRecoveryCodes();
    expect(new Set(c).size).toBe(8);
    expect(hashCode(c[0].toUpperCase().replace("-", " "))).toBe(hashCode(c[0]));
  });
});
