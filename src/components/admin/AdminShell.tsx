"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeft,
  BarChart3,
  BookOpen,
  Boxes,
  ClipboardCheck,
  FolderKanban,
  Gauge,
  ImageIcon,
  LayoutDashboard,
  LockKeyhole,
  Megaphone,
  Menu,
  PackagePlus,
  PanelLeftClose,
  PanelLeftOpen,
  UsersRound,
  X,
  type LucideIcon,
} from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useAdminSecret } from "@/lib/useAdminSecret";

interface AdminNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
}

const NAV_GROUPS: Array<{ label: string; items: AdminNavItem[] }> = [
  {
    label: "Workspace",
    items: [{ href: "/admin", label: "Overview", icon: LayoutDashboard, exact: true }],
  },
  {
    label: "Arena",
    items: [
      { href: "/admin/products", label: "Products", icon: PackagePlus },
      { href: "/admin/founder-claims", label: "Founder claims", icon: UsersRound },
      { href: "/admin/announcements", label: "Announcements", icon: Megaphone },
      { href: "/admin/sponsorships", label: "Sponsorships", icon: Boxes },
    ],
  },
  {
    label: "Get Listed",
    items: [
      { href: "/admin/get-listed/campaigns", label: "Campaigns", icon: FolderKanban },
      { href: "/admin/get-listed/queue", label: "Work queue", icon: ClipboardCheck },
      { href: "/admin/get-listed/directories", label: "Directories", icon: BookOpen },
      { href: "/admin/get-listed/analytics", label: "Analytics", icon: BarChart3 },
    ],
  },
  {
    label: "System",
    items: [{ href: "/admin/favicon-diagnostic", label: "Favicon diagnostic", icon: ImageIcon }],
  },
];

function pathIsActive(pathname: string, href: string, exact?: boolean) {
  return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { secret, reject } = useAdminSecret();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const current = NAV_GROUPS.flatMap((group) => group.items).find((item) =>
    pathIsActive(pathname, item.href, item.exact),
  );

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className={`flex h-20 items-center border-b border-border ${collapsed ? "justify-center px-3" : "px-5"}`}>
        <Link href="/admin" onClick={() => setMobileOpen(false)} className="flex min-w-0 items-center gap-3">
          <BrandLogo variant="icon" className="h-9 w-9 shrink-0" />
          {!collapsed && (
            <div className="min-w-0">
              <p className="truncate font-display text-lg font-black leading-none text-ink">THE ARENA</p>
              <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">Admin console</p>
            </div>
          )}
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-5" aria-label="Admin navigation">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="mb-6 last:mb-0">
            {!collapsed && <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-muted">{group.label}</p>}
            <div className="space-y-1">
              {group.items.map((item) => {
                const active = pathIsActive(pathname, item.href, item.exact);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={collapsed ? item.label : undefined}
                    onClick={() => setMobileOpen(false)}
                    className={`flex items-center rounded-xl py-2.5 text-sm font-semibold transition-colors ${
                      collapsed ? "justify-center px-2" : "gap-3 px-3"
                    } ${active ? "bg-accent text-accent-ink shadow-sm" : "text-muted hover:bg-surface-2 hover:text-ink"}`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {!collapsed && <span>{item.label}</span>}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="space-y-1 border-t border-border p-3">
        <Link
          href="/"
          title={collapsed ? "Back to Arena" : undefined}
          className={`flex items-center rounded-xl py-2.5 text-sm font-semibold text-muted hover:bg-surface-2 hover:text-ink ${collapsed ? "justify-center px-2" : "gap-3 px-3"}`}
        >
          <ArrowLeft className="h-4 w-4" />
          {!collapsed && <span>Back to Arena</span>}
        </Link>
        {secret && (
          <button
            type="button"
            onClick={reject}
            title={collapsed ? "Lock admin" : undefined}
            className={`flex w-full items-center rounded-xl py-2.5 text-sm font-semibold text-muted hover:bg-danger/10 hover:text-danger ${collapsed ? "justify-center px-2" : "gap-3 px-3"}`}
          >
            <LockKeyhole className="h-4 w-4" />
            {!collapsed && <span>Lock admin</span>}
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-bg text-ink lg:flex">
      <aside
        className={`fixed inset-y-0 left-0 z-40 hidden border-r border-border bg-surface transition-[width] duration-200 lg:block ${collapsed ? "w-20" : "w-64"}`}
      >
        {sidebar}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button aria-label="Close admin menu" className="absolute inset-0 bg-black/55" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-[min(19rem,88vw)] border-r border-border bg-surface shadow-lg">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              aria-label="Close admin menu"
              className="absolute right-3 top-5 flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink"
            >
              <X className="h-5 w-5" />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      <div className={`min-w-0 flex-1 transition-[margin] duration-200 ${collapsed ? "lg:ml-20" : "lg:ml-64"}`}>
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-bg/90 px-4 backdrop-blur-md sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open admin menu"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface text-ink lg:hidden"
          >
            <Menu className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="hidden h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink lg:flex"
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
          <div className="flex min-w-0 items-center gap-2">
            <Gauge className="hidden h-4 w-4 text-accent sm:block" />
            <p className="truncate text-sm font-semibold text-ink">{current?.label ?? "Admin"}</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className={`hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold sm:flex ${secret ? "bg-emerald-500/10 text-emerald-600" : "bg-surface-2 text-muted"}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${secret ? "bg-emerald-500" : "bg-muted"}`} />
              {secret ? "Secure session" : "Locked"}
            </span>
            <ThemeToggle />
          </div>
        </header>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}

