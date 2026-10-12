import { redirect } from "next/navigation";
import { getTenant } from "@/lib/tenant";
import { getSession } from "@/lib/session";
import { pb, q } from "@/lib/pb";
import { safeNext } from "@/lib/format";
import { MfaForm } from "@/components/forms/MfaForm";

export const metadata = { title: "Second sign-in step", robots: { index: false } };
export const dynamic = "force-dynamic";

// ISSUE-23: staff whose role needs it (Super Administrator, Administrator, Finance, anyone holding sensitive permissions) finish a
// second sign-in step with an authenticator app before the Command Center opens. First visit = set up; later visits = enter a code.
export default async function Mfa({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const t = await getTenant();
  const session = await getSession(t);
  const next = safeNext((await searchParams).next || "/admin");
  if (!session) redirect(`/auth/sign-in?next=${encodeURIComponent(`/auth/mfa?next=${next}`)}`);
  if (!session.access.mfaRequired || session.access.mfaOk) redirect(next);
  const row = await pb.first("staff_mfa", `tenant_id=${q(t.id)} && user_id=${q(session.user.id)}`);
  const enrolled = !!row?.enabled_at;
  return (
    <div className="container-pv max-w-lg py-10">
      <h1 className="text-3xl font-extrabold">{enrolled ? "Enter your sign-in code" : "Set up a second sign-in step"}</h1>
      <p className="mt-2 text-muted-foreground">
        Your role ({session.access.roleName}) can change things that matter, so the Command Center asks for a 6-digit code from an authenticator app
        (for example Google Authenticator, Microsoft Authenticator, 1Password or Aegis) as well as your password. This protects the platform if a password leaks.
      </p>
      <div className="card mt-6 p-6"><MfaForm enrolled={enrolled} next={next} /></div>
    </div>
  );
}
