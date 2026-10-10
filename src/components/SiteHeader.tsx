"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ChevronDown,
  Compass,
  Home,
  Info,
  ListChecks,
  Menu,
  MessageSquareText,
  Plus,
  Swords,
  Trophy,
  X,
} from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";
import { NotificationCenter } from "./NotificationCenter";
import { BrandLogo } from "./BrandLogo";
import { ProductSearchBar, ProductSearchToggle } from "./ProductSearch";
import { UserProfileMenu } from "./UserProfileMenu";
import { useAuthUser } from "@/lib/useAuthUser";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

const PRIMARY_LINKS = [
  { href: "/#duels", label: "Explore", hash: "#duels" },
  { href: "/live-battles", label: "Live Battles", pathname: "/live-battles" },
  { href: "/#hall-of-fame", label: "Hall of Fame", hash: "#hall-of-fame" },
] as const;

const MORE_LINKS = [
  { href: "/", label: "Home", icon: Home },
  { href: "/#how-it-works", label: "How It Works", icon: ListChecks, hash: "#how-it-works" },
  { href: "/#about", label: "About", icon: Info, hash: "#about" },
  { href: "/reviews", label: "Reviews", icon: MessageSquareText, pathname: "/reviews" },
] as const;

const MOBILE_LINKS = [
  { href: "/#duels", label: "Explore", icon: Compass, hash: "#duels" },
  { href: "/live-battles", label: "Live Battles", icon: Swords, pathname: "/live-battles" },
  { href: "/#hall-of-fame", label: "Hall of Fame", icon: Trophy, hash: "#hall-of-fame" },
  ...MORE_LINKS,
] as const;

function subscribeToLocation(callback: () => void) {
  window.addEventListener("hashchange", callback);
  window.addEventListener("popstate", callback);
  return () => {
    window.removeEventListener("hashchange", callback);
    window.removeEventListener("popstate", callback);
  };
}

function useCurrentHash() {
  return useSyncExternalStore(subscribeToLocation, () => window.location.hash, () => "");
}

function linkIsActive(pathname: string, hash: string, link: { pathname?: string; hash?: string; href: string }) {
  if (link.pathname) return pathname === link.pathname || pathname.startsWith(`${link.pathname}/`);
  if (link.hash) return pathname === "/" && hash === link.hash;
  return pathname === "/" && !hash;
}

