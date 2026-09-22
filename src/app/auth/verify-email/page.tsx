"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Mail, Info } from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { sanitizeNextPath } from "@/lib/auth/config";
import { AuthCard } from "@/components/auth/AuthCard";
import { AuthButton } from "@/components/auth/AuthControls";

const RESEND_COOLDOWN_S = 45;

/**
 * Reached two ways: right after sign-up, and when an existing but
 * unverified account tries to sign in (see /auth/sign-in's
 * "email not confirmed" handling) — same screen either way, since the
 * only action available is the same resend.
 */
export default function VerifyEmailPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get("email") ?? "";
  const next = sanitizeNextPath(searchParams.get("next"));

  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_S);
  const [resending, setResending] = useState(false);
  const [status, setStatus] = useState<"idle" | "sent" | "error">("idle");

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  async function handleResend() {
    if (cooldown > 0 || !email) return;
    setResending(true);
    setStatus("idle");
    try {
      const supabase = createBrowserSupabaseClient();
      const { error } = await supabase.auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo: `${window.location.origin}/auth/confirm?type=signup&next=${encodeURIComponent(next)}` },
      });
      setStatus(error ? "error" : "sent");
      if (!error) setCooldown(RESEND_COOLDOWN_S);
    } catch {
      setStatus("error");
    } finally {
      setResending(false);
    }
  }

  if (!email) {
    return (
      <AuthCard>
        <p className="text-center text-sm text-muted">No email to verify.</p>
        <Link href="/auth/sign-up" className="text-center text-sm text-accent hover:underline">
          Back to sign up
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard>
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent-soft/20 text-accent">
          <Mail className="h-6 w-6" />
        </div>
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-2xl font-bold text-ink">Check your email</h1>
          <p className="text-sm text-muted">
            We&apos;ve sent a verification link to <span className="font-medium text-ink">{email}</span>
          </p>
        </div>

        <div className="flex w-full items-start gap-2 rounded-lg bg-surface-2 p-3 text-left text-xs text-muted">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
          <span>Didn&apos;t receive the email? Make sure to check your spam folder.</span>
        </div>

        {status === "sent" && <p className="text-sm text-accent">Verification email sent. Check your inbox.</p>}
        {status === "error" && <p className="text-sm text-danger">Could not resend the email. Please try again.</p>}

        <div className="flex w-full flex-col gap-2">
          <AuthButton onClick={handleResend} loading={resending} disabled={cooldown > 0} type="button">
            {cooldown > 0
              ? `Resend verification email (00:${cooldown.toString().padStart(2, "0")})`
              : "Resend verification email"}
          </AuthButton>
          <button
            onClick={() => router.push(`/auth/sign-up?next=${encodeURIComponent(next)}`)}
            className="w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-ink shadow-sm transition-all duration-150 ease-out hover:-translate-y-0.5 hover:shadow-md active:scale-95"
          >
            Change email
          </button>
        </div>

        <Link href={`/auth/sign-in?next=${encodeURIComponent(next)}`} className="text-sm text-accent hover:underline">
          Back to sign in
        </Link>
      </div>
    </AuthCard>
  );
}
