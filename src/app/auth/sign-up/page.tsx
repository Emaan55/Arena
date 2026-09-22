"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Mail, Lock, User } from "lucide-react";
import { sanitizeNextPath } from "@/lib/auth/config";
import { AuthCard } from "@/components/auth/AuthCard";
import { AuthInput } from "@/components/auth/AuthInput";
import { AuthButton, PasswordChecklist } from "@/components/auth/AuthControls";

export default function SignUpPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = sanitizeNextPath(searchParams.get("next"));

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (!termsAccepted) {
      setError("You must agree to the Terms & Conditions and Privacy Policy.");
      return;
    }

    setSubmitting(true);
    try {
      // Full name is stored as Supabase auth user_metadata (options.data)
      // when the account is created client-side would work too, but
      // account creation itself happens server-side (see
      // /api/auth/sign-up) so terms acceptance can be recorded in the same
      // request as the new user's id — so full name rides along in the
      // same POST body instead of a second client-side call.
      const res = await fetch("/api/auth/sign-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, confirmPassword, termsAccepted, fullName, next }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not create your account.");
        return;
      }
      router.push(`/auth/verify-email?email=${encodeURIComponent(data.email)}&next=${encodeURIComponent(next)}`);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthCard
      topRight={
        <Link href={`/auth/sign-in?next=${encodeURIComponent(next)}`} className="text-xs font-medium text-accent hover:underline">
          Already have an account? Sign in
        </Link>
      }
    >
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-bold text-ink">Create your account</h1>
        <p className="text-sm text-muted">Join THE ARENA and start discovering, competing, and building.</p>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <AuthInput
          icon={User}
          label="Full name"
          required
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Enter your full name"
        />
        <AuthInput
          icon={Mail}
          label="Email address"
          type="email"
          required
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
            placeholder="Create a strong password"
          />
          {password.length > 0 && <PasswordChecklist password={password} />}
        </div>
        <AuthInput
          icon={Lock}
          label="Confirm password"
          type="password"
          required
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Confirm your password"
        />

        <label className="flex items-start gap-2 text-xs text-muted">
          <input
            type="checkbox"
            checked={termsAccepted}
            onChange={(e) => setTermsAccepted(e.target.checked)}
            className="mt-0.5"
          />
          I agree to THE ARENA&apos;s{" "}
          <Link href="/terms" target="_blank" className="text-accent hover:underline">
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link href="/privacy" target="_blank" className="text-accent hover:underline">
            Privacy Policy
          </Link>
          .
        </label>

        <AuthButton type="submit" loading={submitting}>
          Create account
        </AuthButton>
      </form>
    </AuthCard>
  );
}
