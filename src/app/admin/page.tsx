"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Boxes,
  CheckCircle2,
  ClipboardCheck,
  Crown,
  FolderKanban,
  ImageIcon,
  Loader2,
  Megaphone,
  PackagePlus,
  RefreshCw,
  Swords,
  UsersRound,
} from "lucide-react";
import { AdminUnlockForm } from "@/components/AdminUnlockForm";
import { useAdminSecret } from "@/lib/useAdminSecret";

interface OverviewStats {
  products: number | null;
  liveDuels: number | null;
  champions: number | null;
  activeCampaigns: number | null;
  awaitingPayment: number | null;
  pendingClaims: number | null;
  draftAnnouncements: number | null;
  sponsorQueue: number | null;
}

const MANAGEMENT_AREAS = [
  {
    title: "Arena operations",
    description: "Manage products, founder ownership, platform updates, and featured placements.",
    items: [
      { href: "/admin/products", label: "Products", detail: "Add or remove Arena products", icon: PackagePlus },
      { href: "/admin/founder-claims", label: "Founder claims", detail: "Review legacy ownership requests", icon: UsersRound },
      { href: "/admin/announcements", label: "Announcements", detail: "Draft and publish product updates", icon: Megaphone },
      { href: "/admin/sponsorships", label: "Sponsorships", detail: "Manage active and queued sponsors", icon: Boxes },
    ],
  },
  {
    title: "Get Listed",
    description: "Run paid directory campaigns and keep fulfillment work moving.",
    items: [
      { href: "/admin/get-listed/campaigns", label: "Campaigns", detail: "Customers, payments, and progress", icon: FolderKanban },
      { href: "/admin/get-listed/queue", label: "Work queue", detail: "Campaigns that need attention", icon: ClipboardCheck },
      { href: "/admin/get-listed/directories", label: "Directory library", detail: "Maintain reusable destinations", icon: BookOpen },
      { href: "/admin/get-listed/analytics", label: "Performance", detail: "Revenue and fulfillment analytics", icon: BarChart3 },
    ],
  },
] as const;

function StatValue({ value }: { value: number | null | undefined }) {
  if (value === undefined) return <span className="inline-block h-8 w-14 animate-pulse rounded-lg bg-surface-2" />;
  return <>{value === null ? "—" : value.toLocaleString()}</>;
}

