import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Inter, Source_Serif_4 } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { ConsentBanner } from "@/components/ConsentBanner";
import { themeInitScript } from "@/components/ThemeToggle";
import { tenantBySlug, tenantSlugForHost } from "@/lib/tenant";
import { getSession } from "@/lib/session";

const inter = Inter({ subsets: ["latin", "latin-ext"], variable: "--font-inter", display: "swap" });
const serif = Source_Serif_4({ subsets: ["latin", "latin-ext"], variable: "--font-serif4", display: "swap" });

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
  // Tenant theme tokens: values were validated as 6-digit hex in safeBranding().
  const style = tenant && tenant.slug !== "palavva"
    ? ({ "--masthead": tenant.branding.masthead_color, "--brand-accent": tenant.branding.accent_color } as React.CSSProperties)
    : undefined;
  return (
    <html lang="en" className={`${inter.variable} ${serif.variable}`} style={style} data-tenant={tenant?.slug ?? "none"} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        {tenant && <SiteHeader tenant={tenant} session={session} />}
        <main id="main" tabIndex={-1} className="outline-none">{children}</main>
        {tenant && <SiteFooter tenant={tenant} />}
        <ConsentBanner />
      </body>
    </html>
  );
}
