import { TokenConfirm } from "@/components/forms/TokenConfirm";

export const metadata = { title: "Unsubscribe", robots: { index: false } };
export const dynamic = "force-dynamic";

// No sign-in needed: the token in the link is the proof. Account service emails (security, resets) are not newsletters.
export default async function Unsubscribe({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  return (
    <div className="container-pv max-w-md py-12">
      <h1 className="text-3xl font-extrabold">Unsubscribe</h1>
      <p className="mt-2 mb-6 text-muted-foreground">Press the button to stop this newsletter. Important account messages (like password resets) still reach you.</p>
      <TokenConfirm token={(await searchParams).token ?? ""} kind="unsubscribe" button="Unsubscribe me"
        done={["You're unsubscribed.", "You will not get this newsletter again."]}
        failed={{ invalid: ["That link didn't work.", "Manage newsletters from your account page instead."] }} />
    </div>
  );
}
