import { CATEGORIES, type Category } from "@/types/database";

export function submissionCategory(value: unknown): Category | undefined {
  return typeof value === "string" && (CATEGORIES as readonly string[]).includes(value)
    ? value as Category : undefined;
}

/** Carry category intent only; rivals are still chosen by the existing server pairing. */
export function submissionPath(category?: Category): string {
  return category ? `/submit?${new URLSearchParams({ category })}` : "/submit";
}
