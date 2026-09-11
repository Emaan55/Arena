"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";
import { BrandLogo } from "./BrandLogo";
import { ProductSearchBar, ProductSearchToggle } from "./ProductSearch";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/#hall-of-fame", label: "Hall of Fame" },
  { href: "/#duels", label: "Explore" },
  { href: "/#how-it-works", label: "How it Works" },
  { href: "/#about", label: "About" },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-bg/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <Link href="/" className="flex items-center gap-2 font-display text-lg font-bold text-ink">
          <BrandLogo variant="icon" className="h-7 w-7" />
          Arena
        </Link>

        <nav className="hidden items-center gap-6 md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-muted transition-colors duration-150 ease-out hover:text-ink"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <ProductSearchBar className="hidden w-full max-w-xs lg:block" />

        <div className="flex items-center gap-3">
          <ThemeToggle className="hidden h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface text-ink transition-all duration-150 ease-out hover:border-accent active:scale-90 sm:flex" />
          <Link
            href="/#submit"
            className="hidden rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink shadow-sm transition-all duration-150 ease-out hover:-translate-y-0.5 hover:shadow-md active:scale-95 sm:inline-block"
          >
            Submit Product
          </Link>
          <div className="lg:hidden">
            <ProductSearchToggle />
          </div>
          <button
            onClick={() => setOpen((v) => !v)}
            aria-label="Toggle menu"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface text-ink md:hidden"
          >
            {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {open && (
        <nav className="flex flex-col gap-1 border-t border-border px-6 py-3 md:hidden">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="rounded-lg px-2 py-2 text-sm font-medium text-muted hover:bg-surface hover:text-ink"
            >
              {link.label}
            </Link>
          ))}
          <div className="mt-2 flex items-center gap-3 px-2">
            <ThemeToggle />
            <Link
              href="/#submit"
              onClick={() => setOpen(false)}
              className="flex-1 rounded-lg bg-accent px-4 py-2 text-center text-sm font-semibold text-accent-ink"
            >
              Submit Product
            </Link>
          </div>
        </nav>
      )}
    </header>
  );
}
