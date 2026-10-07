import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/server";
import { arenaReviewsConfigured, getArenaReviews } from "@/lib/arena-reviews";
import { REVIEW_CATEGORIES, REVIEW_PHOTO_MAX_BYTES, safeAvatarUrl, validateArenaReview, type ReviewCategory } from "@/lib/arena-review-validation";
import { rateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/fingerprint";

export const runtime = "nodejs";
const AVATAR_BUCKET = "arena-review-avatars";

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
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json") && !contentType.includes("multipart/form-data")) {
    return NextResponse.json({ error: "Send a review with JSON or form data." }, { status: 415 });
  }
  if (Number(req.headers.get("content-length")) > REVIEW_PHOTO_MAX_BYTES + 128 * 1024) {
    return NextResponse.json({ error: "Choose a profile photo smaller than 2 MB." }, { status: 413 });
  }
  if (!rateLimit(`arena-review:ip:${getClientIp(req)}`, 10, 60000)) {
    return NextResponse.json({ error: "Too many attempts. Please try again shortly." }, { status: 429 });
  }
  let input: unknown;
  let photo: File | null = null;
  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const payload = form.get("review");
      if (typeof payload !== "string") return NextResponse.json({ error: "Invalid review." }, { status: 400 });
      input = JSON.parse(payload);
      const file = form.get("photo");
      if (file instanceof File && file.size > 0) photo = file;
    } else { input = await req.json(); }
  } catch { return NextResponse.json({ error: "Invalid request body." }, { status: 400 }); }
  if (photo && (photo.size > REVIEW_PHOTO_MAX_BYTES || !["image/jpeg", "image/png", "image/webp"].includes(photo.type))) {
    return NextResponse.json({ error: "Choose a JPG, PNG, or WebP photo smaller than 2 MB." }, { status: 400 });
  }
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
    const admin = createAdminSupabaseClient();
    let photoPath: string | null = null;
    let profileImageUrl: string | null = null;
    if (photo) {
      // Avoid storing an upload for an account that already left a review.
      const existing = await admin.from("arena_reviews").select("id").eq("user_id", user.id).maybeSingle();
      if (existing.error) return NextResponse.json({ error: "Reviews are temporarily unavailable. Please try again later." }, { status: 503 });
      if (existing.data) return NextResponse.json({ error: "Your review is already on the wall. Thank you for sharing your experience." }, { status: 409 });
      let bytes: Buffer;
      try {
        const image = sharp(Buffer.from(await photo.arrayBuffer()), { limitInputPixels: 16_000_000 });
        const metadata = await image.metadata();
        if (!["jpeg", "png", "webp"].includes(metadata.format ?? "")) throw new Error("Unsupported image");
        // Decode, resize, and re-encode instead of publishing arbitrary bytes.
        // This also strips EXIF location and other original-file metadata.
        bytes = await image.rotate().resize(256, 256, { fit: "cover" }).webp({ quality: 85 }).toBuffer();
      } catch { return NextResponse.json({ error: "That photo could not be opened. Choose a valid JPG, PNG, or WebP image up to 16 megapixels." }, { status: 400 }); }
      photoPath = `${user.id}/${randomUUID()}.webp`;
      const uploaded = await admin.storage.from(AVATAR_BUCKET).upload(photoPath, bytes, { contentType: "image/webp", cacheControl: "31536000", upsert: false });
      if (uploaded.error) return NextResponse.json({ error: "Your photo could not be uploaded. Please try again." }, { status: 503 });
      profileImageUrl = admin.storage.from(AVATAR_BUCKET).getPublicUrl(photoPath).data.publicUrl;
    }
    const { error } = await admin.from("arena_reviews").insert({
      ...validated.value, user_id: user.id, profile_image_url: profileImageUrl,
      avatar_url: safeAvatarUrl(user.user_metadata?.avatar_url),
    });
    if (error && photoPath) await admin.storage.from(AVATAR_BUCKET).remove([photoPath]);
    if (error?.code === "23505") return NextResponse.json({ error: "Your review is already on the wall. Thank you for sharing your experience." }, { status: 409 });
    if (error) return NextResponse.json({ error: "Could not save your review. Please try again later." }, { status: 503 });
    return NextResponse.json({ success: true }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Reviews are temporarily unavailable. Please try again later." }, { status: 503 });
  }
}
