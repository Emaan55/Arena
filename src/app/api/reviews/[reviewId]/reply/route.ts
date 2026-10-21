import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/server";
import { getReviewAuthors } from "@/lib/review-authors";
import { resolveReviewAuthor } from "@/lib/reviewer-profile";
import { REVIEW_UUID, validateFounderReply } from "@/lib/founder-reply";
import { getClientIp } from "@/lib/fingerprint";
import { rateLimit } from "@/lib/rate-limit";

type Context = { params: Promise<{ reviewId: string }> };
async function writeReply(req: NextRequest, context: Context) {
  const { reviewId } = await context.params;
  if (!REVIEW_UUID.test(reviewId)) return NextResponse.json({ error: "Invalid review." }, { status: 400 });
  const origin = req.headers.get("origin");
  if (origin) {
    try { const source = new URL(origin); if (!/^https?:$/.test(source.protocol) || source.host !== req.headers.get("host")) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 }); }
    catch { return NextResponse.json({ error: "Invalid request origin." }, { status: 403 }); }
  }
  if (!rateLimit(`founder-reply:ip:${getClientIp(req)}`, 30, 60_000)) return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429 });
  const auth = await createRouteHandlerSupabaseClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user || user.deleted_at) return NextResponse.json({ error: "Sign in to reply." }, { status: 401 });
  if (!rateLimit(`founder-reply:user:${user.id}`, 20, 60_000)) return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429 });

  const admin = createAdminSupabaseClient();
  const { data: review, error: reviewError } = await admin.from("product_reviews").select("id,product_id").eq("id", reviewId).maybeSingle();
  if (reviewError) return NextResponse.json({ error: "Could not load this review." }, { status: 500 });
  if (!review) return NextResponse.json({ error: "Review not found." }, { status: 404 });
  const { data: product } = await admin.from("products").select("owner_id").eq("id", review.product_id).maybeSingle();
  if (!product || product.owner_id !== user.id) return NextResponse.json({ error: "Only the verified owner of this product can reply." }, { status: 403 });

  let body = "";
  if (req.method !== "DELETE") {
    if (Number(req.headers.get("content-length")) > 12000) return NextResponse.json({ error: "Reply is too large." }, { status: 413 });
    let input: unknown;
    try { input = await req.json(); } catch { return NextResponse.json({ error: "Invalid reply." }, { status: 400 }); }
    const validated = validateFounderReply((input as { body?: unknown } | null)?.body);
    if (validated.body === undefined) return NextResponse.json({ error: validated.error }, { status: 400 });
    body = validated.body;
  }

  // Writes use the authenticated client, so RLS independently enforces the same ownership rule.
  const table = auth.from("product_review_replies");
  const query = req.method === "POST"
    ? table.insert({ review_id: reviewId, product_id: review.product_id, author_id: user.id, body })
    : req.method === "PATCH" ? table.update({ body }).eq("review_id", reviewId) : table.delete().eq("review_id", reviewId);
  const { data: reply, error } = await query.select("id,body,created_at,updated_at").maybeSingle();
  if (error) {
    if (["42P01", "PGRST205", "PGRST204"].includes(error.code)) return NextResponse.json({ error: "Founder replies are temporarily unavailable." }, { status: 503 });
    if (error.code === "23505") return NextResponse.json({ error: "This review already has a founder reply. Refresh to edit it." }, { status: 409 });
    if (error.code === "42501") return NextResponse.json({ error: "You cannot change this founder reply." }, { status: 403 });
    return NextResponse.json({ error: "Could not save the reply. Please try again." }, { status: 500 });
  }
  if (!reply) return NextResponse.json({ error: "Reply not found or no longer editable." }, { status: 404 });
  if (req.method === "DELETE") return NextResponse.json({ reply: null });
  const authors = await getReviewAuthors(admin, [user.id], [user]);
  return NextResponse.json({ reply: { id: reply.id, body: reply.body, createdAt: reply.created_at, updatedAt: reply.updated_at,
    ...(authors.get(user.id) ?? resolveReviewAuthor(user)), canManage: true } }, { status: req.method === "POST" ? 201 : 200 });
}
export const POST = writeReply;
export const PATCH = writeReply;
export const DELETE = writeReply;
