export const REVIEW_CATEGORIES = ["Visibility", "Community", "Product Discovery", "Experience"] as const;
export type ReviewCategory = (typeof REVIEW_CATEGORIES)[number];
export const ARENA_REVIEW_MAX = 500;

export function validateArenaReview(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { error: "Invalid review." } as const;
  const record = input as Record<string, unknown>;
  const body = typeof record.body === "string" ? record.body.trim() : "";
  const productName = typeof record.productName === "string" ? record.productName.trim() : "";
  const category = record.category;
  const rating = record.rating;
  if (!Number.isInteger(rating) || typeof rating !== "number" || rating < 1 || rating > 5) {
    return { error: "Choose a rating from 1 to 5 stars." } as const;
  }
  if (Array.from(body).length < 10 || Array.from(body).length > ARENA_REVIEW_MAX) {
    return { error: `Write between 10 and ${ARENA_REVIEW_MAX} characters.` } as const;
  }
  if (productName.length > 80) return { error: "Product name must be 80 characters or fewer." } as const;
  if (!REVIEW_CATEGORIES.includes(category as ReviewCategory)) return { error: "Choose a review category." } as const;
  return { value: { body, rating, product_name: productName || null, category: category as ReviewCategory } } as const;
}

export function safeAvatarUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
