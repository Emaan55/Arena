"use client";

import { useState } from "react";
import Image from "next/image";
import { Star, Quote, Box, ExternalLink } from "lucide-react";
import { reviewerAvatarSources } from "@/lib/arena-review-validation";
import type { PublicArenaReview } from "@/lib/arena-review-types";

export function ReviewAvatar({ name, url, fallbackUrls = [], small = false }: { name: string; url: string | null; fallbackUrls?: string[]; small?: boolean }) {
  const [failed, setFailed] = useState<string[]>([]);
  const source = [url, ...fallbackUrls].find((candidate) => candidate && !failed.includes(candidate));
  const initials = name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  return <span className={`review-avatar ${small ? "review-avatar-small" : ""}`}>
    {source ? <Image key={source} src={source} alt="" width={48} height={48} unoptimized referrerPolicy="no-referrer" onError={() => setFailed((previous) => [...previous, source])} /> : <span aria-hidden="true">{initials}</span>}
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
  const sources = reviewerAvatarSources(review);
  const socialLabel = review.social_platform === "x" ? `𝕏 @${review.social_handle}` : review.social_platform === "instagram" ? `Instagram @${review.social_handle}` : review.social_platform === "linkedin" ? "LinkedIn profile" : "Public profile";
  return <article className={`review-card ${compact ? "review-card-compact" : ""}`}>
    <div className="review-card-top">
      {review.social_url ? <a href={review.social_url} target="_blank" rel="noopener noreferrer nofollow ugc" aria-label={`Visit ${review.author_name}'s public profile`} className="review-avatar-link"><ReviewAvatar name={review.author_name} url={sources[0] ?? null} fallbackUrls={sources.slice(1)} /></a> : <ReviewAvatar name={review.author_name} url={sources[0] ?? null} fallbackUrls={sources.slice(1)} />}
      <div className="min-w-0">
        <h3 className="review-author">{review.social_url ? <a href={review.social_url} target="_blank" rel="noopener noreferrer nofollow ugc">{review.author_name}</a> : review.author_name}</h3>
        {review.social_url && <a className="review-social-link" href={review.social_url} target="_blank" rel="noopener noreferrer nofollow ugc">{socialLabel}<ExternalLink size={10} aria-hidden="true" /></a>}
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
