import Link from "next/link";
import { Wordmark } from "./Wordmark";
import type { Tenant } from "@/lib/tenant";

const LINKS = [
  ["/about", "About Us"], ["/editorial", "Editorial Principles"], ["/ai-transparency", "AI Transparency"], ["/corrections", "Corrections"],
  ["/developers", "Developers"], ["/advertise", "Advertise"], ["/help", "Help"], ["/terms", "Terms"], ["/privacy", "Privacy"],
] as const;

export function SiteFooter({ tenant }: { tenant: Tenant }) {
  const year = new Date().getUTCFullYear();
  return (
    <footer className="mt-16 bg-masthead text-white/90">
      <div className="container-pv py-10">
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div>
            {tenant.slug === "palavva" ? <Wordmark size={26} /> : <Wordmark text={tenant.branding.wordmark_text} size={20} dot={false} />}
            <p className="mt-3 text-sm">Built for curious minds, powered by AI.</p>
          </div>
          <nav aria-label="Footer" className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm sm:grid-cols-3">
            {LINKS.map(([href, label]) => <Link key={href} href={href} className="underline-offset-2 hover:underline">{label}</Link>)}
          </nav>
        </div>
        <p className="mt-8 text-sm text-white/75">With a little human help from people who believe Africa has stories worth telling.</p>
        <p className="mt-2 text-sm text-white/75">© {year} {tenant.slug === "palavva" ? "Palavva" : tenant.name}{tenant.isDemo ? " · Demonstration tenant, not a real customer" : ""}</p>
      </div>
    </footer>
  );
}
