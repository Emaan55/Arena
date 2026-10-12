import { NextRequest, NextResponse } from "next/server";
import { createPublicSupabaseClient } from "@/lib/supabase/public";
import type { CampaignResultWithPlatforms } from "@/lib/get-listed/campaign-results";

const MAX_PAGE_SIZE = 12;

export async function GET(req: NextRequest) {
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(req.nextUrl.searchParams.get("limit")) || 6));
  const offset = Math.max(0, Number(req.nextUrl.searchParams.get("offset")) || 0);
  const supabase = createPublicSupabaseClient();

  const { data: results, count, error } = await supabase
    .from("campaign_results")
    .select("*", { count: "exact" })
    .eq("is_published", true)
    .order("updated_at", { ascending: false })
    .order("published_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    // Before migration 0029 is applied, keep the marketing page usable and
    // hide this optional section instead of exposing a database error.
    return NextResponse.json(
      { results: [], hasMore: false, schemaReady: false },
      { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" } },
    );
  }

  const ids = (results ?? []).map((result) => result.id);
  const { data: platforms, error: platformError } = ids.length
    ? await supabase
        .from("campaign_result_platforms")
        .select("*")
        .in("campaign_result_id", ids)
        .order("position", { ascending: true })
        .order("created_at", { ascending: true })
    : { data: [], error: null };

  if (platformError) {
    return NextResponse.json({ error: "Could not load campaign results." }, { status: 500 });
  }

  const rows: CampaignResultWithPlatforms[] = (results ?? []).map((result) => ({
    ...result,
    platforms: (platforms ?? []).filter((entry) => entry.campaign_result_id === result.id),
  }));

  return NextResponse.json(
    { results: rows, hasMore: offset + rows.length < (count ?? rows.length), schemaReady: true },
    { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } },
  );
}
