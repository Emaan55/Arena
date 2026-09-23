import { NextRequest, NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/server";

/**
 * The callback for Supabase Auth email flows that need a server-side hop:
 * currently just signup verification.
 *
 * `@supabase/ssr` forces `flowType: "pkce"` on both the browser and server
 * clients (see lib/supabase/client.ts and lib/supabase/server.ts) — that
 * applies to *every* auth method built on it, not just OAuth. signUp()
 * embeds a PKCE code_challenge the same way signInWithOAuth() does, so the
 * signup-confirmation link arrives here as `?code=...`, exchanged with
 * exchangeCodeForSession() (this is not a leftover OAuth-only path: an
 * earlier cleanup that removed X/Twitter OAuth also removed this branch
 * under the assumption it was OAuth-specific, which silently broke signup
 * verification too — confirmed live by capturing the real signUp() network
 * request and seeing it carries the same code_challenge/code_challenge_method
 * fields OAuth does).
 *
 * Password recovery does NOT route through here — forgot-password points
 * resetPasswordForEmail's redirectTo straight at the bare /reset-password
 * page, since that page can run the Supabase browser client's own URL
 * detection to consume a PKCE `?code=`, which this server route cannot.
 * The `token_hash`+`type=recovery` branch below is kept only as a fallback
 * for the classic OTP-link style, in case this project's email template is
 * ever reconfigured that way.
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
        return NextResponse.redirect(new URL(`/reset-password?next=${encodeURIComponent(next)}`, origin));
      }
      return NextResponse.redirect(new URL(next, origin));
    }
  }

  return NextResponse.redirect(new URL("/auth/sign-in?authError=1", origin));
}
