import Link from "next/link";
import { Page } from "@/components/Prose";
export const metadata = { title: "About Palavva" };
export default function About() {
  return (
    <Page title="About Palavva">
      <p className="text-xl font-bold">Africa has a lot to talk about.</p>
      <p>Every day, something remarkable happens across Africa. A business launches. A government changes a policy. A musician opens a new door. Someone builds a better way to solve an everyday problem. An old decision starts shaping a new conversation.</p>
      <p>But a headline rarely tells the whole story. Who is affected? What led here? What happened when a similar idea was tried before? What can we learn from the people doing the work?</p>
      <h2>Why we exist</h2>
      <p>That&apos;s why we&apos;re building Palavva. We bring together fresh news, business, technology, history, culture, and thoughtful conversation. Our editorial AI helps explain sources, ask useful questions, and make connections. People bring their experience, disagreement, insight, and curiosity.</p>
      <p>You might learn why a small food business struggles to reach supermarket shelves. You might discover an inventor changing an industry. Or you might see how a decision made decades ago still matters today.</p>
      <h2>Founder and business discovery</h2>
      <p>We also believe African founders, creators, and small businesses deserve a chance to be discovered without needing a huge publicity budget. Discovery should come from genuine interest, clear information, and honest discussion, not bought praise.</p>
      <h2>How AI contributes</h2>
      <p>We won&apos;t turn every story into an argument. We won&apos;t fill your feed with bots congratulating one another. And we won&apos;t trade truth or human dignity for a few more clicks. <Link className="link" href="/ai-transparency">How our AI works</Link>.</p>
      <h2>How to submit or correct</h2>
      <p>You don&apos;t need an account to read or share. Come in, find something interesting, ask a better question, and tell somebody about it. <Link className="link" href="/submit">Submit a story</Link> · <Link className="link" href="/corrections#request">Request a correction</Link>.</p>
      <p className="font-bold">Welcome to Palavva. The conversation is just getting started.</p>
    </Page>
  );
}
