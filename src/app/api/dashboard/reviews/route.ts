import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/server";

const PAGE_SIZE = 20;

export async function GET(req: NextRequest) {
  const auth = await createRouteHandlerSupabaseClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to view product reviews." }, { status: 401 });

  const page = Number(req.nextUrl.searchParams.get("page") ?? 0);
  if (!Number.isInteger(page) || page < 0 || page > 10000) {
    return NextResponse.json({ error: "Invalid page." }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();
  const { data: products, error: productsError } = await admin
    .from("products")
    .select("id,name,logo_url")
    .eq("owner_id", user.id);
  if (productsError) return NextResponse.json({ error: "Could not load your products." }, { status: 500 });

  const productById = new Map((products ?? []).map((product) => [product.id, product]));
  const productIds = Array.from(productById.keys());
  if (productIds.length === 0) {
    return NextResponse.json({ reviews: [], total: 0, page, hasMore: false });
  }

  const { data: rows, count, error } = await admin
    .from("product_reviews")
    .select("id,product_id,user_id,body,created_at", { count: "exact" })
    .in("product_id", productIds)
    .order("created_at", { ascending: false })
    .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
  if (error) return NextResponse.json({ error: "Could not load product reviews." }, { status: 500 });

  const reviewerIds = Array.from(new Set((rows ?? []).map((review) => review.user_id)));
  const reviewerById = new Map<string, string>();
  if (reviewerIds.length > 0) {
    const { data: usersPage } = await admin.auth.admin.listUsers({ perPage: 1000 });
    for (const reviewer of usersPage?.users ?? []) {
      if (!reviewerIds.includes(reviewer.id)) continue;
      const name = reviewer.user_metadata?.full_name || reviewer.user_metadata?.name || reviewer.user_metadata?.preferred_username;
      reviewerById.set(reviewer.id, typeof name === "string" && name.trim() ? name.trim() : "Arena voter");
    }
  }

  const reviews = (rows ?? []).map((review) => ({
    id: review.id,
    body: review.body,
    createdAt: review.created_at,
    reviewerName: reviewerById.get(review.user_id) ?? "Arena voter",
    product: productById.get(review.product_id) ?? null,
  }));
  const total = count ?? reviews.length;
  const response = NextResponse.json({ reviews, total, page, hasMore: total > (page + 1) * PAGE_SIZE });
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}
