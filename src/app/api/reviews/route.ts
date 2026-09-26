import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/server";
import { getClientIp } from "@/lib/fingerprint";
import { rateLimit } from "@/lib/rate-limit";
import { logSecurityEvent } from "@/lib/security-log";
import { isProductReviewsReady, REVIEW_BODY_MAX } from "@/lib/reviews";

const MAX_BATCH_IDS = 100;
const REVIEW_LIST_LIMIT = 50;

/**
 * Public, no auth required — this is what renders "N reviews" on a product
 * and, on click, the list itself. Two shapes depending on the query:
 *
 *   ?productIds=a,b,c  -> { counts: { [productId]: number } }
 *     Batch, count-only. Used once per duel-list render so showing a
 *     review count on every card never costs one request per card.
 *
 *   ?productId=x       -> { count: number, reviews: [...] }
 *     Single product, count + the actual list (capped), fetched lazily
 *     only when a viewer actually expands a product's reviews.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const productIdsParam = url.searchParams.get("productIds");
  const productId = url.searchParams.get("productId");

  const admin = createAdminSupabaseClient();
  const ready = await isProductReviewsReady(admin);

  if (productIdsParam) {
    const ids = Array.from(new Set(productIdsParam.split(",").map((s) => s.trim()).filter(Boolean))).slice(
      0,
      MAX_BATCH_IDS,
    );
    const counts: Record<string, number> = {};
    for (const id of ids) counts[id] = 0;
    if (ready && ids.length > 0) {
      const { data } = await admin.from("product_reviews").select("product_id").in("product_id", ids);
      for (const row of data ?? []) counts[row.product_id] = (counts[row.product_id] ?? 0) + 1;
    }
    return NextResponse.json({ counts });
  }

  if (productId) {
    if (!ready) return NextResponse.json({ count: 0, reviews: [] });

    const { data, count } = await admin
      .from("product_reviews")
      .select("id, body, created_at, user_id", { count: "exact" })
      .eq("product_id", productId)
      .order("created_at", { ascending: false })
      .limit(REVIEW_LIST_LIMIT);

    const rows = data ?? [];
    const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
    const nameById = new Map<string, string>();
    if (userIds.length > 0) {
      // Same "look up display names via listUsers" pattern as the discount
      // drop leaderboard (src/app/api/get-listed/discount-drop/leaderboard/route.ts)
      // — this app has no separate public-profile table.
      const { data: usersPage } = await admin.auth.admin.listUsers({ perPage: 1000 });
      for (const u of usersPage?.users ?? []) {
        if (userIds.includes(u.id)) {
          const fullName = u.user_metadata?.full_name;
          nameById.set(u.id, typeof fullName === "string" && fullName.trim() ? fullName.trim() : "Voter");
        }
      }
    }

    const reviews = rows.map((r) => ({
      id: r.id,
      body: r.body,
      authorName: nameById.get(r.user_id) ?? "Voter",
      createdAt: r.created_at,
    }));

    return NextResponse.json({ count: count ?? reviews.length, reviews });
  }

  return NextResponse.json({ error: "productId or productIds is required." }, { status: 400 });
}

/**
 * Submitting a review is only ever offered right after casting a vote, and
 * this route re-verifies that server-side rather than trusting the client:
 * the caller must have an actual `votes` row for this match, and the
 * product being reviewed must be the exact side they voted for — never the
 * opponent's product, and never a product they didn't vote on at all.
 */
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (!rateLimit(`review:ip:${ip}`, 20, 60 * 1000)) {
    logSecurityEvent("rate_limited_ip", { ip });
    return NextResponse.json({ error: "Slow down, too many reviews." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const record = (body ?? {}) as Record<string, unknown>;
  const matchId = typeof record.matchId === "string" ? record.matchId : "";
  const productId = typeof record.productId === "string" ? record.productId : "";
  const reviewBody = typeof record.body === "string" ? record.body.trim() : "";

  if (!matchId || !productId) {
    return NextResponse.json({ error: "Invalid review." }, { status: 400 });
  }
  if (!reviewBody || reviewBody.length > REVIEW_BODY_MAX) {
    return NextResponse.json({ error: `Review must be between 1 and ${REVIEW_BODY_MAX} characters.` }, { status: 400 });
  }

  const supabaseAuth = await createRouteHandlerSupabaseClient();
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to leave a review." }, { status: 401 });
  }

  if (!rateLimit(`review:user:${user.id}`, 20, 60 * 1000)) {
    logSecurityEvent("rate_limited_user", { ip, matchId });
    return NextResponse.json({ error: "Slow down, too many reviews." }, { status: 429 });
  }

  const admin = createAdminSupabaseClient();
  const ready = await isProductReviewsReady(admin);
  if (!ready) {
    return NextResponse.json({ error: "Reviews aren't set up yet." }, { status: 503 });
  }

  const { data: match } = await admin
    .from("matches")
    .select("product_a_id, product_b_id")
    .eq("id", matchId)
    .maybeSingle();
  if (!match) {
    return NextResponse.json({ error: "Duel not found." }, { status: 404 });
  }

  const { data: vote } = await admin
    .from("votes")
    .select("side")
    .eq("match_id", matchId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!vote) {
    return NextResponse.json({ error: "You can only review a product you voted for." }, { status: 403 });
  }
  const votedProductId = vote.side === "a" ? match.product_a_id : match.product_b_id;
  if (votedProductId !== productId) {
    return NextResponse.json({ error: "You can only review the product you voted for." }, { status: 403 });
  }

  const { data: review, error } = await admin
    .from("product_reviews")
    .insert({ match_id: matchId, product_id: productId, user_id: user.id, body: reviewBody })
    .select("id, body, created_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "You already reviewed this vote." }, { status: 409 });
    }
    return NextResponse.json({ error: "Could not save your review." }, { status: 500 });
  }

  logSecurityEvent("review_success", { ip, matchId, userId: user.id, productId });

  return NextResponse.json({ review }, { status: 201 });
}
