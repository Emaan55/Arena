import Link from "next/link";
import { BrandLogo } from "./BrandLogo";

/**
 * Site-wide footer, mounted once in layout.tsx alongside SiteHeader.
 * Anchor links (Explore/Hall of Fame/How It Works/Submit Product) point at
 * the same homepage sections SiteHeader's own nav already links to — from
 * any other page a full navigation to "/" happens first, then the browser
 * resolves the hash, exactly like clicking those same links in the header.
 * No Refund Policy link: that page doesn't exist yet, and a broken link is
 * worse than no link.
 */
const PRODUCT_LINKS = [
  { href: "/#duels", label: "Explore" },
  { href: "/#hall-of-fame", label: "Hall of Fame" },
  { href: "/get-listed", label: "Get Listed" },
  { href: "/#how-it-works", label: "How It Works" },
  { href: "/#submit", label: "Submit Product" },
] as const;

const LEGAL_LINKS = [
  { href: "/terms", label: "Terms of Service" },
  { href: "/privacy", label: "Privacy Policy" },
] as const;

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg";

const LINK_CLASS = `w-fit rounded-sm text-sm text-muted transition-colors duration-150 ease-out hover:text-ink ${FOCUS_RING}`;

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-bg">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-10 px-6 py-14 sm:grid-cols-2 md:px-10 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)] lg:gap-8">
        <div className="flex flex-col gap-3 sm:col-span-2 lg:col-span-1">
          <Link href="/" className={`flex w-fit items-center gap-2 rounded-sm font-display text-lg font-bold text-ink ${FOCUS_RING}`}>
            <BrandLogo variant="icon" className="h-7 w-7" />
            Arena
          </Link>
          <p className="max-w-xs text-sm leading-relaxed text-muted">
            A competitive platform where products get discovered, compete for attention, and get more exposure.
          </p>
        </div>

        <nav aria-label="Product" className="flex flex-col gap-3.5">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ink">Product</h2>
          <ul className="flex flex-col gap-2.5">
            {PRODUCT_LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className={LINK_CLASS}>
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label="Legal" className="flex flex-col gap-3.5">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ink">Legal</h2>
          <ul className="flex flex-col gap-2.5">
            {LEGAL_LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className={LINK_CLASS}>
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <div className="border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-3 px-6 py-5 sm:justify-start md:px-10">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">As featured on</span>
          <a href="https://www.scrolllaunch.com/products/the-arena?ref=badge" target="_blank" rel="noopener">
            <img src="https://www.scrolllaunch.com/api/badge/the-arena" alt="Featured on ScrollLaunch" width="220" height="48" loading="lazy" />
          </a>
        </div>
      </div>

      <div className="border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-col-reverse items-center gap-3 px-6 py-6 text-center sm:flex-row sm:justify-between sm:text-left md:px-10">
          <p className="text-xs text-muted">© 2026 THE ARENA. Better products. Bigger opportunities.</p>
          <a
            href="https://x.com/emaann28"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Emaan on X"
            className={`flex items-center gap-1.5 rounded-sm text-xs text-muted transition-colors duration-150 ease-out hover:text-accent ${FOCUS_RING}`}
          >
            Built by Emaan
            <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3.5 w-3.5 fill-current">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
          </a>
        </div>
      </div>
    </footer>
  );
}
