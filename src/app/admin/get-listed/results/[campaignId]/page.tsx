"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Eye, Plus, Save, Send, Trash2 } from "lucide-react";
import { AdminUnlockForm } from "@/components/AdminUnlockForm";
import { CampaignResultCard } from "@/components/get-listed/CampaignResultCard";
import {
  PLATFORM_LABELS,
  isValidPlatformUrl,
  parseSafeHttpUrl,
  type CampaignResultPlatformName,
  type CampaignResultWithPlatforms,
} from "@/lib/get-listed/campaign-results";
import { useAdminSecret } from "@/lib/useAdminSecret";

type CampaignSummary = {
  id: string;
  startup_name: string;
  website_url: string;
  package_label: string;
  campaign_duration_days: number | null;
  status: string;
  deleted_at: string | null;
};

type PlatformForm = { key: string; platform: CampaignResultPlatformName; publishedUrl: string; views: string; viewsRecordedAt: string; evidenceUrl: string };
type FormState = { productName: string; logoUrl: string; websiteUrl: string; packageLabel: string; campaignDurationDays: string; domainRating: string; drRecordedAt: string; drEvidenceUrl: string; platforms: PlatformForm[] };

function blankPlatform(platform: CampaignResultPlatformName): PlatformForm {
  return { key: crypto.randomUUID(), platform, publishedUrl: "", views: "", viewsRecordedAt: "", evidenceUrl: "" };
}

