"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  Bell,
  Box,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquareText,
  Plus,
  Settings,
  Swords,
  X,
} from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { NotificationCenter } from "@/components/NotificationCenter";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useAuthUser } from "@/lib/useAuthUser";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard#products", label: "My products", icon: Box },
  { href: "/dashboard#duels", label: "Live duels", icon: Swords },
  { href: "/reviews", label: "Reviews", icon: MessageSquareText },
  { href: "/dashboard#analytics", label: "Votes & analytics", icon: BarChart3 },
  { href: "/dashboard/notifications", label: "Notifications", icon: Bell },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
] as const;

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuthUser();
  const [open, setOpen] = useState(false);
  const initial = (user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email || "F")
    .trim()
    .charAt(0)
    .toUpperCase();

  async function signOut() {
    await createBrowserSupabaseClient().auth.signOut();
    router.push("/");
  }

  function isActive(href: string) {
    if (href === "/dashboard") return pathname === "/dashboard";
    if (href.startsWith("/dashboard#")) return false;
    return pathname.startsWith(href);
  }

  const sidebar = (
    <div className="flex h-full flex-col bg-bg px-4 py-5">
      <div className="flex items-center justify-between px-2">
        <Link href="/" className="flex items-center gap-2" aria-label="The Arena home">
          <BrandLogo variant="wordmark" className="h-10 w-32" />
        </Link>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted lg:hidden"
          aria-label="Close dashboard menu"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <nav className="mt-8 flex flex-col gap-1" aria-label="Founder dashboard">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
                active ? "bg-accent/15 text-accent" : "text-muted hover:bg-surface-2 hover:text-ink"
              }`}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-3 pt-8">
        <Link
          href="/#submit"
          className="flex items-center justify-center gap-2 rounded-xl bg-ink px-4 py-3 text-sm font-bold text-bg shadow-sm transition-transform hover:-translate-y-0.5"
        >
          <Plus className="h-4 w-4" />
          Submit a product
        </Link>
        {user && (
          <button
            type="button"
            onClick={() => void signOut()}
            className="flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold text-muted hover:bg-surface-2 hover:text-ink"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-bg lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-screen border-r border-border lg:block">{sidebar}</aside>

      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[70] bg-black/40 backdrop-blur-sm lg:hidden"
            onClick={() => setOpen(false)}
            aria-label="Close dashboard menu"
          />
          <aside className="fixed inset-y-0 left-0 z-[80] w-[min(86vw,280px)] border-r border-border shadow-2xl lg:hidden">
            {sidebar}
          </aside>
        </>
      )}

      <div className="min-w-0">
        <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-border bg-bg/90 px-4 py-3 backdrop-blur-md lg:px-8">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface text-ink lg:hidden"
            aria-label="Open dashboard menu"
          >
            <Menu className="h-4 w-4" />
          </button>
          <Link href="/" className="lg:hidden" aria-label="The Arena home">
            <BrandLogo variant="wordmark" className="h-8 w-28" />
          </Link>
          <div className="ml-auto flex items-center gap-2.5">
            <NotificationCenter />
            <ThemeToggle className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface text-ink transition-all hover:border-accent active:scale-90" />
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-accent to-blue-600 font-display text-sm font-black text-white shadow-sm">
              {initial || "F"}
            </div>
          </div>
        </header>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
