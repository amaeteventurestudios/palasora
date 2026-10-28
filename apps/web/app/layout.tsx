import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Inter, Noto_Sans_Arabic, Source_Serif_4 } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { ConsentBanner } from "@/components/ConsentBanner";
import { themeInitScript } from "@/components/ThemeToggle";
import { tenantBySlug, tenantSlugForHost } from "@/lib/tenant";
import { getSession } from "@/lib/session";
import { noveniqueConfig } from "@/lib/novenique";
import { getReaderContext } from "@/lib/i18n/context";
import { translator } from "@/lib/i18n/messages";
import { I18nProvider } from "@/lib/i18n/client";
import { BottomNav } from "@/components/shell/BottomNav";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { ActivityBeacon } from "@/components/ActivityBeacon";
import { isNetworkHost, onNetworkHost, networkMetadata, networkUrl } from "@/lib/network";
import { NetBaseProvider } from "@/components/NetLink";

const inter = Inter({ subsets: ["latin", "latin-ext"], variable: "--font-inter", display: "swap" });
const serif = Source_Serif_4({ subsets: ["latin", "latin-ext"], variable: "--font-serif4", display: "swap" });
const arabic = Noto_Sans_Arabic({ subsets: ["arabic"], variable: "--font-arabic", display: "swap" });

const siteMetadata: Metadata = {
  title: { default: "Palavva | Africa has a lot to talk about", template: "%s | Palavva" },
  description: "Explore African news, history, business, culture and ideas through sourced explanations and conversations worth sharing.",
  icons: { icon: "/icon.svg" },
};
export async function generateMetadata(): Promise<Metadata> {
  return (await onNetworkHost()) ? { ...siteMetadata, ...networkMetadata } : siteMetadata;
}
export const viewport: Viewport = {
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#1B2030" }, { media: "(prefers-color-scheme: dark)", color: "#111520" }],
  width: "device-width", initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const h = await headers();
  const host = h.get("host");
  const slug = tenantSlugForHost(host);
  const tenant = slug ? await tenantBySlug(slug, host!) : null;
  const session = tenant ? await getSession(tenant) : null;
  const ctx = await getReaderContext(tenant);
  const path = h.get("x-pv-path") ?? "";
  const isAdmin = path.startsWith("/admin");
  // Palasora Phase 6: the town fills the screen; its own menus replace the site header, footer and bottom bar.
  const network = isNetworkHost(host);   // Jisst's own address: the feed is home, no town (lib/network.ts)
  const isWorld = tenant?.slug === "palavva" && !network && (path === "/" || (/^\/town\/[^/]+$/.test(path) && path !== "/town/event"));
  const chrome = !!tenant && !isAdmin && !isWorld;
  const t = translator(ctx.ui);
  // Tenant theme tokens: values were validated as 6-digit hex in safeBranding().
  const style = tenant && tenant.slug !== "palavva"
    ? ({ "--masthead": tenant.branding.masthead_color, "--brand-accent": tenant.branding.accent_color } as React.CSSProperties)
    : undefined;
  return (
    <html lang={ctx.ui} dir={ctx.dir} className={`${inter.variable} ${serif.variable} ${arabic.variable}`} style={style} data-tenant={tenant?.slug ?? "none"}
      data-edition={ctx.edition} data-reading={ctx.reading} data-novenique={noveniqueConfig().on ? "on" : undefined} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className={isWorld ? "overflow-hidden" : "pb-[calc(56px+env(safe-area-inset-bottom))] md:pb-0"}>
        <NetBaseProvider base={tenant?.slug === "palavva" && !network && !isAdmin ? networkUrl() : ""} town={network ? (process.env.PUBLIC_ORIGIN ?? "").replace(/\/$/, "") : ""}>
        <I18nProvider locale={ctx.ui} edition={ctx.edition}>
          <TooltipProvider delayDuration={200}>
            {chrome && <SiteHeader tenant={tenant} session={session} t={t} ctx={ctx} />}
            <main id="main" tabIndex={-1} className="outline-none">{children}</main>
            {chrome && tenant && <SiteFooter tenant={tenant} t={t} ui={ctx.ui} network={network} />}
            {tenant?.slug === "palavva" && !isWorld && <BottomNav network={network} />}
            {tenant && <ActivityBeacon />}
            <ConsentBanner />
            <Toaster position="top-center" />
          </TooltipProvider>
        </I18nProvider>
        </NetBaseProvider>
      </body>
    </html>
  );
}
