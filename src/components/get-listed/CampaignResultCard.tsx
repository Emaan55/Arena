"use client";

import { BarChart3, BriefcaseBusiness, CalendarDays, ExternalLink, Video } from "lucide-react";
import { ProductAvatar } from "@/components/ProductAvatar";
import {
  PLATFORM_LABELS,
  combinedReportedViews,
  type CampaignResultPlatform,
  type CampaignResultWithPlatforms,
} from "@/lib/get-listed/campaign-results";

function PlatformIcon({ platform }: { platform: CampaignResultPlatform["platform"] }) {
  if (platform === "youtube") return <Video className="h-4 w-4" aria-hidden="true" />;
  if (platform === "linkedin") return <BriefcaseBusiness className="h-4 w-4" aria-hidden="true" />;
  return <span className="font-display text-sm font-black" aria-hidden="true">X</span>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value));
}

export function CampaignResultCard({ result }: { result: CampaignResultWithPlatforms }) {
  const measuredPlatforms = result.platforms.filter((entry) => entry.views !== null);
  const combinedViews = combinedReportedViews(result.platforms);

  return (
    <article className="flex h-full min-w-0 flex-col overflow-hidden rounded-[1.75rem] border border-border bg-bg shadow-sm">
      <div className="border-b border-border bg-[linear-gradient(135deg,color-mix(in_srgb,var(--accent)_10%,var(--surface)),var(--surface))] p-5 sm:p-6">
        <div className="flex min-w-0 items-start gap-4">
          <ProductAvatar name={result.product_name} logoUrl={result.logo_url} size="lg" padded />
          <div className="min-w-0 flex-1">
            <a href={result.website_url} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-1.5 font-display text-lg font-black text-ink hover:text-accent">
              <span className="truncate">{result.product_name}</span><ExternalLink className="h-3.5 w-3.5 shrink-0" />
            </a>
            <p className="mt-1 text-xs font-semibold text-muted">
              {result.package_label}{result.campaign_duration_days ? ` · ${result.campaign_duration_days} days` : ""}
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-col p-5 sm:p-6">
        {(measuredPlatforms.length > 0 || result.domain_rating !== null) && (
          <div className="grid gap-3 sm:grid-cols-2">
            {measuredPlatforms.length > 0 && (
              <div className="rounded-2xl border border-accent/20 bg-accent/5 p-4">
                <BarChart3 className="h-4 w-4 text-accent" />
                <span className="mt-3 block text-[10px] font-bold uppercase tracking-[0.14em] text-muted">Combined Reported Views</span>
                <strong className="mt-1 block font-display text-2xl font-black text-ink">{combinedViews.toLocaleString()}</strong>
              </div>
            )}
            {result.domain_rating !== null && (
              <div className="rounded-2xl border border-border bg-surface p-4">
                <span className="text-xs font-black text-accent">Ahrefs</span>
                <span className="mt-3 block text-[10px] font-bold uppercase tracking-[0.14em] text-muted">Domain Rating</span>
                <strong className="mt-1 block font-display text-2xl font-black text-ink">{result.domain_rating}</strong>
                {result.dr_recorded_at && <span className="mt-1 block text-[11px] text-muted">Measured {formatDate(result.dr_recorded_at)}</span>}
                {result.dr_evidence_url && <a href={result.dr_evidence_url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-accent">View evidence <ExternalLink className="h-3 w-3" /></a>}
              </div>
            )}
          </div>
        )}

        {result.platforms.length > 0 && (
          <div className="mt-5 space-y-2.5" aria-label={`${result.product_name} published campaign content`}>
            {result.platforms.map((entry, index) => (
              <div key={entry.id || `${entry.platform}-${index}`} className="flex min-w-0 items-center gap-3 rounded-xl border border-border bg-surface px-3.5 py-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent"><PlatformIcon platform={entry.platform} /></div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-ink">{PLATFORM_LABELS[entry.platform]}{result.platforms.filter((item) => item.platform === entry.platform).length > 1 ? ` post ${result.platforms.filter((item) => item.platform === entry.platform).indexOf(entry) + 1}` : ""}</p>
                  <p className="text-xs text-muted">
                    {entry.views !== null ? `${entry.views.toLocaleString()} views` : "Published content"}
                    {entry.views_recorded_at ? ` · recorded ${formatDate(entry.views_recorded_at)}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {entry.evidence_url && <a href={entry.evidence_url} target="_blank" rel="noopener noreferrer" className="text-[11px] font-semibold text-muted hover:text-accent">Evidence</a>}
                  <a href={entry.published_url} target="_blank" rel="noopener noreferrer" aria-label={`View ${PLATFORM_LABELS[entry.platform]} content for ${result.product_name}`} className="inline-flex items-center gap-1 text-xs font-bold text-accent">View <ExternalLink className="h-3 w-3" /></a>
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="mt-5 flex items-center gap-1.5 border-t border-border pt-4 text-[11px] text-muted"><CalendarDays className="h-3.5 w-3.5" />Last updated {formatDate(result.updated_at)}</p>
      </div>
    </article>
  );
}
