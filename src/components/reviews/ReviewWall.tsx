"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowRight, MessageCircle, Star, Crown, Plus, X, LoaderCircle } from "lucide-react";
import type { ArenaReviewFeed } from "@/lib/arena-review-types";
import { ARENA_REVIEW_MAX, REVIEW_CATEGORIES, reviewerAvatarSources, safeAvatarUrl } from "@/lib/arena-review-validation";
import { useAuthUser } from "@/lib/useAuthUser";
import { ReviewAverageStars, ReviewAvatar, ReviewCard } from "./ReviewCard";
import { ReviewerProfileFields } from "./ReviewerProfileFields";
import { ReviewArenaArt } from "./ReviewArenaArt";

type Filter = "All" | (typeof REVIEW_CATEGORIES)[number];

export function ReviewWall({ initialFeed, openOnArrival }: { initialFeed: ArenaReviewFeed; openOnArrival: boolean }) {
  const { user, loading: authLoading } = useAuthUser();
  const [feed, setFeed] = useState(initialFeed);
  const [heroReviews, setHeroReviews] = useState(initialFeed.reviews.slice(0, 4));
  const [filter, setFilter] = useState<Filter>("All");
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [formOpen, setFormOpen] = useState(openOnArrival);
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [success, setSuccess] = useState("");
  const formRef = useRef<HTMLElement>(null);
  const ratingRef = useRef<HTMLButtonElement>(null);
  const signInRef = useRef<HTMLAnchorElement>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (formOpen && !authLoading) {
      formRef.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "center" });
      (user ? ratingRef.current : signInRef.current)?.focus({ preventScroll: true });
    }
  }, [formOpen, authLoading, user]);

  // Handles the header/teaser link even when navigating on the same page.
  useEffect(() => {
    if (openOnArrival) setFormOpen(true); // eslint-disable-line react-hooks/set-state-in-effect
  }, [openOnArrival]);

  async function loadReviews(nextFilter: Filter, nextPage = 0) {
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({ page: String(nextPage) });
      if (nextFilter !== "All") query.set("category", nextFilter);
      const response = await fetch(`/api/arena-reviews?${query}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Reviews could not be loaded. Please try again.");
      const next: ArenaReviewFeed = await response.json();
      setFeed((previous) => ({ ...next, reviews: nextPage > 0 ? [...previous.reviews, ...next.reviews.filter((review) => !previous.reviews.some((r) => r.id === review.id))] : next.reviews }));
      if (nextFilter === "All" && nextPage === 0) setHeroReviews(next.reviews.slice(0, 4));
      setFilter(nextFilter);
      setPage(nextPage);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load reviews."); }
    finally { setLoading(false); }
  }

  async function submitReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSubmitting(true);
    setSubmitError("");
    try {
      const payload = new FormData();
      payload.set("review", JSON.stringify({ rating, body, category: form.get("category"), productName: form.get("productName"), displayName: form.get("displayName"), socialPlatform: form.get("socialPlatform"), socialProfile: form.get("socialProfile") }));
      const photo = form.get("photo");
      if (photo instanceof File && photo.size > 0) payload.set("photo", photo);
      const response = await fetch("/api/arena-reviews", { method: "POST", body: payload });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save your review.");
      setSuccess("Your review is on the wall. Thanks for sharing your experience!");
      setFormOpen(false);
      setBody("");
      setRating(0);
      addButtonRef.current?.focus();
      await loadReviews("All");
    } catch (cause) { setSubmitError(cause instanceof Error ? cause.message : "Could not save your review."); }
    finally { setSubmitting(false); }
  }

  return <main className="review-wall">
    <section className="review-wall-hero" aria-labelledby="review-wall-title">
      <div className="reviews-container review-hero-composition">
        <div className="review-hero-copy">
          <span className="review-eyebrow"><MessageCircle size={14} aria-hidden="true" /> FOUNDER REVIEWS</span>
          <h1 id="review-wall-title">Real Founders.<br /><span>Real Feedback.</span></h1>
          <p>See what builders are saying about THE ARENA.<br />Share your experience and help the community grow.</p>
          {feed.available && feed.total > 0 ? <div className="review-wall-stats">
            <div><strong>{feed.total.toLocaleString()}</strong><span>{feed.total === 1 ? "Review" : "Reviews"}</span></div>
            <div><strong>{feed.averageRating?.toFixed(1)}/5</strong><ReviewAverageStars rating={feed.averageRating ?? 0} /><span>Average rating</span></div>
            <div><MessageCircle size={25} aria-hidden="true" /><span>From Arena members</span></div>
          </div> : <p className="review-hero-first">{feed.available ? <>Your perspective could start something.<br />Be one of the first voices on the wall.</> : <>Real experiences deserve a place here.<br />Share yours with fellow builders.</>}</p>}
          <button ref={addButtonRef} className="review-button review-button-primary review-hero-add" onClick={() => setFormOpen(true)}>Add Your Review <ArrowRight size={18} aria-hidden="true" /></button>
        </div>
        {heroReviews.map((review, index) => <div key={review.id} className={`review-floating review-floating-${index + 1}`}><ReviewCard review={review} compact /></div>)}
        <Crown className="review-hero-crown" size={38} strokeWidth={1.5} aria-hidden="true" />
        <span className="review-hero-note review-hero-note-left">Join other builders<br />and share your story ↗</span>
        <span className="review-hero-note review-hero-note-right">Real feedback<br />from real builders ↙</span>
        <ReviewArenaArt />
      </div>
      {heroReviews.length > 0 && <div className="review-founder-strip" aria-label="Recent reviewers">
        {heroReviews.map((review) => <span key={review.id} title={review.author_name}><ReviewAvatar name={review.author_name} url={reviewerAvatarSources(review)[0] ?? null} fallbackUrls={reviewerAvatarSources(review).slice(1)} small /></span>)}
        <span className="review-founder-strip-label">Your story<br />belongs here.</span>
      </div>}
    </section>

    {success && <p className="review-success reviews-container" role="status">{success}</p>}
    {formOpen && <section id="add-review" ref={formRef} className="review-form-section reviews-container" aria-labelledby="add-review-title">
      <div className="review-form-heading"><div><span className="review-eyebrow">YOUR VOICE. YOUR EXPERIENCE.</span><h2 id="add-review-title">Put your experience on the wall.</h2></div><button className="review-close" aria-label="Close review form" disabled={submitting} onClick={() => { setFormOpen(false); addButtonRef.current?.focus(); }}><X size={20} /></button></div>
      {authLoading ? <p role="status">Checking your session...</p> : !user ? <div className="review-sign-in"><p>Sign in to share your experience. Choose your public name, social profile, and photo after signing in. Your email address stays private.</p><Link ref={signInRef} href="/auth/sign-in?next=%2Freviews%3Fadd%3D1%23add-review" className="review-button review-button-primary">Sign in to add a review <ArrowRight size={16} /></Link></div> : <form onSubmit={submitReview} className="review-form">
        <ReviewerProfileFields key={user.id} name={typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : ""} avatarUrl={safeAvatarUrl(user.user_metadata?.avatar_url)} disabled={submitting} />
        <fieldset disabled={submitting} className="review-rating-field"><legend>Your rating <span className="text-muted">(required)</span></legend><div className="review-rating-buttons">{[1, 2, 3, 4, 5].map((value) => <button ref={value === 1 ? ratingRef : undefined} key={value} type="button" aria-label={`Rate ${value} ${value === 1 ? "star" : "stars"}`} aria-pressed={rating === value} onClick={() => setRating(value)}><Star size={30} fill={value <= rating ? "currentColor" : "none"} /></button>)}<span aria-live="polite">{rating ? `${rating}/5` : "Choose your stars"}</span></div></fieldset>
        <div className="review-form-fields"><label>Product name <span className="text-muted">(optional)</span><input name="productName" maxLength={80} placeholder="What are you building?" disabled={submitting} /></label><label>What was your experience about?<select name="category" defaultValue="Experience" disabled={submitting}>{REVIEW_CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></label></div>
        <label>Your review<textarea name="body" required minLength={10} maxLength={ARENA_REVIEW_MAX} rows={4} value={body} onChange={(event) => setBody(event.target.value)} placeholder="What stood out? What could be better? Tell fellow builders in your own words." disabled={submitting} aria-describedby="review-body-help" /></label>
        <div className="review-form-help"><span id="review-body-help">10 to {ARENA_REVIEW_MAX} characters. Honest feedback, always.</span><span>{body.length}/{ARENA_REVIEW_MAX}</span></div>
        <p className="review-privacy">Your chosen name, photo, rating, review, and any social profile or product name you add will be public. One review per account.</p>
        {submitError && <p className="review-error" role="alert">{submitError}</p>}
        <button type="submit" disabled={submitting || rating === 0} className="review-button review-button-primary">{submitting ? <><LoaderCircle size={16} className="animate-spin" /> Sharing your review...</> : <>Publish My Review <ArrowRight size={16} /></>}</button>
      </form>}
    </section>}

    <section className="review-featured reviews-container" aria-labelledby="review-featured-title">
      <div className="review-featured-top"><div><span className="review-eyebrow"><Star size={14} fill="currentColor" aria-hidden="true" /> THE REVIEW WALL</span><h2 id="review-featured-title">What Founders <span>Are Saying</span></h2></div><div className="review-filters" role="group" aria-label="Filter reviews by category">{(["All", ...REVIEW_CATEGORIES] as Filter[]).map((category) => <button key={category} aria-pressed={filter === category} disabled={loading} onClick={() => loadReviews(category)}>{category}</button>)}</div></div>
      {error && <div className="review-error" role="alert">{error} <button className="review-text-button" onClick={() => loadReviews(filter, page)} disabled={loading}>Try again</button></div>}
      <div aria-busy={loading}>
        {feed.reviews.length > 0 ? <div className="review-wall-grid">{feed.reviews.map((review) => <ReviewCard key={review.id} review={review} />)}</div> : <div className="review-wall-empty"><span className="review-empty-icon"><MessageCircle size={30} /></span><h3>{!feed.available ? "The wall will be back soon." : filter === "All" ? "Every great wall starts with one story." : "No reviews in this category yet."}</h3><p>{!feed.available ? "Reviews are temporarily unavailable. Please try again later." : "Competed in a duel? Discovered your next favorite product? Tell us about it."}</p><button className="review-button review-button-primary" onClick={() => setFormOpen(true)}>Be a voice on the wall <Plus size={16} /></button>{!feed.available && <button className="review-text-button" disabled={loading} onClick={() => loadReviews("All")}>Retry loading reviews</button>}</div>}
      </div>
      {feed.hasMore && <div className="review-load-more"><button className="review-button review-button-secondary" disabled={loading} onClick={() => loadReviews(filter, page + 1)}>{loading ? "Loading reviews..." : "More founder stories"}<ArrowRight size={16} /></button></div>}
      <p className="review-invitation">Your experience belongs on the wall too.</p>
    </section>
  </main>;
}
