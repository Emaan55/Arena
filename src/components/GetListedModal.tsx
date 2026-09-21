"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X, Mail, CheckCircle2 } from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { useAuthUser } from "@/lib/useAuthUser";
import { CATEGORIES, type Category } from "@/types/database";
import { GET_LISTED_PACKAGES, type GetListedPackageKey } from "@/lib/get-listed/packages";

const DESCRIPTION_MAX = 500;

/**
 * Campaign creation requires a signed-in user, same magic-link mechanism
 * as voting (see SignInPrompt.tsx) — this modal just also holds the
 * campaign form so a visitor without an account yet can go straight from
 * "pick a package" to "signed in and mid-form" in one flow. Crossing the
 * email round trip (often a different tab) keeps the chosen package via
 * `?package=<key>&resume=1` on the redirect, but the rest of the form
 * isn't preserved across tabs — a disclosed, minor rough edge for Phase 1,
 * not a blocker (the form takes under a minute to redo).
 */
export function GetListedModal({
  open,
  onClose,
  packageKey,
}: {
  open: boolean;
  onClose: () => void;
  packageKey: GetListedPackageKey;
}) {
  const router = useRouter();
  const { user, loading: authLoading } = useAuthUser();
  const [email, setEmail] = useState("");
  const [emailStatus, setEmailStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  const [form, setForm] = useState({
    startupName: "",
    websiteUrl: "",
    description: "",
    category: CATEGORIES[0] as Category,
    xUrl: "",
    linkedinUrl: "",
    otherUrl: "",
    termsAccepted: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const pkg = GET_LISTED_PACKAGES[packageKey];

  function handleClose() {
    setEmailStatus("idle");
    setError(null);
    onClose();
  }

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setEmailStatus("sending");
    try {
      const supabase = createBrowserSupabaseClient();
      const next = `/get-listed?package=${packageKey}&resume=1`;
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: `${window.location.origin}/auth/confirm?next=${encodeURIComponent(next)}` },
      });
      setEmailStatus(otpError ? "error" : "sent");
    } catch {
      setEmailStatus("error");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.termsAccepted) {
      setError("You must accept the submission terms to continue.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/get-listed/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageKey, ...form }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not create campaign.");
        return;
      }
      handleClose();
      router.push(`/get-listed/campaigns/${data.campaign.id}`);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-lg rounded-2xl border border-border bg-surface p-6 shadow-lg">
        <button
          onClick={handleClose}
          aria-label="Close"
          className="absolute right-4 top-4 text-muted transition-colors duration-150 ease-out hover:text-ink"
        >
          <X className="h-4 w-4" />
        </button>

        {authLoading ? (
          <p className="py-8 text-center text-sm text-muted">Loading…</p>
        ) : !user ? (
          emailStatus === "sent" ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <CheckCircle2 className="h-8 w-8 text-accent" />
              <h2 className="font-display text-lg font-bold text-ink">Check your email</h2>
              <p className="text-sm text-muted">
                We sent a sign-in link to <span className="font-medium text-ink">{email}</span>. Open it to
                continue setting up your {pkg.label} campaign.
              </p>
            </div>
          ) : (
            <form onSubmit={sendMagicLink} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2 text-ink">
                  <Mail className="h-5 w-5 text-accent" />
                  <h2 className="font-display text-lg font-bold">Sign in to get listed</h2>
                </div>
                <p className="text-sm text-muted">
                  {pkg.label} — {pkg.target} manual submissions, ${pkg.priceUsd}. We&apos;ll email you a link — no
                  password needed.
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
              {emailStatus === "error" && (
                <p className="text-sm text-danger">Could not send the sign-in link. Please try again.</p>
              )}
              <button
                type="submit"
                disabled={emailStatus === "sending" || !email.trim()}
                className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-ink shadow-sm transition-all duration-150 ease-out hover:-translate-y-0.5 hover:shadow-md active:scale-95 disabled:pointer-events-none disabled:opacity-50"
              >
                {emailStatus === "sending" ? "Sending…" : "Send sign-in link"}
              </button>
            </form>
          )
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <h2 className="font-display text-lg font-bold text-ink">Set up your {pkg.label} campaign</h2>
              <p className="text-sm text-muted">
                {pkg.target} manual submissions — ${pkg.priceUsd}
              </p>
            </div>

            <input
              required
              value={form.startupName}
              onChange={(e) => setForm((f) => ({ ...f, startupName: e.target.value }))}
              placeholder="Startup name"
              className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none"
            />
            <input
              required
              type="url"
              value={form.websiteUrl}
              onChange={(e) => setForm((f) => ({ ...f, websiteUrl: e.target.value }))}
              placeholder="https://yourproduct.com"
              className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none"
            />
            <textarea
              required
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value.slice(0, DESCRIPTION_MAX) }))}
              placeholder="What does your product do? (used in directory submissions)"
              rows={3}
              className="resize-none rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none"
            />
            <select
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as Category }))}
              className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <input
                value={form.xUrl}
                onChange={(e) => setForm((f) => ({ ...f, xUrl: e.target.value }))}
                placeholder="X / Twitter (optional)"
                className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none"
              />
              <input
                value={form.linkedinUrl}
                onChange={(e) => setForm((f) => ({ ...f, linkedinUrl: e.target.value }))}
                placeholder="LinkedIn (optional)"
                className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none"
              />
              <input
                value={form.otherUrl}
                onChange={(e) => setForm((f) => ({ ...f, otherUrl: e.target.value }))}
                placeholder="Other link (optional)"
                className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none"
              />
            </div>

            <label className="flex items-start gap-2 text-xs text-muted">
              <input
                type="checkbox"
                checked={form.termsAccepted}
                onChange={(e) => setForm((f) => ({ ...f, termsAccepted: e.target.checked }))}
                className="mt-0.5"
              />
              I understand this package covers manual submissions, not guaranteed live listings — each directory
              controls its own approval, review time, and policies.
            </label>

            {error && <p className="text-sm text-danger">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-ink shadow-sm transition-all duration-150 ease-out hover:-translate-y-0.5 hover:shadow-md active:scale-95 disabled:pointer-events-none disabled:opacity-50"
            >
              {submitting ? "Creating…" : `Get Listed — $${pkg.priceUsd}`}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
