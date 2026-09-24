"use client";

import { useState } from "react";
import { Swords } from "lucide-react";
import type { Product } from "@/types/database";
import { ProductAvatar } from "./ProductAvatar";
import { XHandleLink } from "./XHandleLink";
import { EditProductButton } from "./EditProductButton";

function buildInviteLink(product: Product): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const params = new URLSearchParams({ join: product.category, from: product.name });
  return `${origin}/?${params.toString()}`;
}

function openTwitterIntent(product: Product) {
  const link = buildInviteLink(product);
  const text = `I just entered The Arena with ${product.name} in ${product.category}. Think your product can beat it? ⚔️`;
  const intentUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(link)}`;
  window.open(intentUrl, "_blank", "noopener,noreferrer,width=550,height=420");
}

export function WaitingCard({
  product,
  variant = "waiting",
}: {
  product: Product;
  variant?: "waiting" | "unique";
}) {
  const [copied, setCopied] = useState(false);

  async function copyInvite() {
    const link = buildInviteLink(product);
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard API unavailable — silently ignore, the share intent still works
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-dashed border-accent/40 bg-accent-soft/5 p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <ProductAvatar name={product.name} logoUrl={product.logo_url} accent />
        <div className="flex min-w-0 flex-col gap-1">
          <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-accent">
            <Swords className="h-3.5 w-3.5 shrink-0" />
            {variant === "unique" ? "Unique Product · Uncontested" : "Waiting for a challenger"}
          </span>
          <div className="flex min-w-0 items-center gap-1.5">
            <a href={`/product/${product.id}`} className="truncate font-display text-base font-bold text-ink hover:text-accent">
              {product.name}
            </a>
            <EditProductButton productId={product.id} submittedAt={product.submitted_at} />
          </div>
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">
            {product.category}
          </span>
          <p className="text-xs leading-snug text-muted">{product.pitch}</p>
          <XHandleLink handle={product.x_handle} />
          {variant === "unique" && (
            <p className="text-xs leading-snug text-muted">
              No rival showed up within 7 days, still open to a challenge, no win awarded.
            </p>
          )}
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <button
          onClick={copyInvite}
          className="rounded-lg border border-border bg-bg px-3.5 py-2 text-xs font-semibold text-ink shadow-sm transition-all duration-150 ease-out hover:-translate-y-0.5 hover:shadow-md active:scale-95"
        >
          {copied ? "Copied!" : "Copy link"}
        </button>
        <button
          onClick={() => openTwitterIntent(product)}
          className="rounded-lg bg-accent px-3.5 py-2 text-xs font-semibold text-accent-ink shadow-sm transition-all duration-150 ease-out hover:-translate-y-0.5 hover:shadow-md active:scale-95"
        >
          {variant === "unique" ? "Challenge This Product" : "Invite a Rival"}
        </button>
      </div>
    </div>
  );
}
