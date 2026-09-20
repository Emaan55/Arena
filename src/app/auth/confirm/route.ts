import { NextRequest, NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/server";

/**
 * Where a magic-link email sends the visitor. Verifies the one-time token
 * server-side (this IS the email-ownership verification — there's no
 * separate password/verification step for the OTP flow) and establishes a
 * real Supabase session cookie, then returns them to wherever they were
 * trying to vote (`next`, embedded in the link when it was sent — see
 * SignInPrompt.tsx). `next` is restricted to a same-site relative path so
 * this can't be turned into an open redirect.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const rawNext = searchParams.get("next") ?? "/";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";

  if (tokenHash && type) {
    const supabase = await createRouteHandlerSupabaseClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      return NextResponse.redirect(new URL(next, origin));
    }
  }

  return NextResponse.redirect(new URL("/?authError=1", origin));
}
