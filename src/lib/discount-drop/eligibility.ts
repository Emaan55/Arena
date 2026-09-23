import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { getMissionProgress } from "./mission";
import { FREE_ATTEMPTS, REPLAY_COOLDOWN_MS } from "./config";

type AdminClient = SupabaseClient<Database>;

export interface DiscountDropEligibility {
  attemptsPlayed: number;
  canPlay: boolean;
  mission: { votedDuels: number; required: number; complete: boolean } | null;
  nextAttemptAt: string | null;
  cooldownActive: boolean;
}

/**
 * The single source of truth for "can this user start another Discount
 * Drop attempt right now" — used identically by /status (to decide what to
 * show) and /start (to actually gate starting a game), so the two can
 * never drift apart. Discount Drop is repeatable, not a lifetime-capped
 * game: the first attempt (ever) is free, and every attempt after that
 * requires BOTH a cooldown since the user's last COMPLETED attempt AND a
 * fresh mission (voting on MISSION_REQUIRED_DUELS distinct duels cast
 * since that same attempt) — never a client-asserted flag for either.
 */
export async function getDiscountDropEligibility(admin: AdminClient, userId: string): Promise<DiscountDropEligibility> {
  const [{ count: attemptsPlayedCount }, { data: lastCompleted }] = await Promise.all([
    admin.from("game_attempts").select("id", { count: "exact", head: true }).eq("user_id", userId),
    admin
      .from("game_attempts")
      .select("completed_at")
      .eq("user_id", userId)
      .not("completed_at", "is", null)
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const attemptsPlayed = attemptsPlayedCount ?? 0;
  const lastCompletedAt = lastCompleted?.completed_at ?? null;

  if (attemptsPlayed < FREE_ATTEMPTS) {
    return { attemptsPlayed, canPlay: true, mission: null, nextAttemptAt: null, cooldownActive: false };
  }

  // No completed attempt to anchor a cooldown to (e.g. the one free
  // attempt was started but abandoned) — only the mission gates them, not
  // an arbitrary wait with nothing to count down from.
  if (!lastCompletedAt) {
    const mission = await getMissionProgress(admin, userId, null);
    return { attemptsPlayed, canPlay: mission.complete, mission, nextAttemptAt: null, cooldownActive: false };
  }

  const nextAttemptAt = new Date(new Date(lastCompletedAt).getTime() + REPLAY_COOLDOWN_MS).toISOString();
  const cooldownActive = Date.now() < new Date(nextAttemptAt).getTime();
  const mission = await getMissionProgress(admin, userId, lastCompletedAt);

  return {
    attemptsPlayed,
    canPlay: !cooldownActive && mission.complete,
    mission,
    nextAttemptAt,
    cooldownActive,
  };
}
