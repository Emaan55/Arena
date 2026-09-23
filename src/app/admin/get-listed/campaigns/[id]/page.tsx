"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Plus } from "lucide-react";
import { useAdminSecret } from "@/lib/useAdminSecret";
import { AdminUnlockForm } from "@/components/AdminUnlockForm";
import type { Campaign, CampaignStatus, Order, Submission, SubmissionStatus } from "@/types/database";
import { GET_LISTED_PACKAGES } from "@/lib/get-listed/packages";

type CampaignWithOwner = Campaign & { owner_email: string | null };

const ORDER_STATUS_STYLE: Record<Order["payment_status"], string> = {
  pending: "bg-surface-2 text-muted",
  paid: "bg-[#16a34a]/10 text-[#16a34a]",
  failed: "bg-danger/10 text-danger",
  refunded: "bg-danger/10 text-danger",
  cancelled: "bg-surface-2 text-muted",
};

const CAMPAIGN_STATUSES: CampaignStatus[] = ["draft", "awaiting_payment", "active", "in_progress", "completed", "cancelled"];
const SUBMISSION_STATUSES: SubmissionStatus[] = ["pending", "submitted", "accepted", "rejected"];

export default function AdminCampaignDetailPage() {
  const params = useParams<{ id: string }>();
  const { secret, unlock, reject } = useAdminSecret();
  const [error, setError] = useState<string | null>(null);
  const [campaign, setCampaign] = useState<CampaignWithOwner | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [statusError, setStatusError] = useState<string | null>(null);

  const [newSub, setNewSub] = useState({ directoryName: "", directoryUrl: "", status: "pending" as SubmissionStatus, listingUrl: "", notes: "" });
  const [adding, setAdding] = useState(false);

  const [reconcile, setReconcile] = useState({ paymentReference: "", reason: "", adminName: "" });
  const [reconciling, setReconciling] = useState(false);
  const [reconcileError, setReconcileError] = useState<string | null>(null);
  const [reconcileOpen, setReconcileOpen] = useState(false);

  async function load() {
    if (!secret) return;
    const res = await fetch(`/api/admin/get-listed/campaigns/${params.id}`, { headers: { "x-admin-secret": secret } });
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
    setCampaign(data.campaign);
    setSubmissions(data.submissions ?? []);
    setOrders(data.orders ?? []);
  }

  async function reconcilePayment(e: React.FormEvent) {
    e.preventDefault();
    if (!secret) return;
    setReconcileError(null);
    setReconciling(true);
    try {
      const res = await fetch(`/api/admin/get-listed/campaigns/${params.id}/reconcile-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-secret": secret },
        body: JSON.stringify(reconcile),
      });
      const data = await res.json();
      if (!res.ok) {
        setReconcileError(data.error ?? "Could not reconcile payment.");
        return;
      }
      setReconcile({ paymentReference: "", reason: "", adminName: "" });
      setReconcileOpen(false);
      await load();
    } catch {
      setReconcileError("Network error — please try again.");
    } finally {
      setReconciling(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetching admin data on unlock/navigation, not a render-driven derivation
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secret, params.id]);

  if (!secret) return <AdminUnlockForm onUnlock={unlock} error={error} />;
  if (error) return <main className="mx-auto max-w-2xl px-6 py-24 text-center text-sm text-danger">{error}</main>;
  if (!campaign) return <main className="mx-auto max-w-2xl px-6 py-24 text-center text-sm text-muted">Loading…</main>;

  async function addSubmission(e: React.FormEvent) {
    e.preventDefault();
    if (!newSub.directoryName.trim() || !secret) return;
    setAdding(true);
    try {
      const res = await fetch(`/api/admin/get-listed/campaigns/${params.id}/submissions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-secret": secret },
        body: JSON.stringify(newSub),
      });
      if (res.ok) {
        setNewSub({ directoryName: "", directoryUrl: "", status: "pending", listingUrl: "", notes: "" });
        await load();
      }
    } finally {
      setAdding(false);
    }
  }

  async function updateSubmission(id: string, patch: Partial<{ status: SubmissionStatus; listingUrl: string; notes: string }>) {
    if (!secret) return;
    await fetch(`/api/admin/get-listed/submissions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-admin-secret": secret },
      body: JSON.stringify(patch),
    });
    await load();
  }

  async function updateCampaignStatus(status: CampaignStatus) {
    if (!secret) return;
    setStatusError(null);
    const res = await fetch(`/api/admin/get-listed/campaigns/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-admin-secret": secret },
      body: JSON.stringify({ status }),
    });
    const data = await res.json();
    if (!res.ok) {
      setStatusError(data.error ?? "Could not update status.");
      return;
    }
    await load();
  }

  const pkg = GET_LISTED_PACKAGES[campaign.package_key as keyof typeof GET_LISTED_PACKAGES];

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-12">
      <Link href="/admin/get-listed/campaigns" className="flex items-center gap-1.5 text-sm text-muted hover:text-accent">
        <ArrowLeft className="h-4 w-4" />
        All campaigns
      </Link>

      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-xl font-bold text-ink">{campaign.startup_name}</h1>
          <select
            value={campaign.status}
            onChange={(e) => updateCampaignStatus(e.target.value as CampaignStatus)}
            className="rounded-lg border border-border bg-bg px-2 py-1 text-sm text-ink"
          >
            {CAMPAIGN_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        {statusError && <p className="text-sm text-danger">{statusError}</p>}
        <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <div>
            <span className="block text-xs uppercase tracking-wide text-muted">Owner</span>
            <span className="text-ink">{campaign.owner_email ?? "—"}</span>
          </div>
          <div>
            <span className="block text-xs uppercase tracking-wide text-muted">Package</span>
            <span className="text-ink">{pkg?.label ?? campaign.package_key} (${pkg?.priceUsd})</span>
          </div>
          <div>
            <span className="block text-xs uppercase tracking-wide text-muted">Progress</span>
            <span className="text-ink">
              {submissions.length}/{campaign.submission_target}
            </span>
          </div>
          <div>
            <span className="block text-xs uppercase tracking-wide text-muted">Website</span>
            <a href={campaign.website_url} target="_blank" rel="noreferrer" className="text-accent hover:underline">
              Visit
            </a>
          </div>
        </div>
        <p className="text-sm text-muted">{campaign.description}</p>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-base font-bold text-ink">Payments</h2>
          <button
            onClick={() => setReconcileOpen((v) => !v)}
            className="rounded-lg border border-border bg-bg px-3 py-1.5 text-xs font-semibold text-ink hover:border-accent"
          >
            Reconcile Payment &amp; Activate
          </button>
        </div>

        {orders.length === 0 ? (
          <p className="text-sm text-muted">No orders yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-2 uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Final</th>
                  <th className="px-3 py-2">Discount</th>
                  <th className="px-3 py-2">Provider order id</th>
                  <th className="px-3 py-2">Paid at</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-surface">
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2 py-0.5 font-semibold ${ORDER_STATUS_STYLE[o.payment_status]}`}>
                        {o.payment_status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-ink">${(o.final_amount / 100).toFixed(2)}</td>
                    <td className="px-3 py-2 text-muted">
                      {o.discount_percent > 0 ? `${o.discount_percent}% (-$${(o.discount_amount / 100).toFixed(2)})` : "—"}
                    </td>
                    <td className="px-3 py-2 text-muted">{o.provider_order_id ?? "—"}</td>
                    <td className="px-3 py-2 text-muted">{o.paid_at ? new Date(o.paid_at).toLocaleString() : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {reconcileOpen && (
          <form onSubmit={reconcilePayment} className="flex flex-col gap-2 rounded-xl border border-border bg-bg p-4">
            <p className="text-xs text-muted">
              Use only when payment succeeded externally and the LemonSqueezy webhook was missed or delayed. This
              activates the campaign and redeems any attached discount exactly like the webhook would.
            </p>
            <input
              required
              value={reconcile.paymentReference}
              onChange={(e) => setReconcile((r) => ({ ...r, paymentReference: e.target.value }))}
              placeholder="Payment reference (LemonSqueezy order id / receipt id)"
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted"
            />
            <input
              required
              value={reconcile.reason}
              onChange={(e) => setReconcile((r) => ({ ...r, reason: e.target.value }))}
              placeholder="Reason (e.g. webhook never arrived, confirmed paid via LS dashboard)"
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted"
            />
            <input
              value={reconcile.adminName}
              onChange={(e) => setReconcile((r) => ({ ...r, adminName: e.target.value }))}
              placeholder="Your name (optional)"
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted"
            />
            {reconcileError && <p className="text-sm text-danger">{reconcileError}</p>}
            <button
              type="submit"
              disabled={reconciling}
              className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-accent-ink disabled:opacity-50"
            >
              {reconciling ? "Reconciling…" : "Confirm & Activate"}
            </button>
          </form>
        )}
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-6 shadow-sm">
        <h2 className="font-display text-base font-bold text-ink">Add submission</h2>
        <form onSubmit={addSubmission} className="grid grid-cols-1 gap-2 sm:grid-cols-5">
          <input
            required
            value={newSub.directoryName}
            onChange={(e) => setNewSub((s) => ({ ...s, directoryName: e.target.value }))}
            placeholder="Directory name"
            className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink placeholder:text-muted sm:col-span-2"
          />
          <input
            value={newSub.directoryUrl}
            onChange={(e) => setNewSub((s) => ({ ...s, directoryUrl: e.target.value }))}
            placeholder="Directory URL"
            className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink placeholder:text-muted"
          />
          <select
            value={newSub.status}
            onChange={(e) => setNewSub((s) => ({ ...s, status: e.target.value as SubmissionStatus }))}
            className="rounded-lg border border-border bg-bg px-2 py-2 text-sm text-ink"
          >
            {SUBMISSION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={adding}
            className="flex items-center justify-center gap-1 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-accent-ink disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            Add
          </button>
        </form>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-2 text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-2">Directory</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Listing URL</th>
              <th className="px-4 py-2">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-surface">
            {submissions.map((s) => (
              <tr key={s.id}>
                <td className="px-4 py-2 text-ink">{s.directory_name}</td>
                <td className="px-4 py-2">
                  <select
                    value={s.status}
                    onChange={(e) => updateSubmission(s.id, { status: e.target.value as SubmissionStatus })}
                    className="rounded-lg border border-border bg-bg px-2 py-1 text-xs text-ink"
                  >
                    {SUBMISSION_STATUSES.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-2">
                  <input
                    defaultValue={s.listing_url ?? ""}
                    onBlur={(e) => e.target.value !== (s.listing_url ?? "") && updateSubmission(s.id, { listingUrl: e.target.value })}
                    placeholder="https://…"
                    className="w-full rounded-lg border border-border bg-bg px-2 py-1 text-xs text-ink placeholder:text-muted"
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    defaultValue={s.notes ?? ""}
                    onBlur={(e) => e.target.value !== (s.notes ?? "") && updateSubmission(s.id, { notes: e.target.value })}
                    placeholder="Notes"
                    className="w-full rounded-lg border border-border bg-bg px-2 py-1 text-xs text-ink placeholder:text-muted"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
