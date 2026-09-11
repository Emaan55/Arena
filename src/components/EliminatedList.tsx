"use client";

import Link from "next/link";
import type { Product } from "@/types/database";
import { PayButton } from "./PayButton";
import { ProductAvatar } from "./ProductAvatar";
import { XHandleLink } from "./XHandleLink";
import { EditProductButton } from "./EditProductButton";

export function EliminatedList({
  products,
  onPaid,
}: {
  products: Product[];
  onPaid?: () => void;
}) {
  if (products.length === 0) {
    return <p className="text-sm text-muted">No eliminations yet in this category.</p>;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {products.map((p) => (
        <div
          key={p.id}
          className="relative flex flex-col gap-3 overflow-hidden rounded-xl border border-border bg-surface p-5 opacity-80 shadow-sm transition-opacity duration-150 ease-out hover:opacity-100"
        >
          <div className="pointer-events-none absolute -right-11 top-4 w-36 rotate-45 bg-danger py-1 text-center text-[10px] font-bold uppercase tracking-widest text-danger-ink shadow-sm">
            Eliminated
          </div>
          <ProductAvatar name={p.name} />
          <div className="flex min-w-0 flex-col gap-1 pr-8">
            <div className="flex min-w-0 items-center gap-1.5">
              <Link href={`/product/${p.id}`} className="truncate font-display text-base font-bold text-muted hover:text-ink">
                {p.name}
              </Link>
              <EditProductButton productId={p.id} submittedAt={p.submitted_at} />
            </div>
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">
              {p.category}
            </span>
            <p className="line-clamp-2 text-xs leading-snug text-muted">{p.pitch}</p>
            <XHandleLink handle={p.x_handle} />
          </div>
          <PayButton type="revive" productId={p.id} onPaid={onPaid} />
        </div>
      ))}
    </div>
  );
}
