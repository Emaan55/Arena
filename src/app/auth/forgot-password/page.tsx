"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Mail, CheckCircle2 } from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { sanitizeNextPath } from "@/lib/auth/config";
import { AuthCard } from "@/components/auth/AuthCard";
import { AuthInput } from "@/components/auth/AuthInput";
import { AuthButton } from "@/components/auth/AuthControls";

/** Password recovery — deliberately a separate flow from signup verification, even though both are Supabase email-OTP links under the hood (see /auth/confirm, which branches on `type`). */
export default function ForgotPasswordPage() {
  const searchParams = useSearchParams();
  const next = sanitizeNextPath(searchParams.get("next"));

  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const supabase = createBrowserSupabaseClient();
      // Never reveal whether the email exists — same response either way,
      // consistent with sign-up's anti-enumeration handling.
      //
      // Routes through /auth/confirm (same as sign-up's emailRedirectTo)
      // rather than straight at /auth/reset-password: this project's
      // Supabase client is PKCE-flow, so the link arrives as `?code=...`,
      // and /auth/confirm is what exchanges it server-side. `type=recovery`
      // is our own marker (Supabase doesn't attach one to a code redirect)
      // so /auth/confirm knows to send the visitor to the reset-password
      // form afterward instead of straight to sign-in.
      await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/auth/confirm?type=recovery&next=${encodeURIComponent(next)}`,
      });
      setSent(true);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <AuthCard>
        <div className="flex flex-col items-center gap-4 text-center">
          <CheckCircle2 className="h-10 w-10 text-accent" />
          <h1 className="font-display text-2xl font-bold text-ink">Check your email</h1>
          <p className="text-sm text-muted">
            If an account exists for <span className="font-medium text-ink">{email}</span>, a reset link is on its
            way.
          </p>
          <Link href="/auth/sign-in" className="text-sm text-accent hover:underline">
            Back to sign in
          </Link>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard>
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-bold text-ink">Forgot your password?</h1>
        <p className="text-sm text-muted">Enter your email and we&apos;ll send you a link to reset your password.</p>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <AuthInput
          icon={Mail}
          label="Email address"
          type="email"
          required
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />
        <AuthButton type="submit" loading={submitting}>
          Send reset link
        </AuthButton>
      </form>

      <Link href="/auth/sign-in" className="text-center text-sm text-accent hover:underline">
        Back to sign in
      </Link>
    </AuthCard>
  );
}
