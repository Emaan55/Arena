"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Pencil } from "lucide-react";
import { editTokenStorageKey } from "@/lib/edit-token-storage";
import { isWithinEditWindow } from "@/lib/edit-window";

/**
 * A small pencil icon shown ONLY to the browser that submitted this exact
 * product (i.e. the one holding its edit token in localStorage — see
 * SubmitForm.tsx/ProductEditor.tsx), and only within the first 24h after
 * submission. Everyone else — including every other visitor voting on this
 * product's duel — sees nothing here at all.
 *
 * It's a link to the product page's editor rather than an inline form: the
 * actual edit still goes through PATCH /api/products/[id], which only ever
 * touches pitch/Battle Pitch/Why Us/differentiators/X handle — never votes,
 * wins, or match state — so nothing edited here can change the outcome of
 * a battle, and the 24h window (also enforced server-side) rules out
 * rewriting a pitch mid-duel in reaction to how voting is going.
 */
export function EditProductButton({
  productId,
  submittedAt,
  className,
}: {
  productId: string;
  submittedAt: string;
  className?: string;
}) {
  const [canEdit, setCanEdit] = useState(false);

  useEffect(() => {
    try {
      const hasToken = Boolean(window.localStorage.getItem(editTokenStorageKey(productId)));
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCanEdit(hasToken && isWithinEditWindow(submittedAt));
    } catch {
      // localStorage unavailable — no edit affordance, same as no token.
    }
  }, [productId, submittedAt]);

  if (!canEdit) return null;

  return (
    <Link
      href={`/product/${productId}?edit=1#edit-product`}
      onClick={(e) => e.stopPropagation()}
      aria-label="Edit your product"
      title="Edit your product"
      className={
        className ??
        "flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted transition-colors duration-150 ease-out hover:bg-surface-2 hover:text-accent"
      }
    >
      <Pencil className="h-3.5 w-3.5" />
    </Link>
  );
}
