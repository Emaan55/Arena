"use client";

import Link from "next/link";
import type { ChampionWithProduct } from "@/lib/arena-state";
import { timeAgo } from "@/lib/format";
import { PayButton } from "./PayButton";
import { ProductAvatar } from "./ProductAvatar";
import { XHandleLink } from "./XHandleLink";
import { EditProductButton } from "./EditProductButton";
import { CrownIcon } from "./icons";

export function HallOfFame({
  champions,
  onPaid,
}: {
  champions: ChampionWithProduct[];
  onPaid?: () => void;
}) {
  if (champions.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted">
        No champions crowned yet — win 3 duels in a row to claim the throne.
      </p>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {champions.map((c) => (
        <div
          key={c.id}
          className="group flex flex-col gap-3 rounded-xl border border-border bg-surface p-5 shadow-sm transition-all duration-150 ease-out hover:-translate-y-1 hover:shadow-lg"
        >
          <div className="flex items-start justify-between">
            <ProductAvatar name={c.product.name} logoUrl={c.product.logo_url} accent size="lg" />
            <CrownIcon
              className="h-6 w-6 text-accent transition-transform group-hover:scale-110"
              style={{ animation: "crown-float 3s ease-in-out infinite" }}
            />
          </div>
          <div className="flex flex-col gap-0.5">
            <div className="flex min-w-0 items-center gap-1.5">
              <Link href={`/product/${c.product_id}`} className="font-display text-lg font-bold text-ink hover:text-accent">
                {c.product.name}
              </Link>
              <EditProductButton productId={c.product_id} submittedAt={c.product.submitted_at} />
            </div>
            <span className="text-xs font-semibold uppercase tracking-wide text-accent">
              {c.category}
            </span>
          </div>
          <p className="line-clamp-2 text-sm text-muted">{c.product.pitch}</p>
          <XHandleLink handle={c.product.x_handle} />
          <div className="mt-1 flex items-center justify-between text-xs text-muted">
            <span>Crowned {timeAgo(c.crowned_at)}</span>
            {c.times_defended > 0 && (
              <span className="rounded-full bg-accent-soft/20 px-2 py-0.5 font-mono text-[10px] font-bold text-accent">
                Defended {c.times_defended}×
              </span>
            )}
          </div>
          {c.product.uncontested_wins > 0 && (
            <span className="text-xs text-muted">
              Includes {c.product.uncontested_wins} uncontested win
              {c.product.uncontested_wins > 1 ? "s" : ""}
            </span>
          )}
          {c.product.status === "champion" && (
            <PayButton type="defend" productId={c.product_id} onPaid={onPaid} />
          )}
        </div>
      ))}
    </div>
  );
}
