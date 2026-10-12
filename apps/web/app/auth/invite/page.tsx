import Link from "next/link";
import { createHash } from "node:crypto";
import { getTenant } from "@/lib/tenant";
import { pb, q } from "@/lib/pb";
import { TEMPLATE } from "@/lib/access/permissions";
import { maskEmail } from "@/lib/mail";
import { InviteForm } from "@/components/forms/InviteForm";

export const metadata = { title: "Accept invitation", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function Invite({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const t = await getTenant();
  const token = (await searchParams).token ?? "";
  const inv = /^[A-Za-z0-9_-]{20,80}$/.test(token) ? await pb.first("invitations", `tenant_id=${q(t.id)} && token_hash=${q(createHash("sha256").update(token).digest("hex"))}`) : null;
  const live = inv && inv.status === "pending" && new Date(String(inv.expires_at).replace(" ", "T")) > new Date();
  return (
    <div className="container-pv max-w-md py-10">
      <h1 className="text-3xl font-extrabold">{live ? "Join the team" : "This invitation can't be used"}</h1>
      {live ? <>
        <p className="mt-2 text-muted-foreground">You were invited to the {t.name} Command Center as <b>{TEMPLATE[inv.access_role]?.name ?? inv.access_role}</b> ({maskEmail(inv.email)}). Choose your name, a public handle and a password of at least 12 characters.</p>
        <div className="card mt-6 p-6"><InviteForm token={token} /></div></>
        : <p className="mt-4">It may have expired, been revoked or already been used. Ask the person who invited you for a new one. <Link className="link" href="/">Go to Palavva</Link></p>}
    </div>
  );
}
