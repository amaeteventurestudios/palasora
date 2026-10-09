import Link from "next/link";
import { Page } from "@/components/Prose";
export const metadata = { title: "Help" };
export default function Help() {
  return (
    <Page title="How can we help?">
      <ul className="not-prose grid gap-3 sm:grid-cols-2">
        {[["Report content", "/editorial#review", "Use Report on any comment, story or profile."], ["Request a correction", "/corrections#request", "Tell us what's wrong and how to verify it."],
          ["Advertise", "/advertise", "Send an inquiry about labeled placements."], ["Account issue", "/account", "Manage your profile, email confirmation or deletion."],
          ["General question", "/contact", "How to reach the team."]].map(([t, h, d]) => (
          <li key={t} className="card p-5"><Link className="font-bold hover:underline" href={h}>{t}</Link><p className="text-sm text-muted">{d}</p></li>))}
      </ul>
    </Page>
  );
}
