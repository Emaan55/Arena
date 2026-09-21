"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useAdminSecret } from "@/lib/useAdminSecret";
import { AdminUnlockForm } from "@/components/AdminUnlockForm";
import type { Campaign } from "@/types/database";
import { GET_LISTED_PACKAGES } from "@/lib/get-listed/packages";

type Row = Campaign & { submission_count: number; owner_email: string | null };

/**
 * Work queue for whoever is doing the actual manual submissions: every
 * paid-and-not-yet-complete campaign, oldest first, so it's obvious what
 * to pick up next. Excludes draft/awaiting_payment (nothing to submit yet
 * — no payment collected) and completed/cancelled (nothing left to do).
 */
export default function AdminGetListedQueuePage() {
  const { secret, unlock, reject } = useAdminSecret();
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    if (!secret) return;
    fetch("/api/admin/get-listed/campaigns", { headers: { "x-admin-secret": secret } })
      .then(async (res) => {
        if (res.status === 401) {
          reject();
          setError("Wrong admin key.");
          return;
        }
        const data = await res.json();
        const active = ((data.campaigns ?? []) as Row[])
          .filter((c) => c.status === "active" || c.status === "in_progress")
          .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        setRows(active);
      })
      .catch(() => setRows([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secret]);

  if (!secret) return <AdminUnlockForm onUnlock={unlock} error={error} />;

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-12">
      <Link href="/admin/get-listed/campaigns" className="flex items-center gap-1.5 text-sm text-muted hover:text-accent">
        <ArrowLeft className="h-4 w-4" />
        All campaigns
      </Link>

      <h1 className="font-display text-2xl font-bold text-ink">Submission Queue</h1>
      <p className="-mt-4 text-sm text-muted">Active campaigns not yet at target, oldest first.</p>

      {rows === null ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted">Nothing in the queue right now.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((c) => {
            const pct = Math.min(100, Math.round((c.submission_count / c.submission_target) * 100));
            return (
              <Link
                key={c.id}
                href={`/admin/get-listed/campaigns/${c.id}`}
                className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-5 shadow-sm transition-all duration-150 ease-out hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="flex items-center justify-between gap-3">
                  <h2 className="font-display text-base font-bold text-ink">{c.startup_name}</h2>
                  <span className="text-xs text-muted">
                    {GET_LISTED_PACKAGES[c.package_key as keyof typeof GET_LISTED_PACKAGES]?.label ?? c.package_key}
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                </div>
                <span className="text-xs text-muted">
                  {c.submission_count}/{c.submission_target} submissions · {c.owner_email ?? "—"}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
