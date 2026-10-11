import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export type ArenaPublicMetrics = {
  domainRating: number | null;
  domainRatingSource: string | null;
  domainRatingSourceUrl: string | null;
  domainRatingCheckedAt: string | null;
  monthlyVisitors: number;
};

export async function getArenaPublicMetrics(admin: SupabaseClient<Database>): Promise<ArenaPublicMetrics> {
  const { data, error } = await admin.rpc("get_arena_public_metrics", {});
  const row = data?.[0];
  if (error || !row) {
    return { domainRating: null, domainRatingSource: null, domainRatingSourceUrl: null, domainRatingCheckedAt: null, monthlyVisitors: 0 };
  }
  return {
    domainRating: row.domain_rating === null ? null : Number(row.domain_rating),
    domainRatingSource: row.domain_rating_source,
    domainRatingSourceUrl: row.domain_rating_source_url,
    domainRatingCheckedAt: row.domain_rating_checked_at,
    monthlyVisitors: Number(row.monthly_visitors ?? 0),
  };
}

