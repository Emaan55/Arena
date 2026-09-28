import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/server";
import { isFreeSubmissionSchemaReady, getFreeSubmissionProgress } from "@/lib/free-submission";

/**
 * Read-only progress for the "earn a free submission" path — requires the
 * caller's own authenticated session (never a client-supplied user id),
 * same as every other authenticated route in this app.
 */
export async function GET() {
  const supabaseAuth = await createRouteHandlerSupabaseClient();
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to check your free submission progress." }, { status: 401 });
  }

  const admin = createAdminSupabaseClient();
  if (!(await isFreeSubmissionSchemaReady(admin))) {
    return NextResponse.json({
      distinctVotes: 0,
      reviewCount: 0,
      consumedClaims: 0,
      availableFreeSubmissions: 0,
      votesTowardNext: 0,
      reviewsTowardNext: 0,
      ready: false,
    });
  }

  const progress = await getFreeSubmissionProgress(admin, user.id);
  return NextResponse.json({ ...progress, ready: true });
}
