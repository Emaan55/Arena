import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

const LIMIT = 20;

/** Masks an email for public display — this app has no display-name/profile system, so a full email is never shown. */
function maskEmail(email: string | null | undefined): string {
  if (!email) return "Anonymous";
  const [local] = email.split("@");
  if (local.length <= 2) return `${local[0] ?? "?"}***`;
  return `${local.slice(0, 2)}***`;
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
  const emailById = new Map((usersPage?.users ?? []).map((u) => [u.id, u.email ?? null]));

  const leaderboard = rows.map((a, i) => ({
    rank: i + 1,
    player: maskEmail(emailById.get(a.user_id)),
    score: a.score,
    discountPercent: a.discount_percent,
    completedAt: a.completed_at,
  }));

  return NextResponse.json({ leaderboard });
}