export default function AdminCampaignResultEditorPage() {
  const params = useParams<{ campaignId: string }>();
  const { secret, unlock, reject } = useAdminSecret();
  const [campaign, setCampaign] = useState<CampaignSummary | null>(null);
  const [result, setResult] = useState<CampaignResultWithPlatforms | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [newPlatform, setNewPlatform] = useState<CampaignResultPlatformName>("youtube");
  const [adminName, setAdminName] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    if (!secret) return;
    const response = await fetch(`/api/admin/get-listed/results/${params.campaignId}`, { headers: { "x-admin-secret": secret }, cache: "no-store" });
    const data = await response.json();
    if (response.status === 401) { reject(); setError("Wrong admin key."); return; }
    if (!response.ok) { setError(data.error ?? "Could not load campaign result."); return; }
    const nextCampaign = data.campaign as CampaignSummary;
    const nextResult = data.result as CampaignResultWithPlatforms | null;
    setCampaign(nextCampaign);
    setResult(nextResult);
    setForm({
      productName: nextResult?.product_name ?? nextCampaign.startup_name,
      logoUrl: nextResult?.logo_url ?? "",
      websiteUrl: nextResult?.website_url ?? nextCampaign.website_url,
      packageLabel: nextResult?.package_label ?? nextCampaign.package_label,
      campaignDurationDays: nextResult?.campaign_duration_days ? String(nextResult.campaign_duration_days) : nextCampaign.campaign_duration_days ? String(nextCampaign.campaign_duration_days) : "",
      domainRating: nextResult?.domain_rating === null || nextResult?.domain_rating === undefined ? "" : String(nextResult.domain_rating),
      drRecordedAt: nextResult?.dr_recorded_at ?? "",
      drEvidenceUrl: nextResult?.dr_evidence_url ?? "",
      platforms: (nextResult?.platforms ?? []).map((entry) => ({ key: entry.id, platform: entry.platform, publishedUrl: entry.published_url, views: entry.views === null ? "" : String(entry.views), viewsRecordedAt: entry.views_recorded_at ?? "", evidenceUrl: entry.evidence_url ?? "" })),
    });
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetching admin data after unlock/navigation, not deriving render state
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secret, params.campaignId]);

  function updatePlatform(key: string, patch: Partial<PlatformForm>) {
    setForm((current) => current ? { ...current, platforms: current.platforms.map((entry) => entry.key === key ? { ...entry, ...patch } : entry) } : current);
  }

  async function save(isPublished: boolean) {
    if (!secret || !form) return;
    setSaving(true); setError(""); setSuccess("");
    try {
      const response = await fetch(`/api/admin/get-listed/results/${params.campaignId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "x-admin-secret": secret },
        body: JSON.stringify({ ...form, isPublished, adminName }),
      });
      const data = await response.json();
      if (response.status === 401) { reject(); setError("Wrong admin key."); return; }
      if (!response.ok) { setError(data.error ?? "Could not save campaign results."); return; }
      setResult(data.result);
      setSuccess(isPublished ? "Campaign result is published." : result?.is_published ? "Campaign result was removed from the public page." : "Draft saved.");
      await load();
    } catch {
      setError("Could not save campaign results.");
    } finally {
      setSaving(false);
    }
  }

  const preview = useMemo<CampaignResultWithPlatforms | null>(() => {
    if (!form || !campaign) return null;
    const safeWebsite = parseSafeHttpUrl(form.websiteUrl)?.toString();
    if (!safeWebsite) return null;
    return {
      id: result?.id ?? "preview",
      campaign_id: campaign.id,
      product_name: form.productName || campaign.startup_name,
      logo_url: parseSafeHttpUrl(form.logoUrl)?.toString() ?? null,
      website_url: safeWebsite,
      package_label: form.packageLabel || campaign.package_label,
      campaign_duration_days: form.campaignDurationDays ? Number(form.campaignDurationDays) : null,
      domain_rating: form.domainRating ? Number(form.domainRating) : null,
      dr_source: "Ahrefs",
      dr_recorded_at: form.drRecordedAt || null,
      dr_evidence_url: parseSafeHttpUrl(form.drEvidenceUrl)?.toString() ?? null,
      is_published: result?.is_published ?? false,
      published_at: result?.published_at ?? null,
      created_at: result?.created_at ?? new Date().toISOString(),
      updated_at: new Date().toISOString(),
      platforms: form.platforms.filter((entry) => isValidPlatformUrl(entry.platform, entry.publishedUrl)).map((entry, index) => ({ id: entry.key, campaign_result_id: result?.id ?? "preview", platform: entry.platform, published_url: entry.publishedUrl, views: entry.views === "" ? null : Number(entry.views), views_recorded_at: entry.viewsRecordedAt || null, evidence_url: parseSafeHttpUrl(entry.evidenceUrl)?.toString() ?? null, position: index, created_at: new Date().toISOString(), updated_at: new Date().toISOString() })),
    };
  }, [campaign, form, result]);

  if (!secret) return <AdminUnlockForm onUnlock={unlock} error={error} />;
  if (!campaign || !form) return <main className="mx-auto max-w-6xl px-6 py-12"><p className="text-sm text-muted">{error || "Loading campaign result…"}</p></main>;

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <Link href="/admin/get-listed/results" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-accent"><ArrowLeft className="h-4 w-4" />Campaign Results</Link>
      <div className="mt-5 flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-accent">Campaign result</p><h1 className="mt-1 font-display text-3xl font-black text-ink">{campaign.startup_name}</h1><p className="mt-1 text-sm text-muted">{result?.is_published ? "Published publicly" : result ? "Saved as draft" : "No result created yet"}</p></div><span className={`rounded-full px-3 py-1.5 text-xs font-bold ${result?.is_published ? "bg-emerald-500/10 text-emerald-600" : "bg-surface-2 text-muted"}`}>{result?.is_published ? "Published" : "Draft"}</span></div>

      <div className="mt-6 grid items-start gap-6 xl:grid-cols-[1.08fr_.92fr]">
        <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-6">
          <h2 className="font-display text-lg font-bold text-ink">Campaign Results</h2>
          <p className="mt-1 text-xs text-muted">All values are entered manually. Empty metrics and unselected platforms stay hidden publicly.</p>
          <label className="mt-5 block text-xs font-semibold text-muted">Admin name<input value={adminName} onChange={(event) => setAdminName(event.target.value)} placeholder="Used in the audit log" className="mt-1 w-full rounded-xl border border-border bg-bg px-3 py-2.5 text-sm text-ink" /></label>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="text-xs font-semibold text-muted">Product name<input required value={form.productName} onChange={(event) => setForm({ ...form, productName: event.target.value })} className="mt-1 w-full rounded-xl border border-border bg-bg px-3 py-2.5 text-sm text-ink" /></label>
            <label className="text-xs font-semibold text-muted">Package<input required value={form.packageLabel} onChange={(event) => setForm({ ...form, packageLabel: event.target.value })} className="mt-1 w-full rounded-xl border border-border bg-bg px-3 py-2.5 text-sm text-ink" /></label>
            <label className="text-xs font-semibold text-muted sm:col-span-2">Product website<input required type="url" value={form.websiteUrl} onChange={(event) => setForm({ ...form, websiteUrl: event.target.value })} className="mt-1 w-full rounded-xl border border-border bg-bg px-3 py-2.5 text-sm text-ink" /></label>
            <label className="text-xs font-semibold text-muted">Logo URL (optional)<input type="url" value={form.logoUrl} onChange={(event) => setForm({ ...form, logoUrl: event.target.value })} placeholder="https://…" className="mt-1 w-full rounded-xl border border-border bg-bg px-3 py-2.5 text-sm text-ink" /></label>
            <label className="text-xs font-semibold text-muted">Campaign duration (days)<input type="number" min="1" value={form.campaignDurationDays} onChange={(event) => setForm({ ...form, campaignDurationDays: event.target.value })} className="mt-1 w-full rounded-xl border border-border bg-bg px-3 py-2.5 text-sm text-ink" /></label>
          </div>

          <div className="mt-6 rounded-2xl border border-border bg-bg p-4">
            <h3 className="font-display text-sm font-bold text-ink">Domain Rating</h3><p className="mt-1 text-xs text-muted">Manually measured with Ahrefs. Leave all fields blank to hide DR.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-xs font-semibold text-muted">Ahrefs DR (0–100)<input type="number" min="0" max="100" step="0.1" value={form.domainRating} onChange={(event) => setForm({ ...form, domainRating: event.target.value })} className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-ink" /></label><label className="text-xs font-semibold text-muted">Date recorded<input type="date" value={form.drRecordedAt} onChange={(event) => setForm({ ...form, drRecordedAt: event.target.value })} className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-ink" /></label><label className="text-xs font-semibold text-muted sm:col-span-2">Evidence URL (optional)<input type="url" value={form.drEvidenceUrl} onChange={(event) => setForm({ ...form, drEvidenceUrl: event.target.value })} placeholder="https://…" className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-ink" /></label></div>
          </div>

          <div className="mt-6">
            <div className="flex flex-wrap items-end justify-between gap-3"><div><h3 className="font-display text-sm font-bold text-ink">Platform results</h3><p className="mt-1 text-xs text-muted">Add only published posts or videos. Multiple entries per platform are supported.</p></div><div className="flex flex-wrap gap-2"><select value={newPlatform} onChange={(event) => setNewPlatform(event.target.value as CampaignResultPlatformName)} className="rounded-xl border border-border bg-bg px-3 py-2 text-sm text-ink"><option value="youtube">YouTube</option><option value="linkedin">LinkedIn</option><option value="x">X</option></select><button type="button" onClick={() => setForm({ ...form, platforms: [...form.platforms, blankPlatform(newPlatform)] })} className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-3 py-2 text-sm font-bold text-accent-ink"><Plus className="h-4 w-4" />Add Platform Result</button></div></div>
            <div className="mt-4 space-y-4">
              {form.platforms.length === 0 && <p className="rounded-xl border border-dashed border-border p-5 text-center text-sm text-muted">No platform results added. This area will stay hidden publicly.</p>}
              {form.platforms.map((entry, index) => <div key={entry.key} className="rounded-2xl border border-border bg-bg p-4"><div className="flex items-center justify-between gap-3"><strong className="text-sm text-ink">Result {index + 1}</strong><button type="button" onClick={() => setForm({ ...form, platforms: form.platforms.filter((item) => item.key !== entry.key) })} aria-label={`Remove result ${index + 1}`} className="rounded-lg p-2 text-muted hover:bg-danger/10 hover:text-danger"><Trash2 className="h-4 w-4" /></button></div><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-xs font-semibold text-muted">Platform<select value={entry.platform} onChange={(event) => updatePlatform(entry.key, { platform: event.target.value as CampaignResultPlatformName })} className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-ink"><option value="youtube">YouTube</option><option value="linkedin">LinkedIn</option><option value="x">X</option></select></label><label className="text-xs font-semibold text-muted">Views (optional)<input type="number" min="0" step="1" value={entry.views} onChange={(event) => updatePlatform(entry.key, { views: event.target.value })} className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-ink" /></label><label className="text-xs font-semibold text-muted sm:col-span-2">Published {PLATFORM_LABELS[entry.platform]} URL<input required type="url" value={entry.publishedUrl} onChange={(event) => updatePlatform(entry.key, { publishedUrl: event.target.value })} placeholder={entry.platform === "youtube" ? "https://youtube.com/watch?v=…" : entry.platform === "linkedin" ? "https://linkedin.com/posts/…" : "https://x.com/user/status/…"} className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-ink" /></label><label className="text-xs font-semibold text-muted">Views recorded date<input type="date" value={entry.viewsRecordedAt} onChange={(event) => updatePlatform(entry.key, { viewsRecordedAt: event.target.value })} className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-ink" /></label><label className="text-xs font-semibold text-muted">Proof URL (optional)<input type="url" value={entry.evidenceUrl} onChange={(event) => updatePlatform(entry.key, { evidenceUrl: event.target.value })} placeholder="https://…" className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-ink" /></label></div></div>)}
            </div>
          </div>

          {error && <p className="mt-5 rounded-xl border border-danger/30 bg-danger/5 p-3 text-sm text-danger">{error}</p>}
          {success && <p className="mt-5 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-600">{success}</p>}
          <div className="mt-6 flex flex-wrap gap-2"><button type="button" disabled={saving} onClick={() => save(result?.is_published ?? false)} className="inline-flex items-center gap-2 rounded-xl border border-border bg-bg px-4 py-2.5 text-sm font-bold text-ink disabled:opacity-50"><Save className="h-4 w-4" />{saving ? "Saving…" : result?.is_published ? "Save Updates" : "Save Draft"}</button>{result?.is_published ? <button type="button" disabled={saving} onClick={() => save(false)} className="rounded-xl border border-danger/40 px-4 py-2.5 text-sm font-bold text-danger disabled:opacity-50">Unpublish</button> : <button type="button" disabled={saving} onClick={() => save(true)} className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-accent-ink disabled:opacity-50"><Send className="h-4 w-4" />Publish Result</button>}</div>
        </section>

        <aside className="xl:sticky xl:top-24"><p className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-muted"><Eye className="h-4 w-4" />Public card preview</p>{preview ? <CampaignResultCard result={preview} /> : <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted">Enter a valid product website to preview the public card.</div>}</aside>
      </div>
    </main>
  );
}
