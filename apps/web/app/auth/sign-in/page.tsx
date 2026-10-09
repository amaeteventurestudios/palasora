import { redirect } from "next/navigation";
import { SignInForm } from "@/components/forms/AuthForms";
import { getTenant } from "@/lib/tenant";
import { getSession } from "@/lib/session";
import { safeNext } from "@/lib/format";

export const metadata = { title: "Log in", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function SignIn({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next);
  const t = await getTenant();
  if (await getSession(t)) redirect(next);
  return (
    <div className="container-pv max-w-md py-10">
      <h1 className="text-3xl font-extrabold">Join the conversation.</h1>
      <p className="mt-2 text-muted">You can read and share freely. Sign in to comment, vote, follow, and save across devices.</p>
      <div className="card mt-6 p-6"><SignInForm next={next} /></div>
    </div>
  );
}
