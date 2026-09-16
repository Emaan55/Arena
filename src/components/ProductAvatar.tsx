"use client";

import { useState } from "react";

/**
 * The single source of truth for a product's visual identity everywhere
 * it appears (duel cards, leaderboard, search, sponsor banners, etc.):
 * shows the auto-resolved favicon (products.logo_url / sponsorships.
 * logo_url — see lib/url-metadata.ts, never a manual upload) when one is
 * available, and falls back to a deterministic initial-letter avatar
 * otherwise — never a broken-image glyph, never an empty box.
 */
export function ProductAvatar({
  name,
  logoUrl = null,
  size = "md",
  accent = false,
  glow = false,
  padded = false,
  className,
}: {
  name: string;
  /** Auto-resolved favicon URL, or null/undefined to always show the
   * initial (e.g. while a submission's favicon is still resolving). */
  logoUrl?: string | null;
  size?: "sm" | "md" | "lg" | "xl";
  accent?: boolean;
  /** Adds the same accent glow used for a voted duel card / #1 leaderboard row. */
  glow?: boolean;
  /** Shrinks the favicon slightly within its box so a small source image
   * doesn't look blurry when magnified to fill a large container. Has no
   * effect on the letter fallback. */
  padded?: boolean;
  /** Full class override for size/border/radius — for contexts with
   * bespoke chrome (e.g. the Sponsored featured banner). Omit to use the
   * standard size-driven box every other card already uses. */
  className?: string;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  const sizeClass = {
    sm: "h-8 w-8 text-sm",
    md: "h-11 w-11 text-base",
    lg: "h-14 w-14 text-xl",
    xl: "h-24 w-24 text-4xl sm:h-28 sm:w-28",
  }[size];
  const showImage = !!logoUrl && !imgFailed;

  return (
    <div
      className={
        className ??
        `flex shrink-0 items-center justify-center overflow-hidden rounded-lg border font-display font-bold ${sizeClass} ${
          accent ? "border-accent/40 bg-accent-soft/15 text-accent" : "border-border bg-surface-2 text-ink"
        }`
      }
      style={glow ? { boxShadow: "var(--glow-accent)" } : undefined}
      aria-hidden="true"
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl}
          alt=""
          className="h-full w-full object-contain"
          style={padded ? { padding: "16%" } : undefined}
          onError={() => setImgFailed(true)}
          referrerPolicy="no-referrer"
        />
      ) : (
        initial
      )}
    </div>
  );
}
