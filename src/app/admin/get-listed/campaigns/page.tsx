"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Search, ChevronLeft, ChevronRight, Download } from "lucide-react";
import { useAdminSecret } from "@/lib/useAdminSecret";
import { AdminUnlockForm } from "@/components/AdminUnlockForm";
import { downloadAdminFile } from "@/lib/download-admin-file";
import type { Campaign, CampaignStatus } from "@/types/database";
import { GET_LISTED_PACKAGES, type GetListedPackageKey } from "@/lib/get-listed/packages";
import type { AdminPaymentStatus } from "@/lib/get-listed/admin";

type Row = Campaign & {
  owner_email: string | null;
  submission_count: number;
  accepted_count: number;
  pending_count: number;
  rejected_count: number;
  payment_status: AdminPaymentStatus;
  next_action: string;
};

interface Stats {
  total: number;
  awaitingPayment: number;
  active: number;
  inProgress: number;
  completed: number;
  submissions: { total: number; accepted: number; pending: number; rejected: number };
}

const FULFILLMENT_LABEL: Record<CampaignStatus, string> = {
  draft: "Draft",
  awaiting_payment: "Awaiting payment",
  active: "Active",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

const PAYMENT_LABEL: Record<AdminPaymentStatus, string> = {
  no_order: "No order",
  pending: "Pending",
  paid: "Paid",
  failed: "Failed",
  refunded: "Refunded",
  cancelled: "Cancelled",
};

const PAYMENT_STYLE: Record<AdminPaymentStatus, string> = {
  no_order: "bg-surface-2 text-muted",
  pending: "bg-surface-2 text-muted",
  paid: "bg-[#16a34a]/10 text-[#16a34a]",
  failed: "bg-danger/10 text-danger",
  refunded: "bg-danger/10 text-danger",
  cancelled: "bg-surface-2 text-muted",
};

const FULFILLMENT_STYLE: Record<CampaignStatus, string> = {
  draft: "bg-surface-2 text-muted",
  awaiting_payment: "bg-surface-2 text-muted",
  active: "bg-accent-soft/20 text-accent",
  in_progress: "bg-accent-soft/20 text-accent",
  completed: "bg-[#16a34a]/10 text-[#16a34a]",
  cancelled: "bg-danger/10 text-danger",
};

const PAGE_SIZE = 25;

export default function AdminGetListedCampaignsPage() {
  const { secret, unlock, reject } = useAdminSecret();
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<Stats | null>(null);
  const [softDeleteReady, setSoftDeleteReady] = useState(true);

  const [q, setQ] = useState("");
  const [qInput, setQInput] = useState("");
  const [payment, setPayment] = useState("all");
  const [fulfillment, setFulfillment] = useState("all");
  const [pkg, setPkg] = useState("all");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(() => {
    if (!secret) return;
    const params = new URLSearchParams({
      q,
      payment,
      fulfillment,
      package: pkg,
      sort,
      page: String(page),
      pageSize: String(PAGE_SIZE),
    });
    fetch(`/api/admin/get-listed/campaigns?${params.toString()}`, { headers: { "x-admin-secret": secret } })
      .then(async (res) => {
        if (res.status === 401) {
          reject();
          setError("Wrong admin key.");
          return;
        }
        const data = await res.json();
        setRows(data.campaigns ?? []);
        setTotal(data.total ?? 0);
        setStats(data.stats ?? null);
        setSoftDeleteReady(data.softDeleteReady !== false);
      })
      .catch(() => setRows([]));
  }, [secret, q, payment, fulfillment, pkg, sort, page, reject]);

  useEffect(() => {
    load();
  }, [load]);

  function onSearchChange(value: string) {
    setQInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      setQ(value);
    }, 300);
  }

  function resetPageOn<T>(setter: (v: T) => void) {
    return (v: T) => {
      setPage(1);
      setter(v);
    };
  }

  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  async function exportCsv() {
    if (!secret) return;
    setExportError(null);
    setExporting(true);
    try {
      const params = new URLSearchParams({ q, payment, fulfillment, package: pkg, sort });
      await downloadAdminFile(`/api/admin/get-listed/campaigns/export?${params.toString()}`, secret, "get-listed-campaigns.csv");
    } catch {
      setExportError("Could not export CSV.");
    } finally {
      setExporting(false);
    }
  }

  if (!secret) return <AdminUnlockForm onUnlock={unlock} error={error} />;

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasActiveFilter = q || payment !== "all" || fulfillment !== "all" || pkg !== "all";

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold text-ink">Get Listed Campaigns</h1>
        <div className="flex items-center gap-4">
          <Link href="/admin/get-listed/analytics" className="text-sm text-accent hover:underline">
            Analytics
          </Link>
          <Link href="/admin/get-listed/queue" className="text-sm text-accent hover:underline">
            Submission queue →
          </Link>
          <button
            onClick={exportCsv}
            disabled={exporting}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-ink hover:border-accent disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" />
            {exporting ? "Exporting…" : "Export CSV"}
          </button>
        </div>
      </div>
      {exportError && <p className="text-sm text-danger">{exportError}</p>}

      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { label: "Total", value: stats.total },
            { label: "Awaiting payment", value: stats.awaitingPayment },
            { label: "Active", value: stats.active },
            { label: "In progress", value: stats.inProgress },
            { label: "Completed", value: stats.completed },
            { label: "Submissions", value: stats.submissions.total },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-border bg-surface p-3">
              <span className="block font-display text-xl font-bold text-ink">{s.value}</span>
              <span className="block text-xs text-muted">{s.label}</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={qInput}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search name, website, owner email, order id..."
            className="w-full rounded-lg border border-border bg-surface py-2 pl-9 pr-3 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none"
          />
        </div>
        <select
          value={payment}
          onChange={(e) => resetPageOn(setPayment)(e.target.value)}
          className="rounded-lg border border-border bg-surface px-2 py-2 text-sm text-ink"
        >
          <option value="all">All payment</option>
          <option value="no_order">No order</option>
          <option value="pending">Pending</option>
          <option value="paid">Paid</option>
          <option value="failed">Failed</option>
          <option value="refunded">Refunded</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <select
          value={fulfillment}
          onChange={(e) => resetPageOn(setFulfillment)(e.target.value)}
          className="rounded-lg border border-border bg-surface px-2 py-2 text-sm text-ink"
        >
          <option value="all">All fulfillment</option>
          <option value="draft">Draft</option>
          <option value="awaiting_payment">Awaiting payment</option>
          <option value="active">Active</option>
          <option value="in_progress">In progress</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
          {softDeleteReady && <option value="deleted">Deleted</option>}
        </select>
        <select
          value={pkg}
          onChange={(e) => resetPageOn(setPkg)(e.target.value)}
          className="rounded-lg border border-border bg-surface px-2 py-2 text-sm text-ink"
        >
          <option value="all">All packages</option>
          {Object.values(GET_LISTED_PACKAGES).map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </select>
        <select
          value={sort}
          onChange={(e) => resetPageOn(setSort)(e.target.value)}
          className="rounded-lg border border-border bg-surface px-2 py-2 text-sm text-ink"
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="updated">Recently updated</option>
          <option value="progress_high">Highest progress</option>
          <option value="progress_low">Lowest progress</option>
        </select>
      </div>

      {rows === null ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted">
          {hasActiveFilter ? "No campaigns match your search or filters." : "No campaigns yet."}
        </p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-2 text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-2">Product</th>
                  <th className="px-4 py-2">Package</th>
                  <th className="px-4 py-2">Payment</th>
                  <th className="px-4 py-2">Fulfillment</th>
                  <th className="px-4 py-2">Progress</th>
                  <th className="px-4 py-2">Accepted</th>
                  <th className="px-4 py-2">Pending</th>
                  <th className="px-4 py-2">Rejected</th>
                  <th className="px-4 py-2">Next action</th>
                  <th className="px-4 py-2">Created</th>
                  <th className="px-4 py-2">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-surface">
                {rows.map((c) => (
                  <tr key={c.id} className={c.deleted_at ? "opacity-50" : undefined}>
                    <td className="px-4 py-2">
                      <Link href={`/admin/get-listed/campaigns/${c.id}`} className="font-semibold text-accent hover:underline">
                        {c.startup_name}
                      </Link>
                      <span className="block text-xs text-muted">{c.owner_email ?? "-"}</span>
                      {c.deleted_at && <span className="text-xs font-bold uppercase text-danger">Deleted</span>}
                    </td>
                    <td className="px-4 py-2 text-ink">
                      {GET_LISTED_PACKAGES[c.package_key as GetListedPackageKey]?.label ?? c.package_key}
                    </td>
                    <td className="px-4 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${PAYMENT_STYLE[c.payment_status]}`}>
                        {PAYMENT_LABEL[c.payment_status]}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${FULFILLMENT_STYLE[c.status]}`}>
                        {FULFILLMENT_LABEL[c.status]}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-ink">
                      {c.submission_count}/{c.submission_target}
                    </td>
                    <td className="px-4 py-2 text-[#16a34a]">{c.accepted_count}</td>
                    <td className="px-4 py-2 text-muted">{c.pending_count}</td>
                    <td className="px-4 py-2 text-danger">{c.rejected_count}</td>
                    <td className="px-4 py-2 text-xs text-muted">{c.next_action}</td>
                    <td className="px-4 py-2 text-muted">{new Date(c.created_at).toLocaleDateString()}</td>
                    <td className="px-4 py-2">
                      <Link href={`/admin/get-listed/campaigns/${c.id}`} className="text-xs font-semibold text-accent hover:underline">
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between text-sm text-muted">
            <span>
              Showing {(page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, total)} of {total}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="flex items-center gap-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-ink disabled:opacity-40"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Previous
              </button>
              <span className="text-xs">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="flex items-center gap-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-ink disabled:opacity-40"
              >
                Next
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </>
      )}
    </main>
  );
}
