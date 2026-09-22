import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getClientIp } from "@/lib/fingerprint";
import { rateLimit } from "@/lib/rate-limit";
import { logSecurityEvent } from "@/lib/security-log";
import { isPasswordValid, sanitizeNextPath, TERMS_VERSION, PRIVACY_VERSION } from "@/lib/auth/config";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Sign-up runs server-side (not a direct client-side supabase.auth.signUp
 * call) for one reason: terms acceptance has to be recorded against the
 * new user's id in the same request that creates them. Email confirmation
 * is required, so signUp() returns no session to authenticate a follow-up
 * call with — but it does return the new user's id directly, and this
 * route uses that id immediately, in the same trusted server execution,
 * rather than ever trusting a client-submitted user id for the write.
 */
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (!rateLimit(`auth:sign-up:${ip}`, 8, 60 * 1000)) {
    return NextResponse.json({ error: "Slow down — too many attempts." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const record = (body ?? {}) as Record<string, unknown>;

  const email = typeof record.email === "string" ? record.email.trim().toLowerCase() : "";
  const password = typeof record.password === "string" ? record.password : "";
  const confirmPassword = typeof record.confirmPassword === "string" ? record.confirmPassword : "";
  const fullName = typeof record.fullName === "string" ? record.fullName.trim().slice(0, 120) : "";
  const next = sanitizeNextPath(typeof record.next === "string" ? record.next : null);

  if (!fullName) {
    return NextResponse.json({ error: "Enter your full name." }, { status: 400 });
  }
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  if (!isPasswordValid(password)) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters and include an uppercase letter and a number." },
      { status: 400 },
    );
  }
  if (password !== confirmPassword) {
    return NextResponse.json({ error: "Passwords do not match." }, { status: 400 });
  }
  if (record.termsAccepted !== true) {
    return NextResponse.json({ error: "You must agree to the Terms & Conditions and Privacy Policy." }, { status: 400 });
  }

  const supabaseAuth = await createRouteHandlerSupabaseClient();
  const origin = new URL(req.url).origin;
  const { data, error } = await supabaseAuth.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
      emailRedirectTo: `${origin}/auth/confirm?type=signup&next=${encodeURIComponent(next)}`,
    },
  });

  if (error) {
    logSecurityEvent("auth_sign_up_failed", { ip, reason: error.message });
    if (error.message.toLowerCase().includes("already registered")) {
      return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
    }
    return NextResponse.json({ error: "Could not create your account. Please try again." }, { status: 500 });
  }

  // Supabase's documented anti-enumeration behavior: signing up with an
  // email that's already registered (and confirmed) returns a "success"
  // shaped response with an empty identities array instead of an error,
  // so a script can't use signup to probe which emails already have
  // accounts. This is the one reliable signal to distinguish that case.
  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
  }

  if (!data.user) {
    logSecurityEvent("auth_sign_up_no_user", { ip });
    return NextResponse.json({ error: "Could not create your account. Please try again." }, { status: 500 });
  }

  const admin = createAdminSupabaseClient();
  const { error: termsError } = await admin.from("terms_acceptances").insert({
    user_id: data.user.id,
    terms_version: TERMS_VERSION,
    privacy_version: PRIVACY_VERSION,
  });
  if (termsError) {
    // Most likely migration 0017 hasn't been applied yet — never block
    // account creation over this, but make the gap visible in logs rather
    // than silently losing the consent record.
    logSecurityEvent("auth_terms_acceptance_failed", { ip, userId: data.user.id, reason: termsError.message });
  }

  logSecurityEvent("auth_sign_up_success", { ip, userId: data.user.id });

  return NextResponse.json({ email });
}
