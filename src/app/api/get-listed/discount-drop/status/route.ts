import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/server";
import { getMissionProgress } from "@/lib/discount-drop/mission";
import { FREE_ATTEMPTS, MAX_ATTEMPTS } from "@/lib/discount-drop/config";

/** Drives the game page's "which screen do I show" decision — eligibility, mission progress, and any still-usable award. */
export async function GET() {
  const supabaseAuth = await createRouteHandlerSupabaseClient();
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to play." }, { status: 401 });
  }

  const admin = createAdminSupabaseClient();

  const { count } = await admin
    .from("game_attempts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);
  const attemptsUsed = count ?? 0;

  const mission =
    attemptsUsed >= FREE_ATTEMPTS && attemptsUsed < MAX_ATTEMPTS
      ? await getMissionProgress(admin, user.id)
      : null;

  const { data: awards } = await admin
    .from("discount_awards")
    .select("*")
    .eq("user_id", user.id)
    .eq("status", "available")
    .order("created_at", { ascending: false });

  const now = Date.now();
  const activeAward = (awards ?? []).find((a) => new Date(a.expires_at).getTime() > now) ?? null;

  return NextResponse.json({
    attemptsUsed,
    maxAttempts: MAX_ATTEMPTS,
    canPlay: attemptsUsed < MAX_ATTEMPTS && (attemptsUsed < FREE_ATTEMPTS || mission?.complete === true),
    mission,
    activeAward,
  });
}
