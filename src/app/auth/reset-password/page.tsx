"use client";

import { useState } from "react";
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
 * Reached only via /auth/confirm's recovery branch, which already
 * verified the reset token and established a temporary recovery session —
 * this page just uses that session to call updateUser(), then explicitly
 * signs out and sends the visitor to sign in fresh with their new
 * password, matching the spec's literal flow rather than silently
 * continuing on the recovery session.
 */
export default function ResetPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuthUser();
  const next = sanitizeNextPath(searchParams.get("next"));

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      setError("Network error — please try again.");
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

  if (!authLoading && !user) {
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
