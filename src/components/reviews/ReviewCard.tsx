"use client";

import { useState } from "react";
import Image from "next/image";
import { Star, Quote, Box } from "lucide-react";
import type { PublicArenaReview } from "@/lib/arena-review-types";

export function ReviewAvatar({ name, url, small = false }: { name: string; url: string | null; small?: boolean }) {
  const [broken, setBroken] = useState(false);
  const initials = name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  return <span className={`review-avatar ${small ? "review-avatar-small" : ""}`}>
    {url && !broken ? <Image src={url} alt="" width={48} height={48} unoptimized onError={() => setBroken(true)} /> : <span aria-hidden="true">{initials}</span>}
  </span>;
}

export function ReviewStars({ rating }: { rating: number }) {
  return <span className="review-stars" role="img" aria-label={`${rating} out of 5 stars`}>
    {Array.from({ length: 5 }, (_, index) => <Star key={index} size={14} fill={index < rating ? "currentColor" : "none"} aria-hidden="true" />)}
  </span>;
}

export function ReviewAverageStars({ rating }: { rating: number }) {
  const width = `${Math.max(0, Math.min(5, rating)) / 5 * 100}%`;
  return <span className="review-average-stars" role="img" aria-label={`${rating.toFixed(1)} out of 5 stars`}>
    <span aria-hidden="true">{[0, 1, 2, 3, 4].map((i) => <Star key={i} size={14} />)}</span>
    <span className="review-average-fill" style={{ width }} aria-hidden="true">{[0, 1, 2, 3, 4].map((i) => <Star key={i} size={14} fill="currentColor" />)}</span>
  </span>;
}

export function ReviewCard({ review, compact = false }: { review: PublicArenaReview; compact?: boolean }) {
  return <article className={`review-card ${compact ? "review-card-compact" : ""}`}>
    <div className="review-card-top">
      <ReviewAvatar name={review.author_name} url={review.avatar_url} />
      <div className="min-w-0">
        <h3 className="review-author">{review.author_name}</h3>
        {review.product_name && <p className="review-product-label">Builder of {review.product_name}</p>}
        <ReviewStars rating={review.rating} />
      </div>
      <Quote className="review-quote-icon" size={20} aria-hidden="true" />
    </div>
    <blockquote className="review-body">{review.body}</blockquote>
    <div className="review-card-bottom">
      {review.product_name ? <span className="review-product"><span className="review-product-icon"><Box size={15} /></span>{review.product_name}</span> : <time dateTime={review.created_at}>{new Date(review.created_at).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" })}</time>}
      <span className="review-tag">{review.category}</span>
    </div>
  </article>;
}
