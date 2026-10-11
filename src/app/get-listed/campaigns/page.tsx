"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Clock3, FolderOpen } from "lucide-react";
import { useAuthUser } from "@/lib/useAuthUser";
import type { CampaignStatus } from "@/types/database";
import { GET_LISTED_PACKAGES } from "@/lib/get-listed/packages";

const STATUS_LABEL: Record<CampaignStatus, string> = {
  draft: "Draft",
  awaiting_payment: "Awaiting payment",
  active: "Active",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

type CampaignWithCount = {
  id: string;
  startup_name: string;
  package_key: string;
  package_label: string;
  status: CampaignStatus;
  submission_target: number;
  submission_count: number;
  created_at: string;
  updated_at: string;
  deliverables_completed: number;
  deliverables_total: number;
  progress_percent: number;
};

export default function CampaignsListPage() {
  const { user, loading: authLoading } = useAuthUser();
  const [campaigns, setCampaigns] = useState<CampaignWithCount[] | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing stale data on sign-out, not a render-driven derivation
      setCampaigns(null);
      return;
    }
    fetch("/api/get-listed/campaigns")
      .then((res) => res.json())
      .then((data) => setCampaigns(data.campaigns ?? []))
      .catch(() => setCampaigns([]));
  }, [user, authLoading]);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-16">
      <Link
        href="/get-listed"
        className="flex items-center gap-1.5 text-sm text-muted transition-colors duration-150 ease-out hover:text-accent"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Get Listed
      </Link>

      <h1 className="font-display text-2xl font-bold text-ink sm:text-3xl">Your Campaigns</h1>

      {!authLoading && !user && (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-surface p-10 text-center">
          <FolderOpen className="h-8 w-8 text-muted" />
          <p className="text-sm text-muted">Sign in to see your Get Listed campaigns.</p>
          <Link
            href={`/auth/sign-in?next=${encodeURIComponent("/get-listed/campaigns")}`}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink shadow-sm transition-all duration-150 ease-out hover:-translate-y-0.5 hover:shadow-md active:scale-95"
          >
            Sign in
          </Link>
        </div>
      )}

      {user && campaigns === null && <p className="text-sm text-muted">Loading…</p>}

      {user && campaigns !== null && campaigns.length === 0 && (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-surface p-10 text-center">
          <FolderOpen className="h-8 w-8 text-muted" />
          <p className="text-sm text-muted">You don&apos;t have any campaigns yet.</p>
          <Link
            href="/get-listed#packages"
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink shadow-sm transition-all duration-150 ease-out hover:-translate-y-0.5 hover:shadow-md active:scale-95"
          >
            Choose a package
          </Link>
        </div>
      )}

      {user && campaigns !== null && campaigns.length > 0 && (
        <div className="flex flex-col gap-3">
          {campaigns.map((c) => {
            const pct = c.deliverables_total > 0 ? c.progress_percent : Math.min(100, Math.round((c.submission_count / c.submission_target) * 100));
            const isLive = c.status === "active" || c.status === "in_progress";
            return (
              <Link
                key={c.id}
                href={`/get-listed/campaigns/${c.id}`}
                className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5 shadow-sm transition-all duration-150 ease-out hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="flex items-center gap-2 font-display text-base font-bold text-ink">{c.startup_name}{isLive && <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />}</h2>
                    <span className="text-[11px] text-muted">Updated {new Date(c.updated_at).toLocaleDateString()}</span>
                  </div>
                  <span className="shrink-0 rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-semibold text-muted">
                    {STATUS_LABEL[c.status]}
                  </span>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                  <span>{c.package_label || GET_LISTED_PACKAGES[c.package_key as keyof typeof GET_LISTED_PACKAGES]?.label || c.package_key}</span>
                  <span className="flex items-center gap-3"><span className="inline-flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> {c.deliverables_completed}/{c.deliverables_total} deliverables</span><span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5 text-accent" /> {c.submission_count}/{c.submission_target} listings</span></span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                </div>
                <span className="text-right text-[11px] font-bold text-accent">Open live campaign report →</span>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
