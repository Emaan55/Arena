import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

const LIMIT = 20;

/**
 * There's no separate profiles table — `full_name` (collected at sign-up,
 * see /api/auth/sign-up) is stored in Supabase auth's user_metadata, which
 * is the only display-name field that exists. Only that string is ever
 * returned to the client; email/id/other auth fields never leave this route.
 */
function displayName(fullName: unknown): string {
  if (typeof fullName === "string" && fullName.trim().length > 0) return fullName.trim();
  return "Player";
}

/**
 * Public, no auth required. A completed game_attempts row is NOT a
 * leaderboard entry by itself — it only becomes one after the full
 * game_attempt -> discount_award -> paid order chain completes:
 *
 *   1. game_attempts.validation_status = 'valid' (server-verified score)
 *   2. discount_awards.status = 'redeemed'
 *
 * discount_awards.status is set to 'redeemed' in exactly one place in the
 * whole codebase: finalize_get_listed_order() (migration 0018), called only
 * from the verified LemonSqueezy webhook or an admin reconciliation — and
 * only in the same transaction that also flips the paying order to 'paid'
 * and the campaign to 'active'. So checking status = 'redeemed' here is
 * already sufficient proof this exact discount was spent on a successfully
 * paid, webhook-confirmed Get Listed order; there is no path by which the
 * client (or an unpaid/abandoned/expired/failed attempt) can set it. A
 * played-but-unclaimed result, a claimed-but-never-checked-out result, or
 * an abandoned/expired/failed checkout all leave the award at
 * 'available'/'expired'/'cancelled' and never appear below.
 */
export async function GET() {
  const admin = createAdminSupabaseClient();

  const { data: awards } = await admin
    .from("discount_awards")
    .select("user_id, game_attempt_id, discount_percent")
    .eq("status", "redeemed");

  const eligibleAwards = awards ?? [];
  if (eligibleAwards.length === 0) {
    return NextResponse.json({ leaderboard: [] });
  }

  const attemptIds = eligibleAwards.map((a) => a.game_attempt_id);
  const { data: attempts } = await admin
    .from("game_attempts")
    .select("id, user_id, score, validation_status, completed_at")
    .in("id", attemptIds)
    .eq("validation_status", "valid");

  const attemptById = new Map((attempts ?? []).map((a) => [a.id, a]));

  // One row per user — their single highest verified-and-paid score, never
  // a duplicate entry per replay (a user can have multiple redeemed awards
  // across attempts; only the best one is shown).
  const bestByUser = new Map<string, { score: number; discountPercent: number; completedAt: string | null }>();
  for (const award of eligibleAwards) {
    const attempt = attemptById.get(award.game_attempt_id);
    // Belt-and-suspenders: an award's user_id always matches its attempt's
    // (both written together in /api/get-listed/discount-drop/complete),
    // but this is never assumed without checking.
    if (!attempt || attempt.user_id !== award.user_id || attempt.score == null) continue;
    const existing = bestByUser.get(award.user_id);
    if (!existing || attempt.score > existing.score) {
      bestByUser.set(award.user_id, {
        score: attempt.score,
        discountPercent: award.discount_percent,
        completedAt: attempt.completed_at,
      });
    }
  }

  const ranked = Array.from(bestByUser.entries())
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, LIMIT);

  if (ranked.length === 0) {
    return NextResponse.json({ leaderboard: [] });
  }

  const { data: usersPage } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const nameById = new Map((usersPage?.users ?? []).map((u) => [u.id, u.user_metadata?.full_name]));

  const leaderboard = ranked.map(([userId, entry], i) => ({
    rank: i + 1,
    player: displayName(nameById.get(userId)),
    score: entry.score,
    discountPercent: entry.discountPercent,
    completedAt: entry.completedAt,
  }));

  return NextResponse.json({ leaderboard });
}
