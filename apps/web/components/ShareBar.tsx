"use client";
import { Check, Copy, Share2 } from "lucide-react";
import { useState } from "react";
import { track } from "./analytics-client";

/** Share intents (14-SEO §Sharing). Plain links work without JS; JS adds copy + Web Share. */
export function ShareBar({ url, title, storyId }: { url: string; title: string; storyId: string }) {
  const [copied, setCopied] = useState(false);
  const text = encodeURIComponent(title);
  const u = encodeURIComponent(url);
  const links = [
    { name: "WhatsApp", href: `https://wa.me/?text=${encodeURIComponent(`${title} ${url}`)}` },
    { name: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${u}` },
    { name: "X", href: `https://twitter.com/intent/tweet?text=${text}&url=${u}` },
  ];
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); } catch {
      const ta = document.createElement("textarea"); ta.value = url; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove();
    }
    setCopied(true); track("share_clicked", { story_id: storyId, channel: "copy" });
    setTimeout(() => setCopied(false), 2500);
  };
  return (
    <div id="share" className="flex flex-wrap items-center gap-2" aria-label="Share">
      <span className="mr-1 inline-flex items-center gap-1 text-sm font-semibold"><Share2 size={16} aria-hidden="true" />Share</span>
      {links.map((l) => (
        <a key={l.name} href={l.href} target="_blank" rel="noopener noreferrer" className="btn btn-secondary !min-h-[40px] !px-3 text-sm"
          data-share={l.name} onClick={() => track("share_clicked", { story_id: storyId, channel: l.name.toLowerCase() })}>
          {l.name}<span className="sr-only"> (opens in a new tab)</span>
        </a>
      ))}
      <button type="button" onClick={copy} className="btn btn-secondary !min-h-[40px] !px-3 text-sm" data-share="copy">
        {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}{copied ? "Link copied" : "Copy link"}
      </button>
      <span role="status" aria-live="polite" className="sr-only">{copied ? "Link copied" : ""}</span>
    </div>
  );
}
