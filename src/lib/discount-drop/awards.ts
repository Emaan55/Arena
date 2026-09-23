import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type AdminClient = SupabaseClient<Database>;

/**
 * Lazily flips any of this user's awards that are still marked "available"
 * but whose 2-minute claim window has actually passed. There's no
 * background job for this — every read path that touches discount_awards
 * calls this first, so the stored status never drifts from reality for
 * longer than one request. A single guarded UPDATE is atomic by itself
 * (same pattern as every other status transition in this app); running it
 * twice is harmless.
 */
export async function sweepExpiredAwards(admin: AdminClient, userId: string) {
  await admin
    .from("discount_awards")
    .update({ status: "expired" })
    .eq("user_id", userId)
    .eq("status", "available")
    .lt("expires_at", new Date().toISOString());
}

/**
 * The user's one currently claimable award, if any — already expiry-swept,
 * so "available" here always means genuinely still within its window. A
 * user should never have more than one of these at a time (the replay
 * cooldown structurally prevents starting a new attempt while a previous
 * award is still live), but this only ever returns the single most recent
 * one regardless.
 */
export async function getActiveAward(admin: AdminClient, userId: string) {
  await sweepExpiredAwards(admin, userId);
  const { data } = await admin
    .from("discount_awards")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "available")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}
