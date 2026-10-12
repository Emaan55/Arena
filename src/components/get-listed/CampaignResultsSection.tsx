"use client";

import { useEffect, useState } from "react";
import { ArrowDown, BadgeCheck } from "lucide-react";
import { CampaignResultCard } from "@/components/get-listed/CampaignResultCard";
import type { CampaignResultWithPlatforms } from "@/lib/get-listed/campaign-results";

const PAGE_SIZE = 6;

export function CampaignResultsSection() {
  const [results, setResults] = useState<CampaignResultWithPlatforms[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    let active = true;
    fetch(`/api/get-listed/results?limit=${PAGE_SIZE}&offset=0`)
      .then((response) => (response.ok ? response.json() : { results: [], hasMore: false }))
      .then((data) => {
        if (!active) return;
        setResults(data.results ?? []);
        setHasMore(data.hasMore === true);
      })
      .catch(() => {
        if (active) setResults([]);
      });
    return () => { active = false; };
  }, []);

  async function viewMore() {
    if (!results || loadingMore) return;
    setLoadingMore(true);
    try {
      const response = await fetch(`/api/get-listed/results?limit=${PAGE_SIZE}&offset=${results.length}`);
      const data = response.ok ? await response.json() : { results: [], hasMore: false };
      setResults((current) => [...(current ?? []), ...(data.results ?? [])]);
      setHasMore(data.hasMore === true);
    } finally {
      setLoadingMore(false);
    }
  }

  if (results === null) {
    return (
      <section className="border-y border-border bg-surface px-6 py-20 md:px-10" aria-label="Loading campaign results">
        <div className="mx-auto max-w-6xl animate-pulse"><div className="h-4 w-36 rounded bg-surface-2" /><div className="mt-4 h-10 max-w-md rounded bg-surface-2" /><div className="mt-10 grid gap-5 lg:grid-cols-2"><div className="h-80 rounded-[1.75rem] bg-surface-2" /><div className="hidden h-80 rounded-[1.75rem] bg-surface-2 lg:block" /></div></div>
      </section>
    );
  }
  if (results.length === 0) return null;

  return (
    <section className="border-y border-border bg-surface px-6 py-20 md:px-10">
      <div className="mx-auto max-w-6xl">
        <div className="max-w-3xl">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-accent"><BadgeCheck className="h-4 w-4" />Published campaign evidence</p>
          <h2 className="mt-3 font-display text-3xl font-black text-ink sm:text-4xl">Real Results. Real Exposure.</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">See how we&apos;ve helped products get discovered through real promotional campaigns. Explore published content, platform views, and campaign results.</p>
        </div>

        <div className="mt-10 grid items-stretch gap-5 lg:grid-cols-2">
          {results.map((result) => <CampaignResultCard key={result.id} result={result} />)}
        </div>

        {hasMore && (
          <div className="mt-8 text-center"><button type="button" onClick={viewMore} disabled={loadingMore} className="inline-flex h-11 items-center gap-2 rounded-xl border border-border bg-bg px-5 text-sm font-bold text-ink transition hover:border-accent disabled:opacity-50">{loadingMore ? "Loading…" : "View More Results"}<ArrowDown className="h-4 w-4" /></button></div>
        )}
        <p className="mx-auto mt-8 max-w-3xl text-center text-xs leading-5 text-muted">Views are manually recorded from published platform metrics and may change over time. Combined views are not unique visitors. Domain Rating is measured independently by Ahrefs.</p>
      </div>
    </section>
  );
}
