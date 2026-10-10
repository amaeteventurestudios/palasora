import { requireMember } from "@/lib/guard";
import { SubmitForm } from "@/components/forms/AccountForms";

export const metadata = { title: "Submit", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function Submit() {
  await requireMember("/submit");
  return (
    <div className="container-pv max-w-2xl py-8">
      <h1 className="text-3xl font-extrabold">Send us something worth examining</h1>
      <p className="mt-2 text-muted-foreground">Found something worth examining? Send us the original link and tell us why it matters. Submissions are reviewed before publication.</p>
      <div className="card mt-6 p-6"><SubmitForm /></div>
    </div>
  );
}
