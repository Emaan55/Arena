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

export const AWARD_EXPIRY_MS = 30 * 60 * 1000;

/** Free attempts everyone gets, before the mission gate applies. */
export const FREE_ATTEMPTS = 1;
/** Total attempts ever allowed per user (free + mission-unlocked). */
export const MAX_ATTEMPTS = 2;
/** Distinct duels a user must have voted in to unlock attempt #2. */
export const MISSION_REQUIRED_DUELS = 3;

export function discountPercentForScore(score: number): number {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const tier = DISCOUNT_TIERS.find((t) => clamped >= t.min && clamped <= t.max);
  return Math.min(MAX_DISCOUNT_PERCENT, tier?.percent ?? 0);
}
