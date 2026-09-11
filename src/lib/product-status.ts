import type { ProductStatus } from "@/types/database";

// Single source of truth for how a product's status reads/looks anywhere
// it's shown (product page, search results, cards) — keeps the states from
// ever being visually confused with each other.
export const STATUS_LABEL: Record<ProductStatus, string> = {
  active: "Active",
  eliminated: "Eliminated",
  champion: "Champion",
  unique: "Unique Product",
};

export const STATUS_CLASS: Record<ProductStatus, string> = {
  active: "bg-accent-soft/20 text-accent",
  eliminated: "bg-danger/10 text-danger",
  champion: "bg-accent text-accent-ink",
  unique: "bg-surface-2 text-muted",
};
