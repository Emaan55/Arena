"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MessageSquareText } from "lucide-react";
import { ProductAvatar } from "@/components/ProductAvatar";

type FounderReview = {
  id: string;
  body: string;
  createdAt: string;
  reviewerName: string;
  product: { id: string; name: string; logo_url: string | null } | null;
};

export default function FounderProductReviewsPage() {
  const [reviews, setReviews] = useState<FounderReview[]>([]);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load(nextPage: number, append = false) {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/dashboard/reviews?page=${nextPage}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not load product reviews.");
      setReviews((current) => append ? [...current, ...data.reviews] : data.reviews);
      setPage(nextPage);
      setTotal(data.total ?? 0);
      setHasMore(Boolean(data.hasMore));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load product reviews.");
    } finally {
      setLoading(false);
    }
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect -- Load the authenticated founder's reviews after mount.
  useEffect(() => { void load(0); }, []);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-accent">Founder feedback</p>
        <h1 className="mt-1 font-display text-3xl font-black text-ink">Product reviews</h1>
        <p className="mt-2 text-sm text-muted">Only reviews left on products owned by your account appear here.</p>
      </div>

      <section className="mt-6 overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <span className="text-sm font-bold text-ink">{total} review{total === 1 ? "" : "s"}</span>
        </div>
        {error && <p className="p-5 text-sm text-danger">{error}</p>}
        {!error && !loading && reviews.length === 0 && (
          <div className="px-6 py-16 text-center">
            <MessageSquareText className="mx-auto h-8 w-8 text-muted" />
            <h2 className="mt-3 text-sm font-bold text-ink">No product reviews yet</h2>
            <p className="mt-1 text-xs text-muted">Reviews from voters will appear here after they review one of your products.</p>
          </div>
        )}
        <div className="divide-y divide-border">
          {reviews.map((review) => (
            <article key={review.id} className="p-5">
              <div className="flex items-start gap-3">
                <ProductAvatar name={review.product?.name ?? "Product"} logoUrl={review.product?.logo_url ?? null} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    {review.product ? <Link href={`/product/${review.product.id}`} className="text-sm font-bold text-accent hover:underline">{review.product.name}</Link> : <span className="text-sm font-bold text-ink">Product</span>}
                    <time className="text-[11px] text-muted">{new Date(review.createdAt).toLocaleString()}</time>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-ink">{review.body}</p>
                  <p className="mt-2 text-xs text-muted">From {review.reviewerName}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
        {loading && <div className="p-5 text-center text-sm text-muted">Loading product reviews…</div>}
      </section>

      {hasMore && <button type="button" disabled={loading} onClick={() => void load(page + 1, true)} className="mx-auto mt-5 block rounded-xl border border-border bg-surface px-5 py-2.5 text-sm font-bold text-ink hover:border-accent disabled:opacity-50">Load older reviews</button>}
    </main>
  );
}
