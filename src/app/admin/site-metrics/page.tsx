"use client";

import { useEffect, useState } from "react";
import { Globe2, Save, UsersRound } from "lucide-react";
import { AdminUnlockForm } from "@/components/AdminUnlockForm";
import { useAdminSecret } from "@/lib/useAdminSecret";

type Metrics = { domainRating: number | null; domainRatingSource: string | null; domainRatingSourceUrl: string | null; domainRatingCheckedAt: string | null; monthlyVisitors: number };

export default function AdminSiteMetricsPage() {
  const { secret, unlock, reject } = useAdminSecret();
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [form, setForm] = useState({ domainRating: "", source: "", sourceUrl: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    if (!secret) return;
    const response = await fetch("/api/admin/site-metrics", { headers: { "x-admin-secret": secret }, cache: "no-store" });
    if (response.status === 401) { reject(); setError("Wrong admin key."); return; }
    const data = await response.json();
    if (!response.ok) { setError(data.error ?? "Could not load site metrics."); return; }
    setMetrics(data.metrics);
    setForm({ domainRating: data.metrics.domainRating === null ? "" : String(data.metrics.domainRating), source: data.metrics.domainRatingSource ?? "", sourceUrl: data.metrics.domainRatingSourceUrl ?? "" });
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps -- Load admin data after unlock.
  useEffect(() => { void load(); }, [secret]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!secret) return;
    setSaving(true); setError("");
    const response = await fetch("/api/admin/site-metrics", { method: "PATCH", headers: { "Content-Type": "application/json", "x-admin-secret": secret }, body: JSON.stringify(form) });
    const data = await response.json();
    if (!response.ok) setError(data.error ?? "Could not save site metrics.");
    else { setMetrics(data.metrics); setForm({ domainRating: String(data.metrics.domainRating), source: data.metrics.domainRatingSource ?? "", sourceUrl: data.metrics.domainRatingSourceUrl ?? "" }); }
    setSaving(false);
  }

  if (!secret) return <AdminUnlockForm onUnlock={unlock} error={error} />;

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-accent">Public trust metrics</p>
      <h1 className="mt-1 font-display text-3xl font-black text-ink">Homepage reach</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">Monthly visitors update automatically. Enter domain rating only after checking a real SEO provider.</p>

      <section className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm"><UsersRound className="h-5 w-5 text-emerald-500" /><span className="mt-4 block text-xs font-bold uppercase tracking-wide text-muted">Unique visitors, last 30 days</span><strong className="mt-1 block font-mono text-3xl text-ink">{(metrics?.monthlyVisitors ?? 0).toLocaleString()}</strong><p className="mt-2 text-xs text-muted">Bot filtered and counted with a one-way visitor hash.</p></div>
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm"><Globe2 className="h-5 w-5 text-accent" /><span className="mt-4 block text-xs font-bold uppercase tracking-wide text-muted">Published domain rating</span><strong className="mt-1 block font-mono text-3xl text-ink">{metrics?.domainRating ?? "—"}<small className="ml-1 text-xs text-muted">/100</small></strong><p className="mt-2 text-xs text-muted">{metrics?.domainRatingCheckedAt ? `Checked ${new Date(metrics.domainRatingCheckedAt).toLocaleString()}` : "No verified score published yet."}</p></div>
      </section>

      <form onSubmit={save} className="mt-6 rounded-2xl border border-border bg-surface p-6 shadow-sm">
        <h2 className="font-display text-lg font-bold text-ink">Update verified domain rating</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-xs font-semibold text-muted">Domain rating (0–100)<input required type="number" min="0" max="100" step="0.1" value={form.domainRating} onChange={(e) => setForm((current) => ({ ...current, domainRating: e.target.value }))} className="mt-1 w-full rounded-xl border border-border bg-bg px-3 py-2.5 text-sm text-ink" /></label>
          <label className="text-xs font-semibold text-muted">SEO provider<input required value={form.source} onChange={(e) => setForm((current) => ({ ...current, source: e.target.value }))} placeholder="Ahrefs, Semrush, Moz…" className="mt-1 w-full rounded-xl border border-border bg-bg px-3 py-2.5 text-sm text-ink" /></label>
          <label className="text-xs font-semibold text-muted sm:col-span-2">Verification URL<input required type="url" value={form.sourceUrl} onChange={(e) => setForm((current) => ({ ...current, sourceUrl: e.target.value }))} placeholder="https://…" className="mt-1 w-full rounded-xl border border-border bg-bg px-3 py-2.5 text-sm text-ink" /></label>
        </div>
        {error && <p className="mt-4 text-sm text-danger">{error}</p>}
        <button type="submit" disabled={saving} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-accent-ink disabled:opacity-50"><Save className="h-4 w-4" />{saving ? "Saving…" : "Publish metric"}</button>
      </form>
    </main>
  );
}