export default function AdminIndexPage() {
  const { secret, unlock, reject } = useAdminSecret();
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadOverview = useCallback(
    async (key: string) => {
      const response = await fetch("/api/admin/overview", {
        headers: { "x-admin-secret": key },
        cache: "no-store",
      });
      if (response.status === 401) {
        reject();
        throw new Error("Wrong admin key.");
      }
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not load the admin overview.");
      setStats(data.stats);
      setUpdatedAt(data.updatedAt);
      return data;
    },
    [reject],
  );

  useEffect(() => {
    if (!secret) return;
    setRefreshing(true);
    void loadOverview(secret)
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load the admin overview."))
      .finally(() => setRefreshing(false));
  }, [secret, loadOverview]);

  async function handleUnlock(value: string) {
    setChecking(true);
    setError(null);
    try {
      await loadOverview(value);
      unlock(value);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not unlock admin.");
    } finally {
      setChecking(false);
    }
  }

  async function refresh() {
    if (!secret) return;
    setRefreshing(true);
    setError(null);
    try {
      await loadOverview(secret);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not refresh the overview.");
    } finally {
      setRefreshing(false);
    }
  }

  const pendingWork = useMemo(() => {
    const values = [stats?.awaitingPayment, stats?.pendingClaims, stats?.draftAnnouncements, stats?.sponsorQueue];
    const available = values.filter((value): value is number => typeof value === "number");
    return available.length ? available.reduce((sum, value) => sum + value, 0) : null;
  }, [stats]);

  if (!secret) {
    return (
      <>
        <AdminUnlockForm onUnlock={handleUnlock} error={error} />
        {checking && (
          <p className="flex items-center justify-center gap-1.5 pb-8 text-xs text-muted">
            <Loader2 className="h-3 w-3 animate-spin" />
            Checking secure access…
          </p>
        )}
      </>
    );
  }

  const summaryCards = [
    { label: "Arena products", value: stats?.products, icon: PackagePlus, note: "All submissions" },
    { label: "Live duels", value: stats?.liveDuels, icon: Swords, note: "Active battles" },
    { label: "Champions", value: stats?.champions, icon: Crown, note: "Crowned products" },
    { label: "Active campaigns", value: stats?.activeCampaigns, icon: FolderKanban, note: "In fulfillment" },
  ];

  const attentionItems = [
    { label: "Founder claims", value: stats?.pendingClaims, href: "/admin/founder-claims", icon: UsersRound },
    { label: "Awaiting payment", value: stats?.awaitingPayment, href: "/admin/get-listed/campaigns?payment=pending", icon: FolderKanban },
    { label: "Announcement drafts", value: stats?.draftAnnouncements, href: "/admin/announcements", icon: Megaphone },
    { label: "Sponsor queue", value: stats?.sponsorQueue, href: "/admin/sponsorships", icon: Boxes },
  ];

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <div className="flex flex-col gap-8">
        <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-accent">
              <span className="h-px w-6 bg-accent" />
              Operations overview
            </div>
            <h1 className="font-display text-3xl font-black tracking-tight text-ink sm:text-4xl">Welcome back, Emaan</h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
              Manage Arena products, fulfillment, announcements, and founder requests from one place.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={refreshing}
            className="flex w-fit items-center gap-2 rounded-xl border border-border bg-surface px-3.5 py-2.5 text-xs font-bold text-ink shadow-sm transition hover:border-accent disabled:opacity-60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </section>

        {error && <p className="rounded-xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">{error}</p>}

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Arena summary">
          {summaryCards.map(({ label, value, icon: Icon, note }) => (
            <article key={label} className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
              <div className="flex items-start justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-accent">
                  <Icon className="h-5 w-5" />
                </div>
                <span className="rounded-full bg-surface-2 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-muted">Live</span>
              </div>
              <p className="mt-5 text-sm font-medium text-muted">{label}</p>
              <p className="mt-1 font-display text-3xl font-black text-ink"><StatValue value={value} /></p>
              <p className="mt-1 text-xs text-muted">{note}</p>
            </article>
          ))}
        </section>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(19rem,0.75fr)]">
          <div className="flex min-w-0 flex-col gap-6">
            {MANAGEMENT_AREAS.map((area) => (
              <section key={area.title} className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
                <div className="border-b border-border px-5 py-4 sm:px-6">
                  <h2 className="font-display text-lg font-black text-ink">{area.title}</h2>
                  <p className="mt-1 text-xs leading-relaxed text-muted">{area.description}</p>
                </div>
                <div className="grid sm:grid-cols-2">
                  {area.items.map(({ href, label, detail, icon: Icon }, index) => (
                    <Link
                      key={href}
                      href={href}
                      className={`group flex items-center gap-4 px-5 py-5 transition-colors hover:bg-surface-2 sm:px-6 ${index < 2 ? "border-b border-border" : ""} ${index % 2 === 0 ? "sm:border-r sm:border-border" : ""}`}
                    >
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-bg text-ink transition group-hover:border-accent group-hover:text-accent">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-ink">{label}</p>
                        <p className="mt-0.5 text-xs leading-relaxed text-muted">{detail}</p>
                      </div>
                      <ArrowRight className="h-4 w-4 shrink-0 text-muted transition-transform group-hover:translate-x-1 group-hover:text-accent" />
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </div>

          <aside className="flex flex-col gap-6">
            <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted">Needs attention</p>
                  <p className="mt-2 font-display text-4xl font-black text-ink"><StatValue value={stats ? pendingWork : undefined} /></p>
                </div>
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600">
                  <ClipboardCheck className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-5 divide-y divide-border border-t border-border">
                {attentionItems.map(({ label, value, href, icon: Icon }) => (
                  <Link key={label} href={href} className="group flex items-center gap-3 py-3.5">
                    <Icon className="h-4 w-4 text-muted group-hover:text-accent" />
                    <span className="flex-1 text-sm font-medium text-ink">{label}</span>
                    <span className="min-w-7 rounded-full bg-surface-2 px-2 py-1 text-center text-xs font-bold text-ink">
                      <StatValue value={value} />
                    </span>
                  </Link>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-[linear-gradient(135deg,var(--surface),var(--surface-2))] p-5 shadow-sm">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <h2 className="mt-4 font-display text-lg font-black text-ink">Admin session active</h2>
              <p className="mt-1 text-sm leading-relaxed text-muted">
                Your key is stored only for this browser session. Use “Lock admin” in the sidebar when you are finished.
              </p>
              <p className="mt-4 text-[11px] text-muted">
                {updatedAt ? `Data refreshed ${new Date(updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Loading current data…"}
              </p>
            </section>

            <Link
              href="/admin/favicon-diagnostic"
              className="group flex items-center gap-4 rounded-2xl border border-border bg-surface p-5 shadow-sm transition hover:border-accent"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-accent">
                <ImageIcon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-ink">System tools</p>
                <p className="mt-0.5 text-xs text-muted">Inspect product favicon discovery</p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted group-hover:text-accent" />
            </Link>
          </aside>
        </div>
      </div>
    </main>
  );
}

