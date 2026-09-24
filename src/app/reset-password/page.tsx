"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Lock, CheckCircle2 } from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { useAuthUser } from "@/lib/useAuthUser";
import { isPasswordValid, sanitizeNextPath } from "@/lib/auth/config";
import { AuthCard } from "@/components/auth/AuthCard";
import { AuthInput } from "@/components/auth/AuthInput";
import { AuthButton, PasswordChecklist } from "@/components/auth/AuthControls";

/**
 * Lives at the bare /reset-password path (not under /auth) because that's
 * the exact URL registered in this project's Supabase "Redirect URLs"
 * allow-list — resetPasswordForEmail's redirectTo has to match an
 * allow-listed entry exactly or Supabase silently collapses it to the bare
 * Site URL, dropping the path entirely (observed live against this
 * project). forgot-password points straight here, not through
 * /auth/confirm: this needs to be a client-rendered page so the Supabase
 * browser client's own URL detection can run, and a server route can't do
 * that.
 *
 * The email link can arrive here in any of three shapes, depending on how
 * the project's Supabase email template is configured:
 *
 * 1. `?code=...` — this project's actual style. Its Supabase client is on
 *    PKCE flow (forced on by @supabase/ssr for both browser and server
 *    clients), and resetPasswordForEmail() embeds a PKCE code_challenge
 *    whenever the initiating client is PKCE-flow. The Supabase browser
 *    client auto-exchanges this for a session as soon as it's mounted
 *    anywhere (detectSessionInUrl, on by default) — no code needed here.
 * 2. `?token_hash=...&type=recovery` — the classic OTP-link style. A plain
 *    query string, verified explicitly below.
 * 3. `#access_token=...&type=recovery` — the older implicit-grant style, a
 *    URL fragment. Also auto-handled by the same client-side detection.
 *
 * Whichever shape shows up, the session lands via the ordinary
 * onAuthStateChange stream that useAuthUser() below already subscribes
 * to — this page just needs to wait for it instead of assuming "no user
 * yet" means "expired" while that's still in flight (see the pending-token
 * grace period below).
 */
const VERIFY_GRACE_MS = 6000;

export default function ResetPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuthUser();
  const next = sanitizeNextPath(searchParams.get("next"));

  const [verifying, setVerifying] = useState(true);
  const [verifyFailed, setVerifyFailed] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Explicit token_hash+type=recovery style: verify it ourselves.
  useEffect(() => {
    const tokenHash = searchParams.get("token_hash");
    const type = searchParams.get("type");
    if (!tokenHash || type !== "recovery") return;
    const supabase = createBrowserSupabaseClient();
    supabase.auth.verifyOtp({ type: "recovery", token_hash: tokenHash }).then(({ error: verifyError }) => {
      if (verifyError) setVerifyFailed(true);
      router.replace(`/reset-password?next=${encodeURIComponent(next)}`);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ?code= (PKCE) or #access_token=... (implicit) style: the Supabase
  // client exchanges these on its own as soon as it initializes anywhere
  // in the app, so just wait for `user` to show up rather than doing
  // anything ourselves — but cap the wait so a genuinely dead link still
  // resolves to "expired" instead of spinning forever.
  useEffect(() => {
    const hasPendingToken =
      Boolean(searchParams.get("code")) ||
      Boolean(window.location.hash) ||
      (Boolean(searchParams.get("token_hash")) && searchParams.get("type") === "recovery");
    if (authLoading) return;
    if (user || !hasPendingToken) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reflecting auth state that resolved outside this component (onAuthStateChange), not a render-derived value
      setVerifying(false);
      return;
    }
    const timer = setTimeout(() => setVerifying(false), VERIFY_GRACE_MS);
    return () => clearTimeout(timer);
  }, [authLoading, user, searchParams]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!isPasswordValid(password)) {
      setError("Password must be at least 8 characters and include an uppercase letter and a number.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      const supabase = createBrowserSupabaseClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError("Could not update your password. The reset link may have expired.");
        return;
      }
      await supabase.auth.signOut();
      setDone(true);
    } catch {
      setError("Network error, please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <AuthCard>
        <div className="flex flex-col items-center gap-4 text-center">
          <CheckCircle2 className="h-10 w-10 text-accent" />
          <h1 className="font-display text-2xl font-bold text-ink">Password updated</h1>
          <p className="text-sm text-muted">Your password has been updated. You can now sign in.</p>
          <AuthButton type="button" onClick={() => router.push(`/auth/sign-in?next=${encodeURIComponent(next)}`)}>
            Go to sign in
          </AuthButton>
        </div>
      </AuthCard>
    );
  }

  if (verifying || authLoading) {
    return (
      <AuthCard>
        <p className="py-8 text-center text-sm text-muted">Verifying your reset link…</p>
      </AuthCard>
    );
  }

  if (verifyFailed || !user) {
    return (
      <AuthCard>
        <div className="flex flex-col items-center gap-4 text-center">
          <h1 className="font-display text-2xl font-bold text-ink">This link has expired</h1>
          <p className="text-sm text-muted">Request a new password reset link and try again.</p>
          <Link href="/auth/forgot-password" className="text-sm text-accent hover:underline">
            Back to forgot password
          </Link>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard>
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-bold text-ink">Create a new password</h1>
        <p className="text-sm text-muted">Your new password must be strong and secure.</p>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <AuthInput
            icon={Lock}
            label="New password"
            type="password"
            required
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Create a strong password"
          />
          {password.length > 0 && <PasswordChecklist password={password} />}
        </div>
        <AuthInput
          icon={Lock}
          label="Confirm new password"
          type="password"
          required
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Confirm your password"
        />
        <AuthButton type="submit" loading={submitting}>
          Reset password
        </AuthButton>
      </form>
    </AuthCard>
  );
}
