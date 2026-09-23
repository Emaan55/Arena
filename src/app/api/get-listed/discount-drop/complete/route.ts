import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/server";
import { getClientIp } from "@/lib/fingerprint";
import { rateLimit } from "@/lib/rate-limit";
import { logSecurityEvent } from "@/lib/security-log";
import { validateAndScore } from "@/lib/discount-drop/scoring";
import { discountPercentForScore, AWARD_EXPIRY_MS } from "@/lib/discount-drop/config";
import { getActiveAward } from "@/lib/discount-drop/awards";
import type { ChallengeEvent } from "@/lib/discount-drop/schedule";

/**
 * The only place a discount_percent is ever decided. The client submits
 * its raw per-event outcome claims (what it clicked and when) — never a
 * score or discount number — and everything is re-derived here against
 * the schedule this same attempt's /start call generated and stored.
 * completed_at IS NULL in the UPDATE's WHERE clause makes this idempotent:
 * a retried or duplicated request can never award a discount twice for
 * the same attempt, the same way cast_vote's unique constraint prevents a
 * duplicate vote (single atomic statement, not a check-then-write).
 */
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (!rateLimit(`discount-drop:complete:${ip}`, 10, 60 * 1000)) {
    return NextResponse.json({ error: "Slow down — too many requests." }, { status: 429 });
  }

  const supabaseAuth = await createRouteHandlerSupabaseClient();
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to play." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const { attemptId, outcomes, durationMs } = (body ?? {}) as Record<string, unknown>;
  if (typeof attemptId !== "string") {
    return NextResponse.json({ error: "Invalid attempt." }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();

  // Ownership enforced in the same query — never fetch-then-compare.
  const { data: attempt } = await admin
    .from("game_attempts")
    .select("id, started_at, completed_at, metadata")
    .eq("id", attemptId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!attempt) {
    return NextResponse.json({ error: "Attempt not found." }, { status: 404 });
  }
  if (attempt.completed_at) {
    return NextResponse.json({ error: "This attempt was already completed." }, { status: 409 });
  }

  const schedule = (attempt.metadata as { schedule?: ChallengeEvent[] })?.schedule;
  if (!Array.isArray(schedule)) {
    logSecurityEvent("discount_drop_missing_schedule", { ip, userId: user.id, attemptId });
    return NextResponse.json({ error: "Attempt could not be verified." }, { status: 500 });
  }

  const serverElapsedMs = Date.now() - new Date(attempt.started_at).getTime();
  const result = validateAndScore(schedule, outcomes, durationMs, serverElapsedMs);
  const discountPercent = result.validationStatus === "rejected" ? 0 : discountPercentForScore(result.score);

  // Atomic, race-safe completion: two simultaneous /complete calls for the
  // same attempt can only ever have one succeed here.
  const { data: updated, error: updateError } = await admin
    .from("game_attempts")
    .update({
      score: result.score,
      discount_percent: discountPercent,
      completed_at: new Date().toISOString(),
      duration_ms: typeof durationMs === "number" ? Math.round(durationMs) : serverElapsedMs,
      validation_status: result.validationStatus,
    })
    .eq("id", attemptId)
    .is("completed_at", null)
    .select("id")
    .maybeSingle();

  if (updateError || !updated) {
    return NextResponse.json({ error: "This attempt was already completed." }, { status: 409 });
  }

  logSecurityEvent("discount_drop_completed", {
    ip,
    userId: user.id,
    attemptId,
    score: result.score,
    validationStatus: result.validationStatus,
  });

  if (result.validationStatus === "rejected" || discountPercent <= 0) {
    logSecurityEvent("discount_drop_rejected", { ip, userId: user.id, attemptId });
    return NextResponse.json({
      score: 0,
      discountPercent: 0,
      award: null,
      validationStatus: result.validationStatus,
    });
  }

  // Never let a user hold two simultaneously-active awards. In practice
  // this branch shouldn't be reachable — the replay cooldown after a
  // completed attempt is always far longer than a 2-minute award window —
  // but it's cheap insurance against a future shorter cooldown config or
  // any other path that could otherwise let attempts overlap.
  const existingActiveAward = await getActiveAward(admin, user.id);
  if (existingActiveAward) {
    return NextResponse.json({
      score: result.score,
      discountPercent: existingActiveAward.discount_percent,
      validationStatus: result.validationStatus,
      award: existingActiveAward,
    });
  }

  const expiresAt = new Date(Date.now() + AWARD_EXPIRY_MS).toISOString();
  const { data: award, error: awardError } = await admin
    .from("discount_awards")
    .insert({
      user_id: user.id,
      game_attempt_id: attemptId,
      score: result.score,
      discount_percent: discountPercent,
      status: "available",
      expires_at: expiresAt,
    })
    .select("*")
    .single();

  if (awardError || !award) {
    logSecurityEvent("discount_drop_award_failed", { ip, userId: user.id, attemptId, reason: awardError?.message ?? "unknown" });
    return NextResponse.json({ error: "Could not record your discount." }, { status: 500 });
  }

  return NextResponse.json({
    score: result.score,
    discountPercent,
    validationStatus: result.validationStatus,
    award,
  });
}
