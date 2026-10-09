import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/server";
import { getProductAnalyticsSummary } from "@/lib/founder-notifications";

export async function GET() {
  const auth = await createRouteHandlerSupabaseClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to view your dashboard." }, { status: 401 });
  const admin = createAdminSupabaseClient();
  const { data: products, error } = await admin.from("products").select("*").eq("owner_id", user.id).order("submitted_at", { ascending: false });
  if (error) return NextResponse.json({ error: "Could not load your products." }, { status: 500 });
  const ids = (products ?? []).map((product) => product.id);
  const firstChartDay = new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10);
  const [matchesA, matchesB, reviews, analytics, dailyAnalytics, claims, campaigns, activity, unread] = await Promise.all([
    ids.length ? admin.from("matches").select("*, product_a:products!matches_product_a_id_fkey(id,name), product_b:products!matches_product_b_id_fkey(id,name)").in("product_a_id", ids).order("created_at", { ascending: false }) : Promise.resolve({ data: [], error: null }),
    ids.length ? admin.from("matches").select("*, product_a:products!matches_product_a_id_fkey(id,name), product_b:products!matches_product_b_id_fkey(id,name)").in("product_b_id", ids).order("created_at", { ascending: false }) : Promise.resolve({ data: [], error: null }),
    ids.length ? admin.from("product_reviews").select("product_id").in("product_id", ids) : Promise.resolve({ data: [], error: null }),
    getProductAnalyticsSummary(admin, ids),
    ids.length ? admin.from("product_analytics_daily").select("product_id,day,page_views,outbound_clicks").in("product_id", ids).gte("day", firstChartDay).order("day", { ascending: true }) : Promise.resolve({ data: [], error: null }),
    admin.from("founder_product_claims").select("product_id,status,created_at").eq("user_id", user.id),
    admin.from("campaigns").select("id,startup_name,status,submission_target,created_at").eq("owner_id", user.id).is("deleted_at", null).order("created_at", { ascending: false }),
    admin.from("founder_notifications").select("id,event_type,title,body,href,read_at,created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(10),
    admin.from("founder_notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).is("read_at", null),
  ]);
  const allMatches = [...(matchesA.data ?? []), ...(matchesB.data ?? [])].filter((m, index, all) => all.findIndex((other) => other.id === m.id) === index);
  const matchIds = allMatches.map((match) => match.id);
  const { data: recentVotes } = matchIds.length
    ? await admin.from("votes").select("match_id,side,created_at").in("match_id", matchIds).gte("created_at", `${firstChartDay}T00:00:00.000Z`).limit(10000)
    : { data: [] };
  const ownedIds = new Set(ids);
  const matchById = new Map(allMatches.map((match) => [match.id, match]));
  const chartDays = new Map<string, { day: string; page_views: number; outbound_clicks: number; votes: number }>();
  for (let offset = 0; offset < 30; offset++) {
    const day = new Date(Date.now() - (29 - offset) * 86_400_000).toISOString().slice(0, 10);
    chartDays.set(day, { day, page_views: 0, outbound_clicks: 0, votes: 0 });
  }
  for (const row of dailyAnalytics.data ?? []) {
    const point = chartDays.get(row.day);
    if (point) {
      point.page_views += Number(row.page_views);
      point.outbound_clicks += Number(row.outbound_clicks);
    }
  }
  for (const vote of recentVotes ?? []) {
    const match = matchById.get(vote.match_id);
    const point = chartDays.get(vote.created_at.slice(0, 10));
    if (!match || !point) continue;
    if ((vote.side === "a" && ownedIds.has(match.product_a_id)) || (vote.side === "b" && ownedIds.has(match.product_b_id))) point.votes++;
  }
  const enriched = (products ?? []).map((product) => {
    const history = allMatches.filter((match) => match.status === "resolved" && (match.product_a_id === product.id || match.product_b_id === product.id));
    const won = history.filter((match) => match.product_a_id === product.id ? match.votes_a > match.votes_b : match.votes_b > match.votes_a).length;
    const active = allMatches.find((match) => match.status === "active" && (match.product_a_id === product.id || match.product_b_id === product.id)) ?? null;
    const votesReceived = allMatches.filter((match) => match.product_a_id === product.id || match.product_b_id === product.id).reduce((sum, match) => sum + (match.product_a_id === product.id ? match.votes_a : match.votes_b), 0);
    const analyticsSummary = analytics[product.id] ?? { product_id: product.id, page_views: 0, unique_page_views: 0, outbound_clicks: 0, unique_outbound_clicks: 0 };
    return { ...product, edit_token_hash: null, currentMatch: active, wins: won, losses: history.length - won, votesReceived, reviews: (reviews.data ?? []).filter((review) => review.product_id === product.id).length, analytics: analyticsSummary, claim: (claims.data ?? []).find((claim) => claim.product_id === product.id) ?? null };
  });
  const founderName = user.user_metadata.full_name || user.user_metadata.name || user.user_metadata.preferred_username || user.email?.split("@")[0] || "Founder";
  return NextResponse.json({
    founder: { name: founderName },
    products: enriched,
    claims: claims.data ?? [],
    campaigns: campaigns.data ?? [],
    activity: activity.data ?? [],
    analyticsHistory: Array.from(chartDays.values()),
    unreadCount: unread.count ?? 0,
  });
}
