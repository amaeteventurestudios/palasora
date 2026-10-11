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
import { getReaderContext } from "@/lib/i18n/context";
import { translator } from "@/lib/i18n/messages";
import { I18nProvider } from "@/lib/i18n/client";
import { BottomNav } from "@/components/shell/BottomNav";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { ActivityBeacon } from "@/components/ActivityBeacon";

const inter = Inter({ subsets: ["latin", "latin-ext"], variable: "--font-inter", display: "swap" });
const serif = Source_Serif_4({ subsets: ["latin", "latin-ext"], variable: "--font-serif4", display: "swap" });
const arabic = Noto_Sans_Arabic({ subsets: ["arabic"], variable: "--font-arabic", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Palavva | Africa has a lot to talk about", template: "%s | Palavva" },
  description: "Explore African news, history, business, culture and ideas through sourced explanations and conversations worth sharing.",
  icons: { icon: "/icon.svg" },
};
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
  const isAdmin = (h.get("x-pv-path") ?? "").startsWith("/admin");
  const t = translator(ctx.ui);
  // Tenant theme tokens: values were validated as 6-digit hex in safeBranding().
  const style = tenant && tenant.slug !== "palavva"
    ? ({ "--masthead": tenant.branding.masthead_color, "--brand-accent": tenant.branding.accent_color } as React.CSSProperties)
    : undefined;
  return (
    <html lang={ctx.ui} dir={ctx.dir} className={`${inter.variable} ${serif.variable} ${arabic.variable}`} style={style} data-tenant={tenant?.slug ?? "none"}
      data-edition={ctx.edition} data-reading={ctx.reading} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="pb-[calc(56px+env(safe-area-inset-bottom))] md:pb-0">
        <I18nProvider locale={ctx.ui} edition={ctx.edition}>
          <TooltipProvider delayDuration={200}>
            {tenant && !isAdmin && <SiteHeader tenant={tenant} session={session} t={t} ctx={ctx} />}
            <main id="main" tabIndex={-1} className="outline-none">{children}</main>
            {tenant && !isAdmin && <SiteFooter tenant={tenant} t={t} ui={ctx.ui} />}
            {tenant?.slug === "palavva" && <BottomNav />}
            {tenant && <ActivityBeacon />}
            <ConsentBanner />
            <Toaster position="top-center" />
          </TooltipProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
