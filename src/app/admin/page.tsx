"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2, Megaphone, ClipboardList, ListChecks, ImageIcon, ArrowRight } from "lucide-react";
import { useAdminSecret } from "@/lib/useAdminSecret";
import { AdminUnlockForm } from "@/components/AdminUnlockForm";

/**
 * There's no account system, so every admin tool ships as its own
 * standalone page gated by the same shared ADMIN_SECRET (see
 * lib/admin-auth.ts) — this is just an index linking out to them, not a
 * new surface with its own data or permissions. Unlocking here uses the
 * same sessionStorage key every other admin page reads (useAdminSecret),
 * so following any link below lands already unlocked there too.
 */
const SECTIONS = [
  {
    href: "/admin/get-listed/campaigns",
    icon: ClipboardList,
    title: "Get Listed campaigns",
    description: "View customer campaigns, payment status, and manage submission progress.",
  },
  {
    href: "/admin/get-listed/queue",
    icon: ListChecks,
    title: "Get Listed queue",
    description: "Every paid, not-yet-complete campaign, oldest first, for whoever is doing submissions.",
  },
  {
    href: "/admin/sponsorships",
    icon: Megaphone,
    title: "Sponsorships",
    description: "Active and queued sponsorship slots, plus adding a free or external sponsor.",
  },
  {
    href: "/admin/favicon-diagnostic",
    icon: ImageIcon,
    title: "Favicon diagnostic",
    description: "Inspect and retry favicon discovery for a specific product URL.",
  },
] as const;

export default function AdminIndexPage() {
  const { secret, unlock, reject } = useAdminSecret();
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  async function handleUnlock(value: string) {
    setError(null);
    setChecking(true);
    try {
      const res = await fetch("/api/admin/sponsorships", { headers: { "x-admin-secret": value } });
      if (res.status === 401) {
        setError("Wrong admin key.");
        return;
      }
      unlock(value);
    } catch {
      setError("Network error, please try again.");
    } finally {
      setChecking(false);
    }
  }

  if (!secret) {
    return (
      <>
        <AdminUnlockForm onUnlock={handleUnlock} error={error} />
        {checking && (
          <p className="flex items-center justify-center gap-1.5 pb-8 text-xs text-muted">
            <Loader2 className="h-3 w-3 animate-spin" />
            Checking…
          </p>
        )}
      </>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-16">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold text-ink">Admin</h1>
        <button
          onClick={reject}
          className="text-sm text-muted transition-colors duration-150 ease-out hover:text-ink"
        >
          Lock
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {SECTIONS.map(({ href, icon: Icon, title, description }) => (
          <Link
            key={href}
            href={href}
            className="group flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5 shadow-sm transition-all duration-150 ease-out hover:-translate-y-0.5 hover:border-accent hover:shadow-md"
          >
            <div className="flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft/20 text-accent">
                <Icon className="h-5 w-5" />
              </div>
              <ArrowRight className="h-4 w-4 text-muted transition-transform duration-150 ease-out group-hover:translate-x-0.5 group-hover:text-accent" />
            </div>
            <div className="flex flex-col gap-1">
              <h2 className="font-display text-base font-bold text-ink">{title}</h2>
              <p className="text-sm text-muted">{description}</p>
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
