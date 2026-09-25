"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Plus, Pencil, Trash2, RotateCcw, ExternalLink, Download } from "lucide-react";
import { useAdminSecret } from "@/lib/useAdminSecret";
import { AdminUnlockForm } from "@/components/AdminUnlockForm";
import { downloadAdminFile } from "@/lib/download-admin-file";
import {
  CATEGORIES,
  type AdminAuditLog,
  type Campaign,
  type CampaignStatus,
  type Category,
  type Directory,
  type Order,
  type Submission,
  type SubmissionStatus,
} from "@/types/database";
import { GET_LISTED_PACKAGES, type GetListedPackageKey } from "@/lib/get-listed/packages";
import type { AdminPaymentStatus, SubmissionSummary } from "@/lib/get-listed/admin";
import { parseRawSubmissions } from "@/lib/get-listed/import-parser";

type CampaignWithOwner = Campaign & { owner_email: string | null };

const ORDER_STATUS_STYLE: Record<Order["payment_status"], string> = {
  pending: "bg-surface-2 text-muted",
  paid: "bg-[#16a34a]/10 text-[#16a34a]",
  failed: "bg-danger/10 text-danger",
  refunded: "bg-danger/10 text-danger",
  cancelled: "bg-surface-2 text-muted",
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

const CAMPAIGN_STATUSES: CampaignStatus[] = ["draft", "awaiting_payment", "active", "in_progress", "completed", "cancelled"];
const SUBMISSION_STATUSES: SubmissionStatus[] = ["pending", "submitted", "accepted", "rejected"];

const ACTION_LABEL: Record<string, string> = {
  status_changed: "Fulfillment status changed",
  campaign_edited: "Campaign edited",
  campaign_deleted: "Campaign deleted",
  campaign_restored: "Campaign restored",
  submission_added: "Submission added",
  submission_added_from_library: "Submission added from Directory Library",
  submission_bulk_imported: "Submissions imported",
  submission_edited: "Submission edited",
  submission_status_changed: "Submission status changed",
  bulk_submission_update: "Bulk submission update",
  payment_reconciled: "Payment reconciled manually",
  payment_received: "Payment received",
};

function describeAudit(entry: AdminAuditLog): string {
  const meta = (entry.metadata ?? {}) as Record<string, unknown>;
  switch (entry.action) {
    case "status_changed":
      return `${meta.from} → ${meta.to}`;
    case "campaign_edited":
      return Array.isArray(meta.changed_fields) ? `Changed: ${meta.changed_fields.join(", ")}` : "";
    case "campaign_deleted":
      return typeof meta.reason === "string" && meta.reason ? `Reason: ${meta.reason}` : "";
    case "submission_added":
    case "submission_added_from_library":
      return typeof meta.directory === "string" ? `${meta.directory} (${meta.status ?? "pending"})` : "";
    case "bulk_submission_update":
      return typeof meta.to_status === "string" && typeof meta.count === "number"
        ? `${meta.count} submission${meta.count === 1 ? "" : "s"} marked ${meta.to_status}`
        : "";
    case "submission_bulk_imported":
      return typeof meta.count === "number"
        ? `${meta.count} imported${
            typeof meta.skipped_duplicates === "number" && meta.skipped_duplicates > 0
              ? `, ${meta.skipped_duplicates} duplicate${meta.skipped_duplicates === 1 ? "" : "s"} skipped`
              : ""
          }`
        : "";
    case "submission_edited":
    case "submission_status_changed":
      return [
        typeof meta.directory === "string" ? meta.directory : null,
        Array.isArray(meta.changed_fields) ? `changed: ${meta.changed_fields.join(", ")}` : null,
      ]
        .filter(Boolean)
        .join(", ");
    case "payment_reconciled":
      return typeof meta.payment_reference === "string" ? `Reference: ${meta.payment_reference}` : "";
    case "payment_received":
      return typeof meta.provider_order_id === "string" ? `LemonSqueezy order ${meta.provider_order_id}` : "";
    default:
      return "";
  }
}

export default function AdminCampaignDetailPage() {
  const params = useParams<{ id: string }>();
  const { secret, unlock, reject } = useAdminSecret();
  const [error, setError] = useState<string | null>(null);
  const [campaign, setCampaign] = useState<CampaignWithOwner | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [auditLog, setAuditLog] = useState<AdminAuditLog[]>([]);
  const [paymentStatus, setPaymentStatus] = useState<AdminPaymentStatus>("no_order");
  const [summary, setSummary] = useState<SubmissionSummary | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  // One shared "acting as" name, used for every mutating action on this
  // page rather than re-asking per action — see admin_audit_logs.
  const [adminName, setAdminName] = useState("");

  const [newSub, setNewSub] = useState({ directoryName: "", directoryUrl: "", status: "pending" as SubmissionStatus, listingUrl: "", notes: "" });
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [libraryDirectories, setLibraryDirectories] = useState<Directory[]>([]);
  const [selectedDirectoryId, setSelectedDirectoryId] = useState("");

  const [importText, setImportText] = useState("");
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<{
    imported: number;
    skippedDuplicates: string[];
    invalid: { line: number; raw: string; error: string }[];
    totalParsed: number;
  } | null>(null);

  const [selectedSubmissionIds, setSelectedSubmissionIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);

  const [reconcile, setReconcile] = useState({ paymentReference: "", reason: "", adminName: "" });
  const [reconciling, setReconciling] = useState(false);
  const [reconcileError, setReconcileError] = useState<string | null>(null);
  const [reconcileOpen, setReconcileOpen] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    startupName: "",
    websiteUrl: "",
    description: "",
    category: "" as Category | "",
    xUrl: "",
    linkedinUrl: "",
    otherUrl: "",
  });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteReason, setDeleteReason] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  async function exportCsv() {
    if (!secret) return;
    setExportError(null);
    setExporting(true);
    try {
      await downloadAdminFile(`/api/admin/get-listed/campaigns/${params.id}/export`, secret, "submissions.csv");
    } catch {
      setExportError("Could not export CSV.");
    } finally {
      setExporting(false);
    }
  }

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
    setAuditLog(data.auditLog ?? []);
    setPaymentStatus(data.paymentStatus ?? "no_order");
    setSummary(data.submissionSummary ?? null);
    setEditForm({
      startupName: data.campaign.startup_name,
      websiteUrl: data.campaign.website_url,
      description: data.campaign.description,
      category: data.campaign.category,
      xUrl: data.campaign.x_url ?? "",
      linkedinUrl: data.campaign.linkedin_url ?? "",
      otherUrl: data.campaign.other_url ?? "",
    });
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetching admin data on unlock/navigation, not a render-driven derivation
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secret, params.id]);

  useEffect(() => {
    if (!secret) return;
    fetch(`/api/admin/get-listed/directories?status=active&pageSize=100`, { headers: { "x-admin-secret": secret } })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setLibraryDirectories(data?.directories ?? []))
      .catch(() => {});
  }, [secret]);

  if (!secret) return <AdminUnlockForm onUnlock={unlock} error={error} />;
  if (error) return <main className="mx-auto max-w-2xl px-6 py-24 text-center text-sm text-danger">{error}</main>;
  if (!campaign) return <main className="mx-auto max-w-2xl px-6 py-24 text-center text-sm text-muted">Loading…</main>;

  const isDeleted = Boolean(campaign.deleted_at);

  function pickDirectory(directoryId: string) {
    setSelectedDirectoryId(directoryId);
    const directory = libraryDirectories.find((d) => d.id === directoryId);
    if (directory) {
      setNewSub((s) => ({ ...s, directoryName: directory.name, directoryUrl: directory.submission_url || directory.website_url }));
    }
  }

  async function addSubmission(e: React.FormEvent) {
    e.preventDefault();
    if (!newSub.directoryName.trim() || !secret) return;
    setAddError(null);
    setAdding(true);
    try {
      const res = await fetch(`/api/admin/get-listed/campaigns/${params.id}/submissions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-secret": secret },
        body: JSON.stringify({ ...newSub, directoryId: selectedDirectoryId || null, adminName }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAddError(data.error ?? "Could not add submission.");
        return;
      }
      setNewSub({ directoryName: "", directoryUrl: "", status: "pending", listingUrl: "", notes: "" });
      setSelectedDirectoryId("");
      await load();
    } catch {
      setAddError("Network error, please try again.");
    } finally {
      setAdding(false);
    }
  }

  async function importSubmissions() {
    if (!secret || !importText.trim()) return;
    setImportError(null);
    setImportResult(null);
    setImporting(true);
    try {
      const res = await fetch(`/api/admin/get-listed/campaigns/${params.id}/submissions/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-secret": secret },
        body: JSON.stringify({ rawText: importText, adminName }),
      });
      const data = await res.json();
      if (!res.ok) {
        setImportError(data.error ?? "Could not import submissions.");
        return;
      }
      setImportResult(data);
      if (data.imported > 0) setImportText("");
      await load();
    } catch {
      setImportError("Network error, please try again.");
    } finally {
      setImporting(false);
    }
  }

  function toggleSubmissionSelected(id: string) {
    setSelectedSubmissionIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function runBulkAction(action: "mark_submitted" | "mark_accepted" | "mark_rejected") {
    if (!secret || selectedSubmissionIds.size === 0) return;
    setBulkError(null);
    setBulkBusy(true);
    try {
      const res = await fetch(`/api/admin/get-listed/campaigns/${params.id}/submissions/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-secret": secret },
        body: JSON.stringify({ submissionIds: Array.from(selectedSubmissionIds), action, adminName }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBulkError(data.error ?? "Could not update submissions.");
        return;
      }
      setSelectedSubmissionIds(new Set());
      await load();
    } catch {
      setBulkError("Network error, please try again.");
    } finally {
      setBulkBusy(false);
    }
  }

  async function updateSubmission(id: string, patch: Partial<{ status: SubmissionStatus; listingUrl: string; notes: string; directoryUrl: string }>) {
    if (!secret) return;
    await fetch(`/api/admin/get-listed/submissions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-admin-secret": secret },
      body: JSON.stringify({ ...patch, adminName }),
    });
    await load();
  }

  async function updateCampaignStatus(status: CampaignStatus) {
    if (!secret) return;
    setStatusError(null);
    const res = await fetch(`/api/admin/get-listed/campaigns/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-admin-secret": secret },
      body: JSON.stringify({ status, adminName }),
    });
    const data = await res.json();
    if (!res.ok) {
      setStatusError(data.error ?? "Could not update status.");
      return;
    }
    await load();
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!secret) return;
    setEditError(null);
    setEditSaving(true);
    try {
      const res = await fetch(`/api/admin/get-listed/campaigns/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-admin-secret": secret },
        body: JSON.stringify({
          startupName: editForm.startupName,
          websiteUrl: editForm.websiteUrl,
          description: editForm.description,
          category: editForm.category,
          xUrl: editForm.xUrl,
          linkedinUrl: editForm.linkedinUrl,
          otherUrl: editForm.otherUrl,
          adminName,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setEditError(data.error ?? "Could not save changes.");
        return;
      }
      setEditOpen(false);
      await load();
    } catch {
      setEditError("Network error, please try again.");
    } finally {
      setEditSaving(false);
    }
  }

  async function deleteCampaign() {
    if (!secret) return;
    setDeleteError(null);
    setDeleteBusy(true);
    try {
      const res = await fetch(`/api/admin/get-listed/campaigns/${params.id}/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-secret": secret },
        body: JSON.stringify({ adminName, reason: deleteReason }),
      });
      const data = await res.json();
      if (!res.ok) {
        setDeleteError(data.error ?? "Could not delete campaign.");
        return;
      }
      setDeleteOpen(false);
      setDeleteReason("");
      await load();
    } catch {
      setDeleteError("Network error, please try again.");
    } finally {
      setDeleteBusy(false);
    }
  }

  async function restoreCampaign() {
    if (!secret) return;
    await fetch(`/api/admin/get-listed/campaigns/${params.id}/restore`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-secret": secret },
      body: JSON.stringify({ adminName }),
    });
    await load();
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
        body: JSON.stringify({ ...reconcile, adminName: reconcile.adminName || adminName }),
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
      setReconcileError("Network error, please try again.");
    } finally {
      setReconciling(false);
    }
  }

  const importPreviewRows = importText.trim() ? parseRawSubmissions(importText) : [];
  const importValidCount = importPreviewRows.filter((r) => r.valid).length;

  const pkg = GET_LISTED_PACKAGES[campaign.package_key as GetListedPackageKey];
  // Historical package snapshot — prefer the most relevant order's actual
  // charged amount over recomputing from current config, since pricing can
  // change over time and this campaign already paid whatever it paid.
  const relevantOrder = orders.find((o) => o.payment_status === "paid") ?? orders[0] ?? null;

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-12">
      <Link href="/admin/get-listed/campaigns" className="flex items-center gap-1.5 text-sm text-muted hover:text-accent">
        <ArrowLeft className="h-4 w-4" />
        All campaigns
      </Link>

      <input
        value={adminName}
        onChange={(e) => setAdminName(e.target.value)}
        placeholder="Your name (attributed on the activity log below)"
        className="w-full max-w-sm rounded-lg border border-border bg-surface px-3 py-1.5 text-xs text-ink placeholder:text-muted"
      />

      {isDeleted && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-danger bg-danger/5 p-4">
          <div>
            <p className="text-sm font-bold uppercase text-danger">This campaign is deleted</p>
            <p className="text-xs text-muted">
              Deleted by {campaign.deleted_by ?? "unknown"} on {campaign.deleted_at && new Date(campaign.deleted_at).toLocaleString()}.
              Payment and submission history are preserved.
            </p>
          </div>
          <button
            onClick={restoreCampaign}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-ink"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Restore campaign
          </button>
        </div>
      )}

      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-xl font-bold text-ink">{campaign.startup_name}</h1>
            <p className="text-xs text-muted">
              ID {campaign.id} · Created {new Date(campaign.created_at).toLocaleString()} · Updated{" "}
              {new Date(campaign.updated_at).toLocaleString()}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2 py-1 text-xs font-semibold ${PAYMENT_STYLE[paymentStatus]}`}>
              Payment: {PAYMENT_LABEL[paymentStatus]}
            </span>
            <select
              value={campaign.status}
              disabled={isDeleted}
              onChange={(e) => updateCampaignStatus(e.target.value as CampaignStatus)}
              className="rounded-lg border border-border bg-bg px-2 py-1 text-sm text-ink disabled:opacity-50"
            >
              {CAMPAIGN_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>
        {statusError && <p className="text-sm text-danger">{statusError}</p>}
        {exportError && <p className="text-sm text-danger">{exportError}</p>}

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/admin/get-listed/campaigns/${campaign.id}/report`}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-bg px-3 py-1.5 text-xs font-semibold text-ink hover:border-accent"
          >
            Preview report
          </Link>
          <a
            href={`/get-listed/campaigns/${campaign.id}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-xs text-muted hover:text-accent"
          >
            <ExternalLink className="h-3 w-3" />
            Open live page
          </a>
          <button
            onClick={exportCsv}
            disabled={exporting}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-bg px-3 py-1.5 text-xs font-semibold text-ink hover:border-accent disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" />
            {exporting ? "Exporting…" : "Export CSV"}
          </button>
          <button
            onClick={() => setEditOpen((v) => !v)}
            disabled={isDeleted}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-bg px-3 py-1.5 text-xs font-semibold text-ink hover:border-accent disabled:opacity-50"
          >
            <Pencil className="h-3.5 w-3.5" />
            {editOpen ? "Cancel edit" : "Edit campaign"}
          </button>
          {!isDeleted && (
            <button
              onClick={() => setDeleteOpen((v) => !v)}
              className="flex items-center gap-1.5 rounded-lg border border-danger/40 bg-bg px-3 py-1.5 text-xs font-semibold text-danger hover:border-danger"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete campaign
            </button>
          )}
        </div>

        {deleteOpen && (
          <div className="flex flex-col gap-2 rounded-xl border border-danger/40 bg-danger/5 p-4">
            <p className="text-sm font-semibold text-ink">Delete this campaign?</p>
            <p className="text-xs text-muted">
              This will hide the campaign from the active campaign list. Payment and fulfillment history will be
              preserved, and it can be restored later.
            </p>
            <input
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
              placeholder="Reason (optional)"
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted"
            />
            {deleteError && <p className="text-sm text-danger">{deleteError}</p>}
            <div className="flex gap-2">
              <button
                onClick={() => setDeleteOpen(false)}
                className="rounded-lg border border-border bg-surface px-3 py-2 text-sm font-semibold text-ink"
              >
                Cancel
              </button>
              <button
                onClick={deleteCampaign}
                disabled={deleteBusy}
                className="rounded-lg bg-danger px-3 py-2 text-sm font-semibold text-danger-ink disabled:opacity-50"
              >
                {deleteBusy ? "Deleting…" : "Delete Campaign"}
              </button>
            </div>
          </div>
        )}

        {editOpen ? (
          <form onSubmit={saveEdit} className="flex flex-col gap-2 rounded-xl border border-border bg-bg p-4">
            <input
              required
              value={editForm.startupName}
              onChange={(e) => setEditForm((f) => ({ ...f, startupName: e.target.value }))}
              placeholder="Startup name"
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink"
            />
            <input
              required
              value={editForm.websiteUrl}
              onChange={(e) => setEditForm((f) => ({ ...f, websiteUrl: e.target.value }))}
              placeholder="Website URL"
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink"
            />
            <textarea
              required
              rows={3}
              value={editForm.description}
              onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Description"
              className="resize-none rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink"
            />
            <select
              value={editForm.category}
              onChange={(e) => setEditForm((f) => ({ ...f, category: e.target.value as Category }))}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <input
                value={editForm.xUrl}
                onChange={(e) => setEditForm((f) => ({ ...f, xUrl: e.target.value }))}
                placeholder="X URL (optional)"
                className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink"
              />
              <input
                value={editForm.linkedinUrl}
                onChange={(e) => setEditForm((f) => ({ ...f, linkedinUrl: e.target.value }))}
                placeholder="LinkedIn URL (optional)"
                className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink"
              />
              <input
                value={editForm.otherUrl}
                onChange={(e) => setEditForm((f) => ({ ...f, otherUrl: e.target.value }))}
                placeholder="Other URL (optional)"
                className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink"
              />
            </div>
            {editError && <p className="text-sm text-danger">{editError}</p>}
            <button
              type="submit"
              disabled={editSaving}
              className="w-fit rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-accent-ink disabled:opacity-50"
            >
              {editSaving ? "Saving…" : "Save changes"}
            </button>
          </form>
        ) : (
          <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <div>
              <span className="block text-xs uppercase tracking-wide text-muted">Owner</span>
              <span className="text-ink">{campaign.owner_email ?? "-"}</span>
            </div>
            <div>
              <span className="block text-xs uppercase tracking-wide text-muted">Category</span>
              <span className="text-ink">{campaign.category}</span>
            </div>
            <div>
              <span className="block text-xs uppercase tracking-wide text-muted">Website</span>
              <a href={campaign.website_url} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                Visit
              </a>
            </div>
            <div>
              <span className="block text-xs uppercase tracking-wide text-muted">Links</span>
              <span className="flex gap-2 text-xs text-accent">
                {campaign.x_url && <a href={campaign.x_url} target="_blank" rel="noreferrer" className="hover:underline">X</a>}
                {campaign.linkedin_url && <a href={campaign.linkedin_url} target="_blank" rel="noreferrer" className="hover:underline">LinkedIn</a>}
                {campaign.other_url && <a href={campaign.other_url} target="_blank" rel="noreferrer" className="hover:underline">Other</a>}
                {!campaign.x_url && !campaign.linkedin_url && !campaign.other_url && <span className="text-muted">-</span>}
              </span>
            </div>
            <p className="col-span-2 text-sm text-muted sm:col-span-4">{campaign.description}</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-6 shadow-sm">
          <h2 className="font-display text-base font-bold text-ink">Package</h2>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="block text-xs uppercase tracking-wide text-muted">Package</span>
              <span className="text-ink">{pkg?.label ?? campaign.package_key}</span>
            </div>
            <div>
              <span className="block text-xs uppercase tracking-wide text-muted">Target</span>
              <span className="text-ink">{campaign.submission_target} submissions</span>
            </div>
            <div>
              <span className="block text-xs uppercase tracking-wide text-muted">Amount charged</span>
              <span className="text-ink">
                {relevantOrder ? `$${(relevantOrder.final_amount / 100).toFixed(2)}` : `~$${pkg?.priceUsd ?? "-"} (estimate, no order yet)`}
              </span>
            </div>
            <div>
              <span className="block text-xs uppercase tracking-wide text-muted">Currency</span>
              <span className="text-ink">{relevantOrder?.currency ?? "USD"}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-6 shadow-sm">
          <h2 className="font-display text-base font-bold text-ink">Submission summary</h2>
          {summary && (
            <div className="grid grid-cols-3 gap-3 text-center text-xs">
              <div className="rounded-lg bg-surface-2 py-2">
                <span className="block font-display text-lg font-bold text-ink">{summary.submitted}</span>
                Submitted
              </div>
              <div className="rounded-lg bg-surface-2 py-2">
                <span className="block font-display text-lg font-bold text-[#16a34a]">{summary.accepted}</span>
                Accepted
              </div>
              <div className="rounded-lg bg-surface-2 py-2">
                <span className="block font-display text-lg font-bold text-muted">{summary.pending}</span>
                Pending
              </div>
              <div className="rounded-lg bg-surface-2 py-2">
                <span className="block font-display text-lg font-bold text-danger">{summary.rejected}</span>
                Rejected
              </div>
              <div className="col-span-2 rounded-lg bg-accent-soft/20 py-2">
                <span className="block font-display text-lg font-bold text-accent">{summary.remaining}</span>
                Remaining of {summary.target}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-base font-bold text-ink">Payments</h2>
          <button
            onClick={() => setReconcileOpen((v) => !v)}
            disabled={isDeleted}
            className="rounded-lg border border-border bg-bg px-3 py-1.5 text-xs font-semibold text-ink hover:border-accent disabled:opacity-50"
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
                      {o.discount_percent > 0 ? `${o.discount_percent}% (-$${(o.discount_amount / 100).toFixed(2)})` : "-"}
                    </td>
                    <td className="px-3 py-2 text-muted">{o.provider_order_id ?? "-"}</td>
                    <td className="px-3 py-2 text-muted">{o.paid_at ? new Date(o.paid_at).toLocaleString() : "-"}</td>
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

      <div className="flex flex-col gap-3 rounded-2xl border-2 border-accent bg-surface p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-base font-bold text-ink">Import submissions</h2>
          <span className="rounded-full bg-accent-soft/20 px-2 py-0.5 text-xs font-semibold text-accent">Fastest way to log directories</span>
        </div>
        <p className="text-xs text-muted">
          Paste rows copied from a spreadsheet, CSV, or plain text, one directory per line. Tab, comma, or pipe
          separated columns work: <span className="font-mono">Directory | URL | Status | Listing URL</span>. Status
          and both URLs are optional.
        </p>
        <textarea
          disabled={isDeleted}
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
          placeholder={
            "Product Hunt | https://producthunt.com | accepted | https://producthunt.com/posts/example\n" +
            "Uneed | https://uneed.best | submitted\n" +
            "Microlaunch | https://microlaunch.net | pending"
          }
          rows={8}
          className="resize-y rounded-lg border border-border bg-bg px-3 py-2 font-mono text-xs text-ink placeholder:text-muted disabled:opacity-50"
        />
        {importPreviewRows.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-muted">
              {importValidCount} of {importPreviewRows.length} row{importPreviewRows.length === 1 ? "" : "s"} ready to
              import{importPreviewRows.length > importValidCount ? `, ${importPreviewRows.length - importValidCount} need fixing` : ""}.
            </p>
            <div className="max-h-56 overflow-auto rounded-xl border border-border">
              <table className="w-full text-left text-xs">
                <thead className="bg-surface-2 uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-3 py-1.5">Directory</th>
                    <th className="px-3 py-1.5">URL</th>
                    <th className="px-3 py-1.5">Status</th>
                    <th className="px-3 py-1.5">Listing URL</th>
                    <th className="px-3 py-1.5">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-surface">
                  {importPreviewRows.slice(0, 50).map((r) => (
                    <tr key={r.lineNumber} className={r.valid ? "" : "bg-danger/5"}>
                      <td className="px-3 py-1.5 text-ink">{r.directoryName || "-"}</td>
                      <td className="px-3 py-1.5 text-muted">{r.directoryUrl ?? "-"}</td>
                      <td className="px-3 py-1.5 text-muted">{r.status}</td>
                      <td className="px-3 py-1.5 text-muted">{r.listingUrl ?? "-"}</td>
                      <td className="px-3 py-1.5 text-danger">{r.error ?? r.warning ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {importError && <p className="text-sm text-danger">{importError}</p>}
        {importResult && (
          <p className="text-sm text-ink">
            Imported {importResult.imported}.
            {importResult.skippedDuplicates.length > 0 &&
              ` Skipped ${importResult.skippedDuplicates.length} duplicate${importResult.skippedDuplicates.length === 1 ? "" : "s"} (${importResult.skippedDuplicates
                .slice(0, 5)
                .join(", ")}${importResult.skippedDuplicates.length > 5 ? ", ..." : ""}).`}
            {importResult.invalid.length > 0 && ` ${importResult.invalid.length} row${importResult.invalid.length === 1 ? "" : "s"} skipped for errors.`}
          </p>
        )}
        <button
          onClick={importSubmissions}
          disabled={importing || isDeleted || importValidCount === 0}
          className="w-fit rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink disabled:opacity-50"
        >
          {importing ? "Importing…" : `Import ${importValidCount || ""} submission${importValidCount === 1 ? "" : "s"}`}
        </button>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-6 shadow-sm">
        <h2 className="font-display text-base font-bold text-ink">Add a single submission</h2>
        {libraryDirectories.length > 0 && (
          <select
            disabled={isDeleted}
            value={selectedDirectoryId}
            onChange={(e) => pickDirectory(e.target.value)}
            className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink disabled:opacity-50"
          >
            <option value="">Choose from Directory Library (optional)…</option>
            {libraryDirectories.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        )}
        <form onSubmit={addSubmission} className="grid grid-cols-1 gap-2 sm:grid-cols-5">
          <input
            required
            disabled={isDeleted}
            value={newSub.directoryName}
            onChange={(e) => setNewSub((s) => ({ ...s, directoryName: e.target.value }))}
            placeholder="Directory name"
            className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink placeholder:text-muted sm:col-span-2 disabled:opacity-50"
          />
          <input
            disabled={isDeleted}
            value={newSub.directoryUrl}
            onChange={(e) => setNewSub((s) => ({ ...s, directoryUrl: e.target.value }))}
            placeholder="Directory URL"
            className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink placeholder:text-muted disabled:opacity-50"
          />
          <select
            disabled={isDeleted}
            value={newSub.status}
            onChange={(e) => setNewSub((s) => ({ ...s, status: e.target.value as SubmissionStatus }))}
            className="rounded-lg border border-border bg-bg px-2 py-2 text-sm text-ink disabled:opacity-50"
          >
            {SUBMISSION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={adding || isDeleted}
            className="flex items-center justify-center gap-1 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-accent-ink disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            Add
          </button>
        </form>
        {addError && <p className="text-sm text-danger">{addError}</p>}
      </div>

      {selectedSubmissionIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-accent bg-accent-soft/10 p-3">
          <span className="text-xs font-semibold text-ink">{selectedSubmissionIds.size} selected</span>
          <button
            onClick={() => runBulkAction("mark_submitted")}
            disabled={bulkBusy}
            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-ink disabled:opacity-50"
          >
            Mark submitted
          </button>
          <button
            onClick={() => runBulkAction("mark_accepted")}
            disabled={bulkBusy}
            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-[#16a34a] disabled:opacity-50"
          >
            Mark accepted
          </button>
          <button
            onClick={() => runBulkAction("mark_rejected")}
            disabled={bulkBusy}
            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-danger disabled:opacity-50"
          >
            Mark rejected
          </button>
          <button onClick={() => setSelectedSubmissionIds(new Set())} className="text-xs text-muted hover:text-ink">
            Clear selection
          </button>
          {bulkError && <p className="text-sm text-danger">{bulkError}</p>}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-2 text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="w-8 px-4 py-2">
                <input
                  type="checkbox"
                  checked={submissions.length > 0 && selectedSubmissionIds.size === submissions.length}
                  onChange={(e) => setSelectedSubmissionIds(e.target.checked ? new Set(submissions.map((s) => s.id)) : new Set())}
                />
              </th>
              <th className="px-4 py-2">Directory</th>
              <th className="px-4 py-2">Directory URL</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Listing URL</th>
              <th className="px-4 py-2">Submitted</th>
              <th className="px-4 py-2">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-surface">
            {submissions.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-sm text-muted">
                  No submissions yet. Start by adding the first directory submission above.
                </td>
              </tr>
            ) : (
              submissions.map((s) => (
                <tr key={s.id}>
                  <td className="px-4 py-2">
                    <input type="checkbox" checked={selectedSubmissionIds.has(s.id)} onChange={() => toggleSubmissionSelected(s.id)} />
                  </td>
                  <td className="px-4 py-2 text-ink">{s.directory_name}</td>
                  <td className="px-4 py-2">
                    <input
                      disabled={isDeleted}
                      defaultValue={s.directory_url ?? ""}
                      onBlur={(e) => e.target.value !== (s.directory_url ?? "") && updateSubmission(s.id, { directoryUrl: e.target.value })}
                      placeholder="https://…"
                      className="w-full rounded-lg border border-border bg-bg px-2 py-1 text-xs text-ink placeholder:text-muted disabled:opacity-50"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <select
                      disabled={isDeleted}
                      value={s.status}
                      onChange={(e) => updateSubmission(s.id, { status: e.target.value as SubmissionStatus })}
                      className="rounded-lg border border-border bg-bg px-2 py-1 text-xs text-ink disabled:opacity-50"
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
                      disabled={isDeleted}
                      defaultValue={s.listing_url ?? ""}
                      onBlur={(e) => e.target.value !== (s.listing_url ?? "") && updateSubmission(s.id, { listingUrl: e.target.value })}
                      placeholder="https://…"
                      className="w-full rounded-lg border border-border bg-bg px-2 py-1 text-xs text-ink placeholder:text-muted disabled:opacity-50"
                    />
                  </td>
                  <td className="px-4 py-2 text-xs text-muted">{s.submitted_at ? new Date(s.submitted_at).toLocaleDateString() : "-"}</td>
                  <td className="px-4 py-2">
                    <input
                      disabled={isDeleted}
                      defaultValue={s.notes ?? ""}
                      onBlur={(e) => e.target.value !== (s.notes ?? "") && updateSubmission(s.id, { notes: e.target.value })}
                      placeholder="Notes"
                      className="w-full rounded-lg border border-border bg-bg px-2 py-1 text-xs text-ink placeholder:text-muted disabled:opacity-50"
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-6 shadow-sm">
        <h2 className="font-display text-base font-bold text-ink">Activity</h2>
        {auditLog.length === 0 ? (
          <p className="text-sm text-muted">No activity recorded yet.</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {auditLog.map((entry) => (
              <li key={entry.id} className="flex flex-col gap-0.5 border-b border-border pb-2 last:border-0 last:pb-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-ink">{ACTION_LABEL[entry.action] ?? entry.action}</span>
                  <span className="text-xs text-muted">{new Date(entry.created_at).toLocaleString()}</span>
                </div>
                <span className="text-xs text-muted">
                  {entry.admin_identifier ? `By ${entry.admin_identifier}` : "System (webhook)"}
                  {describeAudit(entry) && ` : ${describeAudit(entry)}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
