import { ExternalLink, Globe2, UsersRound } from "lucide-react";
import type { ArenaPublicMetrics } from "@/lib/site-metrics";

const number = new Intl.NumberFormat("en-US");

export function ArenaReachStats({ metrics }: { metrics: ArenaPublicMetrics }) {
  const rating = metrics.domainRating === null ? "—" : Number.isInteger(metrics.domainRating) ? String(metrics.domainRating) : metrics.domainRating.toFixed(1);
  return (
    <div className="grid w-full max-w-3xl gap-3 sm:grid-cols-2" aria-label="The Arena reach">
      <article className="flex items-center gap-4 rounded-2xl border border-border bg-surface/90 px-5 py-4 text-left shadow-sm backdrop-blur">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent"><Globe2 className="h-5 w-5" /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-bold uppercase tracking-[0.14em] text-muted">Domain rating</span>
          <strong className="mt-0.5 block font-mono text-2xl text-ink">{rating}<small className="ml-1 text-xs font-medium text-muted">/100</small></strong>
          {metrics.domainRatingSourceUrl ? <a href={metrics.domainRatingSourceUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-accent hover:underline">Verified by {metrics.domainRatingSource ?? "SEO provider"} <ExternalLink className="h-2.5 w-2.5" /></a> : <span className="mt-1 block text-[10px] text-muted">Awaiting a verified SEO score</span>}
        </span>
      </article>
      <article className="flex items-center gap-4 rounded-2xl border border-border bg-surface/90 px-5 py-4 text-left shadow-sm backdrop-blur">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500"><UsersRound className="h-5 w-5" /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-bold uppercase tracking-[0.14em] text-muted">Monthly visitors</span>
          <strong className="mt-0.5 block font-mono text-2xl text-ink">{number.format(metrics.monthlyVisitors)}</strong>
          <span className="mt-1 block text-[10px] text-muted"><span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />Live rolling 30-day unique count</span>
        </span>
      </article>
    </div>
  );
}

