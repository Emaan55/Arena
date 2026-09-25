"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useAdminSecret } from "@/lib/useAdminSecret";
import { AdminUnlockForm } from "@/components/AdminUnlockForm";

type DateFilter = "today" | "7d" | "30d" | "all";

interface AnalyticsData {
  since: DateFilter;
  campaigns: { total: number; paid: number; active: number; inProgress: number; completed: number; awaitingPayment: number };
  fulfillment: { totalSubmissions: number; accepted: number; pending: number; rejected: number };
  packageBreakdown: { packageKey: string; label: string; campaigns: number }[];
  revenue: { totalCents: number; orderCount: number; currency: string };
  fulfillmentMetrics: {
    avgSubmissionsPerCampaign: number;
    campaignsRequiringWork: number;
    campaignsAtTarget: number;
    campaignsAwaitingResponses: number;
  };
}

const DATE_FILTERS: { value: DateFilter; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "all", label: "All time" },
];

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <span className="block font-display text-2xl font-bold text-ink">{value}</span>
      <span className="block text-xs text-muted">{label}</span>
    </div>
  );
}

export default function AdminGetListedAnalyticsPage() {
  const { secret, unlock, reject } = useAdminSecret();
  const [error, setError] = useState<string | null>(null);
  const [since, setSince] = useState<DateFilter>("all");
  const [data, setData] = useState<AnalyticsData | null>(null);

  useEffect(() => {
    if (!secret) return;
    fetch(`/api/admin/get-listed/analytics?since=${since}`, { headers: { "x-admin-secret": secret } })
      .then(async (res) => {
        if (res.status === 401) {
          reject();
          setError("Wrong admin key.");
          return;
        }
        setData(await res.json());
      })
      .catch(() => setError("Network error, please try again."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secret, since]);

  if (!secret) return <AdminUnlockForm onUnlock={unlock} error={error} />;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/admin/get-listed/campaigns" className="flex items-center gap-1.5 text-sm text-muted hover:text-accent">
          <ArrowLeft className="h-4 w-4" />
          Campaigns
        </Link>
        <h1 className="font-display text-2xl font-bold text-ink">Get Listed Analytics</h1>
        <select
          value={since}
          onChange={(e) => setSince(e.target.value as DateFilter)}
          className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-ink"
        >
          {DATE_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      {!data ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (
        <>
          <section className="flex flex-col gap-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Revenue (paid orders only)</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <StatCard label={`Total revenue (${data.revenue.currency})`} value={`$${(data.revenue.totalCents / 100).toFixed(2)}`} />
              <StatCard label="Paid orders" value={data.revenue.orderCount} />
              <StatCard
                label="Avg order value"
                value={data.revenue.orderCount > 0 ? `$${(data.revenue.totalCents / data.revenue.orderCount / 100).toFixed(2)}` : "-"}
              />
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Campaigns</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <StatCard label="Total" value={data.campaigns.total} />
              <StatCard label="Paid" value={data.campaigns.paid} />
              <StatCard label="Awaiting payment" value={data.campaigns.awaitingPayment} />
              <StatCard label="Active" value={data.campaigns.active} />
              <StatCard label="In progress" value={data.campaigns.inProgress} />
              <StatCard label="Completed" value={data.campaigns.completed} />
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Fulfillment</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard label="Total submissions" value={data.fulfillment.totalSubmissions} />
              <StatCard label="Accepted" value={data.fulfillment.accepted} />
              <StatCard label="Pending" value={data.fulfillment.pending} />
              <StatCard label="Rejected" value={data.fulfillment.rejected} />
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Fulfillment metrics</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard label="Avg submissions / campaign" value={data.fulfillmentMetrics.avgSubmissionsPerCampaign} />
              <StatCard label="Need work" value={data.fulfillmentMetrics.campaignsRequiringWork} />
              <StatCard label="At target" value={data.fulfillmentMetrics.campaignsAtTarget} />
              <StatCard label="Awaiting responses" value={data.fulfillmentMetrics.campaignsAwaitingResponses} />
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Package breakdown</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {data.packageBreakdown.map((p) => (
                <StatCard key={p.packageKey} label={p.label} value={p.campaigns} />
              ))}
            </div>
          </section>
        </>
      )}
    </main>
  );
}
