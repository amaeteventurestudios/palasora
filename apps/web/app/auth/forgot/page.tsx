import { ForgotForm } from "@/components/forms/AuthForms";

export const metadata = { title: "Reset password", robots: { index: false } };

export default function Forgot() {
  return (
    <div className="container-pv max-w-md py-10">
      <h1 className="text-3xl font-extrabold">Reset your password</h1>
      <p className="mt-2 text-muted-foreground">Enter the email you signed up with. We&apos;ll send a link that works once, for one hour.</p>
      <div className="card mt-6 p-6"><ForgotForm /></div>
    </div>
  );
}
