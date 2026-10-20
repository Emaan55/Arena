"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, MessageSquare, X } from "lucide-react";
import type { PendingVoteReview } from "@/lib/vote-review-prompt";
import { REVIEW_BODY_MIN, REVIEW_BODY_MAX } from "@/lib/product-review-limits";
import type { PublicProductReview } from "@/lib/reviewer-profile";

/**
 * A post-vote dialog that is independent from the duel card. A deciding
 * vote can remove a completed duel from the live list immediately, so the
 * review invitation must not live inside that disappearing card.
 */
export function VoteReviewPrompt({
  pending,
  onDone,
}: {
  pending: PendingVoteReview | null;
  onDone: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!pending) return;
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, [pending]);

  useEffect(() => {
    if (!pending) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submitting) onDone();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pending, submitting, onDone]);

  if (!pending) return null;

  async function submitReview() {
    const body = draft.trim();
    if (!pending) return;
    if (body.length < REVIEW_BODY_MIN || body.length > REVIEW_BODY_MAX) {
      setError(`Review must be between ${REVIEW_BODY_MIN} and ${REVIEW_BODY_MAX} characters.`);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matchId: pending.matchId,
          productId: pending.productId,
          body,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Could not save your review.");
        return;
      }

      const review: PublicProductReview = {
        id: data.review.id,
        body: data.review.body,
        createdAt: data.review.created_at,
        authorName: data.review.authorName ?? "Arena member",
        authorAvatarUrl: data.review.authorAvatarUrl ?? null,
      };
      window.dispatchEvent(
        new CustomEvent("arena:review-created", {
          detail: { productId: pending.productId, review },
        }),
      );
      onDone();
    } catch {
      setError("Network error, please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 px-4 py-8 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !submitting) onDone();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="vote-review-title"
        className="w-full max-w-lg rounded-2xl border border-border bg-surface p-5 shadow-2xl sm:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft/15 text-accent">
              <CheckCircle2 className="h-5 w-5" />
            </span>
            <div>
              <h2 id="vote-review-title" className="font-display text-lg font-bold text-ink">
                Your vote is in
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-muted">
                What stood out about <strong className="text-ink">{pending.productName}</strong>?
                Your review helps other voters understand your choice.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onDone}
            disabled={submitting}
            className="rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-50"
            aria-label="Close review prompt"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 flex flex-col gap-2">
          <label htmlFor="post-vote-review" className="flex items-center gap-2 text-sm font-semibold text-ink">
            <MessageSquare className="h-4 w-4 text-accent" />
            Leave an optional review
          </label>
          <textarea
            ref={textareaRef}
            id="post-vote-review"
            value={draft}
            minLength={REVIEW_BODY_MIN}
            maxLength={REVIEW_BODY_MAX}
            onChange={(event) => setDraft(event.target.value.slice(0, REVIEW_BODY_MAX))}
            rows={4}
            placeholder="Share what you liked about this product..."
            className="resize-none rounded-xl border border-border bg-bg px-3 py-2.5 text-sm text-ink outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/15 placeholder:text-muted"
          />
          <div className="flex items-center justify-between text-xs text-muted">
            <span aria-live="polite">{error ?? `Minimum ${REVIEW_BODY_MIN} characters. Your review will appear on this product's live battle card.`}</span>
            <span className="shrink-0 pl-3 font-mono">{draft.trim().length}/{REVIEW_BODY_MAX}</span>
          </div>
        </div>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onDone}
            disabled={submitting}
            className="rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-muted transition-colors hover:text-ink disabled:opacity-50"
          >
            Skip for now
          </button>
          <button
            type="button"
            onClick={submitReview}
            disabled={submitting || draft.trim().length < REVIEW_BODY_MIN}
            className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-ink shadow-sm transition hover:-translate-y-0.5 hover:shadow-md disabled:translate-y-0 disabled:opacity-50"
          >
            {submitting ? "Publishing…" : "Publish review"}
          </button>
        </div>
      </section>
    </div>
  );
}
