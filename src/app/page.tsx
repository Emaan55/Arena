import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getArenaState } from "@/lib/arena-state";
import { ArenaApp } from "@/components/ArenaApp";
import { getArenaReviews } from "@/lib/arena-reviews";
import { ReviewsTeaser } from "@/components/reviews/ReviewsTeaser";
import { getArenaPublicMetrics } from "@/lib/site-metrics";

export const dynamic = "force-dynamic";

export default async function Home() {
  const admin = createAdminSupabaseClient();
  const [state, reviews, publicMetrics] = await Promise.all([getArenaState(admin), getArenaReviews({ limit: 3 }), getArenaPublicMetrics(admin)]);
  return <><ArenaApp initialState={state} publicMetrics={publicMetrics} /><ReviewsTeaser initialFeed={reviews} /></>;
}
