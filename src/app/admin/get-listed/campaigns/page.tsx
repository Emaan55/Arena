"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAdminSecret } from "@/lib/useAdminSecret";
import { AdminUnlockForm } from "@/components/AdminUnlockForm";
import type { Campaign, CampaignStatus } from "@/types/database";
import { GET_LISTED_PACKAGES } from "@/lib/get-listed/packages";

type Row = Campaign & { submission_count: number; owner_email: string | null };

const STATUS_LABEL: Record<CampaignStatus, string> = {
  draft: "Draft",
  awaiting_payment: "Awaiting payment",
  active: "Active",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

export default function AdminGetListedCampaignsPage() {
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
        setRows(data.campaigns ?? []);
      })
      .catch(() => setRows([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secret]);

  if (!secret) return <AdminUnlockForm onUnlock={unlock} error={error} />;

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold text-ink">Get Listed Campaigns</h1>
        <Link href="/admin/get-listed/queue" className="text-sm text-accent hover:underline">
          Submission queue →
        </Link>
      </div>

      {rows === null ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted">No campaigns yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-2 text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-2">Product</th>
                <th className="px-4 py-2">Owner</th>
                <th className="px-4 py-2">Package</th>
                <th className="px-4 py-2">Progress</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-surface">
              {rows.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-2">
                    <Link href={`/admin/get-listed/campaigns/${c.id}`} className="font-semibold text-accent hover:underline">
                      {c.startup_name}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-muted">{c.owner_email ?? "-"}</td>
                  <td className="px-4 py-2">
                    {GET_LISTED_PACKAGES[c.package_key as keyof typeof GET_LISTED_PACKAGES]?.label ?? c.package_key}
                  </td>
                  <td className="px-4 py-2">
                    {c.submission_count}/{c.submission_target}
                  </td>
                  <td className="px-4 py-2">
                    <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-semibold text-muted">
                      {STATUS_LABEL[c.status]}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-muted">{new Date(c.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
