"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useAdminSecret } from "@/lib/useAdminSecret";
import { AdminUnlockForm } from "@/components/AdminUnlockForm";
import type { Directory } from "@/types/database";
import type { DirectoryStats } from "@/lib/get-listed/directories";

export default function AdminDirectoryDetailPage() {
  const params = useParams<{ id: string }>();
  const { secret, unlock, reject } = useAdminSecret();
  const [error, setError] = useState<string | null>(null);
  const [directory, setDirectory] = useState<Directory | null>(null);
  const [stats, setStats] = useState<DirectoryStats | null>(null);
  const [adminName, setAdminName] = useState("");

  const [form, setForm] = useState({
    name: "",
    websiteUrl: "",
    submissionUrl: "",
    category: "",
    notes: "",
    typicalReviewTime: "",
    difficulty: "",
    freeOrPaid: "",
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [statusBusy, setStatusBusy] = useState(false);

  function load() {
    if (!secret) return;
    fetch(`/api/admin/get-listed/directories/${params.id}`, { headers: { "x-admin-secret": secret } })
      .then(async (res) => {
        if (res.status === 401) {
          reject();
          setError("Wrong admin key.");
          return;
        }
        if (!res.ok) {
          setError("Directory not found.");
          return;
        }
        const data = await res.json();
        setDirectory(data.directory);
        setStats(data.stats);
        setForm({
          name: data.directory.name,
          websiteUrl: data.directory.website_url,
          submissionUrl: data.directory.submission_url ?? "",
          category: data.directory.category ?? "",
          notes: data.directory.notes ?? "",
          typicalReviewTime: data.directory.typical_review_time ?? "",
          difficulty: data.directory.difficulty ?? "",
          freeOrPaid: data.directory.free_or_paid ?? "",
        });
      })
      .catch(() => setError("Network error, please try again."));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secret, params.id]);

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!secret) return;
    setSaveError(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/get-listed/directories/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-admin-secret": secret },
        body: JSON.stringify({ ...form, adminName }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveError(data.error ?? "Could not save changes.");
        return;
      }
      load();
    } catch {
      setSaveError("Network error, please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus() {
    if (!secret || !directory) return;
    setStatusBusy(true);
    try {
      await fetch(`/api/admin/get-listed/directories/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-admin-secret": secret },
        body: JSON.stringify({ status: directory.status === "active" ? "inactive" : "active", adminName }),
      });
      load();
    } finally {
      setStatusBusy(false);
    }
  }

  if (!secret) return <AdminUnlockForm onUnlock={unlock} error={error} />;
  if (error) return <main className="mx-auto max-w-2xl px-6 py-24 text-center text-sm text-danger">{error}</main>;
  if (!directory) return <main className="mx-auto max-w-2xl px-6 py-24 text-center text-sm text-muted">Loading…</main>;

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-12">
      <Link href="/admin/get-listed/directories" className="flex items-center gap-1.5 text-sm text-muted hover:text-accent">
        <ArrowLeft className="h-4 w-4" />
        Directory Library
      </Link>

      <input
        value={adminName}
        onChange={(e) => setAdminName(e.target.value)}
        placeholder="Your name (attributed on the activity log)"
        className="w-full max-w-sm rounded-lg border border-border bg-surface px-3 py-1.5 text-xs text-ink placeholder:text-muted"
      />

      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-xl font-bold text-ink">{directory.name}</h1>
          <button
            onClick={toggleStatus}
            disabled={statusBusy}
            className={`rounded-full px-3 py-1 text-xs font-semibold disabled:opacity-50 ${
              directory.status === "active" ? "bg-[#16a34a]/10 text-[#16a34a]" : "bg-surface-2 text-muted"
            }`}
          >
            {directory.status === "active" ? "Active, click to deactivate" : "Inactive, click to activate"}
          </button>
        </div>

        {stats && (
          <div className="grid grid-cols-3 gap-3 border-t border-border pt-4 text-center text-xs sm:grid-cols-5">
            <div className="rounded-lg bg-surface-2 py-2">
              <span className="block font-display text-lg font-bold text-ink">{stats.total}</span>
              Total
            </div>
            <div className="rounded-lg bg-surface-2 py-2">
              <span className="block font-display text-lg font-bold text-[#16a34a]">{stats.accepted}</span>
              Accepted
            </div>
            <div className="rounded-lg bg-surface-2 py-2">
              <span className="block font-display text-lg font-bold text-muted">{stats.pending}</span>
              Pending
            </div>
            <div className="rounded-lg bg-surface-2 py-2">
              <span className="block font-display text-lg font-bold text-danger">{stats.rejected}</span>
              Rejected
            </div>
            <div className="rounded-lg bg-accent-soft/20 py-2">
              <span className="block font-display text-lg font-bold text-accent">
                {stats.acceptanceRate !== null ? `${stats.acceptanceRate}%` : "-"}
              </span>
              Acceptance
            </div>
          </div>
        )}
        {stats?.lastSubmittedAt && (
          <p className="text-xs text-muted">Last submitted: {new Date(stats.lastSubmittedAt).toLocaleDateString()}</p>
        )}
      </div>

      <form onSubmit={saveEdit} className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-6 shadow-sm">
        <h2 className="font-display text-base font-bold text-ink">Edit directory</h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <input
            required
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Directory name"
            className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink"
          />
          <input
            required
            value={form.websiteUrl}
            onChange={(e) => setForm((f) => ({ ...f, websiteUrl: e.target.value }))}
            placeholder="Website URL"
            className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink"
          />
          <input
            value={form.submissionUrl}
            onChange={(e) => setForm((f) => ({ ...f, submissionUrl: e.target.value }))}
            placeholder="Submission URL"
            className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink"
          />
          <input
            value={form.category}
            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
            placeholder="Category"
            className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink"
          />
          <input
            value={form.typicalReviewTime}
            onChange={(e) => setForm((f) => ({ ...f, typicalReviewTime: e.target.value }))}
            placeholder="Typical review time (e.g. 2-3 days)"
            className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink"
          />
          <input
            value={form.difficulty}
            onChange={(e) => setForm((f) => ({ ...f, difficulty: e.target.value }))}
            placeholder="Difficulty (e.g. easy/medium/hard)"
            className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink"
          />
          <input
            value={form.freeOrPaid}
            onChange={(e) => setForm((f) => ({ ...f, freeOrPaid: e.target.value }))}
            placeholder="Free or paid"
            className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink"
          />
        </div>
        <textarea
          value={form.notes}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          placeholder="Internal notes (submission requirements, known issues, review behavior...)"
          rows={4}
          className="resize-none rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink"
        />
        <p className="text-xs text-muted">
          These notes are admin-only, never shown in a customer report.
        </p>
        {saveError && <p className="text-sm text-danger">{saveError}</p>}
        <button
          type="submit"
          disabled={saving}
          className="w-fit rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-accent-ink disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </form>
    </main>
  );
}
