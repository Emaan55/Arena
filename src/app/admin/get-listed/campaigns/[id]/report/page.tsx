"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useAdminSecret } from "@/lib/useAdminSecret";
import { AdminUnlockForm } from "@/components/AdminUnlockForm";
import { CampaignReport } from "@/components/get-listed/CampaignReport";
import type { CustomerCampaignReport } from "@/lib/get-listed/report";

/**
 * Renders the exact same CampaignReport component the customer sees, fed
 * by the exact same data shape (via the admin-gated report endpoint) —
 * this is what "preview exactly what the customer sees" means. Admin-only
 * chrome (the back link, the deleted banner) wraps it, but never leaks
 * into the shared component itself.
 */
export default function AdminCampaignReportPreviewPage() {
  const params = useParams<{ id: string }>();
  const { secret, unlock, reject } = useAdminSecret();
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<CustomerCampaignReport | null>(null);

  useEffect(() => {
    if (!secret) return;
    fetch(`/api/admin/get-listed/campaigns/${params.id}/report`, { headers: { "x-admin-secret": secret } })
      .then(async (res) => {
        if (res.status === 401) {
          reject();
          setError("Wrong admin key.");
          return;
        }
        if (!res.ok) {
          setError("Campaign not found.");
          return;
        }
        const data = await res.json();
        setReport(data.report);
      })
      .catch(() => setError("Network error, please try again."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secret, params.id]);

  if (!secret) return <AdminUnlockForm onUnlock={unlock} error={error} />;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`/admin/get-listed/campaigns/${params.id}`}
          className="flex items-center gap-1.5 text-sm text-muted hover:text-accent"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to campaign
        </Link>
        <span className="rounded-full bg-accent-soft/20 px-3 py-1 text-xs font-semibold text-accent">Admin preview: exactly what the customer sees</span>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      {report?.campaign.isDeleted && (
        <div className="rounded-2xl border border-danger bg-danger/5 p-4 text-center text-sm font-bold uppercase text-danger">
          DELETED, this campaign is not visible to the customer
        </div>
      )}

      {!report && !error ? (
        <p className="text-center text-sm text-muted">Loading…</p>
      ) : (
        report && <CampaignReport report={report} />
      )}
    </main>
  );
}
