"use client";

import { useState } from "react";
import { CheckCircle2, ExternalLink, Link2, Loader2, Save } from "lucide-react";
import type { CampaignDeliverable, CampaignDeliverableStatus } from "@/types/database";

const STATUSES: CampaignDeliverableStatus[] = ["pending", "in_progress", "completed", "not_applicable"];

function metricsToText(metrics: Record<string, string | number>) {
  return Object.entries(metrics ?? {}).map(([key, value]) => `${key}=${value}`).join("\n");
}

function textToMetrics(value: string) {
  const metrics: Record<string, string | number> = {};
  for (const line of value.split("\n")) {
    const [rawKey, ...rest] = line.split("=");
    const key = rawKey?.trim();
    const rawValue = rest.join("=").trim();
    if (!key || !rawValue) continue;
    const numberValue = Number(rawValue);
    metrics[key] = Number.isFinite(numberValue) && rawValue !== "" ? numberValue : rawValue;
  }
  return metrics;
}

function DeliverableRow({
  campaignId,
  deliverable,
  secret,
  adminName,
  disabled,
  onUpdated,
}: {
  campaignId: string;
  deliverable: CampaignDeliverable;
  secret: string;
  adminName: string;
  disabled: boolean;
  onUpdated: () => Promise<void>;
}) {
  const [form, setForm] = useState({
    status: deliverable.status,
    publicUrl: deliverable.public_url ?? "",
    assetUrl: deliverable.asset_url ?? "",
    customerNotes: deliverable.customer_notes ?? "",
    adminNotes: deliverable.admin_notes ?? "",
    metrics: metricsToText(deliverable.metrics),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/get-listed/campaigns/${campaignId}/deliverables/${deliverable.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-admin-secret": secret },
        body: JSON.stringify({ ...form, metrics: textToMetrics(form.metrics), adminName }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not update deliverable.");
        return;
      }
      await onUpdated();
    } catch {
      setError("Network error, please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className="rounded-xl border border-border bg-bg p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-xl">
          <div className="flex items-center gap-2">
            {deliverable.status === "completed" && <CheckCircle2 className="h-4 w-4 text-[#16a34a]" />}
            <h3 className="text-sm font-bold text-ink">{deliverable.title}</h3>
          </div>
          <p className="mt-1 text-xs leading-5 text-muted">{deliverable.purpose}</p>
        </div>
        <select value={form.status} disabled={disabled} onChange={(e) => setForm((current) => ({ ...current, status: e.target.value as CampaignDeliverableStatus }))} className="rounded-lg border border-border bg-surface px-2 py-1.5 text-xs font-semibold text-ink disabled:opacity-50">
          {STATUSES.map((status) => <option key={status} value={status}>{status.replace("_", " ")}</option>)}
        </select>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-semibold text-muted">Published URL<input type="url" value={form.publicUrl} onChange={(e) => setForm((current) => ({ ...current, publicUrl: e.target.value }))} placeholder="https://…" className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm font-normal text-ink" /></label>
        <label className="text-xs font-semibold text-muted">Asset or download URL<input type="url" value={form.assetUrl} onChange={(e) => setForm((current) => ({ ...current, assetUrl: e.target.value }))} placeholder="https://…" className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm font-normal text-ink" /></label>
        <label className="text-xs font-semibold text-muted">Customer update<textarea value={form.customerNotes} onChange={(e) => setForm((current) => ({ ...current, customerNotes: e.target.value }))} rows={2} placeholder="Visible in the customer's campaign dashboard" className="mt-1 w-full resize-none rounded-lg border border-border bg-surface px-3 py-2 text-sm font-normal text-ink" /></label>
        <label className="text-xs font-semibold text-muted">Internal notes<textarea value={form.adminNotes} onChange={(e) => setForm((current) => ({ ...current, adminNotes: e.target.value }))} rows={2} placeholder="Only visible to admins" className="mt-1 w-full resize-none rounded-lg border border-border bg-surface px-3 py-2 text-sm font-normal text-ink" /></label>
      </div>
      <label className="mt-3 block text-xs font-semibold text-muted">Available metrics<textarea value={form.metrics} onChange={(e) => setForm((current) => ({ ...current, metrics: e.target.value }))} rows={2} placeholder={"views=120\nclicks=14"} className="mt-1 w-full resize-none rounded-lg border border-border bg-surface px-3 py-2 font-mono text-xs font-normal text-ink" /></label>

      {error && <p className="mt-3 text-xs text-danger">{error}</p>}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-3 text-xs text-accent">
          {deliverable.public_url && <a href={deliverable.public_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline"><ExternalLink className="h-3 w-3" /> Published work</a>}
          {deliverable.asset_url && <a href={deliverable.asset_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline"><Link2 className="h-3 w-3" /> Asset</a>}
        </div>
        <button type="button" onClick={save} disabled={disabled || saving} className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-bold text-accent-ink disabled:opacity-50">{saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}{saving ? "Saving…" : "Save deliverable"}</button>
      </div>
    </article>
  );
}

export function CampaignDeliverablesEditor({ campaignId, deliverables, secret, adminName, disabled, onUpdated }: { campaignId: string; deliverables: CampaignDeliverable[]; secret: string; adminName: string; disabled: boolean; onUpdated: () => Promise<void> }) {
  if (deliverables.length === 0) return null;
  const completed = deliverables.filter((item) => item.status === "completed").length;
  const applicable = deliverables.filter((item) => item.status !== "not_applicable").length;

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-6 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div><h2 className="font-display text-base font-bold text-ink">Promotion deliverables</h2><p className="mt-1 text-xs text-muted">Record evidence and available metrics. Nothing is completed automatically.</p></div>
        <span className="text-xs font-bold text-muted">{completed} / {applicable} completed</span>
      </div>
      <div className="space-y-3">
        {deliverables.map((item) => <DeliverableRow key={`${item.id}-${item.updated_at}`} campaignId={campaignId} deliverable={item} secret={secret} adminName={adminName} disabled={disabled} onUpdated={onUpdated} />)}
      </div>
    </section>
  );
}


