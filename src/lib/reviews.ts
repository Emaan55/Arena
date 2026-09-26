import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type AdminClient = SupabaseClient<Database>;

export const REVIEW_BODY_MAX = 500;

// Same schema-readiness pattern as isDirectoryLibraryReady/isAdminAuditSchemaReady
// elsewhere — migration 0021 may not be applied yet on a given environment,
// so every route touching product_reviews checks this first and degrades
// (zero counts / empty list / 503 on write) instead of a raw DB error.
export async function isProductReviewsReady(admin: AdminClient): Promise<boolean> {
  const { error } = await admin.from("product_reviews").select("id").limit(1);
  return !error;
}
