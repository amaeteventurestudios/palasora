import Link from "next/link";
import { Page } from "@/components/Prose";
export const metadata = { title: "Contact" };
export default function Contact() {
  return (
    <Page title="Contact">
      <p>During this local pilot there is no public contact inbox yet. To raise a concern about a story, use <Link className="link" href="/corrections#request">Request a correction</Link> or the Report control on the page. Businesses can use the <Link className="link" href="/advertise">advertising inquiry form</Link>.</p>
    </Page>
  );
}
