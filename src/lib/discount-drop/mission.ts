import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { MISSION_REQUIRED_DUELS } from "./config";

type AdminClient = SupabaseClient<Database>;

/**
 * Every replay attempt's "mission" is verified purely from data the vote
 * system already produces — never a client-asserted `missionCompleted:
 * true`. The original spec also asked for "vote + comment on N duels," but
 * this app has no commenting feature anywhere (checked before building
 * this — there's no comment table, route, or UI at all), so there is
 * nothing to verify a comment claim against. Scoped down to what's
 * actually verifiable with existing Arena data: voting in N distinct
 * duels.
 *
 * `sinceIso`, when given, restricts this to votes cast AFTER that
 * timestamp (the user's last completed attempt) — Discount Drop is
 * repeatable, so each new attempt needs a FRESH mission, not the same
 * lifetime vote count that unlocked a previous attempt. Null (no prior
 * completed attempt) falls back to lifetime distinct duels, which only
 * ever matters for the edge case of a user who started but abandoned
 * their one free attempt without finishing it.
 */
export async function getMissionProgress(admin: AdminClient, userId: string, sinceIso: string | null = null) {
  let query = admin.from("votes").select("match_id").eq("user_id", userId);
  if (sinceIso) query = query.gt("created_at", sinceIso);
  const { data } = await query;
  const distinctDuels = new Set((data ?? []).map((v) => v.match_id)).size;
  return {
    votedDuels: distinctDuels,
    required: MISSION_REQUIRED_DUELS,
    complete: distinctDuels >= MISSION_REQUIRED_DUELS,
  };
}
