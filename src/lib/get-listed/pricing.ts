import { GET_LISTED_PACKAGES, type GetListedPackageKey } from "./packages";

export interface GetListedPricing {
  baseAmountCents: number;
  discountPercent: number;
  discountAmountCents: number;
  finalAmountCents: number;
}

/**
 * The only place a Get Listed order's price is ever computed. Amounts are
 * cents (LemonSqueezy's own unit, and the only way to apply an arbitrary
 * Discount Drop percentage like 37% to a whole-dollar package price
 * without fractional-cent drift) — always derived from the server-side
 * package config by key and a server-verified discount percent, never
 * from anything a client submits.
 */
export function computeGetListedPricing(packageKey: GetListedPackageKey, discountPercent: number): GetListedPricing {
  const clampedDiscount = Math.max(0, Math.min(100, Math.round(discountPercent)));
  const baseAmountCents = GET_LISTED_PACKAGES[packageKey].priceUsd * 100;
  const discountAmountCents = Math.round((baseAmountCents * clampedDiscount) / 100);
  const finalAmountCents = baseAmountCents - discountAmountCents;
  return { baseAmountCents, discountPercent: clampedDiscount, discountAmountCents, finalAmountCents };
}
