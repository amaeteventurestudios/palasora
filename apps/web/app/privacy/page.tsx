import { Page } from "@/components/Prose";
export const metadata = { title: "Privacy policy", robots: { index: false } };
export default function P() {
  return (
    <Page title="Privacy policy">
      <p className="card p-4"><strong>Not yet published.</strong> This page is being drafted for review by legal counsel and will appear here once approved. Until then, Palavva is a local pilot that is not open to the public.</p>
      <h2>What this pilot does today</h2><p>Reading needs no account. If you allow it, we count anonymous page views and share clicks with a daily rotating identifier stored in your browser. We do not record your IP address, email or free-text in analytics. Choose “No thanks” and no optional events are sent. Accounts store your email, display name, handle and the comments you post.</p>
    </Page>
  );
}
