import { TokenConfirm } from "@/components/forms/TokenConfirm";

export const metadata = { title: "Confirm subscription", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function ConfirmNewsletter({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  return (
    <div className="container-pv max-w-md py-12">
      <h1 className="text-3xl font-extrabold">Confirm your subscription</h1>
      <p className="mt-2 mb-6 text-muted-foreground">Newsletters are optional. You will only get one if you press the button, and every issue has a one-click unsubscribe link.</p>
      <TokenConfirm token={(await searchParams).token ?? ""} kind="subscribe" button="Yes, subscribe me"
        done={["You're subscribed.", "You can change this any time in your account."]}
        failed={{ invalid: ["That link didn't work.", "It may have expired or already been used. You can subscribe again from your account page."] }} />
    </div>
  );
}
