import type { Match, Product } from "@/types/database";

// Shared with the existing stale-pool sweep; this does not change pairing.
export const WAITING_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export function getWaitingProducts(
  products: readonly Product[],
  matches: readonly Pick<Match, "status" | "product_a_id" | "product_b_id">[],
  now = Date.now(),
): Product[] {
  const matched = new Set(matches.filter((match) => match.status === "active")
    .flatMap((match) => [match.product_a_id, match.product_b_id]));
  return products.filter((product) => {
    const entered = Date.parse(product.pool_entered_at);
    return product.status === "active" && !matched.has(product.id) && Number.isFinite(entered)
      && entered <= now && entered > now - WAITING_WINDOW_MS;
  });
}
