import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getArenaState } from "@/lib/arena-state";
import { ArenaApp } from "@/components/ArenaApp";
import { getArenaReviews } from "@/lib/arena-reviews";
import { ReviewsTeaser } from "@/components/reviews/ReviewsTeaser";

export const dynamic = "force-dynamic";

export default async function Home() {
  const admin = createAdminSupabaseClient();
  const [state, reviews] = await Promise.all([getArenaState(admin), getArenaReviews({ limit: 3 })]);
  return <><ArenaApp initialState={state} /><ReviewsTeaser initialFeed={reviews} /></>;
}
