import { ExternalLink, Globe2, UsersRound } from "lucide-react";
import type { ArenaPublicMetrics } from "@/lib/site-metrics";

const number = new Intl.NumberFormat("en-US");

export function ArenaReachStats({ metrics }: { metrics: ArenaPublicMetrics }) {
  const rating = metrics.domainRating === null ? "—" : Number.isInteger(metrics.domainRating) ? String(metrics.domainRating) : metrics.domainRating.toFixed(1);
  const ratingSource = metrics.domainRatingSourceUrl
    ? `Verified by ${metrics.domainRatingSource ?? "SEO provider"}`
    : "Awaiting a verified SEO score";

  return (
    <dl className="flex max-w-full flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted" aria-label="The Arena reach">
      <div className="flex flex-wrap items-center justify-center gap-1.5" title="Live rolling 30-day unique count">
        <UsersRound className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
        <dt>Monthly visitors</dt>
        <dd className="flex items-center gap-1.5 font-mono font-bold text-ink">
          {number.format(metrics.monthlyVisitors)}
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
          <span className="sr-only"> — live rolling 30-day unique count</span>
        </dd>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-1.5" title={ratingSource}>
        <Globe2 className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
        <dt>Domain rating</dt>
        <dd className="font-mono font-bold text-ink">
          {rating}<span className="font-normal text-muted">/100</span>
        </dd>
        {metrics.domainRatingSourceUrl ? (
          <a href={metrics.domainRatingSourceUrl} target="_blank" rel="noreferrer" className="rounded text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent" aria-label={`${ratingSource} (opens in a new tab)`}>
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </a>
        ) : <span className="sr-only">{ratingSource}</span>}
      </div>
    </dl>
  );
}

