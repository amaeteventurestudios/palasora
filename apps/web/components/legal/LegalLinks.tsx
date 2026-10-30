// The small print every game's front page carries: Privacy · Terms · Support (support opens an email to the site's inbox).
import Link from "next/link";
import { SUPPORT_EMAIL } from "@/lib/support";

export function LegalLinks({ email = SUPPORT_EMAIL, className = "" }: { email?: string; className?: string }) {
  const a = "underline-offset-2 hover:underline focus-visible:underline";
  return (
    <p className={`text-[11px] font-semibold uppercase tracking-[0.12em] ${className}`} data-testid="legal-links">
      <Link className={a} href="/privacy">Privacy</Link><span aria-hidden> · </span>
      <Link className={a} href="/terms">Terms</Link><span aria-hidden> · </span>
      <a className={a} href={`mailto:${email}`}>Support</a>
    </p>
  );
}
