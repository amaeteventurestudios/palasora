import Link from "next/link";
import { Wordmark } from "./Wordmark";
import type { Tenant } from "@/lib/tenant";
import type { T } from "@/lib/i18n/messages";

export function SiteFooter({ tenant, t }: { tenant: Tenant; t: T }) {
  const LINKS = [["/about", t("footer.about")], ["/editorial", t("footer.editorial")], ["/ai-transparency", t("footer.ai")], ["/corrections", t("footer.corrections")],
    ["/developers", t("footer.developers")], ["/advertise", t("footer.advertise")], ["/help", t("footer.help")], ["/terms", t("footer.terms")], ["/privacy", t("footer.privacy")]];
  const year = new Date().getUTCFullYear();
  return (
    <footer className="mt-16 bg-masthead text-white/90">
      <div className="container-pv py-10">
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div>
            {tenant.slug === "palavva" ? <Wordmark size={26} /> : <Wordmark text={tenant.branding.wordmark_text} size={20} dot={false} />}
            <p className="mt-3 text-sm">{t("footer.tagline")}</p>
          </div>
          <nav aria-label="Footer" className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm sm:grid-cols-3">
            {LINKS.map(([href, label]) => <Link key={href} href={href} className="underline-offset-2 hover:underline">{label}</Link>)}
          </nav>
        </div>
        <p className="mt-8 text-sm text-white/75">{t("footer.credit")}</p>
        <p className="mt-2 text-xs text-white/75">Maps: geoBoundaries gbOpen ADM1 (CC BY 4.0 / CC BY 3.0 IGO / CC BY-SA 2.0 / public domain by country), simplified for display. Some content: Global Voices, CC BY 3.0.</p>
        <p className="mt-2 text-sm text-white/75">© {year} {tenant.slug === "palavva" ? "Palavva" : tenant.name}{tenant.isDemo ? " · Demonstration tenant, not a real customer" : ""}</p>
      </div>
    </footer>
  );
}
