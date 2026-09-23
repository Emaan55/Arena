/**
 * Server-side configuration for the Discount Drop game. Public/marketing
 * copy (e.g. "up to 60% OFF") can safely reference these constants since
 * they're not secret — the security property is that every actual award
 * is computed from a validated game_attempts row here on the server,
 * never from a client-submitted percent.
 */

export const GAME_DURATION_MS = 45_000;

/** [minScore, maxScore, discountPercent] — score is a normalized 0-100 value. */
export const DISCOUNT_TIERS: Array<{ min: number; max: number; percent: number }> = [
  { min: 0, max: 19, percent: 10 },
  { min: 20, max: 39, percent: 20 },
  { min: 40, max: 59, percent: 30 },
  { min: 60, max: 69, percent: 40 },
  { min: 70, max: 84, percent: 50 },
  { min: 85, max: 100, percent: 60 },
];

export const MAX_DISCOUNT_PERCENT = 60;

/**
 * How long a freshly-earned discount stays claimable before it expires
 * if the user does nothing — this is the "decide whether to use it"
 * window shown as a countdown on the result screen.
 */
export const AWARD_EXPIRY_MS = 2 * 60 * 1000;

/**
 * Once the user actually clicks "Use My Discount" (see
 * /api/get-listed/discount-drop/claim), the award's expiry is extended to
 * this much longer window instead — enough real-world time to fill out a
 * Get Listed campaign and complete a LemonSqueezy checkout, which
 * realistically takes several minutes, not seconds. The discount is
 * "claimed" the moment this fires; it should not keep racing the original
 * short decide-to-claim countdown after that.
 */
export const CLAIM_EXPIRY_MS = 30 * 60 * 1000;

/**
 * Free attempts everyone gets before the replay gate (mission + cooldown)
 * applies. This is NOT a lifetime cap — Discount Drop is repeatable
 * indefinitely; after the free attempt(s), every further attempt requires
 * BOTH the mission and the cooldown below, checked fresh each time.
 */
export const FREE_ATTEMPTS = 1;

/**
 * Distinct duels a user must vote on (since their last completed attempt)
 * to unlock another Discount Drop attempt.
 */
export const MISSION_REQUIRED_DUELS = 5;

/**
 * Minimum time since a user's last completed attempt before they're even
 * eligible to unlock another one, regardless of mission progress — the
 * backstop against farming attempts by voting on 5 duels back-to-back.
 * Configurable independently of everything else; changing this doesn't
 * require touching the game, scoring, or mission logic at all.
 */
export const REPLAY_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export function discountPercentForScore(score: number): number {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const tier = DISCOUNT_TIERS.find((t) => clamped >= t.min && clamped <= t.max);
  return Math.min(MAX_DISCOUNT_PERCENT, tier?.percent ?? 0);
}
