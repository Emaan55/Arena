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
 * Public, no auth required. Only "valid" attempts are shown — "Show the
 * best verified discount/score" — a suspicious/rejected attempt never
 * appears here even though it may still exist in game_attempts.
 * Completely separate from the Arena's own leaderboard (products/wins):
 * this reads game_attempts only, votes/matches are never touched.
 */
export async function GET() {
  const admin = createAdminSupabaseClient();

  const { data: attempts } = await admin
    .from("game_attempts")
    .select("id, user_id, score, discount_percent, completed_at")
    .eq("validation_status", "valid")
    .not("completed_at", "is", null)
    .order("score", { ascending: false })
    .limit(LIMIT);

  const rows = attempts ?? [];
  if (rows.length === 0) {
    return NextResponse.json({ leaderboard: [] });
  }

  const { data: usersPage } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const nameById = new Map((usersPage?.users ?? []).map((u) => [u.id, u.user_metadata?.full_name]));

  const leaderboard = rows.map((a, i) => ({
    rank: i + 1,
    player: displayName(nameById.get(a.user_id)),
    score: a.score,
    discountPercent: a.discount_percent,
    completedAt: a.completed_at,
  }));

  return NextResponse.json({ leaderboard });
}
