"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BarChart3, ExternalLink, Search } from "lucide-react";
import { AdminUnlockForm } from "@/components/AdminUnlockForm";
import { useAdminSecret } from "@/lib/useAdminSecret";

type CampaignRow = {
  id: string;
  startup_name: string;
  website_url: string;
  package_label: string;
  campaign_duration_days: number | null;
  status: string;
  updated_at: string;
  result: null | {
    id: string;
    is_published: boolean;
    updated_at: string;
    published_at: string | null;
    domain_rating: number | null;
  };
};

export default function AdminCampaignResultsPage() {
  const { secret, unlock, reject } = useAdminSecret();
  const [campaigns, setCampaigns] = useState<CampaignRow[] | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!secret) return;
    fetch("/api/admin/get-listed/results", { headers: { "x-admin-secret": secret }, cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (response.status === 401) { reject(); setError("Wrong admin key."); return; }
        if (!response.ok) { setError(data.error ?? "Could not load campaign results."); setCampaigns([]); return; }
        setCampaigns(data.campaigns ?? []);
      })
      .catch(() => { setError("Could not load campaign results."); setCampaigns([]); });
  }, [secret, reject]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (campaigns ?? []).filter((campaign) => !needle || `${campaign.startup_name} ${campaign.website_url} ${campaign.package_label}`.toLowerCase().includes(needle));
  }, [campaigns, query]);

  if (!secret) return <AdminUnlockForm onUnlock={unlock} error={error} />;

  const published = (campaigns ?? []).filter((campaign) => campaign.result?.is_published).length;
  const drafts = (campaigns ?? []).filter((campaign) => campaign.result && !campaign.result.is_published).length;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-accent">Get Listed</p>
      <h1 className="mt-1 font-display text-3xl font-black text-ink">Campaign Results</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">Publish only real campaign evidence. Results remain separate from payment and fulfillment status.</p>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {[
          ["Campaigns", campaigns?.length ?? 0],
          ["Published results", published],
          ["Draft results", drafts],
        ].map(([label, value]) => <div key={String(label)} className="rounded-2xl border border-border bg-surface p-4"><span className="text-xs font-bold uppercase tracking-wide text-muted">{label}</span><strong className="mt-1 block font-display text-2xl text-ink">{value}</strong></div>)}
      </div>

      <div className="relative mt-6 max-w-md"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search campaigns…" className="w-full rounded-xl border border-border bg-surface py-2.5 pl-9 pr-3 text-sm text-ink" /></div>
      {error && <p className="mt-4 rounded-xl border border-danger/30 bg-danger/5 p-3 text-sm text-danger">{error}</p>}

      <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-surface">
        {campaigns === null ? <p className="p-6 text-sm text-muted">Loading campaigns…</p> : filtered.length === 0 ? <p className="p-6 text-sm text-muted">No campaigns match this search.</p> : (
          <div className="divide-y divide-border">
            {filtered.map((campaign) => (
              <div key={campaign.id} className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent"><BarChart3 className="h-5 w-5" /></div>
                <div className="min-w-0 flex-1"><p className="truncate font-display text-sm font-bold text-ink">{campaign.startup_name}</p><p className="truncate text-xs text-muted">{campaign.package_label}{campaign.campaign_duration_days ? ` · ${campaign.campaign_duration_days} days` : ""}</p></div>
                <span className={`w-fit rounded-full px-2.5 py-1 text-[11px] font-bold ${campaign.result?.is_published ? "bg-emerald-500/10 text-emerald-600" : campaign.result ? "bg-amber-500/10 text-amber-600" : "bg-surface-2 text-muted"}`}>{campaign.result?.is_published ? "Published" : campaign.result ? "Draft" : "Not created"}</span>
                <Link href={`/admin/get-listed/results/${campaign.id}`} className="inline-flex items-center gap-1.5 text-sm font-bold text-accent">Manage <ExternalLink className="h-3.5 w-3.5" /></Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
