import type { ReviewCategory, ReviewSocialPlatform } from "./arena-review-validation";

export type ArenaReviewRow = {
  id: string;
  user_id: string;
  author_name: string;
  avatar_url: string | null;
  profile_image_url: string | null;
  social_platform: ReviewSocialPlatform | null;
  social_handle: string | null;
  social_url: string | null;
  product_name: string | null;
  rating: number;
  body: string;
  category: ReviewCategory;
  created_at: string;
};
export type PublicArenaReview = Omit<ArenaReviewRow, "user_id">;
export type ArenaReviewFeed = {
  available: boolean;
  reviews: PublicArenaReview[];
  total: number;
  averageRating: number | null;
  hasMore: boolean;
};
