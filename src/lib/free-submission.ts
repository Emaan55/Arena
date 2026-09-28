import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type AdminClient = SupabaseClient<Database>;

export const VOTES_REQUIRED_PER_SUBMISSION = 5;
export const REVIEWS_REQUIRED_PER_SUBMISSION = 2;

// Same schema-readiness pattern used throughout this app (e.g.
// isDirectoryLibraryReady) — migration 0022 may not be applied yet on a
// given environment, so every route touching free_submission_claims
// checks this first and degrades instead of a raw DB error.
export async function isFreeSubmissionSchemaReady(admin: AdminClient): Promise<boolean> {
  const { error } = await admin.from("free_submission_claims").select("id").limit(1);
  return !error;
}

export interface FreeSubmissionProgress {
  distinctVotes: number;
  reviewCount: number;
  consumedClaims: number;
  availableFreeSubmissions: number;
  /** Progress toward the next not-yet-earned submission, each capped at
   * its requirement (so already-banked extra votes/reviews from being
   * ahead on one side don't overflow the display). */
  votesTowardNext: number;
  reviewsTowardNext: number;
}

/**
 * Read-only status for display only — computed the exact same way (floor
 * of votes/5 and reviews/2, minus already-consumed claims) as the
 * claim_free_submission() Postgres function that actually authorizes
 * consuming one, so the UI can never show "unlocked" when the server
 * would then reject the claim, or vice versa. That function, not this
 * one, is the authoritative eligibility check at submission time.
 */
export async function getFreeSubmissionProgress(admin: AdminClient, userId: string): Promise<FreeSubmissionProgress> {
  const [{ data: voteRows }, { count: reviewCountRaw }, { count: consumedRaw }] = await Promise.all([
    admin.from("votes").select("match_id").eq("user_id", userId),
    admin.from("product_reviews").select("*", { count: "exact", head: true }).eq("user_id", userId),
    admin.from("free_submission_claims").select("*", { count: "exact", head: true }).eq("user_id", userId),
  ]);

  const distinctVotes = new Set((voteRows ?? []).map((v) => v.match_id)).size;
  const reviewCount = reviewCountRaw ?? 0;
  const consumedClaims = consumedRaw ?? 0;

  const availableFromVotes = Math.floor(distinctVotes / VOTES_REQUIRED_PER_SUBMISSION);
  const availableFromReviews = Math.floor(reviewCount / REVIEWS_REQUIRED_PER_SUBMISSION);
  const availableFreeSubmissions = Math.max(0, Math.min(availableFromVotes, availableFromReviews) - consumedClaims);

  const votesTowardNext = Math.min(
    Math.max(distinctVotes - consumedClaims * VOTES_REQUIRED_PER_SUBMISSION, 0),
    VOTES_REQUIRED_PER_SUBMISSION,
  );
  const reviewsTowardNext = Math.min(
    Math.max(reviewCount - consumedClaims * REVIEWS_REQUIRED_PER_SUBMISSION, 0),
    REVIEWS_REQUIRED_PER_SUBMISSION,
  );

  return {
    distinctVotes,
    reviewCount,
    consumedClaims,
    availableFreeSubmissions,
    votesTowardNext,
    reviewsTowardNext,
  };
}
