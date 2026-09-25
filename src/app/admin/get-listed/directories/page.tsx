"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Search, ChevronLeft, ChevronRight, Plus, ArrowLeft } from "lucide-react";
import { useAdminSecret } from "@/lib/useAdminSecret";
import { AdminUnlockForm } from "@/components/AdminUnlockForm";
import type { Directory, DirectoryStatus } from "@/types/database";

const PAGE_SIZE = 25;

const STATUS_STYLE: Record<DirectoryStatus, string> = {
  active: "bg-[#16a34a]/10 text-[#16a34a]",
  inactive: "bg-surface-2 text-muted",
};

export default function AdminDirectoriesPage() {
  const { secret, unlock, reject } = useAdminSecret();
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Directory[] | null>(null);
  const [total, setTotal] = useState(0);
  const [libraryReady, setLibraryReady] = useState(true);

  const [q, setQ] = useState("");
  const [qInput, setQInput] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ name: "", websiteUrl: "", submissionUrl: "", category: "", notes: "", adminName: "" });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!secret) return;
    const params = new URLSearchParams({ q, status, page: String(page), pageSize: String(PAGE_SIZE) });
    fetch(`/api/admin/get-listed/directories?${params.toString()}`, { headers: { "x-admin-secret": secret } })
      .then(async (res) => {
        if (res.status === 401) {
          reject();
          setError("Wrong admin key.");
          return;
        }
        const data = await res.json();
        setRows(data.directories ?? []);
        setTotal(data.total ?? 0);
        setLibraryReady(data.libraryReady !== false);
      })
      .catch(() => setRows([]));
  }, [secret, q, status, page, reject]);

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

  async function addDirectory(e: React.FormEvent) {
    e.preventDefault();
    if (!secret || !form.name.trim() || !form.websiteUrl.trim()) return;
    setSaveError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/admin/get-listed/directories", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-secret": secret },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveError(data.error ?? "Could not add directory.");
        return;
      }
      setForm({ name: "", websiteUrl: "", submissionUrl: "", category: "", notes: "", adminName: form.adminName });
      setAddOpen(false);
      setPage(1);
      load();
    } catch {
      setSaveError("Network error, please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (!secret) return <AdminUnlockForm onUnlock={unlock} error={error} />;

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/admin/get-listed/campaigns" className="flex items-center gap-1.5 text-sm text-muted hover:text-accent">
          <ArrowLeft className="h-4 w-4" />
          Campaigns
        </Link>
        <h1 className="font-display text-2xl font-bold text-ink">Directory Library</h1>
        <button
          onClick={() => setAddOpen((v) => !v)}
          className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-ink"
        >
          <Plus className="h-3.5 w-3.5" />
          Add directory
        </button>
      </div>

      {!libraryReady && (
        <p className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted">
          Directory Library isn&apos;t set up yet, the migration needs to be applied first.
        </p>
      )}

      {addOpen && (
        <form onSubmit={addDirectory} className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-6 shadow-sm">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Directory name"
              className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink placeholder:text-muted"
            />
            <input
              required
              value={form.websiteUrl}
              onChange={(e) => setForm((f) => ({ ...f, websiteUrl: e.target.value }))}
              placeholder="Website URL"
              className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink placeholder:text-muted"
            />
            <input
              value={form.submissionUrl}
              onChange={(e) => setForm((f) => ({ ...f, submissionUrl: e.target.value }))}
              placeholder="Submission URL (optional)"
              className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink placeholder:text-muted"
            />
            <input
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              placeholder="Category (optional)"
              className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink placeholder:text-muted"
            />
          </div>
          <textarea
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            placeholder="Internal notes (submission requirements, known issues...)"
            rows={2}
            className="resize-none rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink placeholder:text-muted"
          />
          <input
            value={form.adminName}
            onChange={(e) => setForm((f) => ({ ...f, adminName: e.target.value }))}
            placeholder="Your name (for the activity log)"
            className="max-w-xs rounded-lg border border-border bg-bg px-3 py-2 text-xs text-ink placeholder:text-muted"
          />
          {saveError && <p className="text-sm text-danger">{saveError}</p>}
          <button
            type="submit"
            disabled={saving}
            className="w-fit rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-accent-ink disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save directory"}
          </button>
        </form>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={qInput}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search name, website, category..."
            className="w-full rounded-lg border border-border bg-surface py-2 pl-9 pr-3 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none"
          />
        </div>
        <select
          value={status}
          onChange={(e) => {
            setPage(1);
            setStatus(e.target.value);
          }}
          className="rounded-lg border border-border bg-surface px-2 py-2 text-sm text-ink"
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {rows === null ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted">
          {q || status !== "all" ? "No directories match your search or filters." : "No directories yet. Add your first one above."}
        </p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-2 text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-2">Name</th>
                  <th className="px-4 py-2">Category</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-surface">
                {rows.map((d) => (
                  <tr key={d.id}>
                    <td className="px-4 py-2">
                      <Link href={`/admin/get-listed/directories/${d.id}`} className="font-semibold text-accent hover:underline">
                        {d.name}
                      </Link>
                      <span className="block text-xs text-muted">{d.website_url}</span>
                    </td>
                    <td className="px-4 py-2 text-muted">{d.category ?? "-"}</td>
                    <td className="px-4 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[d.status]}`}>{d.status}</span>
                    </td>
                    <td className="px-4 py-2 text-muted">{new Date(d.updated_at).toLocaleDateString()}</td>
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
