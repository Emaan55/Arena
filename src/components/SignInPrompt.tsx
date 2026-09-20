"use client";

import { useState } from "react";
import { X, Mail, CheckCircle2 } from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { VoteSide } from "@/types/database";

/**
 * Minimal "sign in to vote" gate — a magic-link email is the entire
 * authentication flow (no password, and receiving the link IS the email
 * verification, satisfying that requirement for free). When opened with a
 * `pendingVote`, the link embeds `next=/?resumeVote=<matchId>:<side>` so
 * the visitor lands back on the arena with enough context to finish
 * casting the exact vote they started, in ArenaApp/ProductLiveDuel's
 * resume-vote effect — including across a different tab/device, which a
 * sessionStorage-only approach couldn't do since email links usually open
 * in a fresh browsing context.
 */
export function SignInPrompt({
  open,
  onClose,
  pendingVote,
}: {
  open: boolean;
  onClose: () => void;
  pendingVote?: { matchId: string; side: VoteSide } | null;
}) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus("sending");
    setError(null);
    try {
      const supabase = createBrowserSupabaseClient();
      const next = pendingVote ? `/?resumeVote=${pendingVote.matchId}:${pendingVote.side}` : "/";
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: `${window.location.origin}/auth/confirm?next=${encodeURIComponent(next)}`,
        },
      });
      if (otpError) {
        setError("Could not send the sign-in link. Please try again.");
        setStatus("error");
        return;
      }
      setStatus("sent");
    } catch {
      setError("Network error — please try again.");
      setStatus("error");
    }
  }

  function handleClose() {
    setEmail("");
    setStatus("idle");
    setError(null);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-lg">
        <button
          onClick={handleClose}
          aria-label="Close"
          className="absolute right-4 top-4 text-muted transition-colors duration-150 ease-out hover:text-ink"
        >
          <X className="h-4 w-4" />
        </button>

        {status === "sent" ? (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <CheckCircle2 className="h-8 w-8 text-accent" />
            <h2 className="font-display text-lg font-bold text-ink">Check your email</h2>
            <p className="text-sm text-muted">
              We sent a sign-in link to <span className="font-medium text-ink">{email}</span>.
              Open it to {pendingVote ? "finish casting your vote." : "sign in."}
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2 text-ink">
                <Mail className="h-5 w-5 text-accent" />
                <h2 className="font-display text-lg font-bold">Sign in to vote</h2>
              </div>
              <p className="text-sm text-muted">
                One free vote per duel. We&apos;ll email you a link — no password needed.
              </p>
            </div>
            <input
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none"
            />
            {error && <p className="text-sm text-danger">{error}</p>}
            <button
              type="submit"
              disabled={status === "sending" || !email.trim()}
              className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-ink shadow-sm transition-all duration-150 ease-out hover:-translate-y-0.5 hover:shadow-md active:scale-95 disabled:pointer-events-none disabled:opacity-50"
            >
              {status === "sending" ? "Sending…" : "Send sign-in link"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