function MoreMenu({ pathname, hash }: { pathname: string; hash: string }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const active = MORE_LINKS.some((link) => linkIsActive(pathname, hash, link));

  useEffect(() => {
    function closeOnOutsideClick(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <button type="button" onClick={() => setOpen((value) => !value)} aria-haspopup="menu" aria-expanded={open} className={`flex h-10 items-center gap-1 rounded-lg px-2 text-sm font-semibold transition-colors ${active ? "text-accent" : "text-muted hover:text-ink"}`}>
        More <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div role="menu" className="absolute left-1/2 top-12 z-[80] w-56 -translate-x-1/2 overflow-hidden rounded-2xl border border-border bg-bg shadow-lg">
          <div className="p-2">
            {MORE_LINKS.map(({ href, label, icon: Icon, ...route }) => {
              const itemActive = linkIsActive(pathname, hash, { href, ...route });
              return <Link key={href} href={href} role="menuitem" onClick={() => setOpen(false)} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${itemActive ? "bg-accent/10 text-accent" : "text-muted hover:bg-surface-2 hover:text-ink"}`}><Icon className="h-4 w-4" />{label}</Link>;
            })}
          </div>
          <div className="flex items-center justify-between border-t border-border px-4 py-3"><span className="text-xs font-medium text-muted">Appearance</span><ThemeToggle /></div>
        </div>
      )}
    </div>
  );
}

export function SiteHeader() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user } = useAuthUser();
  const pathname = usePathname();
  const hash = useCurrentHash();
  const router = useRouter();
  const signInHref = `/auth/sign-in?next=${encodeURIComponent(pathname || "/")}`;

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setMobileOpen(false);
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, []);

  async function handleSignOut() {
    await createBrowserSupabaseClient().auth.signOut();
    router.push("/");
    router.refresh();
  }

  if (pathname.startsWith("/dashboard") || pathname.startsWith("/admin")) return null;

  return (
    <header className="sticky top-0 z-[60] h-16 border-b border-border bg-bg/90 backdrop-blur-xl">
      <div className="mx-auto grid h-full max-w-[1500px] grid-cols-[auto_minmax(0,1fr)] items-center gap-4 px-3 sm:px-5 xl:grid-cols-[minmax(150px,1fr)_auto_minmax(500px,1fr)] xl:gap-6">
        <div className="flex min-w-0 items-center gap-2">
          <button type="button" onClick={() => setMobileOpen((value) => !value)} aria-label={mobileOpen ? "Close navigation" : "Open navigation"} aria-expanded={mobileOpen} aria-controls="mobile-site-navigation" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-ink xl:hidden">
            {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
          <Link href="/" className="flex min-w-0 shrink-0 items-center gap-2 font-display text-lg font-black text-ink" aria-label="The Arena home">
            <BrandLogo variant="icon" className="h-8 w-8 shrink-0" />
            <span className="hidden sm:inline">Arena</span>
          </Link>
        </div>

        <nav className="hidden items-center justify-center gap-5 xl:flex" aria-label="Primary navigation">
          {PRIMARY_LINKS.map((link) => {
            const active = linkIsActive(pathname, hash, link);
            return <Link key={link.href} href={link.href} aria-current={active ? "page" : undefined} className={`relative flex h-10 items-center whitespace-nowrap text-sm font-semibold transition-colors ${active ? "text-accent" : "text-muted hover:text-ink"}`}>{link.label}{active && <span className="absolute inset-x-0 -bottom-3.5 h-0.5 rounded-full bg-accent" />}</Link>;
          })}
          <MoreMenu pathname={pathname} hash={hash} />
        </nav>

        <div className="ml-auto flex min-w-0 items-center justify-end gap-1.5 sm:gap-2 xl:ml-0">
          <ProductSearchBar className="hidden md:block" />
          <div className="md:hidden"><ProductSearchToggle /></div>
          <Link href="/get-listed" className="hidden h-10 items-center whitespace-nowrap rounded-xl border border-border bg-surface px-4 text-sm font-bold text-ink shadow-sm transition-all hover:border-accent hover:shadow-md min-[1380px]:inline-flex">Get Listed</Link>
          <Link href="/#submit" className="hidden h-10 items-center whitespace-nowrap rounded-xl bg-accent px-4 text-sm font-bold text-accent-ink shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md lg:inline-flex">Submit Product</Link>
          {user ? <><NotificationCenter /><UserProfileMenu user={user} onSignOut={handleSignOut} /></> : <Link href={signInHref} className="hidden h-10 items-center whitespace-nowrap rounded-xl px-3 text-sm font-bold text-muted transition-colors hover:bg-surface-2 hover:text-ink sm:inline-flex">Sign In</Link>}
        </div>
      </div>

      {mobileOpen && (
        <>
          <button type="button" aria-label="Close navigation" onClick={() => setMobileOpen(false)} className="fixed inset-x-0 bottom-0 top-16 z-40 bg-black/40 backdrop-blur-sm xl:hidden" />
          <aside id="mobile-site-navigation" className="fixed bottom-0 left-0 top-16 z-50 w-[min(88vw,320px)] overflow-y-auto border-r border-border bg-bg p-4 shadow-2xl xl:hidden">
            <nav className="flex flex-col gap-1" aria-label="Mobile navigation">
              {MOBILE_LINKS.map(({ href, label, icon: Icon, ...route }) => {
                const active = linkIsActive(pathname, hash, { href, ...route });
                return <Link key={`${href}-${label}`} href={href} onClick={() => setMobileOpen(false)} aria-current={active ? "page" : undefined} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition-colors ${active ? "bg-accent/10 text-accent" : "text-muted hover:bg-surface-2 hover:text-ink"}`}><Icon className="h-4 w-4" />{label}</Link>;
              })}
            </nav>

            <div className="mt-5 space-y-2 border-t border-border pt-5">
              <Link href="/get-listed" onClick={() => setMobileOpen(false)} className="flex h-11 items-center justify-center rounded-xl border border-border bg-surface text-sm font-bold text-ink">Get Listed</Link>
              <Link href="/#submit" onClick={() => setMobileOpen(false)} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-accent text-sm font-bold text-accent-ink"><Plus className="h-4 w-4" />Submit Product</Link>
              {!user && <Link href={signInHref} onClick={() => setMobileOpen(false)} className="flex h-11 items-center justify-center rounded-xl text-sm font-bold text-muted hover:bg-surface-2 hover:text-ink">Sign In</Link>}
              {user && <Link href="/dashboard" onClick={() => setMobileOpen(false)} className="flex h-11 items-center justify-center rounded-xl text-sm font-bold text-muted hover:bg-surface-2 hover:text-ink">Open My Arena</Link>}
            </div>

            <div className="mt-5 flex items-center justify-between border-t border-border px-3 pt-5"><span className="text-sm font-medium text-muted">Appearance</span><ThemeToggle /></div>
          </aside>
        </>
      )}
    </header>
  );
}

