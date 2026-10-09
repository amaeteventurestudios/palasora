import { Page } from "@/components/Prose";
import { InquiryForm } from "@/components/forms/InquiryForm";
import { taxonomy } from "@/lib/repo/taxonomy";
import { getTenant } from "@/lib/tenant";
export const metadata = { title: "Advertise with Palavva" };
export const dynamic = "force-dynamic";
export default async function Advertise({ searchParams }: { searchParams: Promise<{ topic?: string }> }) {
  await getTenant();
  const tax = await taxonomy();
  return (
    <Page title="Help the right people discover your business." wide>
      <p>Palavva is built around African news, ideas, people, and conversations. We want legitimate businesses, from independent founders to established companies, to be able to reach interested readers without pretending advertising is independent journalism.</p>
      <p>Tell us what you do, where you operate, and the people you&apos;re trying to reach. We&apos;ll review your inquiry and discuss placements that fit. Our available options may include clearly labeled topic or country sponsorships, display placements, and sponsored business spotlights.</p>
      <p id="about-placements" className="card p-4"><strong>Our promise:</strong> paid placements are disclosed. Buying advertising does not buy favorable AI commentary or an editorial recommendation.</p>
      <p className="meta">Campaign options and pricing depend on review and availability.</p>
      <div className="card mt-6 p-6 not-prose"><InquiryForm industries={tax.topics.map((t) => t.name)} countries={tax.countries.map((c) => c.name)} preset={(await searchParams).topic} /></div>
    </Page>
  );
}
