import "server-only";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { ArenaReviewFeed } from "@/lib/arena-review-types";
import type { ReviewCategory } from "@/lib/arena-review-validation";

export const unavailableReviewFeed: ArenaReviewFeed = {
  available: false, reviews: [], total: 0, averageRating: null, hasMore: false,
};
export function arenaReviewsConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export async function getArenaReviews({ page = 0, limit = 12, category }: {
  page?: number; limit?: number; category?: ReviewCategory;
} = {}): Promise<ArenaReviewFeed> {
  if (!arenaReviewsConfigured()) return unavailableReviewFeed;
  try {
    const admin = createAdminSupabaseClient();
    let query = admin.from("arena_reviews")
      .select("id, author_name, avatar_url, profile_image_url, social_platform, social_handle, social_url, product_name, rating, body, category, created_at")
      .order("created_at", { ascending: false }).order("id", { ascending: false });
    if (category) query = query.eq("category", category);
    const [list, stats] = await Promise.all([
      query.range(page * limit, page * limit + limit),
      admin.rpc("arena_review_stats"),
    ]);
    if (list.error || stats.error) return unavailableReviewFeed;
    const summary = stats.data?.[0];
    if (!summary) return unavailableReviewFeed;
    return {
      available: true,
      reviews: (list.data ?? []).slice(0, limit),
      total: Number(summary?.total ?? 0),
      averageRating: summary?.average_rating == null ? null : Number(summary.average_rating),
      hasMore: (list.data?.length ?? 0) > limit,
    };
  } catch { return unavailableReviewFeed; }
}
