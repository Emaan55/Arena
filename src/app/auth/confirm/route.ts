import { NextRequest, NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/server";

/**
 * The single callback every Supabase Auth email flow redirects back to.
 *
 * `@supabase/ssr` forces `flowType: "pkce"` on both the browser and server
 * clients (see lib/supabase/client.ts and lib/supabase/server.ts) — that
 * applies to *every* auth method built on it, not just OAuth. signUp() and
 * resetPasswordForEmail() both embed a PKCE code_challenge the same way
 * signInWithOAuth() does, so their confirmation links arrive here as
 * `?code=...`, exchanged with exchangeCodeForSession() (this is not a
 * leftover OAuth-only path: an earlier cleanup that removed X/Twitter OAuth
 * also removed this branch under the assumption it was OAuth-specific,
 * which silently broke signup verification and password recovery too —
 * confirmed live by capturing the real signUp() and resetPasswordForEmail()
 * network requests and seeing both carry code_challenge/code_challenge_method).
 *
 * A `code=` redirect carries no `type` of its own — unlike the classic
 * token_hash+type OTP style, Supabase doesn't tell us what kind of PKCE
 * flow produced it. So forgot-password embeds `type=recovery` in its own
 * redirectTo (the same way sign-up already embeds `type=signup`) purely as
 * our own marker to read back here, not anything Supabase interprets.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const rawNext = searchParams.get("next") ?? "/";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";

  const supabase = await createRouteHandlerSupabaseClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      if (type === "recovery") {
        return NextResponse.redirect(new URL(`/auth/reset-password?next=${encodeURIComponent(next)}`, origin));
      }
      return NextResponse.redirect(new URL(`/auth/sign-in?verified=1&next=${encodeURIComponent(next)}`, origin));
    }
    return NextResponse.redirect(new URL("/auth/sign-in?authError=1", origin));
  }

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
