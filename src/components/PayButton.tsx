"use client";

import { useState } from "react";
import type { PaymentType } from "@/types/database";

const LABELS: Record<PaymentType, string> = {
  boost: "Boost +2 votes ($5)",
  revive: "Revive Now ($10)",
  defend: "Defend Now ($20)",
  sponsor: "Sponsor Your Product",
};

export function PayButton({
  type,
  productId,
  matchId,
  endpoint = "/api/checkout",
  extraBody,
  className,
  label,
  onPaid,
}: {
  type: PaymentType;
  /** Omitted for an external-product sponsorship, which has no product id. */
  productId?: string;
  matchId?: string;
  /** Lets other paid flows (e.g. sponsorship) reuse this same checkout/overlay
   * plumbing against their own route instead of /api/checkout. */
  endpoint?: string;
  /** Extra fields merged into the POST body — e.g. an edit token or duration. */
  extraBody?: Record<string, string | number>;
  className?: string;
  label?: string;
  onPaid?: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, productId, matchId, ...extraBody }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        setError(data.error ?? "Could not start checkout.");
        return;
      }

      if (window.LemonSqueezy?.Url) {
        window.LemonSqueezy.Setup?.({
          eventHandler: (event) => {
            if (event.event === "Checkout.Success") {
              // Give the webhook a moment to land before refreshing.
              setTimeout(() => onPaid?.(), 1500);
            }
          },
        });
        window.LemonSqueezy.Url.Open(data.url);
      } else {
        // Overlay script hasn't loaded yet — fall back to a plain redirect.
        window.open(data.url, "_blank", "noopener,noreferrer");
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        onClick={handleClick}
        disabled={loading}
        className={
          className ??
          "w-full rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-accent-ink shadow-sm transition-all duration-150 ease-out hover:-translate-y-0.5 hover:shadow-md active:scale-95 disabled:pointer-events-none disabled:opacity-50"
        }
      >
        {loading ? "Starting checkout…" : (label ?? LABELS[type])}
      </button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}
