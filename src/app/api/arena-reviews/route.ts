import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/server";
import { arenaReviewsConfigured, getArenaReviews } from "@/lib/arena-reviews";
import { REVIEW_CATEGORIES, safeAvatarUrl, validateArenaReview, type ReviewCategory } from "@/lib/arena-review-validation";
import { rateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/fingerprint";

export async function GET(req: NextRequest) {
  const page = Number(req.nextUrl.searchParams.get("page") ?? 0);
  const limit = Number(req.nextUrl.searchParams.get("limit") ?? 12);
  const category = req.nextUrl.searchParams.get("category");
  if (!Number.isInteger(page) || page < 0 || page > 10000 || !Number.isInteger(limit) || limit < 1 || limit > 24 ||
    (category && !REVIEW_CATEGORIES.includes(category as ReviewCategory))) {
    return NextResponse.json({ error: "Invalid review filters." }, { status: 400 });
  }
  const feed = await getArenaReviews({ page, limit, category: category ? category as ReviewCategory : undefined });
  return NextResponse.json(feed, { status: feed.available ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  // Next may normalize nextUrl to localhost behind a proxy. Match the
  // browser's origin to the actual request Host instead of that internal URL.
  if (origin) {
    try {
      const source = new URL(origin);
      if (!/^https?:$/.test(source.protocol) || source.host !== req.headers.get("host")) {
        return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
      }
    } catch { return NextResponse.json({ error: "Invalid request origin." }, { status: 403 }); }
  }
  if (!req.headers.get("content-type")?.includes("application/json")) {
    return NextResponse.json({ error: "Send a JSON review." }, { status: 415 });
  }
  if (!rateLimit(`arena-review:ip:${getClientIp(req)}`, 10, 60000)) {
    return NextResponse.json({ error: "Too many attempts. Please try again shortly." }, { status: 429 });
  }
  let input: unknown;
  try { input = await req.json(); } catch { return NextResponse.json({ error: "Invalid request body." }, { status: 400 }); }
  const validated = validateArenaReview(input);
  if (validated.error) return NextResponse.json({ error: validated.error }, { status: 400 });
  if (!arenaReviewsConfigured() || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.json({ error: "Reviews are temporarily unavailable. Please try again later." }, { status: 503 });
  }
  try {
    const auth = await createRouteHandlerSupabaseClient();
    const { data: { user }, error: authError } = await auth.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Sign in to add your review." }, { status: 401 });
    if (!rateLimit(`arena-review:user:${user.id}`, 5, 60000)) {
      return NextResponse.json({ error: "Too many attempts. Please try again shortly." }, { status: 429 });
    }
    const name = user.user_metadata?.full_name;
    const displayName = typeof name === "string" && name.trim() ? name.trim().slice(0, 100) : "Arena member";
    const admin = createAdminSupabaseClient();
    const { error } = await admin.from("arena_reviews").insert({
      ...validated.value, user_id: user.id, author_name: displayName,
      avatar_url: safeAvatarUrl(user.user_metadata?.avatar_url),
    });
    if (error?.code === "23505") return NextResponse.json({ error: "Your review is already on the wall. Thank you for sharing your experience." }, { status: 409 });
    if (error) return NextResponse.json({ error: "Could not save your review. Please try again later." }, { status: 503 });
    return NextResponse.json({ success: true }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Reviews are temporarily unavailable. Please try again later." }, { status: 503 });
  }
}
