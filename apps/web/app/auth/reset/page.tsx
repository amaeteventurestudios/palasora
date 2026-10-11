import Link from "next/link";
import { ResetForm } from "@/components/forms/AuthForms";

export const metadata = { title: "Choose a new password", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function Reset({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const token = (await searchParams).token ?? "";
  const valid = /^[A-Za-z0-9_-]{20,80}$/.test(token);
  return (
    <div className="container-pv max-w-md py-10">
      <h1 className="text-3xl font-extrabold">Choose a new password</h1>
      {valid ? <div className="card mt-6 p-6"><ResetForm token={token} /></div>
        : <p className="mt-4">This link is not valid. <Link className="link" href="/auth/forgot">Request a new one</Link>.</p>}
    </div>
  );
}
