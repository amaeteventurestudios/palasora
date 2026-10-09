import Link from "next/link";
import { createHash } from "node:crypto";
import { getTenant } from "@/lib/tenant";
import { pb, q } from "@/lib/pb";
import { audit } from "@/lib/audit";
import { parsePbDate } from "@/lib/format";

export const metadata = { title: "Confirm email", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function Verify({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const t = await getTenant();
  const token = (await searchParams).token ?? "";
  let ok = false;
  if (/^[A-Za-z0-9_-]{20,80}$/.test(token)) {
    const hash = createHash("sha256").update(token).digest("hex");
    const u = await pb.first("users", `tenant_id=${q(t.id)} && verify_token_hash=${q(hash)}`);
    const exp = parsePbDate(u?.verify_expires_at);
    if (u && exp && exp > new Date()) {
      await pb.update("users", u.id, { verified: true, verify_token_hash: "", verify_expires_at: "" });
      await audit(t.id, u.id, "auth.email_verified", "users", u.id);
      ok = true;
    }
  }
  return (
    <div className="container-pv max-w-md py-12">
      <h1 className="text-3xl font-extrabold">{ok ? "Email confirmed." : "That link didn't work."}</h1>
      <p className="mt-2 text-muted">{ok ? "You can now post comments and vote." : "It may have expired or already been used. Log in and request a new link from your account page."}</p>
      <Link href="/" className="btn btn-primary mt-6">Explore conversations</Link>
    </div>
  );
}
