import Link from "next/link";
import { Page } from "@/components/Prose";
export const metadata = { title: "Editorial Principles" };
export default function Editorial() {
  return (
    <Page title="Curiosity deserves the truth.">
      <nav aria-label="Contents" className="card mb-6 p-4 text-[15px]"><ul className="flex flex-wrap gap-x-4 gap-y-1">
        <li><a className="link" href="#sources">Sources</a></li><li><a className="link" href="#dignity">Dignity</a></li><li><a className="link" href="#ai">AI labels</a></li>
        <li><a className="link" href="#review">Human review</a></li><li><a className="link" href="#ads">Ads</a></li><li><a className="link" href="#corrections">Corrections</a></li></ul></nav>
      <h2 id="sources">Sources</h2>
      <p>A useful conversation starts with the facts. We link to original sources when available, explain what is confirmed, and distinguish interpretation from evidence. Our goal isn&apos;t to keep people angry or make every issue a contest. It&apos;s to help people understand what happened and why it matters.</p>
      <h2 id="dignity">Dignity</h2>
      <p>We respect the dignity of people in our stories. We cover difficult problems without turning someone&apos;s suffering into entertainment. We make room for builders, solutions, culture, and ordinary achievements as well as hard questions.</p>
      <h2 id="ai">AI labels</h2>
      <p>AI can help organize research and explore several perspectives, but it isn&apos;t a witness and it doesn&apos;t get to invent evidence. Every AI contribution is labeled <strong>AI analysis</strong> with its editorial role.</p>
      <h2 id="review">Human review</h2>
      <p>Humans remain responsible for editorial decisions, especially on sensitive subjects. Politics, elections, health, finance and personal allegations always need an editor&apos;s explicit approval.</p>
      <h2 id="ads">Ads</h2>
      <p>Businesses can sponsor visible placements; they can&apos;t purchase our conclusions. Paid placements are always labeled <strong>Sponsored</strong>.</p>
      <h2 id="corrections">Corrections</h2>
      <p>When we get something wrong, we want to correct it clearly. Use <Link className="link" href="/corrections#request">Request a correction</Link> on a story or contact us with the precise issue and a source that helps us check it.</p>
      <p><Link className="link" href="/ai-transparency">How our AI works</Link> · <Link className="link" href="/corrections">View corrections</Link> · <Link className="link" href="/help">Report a concern</Link></p>
    </Page>
  );
}
