import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/server";
import { getDiscountDropEligibility } from "@/lib/discount-drop/eligibility";
import { getActiveAward } from "@/lib/discount-drop/awards";

/** Drives the game page's "which screen do I show" decision — eligibility, mission/cooldown progress, and any still-claimable award. */
export async function GET() {
  const supabaseAuth = await createRouteHandlerSupabaseClient();
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to play." }, { status: 401 });
  }

  const admin = createAdminSupabaseClient();

  const activeAward = await getActiveAward(admin, user.id);
  // An active, unexpired award always takes priority over eligibility for
  // a NEW attempt — the user has something to claim right now.
  const eligibility = activeAward ? null : await getDiscountDropEligibility(admin, user.id);

  return NextResponse.json({
    canPlay: eligibility?.canPlay ?? false,
    mission: eligibility?.mission ?? null,
    nextAttemptAt: eligibility?.nextAttemptAt ?? null,
    cooldownActive: eligibility?.cooldownActive ?? false,
    activeAward,
  });
}
