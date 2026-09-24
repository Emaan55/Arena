import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/server";
import { CLAIM_EXPIRY_MS } from "@/lib/discount-drop/config";
import { sweepExpiredAwards } from "@/lib/discount-drop/awards";
import { rateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/fingerprint";

/**
 * Called the instant the user clicks "Use My Discount" on the result
 * screen — this IS the claim. It extends the award's expiry from the
 * short decide-to-claim window (AWARD_EXPIRY_MS) to the much longer
 * CLAIM_EXPIRY_MS, so filling out a Get Listed campaign and completing
 * checkout (realistically several minutes) doesn't race the original
 * countdown and fail with a false "expired" error partway through.
 *
 * Still fully server-authoritative and still bounded: the atomic
 * `.gt("expires_at", nowIso)` guard only extends an award that is
 * genuinely still available and unexpired at the moment of the call — a
 * user can't claim (or re-extend) an award that already expired.
 */
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (!rateLimit(`discount-drop:claim:${ip}`, 20, 60 * 1000)) {
    return NextResponse.json({ error: "Slow down, too many requests." }, { status: 429 });
  }

  const supabaseAuth = await createRouteHandlerSupabaseClient();
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const { awardId } = (body ?? {}) as Record<string, unknown>;
  if (typeof awardId !== "string" || !awardId) {
    return NextResponse.json({ error: "Invalid discount." }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();
  await sweepExpiredAwards(admin, user.id);

  const nowIso = new Date().toISOString();
  const newExpiresAt = new Date(Date.now() + CLAIM_EXPIRY_MS).toISOString();

  const { data: award, error } = await admin
    .from("discount_awards")
    .update({ expires_at: newExpiresAt })
    .eq("id", awardId)
    .eq("user_id", user.id)
    .eq("status", "available")
    .gt("expires_at", nowIso)
    .select("*")
    .maybeSingle();

  if (error || !award) {
    return NextResponse.json(
      { error: "Your discount has expired. Play Discount Drop again to earn a new discount." },
      { status: 409 },
    );
  }

  return NextResponse.json({ award });
}
