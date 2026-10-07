"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, MessageCircle } from "lucide-react";
import type { ArenaReviewFeed } from "@/lib/arena-review-types";
import { ReviewAverageStars, ReviewCard } from "./ReviewCard";

export function ReviewsTeaser({ initialFeed }: { initialFeed: ArenaReviewFeed }) {
  const [feed, setFeed] = useState(initialFeed);
  useEffect(() => {
    const refresh = () => { fetch("/api/arena-reviews?limit=3", { cache: "no-store" }).then(async (response) => {
      if (response.ok) setFeed(await response.json());
    }).catch(() => {}); };
    refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);
  return <section className="reviews-teaser" aria-labelledby="reviews-teaser-heading">
    <div className="reviews-container">
      <div className="review-eyebrow">💬 FROM THE ARENA</div>
      <h2 id="reviews-teaser-heading" className="review-teaser-heading">Built by founders.<br /><span>Reviewed by founders.</span></h2>
      <p className="review-teaser-description">See what builders think about competing, discovering products, and putting their work in The Arena.</p>
      {feed.available && feed.total > 0 && <div className="review-teaser-stats">
        <ReviewAverageStars rating={feed.averageRating ?? 0} />
        <strong>{feed.averageRating?.toFixed(1)}/5</strong><span>{feed.total.toLocaleString()} {feed.total === 1 ? "review" : "reviews"}</span>
      </div>}
      {feed.reviews.length > 0 ? <div className="review-teaser-grid">{feed.reviews.slice(0, 3).map((review) => <ReviewCard key={review.id} review={review} compact />)}</div> : <div className="review-teaser-empty">
        <MessageCircle size={28} aria-hidden="true" /><h3>{feed.available ? "Be the first voice on the wall." : "The founder wall is waiting for you."}</h3>
        <p>{feed.available ? "Tried The Arena? Share what competing and discovering felt like." : "Reviews are temporarily unavailable. You can still explore the review wall."}</p>
      </div>}
      <div className="review-cta-row">
        <Link className="review-button review-button-primary" href="/reviews">SEE ALL REVIEWS <span aria-hidden="true">→</span></Link>
        <Link className={`review-button ${feed.reviews.length < 3 ? "review-button-invite" : "review-button-secondary"}`} href="/reviews?add=1#add-review">ADD YOUR REVIEW <ArrowUpRight size={16} aria-hidden="true" /></Link>
      </div>
      <p className="review-invitation">Your experience belongs on the wall too.</p>
    </div>
  </section>;
}
