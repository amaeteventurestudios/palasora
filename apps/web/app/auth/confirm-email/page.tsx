import { TokenConfirm } from "@/components/forms/TokenConfirm";

export const metadata = { title: "Confirm new email", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function ConfirmEmail({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  return (
    <div className="container-pv max-w-md py-12">
      <h1 className="text-3xl font-extrabold">Confirm your new email address</h1>
      <p className="mt-2 mb-6 text-muted-foreground">Your account email changes only when you press the button. Your old address is told about the change.</p>
      <TokenConfirm token={(await searchParams).token ?? ""} kind="email" button="Use this email address"
        done={["Email changed.", "Your account now uses the new address. Your old address was told about the change."]}
        failed={{ taken: ["That address is already in use.", "Nothing changed. Your account keeps its current email."],
          invalid: ["That link didn't work.", "It may have expired or already been used. Nothing changed. You can ask again from your account page."] }} />
    </div>
  );
}
