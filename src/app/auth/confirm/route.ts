import { NextRequest, NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/server";

/**
 * The single callback every Supabase Auth email flow redirects back to:
 * signup verification, password recovery, and (still, for any caller that
 * keeps using it) magic-link sign-in all arrive here as `token_hash`+
 * `type` and are verified with verifyOtp() — that IS the email-ownership
 * proof, there's no separate step. Establishes a real session cookie,
 * then returns the visitor to wherever they were headed (`next`,
 * restricted to a same-site relative path so this can never become an
 * open redirect).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const rawNext = searchParams.get("next") ?? "/";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";

  const supabase = await createRouteHandlerSupabaseClient();

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      // Signup verification and password recovery both land on a
      // dedicated next step rather than silently continuing as whatever
      // session verifyOtp happened to establish — matches the explicit
      // "Email confirmed -> Sign in -> Arena" / "-> Reset password" flow,
      // and the sign-in page itself skips straight through to `next` if
      // it notices the visitor is already authenticated.
      if (type === "signup") {
        return NextResponse.redirect(new URL(`/auth/sign-in?verified=1&next=${encodeURIComponent(next)}`, origin));
      }
      if (type === "recovery") {
        return NextResponse.redirect(new URL(`/auth/reset-password?next=${encodeURIComponent(next)}`, origin));
      }
      return NextResponse.redirect(new URL(next, origin));
    }
  }

  return NextResponse.redirect(new URL("/auth/sign-in?authError=1", origin));
}
