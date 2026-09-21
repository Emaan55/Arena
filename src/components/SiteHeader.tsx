"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X, LogOut } from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";
import { BrandLogo } from "./BrandLogo";
import { ProductSearchBar, ProductSearchToggle } from "./ProductSearch";
import { SignInPrompt } from "./SignInPrompt";
import { useAuthUser } from "@/lib/useAuthUser";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/#hall-of-fame", label: "Hall of Fame" },
  { href: "/#duels", label: "Explore" },
  { href: "/#how-it-works", label: "How it Works" },
  { href: "/#about", label: "About" },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);
  const { user } = useAuthUser();

  async function handleSignOut() {
    const supabase = createBrowserSupabaseClient();
    await supabase.auth.signOut();
  }

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-bg/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-6 py-3 lg:gap-6">
        <Link href="/" className="flex shrink-0 items-center gap-2 font-display text-lg font-bold text-ink">
          <BrandLogo variant="icon" className="h-7 w-7" />
          Arena
        </Link>

        <nav className="hidden shrink-0 items-center gap-5 md:flex lg:gap-6">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="whitespace-nowrap text-sm font-medium text-muted transition-colors duration-150 ease-out hover:text-ink"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <ProductSearchBar className="hidden w-full max-w-[200px] lg:block xl:max-w-xs" />

        <div className="ml-auto flex shrink-0 items-center gap-2.5 lg:gap-3">
          <ThemeToggle className="hidden h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface text-ink transition-all duration-150 ease-out hover:border-accent active:scale-90 sm:flex" />
          {user ? (
            <button
              onClick={handleSignOut}
              title={user.email ?? undefined}
              className="hidden items-center gap-1.5 whitespace-nowrap text-sm font-medium text-muted transition-colors duration-150 ease-out hover:text-ink sm:flex"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </button>
          ) : (
            <button
              onClick={() => setSignInOpen(true)}
              className="hidden whitespace-nowrap text-sm font-medium text-muted transition-colors duration-150 ease-out hover:text-ink sm:flex"
            >
              Sign in
            </button>
          )}
          <Link
            href="/get-listed"
            className="hidden whitespace-nowrap rounded-lg border border-border bg-surface px-4 py-2 text-sm font-semibold text-ink shadow-sm transition-all duration-150 ease-out hover:-translate-y-0.5 hover:shadow-md active:scale-95 sm:inline-block"
          >
            Get Listed
          </Link>
          <Link
            href="/#submit"
            className="hidden whitespace-nowrap rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink shadow-sm transition-all duration-150 ease-out hover:-translate-y-0.5 hover:shadow-md active:scale-95 sm:inline-block"
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
          <Link
            href="/get-listed"
            onClick={() => setOpen(false)}
            className="rounded-lg px-2 py-2 text-sm font-medium text-muted hover:bg-surface hover:text-ink"
          >
            Get Listed
          </Link>
          <div className="mt-2 flex items-center gap-3 px-2">
            <ThemeToggle />
            {user ? (
              <button
                onClick={() => {
                  setOpen(false);
                  handleSignOut();
                }}
                className="text-sm font-medium text-muted hover:text-ink"
              >
                Sign out
              </button>
            ) : (
              <button
                onClick={() => {
                  setOpen(false);
                  setSignInOpen(true);
                }}
                className="text-sm font-medium text-muted hover:text-ink"
              >
                Sign in
              </button>
            )}
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

      <SignInPrompt open={signInOpen} onClose={() => setSignInOpen(false)} />
    </header>
  );
}
