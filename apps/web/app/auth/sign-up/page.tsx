import { SignUpForm } from "@/components/forms/AuthForms";
import { getTenant } from "@/lib/tenant";
import { safeNext } from "@/lib/format";

export const metadata = { title: "Create an account", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function SignUp({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next);
  const t = await getTenant();
  return (
    <div className="container-pv max-w-md py-10">
      <h1 className="text-3xl font-extrabold">Join {t.slug === "palavva" ? "Palavva" : t.name}.</h1>
      <p className="mt-2 text-muted">Reading and sharing stay free. An account lets you comment, vote, follow and save.</p>
      <div className="card mt-6 p-6"><SignUpForm next={next} /></div>
    </div>
  );
}
