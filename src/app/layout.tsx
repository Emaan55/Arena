import type { Metadata } from "next";
import { Bricolage_Grotesque, Inter, IBM_Plex_Mono } from "next/font/google";
import { LemonSqueezyScript } from "@/components/LemonSqueezyScript";
import { SiteHeader } from "@/components/SiteHeader";
import "./globals.css";

// Applies a saved theme override before first paint, so a light/dark
// toggle choice never flashes the wrong theme on load. Runs as the very
// first thing in <body> — synchronous inline scripts block rendering of
// what follows until they finish, and document.documentElement always
// already exists at this point. Also corrects the favicon <link> hrefs
// the same way (see FAVICONS in ThemeToggle.tsx for the post-mount half
// of this — same two ids, kept in sync on every manual toggle too).
const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('arena_theme');var dark=t==='dark'||(t!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t);}if(dark){var a=document.getElementById('favicon-32');if(a)a.href='/favicons/icon-dark-32.png';var b=document.getElementById('favicon-512');if(b)b.href='/favicons/icon-dark-512.png';}}catch(e){}})();`;

const bricolage = Bricolage_Grotesque({
  variable: "--font-display",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-body",
  subsets: ["latin"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const SITE_URL = "https://thearena.lol";
const SITE_TITLE = "THE ARENA — Where Products Compete";
const SITE_DESCRIPTION = "Where products compete. You decide.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "The Arena — Win three duels. Become champion.",
  description:
    "Submit your product for free and battle head-to-head against other products in your category. First to 100 votes wins. Win 3 in a row, become the Champion.",
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    siteName: "THE ARENA",
    type: "website",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 628,
        alt: SITE_TITLE,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: ["/og-image.png"],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${bricolage.variable} ${inter.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-bg text-ink font-body">
        {/* Default (light) favicon — corrected to the dark variant before
            first paint by THEME_INIT_SCRIPT below when applicable, and kept
            in sync by ThemeToggle on every manual toggle. */}
        <link id="favicon-32" rel="icon" type="image/png" sizes="32x32" href="/favicons/icon-light-32.png" />
        <link id="favicon-512" rel="icon" type="image/png" sizes="512x512" href="/favicons/icon-light-512.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/favicons/icon-light-180.png" />
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <SiteHeader />
        {children}
        <LemonSqueezyScript />
      </body>
    </html>
  );
}
