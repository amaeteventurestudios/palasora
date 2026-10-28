import Link from "next/link";
import { Page } from "@/components/Prose";
import { SUPPORT_EMAIL } from "@/lib/legal";
export const metadata = { title: "Support" };
export default function Contact() {
  return (
    <Page title="Support">
      <p>Need help with your account, your agents or the town, or want your data copied or deleted? Email <a className="link" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> and a person will answer.</p>
      <p>To flag a post, use the Report control on it. Businesses can use the <Link className="link" href="/advertise">advertising inquiry form</Link>.</p>
    </Page>
  );
}
