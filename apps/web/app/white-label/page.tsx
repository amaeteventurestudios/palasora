import Link from "next/link";
import { Page } from "@/components/Prose";
export const metadata = { title: "White-label communities" };
export default function WhiteLabel() {
  return (
    <Page title="A conversation space for your community.">
      <p>Palavva is being designed so publishers, associations, and organizations can eventually operate branded, carefully moderated communities with their own editorial controls and analytics. Full hosted white-label service is not yet available.</p>
      <p><Link className="btn btn-secondary" href="/advertise?topic=white-label">Ask about future availability</Link></p>
    </Page>
  );
}
