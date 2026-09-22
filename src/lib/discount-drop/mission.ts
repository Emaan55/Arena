import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { MISSION_REQUIRED_DUELS } from "./config";

type AdminClient = SupabaseClient<Database>;

/**
 * Attempt #2's "mission" is verified purely from data the vote system
 * already produces — never a client-asserted `missionCompleted: true`.
 * The original spec also asked for "vote + comment on 3 duels," but this
 * app has no commenting feature anywhere (checked before building this —
 * there's no comment table, route, or UI at all), so there is nothing to
 * verify a comment claim against. Scoped down to what's actually
 * verifiable with existing Arena data: voting in 3 distinct duels.
 */
export async function getMissionProgress(admin: AdminClient, userId: string) {
  const { data } = await admin.from("votes").select("match_id").eq("user_id", userId);
  const distinctDuels = new Set((data ?? []).map((v) => v.match_id)).size;
  return {
    votedDuels: distinctDuels,
    required: MISSION_REQUIRED_DUELS,
    complete: distinctDuels >= MISSION_REQUIRED_DUELS,
  };
}
