"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { useAuthUser } from "@/lib/useAuthUser";
import { CATEGORIES, type Category } from "@/types/database";
import { GET_LISTED_PACKAGES, type GetListedPackageKey } from "@/lib/get-listed/packages";

const DESCRIPTION_MAX = 500;

/**
 * Campaign creation requires a signed-in user. If the visitor isn't
 * signed in yet, this redirects to /auth/sign-in with `next` set to come
 * straight back here (?package=<key>&resume=1, the same param the page
 * already reads to reopen this modal — see get-listed/page.tsx) rather
 * than holding its own inline sign-in form.
 */
export function GetListedModal({
  open,
  onClose,
  packageKey,
  discountAward,
}: {
  open: boolean;
  onClose: () => void;
  packageKey: GetListedPackageKey;
  /** A verified, still-available Discount Drop award to apply — re-checked again server-side on submit regardless. */
  discountAward?: { id: string; discountPercent: number } | null;
}) {
  const router = useRouter();
  const { user, loading: authLoading } = useAuthUser();

  useEffect(() => {
    if (open && !authLoading && !user) {
      const next = `/get-listed?package=${packageKey}&resume=1`;
      router.push(`/auth/sign-in?next=${encodeURIComponent(next)}`);
    }
  }, [open, authLoading, user, packageKey, router]);

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
  const discountedPrice = discountAward
    ? Math.round(pkg.priceUsd * (1 - discountAward.discountPercent / 100))
    : null;

  function handleClose() {
    setError(null);
    onClose();
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
        body: JSON.stringify({ packageKey, ...form, discountAwardId: discountAward?.id }),
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

        {authLoading || !user ? (
          <p className="py-8 text-center text-sm text-muted">Redirecting to sign in…</p>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <h2 className="font-display text-lg font-bold text-ink">Set up your {pkg.label} campaign</h2>
              <p className="text-sm text-muted">
                {pkg.target} manual submissions —{" "}
                {discountedPrice !== null ? (
                  <>
                    <span className="line-through">${pkg.priceUsd}</span>{" "}
                    <span className="font-semibold text-accent">
                      ${discountedPrice} ({discountAward!.discountPercent}% off)
                    </span>
                  </>
                ) : (
                  `$${pkg.priceUsd}`
                )}
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
              {submitting ? "Creating…" : `Get Listed — $${discountedPrice ?? pkg.priceUsd}`}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
