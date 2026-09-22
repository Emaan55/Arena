"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Mail, Lock } from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { useAuthUser } from "@/lib/useAuthUser";
import { sanitizeNextPath } from "@/lib/auth/config";
import { AuthCard } from "@/components/auth/AuthCard";
import { AuthInput } from "@/components/auth/AuthInput";
import { AuthButton, AuthDivider, ContinueWithX } from "@/components/auth/AuthControls";

export default function SignInPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuthUser();
  const next = sanitizeNextPath(searchParams.get("next"));

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Already authenticated (e.g. arriving right after email verification,
  // which establishes a session on its own) — continue straight through
  // instead of making them re-enter credentials.
  useEffect(() => {
    if (!authLoading && user) {
      router.replace(next);
    }
  }, [authLoading, user, next, router]);

  useEffect(() => {
    const authError = searchParams.get("authError");
    const message =
      authError === "oauth" ? "Could not sign in with X. Please try again." : authError ? "That link is invalid or has expired." : null;
    if (message) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reflecting a redirect-carried query param into the error banner, not a render-driven derivation
      setError(message);
    }
  }, [searchParams]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const supabase = createBrowserSupabaseClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (signInError) {
        if (signInError.message.toLowerCase().includes("email not confirmed")) {
          router.push(`/auth/verify-email?email=${encodeURIComponent(email.trim())}&next=${encodeURIComponent(next)}`);
          return;
        }
        setError("Incorrect email or password.");
        return;
      }
      router.push(next);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleX() {
    setError(null);
    setOauthLoading(true);
    try {
      const supabase = createBrowserSupabaseClient();
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "twitter",
        options: { redirectTo: `${window.location.origin}/auth/confirm?next=${encodeURIComponent(next)}` },
      });
      if (oauthError) {
        setError("Could not start sign-in with X. Please try again.");
        setOauthLoading(false);
      }
      // On success the browser navigates away to X — no further state to set.
    } catch {
      setError("Network error — please try again.");
      setOauthLoading(false);
    }
  }

  return (
    <AuthCard
      topRight={
        <Link href={`/auth/sign-up?next=${encodeURIComponent(next)}`} className="text-xs font-medium text-accent hover:underline">
          Don&apos;t have an account? Sign up
        </Link>
      }
    >
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-bold text-ink">Welcome back</h1>
        <p className="text-sm text-muted">Sign in to your account and continue your journey in THE ARENA.</p>
      </div>

      {searchParams.get("verified") === "1" && (
        <p className="rounded-lg bg-accent-soft/20 px-3 py-2 text-sm text-accent">
          Email confirmed! Sign in to continue.
        </p>
      )}
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
        <div className="flex flex-col gap-1.5">
          <AuthInput
            icon={Lock}
            label="Password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
          />
          <Link
            href={`/auth/forgot-password?next=${encodeURIComponent(next)}`}
            className="self-end text-xs text-accent hover:underline"
          >
            Forgot password?
          </Link>
        </div>
        <AuthButton type="submit" loading={submitting}>
          Sign in
        </AuthButton>
      </form>

      <AuthDivider />
      <ContinueWithX onClick={handleX} loading={oauthLoading} />
    </AuthCard>
  );
}
