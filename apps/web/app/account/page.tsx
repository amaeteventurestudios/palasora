import Link from "next/link";
import { requireMember } from "@/lib/guard";
import { DeleteAccountForm, ProfileForm, ResendVerification } from "@/components/forms/AccountForms";

export const metadata = { title: "Account", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function Account({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const { session } = await requireMember("/account");
  const welcome = (await searchParams).welcome;
  const u = session.user;
  return (
    <div className="container-pv max-w-2xl py-8">
      <h1 className="text-3xl font-extrabold">Your account</h1>
      {welcome && <p className="mt-3 rounded-lg bg-card-muted p-3">Welcome. Check your inbox for a confirmation link.</p>}
      <section className="card mt-6 p-6">
        <h2 className="text-xl font-bold">Email</h2>
        <p className="mt-1">{u.email} · {u.verified ? <span className="text-success">Confirmed</span> : <span className="text-danger">Not confirmed yet</span>}</p>
        {!u.verified && <div className="mt-3"><ResendVerification /><p className="meta mt-2">Local development: emails are written to the local mail sink, not sent.</p></div>}
      </section>
      <section className="card mt-4 p-6"><h2 className="mb-3 text-xl font-bold">Public profile</h2><ProfileForm name={u.display_name} bio={u.bio ?? ""} />
        <p className="meta mt-3">Your public page: <Link className="link" href={`/profile/${u.handle}`}>/profile/{u.handle}</Link></p></section>
      <section className="card mt-4 p-6"><h2 className="text-xl font-bold">Preferences</h2>
        <p className="mt-1 text-sm text-muted">Language: English. Other languages will be offered only once real translated coverage exists. Notifications: none are sent yet.</p></section>
      <section className="card mt-4 p-6"><h2 className="text-xl font-bold">Your data</h2>
        <p className="mt-1 text-sm text-muted">Export: request a copy through <Link className="link" href="/help">Help</Link> (manual process during the pilot).</p>
        <div className="mt-4"><DeleteAccountForm /></div></section>
    </div>
  );
}
