import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/server";
import { getClientIp } from "@/lib/fingerprint";
import { rateLimit } from "@/lib/rate-limit";
import { logSecurityEvent } from "@/lib/security-log";
import { generateSeed, generateSchedule } from "@/lib/discount-drop/schedule";
import { getDiscountDropEligibility } from "@/lib/discount-drop/eligibility";
import { getActiveAward } from "@/lib/discount-drop/awards";
import { GAME_DURATION_MS } from "@/lib/discount-drop/config";

/**
 * Attempt eligibility is decided here, server-side, from a COUNT of the
 * user's own game_attempts rows — never a client-asserted attempt number.
 * The schedule (positions/sizes/timing) is generated here too and stored
 * verbatim on the attempt so /complete can validate against the exact
 * same data later; the client never invents or edits the challenge.
 */
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (!rateLimit(`discount-drop:start:${ip}`, 10, 60 * 1000)) {
    return NextResponse.json({ error: "Slow down, too many requests." }, { status: 429 });
  }

  const supabaseAuth = await createRouteHandlerSupabaseClient();
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to play." }, { status: 401 });
  }

  if (!rateLimit(`discount-drop:start:user:${user.id}`, 10, 60 * 1000)) {
    logSecurityEvent("discount_drop_rate_limited", { ip, userId: user.id });
    return NextResponse.json({ error: "Slow down, too many requests." }, { status: 429 });
  }

  const admin = createAdminSupabaseClient();

  // A still-claimable award always blocks a new attempt — Discount Drop
  // deliberately never lets a user hold two active awards at once (see
  // lib/discount-drop/awards.ts), and starting a fresh game while one is
  // live would only ever waste it.
  const activeAward = await getActiveAward(admin, user.id);
  if (activeAward) {
    return NextResponse.json({ error: "You already have an unclaimed discount. Use it before it expires." }, { status: 409 });
  }

  const eligibility = await getDiscountDropEligibility(admin, user.id);
  if (!eligibility.canPlay) {
    if (eligibility.cooldownActive) {
      return NextResponse.json(
        { error: "cooldown_active", nextAttemptAt: eligibility.nextAttemptAt, mission: eligibility.mission },
        { status: 403 },
      );
    }
    return NextResponse.json({ error: "mission_incomplete", mission: eligibility.mission }, { status: 403 });
  }

  const seed = generateSeed();
  const schedule = generateSchedule(seed);

  const { data: attempt, error } = await admin
    .from("game_attempts")
    .insert({
      user_id: user.id,
      metadata: { seed, schedule },
    })
    .select("id, started_at")
    .single();

  if (error || !attempt) {
    logSecurityEvent("discount_drop_start_failed", { ip, userId: user.id, reason: error?.message ?? "unknown" });
    return NextResponse.json({ error: "Could not start the game." }, { status: 500 });
  }

  logSecurityEvent("discount_drop_started", { ip, userId: user.id, attemptId: attempt.id });

  // The client only ever needs positions/sizes/timing to render — the
  // seed itself never leaves the server, so it can't be reused to
  // pre-compute or replay a schedule outside the game.
  return NextResponse.json({
    attemptId: attempt.id,
    durationMs: GAME_DURATION_MS,
    schedule,
  });
}
