"use client";

import { useState } from "react";
import { Globe } from "lucide-react";

/**
 * Renders a sponsor's resolved favicon (see lib/url-metadata.ts), falling
 * back to a generic icon when there isn't one yet or the image fails to
 * load — never a broken-image glyph. A plain <img> (not next/image) so any
 * external domain works without remote-pattern config.
 */
export function SponsorLogo({
  logoUrl,
  name,
  className = "h-24 w-24 sm:h-32 sm:w-32",
}: {
  logoUrl: string | null;
  name: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const showFallback = !logoUrl || failed;

  return (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-2xl border-2 border-accent bg-surface-2 ${
        showFallback ? "" : "p-4"
      } ${className}`}
      style={{ boxShadow: "var(--glow-accent)" }}
    >
      {showFallback ? (
        <Globe className="h-1/3 w-1/3 text-accent" />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl}
          alt={`${name} logo`}
          className="h-full w-full object-contain"
          onError={() => setFailed(true)}
          referrerPolicy="no-referrer"
        />
      )}
    </div>
  );
}
